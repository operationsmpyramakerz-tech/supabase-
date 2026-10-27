import "server-only";

import { performance } from "node:perf_hooks";
import { after } from "next/server";

const STORE_SYMBOL = Symbol.for("operations-hub.next.performance-profiler.v1");
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const MAX_WINDOW_MS = 60 * 60 * 1000;
const MAX_SAMPLES = 2500;
const MAX_META_KEYS = 10;
const MAX_TEXT = 120;
const PERSIST_STORE_SYMBOL = Symbol.for("operations-hub.next.performance-profiler.persist.v1");
const PERSIST_TABLE = "erp_performance_samples";
const PERSIST_DISABLE_MS = 5 * 60 * 1000;
const PERSIST_DEFAULT_TIMEOUT_MS = 800;

function persistentTelemetryState() {
  if (!globalThis[PERSIST_STORE_SYMBOL]) {
    globalThis[PERSIST_STORE_SYMBOL] = {
      disabledUntil: 0,
      warnedAt: 0,
    };
  }
  return globalThis[PERSIST_STORE_SYMBOL];
}

function cleanSupabaseBaseUrl(raw) {
  return String(raw || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1\/?$/i, "");
}

function persistentTelemetryConfig() {
  const mode = String(process.env.PERF_PERSIST_TELEMETRY ?? "auto").trim().toLowerCase();
  if (["0", "false", "off", "disabled", "no"].includes(mode)) return { enabled: false };
  if (mode === "auto" && String(process.env.NODE_ENV || "").toLowerCase() !== "production") return { enabled: false };

  const url = cleanSupabaseBaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  // Persistent telemetry is server-only and intentionally requires a privileged
  // key. Never write diagnostic rows with a browser/anon credential.
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "",
  ).trim();

  return {
    enabled: /^https:\/\//i.test(url) && !!key,
    url,
    key,
    timeoutMs: Math.max(250, Math.min(3000, finiteNumber(process.env.PERF_PERSIST_WRITE_TIMEOUT_MS, PERSIST_DEFAULT_TIMEOUT_MS) || PERSIST_DEFAULT_TIMEOUT_MS)),
  };
}

function shouldPersistSample(sample = {}) {
  const category = shortText(sample?.category || "").toLowerCase();
  const name = shortText(sample?.name || "").toLowerCase();
  if (!category || !name) return false;
  if (/^(performance\.|db-acceleration\.|production-verification\.)/.test(name)) return false;

  // Critical user-facing timings are always retained. Successful RPC fast-path
  // samples and exceptional/slow samples are retained too, which is enough for
  // cross-instance P95/fallback analysis without logging every small DB read.
  if (category === "route" || category === "page-data") return true;
  if (category === "supabase" && /(^|[.\-_])rpc($|[.\-_])|candidates-rpc/.test(name)) return true;
  if (sample?.ok === false || sample?.durationMs >= slowThresholdMs()) return true;
  if (isFallbackSample(sample) || isRetrySample(sample)) return true;
  return false;
}

async function persistPerformanceSample(sample) {
  const config = persistentTelemetryConfig();
  if (!config.enabled) return;

  const state = persistentTelemetryState();
  const now = Date.now();
  if (state.disabledUntil > now) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.url}/rest/v1/${PERSIST_TABLE}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        created_at: new Date(sample.at || now).toISOString(),
        category: sample.category,
        name: sample.name,
        duration_ms: sample.durationMs,
        ok: sample.ok !== false,
        status: sample.status || 0,
        meta: sample.meta || {},
      }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      const missingStorage = response.status === 404 || /erp_performance_samples|pgrst205|relation .* does not exist/i.test(raw);
      if (missingStorage || response.status === 401 || response.status === 403) {
        state.disabledUntil = Date.now() + PERSIST_DISABLE_MS;
      }
      if (Date.now() - state.warnedAt > PERSIST_DISABLE_MS) {
        state.warnedAt = Date.now();
        console.warn(`[perf][persistent] telemetry write unavailable status=${response.status}`);
      }
    }
  } catch (error) {
    // Telemetry must never change product behavior or make a request fail.
    state.disabledUntil = Date.now() + Math.min(PERSIST_DISABLE_MS, 60_000);
    if (Date.now() - state.warnedAt > PERSIST_DISABLE_MS) {
      state.warnedAt = Date.now();
      console.warn(`[perf][persistent] telemetry write failed: ${shortText(error?.message || error?.name || "unknown")}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function schedulePersistentSample(sample) {
  if (!shouldPersistSample(sample)) return;
  if (!persistentTelemetryConfig().enabled) return;
  try {
    after(async () => {
      await persistPerformanceSample(sample);
    });
  } catch {
    // Some non-request code paths (tests/build-time utilities) have no Next.js
    // request context. In that case keep only the in-memory profiler sample.
  }
}

function profilerStore() {
  if (!globalThis[STORE_SYMBOL]) {
    globalThis[STORE_SYMBOL] = {
      samples: [],
      startedAt: Date.now(),
    };
  }
  return globalThis[STORE_SYMBOL];
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function shortText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function safeMeta(meta = {}) {
  const source = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  const out = {};
  for (const [key, value] of Object.entries(source).slice(0, MAX_META_KEYS)) {
    const safeKey = shortText(key).slice(0, 48);
    if (!safeKey) continue;
    if (typeof value === "number") out[safeKey] = finiteNumber(value);
    else if (typeof value === "boolean") out[safeKey] = value;
    else if (value === null || typeof value === "undefined") continue;
    else out[safeKey] = shortText(value);
  }
  return out;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function rounded(value) {
  return Math.round(finiteNumber(value) * 10) / 10;
}

function trimStore(store, now = Date.now()) {
  const cutoff = now - MAX_WINDOW_MS;
  if (store.samples.length > MAX_SAMPLES || (store.samples[0]?.at || 0) < cutoff) {
    store.samples = store.samples.filter((sample) => sample.at >= cutoff).slice(-MAX_SAMPLES);
  }
}

function slowThresholdMs() {
  return Math.max(250, Math.min(30_000, finiteNumber(process.env.PERF_SLOW_OPERATION_MS, 900) || 900));
}

function metaText(meta = {}) {
  const source = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  return Object.entries(source)
    .slice(0, MAX_META_KEYS)
    .map(([key, value]) => `${shortText(key)} ${shortText(value)}`)
    .join(" ")
    .toLowerCase();
}

function isFallbackSample(sample = {}) {
  const source = shortText(sample?.meta?.source || "");
  const outcome = shortText(sample?.meta?.outcome || "");
  const recovery = shortText(sample?.meta?.recovery || "");
  const haystack = `${sample?.category || ""} ${sample?.name || ""} ${source} ${outcome} ${recovery} ${metaText(sample?.meta)}`.toLowerCase();
  return /legacy|fallback|recovery/.test(haystack);
}

function isCacheHitSample(sample = {}) {
  return shortText(sample?.meta?.cache || "").toLowerCase() === "hit";
}

function isSharedWaitSample(sample = {}) {
  const cache = shortText(sample?.meta?.cache || "").toLowerCase();
  return cache === "inflight" || cache === "shared";
}

function isRetrySample(sample = {}) {
  return finiteNumber(sample?.meta?.attempts, 1) > 1;
}

function isAbortedSample(sample = {}) {
  return sample?.meta?.aborted === true || Number(sample?.status) === 499;
}

function isExpectedDenialSample(sample = {}) {
  return sample?.meta?.expectedDenial === true || [401, 403].includes(Number(sample?.status));
}

export function recordPerformanceSample({ category, name, durationMs, ok = true, status = 0, meta = {} } = {}) {
  const duration = Math.max(0, finiteNumber(durationMs));
  const safeCategory = shortText(category || "other") || "other";
  const safeName = shortText(name || "operation") || "operation";
  const sample = {
    at: Date.now(),
    category: safeCategory,
    name: safeName,
    durationMs: rounded(duration),
    ok: ok !== false,
    status: Math.max(0, Math.round(finiteNumber(status))),
    meta: safeMeta(meta),
  };

  const store = profilerStore();
  store.samples.push(sample);
  trimStore(store, sample.at);
  schedulePersistentSample(sample);

  if (duration >= slowThresholdMs()) {
    const statusLabel = sample.status ? ` status=${sample.status}` : "";
    console.warn(`[perf][slow] ${sample.category}:${sample.name} ${sample.durationMs}ms${statusLabel}`, sample.meta);
  }

  return sample;
}

export async function measurePerformance(category, name, callback, meta = {}) {
  const started = performance.now();
  let status = 0;
  try {
    const value = await callback();
    status = finiteNumber(value?.status, 200) || 200;
    const expectedRouteDenial = category === "route" && [401, 403].includes(status);
    recordPerformanceSample({
      category,
      name,
      durationMs: performance.now() - started,
      // Permission denials are valid route outcomes rather than server errors.
      ok: expectedRouteDenial || value?.ok !== false,
      status,
      meta: expectedRouteDenial ? { ...meta, expectedDenial: true } : meta,
    });
    return value;
  } catch (error) {
    const aborted = error?.name === "AbortError" || error?.code === "REQUEST_ABORTED";
    status = aborted ? 499 : (finiteNumber(error?.status, 500) || 500);
    recordPerformanceSample({
      category,
      name,
      durationMs: performance.now() - started,
      // A client-side navigation/cancel is not a server failure. Keep the
      // sample for tail-latency visibility, but classify it separately.
      ok: aborted ? true : false,
      status,
      meta: { ...meta, code: error?.code || "", aborted },
    });
    throw error;
  }
}

export function summarizePerformanceSamples(rawSamples = [], {
  windowMs = DEFAULT_WINDOW_MS,
  limit = 25,
  now = Date.now(),
  source = "external",
  startedAt = null,
} = {}) {
  const effectiveWindow = Math.max(30_000, Math.min(MAX_WINDOW_MS, finiteNumber(windowMs, DEFAULT_WINDOW_MS) || DEFAULT_WINDOW_MS));
  const maxRows = Math.max(5, Math.min(100, Math.round(finiteNumber(limit, 25) || 25)));
  const cutoff = now - effectiveWindow;
  const samples = (Array.isArray(rawSamples) ? rawSamples : [])
    .filter((sample) => finiteNumber(sample?.at, 0) >= cutoff)
    .map((sample) => ({
      at: finiteNumber(sample?.at, now),
      category: shortText(sample?.category || "other") || "other",
      name: shortText(sample?.name || "operation") || "operation",
      durationMs: Math.max(0, rounded(sample?.durationMs)),
      ok: sample?.ok !== false,
      status: Math.max(0, Math.round(finiteNumber(sample?.status))),
      meta: safeMeta(sample?.meta || {}),
    }));
  const grouped = new Map();

  for (const sample of samples) {
    const key = `${sample.category}\u0000${sample.name}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(sample);
  }

  const thresholdMs = slowThresholdMs();
  const operations = Array.from(grouped.values()).map((rows) => {
    const durations = rows.map((row) => row.durationMs);
    const total = durations.reduce((sum, value) => sum + value, 0);
    const failures = rows.filter((row) => !row.ok).length;
    const slowCount = rows.filter((row) => row.durationMs >= thresholdMs).length;
    const sourceBreakdown = {};
    let fallbackCount = 0;
    let retryCount = 0;
    let cacheHitCount = 0;
    let sharedWaitCount = 0;
    let abortedCount = 0;
    let expectedDenialCount = 0;
    const workDurations = [];
    for (const row of rows) {
      const rowSource = shortText(row?.meta?.source || "");
      const cacheHit = isCacheHitSample(row);
      const aborted = isAbortedSample(row);
      const expectedDenial = isExpectedDenialSample(row);
      if (rowSource) sourceBreakdown[rowSource] = (sourceBreakdown[rowSource] || 0) + 1;
      if (isFallbackSample(row)) fallbackCount += 1;
      if (isRetrySample(row)) retryCount += 1;
      if (cacheHit) cacheHitCount += 1;
      if (!cacheHit && !aborted && !expectedDenial) workDurations.push(row.durationMs);
      if (isSharedWaitSample(row)) sharedWaitCount += 1;
      if (aborted) abortedCount += 1;
      if (expectedDenial) expectedDenialCount += 1;
    }
    const latest = rows[rows.length - 1];
    return {
      category: latest.category,
      name: latest.name,
      count: rows.length,
      failures,
      failureRate: rounded((failures / Math.max(1, rows.length)) * 100),
      slowCount,
      slowRate: rounded((slowCount / Math.max(1, rows.length)) * 100),
      fallbackCount,
      fallbackRate: rounded((fallbackCount / Math.max(1, rows.length)) * 100),
      retryCount,
      retryRate: rounded((retryCount / Math.max(1, rows.length)) * 100),
      cacheHitCount,
      cacheHitRate: rounded((cacheHitCount / Math.max(1, rows.length)) * 100),
      sharedWaitCount,
      sharedWaitRate: rounded((sharedWaitCount / Math.max(1, rows.length)) * 100),
      abortedCount,
      abortedRate: rounded((abortedCount / Math.max(1, rows.length)) * 100),
      expectedDenialCount,
      expectedDenialRate: rounded((expectedDenialCount / Math.max(1, rows.length)) * 100),
      workCount: workDurations.length,
      sourceBreakdown,
      avgMs: rounded(total / Math.max(1, rows.length)),
      p50Ms: rounded(percentile(durations, 0.5)),
      p95Ms: rounded(percentile(durations, 0.95)),
      maxMs: rounded(Math.max(...durations)),
      workP50Ms: rounded(percentile(workDurations, 0.5)),
      workP95Ms: rounded(percentile(workDurations, 0.95)),
      workMaxMs: rounded(workDurations.length ? Math.max(...workDurations) : 0),
      lastAt: latest.at,
      lastMeta: latest.meta,
    };
  }).sort((a, b) => (b.p95Ms - a.p95Ms) || (b.avgMs - a.avgMs) || (b.count - a.count));

  const tailOperations = [...operations]
    .filter((row) => row.workCount > 0)
    .sort((a, b) => (b.workP95Ms - a.workP95Ms) || (b.workMaxMs - a.workMaxMs) || (b.p95Ms - a.p95Ms));

  const slowest = [...samples]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, maxRows);

  const categories = {};
  for (const sample of samples) {
    if (!categories[sample.category]) categories[sample.category] = { count: 0, failures: 0, totalMs: 0 };
    categories[sample.category].count += 1;
    categories[sample.category].failures += sample.ok ? 0 : 1;
    categories[sample.category].totalMs += sample.durationMs;
  }
  for (const value of Object.values(categories)) {
    value.avgMs = rounded(value.totalMs / Math.max(1, value.count));
    value.totalMs = rounded(value.totalMs);
  }

  const health = {
    slowThresholdMs: thresholdMs,
    slowSamples: samples.filter((sample) => sample.durationMs >= thresholdMs).length,
    failedSamples: samples.filter((sample) => !sample.ok).length,
    fallbackSamples: samples.filter(isFallbackSample).length,
    retriedSamples: samples.filter(isRetrySample).length,
    cacheHitSamples: samples.filter(isCacheHitSample).length,
    sharedWaitSamples: samples.filter(isSharedWaitSample).length,
    abortedSamples: samples.filter(isAbortedSample).length,
    expectedDenialSamples: samples.filter(isExpectedDenialSample).length,
  };

  return {
    source,
    generatedAt: now,
    processStartedAt: startedAt,
    windowMs: effectiveWindow,
    sampleCount: samples.length,
    operationCount: operations.length,
    health,
    categories,
    operations: operations.slice(0, maxRows),
    tailOperations: tailOperations.slice(0, maxRows),
    slowest,
    notes: source === "process-local"
      ? [
        "Metrics are process-local and intentionally contain no query values, cookies, user IDs, or request bodies.",
        "On serverless deployments each warm instance keeps its own rolling window, so this is a diagnostic sample rather than a global APM report.",
        "tailOperations excludes cache-hit, client-aborted, and expected permission-denial samples so cold/miss/shared-wait latency reflects completed backend work.",
        "Client-aborted requests are recorded with status 499 and reported separately so navigation cancellations do not inflate production P95 or server failure rates.",
        "Expected 401/403 route denials remain visible in diagnostics but are excluded from work P95 and readiness sampling.",
      ]
      : [
        "Metrics are aggregated from persisted server telemetry and intentionally contain no query values, cookies, user IDs, or request bodies.",
        "Critical route/page-data timings, RPC fast-path samples, fallbacks, retries, failures, and slow outliers are retained; ordinary low-cost DB reads are intentionally not persisted.",
        "tailOperations excludes cache-hit, client-aborted, and expected permission-denial samples so work P95 reflects completed backend work.",
      ],
  };
}

export function getPerformanceSnapshot({ windowMs = DEFAULT_WINDOW_MS, limit = 25 } = {}) {
  const now = Date.now();
  const store = profilerStore();
  trimStore(store, now);
  return summarizePerformanceSamples(store.samples, {
    windowMs,
    limit,
    now,
    source: "process-local",
    startedAt: store.startedAt,
  });
}

export function clearPerformanceSamples() {
  const store = profilerStore();
  const removed = store.samples.length;
  store.samples = [];
  store.startedAt = Date.now();
  return removed;
}

export const __performanceProfilerTest = {
  percentile,
  safeMeta,
};

import "server-only";

import { performance } from "node:perf_hooks";

const STORE_SYMBOL = Symbol.for("operations-hub.next.performance-profiler.v1");
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const MAX_WINDOW_MS = 60 * 60 * 1000;
const MAX_SAMPLES = 2500;
const MAX_META_KEYS = 10;
const MAX_TEXT = 120;

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
    recordPerformanceSample({
      category,
      name,
      durationMs: performance.now() - started,
      ok: value?.ok !== false,
      status,
      meta,
    });
    return value;
  } catch (error) {
    status = finiteNumber(error?.status, 500) || 500;
    recordPerformanceSample({
      category,
      name,
      durationMs: performance.now() - started,
      ok: false,
      status,
      meta: { ...meta, code: error?.code || "" },
    });
    throw error;
  }
}

export function getPerformanceSnapshot({ windowMs = DEFAULT_WINDOW_MS, limit = 25 } = {}) {
  const now = Date.now();
  const effectiveWindow = Math.max(30_000, Math.min(MAX_WINDOW_MS, finiteNumber(windowMs, DEFAULT_WINDOW_MS) || DEFAULT_WINDOW_MS));
  const maxRows = Math.max(5, Math.min(100, Math.round(finiteNumber(limit, 25) || 25)));
  const store = profilerStore();
  trimStore(store, now);

  const cutoff = now - effectiveWindow;
  const samples = store.samples.filter((sample) => sample.at >= cutoff);
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
    for (const row of rows) {
      const source = shortText(row?.meta?.source || "");
      if (source) sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
      const fallbackText = `${row.category} ${row.name} ${source}`.toLowerCase();
      if (/legacy|fallback|recovery/.test(fallbackText)) fallbackCount += 1;
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
      sourceBreakdown,
      avgMs: rounded(total / Math.max(1, rows.length)),
      p50Ms: rounded(percentile(durations, 0.5)),
      p95Ms: rounded(percentile(durations, 0.95)),
      maxMs: rounded(Math.max(...durations)),
      lastAt: latest.at,
      lastMeta: latest.meta,
    };
  }).sort((a, b) => (b.p95Ms - a.p95Ms) || (b.avgMs - a.avgMs) || (b.count - a.count));

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
    fallbackSamples: samples.filter((sample) => {
      const source = shortText(sample?.meta?.source || "");
      return /legacy|fallback|recovery/.test(`${sample.category} ${sample.name} ${source}`.toLowerCase());
    }).length,
  };

  return {
    generatedAt: now,
    processStartedAt: store.startedAt,
    windowMs: effectiveWindow,
    sampleCount: samples.length,
    operationCount: operations.length,
    health,
    categories,
    operations: operations.slice(0, maxRows),
    slowest,
    notes: [
      "Metrics are process-local and intentionally contain no query values, cookies, user IDs, or request bodies.",
      "On serverless deployments each warm instance keeps its own rolling window, so this is a diagnostic sample rather than a global APM report.",
    ],
  };
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

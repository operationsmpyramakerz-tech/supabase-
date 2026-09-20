import "server-only";

import { rpc } from "./supabase-rest";

const DEFAULT_TARGET_P95_MS = 1800;
const DEFAULT_WARNING_P95_MS = 3000;
const DEFAULT_MIN_SAMPLES = 5;
const DEFAULT_MAX_FAILURE_RATE = 2;
const DEFAULT_MAX_FALLBACK_RATE = 5;
const DEFAULT_MAX_RETRY_RATE = 10;

const CRITICAL_OPERATIONS = [
  { id: "home", label: "Home overview", category: "page-data", name: "home.overview" },
  { id: "current-orders-initial", label: "Current Orders initial page", category: "page-data", name: "orders.current.initial" },
  { id: "operations-orders-initial", label: "Operations Orders initial page", category: "page-data", name: "orders.operations.initial" },
  { id: "orders-review-initial", label: "Orders Review initial page", category: "page-data", name: "orders.review.initial" },
  { id: "maintenance-orders-initial", label: "Maintenance Orders initial page", category: "page-data", name: "orders.maintenance.initial" },
  { id: "current-orders-pagination", label: "Current Orders pagination/filter", category: "route", name: "orders.current.summary" },
  { id: "operations-orders-pagination", label: "Operations Orders pagination/filter", category: "route", name: "orders.operations.summary" },
  { id: "orders-review-pagination", label: "Orders Review pagination/filter", category: "route", name: "orders.review.summary" },
  { id: "maintenance-orders-pagination", label: "Maintenance Orders pagination/filter", category: "route", name: "orders.maintenance.summary" },
  { id: "users-center", label: "Users Center directory", category: "route", name: "users-center.directory" },
  { id: "expenses", label: "Expenses", category: "route", name: "expenses.list" },
  { id: "events", label: "Events", category: "route", name: "events.list" },
  { id: "task-management", label: "Task Management", category: "route", name: "task-management.list" },
  { id: "products", label: "Products catalog", category: "route", name: "products.catalog" },
];

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedNumber(value, fallback, min, max) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function shortText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function envThresholds(overrides = {}) {
  const targetP95Ms = boundedNumber(
    overrides.targetP95Ms ?? process.env.PERF_PRODUCTION_P95_TARGET_MS,
    DEFAULT_TARGET_P95_MS,
    250,
    30_000,
  );
  const warningP95Ms = Math.max(targetP95Ms, boundedNumber(
    overrides.warningP95Ms ?? process.env.PERF_PRODUCTION_P95_WARNING_MS,
    DEFAULT_WARNING_P95_MS,
    targetP95Ms,
    60_000,
  ));
  return {
    targetP95Ms,
    warningP95Ms,
    minSamples: Math.round(boundedNumber(
      overrides.minSamples ?? process.env.PERF_PRODUCTION_MIN_SAMPLES,
      DEFAULT_MIN_SAMPLES,
      1,
      100,
    )),
    maxFailureRate: boundedNumber(
      overrides.maxFailureRate ?? process.env.PERF_PRODUCTION_MAX_FAILURE_RATE,
      DEFAULT_MAX_FAILURE_RATE,
      0,
      100,
    ),
    maxFallbackRate: boundedNumber(
      overrides.maxFallbackRate ?? process.env.PERF_PRODUCTION_MAX_FALLBACK_RATE,
      DEFAULT_MAX_FALLBACK_RATE,
      0,
      100,
    ),
    maxRetryRate: boundedNumber(
      overrides.maxRetryRate ?? process.env.PERF_PRODUCTION_MAX_RETRY_RATE,
      DEFAULT_MAX_RETRY_RATE,
      0,
      100,
    ),
  };
}

function operationMap(profile = {}) {
  const map = new Map();
  const rows = [
    ...(Array.isArray(profile?.operations) ? profile.operations : []),
    ...(Array.isArray(profile?.tailOperations) ? profile.tailOperations : []),
  ];
  for (const row of rows) {
    const category = String(row?.category || "").trim();
    const name = String(row?.name || "").trim();
    if (!category || !name) continue;
    map.set(`${category}\u0000${name}`, row);
  }
  return map;
}

function evaluateCriticalOperation(spec, row, thresholds) {
  if (!row) {
    return {
      ...spec,
      state: "no-samples",
      count: 0,
      note: "No samples in the selected profiler window yet.",
    };
  }

  const count = Number(row.count) || 0;
  const workCount = Number.isFinite(Number(row.workCount)) ? Number(row.workCount) : count;
  const p95Ms = Number(row.p95Ms) || 0;
  const workP95Ms = Number(row.workP95Ms) || p95Ms;
  const failureRate = Number(row.failureRate) || 0;
  const fallbackRate = Number(row.fallbackRate) || 0;
  const retryRate = Number(row.retryRate) || 0;
  const abortedRate = Number(row.abortedRate) || 0;

  let state = "healthy";
  const reasons = [];

  if (workCount < thresholds.minSamples) {
    state = "collecting";
    reasons.push(`needs ${thresholds.minSamples} completed-work samples`);
  } else {
    if (failureRate > thresholds.maxFailureRate) {
      state = "needs-attention";
      reasons.push(`failure rate ${failureRate}%`);
    }
    if (fallbackRate > thresholds.maxFallbackRate) {
      state = "needs-attention";
      reasons.push(`fallback rate ${fallbackRate}%`);
    }
    if (workP95Ms > thresholds.warningP95Ms) {
      state = "needs-attention";
      reasons.push(`work P95 ${workP95Ms}ms`);
    } else if (state !== "needs-attention" && workP95Ms > thresholds.targetP95Ms) {
      state = "watch";
      reasons.push(`work P95 ${workP95Ms}ms`);
    }
    if (retryRate > thresholds.maxRetryRate && state === "healthy") {
      state = "watch";
      reasons.push(`retry rate ${retryRate}%`);
    }
  }

  return {
    ...spec,
    state,
    count,
    workCount,
    p50Ms: Number(row.p50Ms) || 0,
    p95Ms,
    workP95Ms,
    maxMs: Number(row.maxMs) || 0,
    failureRate,
    fallbackRate,
    retryRate,
    cacheHitRate: Number(row.cacheHitRate) || 0,
    abortedRate,
    expectedDenialRate: Number(row.expectedDenialRate) || 0,
    sourceBreakdown: row.sourceBreakdown || {},
    lastAt: row.lastAt || null,
    note: reasons.join("; "),
  };
}

function bottleneckRows(profile = {}, thresholds) {
  const rows = Array.isArray(profile?.tailOperations) ? profile.tailOperations : [];
  return rows
    .filter((row) => {
      const count = Number(row?.count) || 0;
      const workCount = Number.isFinite(Number(row?.workCount)) ? Number(row.workCount) : count;
      const workP95 = Number(row?.workP95Ms) || Number(row?.p95Ms) || 0;
      const enoughWork = workCount >= thresholds.minSamples;
      const enoughSamples = count >= thresholds.minSamples;
      return (enoughWork && workP95 > thresholds.targetP95Ms)
        || (enoughSamples && Number(row?.failureRate) > thresholds.maxFailureRate)
        || (enoughSamples && Number(row?.fallbackRate) > thresholds.maxFallbackRate)
        || (enoughSamples && Number(row?.retryRate) > thresholds.maxRetryRate);
    })
    .slice(0, 15)
    .map((row) => ({
      category: row.category,
      name: row.name,
      count: row.count,
      workCount: row.workCount,
      workP95Ms: row.workP95Ms,
      workMaxMs: row.workMaxMs,
      failureRate: row.failureRate,
      fallbackRate: row.fallbackRate,
      retryRate: row.retryRate,
      cacheHitRate: row.cacheHitRate,
      abortedRate: row.abortedRate || 0,
      expectedDenialRate: row.expectedDenialRate || 0,
      sourceBreakdown: row.sourceBreakdown || {},
      lastMeta: row.lastMeta || {},
    }));
}

function fastPathUsage(profile = {}) {
  const rows = Array.isArray(profile?.operations) ? profile.operations : [];
  const rpcRows = rows.filter((row) => /(^|[.\-_])rpc($|[.\-_])|candidates-rpc/i.test(String(row?.name || "")));
  const fallbackRows = rows.filter((row) => Number(row?.fallbackCount) > 0 || /fallback/i.test(String(row?.name || "")));
  return {
    rpcOperationCount: rpcRows.length,
    rpcSampleCount: rpcRows.reduce((sum, row) => sum + (Number(row?.count) || 0), 0),
    fallbackOperationCount: fallbackRows.length,
    fallbackSampleCount: fallbackRows.reduce((sum, row) => sum + (Number(row?.count) || 0), 0),
    rpcOperations: rpcRows.slice(0, 30).map((row) => ({
      category: row.category,
      name: row.name,
      count: row.count,
      p95Ms: row.p95Ms,
      workP95Ms: row.workP95Ms,
      failures: row.failures,
    })),
    activeFallbacks: fallbackRows.slice(0, 30).map((row) => ({
      category: row.category,
      name: row.name,
      count: row.count,
      fallbackCount: row.fallbackCount,
      fallbackRate: row.fallbackRate,
      workP95Ms: row.workP95Ms,
    })),
  };
}

function missingStatusRpc(error) {
  const status = Number(error?.status) || 0;
  const message = [error?.message, error?.details?.message, error?.details?.details, error?.details?.hint, error?.details?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return status === 404 || /erp_performance_acceleration_status/.test(message)
    && /could not find|schema cache|pgrst202|does not exist|undefined function|42883/.test(message);
}

export async function loadProductionAccelerationStatus() {
  try {
    const rows = await rpc("erp_performance_acceleration_status", {}, {
      profileName: "production-verification.db-status",
      timeoutMs: 4_000,
    });
    const accelerators = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        kind: String(row?.kind || "").trim(),
        name: String(row?.name || "").trim(),
        installed: row?.installed === true,
      }))
      .filter((row) => row.kind && row.name);
    const installed = accelerators.filter((row) => row.installed).length;
    return {
      available: true,
      total: accelerators.length,
      installed,
      missing: Math.max(0, accelerators.length - installed),
      byKind: accelerators.reduce((out, row) => {
        if (!out[row.kind]) out[row.kind] = { total: 0, installed: 0, missing: 0 };
        out[row.kind].total += 1;
        if (row.installed) out[row.kind].installed += 1;
        else out[row.kind].missing += 1;
        return out;
      }, {}),
      missingItems: accelerators.filter((row) => !row.installed),
    };
  } catch (error) {
    return {
      available: false,
      total: 0,
      installed: 0,
      missing: 0,
      byKind: {},
      missingItems: [],
      reason: missingStatusRpc(error)
        ? "Acceleration manifest RPC is not installed in this database."
        : (shortText(error?.message) || "Acceleration manifest could not be read."),
    };
  }
}

export function buildProductionVerification(profile = {}, database = {}, overrides = {}) {
  const thresholds = envThresholds(overrides);
  const operations = operationMap(profile);
  const critical = CRITICAL_OPERATIONS.map((spec) => evaluateCriticalOperation(
    spec,
    operations.get(`${spec.category}\u0000${spec.name}`),
    thresholds,
  ));

  const readyRows = critical.filter((row) => Number(row.workCount) >= thresholds.minSamples);
  const collectingRows = critical.filter((row) => row.state === "collecting" || row.state === "no-samples");
  const attentionRows = critical.filter((row) => row.state === "needs-attention");
  const watchRows = critical.filter((row) => row.state === "watch");

  let state = "healthy";
  if (database?.available && Number(database?.missing) > 0) state = "needs-attention";
  else if (!database?.available) state = "collecting";
  if (attentionRows.length) state = "needs-attention";
  else if (state !== "needs-attention" && watchRows.length) state = "watch";
  else if (state === "healthy" && collectingRows.length) state = "collecting";

  const fastPaths = fastPathUsage(profile);
  const bottlenecks = bottleneckRows(profile, thresholds);

  let nextAction = "Keep collecting production samples and re-check the report after normal navigation traffic.";
  if (database?.available && Number(database?.missing) > 0) {
    nextAction = "Install the missing database accelerators first, then collect a fresh profiler window.";
  } else if (attentionRows.length || bottlenecks.length) {
    nextAction = "Prioritize the listed needs-attention/bottleneck operations, then clear the profiler window and measure again.";
  } else if (!collectingRows.length) {
    nextAction = "The sampled critical paths are within the configured verification thresholds; continue functional QA before closing the performance plan.";
  }

  return {
    generatedAt: Date.now(),
    state,
    thresholds,
    coverage: {
      criticalPaths: critical.length,
      sampledPaths: critical.filter((row) => row.count > 0).length,
      readyPaths: readyRows.length,
      collectingPaths: collectingRows.length,
      needsAttentionPaths: attentionRows.length,
      watchPaths: watchRows.length,
    },
    database,
    profiler: {
      windowMs: profile?.windowMs || 0,
      sampleCount: profile?.sampleCount || 0,
      operationCount: profile?.operationCount || 0,
      health: profile?.health || {},
    },
    criticalPaths: critical,
    fastPaths,
    bottlenecks,
    nextAction,
    notes: [
      "This report evaluates only the current warm server process because the built-in profiler is intentionally process-local.",
      "A path is not marked healthy until it has the configured minimum completed-work sample count; cache hits, client aborts, and expected 401/403 denials do not satisfy readiness.",
      "P95 targets are configurable with PERF_PRODUCTION_* environment variables and are diagnostics, not a user-facing SLA.",
    ],
  };
}

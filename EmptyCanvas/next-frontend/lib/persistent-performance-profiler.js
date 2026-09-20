import "server-only";

import { rpc, select } from "./supabase-rest";
import { summarizePerformanceSamples } from "./performance-profiler";

const TABLE = "erp_performance_samples";
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const MAX_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ROWS = 5000;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function shortText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function safeWindowMs(value) {
  return Math.max(30_000, Math.min(MAX_WINDOW_MS, finiteNumber(value, DEFAULT_WINDOW_MS) || DEFAULT_WINDOW_MS));
}

function maxRows() {
  return Math.max(100, Math.min(20_000, Math.round(
    finiteNumber(process.env.PERF_PERSIST_MAX_ROWS, DEFAULT_MAX_ROWS) || DEFAULT_MAX_ROWS,
  )));
}

function unavailableReason(error) {
  const status = Number(error?.status) || 0;
  const text = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
  ].filter(Boolean).join(" ").toLowerCase();

  if (status === 404 || /erp_performance_samples|pgrst205|relation .* does not exist/.test(text)) {
    return "Persistent performance telemetry table is not installed. Run supabase_performance_telemetry.sql.";
  }
  if (status === 401 || status === 403) {
    return "Persistent performance telemetry is not accessible with the configured server Supabase credential.";
  }
  return shortText(error?.message || error?.details?.message || "Persistent performance telemetry could not be read.");
}

function mapRow(row = {}) {
  const createdAt = Date.parse(String(row?.created_at || ""));
  return {
    at: Number.isFinite(createdAt) ? createdAt : Date.now(),
    category: String(row?.category || "other"),
    name: String(row?.name || "operation"),
    durationMs: Math.max(0, finiteNumber(row?.duration_ms)),
    ok: row?.ok !== false,
    status: Math.max(0, Math.round(finiteNumber(row?.status))),
    meta: row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {},
  };
}

export async function loadPersistentPerformanceSnapshot({
  windowMs = DEFAULT_WINDOW_MS,
  limit = 100,
} = {}) {
  const effectiveWindow = safeWindowMs(windowMs);
  const cutoff = new Date(Date.now() - effectiveWindow).toISOString();

  try {
    const rows = await select(TABLE, {
      select: "created_at,category,name,duration_ms,ok,status,meta",
      created_at: `gte.${cutoff}`,
      order: "created_at.desc",
      limit: String(maxRows()),
    }, {
      profileName: "performance.telemetry-window",
      timeoutMs: 4_000,
      attempts: 1,
    });

    const samples = (Array.isArray(rows) ? rows : []).map(mapRow).sort((a, b) => a.at - b.at);
    return {
      available: true,
      truncated: samples.length >= maxRows(),
      snapshot: summarizePerformanceSamples(samples, {
        windowMs: effectiveWindow,
        limit,
        source: "supabase-persistent",
        startedAt: null,
      }),
    };
  } catch (error) {
    return {
      available: false,
      truncated: false,
      reason: unavailableReason(error),
      snapshot: null,
    };
  }
}

export async function clearPersistentPerformanceSamples() {
  try {
    const result = await rpc("erp_clear_performance_samples", {}, {
      profileName: "performance.telemetry-clear",
      timeoutMs: 4_000,
    });
    const row = Array.isArray(result) ? result[0] : result;
    const removed = Number(row?.erp_clear_performance_samples ?? row?.removed ?? row);
    return {
      available: true,
      removed: Number.isFinite(removed) ? removed : null,
    };
  } catch (error) {
    return {
      available: false,
      removed: null,
      reason: unavailableReason(error),
    };
  }
}

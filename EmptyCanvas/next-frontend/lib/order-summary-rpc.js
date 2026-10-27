import "server-only";

import { rpc } from "./supabase-rest";

const RPC_NAME = "erp_order_summary_rows";
const BUNDLE_RPC_NAME = "erp_order_summary_bundle";
const CARD_RPC_NAME = "erp_order_card_summaries";
const MISSING_COOLDOWN_MS = 60 * 1000;
const ERROR_COOLDOWN_MS = 60 * 1000;
// PostgREST commonly caps one RPC response at 1000 rows. Large proposal
// orders can contain 150+ component rows each, so requesting a full page of
// order groups in one RPC silently drops the oldest groups once that cap is
// reached. Keep each RPC batch comfortably below that ceiling and split again
// defensively if a deployment still returns a cap-sized payload.
const SUMMARY_RPC_BATCH_SIZE = 5;
const SUMMARY_RPC_ROW_CAP_GUARD = 1000;
const DEFAULT_BUNDLE_BATCH_SIZE = 6;
const DEFAULT_BUNDLE_CONCURRENCY = 4;
const DEFAULT_BUNDLE_TIMEOUT_MS = 4500;
const DEFAULT_ROW_BATCH_CONCURRENCY = 4;
let disabledUntil = 0;
let bundleDisabledUntil = 0;
let cardDisabledUntil = 0;

function text(value) {
  return String(value ?? "").trim();
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function bundleBatchSize() {
  return boundedInteger(process.env.ORDER_SUMMARY_BUNDLE_BATCH_SIZE, DEFAULT_BUNDLE_BATCH_SIZE, 2, 12);
}

function bundleConcurrency() {
  return boundedInteger(process.env.ORDER_SUMMARY_BUNDLE_CONCURRENCY, DEFAULT_BUNDLE_CONCURRENCY, 1, 8);
}

function bundleTimeoutMs() {
  return boundedInteger(process.env.ORDER_SUMMARY_BUNDLE_TIMEOUT_MS, DEFAULT_BUNDLE_TIMEOUT_MS, 1500, 8000);
}

function rowBatchConcurrency() {
  return boundedInteger(process.env.ORDER_SUMMARY_ROW_BATCH_CONCURRENCY, DEFAULT_ROW_BATCH_CONCURRENCY, 1, 8);
}

function chunk(values = [], size = 1) {
  const safe = Math.max(1, Math.floor(Number(size) || 1));
  const out = [];
  for (let index = 0; index < values.length; index += safe) out.push(values.slice(index, index + safe));
  return out;
}

async function mapConcurrent(values = [], concurrency = 1, worker) {
  const source = Array.isArray(values) ? values : [];
  if (!source.length) return [];
  const limit = Math.max(1, Math.min(source.length, Math.floor(Number(concurrency) || 1)));
  const output = new Array(source.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= source.length) return;
      output[index] = await worker(source[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => run()));
  return output;
}

function cleanNumbers(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite))];
}

function missingNamedRpc(error, rpcName) {
  const status = Number(error?.status) || 0;
  const message = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
  ].filter(Boolean).join(" ").toLowerCase();
  const wanted = String(rpcName || "").toLowerCase();
  if (status === 404 && (!wanted || message.includes(wanted))) return true;
  if (wanted && !message.includes(wanted)) return false;
  return /could not find|schema cache|pgrst202|does not exist|undefined function|42883/.test(message);
}

function missingRpc(error) {
  return missingNamedRpc(error, RPC_NAME);
}

export function canUseOrderSummaryRpc() {
  return Date.now() >= disabledUntil;
}

export function noteOrderSummaryRpcError(error) {
  const missing = missingRpc(error);
  disabledUntil = Date.now() + (missing ? MISSING_COOLDOWN_MS : ERROR_COOLDOWN_MS);
  return missing;
}

/**
 * Normalize the compact summary projection produced inside PostgreSQL. The SQL
 * accelerator emits only the fields used by the list UI, so custom/optional
 * schema columns can safely become null without forcing a select=* fallback.
 */
function normalizeSummaryRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.row_data ?? row?.rowData ?? row)
    .filter((row) => row && typeof row === "object" && !Array.isArray(row));
}

function normalizeBundleRows(data) {
  if (Array.isArray(data)) {
    // The bundle RPC returns one PostgREST row: { payload: [ ...rows ] }.
    if (data.length === 1 && Array.isArray(data[0]?.payload)) return normalizeSummaryRows(data[0].payload);
    // Be defensive for PostgREST versions that unwrap a json/jsonb scalar.
    if (data.length && data.every((row) => row && typeof row === "object" && !Array.isArray(row) && !Object.prototype.hasOwnProperty.call(row, "payload"))) {
      return normalizeSummaryRows(data);
    }
  }
  if (Array.isArray(data?.payload)) return normalizeSummaryRows(data.payload);
  return [];
}


function normalizeCardRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const rawIds = row?.order_ids ?? row?.orderIds ?? [];
    let orderIds = [];
    if (Array.isArray(rawIds)) orderIds = rawIds;
    else if (typeof rawIds === "string" && rawIds.trim()) {
      try {
        const parsed = JSON.parse(rawIds);
        if (Array.isArray(parsed)) orderIds = parsed;
      } catch {}
    }
    return {
      orderNumber: Number.isFinite(Number(row?.order_number ?? row?.orderNumber)) ? Number(row?.order_number ?? row?.orderNumber) : null,
      orderIds: [...new Set(orderIds.map((value) => text(value)).filter(Boolean))],
      createdTime: text(row?.created_time ?? row?.createdTime),
      teamMemberId: text(row?.team_member_id ?? row?.teamMemberId),
      teamMemberName: text(row?.team_member_name ?? row?.teamMemberName),
      reason: text(row?.reason),
      orderType: text(row?.order_type ?? row?.orderType),
      stage: Number.isFinite(Number(row?.stage)) ? Number(row.stage) : 1,
      hasRemaining: Boolean(row?.has_remaining ?? row?.hasRemaining),
      hasReceived: Boolean(row?.has_received ?? row?.hasReceived),
      hasApproved: Boolean(row?.has_approved ?? row?.hasApproved),
      hasRejected: Boolean(row?.has_rejected ?? row?.hasRejected),
      approvalState: text(row?.approval_state ?? row?.approvalState) || "not-started",
      archived: Boolean(row?.archived),
    };
  }).filter((row) => Number.isFinite(row.orderNumber) && row.orderIds.length);
}

export function canUseOrderCardSummaryRpc() {
  return Date.now() >= cardDisabledUntil;
}

export function noteOrderCardSummaryRpcError(error) {
  const missing = missingNamedRpc(error, CARD_RPC_NAME);
  cardDisabledUntil = Date.now() + (missing ? MISSING_COOLDOWN_MS : ERROR_COOLDOWN_MS);
  return missing;
}

/**
 * Card-only fast path for Orders Review / Operations Orders. The closed list
 * cards do not render component rows; details are loaded lazily on open. This
 * RPC therefore returns one aggregate row per order plus the component IDs
 * needed by the existing details endpoint.
 */
export async function loadOrderCardSummariesRpc({
  numbers = [],
  context = "operations",
  tab = "all",
  visibleIds = [],
  visibleNames = [],
  profileName = "orders.card-summary-rpc",
  signal = null,
} = {}) {
  const orderNumbers = cleanNumbers(numbers);
  if (!orderNumbers.length) return [];

  try {
    const rows = await rpc(CARD_RPC_NAME, {
      p_options: {
        orderNumbers,
        context: text(context).toLowerCase(),
        tab: text(tab).toLowerCase(),
        visibleIds: [...new Set((Array.isArray(visibleIds) ? visibleIds : []).map(text).filter(Boolean))],
        visibleNames: [...new Set((Array.isArray(visibleNames) ? visibleNames : []).map(text).filter(Boolean))],
      },
    }, {
      profileName: text(profileName) || "orders.card-summary-rpc",
      timeoutMs: 5_000,
      signal,
    });
    return normalizeCardRows(rows);
  } catch (error) {
    noteOrderCardSummaryRpcError(error);
    throw error;
  }
}

async function loadSummaryBundleBatch(orderNumbers, { profileName, signal } = {}) {
  const response = await rpc(BUNDLE_RPC_NAME, {
    p_options: { orderNumbers },
  }, {
    // Keep one metric name for all small bundle calls so Production P95 shows
    // the real per-batch DB/network latency instead of one giant-window call.
    profileName: `${text(profileName) || "orders.summary"}-bundle-rpc`,
    timeoutMs: bundleTimeoutMs(),
    signal,
  });
  return normalizeBundleRows(response);
}

async function loadSummaryBundles(orderNumbers, { profileName, signal } = {}) {
  // A single jsonb_agg for 30-40 order groups produced a very large JSON value
  // in production and regressed P95 to ~10s. Small bundles keep each JSON
  // serialization bounded, while limited concurrency removes the old sequential
  // round-trip chain.
  const batches = chunk(orderNumbers, bundleBatchSize());
  const groups = await mapConcurrent(batches, bundleConcurrency(), async (batch) =>
    await loadSummaryBundleBatch(batch, { profileName, signal }));
  return groups.flat();
}

async function loadSummaryBatch(orderNumbers, { profileName, signal } = {}) {
  const rows = await rpc(RPC_NAME, {
    p_options: { orderNumbers },
  }, {
    profileName: text(profileName) || "orders.summary-rpc",
    timeoutMs: 8_000,
    signal,
  });
  const normalized = normalizeSummaryRows(rows);

  // A cap-sized response is potentially truncated by PostgREST. Split the
  // order-number window so every component row for every order is returned.
  if (normalized.length >= SUMMARY_RPC_ROW_CAP_GUARD) {
    if (orderNumbers.length <= 1) {
      const error = new Error("Order summary RPC response reached the PostgREST row cap.");
      error.code = "ORDER_SUMMARY_RPC_TRUNCATED";
      throw error;
    }
    const middle = Math.ceil(orderNumbers.length / 2);
    const left = await loadSummaryBatch(orderNumbers.slice(0, middle), { profileName, signal });
    const right = await loadSummaryBatch(orderNumbers.slice(middle), { profileName, signal });
    return [...left, ...right];
  }

  return normalized;
}

async function loadSummaryRowBatches(orderNumbers, { profileName, signal } = {}) {
  const batches = chunk(orderNumbers, SUMMARY_RPC_BATCH_SIZE);
  const groups = await mapConcurrent(batches, rowBatchConcurrency(), async (batch) =>
    await loadSummaryBatch(batch, { profileName, signal }));
  return groups.flat();
}

export async function loadOrderSummaryRowsRpc({
  numbers = [],
  profileName = "orders.summary-rpc",
  signal = null,
} = {}) {
  const orderNumbers = cleanNumbers(numbers);
  if (!orderNumbers.length) return [];

  // Production evidence showed that one giant bundle moved the bottleneck into
  // PostgreSQL JSON aggregation/network transfer. Use several bounded bundles
  // concurrently instead. This keeps one response small while avoiding the old
  // 6-8 sequential requests for a 36-order page.
  if (Date.now() >= bundleDisabledUntil) {
    try {
      return await loadSummaryBundles(orderNumbers, { profileName, signal });
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      bundleDisabledUntil = Date.now() + (missingNamedRpc(error, BUNDLE_RPC_NAME) ? MISSING_COOLDOWN_MS : ERROR_COOLDOWN_MS);
    }
  }

  // Compatibility/recovery path: the row RPC is also parallelized in bounded
  // batches. A slow/missing bundle therefore no longer adds a long serial tail
  // before the fallback completes.
  return await loadSummaryRowBatches(orderNumbers, { profileName, signal });
}

export const __orderSummaryRpcTest = {
  cleanNumbers,
  missingRpc,
  normalizeSummaryRows,
  normalizeBundleRows,
  normalizeCardRows,
  chunk,
  mapConcurrent,
};

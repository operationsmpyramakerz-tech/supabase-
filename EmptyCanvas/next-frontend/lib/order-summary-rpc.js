import "server-only";

import { rpc } from "./supabase-rest";

const RPC_NAME = "erp_order_summary_rows";
const BUNDLE_RPC_NAME = "erp_order_summary_bundle";
const MISSING_COOLDOWN_MS = 60 * 1000;
const ERROR_COOLDOWN_MS = 60 * 1000;
// PostgREST commonly caps one RPC response at 1000 rows. Large proposal
// orders can contain 150+ component rows each, so requesting a full page of
// order groups in one RPC silently drops the oldest groups once that cap is
// reached. Keep each RPC batch comfortably below that ceiling and split again
// defensively if a deployment still returns a cap-sized payload.
const SUMMARY_RPC_BATCH_SIZE = 5;
const SUMMARY_RPC_ROW_CAP_GUARD = 1000;
let disabledUntil = 0;
let bundleDisabledUntil = 0;

function text(value) {
  return String(value ?? "").trim();
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

async function loadSummaryBundle(orderNumbers, { profileName, signal } = {}) {
  const response = await rpc(BUNDLE_RPC_NAME, {
    p_options: { orderNumbers },
  }, {
    profileName: `${text(profileName) || "orders.summary"}-bundle-rpc`,
    timeoutMs: 10_000,
    signal,
  });
  return normalizeBundleRows(response);
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

export async function loadOrderSummaryRowsRpc({
  numbers = [],
  profileName = "orders.summary-rpc",
  signal = null,
} = {}) {
  const orderNumbers = cleanNumbers(numbers);
  if (!orderNumbers.length) return [];

  // Primary production path: aggregate every compact component row into one
  // jsonb payload inside PostgreSQL. PostgREST then sees one result row instead
  // of 1,000+ component rows, so a 30-40 order window needs one round trip
  // instead of a chain of 5-order RPC calls. This is the main fix for the
  // Operations/Review 9-12s tail that remained after compacting each row.
  if (Date.now() >= bundleDisabledUntil) {
    try {
      return await loadSummaryBundle(orderNumbers, { profileName, signal });
    } catch (error) {
      if (signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
      bundleDisabledUntil = Date.now() + (missingNamedRpc(error, BUNDLE_RPC_NAME) ? MISSING_COOLDOWN_MS : ERROR_COOLDOWN_MS);
    }
  }

  // Compatibility path for a deployment where the new bundle migration has
  // not been installed yet. Keep the proven row RPC and cap-safe batching.
  const output = [];
  for (let index = 0; index < orderNumbers.length; index += SUMMARY_RPC_BATCH_SIZE) {
    const batch = orderNumbers.slice(index, index + SUMMARY_RPC_BATCH_SIZE);
    output.push(...await loadSummaryBatch(batch, { profileName, signal }));
  }
  return output;
}

export const __orderSummaryRpcTest = {
  cleanNumbers,
  missingRpc,
  normalizeSummaryRows,
  normalizeBundleRows,
};

import "server-only";

import { rpc } from "./supabase-rest";

const RPC_NAME = "erp_order_summary_rows";
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

function text(value) {
  return String(value ?? "").trim();
}

function cleanNumbers(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter(Number.isFinite))];
}

function missingRpc(error) {
  const status = Number(error?.status) || 0;
  const message = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
  ].filter(Boolean).join(" ").toLowerCase();
  if (status === 404 && message.includes(RPC_NAME)) return true;
  if (!message.includes(RPC_NAME)) return false;
  return /could not find|schema cache|pgrst202|does not exist|undefined function|42883/.test(message);
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
 * Load the compact summary projection inside Postgres. The SQL accelerator
 * shapes rows from to_jsonb(orders), so optional/custom columns become null
 * instead of making PostgREST reject the whole projection and forcing select=*.
 */
function normalizeSummaryRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.row_data ?? row?.rowData ?? row)
    .filter((row) => row && typeof row === "object" && !Array.isArray(row));
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
};

import "server-only";

import { rpc } from "./supabase-rest";

const RPC_NAME = "erp_order_summary_rows";
const MISSING_COOLDOWN_MS = 60 * 1000;
const ERROR_COOLDOWN_MS = 60 * 1000;
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
export async function loadOrderSummaryRowsRpc({
  numbers = [],
  profileName = "orders.summary-rpc",
  signal = null,
} = {}) {
  const orderNumbers = cleanNumbers(numbers);
  if (!orderNumbers.length) return [];

  const rows = await rpc(RPC_NAME, {
    p_options: { orderNumbers },
  }, {
    profileName: text(profileName) || "orders.summary-rpc",
    timeoutMs: 8_000,
    signal,
  });

  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.row_data ?? row?.rowData ?? row)
    .filter((row) => row && typeof row === "object" && !Array.isArray(row));
}

export const __orderSummaryRpcTest = {
  cleanNumbers,
  missingRpc,
};

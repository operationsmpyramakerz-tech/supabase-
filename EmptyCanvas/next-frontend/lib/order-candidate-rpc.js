import "server-only";

import { rpc } from "./supabase-rest";

const RPC_NAME = "erp_order_candidate_numbers";
const CAPABILITY_COOLDOWN_MS = 10 * 60 * 1000;
let disabledUntil = 0;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  if (value === null || value === undefined || text(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value, fallback, min = 1, max = 301) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function cleanStringList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => text(value))
    .filter(Boolean))];
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

export function canUseOrderCandidateRpc() {
  return Date.now() >= disabledUntil;
}

export function noteOrderCandidateRpcError(error) {
  if (!missingRpc(error)) return false;
  disabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

/**
 * Ask Postgres for distinct order groups directly. This keeps duplicate
 * component rows inside the database instead of transferring 1000-row chunks
 * to Next just to discover a few dozen distinct order_number values.
 *
 * The SQL function is an optional acceleration layer. Callers must retain the
 * keyset scanner as a compatibility fallback when the function is not yet
 * installed in Supabase.
 */
export async function loadOrderCandidateNumbersRpc({
  context,
  cursor = null,
  wanted = 90,
  memberId = "",
  memberNames = [],
  visibleIds = [],
  visibleNames = [],
  orderType = "",
  tab = "all",
  profileName = "orders.candidates-rpc",
  signal = null,
} = {}) {
  const target = positiveInteger(wanted, 90, 1, 300);
  const payload = {
    context: text(context).toLowerCase(),
    cursor: finite(cursor),
    limit: target + 1,
    memberId: text(memberId),
    memberNames: cleanStringList(memberNames),
    visibleIds: cleanStringList(visibleIds),
    visibleNames: cleanStringList(visibleNames),
    orderType: text(orderType),
    tab: text(tab).toLowerCase() || "all",
  };

  const rows = await rpc(RPC_NAME, { p_options: payload }, {
    profileName,
    timeoutMs: 8_000,
    signal,
  });

  const numbers = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = finite(row?.order_number ?? row?.orderNumber ?? row);
    if (!Number.isFinite(value) || seen.has(value)) continue;
    seen.add(value);
    numbers.push(value);
  }

  return {
    numbers: numbers.slice(0, target),
    hasMore: numbers.length > target,
    source: "rpc",
  };
}

export const __orderCandidateRpcTest = {
  missingRpc,
  cleanStringList,
};

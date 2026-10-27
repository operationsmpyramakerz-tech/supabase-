import "server-only";

import { rpc } from "./supabase-rest";

const RPC_NAME = "erp_stocktaking_folder_summaries";
const CAPABILITY_COOLDOWN_MS = 10 * 60 * 1000;
const CACHE_TTL_MS = 20_000;

let disabledUntil = 0;
let cache = null;
let inflight = null;
let cacheGeneration = 0;

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value).replace(/\u00a0/g, " ").trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const wanted = RPC_NAME.toLowerCase();
  if (status === 404 && message.includes(wanted)) return true;
  if (!message.includes(wanted)) return false;
  return /could not find|schema cache|pgrst202|does not exist|undefined function|42883/.test(message);
}

function normalizeRow(row = {}) {
  const key = text(row.column_name ?? row.columnName ?? row.key);
  return {
    key,
    itemsCount: Math.max(0, Math.trunc(finite(row.items_count ?? row.itemsCount))),
    total: finite(row.total_quantity ?? row.totalQuantity ?? row.total),
  };
}

export function canUseStocktakingFolderSummaryRpc() {
  return Date.now() >= disabledUntil;
}

export function noteStocktakingFolderSummaryRpcError(error) {
  if (!missingRpc(error)) return false;
  disabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

export function invalidateStocktakingFolderSummaryRpcCache() {
  cacheGeneration += 1;
  cache = null;
  inflight = null;
}

/**
 * Returns one compact row per dynamic Stocktaking quantity column. PostgreSQL
 * performs the non-zero count and total aggregation so the folder landing page
 * does not download the entire wide Stocktaking matrix just to render cards.
 */
export async function loadStocktakingFolderSummariesRpc({ fresh = false } = {}) {
  if (fresh) invalidateStocktakingFolderSummaryRpcCache();

  const now = Date.now();
  if (!fresh && cache && cache.expiresAt > now) return cache.value;
  if (!fresh && inflight) return await inflight;

  const generation = cacheGeneration;
  const pending = rpc(RPC_NAME, {}, {
    profileName: "stocktaking.folder-summaries-rpc",
    timeoutMs: 8_000,
  }).then((rows) => (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter((row) => row.key));

  if (!fresh) inflight = pending;
  try {
    const value = await pending;
    if (generation === cacheGeneration) {
      cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return value;
  } finally {
    if (!fresh && inflight === pending) inflight = null;
  }
}

export const __stocktakingFolderSummaryRpcTest = {
  missingRpc,
  normalizeRow,
};

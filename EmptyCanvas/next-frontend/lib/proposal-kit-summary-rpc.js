import "server-only";

import { rpc } from "./supabase-rest";

const PROPOSALS_RPC = "erp_product_proposal_headers";
const KITS_RPC = "erp_product_kit_headers";
const CAPABILITY_COOLDOWN_MS = 10 * 60 * 1000;

let proposalsDisabledUntil = 0;
let kitsDisabledUntil = 0;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function missingRpc(error, rpcName) {
  const status = Number(error?.status) || 0;
  const message = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
  ].filter(Boolean).join(" ").toLowerCase();
  const wanted = String(rpcName || "").toLowerCase();
  if (status === 404 && message.includes(wanted)) return true;
  if (!message.includes(wanted)) return false;
  return /could not find|schema cache|pgrst202|does not exist|undefined function|42883/.test(message);
}

export function canUseProposalHeadersRpc() {
  return Date.now() >= proposalsDisabledUntil;
}

export function noteProposalHeadersRpcError(error) {
  if (!missingRpc(error, PROPOSALS_RPC)) return false;
  proposalsDisabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

export function canUseKitHeadersRpc() {
  return Date.now() >= kitsDisabledUntil;
}

export function noteKitHeadersRpcError(error) {
  if (!missingRpc(error, KITS_RPC)) return false;
  kitsDisabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

function normalizeProposal(row = {}) {
  return {
    id: text(row.id),
    name: text(row.name),
    created_by: text(row.created_by ?? row.createdBy),
    created_by_id: text(row.created_by_id ?? row.createdById),
    created_at: text(row.created_at ?? row.createdAt),
    updated_at: text(row.updated_at ?? row.updatedAt),
    combined_sources: jsonArray(row.combined_sources ?? row.combinedSources),
    combine_logic: text(row.combine_logic ?? row.combineLogic),
    items_count: Math.max(0, Math.trunc(finite(row.items_count ?? row.itemsCount))),
  };
}

function normalizeKit(row = {}) {
  return {
    id: text(row.id),
    name: text(row.name),
    created_by: text(row.created_by ?? row.createdBy),
    created_by_id: text(row.created_by_id ?? row.createdById),
    created_at: text(row.created_at ?? row.createdAt),
    updated_at: text(row.updated_at ?? row.updatedAt),
    folder_id: text(row.folder_id ?? row.folderId),
    items_count: Math.max(0, Math.trunc(finite(row.items_count ?? row.itemsCount))),
  };
}

/**
 * Proposal/Kits list fast paths.
 *
 * PostgreSQL returns one compact row per header with the component count
 * already aggregated. This prevents the list pages from downloading every
 * proposal/kit item just to calculate `itemsCount`. Full item rows remain
 * lazy and are still loaded only when a proposal or kit is opened.
 */
export async function loadProposalHeadersRpc() {
  const rows = await rpc(PROPOSALS_RPC, {}, {
    profileName: "proposals.headers-rpc",
    timeoutMs: 8_000,
  });
  return (Array.isArray(rows) ? rows : []).map(normalizeProposal).filter((row) => row.id);
}

export async function loadKitHeadersRpc() {
  const rows = await rpc(KITS_RPC, {}, {
    profileName: "kits.headers-rpc",
    timeoutMs: 8_000,
  });
  return (Array.isArray(rows) ? rows : []).map(normalizeKit).filter((row) => row.id);
}

export const __proposalKitSummaryRpcTest = {
  jsonArray,
  missingRpc,
  normalizeKit,
  normalizeProposal,
};

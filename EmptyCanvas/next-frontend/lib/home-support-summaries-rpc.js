import "server-only";

import { rpc } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";

const STOCK_RPC_NAME = "erp_home_stock_summary";
const EXPENSES_RPC_NAME = "erp_home_expenses_summary";
const CAPABILITY_COOLDOWN_MS = 10 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let stockDisabledUntil = 0;
let expensesDisabledUntil = 0;

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
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

function accountIdentity(account = {}) {
  return {
    id: text(account.userSupabaseId || account.teamMemberId || account.userId || account.id),
    name: text(account.name || account.username),
    username: text(account.username || account.name),
    employeeCode: text(account.employeeCode),
  };
}

function memberMatchesIdentity(member = {}, identity = {}) {
  const memberId = text(member.id);
  if (identity.id && memberId && identity.id === memberId) return true;
  const targets = [identity.name, identity.username].map(canonical).filter(Boolean);
  const memberName = canonical(member.name);
  return !!memberName && targets.includes(memberName);
}

async function resolveStocktakingColumnHint(identity = {}) {
  const direct = text(identity.stocktakingColumn || identity.school);
  if (direct) return direct;

  const normalized = {
    ...accountIdentity(identity),
    id: text(identity.userSupabaseId || identity.teamMemberId || identity.userId || identity.id),
    name: text(identity.name || identity.username),
    username: text(identity.username || identity.name),
  };
  if (!normalized.id && !normalized.name && !normalized.username) return "";

  const members = await listTeamMembersLite();
  const member = (Array.isArray(members) ? members : []).find((row) => memberMatchesIdentity(row, normalized)) || null;
  return text(member?.stocktakingColumn);
}

export function canUseHomeStockSummaryRpc() {
  return Date.now() >= stockDisabledUntil;
}

export function noteHomeStockSummaryRpcError(error) {
  if (!missingRpc(error, STOCK_RPC_NAME)) return false;
  stockDisabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

export function canUseHomeExpensesSummaryRpc() {
  return Date.now() >= expensesDisabledUntil;
}

export function noteHomeExpensesSummaryRpcError(error) {
  if (!missingRpc(error, EXPENSES_RPC_NAME)) return false;
  expensesDisabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

/**
 * Load only the stock totals needed by Home. PostgreSQL resolves the dynamic
 * school quantity column, aggregates by tag, and returns a handful of rows
 * instead of the whole customized Stocktaking table.
 */
export async function loadHomeStockSummaryRpc(identity = {}) {
  const stocktakingColumn = await resolveStocktakingColumnHint(identity);
  if (!stocktakingColumn) {
    const error = new Error("Could not determine the Stocktaking column for the Home summary.");
    error.status = 404;
    throw error;
  }

  const rows = await rpc(STOCK_RPC_NAME, {
    p_options: { stocktakingColumn },
  }, {
    profileName: "home.stock-summary-rpc",
    timeoutMs: 8_000,
  });

  const tags = [];
  const summaries = { all: { quantity: 0, cost: 0, records: 0 } };
  let quantityColumn = "";

  for (const row of Array.isArray(rows) ? rows : []) {
    const tag = text(row.tag_name ?? row.tagName) || "Untagged";
    const summary = {
      quantity: finite(row.quantity),
      cost: finite(row.cost),
      records: Math.max(0, Math.trunc(finite(row.records))),
    };
    quantityColumn ||= text(row.quantity_column ?? row.quantityColumn);
    if (!summaries[tag]) tags.push(tag);
    summaries[tag] = summary;
    summaries.all.quantity += summary.quantity;
    summaries.all.cost += summary.cost;
    summaries.all.records += summary.records;
  }

  tags.sort((a, b) => a.localeCompare(b));
  return {
    tags,
    summaries,
    quantityColumn,
    source: "supabase-rpc",
  };
}

/**
 * Aggregate the current year's Home expense chart in PostgreSQL. Only twelve
 * monthly numbers (usually fewer) cross the network instead of every receipt.
 */
export async function loadHomeExpensesSummaryRpc(identity = {}, duration = "all") {
  const normalized = accountIdentity(identity);
  const names = unique([normalized.name, normalized.username]);
  const userIds = unique([normalized.employeeCode, normalized.id]);
  if (!names.length && !userIds.length) {
    const error = new Error("Could not determine the Expenses owner for the Home summary.");
    error.status = 400;
    throw error;
  }

  const selectedDuration = ["all", "week", "month", "year"].includes(lower(duration)) ? lower(duration) : "all";
  const rows = await rpc(EXPENSES_RPC_NAME, {
    p_options: {
      userIds,
      names,
      duration: selectedDuration,
    },
  }, {
    profileName: "home.expenses-summary-rpc",
    timeoutMs: 8_000,
  });

  const values = Array(12).fill(0);
  let year = new Date().getFullYear();
  for (const row of Array.isArray(rows) ? rows : []) {
    const monthIndex = Math.trunc(finite(row.month_index ?? row.monthIndex, -1));
    if (monthIndex >= 0 && monthIndex < 12) values[monthIndex] += finite(row.value ?? row.total_cash_out ?? row.totalCashOut);
    const rowYear = Math.trunc(finite(row.year_no ?? row.yearNo));
    if (rowYear > 0) year = rowYear;
  }

  return {
    year,
    currentMonth: new Date().getMonth(),
    months: MONTHS.map((label, index) => ({ label, value: values[index] })),
    source: "supabase-rpc",
  };
}

export const __homeSupportSummariesRpcTest = {
  accountIdentity,
  canonical,
  memberMatchesIdentity,
  missingRpc,
};

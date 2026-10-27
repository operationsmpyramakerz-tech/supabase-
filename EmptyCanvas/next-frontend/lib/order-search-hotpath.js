import "server-only";

const SEARCH_TEXT_COLUMN = "search_text";
const CAPABILITY_COOLDOWN_MS = 10 * 60 * 1000;
let disabledUntil = 0;

export function sanitizeOrderSearchText(value) {
  return String(value ?? "")
    .trim()
    .replace(/[,*%()]/g, " ")
    .replace(/\s+/g, " ");
}

export function createOrderSearchPlan(query = "", legacyColumns = []) {
  const clean = sanitizeOrderSearchText(query);
  if (!clean) return null;

  const numeric = clean.match(/^(?:ord[-\s]*)?(\d+)$/i);
  if (numeric) {
    return {
      clean,
      orderNumber: Number(numeric[1]),
      fastFilter: null,
      legacyClauses: [],
    };
  }

  const columns = [...new Set((Array.isArray(legacyColumns) ? legacyColumns : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];

  return {
    clean,
    orderNumber: null,
    fastFilter: `ilike.*${clean}*`,
    legacyClauses: columns.map((column) => `${column}.ilike.*${clean}*`),
  };
}

export function canUseOrderSearchText() {
  return Date.now() >= disabledUntil;
}

function missingSearchColumn(error) {
  const message = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!message.includes(SEARCH_TEXT_COLUMN)) return false;
  return /does not exist|could not find|schema cache|42703|pgrst204|undefined column/.test(message);
}

export function noteOrderSearchTextError(error) {
  if (!missingSearchColumn(error)) return false;
  disabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

export function applyOrderSearchPlan({ params, logicGroups, plan, mode = "fast" } = {}) {
  if (!plan) return;
  if (Number.isFinite(plan.orderNumber)) {
    params.order_number = `eq.${plan.orderNumber}`;
    return;
  }
  if (mode === "fast" && plan.fastFilter) {
    params[SEARCH_TEXT_COLUMN] = plan.fastFilter;
    return;
  }
  if (plan.legacyClauses?.length) logicGroups.push(plan.legacyClauses);
}

export const __orderSearchHotpathTest = {
  missingSearchColumn,
  SEARCH_TEXT_COLUMN,
};

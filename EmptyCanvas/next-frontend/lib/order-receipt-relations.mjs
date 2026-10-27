// Pure reference-matching rules used by the authenticated receipt viewer.
// Never use substring matches to authorize a relation ("12" != "112").
const clean = value => String(value ?? "").trim();
const compactUuid = value => clean(value).replace(/-/g, "").toLowerCase();

export function receiptReferenceTokens(value) {
  if (Array.isArray(value)) return value.flatMap(receiptReferenceTokens);
  if (value && typeof value === "object") return [];
  const raw = clean(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return receiptReferenceTokens(parsed);
  } catch {}
  return raw.split(/[\n,]+/).map(clean).filter(Boolean);
}

export function receiptOrderNumbers(value) {
  const source = Array.isArray(value) ? value.join(" ") : clean(value);
  return [...source.matchAll(/\b(?:ORD|ORDER)[-:\s]?(\d+)\b/gi)].map(m => String(BigInt(m[1])));
}

function canonicalRef(value) {
  const raw = clean(value);
  if (/^[\da-f-]{32,36}$/i.test(raw) && /^[\da-f]{32}$/.test(compactUuid(raw))) return compactUuid(raw);
  if (/^\d+$/.test(raw)) return String(BigInt(raw));
  const matched = raw.match(/^(?:ORD|ORDER)[-:\s]?(\d+)$/i);
  if (matched) return `ord:${BigInt(matched[1])}`;
  return raw.toLowerCase();
}

export function expenseLinksReceiptSource(expense = {}, sourceId, sourceRows = []) {
  const refs = receiptReferenceTokens(expense.orders_raw ?? expense.ordersRaw);
  const names = expense.orders_names ?? expense.ordersNames ?? "";
  const sourceToken = canonicalRef(sourceId);
  const rowIds = new Set(sourceRows.map(row => canonicalRef(row?.id)).filter(Boolean));
  const numbers = new Set(sourceRows.map(row => clean(row?.order_number)).filter(Boolean).map(v => /^\d+$/.test(v) ? String(BigInt(v)) : ""));
  // Trust exact relation IDs first, including legacy UUIDs and row IDs.
  if (refs.some(value => canonicalRef(value) === sourceToken || rowIds.has(canonicalRef(value)))) return true;
  const numbersNamed = new Set([...receiptOrderNumbers(names), ...receiptOrderNumbers(refs)]);
  if (sourceToken.startsWith("ord:") && numbersNamed.has(sourceToken.slice(4))) return true;
  // Historical expenses can hold only the human-readable ORD code instead of
  // each component row ID. Both sides must resolve to the same order number.
  return [...numbers].some(number => numbersNamed.has(number));
}

// Pure authorization-adjacent checks for expense exports. A browser can choose
// which permitted rows to export, but cannot supply the rows or their identity.
const text = (value) => String(value ?? "").trim();

export function selectAuthorizedExpenseExportRows(requestedItems, authorizedItems, { maxRows = 5000 } = {}) {
  const requested = Array.isArray(requestedItems) ? requestedItems : [];
  if (!requested.length) return { ok: true, rows: [] };
  if (requested.length > maxRows) return { ok: false, status: 400, error: "Too many expense rows." };

  const authorized = new Map((Array.isArray(authorizedItems) ? authorizedItems : [])
    .filter((row) => text(row?.id))
    .map((row) => [text(row.id), row]));
  const seen = new Set();
  const rows = [];
  for (const requestedRow of requested) {
    const id = text(requestedRow?.id);
    if (!id || !authorized.has(id)) {
      return { ok: false, status: 403, error: "One or more expense rows are not available for this account." };
    }
    if (seen.has(id)) {
      return { ok: false, status: 400, error: "Duplicate expense rows are not allowed in an export." };
    }
    seen.add(id);
    rows.push(authorized.get(id));
  }
  return { ok: true, rows };
}

export function authorizedExpenseExportIdentity(rows, { account = {}, lookupId = "", usersExport = false } = {}) {
  const first = (Array.isArray(rows) ? rows : []).find((row) => row && typeof row === "object") || {};
  const userName = text(first.teamMemberName) || (!usersExport ? text(account.name || account.username) : "") || "Expenses";
  const userId = text(first.userId) || (usersExport ? text(lookupId) : text(account.teamMemberId || account.userSupabaseId || account.id));
  return { userName: `Expenses — ${userName}`, userId };
}

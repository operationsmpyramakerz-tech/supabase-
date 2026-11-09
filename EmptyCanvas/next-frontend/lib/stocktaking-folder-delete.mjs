/** Pure validation and guarded PostgREST DELETE query for a single stock folder. */
export function planStocktakingFolderRowDeletion(rows = [], column = "", otherColumns = []) {
  const ids = [];
  const sharedIds = [];
  for (const row of rows || []) {
    if (!row || row[column] === null || typeof row[column] === "undefined") continue;
    if (row.id === null || typeof row.id === "undefined" || String(row.id).trim() === "") {
      throw new Error("Stocktaking record without an ID cannot be safely deleted.");
    }
    const shared = otherColumns.some((key) => row[key] !== null && typeof row[key] !== "undefined");
    if (shared) sharedIds.push(String(row.id));
    else ids.push(String(row.id));
  }
  return { ids, sharedIds };
}

function encodePostgrestId(id) {
  const raw = String(id ?? "").trim();
  if (!raw || /[\r\n]/.test(raw)) throw new Error("Invalid Stocktaking row ID.");
  return /^-?\d+$/.test(raw) ? raw : `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function stocktakingFolderDeletePath(table = "stocktaking", ids = [], column = "", otherColumns = []) {
  if (!ids.length || !column || !table) throw new Error("Missing folder deletion parameters.");
  const filters = [
    `select=id`,
    `id=in.(${encodeURIComponent(ids.map(encodePostgrestId).join(","))})`,
    `${encodeURIComponent(column)}=not.is.null`,
    ...otherColumns.map((key) => `${encodeURIComponent(key)}=is.null`),
  ];
  return `/${encodeURIComponent(table)}?${filters.join("&")}`;
}

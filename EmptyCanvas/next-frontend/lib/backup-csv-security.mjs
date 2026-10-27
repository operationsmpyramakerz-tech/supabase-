/** Safely serialize CSV cells, including free-form values from Backup tables.
 * Spreadsheet apps may treat =, +, -, @ as formula prefixes after whitespace
 * and control characters. Prefix with an apostrophe before normal CSV quoting.
 */
export function escapeBackupCsvCell(value) {
  if (value === null || typeof value === "undefined") return "";
  let raw;
  if (typeof value === "object") {
    try { raw = JSON.stringify(value); } catch { raw = String(value); }
  } else {
    raw = String(value);
  }
  if (/^[\s\u0000-\u001f\uFEFF]*[=+\-@]/u.test(raw)) raw = `'${raw}`;
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

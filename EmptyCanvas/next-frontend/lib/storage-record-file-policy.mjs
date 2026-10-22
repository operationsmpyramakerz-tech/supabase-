// Exact stored reference comparisons. Never authorize on a JSON substring alone.
const DIRECT_PATH = "/next/api/storage/file-direct";
export function storedReference(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 6000) return "";
  try {
    const parsed = new URL(raw, "https://erp.invalid");
    if (parsed.origin !== "https://erp.invalid") return "";
    if (parsed.pathname === DIRECT_PATH) return String(parsed.searchParams.get("reference") || "");
    const legacy = parsed.pathname.match(/^\/api\/storage\/file\/([A-Za-z0-9._~-]+)$/);
    return legacy?.[1] || "";
  } catch { return ""; }
}

export function b2cRecordHasReference(values, reference) {
  if (!reference || !values || typeof values !== "object" || Array.isArray(values)) return false;
  return Object.values(values).some(files => Array.isArray(files) && files.some(file =>
    file && typeof file === "object" && storedReference(file.url || file.href || file.publicUrl) === reference
  ));
}

export function kpiEvidenceHasReference(evidence, reference) {
  return Boolean(reference && storedReference(evidence) === reference);
}

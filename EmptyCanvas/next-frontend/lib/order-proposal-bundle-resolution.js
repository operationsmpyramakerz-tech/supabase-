// Pure classification for proposal sources already returned by the live order
// bundle. This does not query the database, cache private data or infer a kit.
const asText = (value) => String(value ?? "").trim();
const canonical = (value) => asText(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

function parseSources(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value == null ? [] : null;
}

/**
 * A complete, current database bundle can positively prove that the exact
 * proposal/product pair has no source_kits. Repeating the REST lookup when
 * the source array is definitively empty adds latency but cannot recover it.
 *
 * "unknown" deliberately preserves the legacy lookup (missing proposal,
 * product renamed, malformed sources, etc.).
 */
export function classifyBundleProposalSources(row = {}, proposalId = "", proposalItems = []) {
  const id = asText(proposalId);
  if (!id || !Array.isArray(proposalItems)) return { kind: "unknown" };
  const productId = asText(row.product_id);
  const productName = canonical(row.product_name);
  const matches = proposalItems.filter((candidate) =>
    asText(candidate?.proposal_id) === id
    && ((productId && asText(candidate?.product_id) === productId)
      || (productName && canonical(candidate?.product_name) === productName)));
  if (!matches.length) return { kind: "unknown" };

  let definitelyEmpty = true;
  for (const match of matches) {
    const sources = parseSources(match.source_kits);
    if (!Array.isArray(sources)) {
      definitelyEmpty = false;
      continue;
    }
    if (sources.length) return { kind: "found", sources };
  }
  return definitelyEmpty ? { kind: "confirmed-empty" } : { kind: "unknown" };
}

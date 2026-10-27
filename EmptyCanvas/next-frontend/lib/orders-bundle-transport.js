// Pure, lossless decoder for column-packed order bundle sections.
// No caches and no reference to credentials; compatible with server-only usage.
export const BUNDLE_SECTIONS = Object.freeze([
  "rows", "products", "kitItems", "kits", "folders", "proposalItems", "proposalHeaders",
]);

export function unpackCompactBundle(payload) {
  if (payload?.transportVersion !== 1 || !payload?.sections || typeof payload.sections !== "object") {
    throw new Error("Unexpected compact bundle version");
  }
  const restored = {
    version: payload.version,
    proposalItemsComplete: payload.proposalItemsComplete,
    dbTimings: payload.dbTimings,
  };
  for (const section of BUNDLE_SECTIONS) {
    const packed = payload.sections[section];
    if (!packed || typeof packed !== "object") throw new Error(`Missing bundle section: ${section}`);
    if (Array.isArray(packed.raw)) {
      restored[section] = packed.raw;
      continue;
    }
    const keys = packed.keys;
    const values = packed.values;
    if (!Array.isArray(keys) || !Array.isArray(values)
      || keys.some((key) => typeof key !== "string")
      || new Set(keys).size !== keys.length) {
      throw new Error(`Invalid compact bundle section: ${section}`);
    }
    restored[section] = values.map((row) => {
      if (!Array.isArray(row) || row.length !== keys.length) {
        throw new Error(`Incomplete compact bundle row: ${section}`);
      }
      return Object.fromEntries(keys.map((key, index) => [key, row[index]]));
    });
  }
  return restored;
}

// Transport metadata only; upstream HTTP headers may not include a content
// length. Never treat decoded JSON size as wire bytes or assume compression.
export function summarizeBundleTransportHeaders({ contentEncoding = "", contentLength = null } = {}) {
  const rawEncoding = String(contentEncoding || "").trim().toLowerCase();
  const encoding = ["gzip", "br", "deflate", "identity"].includes(rawEncoding)
    ? rawEncoding : (rawEncoding ? "other" : "not specified");
  const rawLength = String(contentLength ?? "").trim();
  const asNumber = /^\d+$/.test(rawLength) ? Number(rawLength) : NaN;
  const declaredBytes = Number.isSafeInteger(asNumber) ? asNumber : null;
  return { encoding, declaredBytes };
}

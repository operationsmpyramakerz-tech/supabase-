// Small, dependency-free helpers for the optional mobile speed diagnostics.
// Keep parsing and comparisons read-only; never retain private order payloads.
export const SQL_STAGE_LABELS = [
  ["bundleDbRows", "Order rows"],
  ["bundleDbProposalHeaders", "Proposal headers"],
  ["bundleDbProductsId", "Products by ID"],
  ["bundleDbProductsName", "Products by name"],
  ["bundleDbKitItems", "Kit memberships"],
  ["bundleDbKits", "Kits"],
  ["bundleDbFolders", "Kit folders"],
  ["bundleDbProposalItems", "Proposal components"],
];

export const MAIN_STAGE_LABELS = [
  ["auth", "Authentication"],
  ["details", "Details total"],
  ["bundle", "Supabase bundle"],
  ["bundleHeaders", "Supabase: waiting for headers"],
  ["bundleBody", "Supabase: reading response"],
  ["bundleParse", "Supabase: JSON decoding"],
  ["bundleUnpack", "Unpack compact bundle"],
  ["bundleDbPack", "PostgreSQL column packing"],
  ["prepare", "Additional preparation"],
  ["proposal", "Legacy proposal"],
];

export function parseServerTiming(header) {
  const timings = {};
  if (typeof header !== "string") return timings;
  // Server-Timing metrics may carry optional descriptors; only dur is used.
  // Ignore all nonnumeric values and names we don't explicitly display.
  for (const token of header.split(",")) {
    const match = token.match(/^\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*;\s*dur\s*=\s*([0-9]+(?:\.[0-9]+)?)(?:\s*;.*)?\s*$/);
    if (!match) continue;
    const ms = Number(match[2]);
    if (Number.isFinite(ms)) timings[match[1]] = ms;
  }
  return timings;
}

export function computeRecentOrderSpeed(entries, sampleSize = 5) {
  const measurements = (Array.isArray(entries) ? entries : [])
    .filter((item) => item?.kind === "paint" && Number.isFinite(item.visibleMs) && item.visibleMs >= 0)
    .slice(0, Math.max(1, sampleSize))
    .map((item) => item.visibleMs);
  if (!measurements.length) return null;
  const sorted = [...measurements].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { count: sorted.length, medianMs: median, fastestMs: sorted[0], slowestMs: sorted[sorted.length - 1] };
}

// A single opening can use a network request, an already pending request, or
// private page-local cache. Never show the previous opening's API timings
// alongside a new cache hit: that would make performance debugging misleading.
export function selectOpeningAttempt(entries) {
  const events = Array.isArray(entries) ? entries : [];
  // Entries are newest-first. Prefer the latest *start*: older asynchronous
  // requests may finish later, but must never become the displayed attempt.
  const newest = events.find((item) => item?.kind === "start" && item.attemptId != null)
    ?? events.find((item) => ["open", "paint"].includes(item?.kind) && item.attemptId != null);
  const attemptId = newest?.attemptId ?? null;
  const matching = (kind) => events.find((item) => item?.kind === kind && attemptId !== null && item.attemptId === attemptId);
  return { attemptId, latestPaint: matching("paint"), latestOpen: matching("open"), latestFetch: matching("fetch"), latestSource: matching("source") };
}

/** Count visible order *groups*, not component rows, across every server page. */
export function orderTypeKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function collectOrderTypeCounts(loadPage, { signal, maxPages = 500 } = {}) {
  const groups = new Map();
  let cursor = null;
  const cursors = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    if (signal?.aborted) throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
    const payload = await loadPage(cursor, signal);
    if (!payload || !Array.isArray(payload.items) || !payload.pageInfo) {
      throw new Error("Incomplete order count response.");
    }
    for (const item of payload.items) {
      // Each order can have many component records. Count it only once.
      const id = Number(item?.orderIdNumber ?? String(item?.orderId || "").replace(/^ORD-/i, ""));
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error("Order summary is missing a valid order number.");
      }
      const raw = String(item?.orderType || "").trim() || "Other";
      const key = orderTypeKey(raw) || "other";
      if (!groups.has(id)) groups.set(id, { key, raw, color: item?.orderTypeColor || "" });
    }
    if (!payload.pageInfo.hasMore) {
      const byType = new Map();
      for (const { key, raw, color } of groups.values()) {
        const old = byType.get(key) || { key, raw, color, count: 0 };
        old.count += 1;
        byType.set(key, old);
      }
      return { options: [...byType.values()].sort((a, b) => a.raw.localeCompare(b.raw)), total: groups.size };
    }
    const next = payload.pageInfo.nextCursor;
    if (next === null || next === undefined || next === "" || cursors.has(String(next)) || String(next) === String(cursor)) {
      throw new Error("Order count pagination did not advance.");
    }
    cursors.add(String(next));
    cursor = next;
  }
  throw new Error("Too many pages to count orders safely.");
}

// Page-local detail loader: coalesces clicks and intent prefetches, bounds the
// number of cached orders, and never shares private order payloads globally.
// Only the full details endpoint is used. Summary rows are never rendered as
// editable order details.
export function createOrderDetailsLoader({ endpoint, buildGroups, maxEntries = 12 }) {
  const ready = new Map();
  const pending = new Map();
  let epoch = 0;
  let hoverTimer = null;

  const keyFor = (group) => String(group?.key || group?.orderIdLabel || (group?.orderIds || []).join("|") || "").trim();
  const needsDetails = (group) => (Array.isArray(group?.items) ? group.items : []).some((item) => Boolean(item?.summaryOnly));

  async function get(group, { fresh = false } = {}) {
    if (!group) throw new Error("Select an order first.");
    if (!needsDetails(group)) return group;
    const key = keyFor(group);
    if (!key) throw new Error("Order identifier is missing.");
    if (!fresh && ready.has(key)) return ready.get(key);
    if (pending.has(key)) return pending.get(key);
    const startedEpoch = epoch;
    const promise = (async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds || [] }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(data?.error || "Failed to load order details.");
        error.status = response.status;
        throw error;
      }
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      const groups = buildGroups(rows);
      const detailed = groups.find((candidate) => candidate.key === group.key) || groups[0];
      if (!detailed) throw new Error("This order has no available details.");
      const result = { ...detailed, key: group.key };
      // A list refresh or successful mutation invalidates all earlier requests;
      // late responses must not repopulate the now-stale cache.
      if (startedEpoch === epoch) {
        ready.delete(key);
        ready.set(key, result);
        while (ready.size > maxEntries) ready.delete(ready.keys().next().value);
      }
      return result;
    })();
    pending.set(key, promise);
    try { return await promise; }
    finally { if (pending.get(key) === promise) pending.delete(key); }
  }

  function cancelPrefetch() {
    if (hoverTimer !== null) clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  function prefetch(group, { defer = false } = {}) {
    if (!group || !needsDetails(group)) return;
    if (ready.has(keyFor(group)) || pending.has(keyFor(group))) return;
    if (defer) {
      // Avoid firing expensive Supabase requests for every card the pointer
      // crosses while the user scrolls the page on a desktop.
      cancelPrefetch();
      hoverTimer = setTimeout(() => {
        hoverTimer = null;
        if (pending.size < 2) void get(group).catch(() => {});
      }, 150);
      return;
    }
    // Touch/focus intent is imminent; let the tap reuse this very request.
    if (pending.size < 2) void get(group).catch(() => {});
  }

  function clear() {
    cancelPrefetch();
    epoch += 1;
    ready.clear();
    pending.clear();
  }

  function isReady(group) { return Boolean(group) && (!needsDetails(group) || ready.has(keyFor(group))); }

  return { get, prefetch, cancelPrefetch, clear, keyFor, needsDetails, isReady };
}

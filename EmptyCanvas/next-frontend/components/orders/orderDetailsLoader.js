import { reportOrdersPerformance } from "./orderOpeningPerformance";

// Page-local detail loader: coalesces clicks and intent prefetches, bounds the
// number of cached orders, and never shares private order payloads globally.
// Only the full details endpoint is used. Summary rows are never rendered as
// editable order details.
export function createOrderDetailsLoader({ endpoint, buildGroups, maxEntries = 12, maxAgeMs = 45_000 }) {
  const ready = new Map();
  const pending = new Map();
  let epoch = 0;
  let hoverTimer = null;

  const keyFor = (group) => String(group?.key || group?.orderIdLabel || (group?.orderIds || []).join("|") || "").trim();
  const needsDetails = (group) => (Array.isArray(group?.items) ? group.items : []).some((item) => Boolean(item?.summaryOnly));

  async function get(group, { fresh = false } = {}) {
    // A real click takes priority over any delayed hover prefetch.
    cancelPrefetch();
    if (!group) throw new Error("Select an order first.");
    if (!needsDetails(group)) return group;
    const key = keyFor(group);
    if (!key) throw new Error("Order identifier is missing.");
    const cached = ready.get(key);
    if (!fresh && cached && cached.expiresAt > Date.now()) {
      // LRU: recently accessed orders stay in the small page-local cache.
      ready.delete(key);
      ready.set(key, cached);
      return cached.value;
    }
    if (cached) ready.delete(key);
    if (pending.has(key)) return pending.get(key);
    const startedEpoch = epoch;
    const promise = (async () => {
      const measure = typeof performance !== "undefined" && typeof performance.now === "function"
        ? () => performance.now() : () => Date.now();
      const fetchStarted = measure();
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds || [] }),
      });
      const responseReceived = measure();
      const data = await response.json().catch(() => null);
      const parsedAt = measure();
      // Opt-in diagnostics: add ?ordersPerf=1 to the orders page URL.
      // No order IDs, school names or private payloads are written to the console.
      const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ordersPerf") === "1";
      const reportTiming = (buildMs = null) => {
        if (!debug) return;
        reportOrdersPerformance({
          kind: "fetch",
          endpoint: endpoint.split("/").slice(-2).join("/"),
          networkMs: Math.round(responseReceived - fetchStarted),
          parseMs: Math.round(parsedAt - responseReceived),
          ...(buildMs === null ? {} : { groupMs: Math.round(buildMs) }),
          serverTiming: response.headers.get("server-timing") || "unavailable",
          status: response.status,
        });
      };
      if (!response.ok) {
        reportTiming();
        const error = new Error(data?.error || "Failed to load order details.");
        error.status = response.status;
        throw error;
      }
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      const groups = buildGroups(rows);
      reportTiming(measure() - parsedAt);
      const detailed = groups.find((candidate) => candidate.key === group.key) || groups[0];
      if (!detailed) throw new Error("This order has no available details.");
      const result = { ...detailed, key: group.key };
      // A list refresh or successful mutation invalidates all earlier requests;
      // late responses must not repopulate the now-stale cache.
      if (startedEpoch === epoch) {
        ready.delete(key);
        ready.set(key, { value: result, expiresAt: Date.now() + maxAgeMs });
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
    if (isReady(group) || pending.has(keyFor(group))) return;
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
    // Keyboard focus intent is imminent; let the click reuse this request.
    if (pending.size < 2) void get(group).catch(() => {});
  }

  function clear() {
    cancelPrefetch();
    epoch += 1;
    ready.clear();
    pending.clear();
  }

  function isReady(group) {
    if (!group) return false;
    if (!needsDetails(group)) return true;
    const cached = ready.get(keyFor(group));
    return Boolean(cached && cached.expiresAt > Date.now());
  }

  return { get, prefetch, cancelPrefetch, clear, keyFor, needsDetails, isReady };
}

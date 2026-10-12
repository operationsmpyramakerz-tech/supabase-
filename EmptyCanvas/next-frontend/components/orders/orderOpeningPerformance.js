// Client-only helpers shared by the four order screens.
// Warming the modal downloads *code only*; never prefetches private order data.
const PERF_EVENT = "pyramakerz:orders-performance";
const PERF_TOGGLE_EVENT = "pyramakerz:orders-performance-toggle";
const PERF_SESSION_KEY = "pyramakerz:orders-performance-enabled";
const visibleTimers = new Map();

const now = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

// The URL parameter remains supported, but a one-tap toggle is more reliable
// on mobile and survives client-side navigation between order screens.
export function ordersPerfEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("ordersPerf") === "1") return true;
    return window.sessionStorage.getItem(PERF_SESSION_KEY) === "1";
  } catch {
    return new URLSearchParams(window.location.search).get("ordersPerf") === "1";
  }
}

export function setOrdersPerfEnabled(active) {
  if (typeof window === "undefined") return;
  const enabled = Boolean(active);
  try {
    if (enabled) window.sessionStorage.setItem(PERF_SESSION_KEY, "1");
    else window.sessionStorage.removeItem(PERF_SESSION_KEY);
  } catch { /* private browsing may disable storage */ }
  const url = new URL(window.location.href);
  if (enabled) url.searchParams.set("ordersPerf", "1");
  else url.searchParams.delete("ordersPerf");
  // Retain tab/type/query/hash; do not navigate or refresh the order list.
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (!enabled) visibleTimers.clear();
  window.dispatchEvent(new CustomEvent(PERF_TOGGLE_EVENT, { detail: { enabled } }));
}

export const ORDERS_PERF_TOGGLE_EVENT = PERF_TOGGLE_EVENT;

// Measures click -> first painted order details, not just API + import time.
// No order IDs, names, products, or response payloads are stored.
export function markOrderOpenStarted(page) {
  if (ordersPerfEnabled()) visibleTimers.set(page, now());
}

export function cancelOrderOpenTimer(page) {
  visibleTimers.delete(page);
}

export function reportOrderVisibleAfterPaint(page) {
  if (!ordersPerfEnabled() || !visibleTimers.has(page) || typeof window === "undefined") return () => {};
  let firstFrame = 0;
  let secondFrame = 0;
  firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(() => {
      const started = visibleTimers.get(page);
      if (started === undefined) return;
      visibleTimers.delete(page);
      reportOrdersPerformance({ kind: "paint", page, visibleMs: Math.round(now() - started) });
    });
  });
  return () => {
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(secondFrame);
  };
}

export function reportOrdersPerformance(record) {
  if (!ordersPerfEnabled()) return;
  // Only anonymous durations, status and an endpoint category; never order IDs
  // or payloads. The custom event also allows diagnostics on mobile devices.
  console.info("[Orders Performance]", record);
  window.dispatchEvent(new CustomEvent(PERF_EVENT, { detail: record }));
}

export const ORDERS_PERF_EVENT = PERF_EVENT;

export function warmOrderModalOnIdle(loadModal, { delayMs = 1800 } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const connection = navigator?.connection;
  // Respect users who ask the browser to conserve mobile data.
  if (connection?.saveData || /(^|-)2g$/i.test(connection?.effectiveType || "")) return () => {};

  let timeoutId = null;
  let idleId = null;
  let stopped = false;
  const warm = () => {
    if (stopped || document.visibilityState === "hidden") return;
    // Import promises are deduplicated by the module loader. Swallow failures:
    // a later real click should still retry and show the existing error UI.
    void Promise.resolve().then(loadModal).catch(() => {});
  };
  timeoutId = window.setTimeout(() => {
    timeoutId = null;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(warm, { timeout: 4500 });
    } else {
      warm();
    }
  }, delayMs);
  return () => {
    stopped = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    if (idleId !== null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
  };
}

export async function loadOrderAndModalWithMetrics({ page, loadDetails, loadModal }) {
  const start = now();
  let detailsMs = null;
  let modalMs = null;
  let detailReady = false;
  let modalReady = false;
  const details = Promise.resolve().then(loadDetails).then((value) => {
    detailReady = true;
    detailsMs = now() - start;
    return value;
  });
  const modal = Promise.resolve().then(loadModal).then((value) => {
    modalReady = true;
    modalMs = now() - start;
    return value;
  });
  try {
    const [detail] = await Promise.all([details, modal]);
    reportOrdersPerformance({
      kind: "open", page, detailsMs: Math.round(detailsMs), modalMs: Math.round(modalMs),
      readyMs: Math.round(now() - start),
    });
    return detail;
  } catch (error) {
    reportOrdersPerformance({
      kind: "open", page, detailsMs: detailsMs === null ? null : Math.round(detailsMs),
      modalMs: modalMs === null ? null : Math.round(modalMs),
      readyMs: Math.round(now() - start), failed: true,
      detailReady, modalReady,
    });
    throw error;
  }
}

// Client-only helpers shared by the four order screens.
// Warming the modal downloads *code only*; never prefetches private order data.
const PERF_EVENT = "pyramakerz:orders-performance";

const now = () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now());

export function ordersPerfEnabled() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ordersPerf") === "1";
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

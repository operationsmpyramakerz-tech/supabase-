"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SYSTEM_NOTIFICATION_EVENT = "pyramakerz:system-notification";
const SYSTEM_NOTIFICATION_UNDO_EVENT = "pyramakerz:system-notification-undo";
const DEFAULT_DURATION = 4700;
const SWIPE_DISMISS_DISTANCE = 46;
const SWIPE_DISMISS_DURATION = 180;

const LEGACY_NOTICE_SELECTOR = [
  ".next-toast",
  ".next-proposals-toast",
  ".backup-toast",
  ".next-expense-users-toast",
  ".next-history-toast",
  ".event-team-toast",
  ".next-b2c-toast",
  ".next-b2c-forms-toast",
  ".next-b2c-table-toast",
  ".receipt-viewer-toast",
  ".orders-parity-success",
  ".orders-success-notice",
  ".classic-cart-toast",
  ".account-saved-island",
  ".account-classic-toast .toast",
  ".kpis-toast",
  ".next-app-install-notice",
  ".next-notifications-warning.is-error",
  ".next-notifications-push small",
  ".event-team-public-message",
].join(",");

function cleanText(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function noticeTypeFromNode(node) {
  const classes = cleanText(node?.className).toLowerCase();
  const content = cleanText(node?.textContent).toLowerCase();
  if (/error|danger|failed|failure/.test(`${classes} ${content}`)) return "error";
  if (/warning|warn|blocked|unavailable/.test(`${classes} ${content}`)) return "warning";
  if (/success|saved|updated|created|deleted|removed|downloaded|copied|enabled|disabled|approved|archived|restored|submitted/.test(`${classes} ${content}`)) return "success";
  return "info";
}

function defaultTitle(type, message) {
  const value = cleanText(message).toLowerCase();
  if (/delete|deleted|removed/.test(value)) return "Deleted";
  if (/download|downloaded|export/.test(value)) return "Downloaded";
  if (/copied|clipboard/.test(value)) return "Copied";
  if (/saved|updated|created|submitted/.test(value)) return "Saved";
  if (/archive|archived|restored|moved/.test(value)) return "Updated";
  if (/enabled|disabled/.test(value)) return "Updated";
  if (type === "error") return "Action failed";
  if (type === "warning") return "Notice";
  if (type === "success") return "Done";
  return "Info";
}

function extractLegacyNotice(node) {
  if (!(node instanceof Element)) return null;
  const type = noticeTypeFromNode(node);
  const raw = cleanText(node.textContent)
    .replace(/^([✓✔!i]\s*)+/i, "")
    .replace(/\s*[×✕]\s*$/g, "")
    .trim();
  if (!raw) return null;

  const titleElement = node.querySelector(".toast__title, .kpis-toast__body strong, strong");
  const detailElement = node.querySelector(".toast__msg, .kpis-toast__body p, small");
  const nestedDetail = detailElement || node.querySelector("div > span");

  let title = cleanText(titleElement?.textContent);
  let message = cleanText(nestedDetail?.textContent);

  if (titleElement && titleElement.parentElement === node && !message) {
    message = title;
    title = "";
  }

  if (title && message && title === message) message = "";
  if (!message) {
    const withoutTitle = title ? cleanText(raw.replace(title, "")) : raw;
    message = withoutTitle || title || raw;
    if (message === title) title = "";
  }

  if (!title) title = defaultTitle(type, message);

  return { type, title, message, duration: DEFAULT_DURATION };
}

function SystemIslandIcon({ type, title, message }) {
  const text = `${title || ""} ${message || ""}`.toLowerCase();
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (/delete|deleted|removed/.test(text)) {
    return <svg {...common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M8 6V4h8v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
  }
  if (type === "error") {
    return <svg {...common}><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>;
  }
  if (type === "warning") {
    return <svg {...common}><path d="M10.3 3.6 2.4 17.3A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.7L13.7 3.6a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  }
  if (type === "success") {
    return <svg {...common}><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16.5 9.5"/></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
}

export function showSystemNotification(payload) {
  if (typeof window === "undefined") return;
  const detail = typeof payload === "string" ? { message: payload } : (payload || {});
  window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATION_EVENT, { detail }));
}

export default function SystemNotificationIsland() {
  const [notice, setNotice] = useState(null);
  const [undoing, setUndoing] = useState(false);
  const timerRef = useRef(null);
  const seenRef = useRef(new WeakMap());
  const alertRef = useRef(null);
  const islandRef = useRef(null);
  const swipeCleanupTimerRef = useRef(null);
  const dragRef = useRef({ active: false, pointerId: null, startY: 0, lastY: 0 });

  const clearNoticeTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const resetDragVisuals = useCallback(() => {
    const node = islandRef.current;
    if (!node) return;
    node.classList.remove("is-dragging", "is-snap-back", "is-swipe-dismissed");
    node.style.removeProperty("--system-island-drag-y");
  }, []);

  const dismiss = useCallback(() => {
    clearNoticeTimer();
    if (swipeCleanupTimerRef.current) window.clearTimeout(swipeCleanupTimerRef.current);
    swipeCleanupTimerRef.current = null;
    dragRef.current = { active: false, pointerId: null, startY: 0, lastY: 0 };
    setUndoing(false);
    setNotice(null);
  }, [clearNoticeTimer]);

  const dismissWithSwipe = useCallback(() => {
    const node = islandRef.current;
    clearNoticeTimer();
    dragRef.current.active = false;
    if (!node) {
      dismiss();
      return;
    }
    node.classList.remove("is-dragging", "is-snap-back");
    node.classList.add("is-swipe-dismissed");
    swipeCleanupTimerRef.current = window.setTimeout(() => {
      swipeCleanupTimerRef.current = null;
      setUndoing(false);
      setNotice(null);
    }, SWIPE_DISMISS_DURATION + 40);
  }, [clearNoticeTimer, dismiss]);

  const pushNotice = useCallback((payload = {}) => {
    const type = ["success", "error", "warning", "info"].includes(payload.type) ? payload.type : "info";
    const message = cleanText(payload.message || payload.text || payload.detail || payload.title);
    if (!message) return;
    const title = cleanText(payload.title) || defaultTitle(type, message);
    const duration = Math.max(2200, Number(payload.duration) || DEFAULT_DURATION);
    const onUndo = typeof payload.onUndo === "function"
      ? payload.onUndo
      : (typeof payload.undo === "function" ? payload.undo : null);
    const undoLabel = cleanText(payload.undoLabel) || "Undo";

    clearNoticeTimer();
    if (swipeCleanupTimerRef.current) window.clearTimeout(swipeCleanupTimerRef.current);
    swipeCleanupTimerRef.current = null;
    resetDragVisuals();
    setUndoing(false);
    setNotice({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      title,
      message,
      duration,
      onUndo,
      undoLabel,
      undoData: payload.undoData ?? null,
    });
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setNotice(null);
    }, duration + 120);
  }, [clearNoticeTimer, resetDragVisuals]);

  const handleUndo = useCallback(async () => {
    if (!notice || undoing) return;
    clearNoticeTimer();
    setUndoing(true);

    try {
      if (typeof notice.onUndo === "function") {
        await notice.onUndo(notice);
      } else {
        window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATION_UNDO_EVENT, {
          detail: {
            id: notice.id,
            type: notice.type,
            title: notice.title,
            message: notice.message,
            undoData: notice.undoData,
          },
        }));
      }
    } finally {
      dismiss();
    }
  }, [clearNoticeTimer, dismiss, notice, undoing]);

  const handlePointerDown = useCallback((event) => {
    if (!notice || undoing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;

    const node = islandRef.current;
    if (!node) return;

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
    };
    node.classList.remove("is-snap-back", "is-swipe-dismissed");
    node.classList.add("is-dragging");
    node.style.setProperty("--system-island-drag-y", "0px");
    try { node.setPointerCapture(event.pointerId); } catch {}
  }, [notice, undoing]);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const node = islandRef.current;
    if (!node) return;

    drag.lastY = event.clientY;
    const rawDelta = event.clientY - drag.startY;
    const delta = rawDelta <= 0 ? rawDelta : Math.min(12, rawDelta * 0.18);
    node.style.setProperty("--system-island-drag-y", `${delta}px`);
  }, []);

  const finishPointerGesture = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const node = islandRef.current;
    if (!node) return;

    const delta = drag.lastY - drag.startY;
    dragRef.current = { active: false, pointerId: null, startY: 0, lastY: 0 };
    try { node.releasePointerCapture(event.pointerId); } catch {}

    if (delta <= -SWIPE_DISMISS_DISTANCE) {
      dismissWithSwipe();
      return;
    }

    node.classList.remove("is-dragging");
    node.classList.add("is-snap-back");
    node.style.setProperty("--system-island-drag-y", "0px");
    window.setTimeout(() => {
      node.classList.remove("is-snap-back");
    }, 190);
  }, [dismissWithSwipe]);

  useEffect(() => {
    const handleEvent = (event) => pushNotice(event?.detail || {});
    window.addEventListener(SYSTEM_NOTIFICATION_EVENT, handleEvent);

    const previousAlert = window.alert;
    const islandAlert = (message) => pushNotice({ type: "info", title: "Info", message: cleanText(message) || "Notification" });
    alertRef.current = islandAlert;
    window.alert = islandAlert;

    const capture = (candidate) => {
      if (!(candidate instanceof Element)) return;
      if (candidate.closest(".system-notification-island, .classic-cart-order-confirmation")) return;
      const fingerprint = `${candidate.className || ""}|${cleanText(candidate.textContent)}`;
      if (!fingerprint || seenRef.current.get(candidate) === fingerprint) return;
      const parsed = extractLegacyNotice(candidate);
      if (!parsed) return;
      seenRef.current.set(candidate, fingerprint);
      candidate.dataset.systemIslandBridged = "true";
      candidate.style.setProperty("display", "none", "important");
      pushNotice(parsed);
    };

    const inspect = (target) => {
      const element = target instanceof Element ? target : target?.parentElement;
      if (!element) return;
      const closest = element.closest?.(LEGACY_NOTICE_SELECTOR);
      if (closest) capture(closest);
      if (element.matches?.(LEGACY_NOTICE_SELECTOR)) capture(element);
      element.querySelectorAll?.(LEGACY_NOTICE_SELECTOR).forEach(capture);
    };

    inspect(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          inspect(mutation.target);
          return;
        }
        mutation.addedNodes.forEach(inspect);
        inspect(mutation.target);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      window.removeEventListener(SYSTEM_NOTIFICATION_EVENT, handleEvent);
      if (window.alert === alertRef.current) window.alert = previousAlert;
      clearNoticeTimer();
      if (swipeCleanupTimerRef.current) window.clearTimeout(swipeCleanupTimerRef.current);
    };
  }, [clearNoticeTimer, pushNotice]);

  if (!notice || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={islandRef}
      key={notice.id}
      className={`system-notification-island is-${notice.type}${undoing ? " is-undoing" : ""}`}
      style={{ "--system-island-duration": `${notice.duration}ms` }}
      role="status"
      aria-live={notice.type === "error" ? "assertive" : "polite"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerGesture}
      onPointerCancel={finishPointerGesture}
    >
      <svg className="system-notification-island__progress" viewBox="0 0 500 92" preserveAspectRatio="none" aria-hidden="true">
        <rect className="system-notification-island__track" x="3" y="3" width="494" height="86" rx="43" pathLength="100" />
        <rect className="system-notification-island__line" x="3" y="3" width="494" height="86" rx="43" pathLength="100" />
      </svg>
      <span className="system-notification-island__icon"><SystemIslandIcon type={notice.type} title={notice.title} message={notice.message} /></span>
      <span className="system-notification-island__copy">
        <strong>{notice.title}</strong>
        <small>{notice.message}</small>
      </span>
      <button
        className="system-notification-island__undo"
        type="button"
        onClick={handleUndo}
        disabled={undoing}
        aria-label={notice.undoLabel}
      >
        {undoing ? "..." : notice.undoLabel}
      </button>
    </div>,
    document.body,
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  modernNotificationUrl,
  notificationText,
  notificationTimeAgo,
  notificationTone,
} from "./notification-utils";

// Notification titles can contain confidential work details. Do not cache them
// in browser storage that persists across ERP user sign-outs/account switches.
const BELL_REQUEST_MIN_INTERVAL_MS = 12_000;
let lastBackgroundScanAt = 0;

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false || body?.ok === false) {
    throw new Error(notificationText(body?.error || body?.message) || `Request failed with ${response.status}.`);
  }
  return body;
}

function triggerBackgroundNotificationScan() {
  const now = Date.now();
  if (now - lastBackgroundScanAt < 2 * 60 * 1000) return Promise.resolve(null);
  lastBackgroundScanAt = now;
  return fetch(`/next/api/notifications/refresh?limit=12&_=${now}`, {
    credentials: "include", cache: "no-store",
  }).catch(() => null);
}

export default function NotificationsBell({ classic = false }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const lastLoadedAtRef = useRef(0);
  const loadPromiseRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState({});

  const preview = useMemo(() => items.slice(0, 5), [items]);

  async function load({ quiet = false, force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastLoadedAtRef.current < BELL_REQUEST_MIN_INTERVAL_MS) return null;
    if (loadPromiseRef.current) return await loadPromiseRef.current;

    if (!quiet) setLoading(true);
    const pending = (async () => {
      try {
        const body = await requestJson(`/next/api/notifications?limit=12`);
        const nextItems = Array.isArray(body?.items) ? body.items : [];
        const nextUnread = Number(body?.unreadCount) || nextItems.filter((item) => !item?.read).length;
        setItems(nextItems);
        setUnreadCount(nextUnread);
        lastLoadedAtRef.current = Date.now();
        setError("");

        triggerBackgroundNotificationScan().then(async (response) => {
          if (!response?.ok) return;
          try {
            const updated = await requestJson(`/next/api/notifications?limit=12&fresh=1`);
            const updatedItems = Array.isArray(updated?.items) ? updated.items : [];
            const updatedUnread = Number(updated?.unreadCount) || updatedItems.filter((item) => !item?.read).length;
            setItems(updatedItems);
            setUnreadCount(updatedUnread);
            lastLoadedAtRef.current = Date.now();
          } catch {}
        });
        return body;
      } catch (loadError) {
        if (!quiet) setError(loadError.message || "Could not load notifications.");
        return null;
      } finally {
        if (!quiet) setLoading(false);
      }
    })();

    loadPromiseRef.current = pending;
    try {
      return await pending;
    } finally {
      if (loadPromiseRef.current === pending) loadPromiseRef.current = null;
    }
  }

  useEffect(() => {
    // Discard notification previews saved by older versions. They were not
    // account-scoped and should not survive a user switch on a shared phone.
    try { window.sessionStorage.removeItem("ops.notifications.bell-cache.v1"); } catch {}
    load();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load({ quiet: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  useEffect(() => {
    function closeOutside(event) {
      if (rootRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function closeEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  useEffect(() => {
    if (!classic || !open) return undefined;

    let frame = 0;
    function positionPanel() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const button = rootRef.current?.querySelector?.(".notif-bell-btn");
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const top = Math.round(rect.bottom + 12);
        const right = Math.max(14, Math.round(window.innerWidth - rect.right));
        const maxHeight = Math.max(240, Math.round(window.innerHeight - top - 16));
        setPanelStyle({ top: `${top}px`, right: `${right}px`, left: "auto", maxHeight: `${maxHeight}px` });
      });
    }

    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [classic, open]);

  async function markRead(item) {
    const id = notificationText(item?.id);
    if (!id || item?.read) return;
    const nextItems = items.map((row) => String(row?.id) === id ? { ...row, read: true } : row);
    const nextUnread = Math.max(0, unreadCount - 1);
    setItems(nextItems);
    setUnreadCount(nextUnread);
    try {
      await requestJson("/next/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    } catch {
      load({ quiet: true });
    }
  }

  async function markAllRead() {
    if (!unreadCount) return;
    const previous = items;
    const previousCount = unreadCount;
    const nextItems = items.map((item) => ({ ...item, read: true }));
    setItems(nextItems);
    setUnreadCount(0);
    try {
      await requestJson("/next/api/notifications/read-all", {
        method: "POST",
        body: "{}",
      });
    } catch {
      setItems(previous);
      setUnreadCount(previousCount);
    }
  }

  async function openItem(item) {
    await markRead(item);
    setOpen(false);
    const target = modernNotificationUrl(item?.url);
    if (!target) return;
    if (target.startsWith("/")) {
      const clientRoute = target === "/next"
        ? "/"
        : target.startsWith("/next/")
          ? target.slice(5) || "/"
          : target;
      router.push(clientRoute);
      return;
    }
    window.location.href = target;
  }

  if (classic) {
    const panel = open ? (
      <section
        ref={panelRef}
        className="notif-panel notif-panel--portal is-open"
        aria-label="Notifications preview"
        style={panelStyle}
      >
        <div className="notif-center-shell">
          <div className="notif-center-card">
            <div className="notif-center-head">
              <div className="notif-center-title">Notifications</div>
              <button type="button" className="notif-center-markall" onClick={markAllRead} disabled={!unreadCount}>Mark all read</button>
            </div>

            <div className="notif-center-tabs" role="tablist" aria-label="Notification filters">
              <button type="button" className="notif-tab is-active" role="tab" aria-selected="true">Today</button>
              <button type="button" className="notif-tab" role="tab" aria-selected="false">This Week</button>
              <button type="button" className="notif-tab" role="tab" aria-selected="false">Earlier</button>
            </div>

            <div className="notif-panel__list">
              {loading && !items.length ? <div className="notif-empty">Loading…</div> : null}
              {error && !items.length ? <div className="notif-empty">{error}</div> : null}
              {!loading && !error && !items.length ? <div className="notif-empty">No notifications yet.</div> : null}
              {preview.map((item) => (
                <button
                  type="button"
                  className={`notif-row ${item?.read ? "" : "is-unread"}`}
                  key={notificationText(item?.id) || `${item?.title}-${item?.ts}`}
                  onClick={() => openItem(item)}
                >
                  <span className="notif-row__ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
                  </span>
                  <span className="notif-row__content">
                    <span className="notif-row__title">{notificationText(item?.title) || "Notification"}<span className={`notif-dot ${item?.read ? "is-hidden" : ""}`} /></span>
                    <span className="notif-row__body">{notificationText(item?.body) || "Open this update for details."}</span>
                  </span>
                  <time className="notif-row__time">{notificationTimeAgo(item?.ts)}</time>
                </button>
              ))}
            </div>

            <div className="notif-center-footer">
              <Link className="notif-center-seeall" href="/notifications" prefetch={true}>See All</Link>
            </div>
          </div>
        </div>
      </section>
    ) : null;

    return (
      <>
        <div className="notif-wrap" ref={rootRef}>
          <button
            type="button"
            className="notif-bell-btn"
            aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
            aria-expanded={open}
            onClick={() => {
              const nextOpen = !open;
              setOpen(nextOpen);
              if (nextOpen) load({ quiet: items.length > 0 });
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            {unreadCount > 0 ? <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
          </button>
        </div>
        {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
      </>
    );
  }

  return (
    <div className="next-notif-bell" ref={rootRef}>
      <button
        type="button"
        className={`next-notif-bell__button ${open ? "is-open" : ""}`}
        aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) load({ quiet: items.length > 0 });
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        {unreadCount > 0 ? <span>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {open ? (
        <section className="next-notif-bell__panel" aria-label="Notifications preview">
          <header>
            <div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread` : "All caught up"}</span></div>
            <button type="button" onClick={markAllRead} disabled={!unreadCount}>Mark all read</button>
          </header>

          <div className="next-notif-bell__list">
            {loading && !items.length ? <div className="next-notif-bell__state">Loading notifications…</div> : null}
            {error && !items.length ? <div className="next-notif-bell__state is-error">{error}<button type="button" onClick={() => load()}>Retry</button></div> : null}
            {!loading && !error && !items.length ? <div className="next-notif-bell__state"><b>Nothing new</b><span>Your updates will appear here.</span></div> : null}
            {preview.map((item) => {
              const tone = notificationTone(item);
              return (
                <button
                  type="button"
                  className={`next-notif-bell__row ${item?.read ? "" : "is-unread"}`}
                  key={notificationText(item?.id) || `${item?.title}-${item?.ts}`}
                  onClick={() => openItem(item)}
                >
                  <span className={`next-notif-icon is-${tone.key}`}>{tone.label}</span>
                  <span><strong>{notificationText(item?.title) || "Notification"}</strong><small>{notificationText(item?.body) || "Open this update for details."}</small></span>
                  <time>{notificationTimeAgo(item?.ts)}</time>
                </button>
              );
            })}
          </div>

          <footer>
            <a href="/next/notifications">Open notification center</a>
            <button type="button" onClick={() => load()}>Refresh</button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

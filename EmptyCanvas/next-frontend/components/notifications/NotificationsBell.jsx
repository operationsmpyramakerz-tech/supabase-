"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  modernNotificationUrl,
  notificationText,
  notificationTimeAgo,
  notificationTone,
} from "./notification-utils";

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

export default function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);

  const preview = useMemo(() => items.slice(0, 7), [items]);

  async function load({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    try {
      const body = await requestJson(`/api/notifications?limit=12&_=${Date.now()}`);
      const nextItems = Array.isArray(body?.items) ? body.items : [];
      setItems(nextItems);
      setUnreadCount(Number(body?.unreadCount) || nextItems.filter((item) => !item?.read).length);
      setError("");
    } catch (loadError) {
      if (!quiet) setError(loadError.message || "Could not load notifications.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, 45000);
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
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
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

  async function markRead(item) {
    const id = notificationText(item?.id);
    if (!id || item?.read) return;
    setItems((current) => current.map((row) => String(row?.id) === id ? { ...row, read: true } : row));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await requestJson("/api/notifications/read", {
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
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      await requestJson("/api/notifications/read-all", { method: "POST", body: "{}" });
    } catch {
      setItems(previous);
      setUnreadCount(previousCount);
    }
  }

  async function openItem(item) {
    await markRead(item);
    setOpen(false);
    const target = modernNotificationUrl(item?.url);
    if (target) window.location.href = target;
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

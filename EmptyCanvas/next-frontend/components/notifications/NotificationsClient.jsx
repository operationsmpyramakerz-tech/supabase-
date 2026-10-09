"use client";

import { useEffect, useMemo, useState } from "react";
import { navigateWithinApp } from "../../lib/client-navigation";
import { deliveryLabel } from "../../lib/notification-delivery-utils";
import "./notifications-center.css";
import {
  groupNotificationRows,
  modernNotificationUrl,
  notificationDateTime,
  notificationScope,
  notificationText,
  notificationTimeAgo,
  notificationTimestamp,
  notificationTone,
} from "./notification-utils";


function NotificationGlyph({ toneKey = "general" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    order: <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></>,
    maintenance: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/></>,
    expense: <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></>,
    stock: <><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></>,
    task: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    event: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="m9 16 2 2 4-4"/></>,
    test: <><path d="M9 3h6"/><path d="M10 3v5.5L5.5 17a2.5 2.5 0 0 0 2.2 3.7h8.6a2.5 2.5 0 0 0 2.2-3.7L14 8.5V3"/><path d="M8 15h8"/></>,
    general: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  };
  return <svg {...common}>{paths[toneKey] || paths.general}</svg>;
}

function FilterGlyph() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/></svg>;
}

// Custom, keyboard-accessible dropdowns keep the filter sheet consistent across
// Android, iOS and desktop instead of opening each platform's native picker.
function NotificationFilterDropdown({ id, label, value, options, open, onToggle, onSelect }) {
  const selected = options.find((option) => option.value === value) || options[0];
  const labelId = `notification-filter-${id}-label`;
  const buttonId = `notification-filter-${id}-button`;
  const menuId = `notification-filter-${id}-options`;

  return (
    <div className="next-notifications-filter-field" onKeyDown={(event) => {
      if (open && event.key === "Escape") {
        event.stopPropagation();
        onToggle(false);
        event.currentTarget.querySelector(".next-notifications-filter-select__trigger")?.focus();
      }
    }}>
      <span id={labelId}>{label}</span>
      <div className={`next-notifications-filter-select${open ? " is-open" : ""}`}>
        <button
          id={buttonId}
          type="button"
          className="next-notifications-filter-select__trigger"
          aria-labelledby={`${labelId} ${buttonId}`}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => onToggle(!open)}
        >
          <span>{selected.label}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {open ? (
          <div id={menuId} className="next-notifications-filter-select__options" role="group" aria-labelledby={labelId}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`next-notifications-filter-select__option${value === option.value ? " is-selected" : ""}`}
                aria-pressed={value === option.value}
                onClick={() => {
                  onSelect(option.value);
                  onToggle(false);
                  document.getElementById(buttonId)?.focus();
                }}
              >
                <span>{option.label}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  if (!response.ok || body?.success === false || body?.ok === false) {
    throw new Error(notificationText(body?.error || body?.message) || `Request failed with ${response.status}.`);
  }
  return body;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

// Do not wait for serviceWorker.ready before attempting registration: on a new
// installation it may never resolve unless someone registers the worker first.
async function activePushWorker() {
  const container = navigator.serviceWorker;
  let registration = await container.getRegistration("/");
  if (!registration) registration = await container.register("/service-worker.js", { scope: "/" });
  let timer;
  try {
    return await Promise.race([
      container.ready,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Service Worker did not become ready. Refresh the PWA and try again.")), 12000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function matchesVapidKey(subscription, publicKey) {
  const stored = subscription?.options?.applicationServerKey;
  if (!stored) return true; // Some browsers do not expose this field.
  const expected = urlBase64ToUint8Array(publicKey);
  const actual = new Uint8Array(stored);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

function pushFailureMessage(push) {
  if (push?.code === "missing-public-key" || push?.code === "missing-private-key" || push?.code === "missing-subject") return push.error;
  if (push?.code === "mismatched-key-pair" || push?.code?.startsWith("invalid-")) return push.error;
  if (push?.code === "push-authorization-failed" || push?.code === "expired-subscriptions") return push.error;
  if (push?.error === "No subscriptions") return "Enable Push on this device first";
  if (push?.error === "Subscriptions unavailable") return "Could not load device subscriptions";
  return push?.error || "";
}

function PushSettings() {
  const [status, setStatus] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [serverIssue, setServerIssue] = useState("");

  async function inspect() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    try {
      const keyPayload = await requestJson("/next/api/push/vapid-public-key");
      const key = notificationText(keyPayload?.publicKey);
      setPublicKey(key);
      setServerIssue(notificationText(keyPayload?.message));
      if (!keyPayload?.enabled || !key) {
        setStatus("server-disabled");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("blocked");
        return;
      }
      const registration = await activePushWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && !matchesVapidKey(subscription, key)) {
        setStatus("outdated");
        return;
      }
      // A shared device can change accounts. Rebind its existing endpoint to
      // the currently authenticated member whenever the settings are opened.
      if (subscription && Notification.permission === "granted") {
        await requestJson("/next/api/push/subscribe", {
          method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
      }
      setStatus(subscription ? "on" : "off");
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Push status could not be checked.");
      setStatus("error");
    }
  }

  useEffect(() => { inspect(); }, []);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      if (!publicKey) throw new Error("Push notifications are not configured on the server.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        throw new Error("Browser notification permission was not granted.");
      }
      const registration = await activePushWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !matchesVapidKey(subscription, publicKey)) {
        // An old browser subscription is still bound to an earlier VAPID pair.
        // Remove the stale endpoint before registering the replacement.
        await requestJson("/next/api/push/unsubscribe", {
          method: "POST", body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await requestJson("/next/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription: subscription.toJSON ? subscription.toJSON() : subscription }),
      });
      setStatus("on");
      setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setMessage(error.message || "Push notifications could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await activePushWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await requestJson("/next/api/push/unsubscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
      setMessage("Push notifications are disabled on this device.");
    } catch (error) {
      setMessage(error.message || "Push notifications could not be disabled.");
    } finally {
      setBusy(false);
    }
  }

  const labels = {
    checking: ["Checking", "Reviewing this browser and server configuration."],
    unsupported: ["Not supported", "This browser or device does not support web push notifications."],
    "server-disabled": ["Server setup required", serverIssue || "Review VAPID settings in Vercel."],
    outdated: ["Reconnect this device", "This browser uses an old VAPID key. Reconnect to use the current server credentials."],
    blocked: ["Blocked by browser", "Allow notifications in the browser settings, then refresh this page."],
    on: ["Enabled", "This device can receive ERP push updates."],
    off: ["Disabled", "Enable push to receive updates outside the open browser tab."],
    error: ["Status unavailable", "The current push subscription could not be checked."],
  };
  const [title, description] = labels[status] || labels.error;

  return (
    <article className={`next-notifications-push is-${status}`}>
      <div className="next-notifications-push__mark">PS</div>
      <div><span>Device notifications</span><h3>{title}</h3><p>{description}</p>{message ? <small>{message}</small> : null}</div>
      {["off", "outdated"].includes(status) ? <button type="button" onClick={enable} disabled={busy}>{busy ? "Connecting…" : status === "outdated" ? "Reconnect push" : "Enable push"}</button> : null}
      {status === "on" ? <button type="button" className="is-danger" onClick={disable} disabled={busy}>{busy ? "Disabling…" : "Disable push"}</button> : null}
      {["checking", "error", "server-disabled", "blocked"].includes(status) ? <button type="button" onClick={inspect} disabled={busy}>Check again</button> : null}
    </article>
  );
}

function DeliveryHistory() {
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson("/next/api/notifications/delivery");
      setHistory(result);
    } catch (failure) {
      setError(failure.message || "Delivery records are temporarily unavailable.");
    } finally { setBusy(false); }
  }

  return (
    <details className="next-notifications-device next-notifications-delivery" onToggle={event => { if (event.currentTarget.open && !history && !busy) load(); }}>
      <summary><span>Delivery history</span><small>In-App · Push · Email · Last 30 events</small></summary>
      <div className="next-notifications-device__body">
        <div className="next-notifications-delivery__head">
          <p>Private delivery attempts for your account. Provider acceptance does not confirm that a message was read or received on a device.</p>
          <button type="button" onClick={load} disabled={busy}>{busy ? "Loading…" : "Refresh history"}</button>
        </div>
        {error ? <p className="next-notifications-delivery__error" role="alert">{error}</p> : null}
        {history && !history.installed ? <p className="next-notifications-delivery__empty">Delivery monitoring isn't installed yet. Apply the Phase 5 SQL migration, then try again. Existing notifications will continue working.</p> : null}
        {history?.installed ? (
          <>
            <div className="next-notifications-delivery__counts">
              <span><strong>{history.totals?.events || 0}</strong> Recent events</span>
              <span><strong>{history.totals?.accepted || 0}</strong> Processed</span>
              <span><strong>{history.totals?.retrying || 0}</strong> In progress</span>
              <span><strong>{history.totals?.failed || 0}</strong> Exhausted retries</span>
            </div>
            {history.rows?.length ? (
              <div className="next-notifications-delivery__list">
                {history.rows.map(entry => (
                  <article key={entry.id} className="next-notifications-delivery__row">
                    <div className="next-notifications-delivery__title">
                      <div><span>{entry.category}</span><h3>{entry.title}</h3></div>
                      <time title={notificationDateTime(entry.at)}>{notificationTimeAgo(entry.at)}</time>
                    </div>
                    <div className="next-notifications-delivery__channels">
                      {[["in_app", "In-App"], ["push", "Push"], ["email", "Email"]].map(([key, label]) => {
                        const attempt = entry.channels?.[key];
                        const outcome = attempt?.outcome || "pending";
                        return <div key={key} className={`next-notifications-delivery__channel is-${outcome}`}>
                          <strong>{label}</strong>
                          <span>{attempt ? deliveryLabel(key, outcome) : "Not recorded"}</span>
                          {attempt?.detail ? <small>{attempt.detail}</small> : null}
                          {attempt?.provider ? <small>{attempt.provider}</small> : null}
                        </div>;
                      })}
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="next-notifications-delivery__empty">No delivery events yet. New automated ERP events will appear here after they are processed.</p>}
            <p className="next-notifications-delivery__foot">Tracking begins after installing Phase 5. Attempts are retained for up to 90 days. Only your events are shown.</p>
          </>
        ) : null}
      </div>
    </details>
  );
}

export default function NotificationsClient({ initialItems = [], initialUnreadCount = 0, source = "", bootstrapWarnings = [] }) {
  const [items, setItems] = useState(Array.isArray(initialItems) ? initialItems : []);
  const [unreadCount, setUnreadCount] = useState(Number(initialUnreadCount) || 0);
  const [scope, setScope] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [readFilter, setReadFilter] = useState("all");
  const [groupSimilar, setGroupSimilar] = useState(true);
  const [openGroups, setOpenGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [message, setMessage] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  const typeOptions = useMemo(() => {
    const unique = new Map();
    items.forEach((item) => {
      const key = notificationText(item?.type).toLowerCase() || "general";
      if (!unique.has(key)) unique.set(key, notificationText(item?.type) || "General");
    });
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const counts = useMemo(() => {
    const result = { all: items.length, unread: 0, today: 0, week: 0, earlier: 0 };
    items.forEach((item) => {
      if (!item?.read) result.unread += 1;
      const bucket = notificationScope(item?.ts);
      result[bucket] += 1;
    });
    return result;
  }, [items]);

  const filtered = useMemo(() => {
    const result = items.filter((item) => {
      if (type !== "all" && (notificationText(item?.type).toLowerCase() || "general") !== type) return false;
      if (scope === "unread" && item?.read) return false;
      if (readFilter === "unread" && item?.read) return false;
      if (readFilter === "read" && !item?.read) return false;
      if (["today", "week", "earlier"].includes(scope) && notificationScope(item?.ts) !== scope) return false;
      return true;
    });
    result.sort((a, b) => sort === "oldest"
      ? notificationTimestamp(a?.ts) - notificationTimestamp(b?.ts)
      : notificationTimestamp(b?.ts) - notificationTimestamp(a?.ts));
    return result;
  }, [items, scope, type, sort, readFilter]);

  const groupedRows = useMemo(() => groupNotificationRows(filtered, groupSimilar), [filtered, groupSimilar]);
  const feedSections = useMemo(() => {
    const buckets = { today: [], week: [], earlier: [] };
    groupedRows.forEach((group) => {
      const bucket = notificationScope(group?.items?.[0]?.ts);
      (buckets[bucket] || buckets.earlier).push(group);
    });
    return [
      { key: "today", label: "Today", rows: buckets.today },
      { key: "week", label: "This Week", rows: buckets.week },
      { key: "earlier", label: "Earlier", rows: buckets.earlier },
    ].filter((section) => section.rows.length);
  }, [groupedRows]);
  const resetFilters = () => { setType("all"); setSort("newest"); setScope("all"); setReadFilter("all"); setGroupSimilar(true); };

  const activeAdvancedFilters = Number(type !== "all") + Number(readFilter !== "all") + Number(sort !== "newest") + Number(!groupSimilar);

  useEffect(() => {
    document.body.classList.toggle("notifications-filter-sheet-open", filterOpen);
    if (!filterOpen) {
      setOpenDropdown(null);
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("notifications-filter-sheet-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);


  async function refresh() {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      // The refresh endpoint processes the queue and returns the final feed.
      // Previously this action made an initial GET, a refresh and another GET.
      const body = await requestJson("/next/api/notifications/refresh?limit=80");
      const nextItems = Array.isArray(body?.items) ? body.items : [];
      const exactCount = Number(body?.unreadCount);
      setItems(nextItems);
      setUnreadCount(Number.isFinite(exactCount) && exactCount >= 0
        ? exactCount : nextItems.filter((item) => !item?.read).length);
    } catch (error) {
      setMessage(error.message || "Notifications could not be refreshed.");
    } finally {
      setLoading(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult("");
    try {
      const result = await requestJson("/next/api/notifications/test", { method: "POST", body: "{}" });
      const label = (sent, skipped) => sent ? "sent" : skipped ? "disabled/skipped" : "not delivered";
      const emailLabel = result.email?.ok
        ? `accepted by ${result.email?.provider === "gmail-smtp" ? "Gmail SMTP" : "Resend"}`
        : label(false, result.email?.skipped);
      const emailReasons = {
        "smtp-auth-failed": "Gmail sign-in failed; review SMTP_USER and the App Password in Vercel",
        "smtp-timeout": "Gmail did not respond; retry or check SMTP host/port",
        "smtp-connection-failed": "Could not connect to the SMTP server",
        "smtp-tls-failed": "SMTP secure connection failed",
        "smtp-invalid-configuration": "Check SMTP_FROM, SMTP_USER and SMTP_PORT",
        "smtp-send-failed": "SMTP server did not accept the message",
        "email-provider-not-configured": "Gmail SMTP or Resend is not configured",
        "no-email-address": "No email is registered for this account",
        "disabled-by-user": "Email is disabled in your System notification preferences",
      };
      const emailDetail = emailReasons[result.email?.reason] || result.email?.reason || "";
      const pushReason = pushFailureMessage(result.push);
      setTestResult(`Test complete · In-App: ${result.inAppSaved ? "saved" : "disabled"} · Push: ${label(result.push?.sent > 0, result.push?.skipped)}${!result.push?.skipped && !result.push?.ok && pushReason ? ` (${pushReason})` : ""} · Email: ${emailLabel}${emailDetail ? ` (${emailDetail})` : ""}`);
      await refresh();
    } catch (error) { setTestResult(error.message || "Notification test failed."); }
    finally { setTesting(false); }
  }

  async function markRead(item) {
    const id = notificationText(item?.id);
    if (!id || item?.read) return;
    setItems((current) => current.map((row) => String(row?.id) === id ? { ...row, read: true } : row));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await requestJson("/next/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    } catch (error) {
      setMessage(error.message || "The notification could not be marked as read.");
      refresh();
    }
  }

  async function markGroupRead(group) {
    const ids = (group?.items || []).filter(item => !item.read).map(item => String(item.id));
    if (!ids.length) return;
    const toRead = new Set(ids);
    setItems(current => current.map(item => toRead.has(String(item.id)) ? { ...item, read: true } : item));
    setUnreadCount(count => Math.max(0, count - ids.length));
    try {
      for (let offset = 0; offset < ids.length; offset += 20) {
        await requestJson("/next/api/notifications/read-batch", {
          method: "POST", body: JSON.stringify({ ids: ids.slice(offset, offset + 20) }),
        });
      }
    } catch (error) {
      setMessage(error.message || "Could not mark this group as read.");
      await refresh();
    }
  }

  async function markAllRead() {
    if (!unreadCount) return;
    const previous = items;
    const previousCount = unreadCount;
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);
    try {
      await requestJson("/next/api/notifications/read-all", {
        method: "POST",
        body: "{}",
      });
    } catch (error) {
      setItems(previous);
      setUnreadCount(previousCount);
      setMessage(error.message || "Notifications could not be updated.");
    }
  }

  async function openItem(item) {
    await markRead(item);
    const target = modernNotificationUrl(item?.url);
    if (target) navigateWithinApp(target);
  }

  return (
    <section className="next-notifications-page next-notifications-v4 next-notifications-appfeed">
      {testResult ? <div className="next-notifications-warning" role="status">{testResult}</div> : null}
      {bootstrapWarnings.length ? <div className="next-notifications-warning">Some startup resources were delayed. You can refresh the page.</div> : null}
      {message ? <div className="next-notifications-warning is-error" role="alert">{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss error">×</button></div> : null}

      <div className="next-notifications-controls">
        <nav className="next-notifications-quickfilters" aria-label="Notification filters">
          {[ ["all", "All", counts.all], ["unread", "Unread", counts.unread] ].map(([value, label, count]) => (
            <button type="button" key={value} aria-pressed={scope === value} className={scope === value ? "is-active" : ""} onClick={() => setScope(value)}>{label}<b>{count}</b></button>
          ))}
        </nav>
        <div className="next-notifications-controls__actions">
          <button type="button" className="next-notifications-mark-read" onClick={markAllRead} disabled={!unreadCount} title="Mark all notifications as read">Mark all read</button>
          <button type="button" className={`next-notifications-filter-button${activeAdvancedFilters ? " has-active" : ""}`} onClick={() => setFilterOpen(true)} aria-label="Sort and filter notifications" title="Sort and filter notifications">
            <FilterGlyph />
            {activeAdvancedFilters ? <b>{activeAdvancedFilters}</b> : null}
          </button>
        </div>
      </div>

      <div className="next-notifications-feed" aria-live="polite">
        {feedSections.length ? feedSections.map((section) => (
          <section className="next-notifications-section" key={section.key}>
            <div className="next-notifications-section__head">
              <h2>{section.label}</h2>
              <span>{section.rows.length}</span>
            </div>
            <div className="next-notifications-list">
              {section.rows.map(group => {
                const first = group.items[0];
                const tone = notificationTone(first);
                const multiple = group.items.length > 1;
                const expanded = openGroups.includes(group.id);
                const unread = group.items.filter(item => !item.read).length;
                const target = modernNotificationUrl(first.url);
                return (
                  <article className={`next-notifications-row${unread ? " is-unread" : ""}${multiple ? " is-grouped" : ""}`} key={group.id}>
                    <button type="button" className={`next-notif-icon is-${tone.key}`} onClick={() => openItem(first)} aria-label={`Open ${notificationText(first.title)}`}>
                      <span className="next-notifications-icon-glyph"><NotificationGlyph toneKey={tone.key} /></span>
                      {unread ? <i aria-hidden="true" /> : null}
                    </button>
                    <div className="next-notifications-row__main">
                      <h3>
                        <button type="button" onClick={() => openItem(first)}>{notificationText(first.title) || "Notification"}</button>
                        <time title={notificationDateTime(first.ts)}>{notificationTimeAgo(first.ts)}</time>
                      </h3>
                      <p>{notificationText(first.body) || "Open to view this update."}</p>
                      <div className="next-notifications-row__meta">
                        <span>{notificationText(first.type) || "General"}</span>
                        {multiple ? <button type="button" aria-expanded={expanded} onClick={() => setOpenGroups(prev => expanded ? prev.filter(id => id !== group.id) : [...prev, group.id])}>{group.items.length} updates</button> : null}
                        {unread ? <button type="button" onClick={() => multiple ? markGroupRead(group) : markRead(first)}>{multiple ? "Mark group read" : "Mark read"}</button> : null}
                      </div>
                      {multiple && expanded ? (
                        <div className="next-notifications-group-children">
                          {group.items.map((item, index) => (
                            <button type="button" className={`next-notifications-group-child${item.read ? "" : " is-unread"}`} key={item.id} onClick={() => openItem(item)}>
                              <span className="next-notifications-group-child__index">{index + 1}</span>
                              <span className="next-notifications-group-child__copy">
                                <strong>{notificationText(item.title) || "Notification update"}</strong>
                                <small>{notificationText(item.body) || "Open this update"} · {notificationTimeAgo(item.ts)}</small>
                              </span>
                              <span className="next-notifications-group-child__arrow" aria-hidden="true">›</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {target ? <button type="button" className="next-notifications-row__open" onClick={() => openItem(first)} aria-label="Open notification">›</button> : null}
                  </article>
                );
              })}
            </div>
          </section>
        )) : <div className="next-notifications-empty"><span>✓</span><h3>No updates found</h3><p>Try changing your filters or check for new activity.</p><button type="button" onClick={resetFilters}>Show all</button></div>}
      </div>


      {filterOpen ? (
        <div className="next-notifications-filter-sheet-layer" role="dialog" aria-modal="true" aria-labelledby="notification-filter-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setFilterOpen(false); }}>
          <section className="next-notifications-filter-sheet">
            <header className="next-notifications-filter-sheet__head">
              <div>
                <span>Notification center</span>
                <h2 id="notification-filter-title">Filters</h2>
              </div>
              <button type="button" className="next-notifications-filter-sheet__close" onClick={() => setFilterOpen(false)} aria-label="Close filters" title="Close filters">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </header>
            <div className="next-notifications-filter-sheet__body">
              <NotificationFilterDropdown
                id="category"
                label="Category"
                value={type}
                options={[{ value: "all", label: "All categories" }, ...typeOptions.map(([value, label]) => ({ value, label }))]}
                open={openDropdown === "category"}
                onToggle={(shouldOpen) => setOpenDropdown(shouldOpen ? "category" : null)}
                onSelect={setType}
              />
              <NotificationFilterDropdown
                id="status"
                label="Status"
                value={readFilter}
                options={[{ value: "all", label: "All statuses" }, { value: "unread", label: "Unread only" }, { value: "read", label: "Read only" }]}
                open={openDropdown === "status"}
                onToggle={(shouldOpen) => setOpenDropdown(shouldOpen ? "status" : null)}
                onSelect={setReadFilter}
              />
              <NotificationFilterDropdown
                id="order"
                label="Order"
                value={sort}
                options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]}
                open={openDropdown === "order"}
                onToggle={(shouldOpen) => setOpenDropdown(shouldOpen ? "order" : null)}
                onSelect={setSort}
              />
              <label className="next-notifications-filter-toggle">
                <span>
                  <strong>Group related updates</strong>
                  <small>Combine updates that belong to the same activity.</small>
                </span>
                <input type="checkbox" checked={groupSimilar} onChange={event => setGroupSimilar(event.target.checked)} />
              </label>
            </div>
            <footer className="next-notifications-filter-sheet__footer">
              <button type="button" className="is-secondary" onClick={resetFilters}>Reset</button>
              <button type="button" className="is-primary" onClick={() => setFilterOpen(false)}>Show results</button>
            </footer>
          </section>
        </div>
      ) : null}

      <details className="next-notifications-device next-notifications-settings-card">
        <summary><span>Notification settings</span><small>Push · Preferences · Test tools</small></summary>
        <div className="next-notifications-device__body">
          <PushSettings />
          <div className="next-notifications-device__links">
            <button type="button" onClick={sendTest} disabled={testing}>{testing ? "Testing…" : "Send test notification"}</button>
            <a href="/next/account">Notification preferences ↗</a>
          </div>
        </div>
      </details>

      <DeliveryHistory />
      <small className="next-notifications-v4__source">{source.includes("supabase") ? "Synced with Supabase" : "Notification history"} · Showing up to 80 recent updates</small>
    </section>
  );
}

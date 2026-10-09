"use client";

import { useEffect, useMemo, useState } from "react";
import { navigateWithinApp } from "../../lib/client-navigation";
import { deliveryLabel } from "../../lib/notification-delivery-utils";
import "./notifications-center.css";
import {
  groupNotificationRows,
  modernNotificationUrl,
  notificationDateTime,
  notificationMatches,
  notificationScope,
  notificationText,
  notificationTimeAgo,
  notificationTimestamp,
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
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  if (!response.ok || body?.success === false || body?.ok === false) {
    throw new Error(notificationText(body?.error || body?.message) || `Request failed with ${response.status}.`);
  }
  return body;
}

function triggerBackgroundNotificationScan() {
  return fetch(`/next/api/notifications/refresh?limit=80&_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
  }).catch(() => null);
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

function StatCard({ label, value, note, tone = "neutral" }) {
  return <article className={`next-notifications-stat is-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
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
  const [query, setQuery] = useState("");
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
      if (!notificationMatches(item, query)) return false;
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
  }, [items, query, scope, type, sort, readFilter]);

  const groupedRows = useMemo(() => groupNotificationRows(filtered, groupSimilar), [filtered, groupSimilar]);
  const resetFilters = () => { setQuery(""); setType("all"); setSort("newest"); setScope("all"); setReadFilter("all"); };

  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      const body = await requestJson(`/next/api/notifications?limit=80&fresh=1&_=${Date.now()}`);
      const nextItems = Array.isArray(body?.items) ? body.items : [];
      setItems(nextItems);
      setUnreadCount(Number(body?.unreadCount) || nextItems.filter((item) => !item?.read).length);
      triggerBackgroundNotificationScan().then(async (response) => {
        if (!response?.ok) return;
        try {
          const updated = await requestJson(`/next/api/notifications?limit=80&fresh=1&_=${Date.now()}`);
          const updatedItems = Array.isArray(updated?.items) ? updated.items : [];
          setItems(updatedItems);
          setUnreadCount(Number(updated?.unreadCount) || updatedItems.filter((item) => !item?.read).length);
        } catch {}
      });
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
    <section className="next-notifications-page next-notifications-v4">
      <header className="next-notifications-hero">
        <div>
          <span>Activity center</span>
          <h2>Notifications</h2>
          <p>Updates that matter to you, all in one place.</p>
        </div>
        <div className="next-notifications-hero__actions">
          <button type="button" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
          <button type="button" className="is-secondary" onClick={markAllRead} disabled={!unreadCount}>Mark all read</button>
        </div>
      </header>

      {testResult ? <div className="next-notifications-warning" role="status">{testResult}</div> : null}
      {bootstrapWarnings.length ? <div className="next-notifications-warning">Some startup resources were delayed. You can refresh the page.</div> : null}
      {message ? <div className="next-notifications-warning is-error" role="alert">{message}<button type="button" onClick={() => setMessage("")} aria-label="Dismiss error">×</button></div> : null}

      <div className="next-notifications-stats" aria-label="Notification overview">
        <StatCard label="Unread" value={unreadCount} note="Needs your attention" tone={unreadCount ? "warning" : "success"} />
        <StatCard label="Recent" value={counts.all} note="Latest saved updates" tone="primary" />
        <StatCard label="Today" value={counts.today} note="Received today" tone="success" />
      </div>

      <article className="next-notifications-workspace">
        <header>
          <div><span>Your activity</span><h2>Updates</h2></div>
          <strong>{filtered.length} shown</strong>
        </header>
        <nav className="next-notifications-tabs" aria-label="Period filters">
          {[["all", "All", counts.all], ["unread", "Unread", counts.unread], ["today", "Today", counts.today], ["week", "This week", counts.week], ["earlier", "Earlier", counts.earlier]].map(([value, label, count]) => (
            <button type="button" key={value} aria-pressed={scope === value} className={scope === value ? "is-active" : ""} onClick={() => setScope(value)}>{label}<b>{count}</b></button>
          ))}
        </nav>
        <div className="next-notifications-toolbar">
          <label className="next-notifications-search"><span>Search notifications</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search titles or details…" /></label>
          <label><span>Category</span><select value={type} onChange={event => setType(event.target.value)}><option value="all">All categories</option>{typeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Status</span><select value={readFilter} onChange={event => setReadFilter(event.target.value)}><option value="all">All statuses</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
          <label><span>Order</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label>
          <button type="button" onClick={resetFilters}>Reset</button>
        </div>
        <div className="next-notifications-group-settings">
          <label><input type="checkbox" checked={groupSimilar} onChange={event => setGroupSimilar(event.target.checked)} /> Group related updates</label>
          <span>{groupedRows.length} {groupedRows.length === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="next-notifications-list">
          {groupedRows.length ? groupedRows.map(group => {
            const first = group.items[0];
            const tone = notificationTone(first);
            const multiple = group.items.length > 1;
            const expanded = openGroups.includes(group.id);
            const unread = group.items.filter(item => !item.read).length;
            const target = modernNotificationUrl(first.url);
            return (
              <article className={`next-notifications-row ${unread ? "is-unread" : ""}`} key={group.id}>
                <button type="button" className={`next-notif-icon is-${tone.key}`} onClick={() => openItem(first)} aria-label={`Open ${notificationText(first.title)}`}>{tone.label}</button>
                <div className="next-notifications-row__main">
                  <div><span>{notificationText(first.type) || "General"}</span>{unread ? <em>{unread} unread</em> : null}{multiple ? <em className="is-grouped">{group.items.length} updates</em> : null}</div>
                  <h3>{notificationText(first.title) || "Notification"}</h3>
                  <p>{notificationText(first.body) || "Open to view this update."}</p>
                  {multiple && expanded ? <div className="next-notifications-group-children">{group.items.map(item => <div key={item.id}><button type="button" onClick={() => openItem(item)}>{notificationTimeAgo(item.ts)} · {item.read ? "Read" : "Unread"} ↗</button></div>)}</div> : null}
                </div>
                <div className="next-notifications-row__side">
                  <time title={notificationDateTime(first.ts)}>{notificationTimeAgo(first.ts)}</time>
                  <div>
                    {multiple ? <button type="button" aria-expanded={expanded} onClick={() => setOpenGroups(prev => expanded ? prev.filter(id => id !== group.id) : [...prev, group.id])}>{expanded ? "Less" : "Details"}</button> : null}
                    {multiple && unread ? <button type="button" onClick={() => markGroupRead(group)} aria-label={`Mark ${unread} notifications in this group as read`}>Read group</button> : null}
                    {!multiple && unread ? <button type="button" onClick={() => markRead(first)}>Read</button> : null}
                    {target ? <button type="button" className="is-open" onClick={() => openItem(first)}>Open</button> : null}
                  </div>
                </div>
              </article>
            );
          }) : <div className="next-notifications-empty"><span>✓</span><h3>No updates found</h3><p>Try changing your filters or check for new activity.</p><button type="button" onClick={resetFilters}>Show all</button></div>}
        </div>
      </article>

      <DeliveryHistory />

      <details className="next-notifications-device">
        <summary><span>Device & test tools</span><small>Push settings · Test delivery · Preferences</small></summary>
        <div className="next-notifications-device__body">
          <PushSettings />
          <div className="next-notifications-device__links">
            <button type="button" onClick={sendTest} disabled={testing}>{testing ? "Testing…" : "Send test notification"}</button>
            <a href="/next/account">Notification preferences ↗</a>
          </div>
        </div>
      </details>
      <small className="next-notifications-v4__source">{source.includes("supabase") ? "Synced with Supabase" : "Notification history"} · Showing up to 80 recent updates</small>
    </section>
  );
}

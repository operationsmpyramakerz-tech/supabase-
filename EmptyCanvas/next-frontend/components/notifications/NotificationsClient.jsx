"use client";

import { useEffect, useMemo, useState } from "react";
import { navigateWithinApp } from "../../lib/client-navigation";
import {
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

export default function NotificationsClient({ initialItems = [], initialUnreadCount = 0, source = "", bootstrapWarnings = [] }) {
  const [items, setItems] = useState(Array.isArray(initialItems) ? initialItems : []);
  const [unreadCount, setUnreadCount] = useState(Number(initialUnreadCount) || 0);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
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
      if (["today", "week", "earlier"].includes(scope) && notificationScope(item?.ts) !== scope) return false;
      return true;
    });
    result.sort((a, b) => sort === "oldest"
      ? notificationTimestamp(a?.ts) - notificationTimestamp(b?.ts)
      : notificationTimestamp(b?.ts) - notificationTimestamp(a?.ts));
    return result;
  }, [items, query, scope, type, sort]);

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
    <section className="next-notifications-page">
      <article className="next-notifications-hero">
        <div>
          <span>Personal activity feed</span>
          <h2>Stay ahead of every ERP update.</h2>
          <p>Review orders, expenses, stock changes and workflow activity in one place. Stored links are automatically routed to their migrated Next.js pages.</p>
          <div className="next-notifications-hero__meta"><b>{source.includes("supabase") ? "Supabase notifications" : "Notification fallback store"}</b><span>Up to 80 recent updates</span></div>
        </div>
        <div className="next-notifications-hero__actions">
          <button type="button" onClick={sendTest} disabled={testing}>{testing ? "Testing…" : "Send test notification"}</button>
          <button type="button" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          <button type="button" className="is-secondary" onClick={markAllRead} disabled={!unreadCount}>Mark all as read</button>
        </div>
      </article>

      {testResult ? <div className="next-notifications-warning" role="status">{testResult}</div> : null}
      {bootstrapWarnings.length ? <div className="next-notifications-warning">Some startup resources were delayed. The page remains usable and can be refreshed.</div> : null}
      {message ? <div className="next-notifications-warning is-error">{message}<button type="button" onClick={() => setMessage("")}>×</button></div> : null}

      <PushSettings />

      <div className="next-notifications-stats">
        <StatCard label="Recent updates" value={counts.all} note="Saved in your notification history" tone="primary" />
        <StatCard label="Unread" value={unreadCount || counts.unread} note="Requires your attention" tone={unreadCount ? "warning" : "success"} />
        <StatCard label="Today" value={counts.today} note="Updates received since midnight" tone="success" />
        <StatCard label="This week" value={counts.today + counts.week} note="Monday through today" />
      </div>

      <article className="next-notifications-workspace">
        <header>
          <div><span>Notification center</span><h2>All updates</h2></div>
          <strong>{filtered.length} result{filtered.length === 1 ? "" : "s"}</strong>
        </header>

        <div className="next-notifications-toolbar">
          <label className="next-notifications-search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, message, type or link…" /></label>
          <label><span>Type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{typeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
          <button type="button" onClick={() => { setQuery(""); setType("all"); setSort("newest"); setScope("all"); }}>Clear filters</button>
        </div>

        <nav className="next-notifications-tabs" aria-label="Notification filters">
          {[
            ["all", "All", counts.all],
            ["unread", "Unread", counts.unread],
            ["today", "Today", counts.today],
            ["week", "This week", counts.week],
            ["earlier", "Earlier", counts.earlier],
          ].map(([value, label, count]) => <button type="button" className={scope === value ? "is-active" : ""} onClick={() => setScope(value)} key={value}><span>{label}</span><b>{count}</b></button>)}
        </nav>

        <div className="next-notifications-list">
          {filtered.length ? filtered.map((item) => {
            const tone = notificationTone(item);
            const target = modernNotificationUrl(item?.url);
            return (
              <article className={`next-notifications-row ${item?.read ? "" : "is-unread"}`} key={notificationText(item?.id) || `${item?.title}-${item?.ts}`}>
                <button type="button" className={`next-notif-icon is-${tone.key}`} onClick={() => openItem(item)} aria-label="Open notification">{tone.label}</button>
                <div className="next-notifications-row__main">
                  <div><span>{notificationText(item?.type) || "General"}</span>{!item?.read ? <em>Unread</em> : <em className="is-read">Read</em>}</div>
                  <h3>{notificationText(item?.title) || "Notification"}</h3>
                  <p>{notificationText(item?.body) || "Open this update for more information."}</p>
                  {target ? <small>{target}</small> : null}
                </div>
                <div className="next-notifications-row__side"><time title={notificationDateTime(item?.ts)}>{notificationTimeAgo(item?.ts)}</time><span>{notificationDateTime(item?.ts)}</span><div>{!item?.read ? <button type="button" onClick={() => markRead(item)}>Mark read</button> : null}{target ? <button type="button" className="is-open" onClick={() => openItem(item)}>Open</button> : null}</div></div>
              </article>
            );
          }) : (
            <div className="next-notifications-empty"><span>NT</span><h3>No notifications match these filters.</h3><p>Clear the filters or refresh the page to check for new updates.</p><button type="button" onClick={() => { setQuery(""); setType("all"); setScope("all"); }}>Show all notifications</button></div>
          )}
        </div>
      </article>
    </section>
  );
}

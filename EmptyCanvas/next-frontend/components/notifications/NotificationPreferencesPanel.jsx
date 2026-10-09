"use client";

import { useEffect, useMemo, useState } from "react";

const CATEGORIES = [
  { id: "orders", label: "Orders", desc: "Approvals, requests and delivery" },
  { id: "tasks", label: "Tasks", desc: "Assigned work and due dates" },
  { id: "maintenance", label: "Maintenance", desc: "Work logs and technician updates" },
  { id: "events", label: "Events", desc: "Event schedules and teams" },
  { id: "expenses", label: "Expenses", desc: "Expense updates and approvals" },
  { id: "stock", label: "Stocktaking", desc: "Inventory changes" },
  { id: "system", label: "System", desc: "Account and ERP alerts" },
  { id: "other", label: "Other", desc: "Other notifications" },
];
const CHANNELS = [
  { id: "in_app", label: "In-App" },
  { id: "push", label: "Push" },
  { id: "email", label: "Email" },
];

const STARTING_SETTINGS = {
  channels: {
    orders: { in_app: true, push: true, email: false },
    tasks: { in_app: true, push: true, email: true },
    maintenance: { in_app: true, push: true, email: true },
    events: { in_app: true, push: true, email: false },
    expenses: { in_app: true, push: false, email: false },
    stock: { in_app: true, push: false, email: false },
    system: { in_app: true, push: true, email: true },
    other: { in_app: true, push: false, email: false },
  },
  digest: "daily",
  quiet_hours: { enabled: false, start: "21:00", end: "08:00", timezone: "Africa/Cairo" },
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include", cache: "no-store", ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) throw new Error(data?.error || "Could not contact the notification service.");
  return data;
}

export default function NotificationPreferencesPanel() {
  const [settings, setSettings] = useState(STARTING_SETTINGS);
  const [original, setOriginal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = useMemo(() => original !== null && JSON.stringify(settings) !== JSON.stringify(original), [settings, original]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await requestJson("/next/api/notifications/preferences");
      setSettings(data.settings);
      setOriginal(data.settings);
    } catch (problem) { setError(problem.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function setChannel(category, channel, checked) {
    setSettings((previous) => ({ ...previous, channels: {
      ...previous.channels,
      [category]: { ...previous.channels[category], [channel]: checked },
    } }));
    setSaved(false);
  }

  function setQuiet(key, value) {
    setSettings((previous) => ({ ...previous, quiet_hours: { ...previous.quiet_hours, [key]: value } }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await requestJson("/next/api/notifications/preferences", {
        method: "PUT", body: JSON.stringify({ settings }),
      });
      setSettings(result.settings);
      setOriginal(result.settings);
      setSaved(true);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }

  function reset() {
    // Reset preferences to the recommended defaults. Changes persist only on Save.
    setSettings(JSON.parse(JSON.stringify(STARTING_SETTINGS)));
    setSaved(false);
  }

  return (
    <section className="erp-notification-preferences" aria-label="Notification preferences">
      <div className="erp-notification-preferences__intro">
        <div><h4>Notification preferences</h4><p>Choose exactly what reaches you. Every category and channel is optional.</p></div>
        <span className="erp-notification-preferences__tag">Personal settings</span>
      </div>

      {error ? <div className="erp-notification-preferences__alert" role="alert">{error} <button type="button" onClick={load}>Retry</button></div> : null}
      {saved ? <p className="erp-notification-preferences__saved" role="status">Your notification preferences were saved.</p> : null}
      {loading ? <div className="erp-notification-preferences__loading">Loading your settings…</div> : (
        <>
          <div className="erp-notification-preferences__matrix" role="group" aria-label="Notification channels by category">
            <div className="erp-notification-preferences__heading"><span>Category</span>{CHANNELS.map((channel) => <span key={channel.id}>{channel.label}</span>)}</div>
            {CATEGORIES.map((category) => (
              <div className="erp-notification-preferences__line" key={category.id}>
                <div className="erp-notification-preferences__cat"><strong>{category.label}</strong><small>{category.desc}</small></div>
                {CHANNELS.map((channel) => (
                  <label className="erp-notification-preferences__check" key={channel.id}>
                    <input type="checkbox" checked={settings.channels?.[category.id]?.[channel.id] === true}
                      onChange={(event) => setChannel(category.id, channel.id, event.target.checked)}
                      aria-label={`${category.label} — ${channel.label}`} />
                    <span aria-hidden="true" />
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="erp-notification-preferences__details">
            <label className="erp-notification-preferences__field">
              <strong>Email digest</strong><small>Choose how often to receive a summary of non-urgent ERP updates.</small>
              <select value={settings.digest} onChange={(event) => { setSettings((p) => ({ ...p, digest: event.target.value })); setSaved(false); }}>
                <option value="off">No summary</option><option value="daily">Daily summary</option><option value="weekly">Weekly summary</option>
              </select>
            </label>
            <div className="erp-notification-preferences__quiet">
              <label className="erp-notification-preferences__quiet-toggle">
                <span><strong>Quiet hours</strong><small>Pause mobile push outside your preferred hours; in-app history is unaffected.</small></span>
                <input type="checkbox" checked={settings.quiet_hours.enabled} onChange={(e) => setQuiet("enabled", e.target.checked)} />
              </label>
              {settings.quiet_hours.enabled ? (
                <div className="erp-notification-preferences__hours">
                  <label>From<input type="time" value={settings.quiet_hours.start} onChange={(e) => setQuiet("start", e.target.value)} /></label>
                  <label>Until<input type="time" value={settings.quiet_hours.end} onChange={(e) => setQuiet("end", e.target.value)} /></label>
                  <label>Time zone<input value={settings.quiet_hours.timezone} onChange={(e) => setQuiet("timezone", e.target.value)} placeholder="Africa/Cairo" /></label>
                </div>
              ) : null}
            </div>
          </div>
          <div className="erp-notification-preferences__footer">
            <button type="button" className="erp-notification-preferences__reset" onClick={reset} disabled={busy}>Restore defaults</button>
            <button type="button" className="erp-notification-preferences__save" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save preferences"}</button>
          </div>
          <p className="erp-notification-preferences__footnote">Push requires browser permission and a device subscription. Email testing uses your configured SMTP (Gmail) or Resend account. Automatic event emails and scheduled digests are coming in a later phase.</p>
        </>
      )}
    </section>
  );
}

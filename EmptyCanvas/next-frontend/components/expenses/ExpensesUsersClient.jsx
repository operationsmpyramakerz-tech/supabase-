"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const UserExpensesModal = dynamic(
  () => import("./ExpensesUsersDialogs").then((module) => module.UserExpensesModal),
  { ssr: false }
);

function preloadExpensesUsersDialogs() {
  void import("./ExpensesUsersDialogs");
}

function text(value) { return String(value ?? "").trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function formatGBP(value) {
  const amount = number(value);
  const formatted = Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return amount < 0 ? `-£${formatted}` : `£${formatted}`;
}

function formatDateDisplay(value, fallback = "—") {
  const raw = text(value);
  if (!raw) return fallback;
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (response.status === 401 && !body?.error?.toLowerCase?.().includes("password")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Login required.");
  }
  if (!response.ok || body?.success === false || body?.ok === false) throw new Error(body?.error || body?.message || `Request failed with ${response.status}.`);
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className={`next-expense-users-toast is-${toast.type || "info"}`}><div><strong>{toast.title}</strong>{toast.message ? <span>{toast.message}</span> : null}</div><button type="button" onClick={onClose}>×</button></div>;
}

export default function ExpensesUsersClient({ initialUsersPayload, bootstrapWarnings = [] }) {
  const [users, setUsers] = useState(Array.isArray(initialUsersPayload?.users) ? initialUsersPayload.users : []);
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeUserKey, setActiveUserKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const notify = (title, message = "", type = "info") => setToast({ title, message, type });

  const refresh = async () => {
    setBusy(true);
    try {
      const body = await requestJson("/next/api/expenses/users?fresh=1");
      setUsers(Array.isArray(body?.users) ? body.users : []);
      return body;
    } catch (error) { notify("Refresh failed", error?.message || "Failed to refresh expense users.", "error"); throw error; }
    finally { setBusy(false); }
  };

  return <>
    {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some expense-user data was delayed.</strong><span>The loaded balances remain available and can be refreshed automatically when a user is opened.</span></div> : null}
    <main className="expenses-layout next-expense-users-classic-parity">
      <div className="user-tabs">
        {busy ? <div className="loader" /> : users.length ? users.map((user) => {
          const total = number(user.total);
          const key = text(user.id || user.userId || user.name);
          const count = number(user.count);
          return <button
            type="button"
            className={`user-tab${total < 0 ? " has-negative" : total > 0 ? " has-positive" : ""}${activeUserKey === key ? " active" : ""}`}
            onMouseEnter={preloadExpensesUsersDialogs}
            onFocus={preloadExpensesUsersDialogs}
            onClick={() => { preloadExpensesUsersDialogs(); setActiveUserKey(key); setSelectedUser(user); }}
            key={key}
          ><div className="user-tab__header"><span className="user-tab__count">{count} item{count === 1 ? "" : "s"}</span><span className="user-tab__name">{user.name || "Unknown user"}</span></div><div className="user-tab__divider" aria-hidden="true" /><div className="user-tab__body"><span className="user-tab__label">Current balance</span><span className="user-total">{formatGBP(total)}</span></div><div className="user-tab__footer"><span className="user-tab__footer-label">Last settled</span><span className="user-settled">{formatDateDisplay(user.lastSettledDate)}</span></div></button>;
        }) : <div className="users-empty"><div className="expenses-empty">Sorry, No data available</div></div>}
      </div>
    </main>
    {selectedUser ? <UserExpensesModal user={selectedUser} onClose={() => setSelectedUser(null)} onUsersRefresh={refresh} notify={notify} /> : null}
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EMPTY_EXPENSE_FILTERS, expenseFilterCount, expenseFundsTypeOptions, matchesExpenseUserFilters } from "../../lib/expense-users-filters.mjs";
import EditUserExpense from "./EditUserExpense";
import { duplicateExpenseOrderReason } from "../../lib/expense-user-edit.mjs";
import styles from "./ExpensesUsersSheet.module.css";
import { DeleteConfirmDialog, DeleteVerificationDialog } from "../shared/SystemDeleteDialogs";
import { DEFAULT_OWN_CAR_RATE_EGP_PER_KM } from "../../lib/own-car-expense.mjs";

const SETTLEMENT_KEY = "settledmyaccount";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function normalized(value) { return lower(value).replace(/[^a-z0-9\u0600-\u06ff]+/g, ""); }
function normalizeGroupText(value) { return text(value).replace(/\s+/g, " ").toLowerCase(); }
function isSettlement(item) { return normalized(item?.fundsType) === SETTLEMENT_KEY || normalized(item?.reason) === SETTLEMENT_KEY; }

function modernTrackingHref(order) {
  const groupId = text(order?.trackingGroupId);
  if (groupId) return `/next/orders/tracking?groupId=${encodeURIComponent(groupId)}`;
  const raw = text(order?.trackingUrl);
  if (!raw) return "";
  const match = raw.match(/[?&]groupId=([^&#]+)/i);
  if (match?.[1]) {
    let decoded = match[1];
    try { decoded = decodeURIComponent(decoded); } catch {}
    return `/next/orders/tracking?groupId=${encodeURIComponent(decoded)}`;
  }
  return raw.replace(/^\/orders\/tracking(?=\?|$)/i, "/next/orders/tracking");
}

function modernReceiptViewerHref(order) {
  const raw = text(order?.receiptViewerUrl);
  if (raw) return raw.replace(/^\/orders\/order-receipt-viewer(?=\?|$)/i, "/next/orders/receipt-viewer");
  const ids = (Array.isArray(order?.relationIds) ? order.relationIds : []).map((value) => text(value)).filter(Boolean);
  return ids.length ? `/next/orders/receipt-viewer?ids=${encodeURIComponent(ids.join(","))}` : "";
}

function formatGBP(value) {
  const amount = number(value);
  const formatted = Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return amount < 0 ? `-£${formatted}` : `£${formatted}`;
}

function formatExpenseNumber(value) {
  return number(value).toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function formatDateDisplay(value, fallback = "—") {
  const raw = text(value);
  if (!raw) return fallback;
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatExpenseGroupDate(value) {
  const raw = text(value);
  if (!raw) return "No date";
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function toLocalDateKey(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function transactionTime(item) {
  const raw = text(item?.createdTime || item?.created_time);
  if (raw) {
    const stamp = new Date(raw).getTime();
    if (Number.isFinite(stamp)) return stamp;
  }
  const date = text(item?.date);
  const stamp = date ? new Date(date).getTime() : NaN;
  return Number.isFinite(stamp) ? stamp : 0;
}

function transactionValue(item) { return number(item?.cashIn) - number(item?.cashOut); }
function screenshotsFor(item) {
  const rows = (Array.isArray(item?.screenshots) ? item.screenshots : [])
    .map((shot, index) => ({ name: text(shot?.name) || `Receipt ${index + 1}`, url: text(shot?.url) }))
    .filter((shot) => shot.url);
  if (rows.length) return rows;
  const fallback = text(item?.screenshotUrl);
  return fallback ? [{ name: text(item?.screenshotName) || "Receipt", url: fallback }] : [];
}
function ordersFor(item) { return Array.isArray(item?.orders) ? item.orders.filter(Boolean) : []; }

function userDisplayReason(item) {
  const rawReason = text(item?.reason);
  const orders = ordersFor(item);
  const primaryLabel = text(orders[0]?.label);
  if (primaryLabel && rawReason) {
    const reason = normalizeGroupText(rawReason);
    const label = normalizeGroupText(primaryLabel);
    if (reason === label || reason.startsWith(`${label} •`)) return primaryLabel;
  }
  if (rawReason) return rawReason;
  if (primaryLabel) return primaryLabel;
  if (number(item?.cashIn) > 0) return "Cash In";
  return text(item?.fundsType) || "Cash Out";
}

function userRoute(item) {
  const isCashIn = number(item?.cashIn) > 0;
  let from = text(item?.from);
  let to = text(item?.to);
  if (isCashIn) {
    if (!from) from = text(item?.cashInFrom) || "Cash in";
    if (!to) to = "Wallet";
  }
  return { from: from || "—", to: to || "—" };
}

function userAmount(item) {
  const cashIn = number(item?.cashIn);
  const cashOut = number(item?.cashOut);
  if (cashIn > 0) return { text: `+£${formatExpenseNumber(cashIn)}`, tone: "is-positive" };
  return { text: `-£${formatExpenseNumber(cashOut)}`, tone: cashOut > 0 ? "is-negative" : "is-neutral" };
}

function splitBySettlement(items, apiSettledAt, apiSettledDate) {
  const all = Array.isArray(items) ? items : [];
  let settledAt = text(apiSettledAt) || null;
  let settledDate = text(apiSettledDate) || null;

  if (!settledAt) {
    let lastItem = null;
    let lastTime = -Infinity;
    for (const item of all) {
      if (!isSettlement(item)) continue;
      const stamp = transactionTime(item);
      if (stamp > lastTime) { lastTime = stamp; lastItem = item; }
    }
    settledAt = text(lastItem?.createdTime || lastItem?.created_time) || null;
    settledDate = settledDate || text(lastItem?.date) || null;
  }

  if (!settledAt) return { recent: [...all], past: [], lastSettledAt: null, lastSettledDate: null };
  const cutoff = new Date(settledAt).getTime();
  if (!Number.isFinite(cutoff)) return { recent: [...all], past: [], lastSettledAt: null, lastSettledDate: settledDate };

  const recent = [];
  const past = [];
  for (const item of all) {
    if (transactionTime(item) > cutoff) recent.push(item);
    else past.push(item);
  }
  return { recent, past, lastSettledAt: settledAt, lastSettledDate: settledDate };
}

function filterAndSort(items, { sortType = "newest", ...filters } = {}) {
  const result = (Array.isArray(items) ? items : []).filter(item => matchesExpenseUserFilters(item, filters, toLocalDateKey));
  result.sort((a, b) => {
    const dateA = new Date(a?.date || a?.createdTime || a?.created_time || 0);
    const dateB = new Date(b?.date || b?.createdTime || b?.created_time || 0);
    const amountA = transactionValue(a);
    const amountB = transactionValue(b);
    if (sortType === "oldest") return dateA - dateB;
    if (sortType === "high") return amountB - amountA;
    if (sortType === "low") return amountA - amountB;
    return dateB - dateA;
  });
  return result;
}

function groupUserExpenses(items, sortType = "newest") {
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const reason = userDisplayReason(item);
    const date = text(item?.date);
    const destinationName = text(item?.destinationUserName);
    const destinationId = text(item?.destinationUserId);
    // A destination is part of the ticket identity, not a property of its first row.
    const destinationKey = destinationId ? ["id", destinationId] : ["name", lower(destinationName)];
    const key = JSON.stringify([date, normalizeGroupText(reason), destinationKey]);
    if (!grouped.has(key)) {
      grouped.set(key, { key, date, reason: reason || "No reason", destinationName, destinationCreatedSort: transactionTime(item), items: [], ordersMap: new Map(), totalCashIn: 0, totalCashOut: 0, totalKilometer: 0, createdSort: transactionTime(item) });
    }
    const group = grouped.get(key);
    group.items.push(item);
    group.totalCashIn += number(item?.cashIn);
    group.totalCashOut += number(item?.cashOut);
    group.totalKilometer += number(item?.kilometer);
    if (destinationName && (!group.destinationName || transactionTime(item) >= group.destinationCreatedSort)) {
      group.destinationName = destinationName;
      group.destinationCreatedSort = transactionTime(item);
    }
    group.createdSort = Math.max(group.createdSort || 0, transactionTime(item));
    for (const order of ordersFor(item)) {
      const orderKey = text(order?.key || order?.orderId || order?.label);
      if (orderKey && (!group.ordersMap.has(orderKey) || (!group.ordersMap.get(orderKey)?.publicDetailsHref && order.publicDetailsHref))) group.ordersMap.set(orderKey, order);
    }
  }

  const groups = [...grouped.values()].map((group) => ({ ...group, orders: [...group.ordersMap.values()] }));
  groups.sort((a, b) => {
    const parsedA = new Date(`${a.date || ""}T00:00:00`).getTime();
    const parsedB = new Date(`${b.date || ""}T00:00:00`).getTime();
    const timeA = Number.isFinite(parsedA) ? parsedA : number(a.createdSort);
    const timeB = Number.isFinite(parsedB) ? parsedB : number(b.createdSort);
    const netA = number(a.totalCashIn) - number(a.totalCashOut);
    const netB = number(b.totalCashIn) - number(b.totalCashOut);
    if (sortType === "oldest") return timeA - timeB;
    if (sortType === "high") return netB - netA;
    if (sortType === "low") return netA - netB;
    return timeB - timeA;
  });
  return groups;
}

function groupTotal(group) {
  const cashNet = number(group?.totalCashIn) - number(group?.totalCashOut);
  if (cashNet > 0) return { text: `+£${formatExpenseNumber(cashNet)}`, tone: "is-positive" };
  if (cashNet < 0) return { text: `-£${formatExpenseNumber(Math.abs(cashNet))}`, tone: "is-negative" };
  return { text: "£0", tone: "is-neutral" };
}

function shouldHideGroupReason(group) {
  return duplicateExpenseOrderReason(group?.reason, group?.orders || []);
}

function responseFileName(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (!match) return fallback;
  try { return decodeURIComponent(match[1] || match[2] || fallback); } catch { return match[1] || match[2] || fallback; }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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

async function requestExpenseAdminMutation(action, { expenseId, adminPassword, expense } = {}) {
  return await requestJson("/next/api/expenses/mutations-direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, expenseId, adminPassword, ...(expense ? { expense } : {}) }),
  });
}

function UserClassicIcon({ name, size = 18 }) {
  const common = { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const icons = {
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    wallet: <><path d="M20 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-3"/><path d="M3 7h17a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4a4 4 0 0 1 0-8h6"/><path d="M16 13h.01"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    filter: <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>,
    rotate: <><polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></>,
    sort: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
    "edit-3": <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    "shopping-cart": <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
    package: <><path d="M16.5 9.4L7.5 4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
  };
  return <svg {...common}>{icons[name] || icons.card}</svg>;
}

function ReceiptViewer({ item, onClose }) {
  const screenshots = screenshotsFor(item);
  useEffect(() => {
    document.body.classList.add("expense-shots-modal-open");
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("expense-shots-modal-open"); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return createPortal(
    <div className={`expense-shots-modal is-open ${styles.receiptOverlay}`} style={{ display: "flex" }} aria-hidden="false" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="expense-shots-modal__card" role="dialog" aria-modal="true">
        <div className="expense-shots-modal__head"><div><h4 className="expense-shots-modal__title">Screenshots</h4><div className="expense-shots-modal__count">{screenshots.length ? `${screenshots.length} image${screenshots.length === 1 ? "" : "s"}` : "No images uploaded"}</div></div><button type="button" className="expense-shots-modal__close" autoFocus onClick={onClose} aria-label="Close screenshots viewer"><span aria-hidden="true">×</span></button></div>
        <div className="expense-shots-modal__body">{screenshots.length ? <div className="expense-shots-modal__grid">{screenshots.map((shot, index) => <a className="expense-shots-modal__item" href={shot.url} target="_blank" rel="noreferrer" key={`${shot.url}-${index}`}><span className="expense-shots-modal__image-wrap"><img className="expense-shots-modal__image" src={shot.url} alt={shot.name || `Screenshot ${index + 1}`} loading="lazy" /></span><span className="expense-shots-modal__caption">{shot.name || `Screenshot ${index + 1}`}</span></a>)}</div> : <div className="expense-shots-modal__empty"><div className="expense-shots-modal__empty-icon"><UserClassicIcon name="image" size={24}/></div><div>No screenshots uploaded for this expense.</div></div>}</div>
      </div>
    </div>,
    document.body,
  );
}

function AdminPasswordModal({ count = 1, onClose, onContinue }) {
  const [password, setPassword] = useState("");
  return <DeleteVerificationDialog title={count > 1 ? "Delete expense card" : "Delete expense"} password={password} onPasswordChange={setPassword} onCancel={onClose} onSubmit={onContinue} />;
}

function DeleteConfirmationModal({ count, onClose, onConfirm, busy }) {
  return <DeleteConfirmDialog title={count > 1 ? "Delete expense card?" : "Delete expense?"} message={count > 1 ? `You’re going to permanently delete ${count} expense rows and all uploaded receipts. This action cannot be undone.` : "You’re going to permanently delete this expense and its uploaded receipts. This action cannot be undone."} busy={busy} onCancel={onClose} onConfirm={onConfirm} />;
}

function getExpenseOrderTypeMeta(type) {
  const label = text(type);
  const key = lower(type).replace(/[^a-z0-9]/g, "");
  if (["manualreason", "otherreason", "manual"].includes(key)) return { icon: "edit-3", bg: "#F3F4F6", fg: "#111827", bd: "#D1D5DB" };
  if (["requestproducts", "delivery"].includes(key)) return { icon: "shopping-cart", bg: "#DCFCE7", fg: "#166534", bd: "#86EFAC" };
  if (["withdrawproducts", "withdrawal"].includes(key)) return { icon: "log-out", bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" };
  if (["requestmaintenance", "maintenance"].includes(key)) return { icon: "tool", bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" };
  return { icon: "package", bg: "#EFF6FF", fg: "#1D4ED8", bd: "#BFDBFE", label: label || "Order" };
}

function UserExpenseOrderActions({ orders, canViewOrderReceipts = true }) {
  if (!orders?.length) return null;
  return <div className="expense-ticket__order-actions">{orders.map((order, index) => {
    const meta = getExpenseOrderTypeMeta(order?.orderType);
    const href = text(order?.publicDetailsHref);
    const label = [text(order?.orderId), text(order?.orderType)].filter(Boolean).join(" · ") || text(order?.label) || "Order";
    const style = { "--expense-order-btn-bg": meta.bg, "--expense-order-btn-fg": meta.fg, "--expense-order-btn-border": meta.bd };
    const content = <><UserClassicIcon name={meta.icon} size={15}/><span>{label}</span>{href ? <UserClassicIcon name="external" size={14}/> : null}</>;
    return href ? <a className="expense-ticket__order-btn" style={style} href={href} target="_blank" rel="noreferrer" key={`${label}-${index}`}>{content}</a> : <span className="expense-ticket__order-btn expense-ticket__order-btn--disabled" style={style} key={`${label}-${index}`}>{content}</span>;
  })}</div>;
}

function UserExpenseShot({ item, onReceipt }) {
  const shots = screenshotsFor(item);
  return <button className={`expense-ticket__shot-btn${shots.length ? " expense-ticket__shot-btn--has-shots" : ""}`} type="button" aria-label={shots.length ? `View ${shots.length} screenshot${shots.length === 1 ? "" : "s"}` : "No screenshots uploaded"} onClick={() => onReceipt(item)}><span className="expense-ticket__shot-btn-icon"><UserClassicIcon name="image" size={18}/></span></button>;
}

function UserExpenseTicket({ group, onReceipt, onEdit, onDelete, canViewOrderReceipts = true, menuKey, setMenuKey }) {
  const rows = [...(Array.isArray(group?.items) ? group.items : [])].sort((a, b) => transactionTime(a) - transactionTime(b));
  const total = groupTotal(group);
  const hideReason = shouldHideGroupReason(group);
  const hasOrders = Array.isArray(group?.orders) && group.orders.length > 0;
  const reasonText = text(group?.reason) || "No reason";
  const ids = rows.map((item) => text(item?.id)).filter(Boolean);
  const hasActions = Boolean(ids.length && (onEdit || onDelete));
  return <article className="expense-ticket expense-ticket--user-destination">
    <div className="expense-ticket__top">
      <div className="expense-ticket__destination-date">
        <div className="expense-ticket__destination" title={group.destinationName || "No destination recorded"}>
          <span className="expense-ticket__destination-icon"><UserClassicIcon name="user" size={15}/></span>
          <span className="expense-ticket__destination-copy"><span className="expense-ticket__destination-label">Destination</span><strong dir="auto">{group.destinationName || "—"}</strong></span>
        </div>
        <span className="expense-ticket__date">{formatExpenseGroupDate(group?.date)}</span>
      </div>
      <div className="expense-ticket__destination-divider" aria-hidden="true"/>
      <div className={`expense-ticket__header-row expense-ticket__header-row--user-reason${hasActions ? " has-actions" : ""}`}>
        <div className="expense-ticket__user-reason">
          {hasOrders ? <UserExpenseOrderActions orders={group.orders} canViewOrderReceipts={canViewOrderReceipts}/> : !hideReason ? <div className="expense-ticket__reason">{reasonText}</div> : null}
        </div>
        {hasActions ? <div className={`expense-ticket__actions${menuKey === group.key ? " is-open" : ""}`}><button type="button" className="expense-ticket__more" onClick={() => setMenuKey(menuKey === group.key ? "" : group.key)} aria-label="Expense actions">⋯</button><div className="expense-ticket__menu">{onEdit ? <button type="button" className="expense-ticket__menu-item" onClick={() => { setMenuKey(""); onEdit(rows.filter(item => text(item.id))); }}><UserClassicIcon name="edit" size={15}/><span>Edit</span></button> : null}{onDelete ? <button type="button" className="expense-ticket__menu-item expense-ticket__menu-item--danger" onClick={() => { setMenuKey(""); onDelete(ids); }}><UserClassicIcon name="trash" size={15}/><span>Delete</span></button> : null}</div></div> : null}
      </div>
      {hasOrders && !hideReason ? <div className="expense-ticket__reason expense-ticket__reason--block">{reasonText}</div> : null}
      <div className="expense-ticket__header-divider" aria-hidden="true" />
    </div>
    <div className="expense-ticket__legs">{rows.map((item, index) => { const route = userRoute(item); const amount = userAmount(item); const typeLabel = number(item?.cashIn) > 0 ? "Cash In" : text(item?.fundsType) || "Cash Out"; return <div className="expense-ticket__route" key={text(item?.id) || index}><div className="expense-ticket__route-frame"><div className="expense-ticket__route-shot"><UserExpenseShot item={item} onReceipt={onReceipt}/></div><div className="expense-ticket__route-body"><div className="expense-ticket__route-top"><div className="expense-ticket__route-title" dir="auto" title={typeLabel}>{typeLabel}</div><div className={`expense-ticket__route-amount ${amount.tone}`} title={amount.text}>{amount.text}</div></div><div className="expense-ticket__route-sub"><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--from" dir="auto" title={route.from}>{route.from}</span><span className="expense-ticket__route-arrow" aria-hidden="true"><UserClassicIcon name="arrow" size={16}/></span><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--to" dir="auto" title={route.to}>{route.to}</span></div></div></div></div>; })}</div><div className="expense-ticket__separator" aria-hidden="true" /><div className="expense-ticket__footer"><span className="expense-ticket__footer-label">Total</span><span className={`expense-ticket__footer-value ${total.tone}`}>{total.text}</span></div></article>;
}

export function UserExpensesModal({ user, ownCarRate = DEFAULT_OWN_CAR_RATE_EGP_PER_KM, permissions = {}, onClose, onUsersRefresh, notify }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("newest");
  const [filters, setFilters] = useState(EMPTY_EXPENSE_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_EXPENSE_FILTERS);
  const [control, setControl] = useState("");
  const { from: dateFrom, to: dateTo } = filters;
  const filterCount = expenseFilterCount(filters);
  const filterActive = filterCount > 0;
  const invalidDates = Boolean(draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to);
  const updateDraft = (key, value) => setDraftFilters(previous => ({ ...previous, [key]: value }));
  const toggleControl = (key) => {
    setMenuKey("");
    if (key === "filter" && control !== "filter") setDraftFilters(filters);
    setControl(control === key ? "" : key);
  };
  const [showPast, setShowPast] = useState(false);
  const [receiptItem, setReceiptItem] = useState(null);
  const [menuKey, setMenuKey] = useState("");
  const [exporting, setExporting] = useState(false);
  const [action, setAction] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  const overlayRef = useRef(null);
  const receiptTrigger = useRef(null);
  const openReceipt = (item) => {
    receiptTrigger.current = document.activeElement;
    setReceiptItem(item);
  };
  const closeReceipt = () => {
    setReceiptItem(null);
    requestAnimationFrame(() => receiptTrigger.current?.focus?.());
  };
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const heights = [viewport?.height, window.innerHeight, document.documentElement.clientHeight].filter(height => Number.isFinite(height) && height > 0);
      if (heights.length) overlay.style.setProperty("--user-expenses-visible-height", `${Math.floor(Math.min(...heights))}px`);
      overlay.style.setProperty("--user-expenses-visible-top", `${Math.max(0, viewport?.offsetTop || 0)}px`);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
    };
  }, []);

  const userId = text(user?.id || user?.userId);
  const load = async () => {
    setLoading(true);
    try {
      const nextPayload = await requestJson(`/next/api/expenses/user/${encodeURIComponent(userId)}`);
      setPayload(nextPayload);
      // Do not leave an applied select value that has disappeared after an edit/delete.
      // Preserve a selected destination during temporary directory outages rather than broadening the search.
      const reconcile = previous => {
        const next = { ...previous };
        if (!nextPayload.destinationOptionsUnavailable && next.destination && !nextPayload.destinationOptions?.some(option => option.id === next.destination)) next.destination = "";
        if (next.fundsType && !expenseFundsTypeOptions(nextPayload.items || []).some(option => option.value === next.fundsType)) next.fundsType = "";
        return next;
      };
      setFilters(reconcile);
      setDraftFilters(reconcile);
    }
    catch (error) { notify("Unable to load expenses", error?.message || "Failed to load this user's expenses.", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [userId]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpened(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setOpened(false);
    window.setTimeout(onClose, 300);
  };
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape" || action || receiptItem) return;
      if (control) setControl("");
      else if (menuKey) setMenuKey("");
      else requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [action, receiptItem, closing, control, menuKey]);

  const split = useMemo(() => splitBySettlement(payload?.items || [], payload?.lastSettledAt, payload?.lastSettledDate), [payload]);
  const destinationOptions = payload?.destinationOptions || [];
  const fundsTypeOptions = useMemo(() => expenseFundsTypeOptions(payload?.items || []), [payload]);
  const filteredRecent = useMemo(() => filterAndSort(split.recent, { ...filters, sortType: sort }), [split.recent, filters, sort]);
  const filteredPast = useMemo(() => filterAndSort(split.past, { ...filters, sortType: sort }), [split.past, filters, sort]);
  const combinedFiltered = useMemo(() => filterAndSort([...filteredRecent, ...filteredPast], { sortType: sort }), [filteredRecent, filteredPast, sort]);
  // An explicit filter searches both statement periods; the default remains the current balance.
  const totalItems = filterActive ? combinedFiltered : filteredRecent;
  const filteredNet = totalItems.reduce((sum, item) => sum + transactionValue(item), 0);
  const recentGroups = useMemo(() => groupUserExpenses(filteredRecent, sort), [filteredRecent, sort]);
  const pastGroups = useMemo(() => groupUserExpenses(filteredPast, sort), [filteredPast, sort]);
  const allDateGroups = useMemo(() => groupUserExpenses(combinedFiltered, sort), [combinedFiltered, sort]);

  const refreshAfterMutation = async () => { await Promise.all([load(), onUsersRefresh()]); };
  const exportExcel = async () => {
    const exportItems = totalItems;
    if (!exportItems.length) return notify("No expenses", filterActive ? "No expenses match the selected filters." : "No expenses to download.", "info");
    setExporting(true);
    try {
      const response = await fetch("/next/api/expenses/export-direct", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "users", kind: "excel", userName: `Expenses — ${user.name}`, userId, items: exportItems, dateFrom, dateTo, lastSettledAt: payload?.lastSettledAt, lastSettledDate: payload?.lastSettledDate }) });
      if (response.status === 401) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Expense export failed."); }
      downloadBlob(await response.blob(), responseFileName(response, `${user.name}_expenses.xlsx`));
    } catch (error) { notify("Download failed", error?.message || "Failed to download expenses.", "error"); }
    finally { setExporting(false); }
  };

  const beginEdit = (rows) => setAction({ type: "edit", rows });
  const beginDelete = (ids) => setAction({ type: "password", mode: "delete", ids });
  const continueWithPassword = (password) => {
    if (!password) return notify("Admin password", "Enter the Admin password to continue.", "info");
    if (action?.mode === "delete") setAction({ type: "delete-confirm", ids: action.ids, password });
  };
  const deleteGroup = async () => {
    const ids = Array.isArray(action?.ids) ? action.ids : [];
    if (!ids.length) return setAction(null);
    setDeleteBusy(true);
    try {
      for (const id of ids) {
        await requestExpenseAdminMutation("admin-delete", { expenseId: id, adminPassword: action.password });
      }
      notify("Deleted", "Expense deleted successfully.", "success");
      setAction(null);
      await refreshAfterMutation();
    } catch (error) { notify("Delete failed", error?.message || "Failed to delete expense.", "error"); }
    finally { setDeleteBusy(false); }
  };

  const renderGroups = (groups) => groups.length ? groups.map((group) => <UserExpenseTicket group={group} canViewOrderReceipts={permissions.viewOrderReceipts !== false} onReceipt={openReceipt} onEdit={permissions.edit && payload?.canEdit ? beginEdit : null} onDelete={permissions.delete ? beginDelete : null} menuKey={menuKey} setMenuKey={setMenuKey} key={group.key}/>) : <div className="expenses-empty">Sorry, No data available</div>;

  return createPortal(<>
    <div className={`ios-modal next-ios-modal-open ${styles.overlay}`} ref={overlayRef} style={{ display: "flex" }} role="dialog" aria-modal={receiptItem || action ? undefined : true} aria-hidden={receiptItem || action ? true : undefined} inert={receiptItem || action ? true : undefined} aria-labelledby="user-expenses-sheet-title" onMouseDown={(event) => event.target === event.currentTarget && !receiptItem && !action && requestClose()}>
      <div className={`ios-sheet ${styles.sheet}`} style={{ transform: opened && !closing ? "translateY(0)" : "translateY(100%)" }} onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <span className={styles.floatingIcon} aria-hidden="true"><UserClassicIcon name="wallet" size={28}/></span>
          <h2 id="user-expenses-sheet-title" className={styles.title}>Expenses — {user.name || "User"}</h2>
        </header>
        <div className={`sheet-scroll ${styles.scroll}`}>
          <div className={`total-balance-card ${styles.balance}${filteredNet < 0 ? " is-negative" : filteredNet > 0 ? " is-positive" : ""}`}><div className="total-balance-meta"><div className="total-balance-label"><UserClassicIcon name="card" size={18}/>{filterActive ? "Filtered balance" : "Total balance"}</div></div><div className="total-balance-value">{formatGBP(filteredNet)}</div></div>
          <div className={styles.controls}>
            <div className={styles.toolbar}>
              {permissions.export ? <button className={styles.download} type="button" onClick={exportExcel} disabled={exporting || loading}><UserClassicIcon name="download" size={18}/>{exporting ? "Preparing…" : "Download Excel"}</button> : null}
              <div className={styles.tools}>
                <button type="button" className={`${styles.tool} ${control === "sort" ? styles.active : ""}`} aria-label="Sort expenses" title="Sort expenses" aria-expanded={control === "sort"} aria-controls="user-expense-sort-options" onClick={() => toggleControl("sort")}><UserClassicIcon name="sort" size={21}/></button>
                <button type="button" className={`${styles.tool} ${control === "filter" || filterActive ? styles.active : ""}`} aria-label={`Filter expenses${filterActive ? ` (${filterCount} active)` : ""}`} title="Filter expenses" aria-expanded={control === "filter"} aria-controls="user-expense-filter-options" onClick={() => toggleControl("filter")}><UserClassicIcon name="filter" size={21}/>{filterActive ? <span className={styles.count}>{filterCount}</span> : null}</button>
              </div>
            </div>
            {control === "sort" ? <div id="user-expense-sort-options" className={styles.sortPanel} role="group" aria-label="Sort expenses">{[["newest", "Newest first"], ["oldest", "Oldest first"], ["high", "Highest amount"], ["low", "Lowest amount"]].map(([value, label]) => <button className={styles.sortOption} type="button" aria-pressed={sort === value} key={value} onClick={() => { setSort(value); setControl(""); }}><span>{label}</span>{sort === value ? <span aria-hidden="true">✓</span> : null}</button>)}</div> : null}
            {control === "filter" ? <form id="user-expense-filter-options" className={styles.filterPanel} onSubmit={event => { event.preventDefault(); if (!invalidDates) { setFilters({ ...draftFilters }); setControl(""); setMenuKey(""); } }}>
              <div className={styles.filterHeading}>Filter by date</div>
              <div className={styles.dates}><label className={styles.field}>From<input type="date" aria-label="From date" value={draftFilters.from} onChange={event => updateDraft("from", event.target.value)}/></label><label className={styles.field}>To<input type="date" aria-label="To date" value={draftFilters.to} onChange={event => updateDraft("to", event.target.value)}/></label></div>
              {invalidDates ? <span className={styles.error} role="alert">From date must be before or equal to To date.</span> : null}
              <label className={styles.field}>Filter by funds type<select value={draftFilters.fundsType} onChange={event => updateDraft("fundsType", event.target.value)}><option value="">All funds types</option>{fundsTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className={styles.field}>Filter by destination<select value={draftFilters.destination} onChange={event => updateDraft("destination", event.target.value)} disabled={loading || payload?.destinationOptionsUnavailable}><option value="">{payload?.destinationOptionsUnavailable ? "Destinations unavailable" : "All destinations"}</option>{destinationOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
              <label className={styles.check}><input type="checkbox" checked={draftFilters.otherReason} onChange={event => updateDraft("otherReason", event.target.checked)}/>Other reason</label>
              <div className={styles.filterActions}><button className={styles.reset} type="button" onClick={() => { setDraftFilters(EMPTY_EXPENSE_FILTERS); setFilters(EMPTY_EXPENSE_FILTERS); setMenuKey(""); }}>Reset</button><button className={styles.apply} type="submit" disabled={invalidDates}>Apply</button></div>
            </form> : null}
          </div>
          <div id="userExpensesList">{loading ? <div className="expenses-empty">Loading expenses…</div> : filterActive ? renderGroups(allDateGroups) : <>{renderGroups(recentGroups)}{showPast && pastGroups.length ? <><div className="expenses-separator"><span>Past expenses</span></div>{renderGroups(pastGroups)}</> : null}</>}</div>
          {!filterActive && split.past.length ? <div className="past-expenses-wrapper"><button className="past-expenses-btn" type="button" onClick={() => setShowPast((value) => !value)}>{showPast ? "Hide past expenses" : "Show past expenses"}</button></div> : null}
        </div>
        <footer className={styles.footer}>
          <button className={styles.closeButton} type="button" onClick={requestClose} disabled={closing}>Close</button>
        </footer>
      </div>
    </div>
    {receiptItem ? <ReceiptViewer item={receiptItem} onClose={closeReceipt} /> : null}
    {action?.type === "password" ? <AdminPasswordModal mode={action.mode} count={action.ids?.length || 1} onClose={() => setAction(null)} onContinue={continueWithPassword} /> : null}
    {action?.type === "edit" ? <EditUserExpense rows={action.rows} ownCarRate={ownCarRate} saveExpense={(expenseId, expense) => requestExpenseAdminMutation("admin-update", { expenseId, expense })} onClose={() => setAction(null)} onSaved={refreshAfterMutation} notify={notify} /> : null}
    {action?.type === "delete-confirm" ? <DeleteConfirmationModal count={action.ids?.length || 1} busy={deleteBusy} onClose={() => setAction(null)} onConfirm={deleteGroup} /> : null}
  </>, document.body);
}

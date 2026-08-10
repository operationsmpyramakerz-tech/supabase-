"use client";

import { useEffect, useMemo, useState } from "react";

const SETTLEMENT_KEY = "settledmyaccount";

function text(value) { return String(value ?? "").trim(); }
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
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function normalized(value) { return lower(value).replace(/[^a-z0-9\u0600-\u06ff]+/g, ""); }
function isSettlement(item) { return normalized(item?.fundsType) === SETTLEMENT_KEY || normalized(item?.reason) === SETTLEMENT_KEY; }
function money(value, { signed = false } = {}) {
  const amount = number(value);
  const formatted = new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(Math.abs(amount));
  if (signed && amount !== 0) return `${amount > 0 ? "+" : "-"}£${formatted}`;
  return `${amount < 0 ? "-" : ""}£${formatted}`;
}
function formatDate(value, fallback = "—") {
  const raw = text(value);
  if (!raw) return fallback;
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function transactionTime(item) {
  const raw = text(item?.createdTime || item?.created_time || item?.date);
  const value = raw ? new Date(raw.length === 10 ? `${raw}T00:00:00` : raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
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
  if (!response.ok || body?.success === false || body?.ok === false) {
    throw new Error(body?.error || body?.message || `Request failed with ${response.status}.`);
  }
  return body;
}
function splitBySettlement(items, apiSettledAt, apiSettledDate) {
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => transactionTime(b) - transactionTime(a));
  const settlement = sorted.find(isSettlement) || null;
  const boundaryRaw = text(apiSettledAt || settlement?.createdTime || settlement?.created_time || apiSettledDate || settlement?.date);
  const boundary = boundaryRaw ? new Date(boundaryRaw.length === 10 ? `${boundaryRaw}T23:59:59` : boundaryRaw).getTime() : 0;
  if (!boundary) return { recent: sorted, past: [], settlement: null };
  return {
    recent: sorted.filter((item) => !isSettlement(item) && transactionTime(item) > boundary),
    past: sorted.filter((item) => transactionTime(item) <= boundary || isSettlement(item)),
    settlement,
  };
}
async function imageFilesPayload(files) {
  const selected = Array.from(files || []);
  if (selected.length > 6) throw new Error("You can upload up to 6 receipt images.");
  return Promise.all(selected.map(async (file) => {
    if (!String(file.type || "").startsWith("image/")) throw new Error(`${file.name || "File"} is not an image.`);
    if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name || "Image"} is larger than 12 MB.`);
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read the selected image."));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to process the selected image."));
      img.src = source;
    });
    const maximum = 1500;
    const scale = Math.min(1, maximum / Math.max(image.width || 1, image.height || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { name: file.name || "receipt.jpg", dataUrl: canvas.toDataURL("image/jpeg", 0.8) };
  }));
}

function Modal({ title, subtitle, onClose, children, footer, className = "" }) {
  return (
    <div className="next-expense-users-modal" role="dialog" aria-modal="true">
      <button className="next-expense-users-modal__backdrop" type="button" onClick={onClose} aria-label="Close" />
      <section className={`next-expense-users-modal__card ${className}`}>
        <header><div><span>Expenses Users</span><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="next-expense-users-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className={`next-expense-users-toast is-${toast.type || "info"}`}><div><strong>{toast.title}</strong><span>{toast.message}</span></div><button type="button" onClick={onClose}>×</button></div>;
}

function ReceiptViewer({ item, onClose }) {
  const screenshots = screenshotsFor(item);
  return (
    <div className="expense-shots-modal is-open" style={{ display: "flex" }} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="expense-shots-modal__card" role="dialog" aria-modal="true">
        <div className="expense-shots-modal__head"><div><h4 className="expense-shots-modal__title">Screenshots</h4><div className="expense-shots-modal__count">{screenshots.length ? `${screenshots.length} image${screenshots.length === 1 ? "" : "s"}` : "No images uploaded"}</div></div><button type="button" className="expense-shots-modal__close" onClick={onClose} aria-label="Close screenshots viewer">×</button></div>
        <div className="expense-shots-modal__body">{screenshots.length ? <div className="expense-shots-modal__grid">{screenshots.map((shot, index) => { const fallback = `/api/expenses/screenshot/${encodeURIComponent(text(item?.id))}?index=${index}`; return <a className="expense-shots-modal__item" href={shot.url || fallback} target="_blank" rel="noreferrer" key={`${shot.url}-${index}`}><span className="expense-shots-modal__image-wrap"><img className="expense-shots-modal__image" src={shot.url || fallback} alt={shot.name}/></span><span className="expense-shots-modal__caption">{shot.name}</span></a>; })}</div> : <div className="expense-shots-modal__empty"><div className="expense-shots-modal__empty-icon"><UserClassicIcon name="image" size={24}/></div><div>No screenshots uploaded for this expense.</div></div>}</div>
      </div>
    </div>
  );
}

function EditExpenseModal({ item, user, onClose, onSaved, notify }) {
  const originalShots = screenshotsFor(item);
  const [form, setForm] = useState({
    date: text(item?.date), reason: text(item?.reason), fundsType: text(item?.fundsType),
    from: text(item?.from), to: text(item?.to), cashIn: number(item?.cashIn) || "",
    cashOut: number(item?.cashOut) || "", kilometer: number(item?.kilometer) || "",
    cashInFrom: text(item?.cashInFrom), adminPassword: "",
  });
  const [existingShots, setExistingShots] = useState(originalShots);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    if (!form.adminPassword.trim()) return notify("Admin password is required.", "error");
    if (!form.date) return notify("Expense date is required.", "error");
    setBusy(true);
    try {
      const screenshots = await imageFilesPayload(files);
      await requestJson(`/api/expenses/user-expense/${encodeURIComponent(text(item?.id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: form.adminPassword,
          expense: {
            date: form.date, reason: form.reason, fundsType: form.fundsType,
            from: form.from, to: form.to, cashIn: number(form.cashIn), cashOut: number(form.cashOut),
            kilometer: number(form.kilometer), cashInFrom: form.cashInFrom,
            screenshotUrls: existingShots.map((shot) => shot.url), screenshots,
          },
        }),
      });
      notify("Expense updated", `${user.name}'s transaction was saved.`, "success");
      await onSaved();
      onClose();
    } catch (error) { notify("Update failed", error?.message || "Failed to update the expense.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Edit expense" subtitle={`Update the selected transaction for ${user.name}.`} onClose={onClose} footer={<><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></>}>
      <div className="next-expense-users-form-grid">
        <label><span>Date *</span><input type="date" value={form.date} onChange={update("date")} /></label>
        <label><span>Funds type</span><input value={form.fundsType} onChange={update("fundsType")} /></label>
        <label className="is-wide"><span>Reason</span><input value={form.reason} onChange={update("reason")} /></label>
        <label><span>From</span><input value={form.from} onChange={update("from")} /></label>
        <label><span>To</span><input value={form.to} onChange={update("to")} /></label>
        <label><span>Cash in</span><input type="number" min="0" step="0.01" value={form.cashIn} onChange={update("cashIn")} /></label>
        <label><span>Cash out</span><input type="number" min="0" step="0.01" value={form.cashOut} onChange={update("cashOut")} /></label>
        <label><span>Kilometer</span><input type="number" min="0" step="0.01" value={form.kilometer} onChange={update("kilometer")} /></label>
        <label><span>Cash in from</span><input value={form.cashInFrom} onChange={update("cashInFrom")} /></label>
        <div className="is-wide next-expense-users-existing-receipts"><span>Current receipts</span>{existingShots.length ? <div>{existingShots.map((shot, index) => <article key={`${shot.url}-${index}`}><img src={shot.url} alt="" /><span>{shot.name}</span><button type="button" onClick={() => setExistingShots((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></article>)}</div> : <small>No current receipts.</small>}</div>
        <label className="is-wide"><span>Add receipt images</span><input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><small>{files.length ? `${files.length} selected` : "Up to 6 images, 12 MB each."}</small></label>
        <label className="is-wide"><span>Admin password *</span><input type="password" autoComplete="current-password" value={form.adminPassword} onChange={update("adminPassword")} /></label>
      </div>
    </Modal>
  );
}

function DeleteExpenseModal({ item, user, onClose, onDeleted, notify }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!password.trim()) return notify("Admin password is required.", "error");
    setBusy(true);
    try {
      await requestJson(`/api/expenses/user-expense/${encodeURIComponent(text(item?.id))}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminPassword: password }),
      });
      notify("Expense deleted", `${user.name}'s transaction was removed.`, "success");
      await onDeleted();
      onClose();
    } catch (error) { notify("Delete failed", error?.message || "Failed to delete the expense.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Delete expense" subtitle="This permanently removes the transaction and its stored receipts." onClose={onClose} footer={<><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="danger-button" type="button" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</button></>}>
      <div className="next-expense-users-delete-warning"><strong>{text(item?.reason) || text(item?.fundsType) || "Expense transaction"}</strong><span>{formatDate(item?.date)} · {money(transactionValue(item), { signed: true })}</span></div>
      <label className="next-expense-users-password-field"><span>Admin password *</span><input type="password" autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    </Modal>
  );
}

function TransactionRow({ item, onReceipt, onEdit, onDelete }) {
  const value = transactionValue(item);
  const cashIn = number(item?.cashIn) > 0;
  const settlement = isSettlement(item);
  const orders = ordersFor(item);
  const shots = screenshotsFor(item);
  const from = text(item?.from || item?.cashInFrom) || (cashIn ? "Cash in" : "—");
  const to = text(item?.to) || (cashIn ? "Wallet" : "—");
  return (
    <article className={`next-expense-users-transaction ${cashIn ? "is-in" : "is-out"} ${settlement ? "is-settlement" : ""}`}>
      <div className="next-expense-users-transaction__icon">{settlement ? "✓" : cashIn ? "↙" : "↗"}</div>
      <div className="next-expense-users-transaction__main">
        <header><div><strong>{text(item?.reason) || text(item?.fundsType) || (cashIn ? "Cash in" : "Cash out")}</strong><span>{text(item?.fundsType) || (cashIn ? "Cash in" : "Cash out")}</span></div><b>{money(value, { signed: true })}</b></header>
        <div className="next-expense-users-transaction__meta"><span>{formatDate(item?.date)}</span><span>{from} → {to}</span>{number(item?.kilometer) > 0 ? <span>{number(item.kilometer)} km</span> : null}</div>
        {orders.length ? <div className="next-expense-users-order-links">{orders.map((order, index) => {
          const href = modernTrackingHref(order) || "/next/orders";
          const receiptHref = modernReceiptViewerHref(order);
          return <span className="next-expense-users-order-link-group" key={text(order?.key || order?.orderId) || index}><a href={href} target="_blank" rel="noreferrer">{text(order?.label || order?.orderId) || "Linked order"}</a>{receiptHref ? <a className="receipt-link" href={receiptHref} target="_blank" rel="noreferrer">Receipts</a> : null}</span>;
        })}</div> : null}
      </div>
      <div className="next-expense-users-transaction__actions">
        <button type="button" disabled={!shots.length} onClick={() => onReceipt(item)} title="Receipts">▧<span>{shots.length || ""}</span></button>
        <button type="button" onClick={() => onEdit(item)} title="Edit">✎</button>
        <button className="danger" type="button" onClick={() => onDelete(item)} title="Delete">×</button>
      </div>
    </article>
  );
}

function UserClassicIcon({ name, size = 18 }) {
  const common = { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const icons = {
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    filter: <><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></>,
    rotate: <><polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></>,
    sort: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    arrow: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></>,
  };
  return <svg {...common}>{icons[name] || icons.card}</svg>;
}

function userDisplayReason(item) {
  return text(item?.reason) || text(ordersFor(item)[0]?.label) || (number(item?.cashIn) > 0 ? "Cash In" : text(item?.fundsType) || "Cash Out");
}

function userRoute(item) {
  const cashIn = number(item?.cashIn) > 0;
  return { from: text(item?.from || item?.cashInFrom) || (cashIn ? "Cash in" : "—"), to: text(item?.to) || (cashIn ? "Wallet" : "—") };
}

function userAmount(item) {
  const cashIn = number(item?.cashIn), cashOut = number(item?.cashOut), km = number(item?.kilometer);
  if (cashIn > 0) return { text: `+${money(cashIn)}`, tone: "is-positive" };
  if (normalized(item?.fundsType) === "owncar" && km > 0 && !cashOut) return { text: `${km} km`, tone: "is-neutral" };
  if (cashOut > 0) return { text: `-${money(cashOut)}`, tone: "is-negative" };
  return { text: money(0), tone: "is-neutral" };
}

function groupUserExpenses(items, sort = "newest") {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const reason = userDisplayReason(item), date = text(item?.date), key = `${date}__${lower(reason)}`;
    if (!map.has(key)) map.set(key, { key, date, reason, items: [], orders: new Map(), cashIn: 0, cashOut: 0, kilometers: 0, created: transactionTime(item) });
    const group = map.get(key); group.items.push(item); group.cashIn += number(item?.cashIn); group.cashOut += number(item?.cashOut); group.kilometers += number(item?.kilometer); group.created = Math.max(group.created, transactionTime(item));
    for (const order of ordersFor(item)) { const orderKey = text(order?.key || order?.orderId || order?.label); if (orderKey && !group.orders.has(orderKey)) group.orders.set(orderKey, order); }
  }
  const rows = [...map.values()].map((group) => ({ ...group, orders: [...group.orders.values()], total: group.cashIn - group.cashOut }));
  rows.sort((a,b) => sort === "oldest" ? a.created-b.created : sort === "amount-high" ? b.total-a.total : sort === "amount-low" ? a.total-b.total : b.created-a.created);
  return rows;
}

function UserExpenseShot({ item, onReceipt }) {
  const shots = screenshotsFor(item);
  return <button className={`expense-ticket__shot-btn${shots.length ? " expense-ticket__shot-btn--has-shots" : ""}`} type="button" disabled={!shots.length} onClick={() => shots.length && onReceipt(item)}><span className="expense-ticket__shot-btn-icon"><UserClassicIcon name="image" size={18}/></span></button>;
}

function UserExpenseOrderActions({ orders }) {
  if (!orders?.length) return null;
  return <div className="expense-ticket__order-actions">{orders.map((order,index) => { const href = modernReceiptViewerHref(order) || modernTrackingHref(order); const label = [text(order?.orderId), text(order?.orderType)].filter(Boolean).join(" · ") || text(order?.label) || "Order"; return href ? <a className="expense-ticket__order-btn" href={href} target="_blank" rel="noreferrer" key={`${label}-${index}`}>{label}</a> : <span className="expense-ticket__order-btn expense-ticket__order-btn--disabled" key={`${label}-${index}`}>{label}</span>; })}</div>;
}

function UserExpenseTicket({ group, onReceipt, onEdit, onDelete, menuKey, setMenuKey }) {
  const total = group.total > 0 ? { text: `+${money(group.total)}`, tone: "is-positive" } : group.total < 0 ? { text: `-${money(Math.abs(group.total))}`, tone: "is-negative" } : (!group.cashIn && !group.cashOut && group.kilometers ? { text: `${group.kilometers} km`, tone: "is-neutral" } : { text: money(0), tone: "is-neutral" });
  const primary = group.items[0];
  return <article className="expense-ticket">
    <div className="expense-ticket__top"><div className={`expense-ticket__header-row${group.orders.length ? " expense-ticket__header-row--with-order" : ""}`}><div className="expense-ticket__meta"><span className="expense-ticket__date">{formatDate(group.date, group.date || "No date")}</span></div><div className="expense-ticket__header-side"><div className={`expense-ticket__actions${menuKey === group.key ? " is-open" : ""}`}><button type="button" className="expense-ticket__more" onClick={() => setMenuKey(menuKey === group.key ? "" : group.key)} aria-label="Expense actions">⋯</button><div className="expense-ticket__menu"><button type="button" className="expense-ticket__menu-item" onClick={() => { setMenuKey(""); onEdit(primary); }}><UserClassicIcon name="edit" size={15}/><span>Edit</span></button><button type="button" className="expense-ticket__menu-item expense-ticket__menu-item--danger" onClick={() => { setMenuKey(""); onDelete(primary); }}><UserClassicIcon name="trash" size={15}/><span>Delete</span></button></div></div>{group.orders.length ? <UserExpenseOrderActions orders={group.orders}/> : <div className="expense-ticket__reason">{group.reason}</div>}</div></div>{group.orders.length ? <div className="expense-ticket__reason expense-ticket__reason--block">{group.reason}</div> : null}<div className="expense-ticket__header-divider"/></div>
    <div className="expense-ticket__legs">{group.items.map((item,index) => { const route=userRoute(item), amount=userAmount(item); return <div className="expense-ticket__route" key={text(item?.id) || index}><div className="expense-ticket__route-frame"><div className="expense-ticket__route-shot"><UserExpenseShot item={item} onReceipt={onReceipt}/></div><div className="expense-ticket__route-body"><div className="expense-ticket__route-top"><div className="expense-ticket__route-title">{number(item?.cashIn)>0 ? "Cash In" : text(item?.fundsType) || "Cash Out"}</div><div className={`expense-ticket__route-amount ${amount.tone}`}>{amount.text}</div></div><div className="expense-ticket__route-sub"><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--from">{route.from}</span><span className="expense-ticket__route-arrow"><UserClassicIcon name="arrow" size={16}/></span><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--to">{route.to}</span></div></div></div></div>; })}</div>
    <div className="expense-ticket__separator"/><div className="expense-ticket__footer"><span className="expense-ticket__footer-label">Total</span><span className={`expense-ticket__footer-value ${total.tone}`}>{total.text}</span></div>
  </article>;
}

function UserExpensesModal({ user, onClose, onUsersRefresh, notify }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [receiptItem, setReceiptItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [exporting, setExporting] = useState("");
  const [menuKey, setMenuKey] = useState("");

  const load = async () => {
    setLoading(true);
    try { const body = await requestJson(`/api/expenses/user/${encodeURIComponent(text(user?.id || user?.userId))}`); setPayload(body); }
    catch (error) { notify("Unable to load expenses", error?.message || "Failed to load this user's expenses.", "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [user?.id, user?.userId]);

  const split = useMemo(() => splitBySettlement(payload?.items || [], payload?.lastSettledAt, payload?.lastSettledDate), [payload]);
  const dateFilterActive = !!(dateFrom || dateTo);
  const filteredRecent = useMemo(() => split.recent.filter((item) => { const date=text(item?.date); return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo); }), [split.recent,dateFrom,dateTo]);
  const filteredPast = useMemo(() => split.past.filter((item) => { const date=text(item?.date); return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo); }), [split.past,dateFrom,dateTo]);
  const visible = dateFilterActive ? [...filteredRecent, ...filteredPast] : (showPast ? [...filteredRecent, ...filteredPast] : filteredRecent);
  const balanceItems = dateFilterActive ? [...filteredRecent, ...filteredPast] : filteredRecent;
  const filteredNet = balanceItems.reduce((sum,item) => sum + transactionValue(item), 0);
  const recentGroups = useMemo(() => groupUserExpenses(filteredRecent, sort), [filteredRecent, sort]);
  const pastGroups = useMemo(() => groupUserExpenses(filteredPast, sort), [filteredPast, sort]);
  const allDateGroups = useMemo(() => groupUserExpenses([...filteredRecent, ...filteredPast], sort), [filteredRecent, filteredPast, sort]);

  const refreshAfterMutation = async () => { await Promise.all([load(), onUsersRefresh()]); };
  const exportFile = async (fileType) => {
    if (!visible.length) return notify("Nothing to export", "No transactions match the active filters.", "info");
    setExporting(fileType);
    try {
      const response = await fetch(`/api/expenses/export/${fileType}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userName: `Expenses — ${user.name}`, userId: text(user?.id || user?.userId), items: visible, dateFrom, dateTo, lastSettledAt: payload?.lastSettledAt, lastSettledDate: payload?.lastSettledDate }) });
      if (response.status === 401) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Expense export failed."); }
      downloadBlob(await response.blob(), responseFileName(response, fileType === "excel" ? `${user.name}_expenses.xlsx` : `${user.name}_expenses.pdf`));
      notify("Export downloaded", `${user.name}'s ${fileType.toUpperCase()} report is ready.`, "success");
    } catch (error) { notify("Export failed", error?.message || "Expense export failed.", "error"); }
    finally { setExporting(""); }
  };

  const renderGroups = (groups) => groups.length ? groups.map((group) => <UserExpenseTicket group={group} onReceipt={setReceiptItem} onEdit={setEditItem} onDelete={setDeleteItem} menuKey={menuKey} setMenuKey={setMenuKey} key={group.key}/>) : <div className="expenses-empty">Sorry, No data available</div>;

  return <>
    <div className="ios-modal next-ios-modal-open" style={{ display: "flex" }} role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="ios-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="ios-drag"/>
        <div className="user-expenses-header"><div className="sheet-header"><div className="sheet-header-text"><div className="user-expenses-title">{user.name || "User Expenses"}</div><div className="user-expenses-sub">All expenses for this team member</div></div></div></div>
        <div className="sheet-scroll">
          <div className={`total-balance-card ${filteredNet < 0 ? "is-negative" : filteredNet > 0 ? "is-positive" : ""}`}><div className="total-balance-meta"><div className="total-balance-label"><UserClassicIcon name="card" size={18}/>Total balance</div><div className="total-balance-hint">After filters applied</div></div><div className="total-balance-value">{money(filteredNet, { signed: true })}</div></div>
          <div className="sheet-controls">
            <div className="controls-row"><div className="download-wrapper next-expense-users-downloads"><button className="download-btn" type="button" onClick={() => exportFile("excel")} disabled={!!exporting}><UserClassicIcon name="download" size={18}/>{exporting === "excel" ? "Preparing Excel…" : "Download Excel"}</button><button className="download-btn next-expense-users-pdf" type="button" onClick={() => exportFile("pdf")} disabled={!!exporting}>{exporting === "pdf" ? "Preparing PDF…" : "PDF"}</button></div><div className="sort-wrapper"><label className="control-label">Sort</label><div className="select-with-icon"><UserClassicIcon name="sort" size={18}/><select className="sort-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Highest amount</option><option value="amount-low">Lowest amount</option></select></div></div></div>
            <div className="date-filter"><div className="date-field"><label>From</label><input type="date" value={draftDateFrom} onChange={(event) => setDraftDateFrom(event.target.value)}/></div><div className="date-field"><label>To</label><input type="date" value={draftDateTo} onChange={(event) => setDraftDateTo(event.target.value)}/></div><div className="date-actions"><button className="filter-btn" type="button" onClick={() => { setDateFrom(draftDateFrom); setDateTo(draftDateTo); }}><UserClassicIcon name="filter" size={18}/>Apply</button><button className="filter-btn reset-btn" type="button" onClick={() => { setDraftDateFrom(""); setDraftDateTo(""); setDateFrom(""); setDateTo(""); }}><UserClassicIcon name="rotate" size={18}/>Reset</button></div></div>
          </div>
          <div id="userExpensesList">{loading ? <div className="loader"/> : dateFilterActive ? renderGroups(allDateGroups) : <>{renderGroups(recentGroups)}{showPast && pastGroups.length ? <><div className="expenses-separator"><span>Past expenses</span></div>{renderGroups(pastGroups)}</> : null}</>}</div>
          {!dateFilterActive && split.past.length ? <div className="past-expenses-wrapper"><button className="past-expenses-btn" type="button" onClick={() => setShowPast((value) => !value)}>{showPast ? "Hide past expenses" : "Show past expenses"}</button></div> : null}
        </div>
        <button className="modal-close-btn" type="button" onClick={onClose}>Close</button>
      </div>
    </div>
    {receiptItem ? <ReceiptViewer item={receiptItem} onClose={() => setReceiptItem(null)} /> : null}
    {editItem ? <EditExpenseModal item={editItem} user={user} onClose={() => setEditItem(null)} onSaved={refreshAfterMutation} notify={notify} /> : null}
    {deleteItem ? <DeleteExpenseModal item={deleteItem} user={user} onClose={() => setDeleteItem(null)} onDeleted={refreshAfterMutation} notify={notify} /> : null}
  </>;
}

export default function ExpensesUsersClient({ account, initialUsersPayload, bootstrapWarnings = [] }) {
  const [users, setUsers] = useState(Array.isArray(initialUsersPayload?.users) ? initialUsersPayload.users : []);
  const [selectedUser, setSelectedUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const notify = (title, message = "", type = "info") => {
    if (["success", "error", "info"].includes(message) && type === "info") {
      setToast({ title, message: title, type: message });
      return;
    }
    setToast({ title, message: message || title, type });
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const body = await requestJson("/api/expenses/users");
      setUsers(Array.isArray(body?.users) ? body.users : []);
      return body;
    } catch (error) { notify("Refresh failed", error?.message || "Failed to refresh expense users.", "error"); throw error; }
    finally { setBusy(false); }
  };

  const visibleUsers = users;

  return (
    <>
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some expense-user data was delayed.</strong><span>The loaded balances remain available and can be refreshed automatically when a user is opened.</span><a href="/expenses/users?classic=1">Open classic Expenses Users</a></div> : null}
      <div className="expenses-layout next-expense-users-classic-parity">
        <div className="user-tabs">
          {busy ? <div className="loader" /> : visibleUsers.length ? visibleUsers.map((user) => {
            const total = number(user.total);
            const key = text(user.id || user.userId || user.name);
            const active = text(selectedUser?.id || selectedUser?.userId || selectedUser?.name) === key;
            const count = number(user.count);
            return <button type="button" className={`user-tab${total < 0 ? " has-negative" : total > 0 ? " has-positive" : ""}${active ? " active" : ""}`} onClick={() => setSelectedUser(user)} key={key}>
              <div className="user-tab__header"><span className="user-tab__count">{count} item{count === 1 ? "" : "s"}</span><span className="user-tab__name">{user.name || "Unknown user"}</span></div>
              <div className="user-tab__divider" aria-hidden="true" />
              <div className="user-tab__body"><span className="user-tab__label">Current balance</span><span className="user-total">{money(total, { signed: true })}</span></div>
              <div className="user-tab__footer"><span className="user-tab__footer-label">Last settled</span><span className="user-settled">{formatDate(user.lastSettledDate)}</span></div>
            </button>;
          }) : <div className="users-empty"><div className="expenses-empty">Sorry, No data available</div></div>}
        </div>
      </div>
      {selectedUser ? <UserExpensesModal user={selectedUser} onClose={() => setSelectedUser(null)} onUsersRefresh={refresh} notify={notify} /> : null}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

const SETTLEMENT_KEY = "settledmyaccount";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function normalized(value) { return lower(value).replace(/[^a-z0-9\u0600-\u06ff]+/g, ""); }
function normalizeGroupText(value) { return text(value).replace(/\s+/g, " ").toLowerCase(); }
function isSettlement(item) { return normalized(item?.fundsType) === SETTLEMENT_KEY || normalized(item?.reason) === SETTLEMENT_KEY; }
function isOwnCar(item) { return lower(item?.fundsType) === "own car"; }

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
  const kilometer = number(item?.kilometer);
  if (cashIn > 0) return { text: `+£${formatExpenseNumber(cashIn)}`, tone: "is-positive" };
  if (isOwnCar(item) && kilometer > 0 && !cashOut) return { text: `${formatExpenseNumber(kilometer)} km`, tone: "is-neutral" };
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

function filterAndSort(items, { from = "", to = "", sortType = "newest" } = {}) {
  let result = Array.isArray(items) ? [...items] : [];
  if (from || to) {
    result = result.filter((item) => {
      const raw = item?.date || item?.createdTime || item?.created_time || null;
      if (!raw) return true;
      const key = toLocalDateKey(raw);
      if (!key) return true;
      if (from && key < from) return false;
      if (to && key > to) return false;
      return true;
    });
  }
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
    const key = `${date}__${normalizeGroupText(reason)}`;
    if (!grouped.has(key)) {
      grouped.set(key, { key, date, reason: reason || "No reason", items: [], ordersMap: new Map(), totalCashIn: 0, totalCashOut: 0, totalKilometer: 0, createdSort: transactionTime(item) });
    }
    const group = grouped.get(key);
    group.items.push(item);
    group.totalCashIn += number(item?.cashIn);
    group.totalCashOut += number(item?.cashOut);
    group.totalKilometer += number(item?.kilometer);
    group.createdSort = Math.max(group.createdSort || 0, transactionTime(item));
    for (const order of ordersFor(item)) {
      const orderKey = text(order?.key || order?.orderId || order?.label);
      if (orderKey && !group.ordersMap.has(orderKey)) group.ordersMap.set(orderKey, order);
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
  const kilometer = number(group?.totalKilometer);
  const hasCash = Math.abs(number(group?.totalCashIn)) > 1e-9 || Math.abs(number(group?.totalCashOut)) > 1e-9;
  if (!hasCash && kilometer > 0) return { text: `${formatExpenseNumber(kilometer)} km`, tone: "is-neutral" };
  if (cashNet > 0) return { text: `+£${formatExpenseNumber(cashNet)}`, tone: "is-positive" };
  if (cashNet < 0) return { text: `-£${formatExpenseNumber(Math.abs(cashNet))}`, tone: "is-negative" };
  return { text: "£0", tone: "is-neutral" };
}

function shouldHideGroupReason(group) {
  const reason = normalizeGroupText(group?.reason);
  if (!reason || !Array.isArray(group?.orders) || !group.orders.length) return false;
  return group.orders.some((order) => {
    const label = normalizeGroupText(order?.label);
    const orderId = normalizeGroupText(order?.orderId);
    return (!!label && reason === label) || (!!orderId && reason === orderId);
  });
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

function shouldCompressImage(file) {
  const type = lower(file?.type);
  const name = lower(file?.name);
  if (type === "image/gif" || type === "image/svg+xml" || /\.(gif|svg)$/i.test(name)) return false;
  return type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|avif)$/i.test(name);
}

async function fileToExpenseDataUrl(file) {
  const raw = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
  if (!raw || !shouldCompressImage(file)) return raw;
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image for compression."));
      img.src = raw;
    });
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const ratio = Math.min(1, 1600 / width, 1600 / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let compressed = canvas.toDataURL("image/webp", 0.72);
    if (!/^data:image\/webp/i.test(compressed)) compressed = canvas.toDataURL("image/jpeg", 0.74);
    return compressed && compressed.length < raw.length ? compressed : raw;
  } catch {
    return raw;
  }
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className={`next-expense-users-toast is-${toast.type || "info"}`}><div><strong>{toast.title}</strong>{toast.message ? <span>{toast.message}</span> : null}</div><button type="button" onClick={onClose}>×</button></div>;
}

function UserClassicIcon({ name, size = 18 }) {
  const common = { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const icons = {
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    filter: <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>,
    rotate: <><polyline points="1 4 1 10 7 10"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/></>,
    sort: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
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

  return (
    <div className="expense-shots-modal is-open" style={{ display: "flex" }} aria-hidden="false" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="expense-shots-modal__card" role="dialog" aria-modal="true">
        <div className="expense-shots-modal__head"><div><h4 className="expense-shots-modal__title">Screenshots</h4><div className="expense-shots-modal__count">{screenshots.length ? `${screenshots.length} image${screenshots.length === 1 ? "" : "s"}` : "No images uploaded"}</div></div><button type="button" className="expense-shots-modal__close" onClick={onClose} aria-label="Close screenshots viewer"><span aria-hidden="true">×</span></button></div>
        <div className="expense-shots-modal__body">{screenshots.length ? <div className="expense-shots-modal__grid">{screenshots.map((shot, index) => <a className="expense-shots-modal__item" href={shot.url} target="_blank" rel="noreferrer" key={`${shot.url}-${index}`}><span className="expense-shots-modal__image-wrap"><img className="expense-shots-modal__image" src={shot.url} alt={shot.name || `Screenshot ${index + 1}`} loading="lazy" /></span><span className="expense-shots-modal__caption">{shot.name || `Screenshot ${index + 1}`}</span></a>)}</div> : <div className="expense-shots-modal__empty"><div className="expense-shots-modal__empty-icon"><UserClassicIcon name="image" size={24}/></div><div>No screenshots uploaded for this expense.</div></div>}</div>
      </div>
    </div>
  );
}

function ExpenseActionModal({ title, subtitle, onClose, children, actions, danger = false }) {
  return <div className="expense-user-action-modal is-open" aria-hidden="false" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="expense-user-action-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="expense-user-action-head"><div><h3 className="expense-user-action-title">{title}</h3>{subtitle ? <div className="expense-user-action-sub">{subtitle}</div> : null}</div><button type="button" className="expense-user-action-close" onClick={onClose}>×</button></div>{children}<div className="expense-user-action-actions">{actions}</div></div></div>;
}

function AdminPasswordModal({ mode, count = 1, onClose, onContinue }) {
  const [password, setPassword] = useState("");
  const isDelete = mode === "delete";
  return <ExpenseActionModal title={isDelete ? "Delete expense" : "Edit expense"} subtitle={isDelete ? (count > 1 ? `This will delete ${count} expense rows and their uploaded receipts.` : "This will delete this expense and its uploaded receipts.") : "Enter the Admin password to edit this expense."} onClose={onClose} actions={<><button type="button" className="expense-user-action-btn expense-user-action-btn--muted" onClick={onClose}>Cancel</button><button type="button" className={`expense-user-action-btn ${isDelete ? "expense-user-action-btn--danger" : "expense-user-action-btn--primary"}`} onClick={() => onContinue(password.trim())}>{isDelete ? "Delete" : "Continue"}</button></>}><div className="expense-user-action-field"><label>Admin password</label><input type="password" autoFocus autoComplete="current-password" placeholder="Enter Admin password" value={password} onChange={(event) => setPassword(event.target.value)} /></div></ExpenseActionModal>;
}

function EditExpenseModal({ item, adminPassword, onClose, onSaved, notify }) {
  const [form, setForm] = useState({
    date: toLocalDateKey(item?.date || item?.createdTime || ""),
    fundsType: text(item?.fundsType), cashIn: number(item?.cashIn), cashOut: number(item?.cashOut),
    from: text(item?.from || item?.cashInFrom), to: text(item?.to), kilometer: number(item?.kilometer),
    cashInFrom: text(item?.cashInFrom), reason: text(item?.reason || userDisplayReason(item)),
    screenshotUrls: screenshotsFor(item).map((shot) => shot.url).filter(Boolean).join("\n"),
  });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const screenshots = [];
      for (const file of files) {
        const dataUrl = await fileToExpenseDataUrl(file);
        if (dataUrl) screenshots.push({ name: file.name || "receipt.webp", dataUrl });
      }
      await requestJson(`/api/expenses/user-expense/${encodeURIComponent(text(item?.id))}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminPassword, expense: { date: form.date, fundsType: form.fundsType, cashIn: number(form.cashIn), cashOut: number(form.cashOut), from: form.from, to: form.to, kilometer: number(form.kilometer), cashInFrom: form.cashInFrom, reason: form.reason, screenshotUrls: form.screenshotUrls.split(/[\n]+/).map((url) => url.trim()).filter(Boolean), screenshots } }) });
      notify("Saved", "Expense updated successfully.", "success");
      await onSaved();
      onClose();
    } catch (error) { notify("Edit failed", error?.message || "Failed to update expense.", "error"); }
    finally { setBusy(false); }
  };

  return <ExpenseActionModal title="Edit Expense" subtitle="Update this expense, then save the changes." onClose={onClose} actions={<><button type="button" className="expense-user-action-btn expense-user-action-btn--muted" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="expense-user-action-btn expense-user-action-btn--primary" onClick={save} disabled={busy}>{busy ? "Saving..." : "Save changes"}</button></>}><div className="expense-user-action-grid"><div className="expense-user-action-field"><label>Date</label><input type="date" value={form.date} onChange={update("date")} /></div><div className="expense-user-action-field"><label>Funds Type</label><input value={form.fundsType} onChange={update("fundsType")} /></div><div className="expense-user-action-field"><label>Cash In</label><input type="number" step="0.01" value={form.cashIn} onChange={update("cashIn")} /></div><div className="expense-user-action-field"><label>Cash Out</label><input type="number" step="0.01" value={form.cashOut} onChange={update("cashOut")} /></div><div className="expense-user-action-field"><label>From</label><input value={form.from} onChange={update("from")} /></div><div className="expense-user-action-field"><label>To</label><input value={form.to} onChange={update("to")} /></div><div className="expense-user-action-field"><label>Kilometer</label><input type="number" step="0.01" value={form.kilometer} onChange={update("kilometer")} /></div><div className="expense-user-action-field"><label>Cash In From</label><input value={form.cashInFrom} onChange={update("cashInFrom")} /></div><div className="expense-user-action-field is-wide"><label>Reason</label><textarea value={form.reason} onChange={update("reason")} /></div><div className="expense-user-action-field is-wide"><label>Receipt URLs</label><textarea placeholder="One URL per line" value={form.screenshotUrls} onChange={update("screenshotUrls")} /></div><div className="expense-user-action-field is-wide"><label>Add receipt image</label><input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><div className="expense-user-action-note">Images are compressed in the browser before uploading.</div></div></div></ExpenseActionModal>;
}

function DeleteConfirmationModal({ count, onClose, onConfirm, busy }) {
  return <ExpenseActionModal title={count > 1 ? "Delete expense card?" : "Delete expense?"} subtitle={count > 1 ? `You’re going to permanently delete ${count} expense rows and all uploaded receipts. This action cannot be undone.` : "You’re going to permanently delete this expense and its uploaded receipts. This action cannot be undone."} onClose={onClose} actions={<><button type="button" className="expense-user-action-btn expense-user-action-btn--muted" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="expense-user-action-btn expense-user-action-btn--danger" onClick={onConfirm} disabled={busy}>{busy ? "Deleting..." : "Delete"}</button></>} />;
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

function UserExpenseOrderActions({ orders }) {
  if (!orders?.length) return null;
  return <div className="expense-ticket__order-actions">{orders.map((order, index) => {
    const meta = getExpenseOrderTypeMeta(order?.orderType);
    const href = modernReceiptViewerHref(order) || modernTrackingHref(order);
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

function UserExpenseTicket({ group, onReceipt, onEdit, onDelete, menuKey, setMenuKey }) {
  const rows = [...(Array.isArray(group?.items) ? group.items : [])].sort((a, b) => transactionTime(a) - transactionTime(b));
  const total = groupTotal(group);
  const hideReason = shouldHideGroupReason(group);
  const hasOrders = Array.isArray(group?.orders) && group.orders.length > 0;
  const reasonText = text(group?.reason) || "No reason";
  const primary = rows[0] || null;
  const ids = rows.map((item) => text(item?.id)).filter(Boolean);
  return <article className="expense-ticket"><div className="expense-ticket__top"><div className={`expense-ticket__header-row${hasOrders ? " expense-ticket__header-row--with-order" : ""}`}><div className="expense-ticket__meta"><span className="expense-ticket__date">{formatExpenseGroupDate(group?.date)}</span></div>{(ids.length || hasOrders || !hideReason) ? <div className="expense-ticket__header-side">{ids.length ? <div className={`expense-ticket__actions${menuKey === group.key ? " is-open" : ""}`}><button type="button" className="expense-ticket__more" onClick={() => setMenuKey(menuKey === group.key ? "" : group.key)} aria-label="Expense actions">⋯</button><div className="expense-ticket__menu"><button type="button" className="expense-ticket__menu-item" onClick={() => { setMenuKey(""); onEdit(primary); }}><UserClassicIcon name="edit" size={15}/><span>Edit</span></button><button type="button" className="expense-ticket__menu-item expense-ticket__menu-item--danger" onClick={() => { setMenuKey(""); onDelete(ids); }}><UserClassicIcon name="trash" size={15}/><span>Delete</span></button></div></div> : null}{hasOrders ? <UserExpenseOrderActions orders={group.orders}/> : !hideReason ? <div className="expense-ticket__reason">{reasonText}</div> : null}</div> : null}</div>{hasOrders && !hideReason ? <div className="expense-ticket__reason expense-ticket__reason--block">{reasonText}</div> : null}<div className="expense-ticket__header-divider" aria-hidden="true" /></div><div className="expense-ticket__legs">{rows.map((item, index) => { const route = userRoute(item); const amount = userAmount(item); const typeLabel = number(item?.cashIn) > 0 ? "Cash In" : text(item?.fundsType) || "Cash Out"; return <div className="expense-ticket__route" key={text(item?.id) || index}><div className="expense-ticket__route-frame"><div className="expense-ticket__route-shot"><UserExpenseShot item={item} onReceipt={onReceipt}/></div><div className="expense-ticket__route-body"><div className="expense-ticket__route-top"><div className="expense-ticket__route-title" dir="auto" title={typeLabel}>{typeLabel}</div><div className={`expense-ticket__route-amount ${amount.tone}`} title={amount.text}>{amount.text}</div></div><div className="expense-ticket__route-sub"><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--from" dir="auto" title={route.from}>{route.from}</span><span className="expense-ticket__route-arrow" aria-hidden="true"><UserClassicIcon name="arrow" size={16}/></span><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--to" dir="auto" title={route.to}>{route.to}</span></div></div></div></div>; })}</div><div className="expense-ticket__separator" aria-hidden="true" /><div className="expense-ticket__footer"><span className="expense-ticket__footer-label">Total</span><span className={`expense-ticket__footer-value ${total.tone}`}>{total.text}</span></div></article>;
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
  const [menuKey, setMenuKey] = useState("");
  const [exporting, setExporting] = useState(false);
  const [action, setAction] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [closing, setClosing] = useState(false);

  const userId = text(user?.id || user?.userId);
  const load = async () => {
    setLoading(true);
    try { setPayload(await requestJson(`/api/expenses/user/${encodeURIComponent(userId)}`)); }
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
    const onKey = (event) => event.key === "Escape" && !action && !receiptItem && requestClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [action, receiptItem, closing]);

  const split = useMemo(() => splitBySettlement(payload?.items || [], payload?.lastSettledAt, payload?.lastSettledDate), [payload]);
  const filteredRecent = useMemo(() => filterAndSort(split.recent, { from: dateFrom, to: dateTo, sortType: sort }), [split.recent, dateFrom, dateTo, sort]);
  const filteredPast = useMemo(() => filterAndSort(split.past, { from: dateFrom, to: dateTo, sortType: sort }), [split.past, dateFrom, dateTo, sort]);
  const dateFilterActive = !!(dateFrom || dateTo);
  const combinedFiltered = useMemo(() => filterAndSort([...filteredRecent, ...filteredPast], { sortType: sort }), [filteredRecent, filteredPast, sort]);
  const totalItems = dateFilterActive ? combinedFiltered : filteredRecent;
  const filteredNet = totalItems.reduce((sum, item) => sum + transactionValue(item), 0);
  const recentGroups = useMemo(() => groupUserExpenses(filteredRecent, sort), [filteredRecent, sort]);
  const pastGroups = useMemo(() => groupUserExpenses(filteredPast, sort), [filteredPast, sort]);
  const allDateGroups = useMemo(() => groupUserExpenses(combinedFiltered, sort), [combinedFiltered, sort]);

  const refreshAfterMutation = async () => { await Promise.all([load(), onUsersRefresh()]); };
  const exportExcel = async () => {
    const exportItems = dateFilterActive ? combinedFiltered : filteredRecent;
    if (!exportItems.length) return notify("No expenses", dateFilterActive ? "No expenses found for the selected period." : "No expenses to download.", "info");
    setExporting(true);
    try {
      const response = await fetch("/api/expenses/export/excel", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userName: `Expenses — ${user.name}`, userId, items: exportItems, dateFrom, dateTo, lastSettledAt: payload?.lastSettledAt, lastSettledDate: payload?.lastSettledDate }) });
      if (response.status === 401) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Expense export failed."); }
      downloadBlob(await response.blob(), responseFileName(response, `${user.name}_expenses.xlsx`));
    } catch (error) { notify("Download failed", error?.message || "Failed to download expenses.", "error"); }
    finally { setExporting(false); }
  };

  const beginEdit = (item) => setAction({ type: "password", mode: "edit", item });
  const beginDelete = (ids) => setAction({ type: "password", mode: "delete", ids });
  const continueWithPassword = (password) => {
    if (!password) return notify("Admin password", "Enter the Admin password to continue.", "info");
    if (action?.mode === "edit") setAction({ type: "edit", item: action.item, password });
    else if (action?.mode === "delete") setAction({ type: "delete-confirm", ids: action.ids, password });
  };
  const deleteGroup = async () => {
    const ids = Array.isArray(action?.ids) ? action.ids : [];
    if (!ids.length) return setAction(null);
    setDeleteBusy(true);
    try {
      for (const id of ids) await requestJson(`/api/expenses/user-expense/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adminPassword: action.password }) });
      notify("Deleted", "Expense deleted successfully.", "success");
      setAction(null);
      await refreshAfterMutation();
    } catch (error) { notify("Delete failed", error?.message || "Failed to delete expense.", "error"); }
    finally { setDeleteBusy(false); }
  };

  const renderGroups = (groups) => groups.length ? groups.map((group) => <UserExpenseTicket group={group} onReceipt={setReceiptItem} onEdit={beginEdit} onDelete={beginDelete} menuKey={menuKey} setMenuKey={setMenuKey} key={group.key}/>) : <div className="expenses-empty">Sorry, No data available</div>;

  return <>
    <div className="ios-modal next-ios-modal-open" style={{ display: "flex" }} role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <div className="ios-sheet" style={{ transform: opened && !closing ? "translateY(0)" : "translateY(100%)" }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="ios-drag" />
        <div className="user-expenses-header"><div className="sheet-header"><div className="sheet-header-text"><div className="user-expenses-title">Expenses — {user.name || "User"}</div><div className="user-expenses-sub">All expenses for this team member</div></div></div></div>
        <div className="sheet-scroll">
          <div className={`total-balance-card${filteredNet < 0 ? " is-negative" : filteredNet > 0 ? " is-positive" : ""}`}><div className="total-balance-meta"><div className="total-balance-label"><UserClassicIcon name="card" size={18}/>Total balance</div><div className="total-balance-hint">After filters applied</div></div><div className="total-balance-value">{formatGBP(filteredNet)}</div></div>
          <div className="sheet-controls"><div className="controls-row"><div className="download-wrapper"><button className="download-btn" type="button" onClick={exportExcel} disabled={exporting}><UserClassicIcon name="download" size={18}/>{exporting ? "Preparing Excel…" : "Download Excel"}</button></div><div className="sort-wrapper"><label className="control-label">Sort</label><div className="select-with-icon"><UserClassicIcon name="sort" size={18}/><select className="sort-select" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="high">Highest amount</option><option value="low">Lowest amount</option></select></div></div></div><div className="date-filter"><div className="date-field"><label>From</label><input type="date" value={draftDateFrom} onChange={(event) => setDraftDateFrom(event.target.value)} /></div><div className="date-field"><label>To</label><input type="date" value={draftDateTo} onChange={(event) => setDraftDateTo(event.target.value)} /></div><div className="date-actions"><button className="filter-btn" type="button" onClick={() => { setDateFrom(draftDateFrom); setDateTo(draftDateTo); }}><UserClassicIcon name="filter" size={18}/>Apply</button><button className="filter-btn reset-btn" type="button" onClick={() => { setDraftDateFrom(""); setDraftDateTo(""); setDateFrom(""); setDateTo(""); }}><UserClassicIcon name="rotate" size={18}/>Reset</button></div></div></div>
          <div id="userExpensesList">{loading ? <div className="expenses-empty">Loading expenses…</div> : dateFilterActive ? renderGroups(allDateGroups) : <>{renderGroups(recentGroups)}{showPast && pastGroups.length ? <><div className="expenses-separator"><span>Past expenses</span></div>{renderGroups(pastGroups)}</> : null}</>}</div>
          {!dateFilterActive && split.past.length ? <div className="past-expenses-wrapper"><button className="past-expenses-btn" type="button" onClick={() => setShowPast((value) => !value)}>{showPast ? "Hide past expenses" : "Show past expenses"}</button></div> : null}
        </div>
        <button className="modal-close-btn" type="button" onClick={requestClose}>Close</button>
      </div>
    </div>
    {receiptItem ? <ReceiptViewer item={receiptItem} onClose={() => setReceiptItem(null)} /> : null}
    {action?.type === "password" ? <AdminPasswordModal mode={action.mode} count={action.ids?.length || 1} onClose={() => setAction(null)} onContinue={continueWithPassword} /> : null}
    {action?.type === "edit" ? <EditExpenseModal item={action.item} adminPassword={action.password} onClose={() => setAction(null)} onSaved={refreshAfterMutation} notify={notify} /> : null}
    {action?.type === "delete-confirm" ? <DeleteConfirmationModal count={action.ids?.length || 1} busy={deleteBusy} onClose={() => setAction(null)} onConfirm={deleteGroup} /> : null}
  </>;
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
      const body = await requestJson("/api/expenses/users");
      setUsers(Array.isArray(body?.users) ? body.users : []);
      return body;
    } catch (error) { notify("Refresh failed", error?.message || "Failed to refresh expense users.", "error"); throw error; }
    finally { setBusy(false); }
  };

  return <>
    {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some expense-user data was delayed.</strong><span>The loaded balances remain available and can be refreshed automatically when a user is opened.</span><a href="/expenses/users?classic=1">Open classic Expenses Users</a></div> : null}
    <main className="expenses-layout next-expense-users-classic-parity">
      <div className="user-tabs">
        {busy ? <div className="loader" /> : users.length ? users.map((user) => {
          const total = number(user.total);
          const key = text(user.id || user.userId || user.name);
          const count = number(user.count);
          return <button type="button" className={`user-tab${total < 0 ? " has-negative" : total > 0 ? " has-positive" : ""}${activeUserKey === key ? " active" : ""}`} onClick={() => { setActiveUserKey(key); setSelectedUser(user); }} key={key}><div className="user-tab__header"><span className="user-tab__count">{count} item{count === 1 ? "" : "s"}</span><span className="user-tab__name">{user.name || "Unknown user"}</span></div><div className="user-tab__divider" aria-hidden="true" /><div className="user-tab__body"><span className="user-tab__label">Current balance</span><span className="user-total">{formatGBP(total)}</span></div><div className="user-tab__footer"><span className="user-tab__footer-label">Last settled</span><span className="user-settled">{formatDateDisplay(user.lastSettledDate)}</span></div></button>;
        }) : <div className="users-empty"><div className="expenses-empty">Sorry, No data available</div></div>}
      </div>
    </main>
    {selectedUser ? <UserExpensesModal user={selectedUser} onClose={() => setSelectedUser(null)} onUsersRefresh={refresh} notify={notify} /> : null}
    <Toast toast={toast} onClose={() => setToast(null)} />
  </>;
}

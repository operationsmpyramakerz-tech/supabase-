"use client";

import { useMemo, useState } from "react";

const DEFAULT_FUNDS_TYPES = [
  "Online Transfer", "SWVL", "Go Bus", "By Bus", "ترام", "Train", "Metro", "Indrive",
  "Uber", "DiDi", "Taxi", "توكتوك", "نقل", "Public transportation", "Cash Payment",
  "Meal allowance", "مشال", "مصروفات", "Own car", "Settled my account",
];
const CASH_IN_TYPES = ["Cash Payment", "Online Transfer"];
const HIDDEN_TYPE_KEYS = new Set(["cashreceipt", "cashreciept", "settledmyaccount"]);
const SCREENSHOT_REQUIRED_KEYS = new Set(["owncar", "swvl", "gobus", "bybus", "train", "indrive", "uber", "uper", "didi"]);
const TYPE_COLORS = ["#7c3aed", "#2563eb", "#0891b2", "#16a34a", "#f59e0b", "#ef4444"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const OTHER_SCOPE_ID = "__expense_other_reason__";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function typeKey(value) { return lower(value).replace(/[^a-z0-9\u0600-\u06ff]+/g, ""); }
function isSettlement(item) { return typeKey(item?.fundsType) === "settledmyaccount" || typeKey(item?.reason) === "settledmyaccount"; }
function today() { return new Date().toISOString().slice(0, 10); }
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
function monthKey(item) {
  const rawDate = text(item?.date);
  const match = rawDate.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const stamp = transactionTime(item);
  if (!stamp) return "";
  const date = new Date(stamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function screenshotsFor(item) {
  const entries = Array.isArray(item?.screenshots) ? item.screenshots : [];
  const normalized = entries.map((shot, index) => ({
    name: text(shot?.name) || `Receipt ${index + 1}`,
    url: text(shot?.url),
  })).filter((shot) => shot.url);
  if (normalized.length) return normalized;
  const fallback = text(item?.screenshotUrl);
  return fallback ? [{ name: text(item?.screenshotName) || "Receipt", url: fallback }] : [];
}
function routeEndpoints(item) {
  const cashIn = number(item?.cashIn) > 0;
  const from = text(item?.from || item?.cashInFrom) || (cashIn ? "Cash in" : "—");
  const to = text(item?.to) || (cashIn ? "Wallet" : "—");
  return { from, to };
}
function displayReason(item) {
  const orders = Array.isArray(item?.orders) ? item.orders : [];
  return text(item?.reason) || text(orders[0]?.label) || (number(item?.cashIn) > 0 ? "Cash in" : text(item?.fundsType) || "Cash out");
}
function transactionValue(item) {
  const cashIn = number(item?.cashIn);
  const cashOut = number(item?.cashOut);
  return cashIn > 0 ? cashIn : -cashOut;
}
function sortTransactions(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => transactionTime(b) - transactionTime(a));
}
function dedupeTypes(types) {
  const seen = new Set();
  return [...DEFAULT_FUNDS_TYPES, ...(Array.isArray(types) ? types : [])].filter((value) => {
    const raw = text(value);
    const key = typeKey(raw);
    if (!raw || !key || seen.has(key) || HIDDEN_TYPE_KEYS.has(key)) return false;
    seen.add(key);
    return true;
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
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Login required.");
  }
  if (!response.ok || body?.success === false || body?.ok === false) {
    throw new Error(body?.error || body?.message || `Request failed with ${response.status}.`);
  }
  return body;
}
async function fileToCompressedDataUrl(file) {
  if (!file) return "";
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
  return canvas.toDataURL("image/jpeg", 0.8);
}
async function filesPayload(files) {
  const selected = Array.from(files || []);
  if (selected.length > 6) throw new Error("You can upload up to 6 images.");
  return Promise.all(selected.map(async (file) => ({ name: file.name || "receipt.jpg", dataUrl: await fileToCompressedDataUrl(file) })));
}

function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  return (
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`expense-modal ${wide ? "expense-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div><span className="pill">Expenses</span><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button className="next-modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="expense-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function FileField({ files, onChange, required = false, hint = "Upload receipt screenshots (JPG/PNG)." }) {
  return (
    <label className={`expense-file-field ${required ? "is-required" : ""}`}>
      <span>Screenshot {required ? <em>Required</em> : <small>Optional</small>}</span>
      <input type="file" accept="image/*" multiple onChange={(event) => onChange(Array.from(event.target.files || []))} />
      <strong>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Choose images"}</strong>
      <small>{hint}</small>
    </label>
  );
}

function CashInModal({ options, onClose, onSaved, notify }) {
  const [form, setForm] = useState({ date: today(), amount: "", fundsType: "", paymentBy: "", receiptNumber: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const isTransfer = typeKey(form.fundsType) === "onlinetransfer";
  const isCash = typeKey(form.fundsType) === "cashpayment";
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async () => {
    if (!form.date || number(form.amount) <= 0 || !form.fundsType || !text(form.paymentBy)) return notify("Fill all required Cash in fields.", "error");
    if (isCash && !text(form.receiptNumber)) return notify("Receipt number is required for cash payment.", "error");
    if (isTransfer && !files.length) return notify("Transfer screenshot is required.", "error");
    setBusy(true);
    try {
      await requestJson("/api/expenses/cash-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: number(form.amount), screenshots: await filesPayload(files) }),
      });
      notify("Cash in recorded successfully.", "success");
      await onSaved();
      onClose();
    } catch (error) { notify(error?.message || "Failed to save Cash in.", "error"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Add Cash in" subtitle="Record incoming money in your current account." onClose={onClose} footer={<><button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save Cash in"}</button></>}>
      <div className="expense-form-grid">
        <label><span>Date *</span><input type="date" value={form.date} onChange={update("date")} /></label>
        <label><span>Amount *</span><input type="number" min="0" step="0.01" value={form.amount} onChange={update("amount")} placeholder="0" /></label>
        <label><span>Funds type *</span><select value={form.fundsType} onChange={update("fundsType")}><option value="">Select type…</option>{CASH_IN_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Payment by *</span><input list="expense-cash-in-people" value={form.paymentBy} onChange={update("paymentBy")} placeholder="Person or company" /><datalist id="expense-cash-in-people">{options.map((item) => <option value={text(item?.name)} key={text(item?.id || item?.name)} />)}</datalist></label>
        {isCash ? <label className="expense-form-full"><span>Receipt number *</span><input value={form.receiptNumber} onChange={update("receiptNumber")} placeholder="Enter receipt number" /></label> : null}
        {(isTransfer || form.fundsType) ? <div className="expense-form-full"><FileField files={files} onChange={setFiles} required={isTransfer} hint={isTransfer ? "Upload the transfer screenshot." : "Optional supporting images."} /></div> : null}
      </div>
    </Modal>
  );
}

function CashOutModal({ fundsTypes, orderOptions, onClose, onSaved, notify }) {
  const [scopeId, setScopeId] = useState("");
  const [date, setDate] = useState(today());
  const [manualReason, setManualReason] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [form, setForm] = useState({ fundsType: "", from: "", to: "", amount: "", kilometer: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const selectedOrder = scopeId === OTHER_SCOPE_ID ? null : orderOptions.find((item) => text(item?.id) === scopeId) || null;
  const isManual = scopeId === OTHER_SCOPE_ID;
  const isOwnCar = typeKey(form.fundsType) === "owncar";
  const screenshotRequired = SCREENSHOT_REQUIRED_KEYS.has(typeKey(form.fundsType));
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const addDraft = async () => {
    if (!scopeId || (!selectedOrder && !isManual)) return notify("Choose an order or Other reason first.", "error");
    if (isManual && !text(manualReason)) return notify("Write the expense reason.", "error");
    if (!date || !form.fundsType) return notify("Date and funds type are required.", "error");
    if (isOwnCar ? number(form.kilometer) <= 0 : number(form.amount) <= 0) return notify(isOwnCar ? "Kilometer is required for Own car." : "Cash out amount is required.", "error");
    if (screenshotRequired && !files.length) return notify(isOwnCar ? "A Google Maps screenshot is required for Own car." : "Screenshot is required for this funds type.", "error");
    setBusy(true);
    try {
      const shots = await filesPayload(files);
      setDrafts((current) => [...current, {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...form,
        amount: number(form.amount),
        kilometer: number(form.kilometer),
        reason: isManual ? text(manualReason) : text(selectedOrder?.label),
        screenshots: shots,
      }]);
      setForm({ fundsType: "", from: "", to: "", amount: "", kilometer: "" });
      setFiles([]);
      notify("Expense added to the pending list.", "success");
    } catch (error) { notify(error?.message || "Failed to prepare the expense.", "error"); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!drafts.length) return notify("Add at least one expense before confirming.", "error");
    setBusy(true);
    let saved = 0;
    const failed = [];
    for (const draft of drafts) {
      try {
        await requestJson("/api/expenses/cash-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: isManual ? "" : text(selectedOrder?.id),
            orderIds: isManual ? [] : (Array.isArray(selectedOrder?.relationIds) ? selectedOrder.relationIds : []),
            orderLabel: isManual ? "Other reason" : text(selectedOrder?.label),
            orderType: isManual ? "Manual reason" : text(selectedOrder?.orderType),
            orderDisplayId: isManual ? "" : text(selectedOrder?.orderId),
            reason: draft.reason,
            fundsType: draft.fundsType,
            date,
            from: draft.from,
            to: draft.to,
            amount: draft.amount,
            kilometer: draft.kilometer,
            screenshots: draft.screenshots,
          }),
        });
        saved += 1;
      } catch (error) { failed.push(draft); notify(error?.message || "One expense failed to save.", "error"); }
    }
    setDrafts(failed);
    if (saved) await onSaved();
    if (!failed.length) {
      notify(`${saved} expense${saved === 1 ? "" : "s"} saved successfully.`, "success");
      onClose();
    } else if (saved) notify(`${saved} saved; ${failed.length} still need review.`, "error");
    setBusy(false);
  };

  return (
    <Modal title="Add Cash out" subtitle="Link the expense to an approved order or use a manual reason." onClose={onClose} wide footer={<><button className="secondary-button" onClick={onClose} disabled={busy}>Close</button><button className="primary-button" onClick={confirm} disabled={busy || !drafts.length}>{busy ? "Saving…" : `Confirm ${drafts.length || ""}`}</button></>}>
      <div className="expense-form-grid">
        <label className="expense-form-full"><span>Order / reason *</span><select value={scopeId} onChange={(event) => { setScopeId(event.target.value); setDrafts([]); }}><option value="">Choose scope…</option>{orderOptions.map((item) => <option value={text(item?.id)} key={text(item?.id)}>{text(item?.label) || text(item?.orderId) || "Order"}</option>)}<option value={OTHER_SCOPE_ID}>Other reason</option></select></label>
        <label><span>Expense date *</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {isManual ? <label><span>Reason *</span><input value={manualReason} onChange={(event) => setManualReason(event.target.value)} placeholder="Write the expense reason" /></label> : <div className="expense-selected-order"><span>Selected order</span><strong>{text(selectedOrder?.label) || "Choose an order"}</strong></div>}
      </div>

      <div className="expense-draft-builder">
        <div className="expense-form-grid">
          <label><span>Funds type *</span><select value={form.fundsType} onChange={update("fundsType")}><option value="">Select type…</option>{fundsTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          {isOwnCar ? <label><span>Kilometer *</span><input type="number" min="0" step="0.1" value={form.kilometer} onChange={update("kilometer")} /></label> : <label><span>Cash out *</span><input type="number" min="0" step="0.01" value={form.amount} onChange={update("amount")} /></label>}
          <label><span>From</span><input value={form.from} onChange={update("from")} placeholder="Optional" /></label>
          <label><span>To</span><input value={form.to} onChange={update("to")} placeholder="Optional" /></label>
          <div className="expense-form-full"><FileField files={files} onChange={setFiles} required={screenshotRequired} hint={isOwnCar ? "Upload a Google Maps distance screenshot." : "Up to 6 supporting images."} /></div>
        </div>
        <button className="expense-add-draft" type="button" onClick={addDraft} disabled={busy}>+ Add expense</button>
      </div>

      {drafts.length ? <div className="expense-pending-list"><div className="expense-pending-head"><strong>Pending expenses</strong><span>{drafts.length}</span></div>{drafts.map((draft) => <article key={draft.id}><div><strong>{draft.fundsType}</strong><span>{draft.reason}</span><small>{draft.from || "—"} → {draft.to || "—"}</small></div><b>{typeKey(draft.fundsType) === "owncar" ? `${draft.kilometer} km` : money(draft.amount)}</b><button type="button" onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}>×</button></article>)}</div> : null}
    </Modal>
  );
}

function SettleModal({ onClose, onSaved, notify }) {
  const [form, setForm] = useState({ date: today(), fundsType: "", settledBy: "", receiptNumber: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const isTransfer = typeKey(form.fundsType) === "onlinetransfer";
  const isCash = typeKey(form.fundsType) === "cashpayment";
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async () => {
    if (!form.date || !form.fundsType || !text(form.settledBy)) return notify("Fill all required settlement fields.", "error");
    if (isCash && !text(form.receiptNumber)) return notify("Receipt number is required for cash payment.", "error");
    if (isTransfer && !files.length) return notify("Transfer screenshot is required.", "error");
    setBusy(true);
    try {
      await requestJson("/api/expenses/settle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, screenshots: await filesPayload(files) }) });
      notify("Account settlement saved.", "success");
      await onSaved();
      onClose();
    } catch (error) { notify(error?.message || "Failed to settle the account.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Settle my account" subtitle="A balancing transaction will reset the current balance to zero." onClose={onClose} footer={<><button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save settlement"}</button></>}>
      <div className="expense-form-grid">
        <label><span>Date *</span><input type="date" value={form.date} onChange={update("date")} /></label>
        <label><span>Funds type *</span><select value={form.fundsType} onChange={update("fundsType")}><option value="">Select type…</option>{CASH_IN_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="expense-form-full"><span>Settled by *</span><input value={form.settledBy} onChange={update("settledBy")} placeholder="Person name" /></label>
        {isCash ? <label className="expense-form-full"><span>Receipt number *</span><input value={form.receiptNumber} onChange={update("receiptNumber")} /></label> : null}
        {form.fundsType ? <div className="expense-form-full"><FileField files={files} onChange={setFiles} required={isTransfer} hint={isTransfer ? "Upload the transfer screenshot." : "Optional receipt images."} /></div> : null}
      </div>
    </Modal>
  );
}

function ExportModal({ account, items, onClose, notify }) {
  const [fileType, setFileType] = useState("pdf");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedItems = useMemo(() => items.filter((item) => {
    const date = text(item?.date);
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  }), [items, dateFrom, dateTo]);
  const run = async () => {
    if (!selectedItems.length) return notify("No expenses match the selected period.", "error");
    setBusy(true);
    try {
      const response = await fetch(`/api/expenses/export/${fileType}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userName: `Expenses — ${text(account?.name || account?.username) || "User"}`, userId: text(account?.id || account?.userId), items: selectedItems, dateFrom, dateTo }) });
      if (response.status === 401) { window.location.href = "/login?next=/next/expenses"; return; }
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Expense export failed."); }
      downloadBlob(await response.blob(), responseFileName(response, fileType === "excel" ? "expenses.xlsx" : "expenses.pdf"));
      notify("Expense export downloaded.", "success");
      onClose();
    } catch (error) { notify(error?.message || "Expense export failed.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Export expenses" subtitle={`${selectedItems.length} transaction${selectedItems.length === 1 ? "" : "s"} selected.`} onClose={onClose} footer={<><button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" onClick={run} disabled={busy}>{busy ? "Preparing…" : `Download ${fileType === "excel" ? "Excel" : "PDF"}`}</button></>}>
      <div className="expense-export-types"><button className={fileType === "pdf" ? "active" : ""} onClick={() => setFileType("pdf")} type="button">PDF</button><button className={fileType === "excel" ? "active" : ""} onClick={() => setFileType("excel")} type="button">Excel</button></div>
      <div className="expense-form-grid"><label><span>From date</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label><span>To date</span><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></div>
    </Modal>
  );
}

function ScreenshotModal({ transaction, onClose }) {
  const screenshots = screenshotsFor(transaction);
  return (
    <Modal title="Screenshots" subtitle={`${screenshots.length} uploaded image${screenshots.length === 1 ? "" : "s"}.`} onClose={onClose}>
      {screenshots.length ? <div className="expense-screenshot-grid">{screenshots.map((shot, index) => <a href={shot.url || `/api/expenses/screenshot/${encodeURIComponent(text(transaction?.id))}?index=${index}`} target="_blank" rel="noreferrer" key={`${shot.url}-${index}`}><img src={shot.url || `/api/expenses/screenshot/${encodeURIComponent(text(transaction?.id))}?index=${index}`} alt={shot.name} /><span>{shot.name}</span></a>)}</div> : <div className="expense-empty-inline">No screenshots were uploaded for this transaction.</div>}
    </Modal>
  );
}

function TransactionCard({ item, onScreenshots }) {
  const value = transactionValue(item);
  const route = routeEndpoints(item);
  const shots = screenshotsFor(item);
  const orders = Array.isArray(item?.orders) ? item.orders : [];
  const ownCar = typeKey(item?.fundsType) === "owncar";
  return (
    <article className={`expense-transaction ${value > 0 ? "is-in" : value < 0 ? "is-out" : "is-neutral"}`}>
      <div className="expense-transaction__icon">{value > 0 ? "↙" : value < 0 ? "↗" : "✓"}</div>
      <div className="expense-transaction__main">
        <div className="expense-transaction__title"><strong>{displayReason(item)}</strong><time>{formatDate(item?.date || item?.createdTime)}</time></div>
        <div className="expense-transaction__meta"><span>{text(item?.fundsType) || "Other"}</span><span>{route.from}</span><i>→</i><span>{route.to}</span></div>
        {orders.length ? <div className="expense-order-links">{orders.map((order, index) => order?.trackingUrl ? <a href={order.trackingUrl} target="_blank" rel="noreferrer" key={`${order?.key || order?.label}-${index}`}>{text(order?.orderId || order?.label) || "Order"}</a> : <span key={`${order?.key || order?.label}-${index}`}>{text(order?.orderId || order?.label) || "Order"}</span>)}</div> : null}
      </div>
      <div className="expense-transaction__amount"><strong>{ownCar && !value ? `${number(item?.kilometer)} km` : money(value, { signed: true })}</strong>{shots.length ? <button type="button" onClick={() => onScreenshots(item)}>Receipt {shots.length > 1 ? `(${shots.length})` : ""}</button> : <span>No receipt</span>}</div>
    </article>
  );
}

export default function ExpensesClient({ account, initialPayload = {}, initialTypes = [], cashInFromOptions = [], orderOptions = [], bootstrapWarnings = [] }) {
  const [items, setItems] = useState(() => sortTransactions(initialPayload?.items));
  const [lastSettledAt, setLastSettledAt] = useState(initialPayload?.lastSettledAt || null);
  const [lastSettledDate, setLastSettledDate] = useState(initialPayload?.lastSettledDate || null);
  const [filter, setFilter] = useState("recent");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState("");
  const [screenshotTransaction, setScreenshotTransaction] = useState(null);
  const [toast, setToast] = useState(null);
  const years = useMemo(() => {
    const found = new Set(items.filter((item) => number(item?.cashOut) > 0 && !isSettlement(item)).map((item) => Number(monthKey(item).slice(0, 4))).filter(Number.isFinite));
    found.add(new Date().getFullYear());
    return [...found].sort((a, b) => b - a);
  }, [items]);
  const [selectedYear, setSelectedYear] = useState(years[0] || new Date().getFullYear());
  const monthlyTotals = useMemo(() => MONTHS.map((_, monthIndex) => items.reduce((sum, item) => {
    if (isSettlement(item) || number(item?.cashOut) <= 0) return sum;
    return monthKey(item) === `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}` ? sum + number(item?.cashOut) : sum;
  }, 0)), [items, selectedYear]);
  const defaultMonth = useMemo(() => {
    const current = new Date();
    if (selectedYear === current.getFullYear() && monthlyTotals[current.getMonth()] > 0) return `${selectedYear}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    let latest = 11;
    monthlyTotals.forEach((value, index) => { if (value > 0) latest = index; });
    return `${selectedYear}-${String(latest + 1).padStart(2, "0")}`;
  }, [selectedYear, monthlyTotals]);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const effectiveSelectedMonth = selectedMonth.startsWith(`${selectedYear}-`) ? selectedMonth : defaultMonth;
  const fundsTypes = useMemo(() => dedupeTypes(initialTypes), [initialTypes]);

  const notify = (message, type = "info") => {
    setToast({ message, type, id: Date.now() });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4500);
  };
  const refresh = async () => {
    const body = await requestJson("/api/expenses");
    setItems(sortTransactions(body?.items));
    setLastSettledAt(body?.lastSettledAt || null);
    setLastSettledDate(body?.lastSettledDate || null);
  };

  const currentCycle = useMemo(() => {
    const boundary = lastSettledAt ? new Date(lastSettledAt).getTime() : 0;
    return items.filter((item) => !isSettlement(item) && (!boundary || transactionTime(item) > boundary));
  }, [items, lastSettledAt]);
  const summary = useMemo(() => {
    const cashIn = currentCycle.reduce((sum, item) => sum + number(item?.cashIn), 0);
    const cashOut = currentCycle.reduce((sum, item) => sum + number(item?.cashOut), 0);
    return { cashIn, cashOut, balance: cashIn - cashOut };
  }, [currentCycle]);
  const typeRows = useMemo(() => {
    const totals = new Map();
    items.forEach((item) => {
      if (isSettlement(item) || number(item?.cashOut) <= 0 || monthKey(item) !== effectiveSelectedMonth) return;
      const label = text(item?.fundsType) || text(item?.reason) || "Other";
      totals.set(label, number(totals.get(label)) + number(item?.cashOut));
    });
    const sorted = [...totals.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    if (sorted.length <= 5) return sorted;
    return [...sorted.slice(0, 5), { label: "Other", value: sorted.slice(5).reduce((sum, item) => sum + item.value, 0) }];
  }, [items, effectiveSelectedMonth]);
  const typeTotal = typeRows.reduce((sum, row) => sum + row.value, 0);
  const donutGradient = typeRows.length && typeTotal > 0 ? `conic-gradient(${typeRows.map((row, index) => {
    const previous = typeRows.slice(0, index).reduce((sum, item) => sum + item.value, 0) / typeTotal * 100;
    const end = previous + row.value / typeTotal * 100;
    return `${TYPE_COLORS[index % TYPE_COLORS.length]} ${previous.toFixed(2)}% ${end.toFixed(2)}%`;
  }).join(",")})` : "#edf1f6";
  const filteredItems = useMemo(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const query = lower(search);
    return items.filter((item) => {
      if (filter === "recent" && now - transactionTime(item) > sevenDays) return false;
      if (filter === "cash-in" && number(item?.cashIn) <= 0) return false;
      if (filter === "cash-out" && number(item?.cashOut) <= 0) return false;
      if (query && !lower([displayReason(item), item?.fundsType, item?.from, item?.to, item?.receiptNumber, item?.ordersRaw].join(" ")).includes(query)) return false;
      return true;
    });
  }, [items, filter, search]);
  const maxMonthly = Math.max(1, ...monthlyTotals);

  return (
    <section className="next-expenses-page">
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Some expense options could not refresh.</strong><span>The loaded transactions remain available, and the classic page can be used as a fallback.</span><a href="/expenses">Open classic Expenses</a></div> : null}
      {toast ? <div className={`next-toast next-toast--${toast.type}`} role="status"><span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span><strong>{toast.message}</strong><button onClick={() => setToast(null)}>×</button></div> : null}

      <div className="expenses-summary-grid">
        <article className="expenses-balance-card">
          <header><div><span>Expense summary</span><h2>Current balance</h2></div><em>Since settlement</em></header>
          <strong className={summary.balance < 0 ? "negative" : summary.balance > 0 ? "positive" : ""}>{money(summary.balance)}</strong>
          <div className="expenses-flow-pills"><span className="is-in"><i>↙</i><small>Cash in</small><b>{money(summary.cashIn)}</b></span><span className="is-out"><i>↗</i><small>Cash out</small><b>{money(summary.cashOut)}</b></span></div>
          <footer><button type="button" onClick={() => setModal("settle")}>✓ Settle my account</button><div><span>Last settlement</span><strong>{formatDate(lastSettledDate || lastSettledAt)}</strong></div></footer>
        </article>

        <article className="expenses-monthly-card">
          <header><div><span>Monthly overview</span><h2>Expenses by month</h2></div><select value={selectedYear} onChange={(event) => { const year = Number(event.target.value); setSelectedYear(year); setSelectedMonth(""); }}>{years.map((year) => <option key={year}>{year}</option>)}</select></header>
          <div className="expenses-month-bars">{monthlyTotals.map((value, index) => { const key = `${selectedYear}-${String(index + 1).padStart(2, "0")}`; return <button type="button" key={key} className={effectiveSelectedMonth === key ? "active" : ""} onClick={() => setSelectedMonth(key)} title={`${MONTHS[index]}: ${money(value)}`}><span>{value ? money(value) : ""}</span><i><b style={{ height: `${Math.max(value ? 8 : 2, value / maxMonthly * 100)}%` }} /></i><small>{MONTHS[index]}</small></button>; })}</div>
        </article>

        <article className="expenses-types-card-next">
          <header><div><span>Selected month</span><h2>Expense types</h2></div><em>{formatDate(`${effectiveSelectedMonth}-01`, "—")}</em></header>
          {typeRows.length ? <div className="expenses-types-layout"><div className="expenses-donut" style={{ background: donutGradient }}><div><span>Total</span><strong>{money(typeTotal)}</strong></div></div><div className="expenses-type-legend">{typeRows.map((row, index) => <div key={row.label}><i style={{ background: TYPE_COLORS[index % TYPE_COLORS.length] }} /><span>{row.label}</span><strong>{typeTotal ? `${(row.value / typeTotal * 100).toFixed(row.value / typeTotal >= 0.1 ? 0 : 1)}%` : "0%"}</strong></div>)}</div></div> : <div className="expense-empty-inline">No cash-out expenses in this month.</div>}
        </article>
      </div>

      <div className="expense-action-row"><button className="expense-action-in" onClick={() => setModal("cash-in")} type="button"><span>↙</span><div><strong>Cash in</strong><small>Record incoming money</small></div><i>→</i></button><button className="expense-action-out" onClick={() => setModal("cash-out")} type="button"><span>↗</span><div><strong>Cash out</strong><small>Record outgoing money</small></div><i>→</i></button></div>

      <section className="expenses-ledger-card">
        <header><div><span>Transactions</span><h2>Expense details</h2></div><div className="expenses-ledger-actions"><button type="button" onClick={() => setModal("export")}>Export</button><button type="button" onClick={() => setModal("all")}>View all</button></div></header>
        <div className="expenses-toolbar"><div className="expenses-filter-tabs">{[["recent", "Recent"], ["cash-in", "Cash in"], ["cash-out", "Cash out"]].map(([key, label]) => <button className={filter === key ? "active" : ""} type="button" onClick={() => setFilter(key)} key={key}>{label}</button>)}</div><label><span>⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions…" />{search ? <button onClick={() => setSearch("")} type="button">×</button> : null}</label></div>
        <div className="expense-transaction-list">{filteredItems.length ? filteredItems.slice(0, 12).map((item) => <TransactionCard item={item} key={text(item?.id) || `${transactionTime(item)}-${displayReason(item)}`} onScreenshots={setScreenshotTransaction} />) : <div className="expense-empty-state"><span>∅</span><h3>No matching transactions</h3><p>Try another filter or search phrase.</p></div>}</div>
        <footer><span>{filteredItems.length} matching transaction{filteredItems.length === 1 ? "" : "s"}</span><a href="/expenses">Open classic Expenses</a></footer>
      </section>

      {modal === "cash-in" ? <CashInModal options={cashInFromOptions} onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "cash-out" ? <CashOutModal fundsTypes={fundsTypes} orderOptions={orderOptions} onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "settle" ? <SettleModal onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "export" ? <ExportModal account={account} items={items} onClose={() => setModal("")} notify={notify} /> : null}
      {modal === "all" ? <Modal title="All expenses" subtitle={`${items.length} transaction${items.length === 1 ? "" : "s"}.`} onClose={() => setModal("")} wide><div className="expense-transaction-list expense-transaction-list--modal">{items.map((item) => <TransactionCard item={item} key={`all-${text(item?.id) || `${transactionTime(item)}-${displayReason(item)}`}`} onScreenshots={setScreenshotTransaction} />)}</div></Modal> : null}
      {screenshotTransaction ? <ScreenshotModal transaction={screenshotTransaction} onClose={() => setScreenshotTransaction(null)} /> : null}
    </section>
  );
}

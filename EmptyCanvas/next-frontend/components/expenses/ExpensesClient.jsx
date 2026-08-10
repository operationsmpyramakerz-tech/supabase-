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
    <div className="expense-shots-modal is-open" style={{ display: "flex" }} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="expense-shots-modal__card" role="dialog" aria-modal="true">
        <div className="expense-shots-modal__head">
          <div>
            <h4 className="expense-shots-modal__title">Screenshots</h4>
            <div className="expense-shots-modal__count">{screenshots.length ? `${screenshots.length} image${screenshots.length === 1 ? "" : "s"}` : "No images uploaded"}</div>
          </div>
          <button type="button" className="expense-shots-modal__close" onClick={onClose} aria-label="Close screenshots viewer">×</button>
        </div>
        <div className="expense-shots-modal__body">
          {screenshots.length ? <div className="expense-shots-modal__grid">{screenshots.map((shot, index) => {
            const fallback = `/api/expenses/screenshot/${encodeURIComponent(text(transaction?.id))}?index=${index}`;
            return <a className="expense-shots-modal__item" href={shot.url || fallback} target="_blank" rel="noreferrer" key={`${shot.url}-${index}`}><span className="expense-shots-modal__image-wrap"><img className="expense-shots-modal__image" src={shot.url || fallback} alt={shot.name} /></span><span className="expense-shots-modal__caption">{shot.name}</span></a>;
          })}</div> : <div className="expense-shots-modal__empty"><div className="expense-shots-modal__empty-icon"><ClassicExpenseIcon name="image" size={24}/></div><div>No screenshots uploaded for this expense.</div></div>}
        </div>
      </div>
    </div>
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
        {orders.length ? <div className="expense-order-links">{orders.map((order, index) => {
          const href = modernTrackingHref(order);
          const receiptHref = modernReceiptViewerHref(order);
          const label = text(order?.orderId || order?.label) || "Order";
          return <span className="expense-order-link-group" key={`${order?.key || order?.label}-${index}`}>{href ? <a href={href} target="_blank" rel="noreferrer">{label}</a> : <span>{label}</span>}{receiptHref ? <a className="receipt-link" href={receiptHref} target="_blank" rel="noreferrer">Receipts</a> : null}</span>;
        })}</div> : null}
      </div>
      <div className="expense-transaction__amount"><strong>{ownCar && !value ? `${number(item?.kilometer)} km` : money(value, { signed: true })}</strong>{shots.length ? <button type="button" onClick={() => onScreenshots(item)}>Receipt {shots.length > 1 ? `(${shots.length})` : ""}</button> : <span>No receipt</span>}</div>
    </article>
  );
}


function ClassicExpenseIcon({ name, size = 18 }) {
  const common = { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const icons = {
    "arrow-down-left": <><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></>,
    "arrow-up-right": <><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></>,
    "arrow-right": <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    "chevron-down": <polyline points="6 9 12 15 18 9"/>,
    clock: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
    "check-circle": <><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    "external-link": <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    "credit-card": <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    car: <><path d="M5 17h14"/><path d="M6 17l1-6h10l1 6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
    tag: <><path d="M20.6 13.4L11 3H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
  };
  return <svg {...common}>{icons[name] || icons.tag}</svg>;
}

function compactMoney(value) {
  const amount = Math.abs(number(value));
  if (amount >= 1000000) return `£${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}m`;
  if (amount >= 1000) return `£${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  return money(amount);
}

function groupTransactions(items) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const reason = displayReason(item);
    const date = text(item?.date);
    const key = `${date}__${lower(reason)}`;
    if (!groups.has(key)) groups.set(key, { key, date, reason, items: [], orders: new Map(), cashIn: 0, cashOut: 0, kilometers: 0, created: transactionTime(item) });
    const group = groups.get(key);
    group.items.push(item);
    group.cashIn += number(item?.cashIn);
    group.cashOut += number(item?.cashOut);
    group.kilometers += number(item?.kilometer);
    group.created = Math.max(group.created, transactionTime(item));
    for (const order of Array.isArray(item?.orders) ? item.orders : []) {
      const orderKey = text(order?.key || order?.trackingGroupId || order?.orderId || order?.label);
      if (orderKey && !group.orders.has(orderKey)) group.orders.set(orderKey, order);
    }
  }
  return [...groups.values()].map((group) => ({ ...group, orders: [...group.orders.values()], total: group.cashIn - group.cashOut })).sort((a, b) => {
    const da = new Date(`${a.date || ""}T00:00:00`).getTime();
    const db = new Date(`${b.date || ""}T00:00:00`).getTime();
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return db - da;
    return b.created - a.created;
  });
}

function expenseAmount(item) {
  const cashIn = number(item?.cashIn);
  const cashOut = number(item?.cashOut);
  if (cashIn > 0) return { text: `+${money(cashIn)}`, tone: "is-positive" };
  if (typeKey(item?.fundsType) === "owncar" && number(item?.kilometer) > 0 && !cashOut) return { text: `${number(item.kilometer)} km`, tone: "is-neutral" };
  if (cashOut > 0) return { text: `-${money(cashOut)}`, tone: "is-negative" };
  return { text: money(0), tone: "is-neutral" };
}

function groupAmount(group) {
  if (!group.cashIn && !group.cashOut && group.kilometers > 0) return { text: `${group.kilometers} km`, tone: "is-neutral" };
  if (group.total > 0) return { text: `+${money(group.total)}`, tone: "is-positive" };
  if (group.total < 0) return { text: `-${money(Math.abs(group.total))}`, tone: "is-negative" };
  return { text: money(0), tone: "is-neutral" };
}

function orderMeta(order) {
  const key = typeKey(order?.orderType);
  if (key.includes("withdraw")) return { bg: "#fff1f2", fg: "#be123c", border: "#fecdd3" };
  if (key.includes("maintenance")) return { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" };
  return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
}

function ExpenseOrderActions({ orders }) {
  if (!orders?.length) return null;
  return <div className="expense-ticket__order-actions">{orders.map((order, index) => {
    const href = modernReceiptViewerHref(order) || modernTrackingHref(order);
    const label = [text(order?.orderId), text(order?.orderType)].filter(Boolean).join(" · ") || text(order?.label) || "Order";
    const meta = orderMeta(order);
    const style = { "--expense-order-btn-bg": meta.bg, "--expense-order-btn-fg": meta.fg, "--expense-order-btn-border": meta.border };
    return href ? <a className="expense-ticket__order-btn" style={style} href={href} target="_blank" rel="noreferrer" key={`${label}-${index}`}><span>{label}</span><ClassicExpenseIcon name="external-link" size={14}/></a> : <span className="expense-ticket__order-btn expense-ticket__order-btn--disabled" style={style} key={`${label}-${index}`}>{label}</span>;
  })}</div>;
}

function ExpenseShotButton({ item, onScreenshots }) {
  const shots = screenshotsFor(item);
  return <button type="button" className={`expense-ticket__shot-btn${shots.length ? " expense-ticket__shot-btn--has-shots" : ""}`} disabled={!shots.length} onClick={() => shots.length && onScreenshots(item)} aria-label={shots.length ? `View ${shots.length} screenshots` : "No screenshots uploaded"}><span className="expense-ticket__shot-btn-icon"><ClassicExpenseIcon name="image" size={18}/></span></button>;
}

function LedgerGroup({ group, onScreenshots }) {
  const total = groupAmount(group);
  return <section className="expense-ledger-group">
    <div className="expense-ledger-group__summary">
      <div className="expense-ledger-group__identity"><span className="expense-ledger-group__date">{formatDate(group.date, group.date || "No date")}</span><span className="expense-ledger-group__reason" title={group.reason}>{group.reason}</span></div>
      <div className="expense-ledger-group__orders"><ExpenseOrderActions orders={group.orders}/></div>
      <span className={`expense-ledger-group__total ${total.tone}`}>{total.text}</span>
      <span className="expense-ledger-group__receipt-label">Receipt</span>
    </div>
    <div className="expense-ledger-group__rows">{group.items.map((item, index) => {
      const amount = expenseAmount(item); const route = routeEndpoints(item); const cashIn = number(item?.cashIn) > 0; const category = cashIn ? { bg: "#edf9f2", fg: "#24935d", icon: "credit-card" } : { bg: "#fff3e9", fg: "#d96415", icon: typeKey(item?.fundsType) === "owncar" ? "car" : "tag" };
      return <div className="expense-ledger-row" key={text(item?.id) || `${group.key}-${index}`}>
        <div className="expense-ledger-row__context"><span className="expense-ledger-row__category-icon" style={{ "--category-bg": category.bg, "--category-fg": category.fg }}><ClassicExpenseIcon name={category.icon} size={14}/></span><span className="expense-ledger-row__context-copy"><span className="expense-ledger-row__type">{cashIn ? "Cash In" : text(item?.fundsType) || "Cash Out"}</span><span className="expense-ledger-row__kind">{cashIn ? "Incoming" : "Expense"}</span></span></div>
        <div className="expense-ledger-row__route"><span className="expense-ledger-row__route-main">{route.from} → {route.to}</span><span className="expense-ledger-row__route-sub"><span>{text(item?.reason) || "—"}</span></span></div>
        <span className={`expense-ledger-row__amount ${amount.tone}`}>{amount.text}</span>
        <span className="expense-ledger-row__shot"><ExpenseShotButton item={item} onScreenshots={onScreenshots}/></span>
      </div>;
    })}</div>
  </section>;
}

function ExpenseTicket({ group, onScreenshots, compact = false }) {
  const total = groupAmount(group);
  return <article className={`expense-ticket${compact ? " expense-ticket--compact" : ""}`}>
    <div className="expense-ticket__top"><div className={`expense-ticket__header-row${group.orders.length ? " expense-ticket__header-row--with-order" : ""}`}><div className="expense-ticket__meta"><span className="expense-ticket__date">{formatDate(group.date, group.date || "No date")}</span></div><div className="expense-ticket__header-side"><ExpenseOrderActions orders={group.orders}/>{!group.orders.length ? <div className="expense-ticket__reason">{group.reason}</div> : null}</div></div>{group.orders.length ? <div className="expense-ticket__reason expense-ticket__reason--block">{group.reason}</div> : null}<div className="expense-ticket__header-divider" /></div>
    <div className="expense-ticket__legs">{group.items.map((item, index) => { const route = routeEndpoints(item); const amount = expenseAmount(item); return <div className="expense-ticket__route" key={text(item?.id) || index}><div className="expense-ticket__route-frame"><div className="expense-ticket__route-shot"><ExpenseShotButton item={item} onScreenshots={onScreenshots}/></div><div className="expense-ticket__route-body"><div className="expense-ticket__route-top"><div className="expense-ticket__route-title">{number(item?.cashIn) > 0 ? "Cash In" : text(item?.fundsType) || "Cash Out"}</div><div className={`expense-ticket__route-amount ${amount.tone}`}>{amount.text}</div></div><div className="expense-ticket__route-sub"><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--from">{route.from}</span><span className="expense-ticket__route-arrow"><ClassicExpenseIcon name="arrow-right" size={16}/></span><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--to">{route.to}</span></div></div></div></div>; })}</div>
    <div className="expense-ticket__separator" />
    <div className="expense-ticket__footer"><span className="expense-ticket__footer-label">Total</span><span className={`expense-ticket__footer-value ${total.tone}`}>{total.text}</span></div>
  </article>;
}

function AllExpensesSheet({ items, onClose, onScreenshots, onExport }) {
  const groups = groupTransactions(items);
  return <div className="ios-modal next-ios-modal-open" style={{ display: "flex" }} role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="ios-sheet"><div className="ios-drag"/><h3 className="ex-modal-title" style={{ textAlign: "center" }}>All Expenses</h3><div className="next-all-expenses-sheet-actions"><button className="view-all-chip" type="button" onClick={onExport}>Export</button></div><div id="allExpensesList">{groups.length ? groups.map((group) => <ExpenseTicket group={group} onScreenshots={onScreenshots} compact key={group.key}/>) : <div className="expenses-empty">Sorry, No data available</div>}</div><button className="next-all-expenses-close" type="button" onClick={onClose}>Close</button></div></div>;
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

  const filteredGroups = useMemo(() => groupTransactions(filteredItems), [filteredItems]);

  return (
    <>
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some expense options could not refresh.</strong><span>The loaded transactions remain available, and the Classic page can still be opened as a fallback.</span><a href="/expenses?classic=1">Open classic Expenses</a></div> : null}
      {toast ? <div className={`next-toast next-toast--${toast.type}`} role="status"><span>{toast.type === "success" ? "✓" : toast.type === "error" ? "!" : "i"}</span><strong>{toast.message}</strong><button onClick={() => setToast(null)}>×</button></div> : null}

      <div className="expenses-layout expenses-dashboard next-expenses-classic-parity">
        <aside className="expenses-dashboard__sidebar" aria-label="Expense analytics">
          <section className="total-card expenses-summary-card" aria-label="Expenses summary">
            <div className="expenses-summary-card__head"><div><span className="expenses-eyebrow">Expense summary</span><div className="total-label">Current balance</div></div><span className="expenses-summary-card__period">Since settlement</span></div>
            <div className="total-card__main"><div className="total-amount">{money(summary.balance)}</div><div className="total-currency">EGP</div></div>
            <div className="total-card__side" aria-label="Cash flow summary">
              <div className="summary-pill summary-pill--in"><span className="summary-pill__icon"><ClassicExpenseIcon name="arrow-down-left"/></span><span className="summary-pill__copy"><span className="summary-pill__label">Cash in</span><span className="summary-pill__value">+{money(summary.cashIn)}</span></span></div>
              <div className="summary-pill summary-pill--out"><span className="summary-pill__icon"><ClassicExpenseIcon name="arrow-up-right"/></span><span className="summary-pill__copy"><span className="summary-pill__label">Cash out</span><span className="summary-pill__value">-{money(summary.cashOut)}</span></span></div>
            </div>
            <div className="total-card__actions"><button className="settle-btn" type="button" onClick={() => setModal("settle")}><ClassicExpenseIcon name="check-circle" size={15}/><span>Settled my account</span></button><div className={`last-settled ${lastSettledDate || lastSettledAt ? "" : "last-settled--empty"}`}><span className="last-settled__label">Last settlement</span><span className="last-settled__date">{formatDate(lastSettledDate || lastSettledAt, "No settlements yet")}</span><span className="last-settled__receipt" /></div></div>
          </section>

          <section className="expenses-analytics-card expenses-monthly-card" aria-labelledby="monthlyExpenseTitle">
            <div className="expenses-card-head"><div><span className="expenses-eyebrow">Monthly overview</span><h2 id="monthlyExpenseTitle">Expenses by month</h2></div><label className="expenses-year-select" aria-label="Select chart year"><ClassicExpenseIcon name="calendar" size={13}/><select value={selectedYear} onChange={(event) => { const year = Number(event.target.value); setSelectedYear(year); setSelectedMonth(""); }}>{years.map((year) => <option key={year}>{year}</option>)}</select><ClassicExpenseIcon name="chevron-down" size={12}/></label></div>
            <div className="expense-monthly-chart"><div className="expense-chart-shell"><div className="expense-chart-y-axis" aria-hidden="true">{[maxMonthly, maxMonthly * .75, maxMonthly * .5, maxMonthly * .25, 0].map((value, index) => <span key={index}>{compactMoney(value)}</span>)}</div><div className="expense-chart-stage"><div className="expense-chart-grid" aria-hidden="true"><span/><span/><span/><span/><span/></div><div className="expense-month-bars">{monthlyTotals.map((value, index) => { const key = `${selectedYear}-${String(index + 1).padStart(2, "0")}`; const percent = maxMonthly ? value / maxMonthly * 100 : 0; return <button type="button" className={`expense-month-bar ${effectiveSelectedMonth === key ? "is-active " : ""}${value ? "has-data" : "is-empty"}`} onClick={() => setSelectedMonth(key)} key={key}><span className="expense-month-bar__bubble">{compactMoney(value)}</span><span className="expense-month-bar__track"><span className="expense-month-bar__fill" style={{ "--value": percent.toFixed(2) }}/></span><span className="expense-month-bar__label">{MONTHS[index]}</span></button>; })}</div></div></div></div>
          </section>

          <section className="expenses-analytics-card expenses-types-card" aria-labelledby="expenseTypesTitle">
            <div className="expenses-card-head"><div><span className="expenses-eyebrow">Selected month</span><h2 id="expenseTypesTitle">Expense types</h2></div><span className="expenses-selected-month">{formatDate(`${effectiveSelectedMonth}-01`, "—")}</span></div>
            <div className="expense-types-chart">{typeRows.length ? <div className="expense-types-layout"><div className="expense-donut" style={{ "--donut-gradient": donutGradient }}><div className="expense-donut__center"><span>Total</span><strong>{compactMoney(typeTotal)}</strong></div></div><div className="expense-types-legend">{typeRows.map((row, index) => <div className="expense-type-legend-row" key={row.label}><span className="expense-type-legend-row__dot" style={{ "--legend-color": TYPE_COLORS[index % TYPE_COLORS.length] }}/><span className="expense-type-legend-row__name">{row.label}</span><span className="expense-type-legend-row__value">{typeTotal ? `${(row.value / typeTotal * 100).toFixed(row.value / typeTotal >= .1 ? 0 : 1)}%` : "0%"}</span></div>)}</div></div> : <div className="expense-chart-empty"><ClassicExpenseIcon name="tag" size={20}/><span>No cash-out expenses in this month.</span></div>}</div>
          </section>
        </aside>

        <section className="expenses-dashboard__main" aria-label="Expense activity">
          <div className="expense-action-grid" aria-label="Expense actions">
            <button className="cash-btn cash-in" type="button" onClick={() => setModal("cash-in")}><span className="cash-btn__icon"><ClassicExpenseIcon name="arrow-down-left" size={19}/></span><span className="cash-btn__copy"><strong>Cash in</strong><small>Record incoming money</small></span><span className="cash-btn__arrow"><ClassicExpenseIcon name="arrow-right" size={18}/></span></button>
            <button className="cash-btn cash-out" type="button" onClick={() => setModal("cash-out")}><span className="cash-btn__icon"><ClassicExpenseIcon name="arrow-up-right" size={19}/></span><span className="cash-btn__copy"><strong>Cash out</strong><small>Record outgoing money</small></span><span className="cash-btn__arrow"><ClassicExpenseIcon name="arrow-right" size={18}/></span></button>
          </div>

          <section className="expenses-activity-card">
            <div className="expenses-activity-head"><div><span className="expenses-eyebrow">Transactions</span><h2>Expense details</h2></div><button className="view-all-chip" type="button" onClick={() => setModal("all")}><span>View all</span><ClassicExpenseIcon name="external-link" size={13}/></button></div>
            <div className="expenses-overview" aria-label="Expenses overview controls"><div className="expenses-filters" role="tablist">{[["recent","Recent"],["cash-in","Cash in"],["cash-out","Cash out"]].map(([key,label]) => <button className={`expenses-filter${filter === key ? " is-active" : ""}`} aria-selected={filter === key} type="button" onClick={() => setFilter(key)} key={key}>{label}</button>)}</div><span className="expenses-period-note"><ClassicExpenseIcon name="clock" size={13}/>Last 7 days</span></div>
            <div className="expenses-ledger-head" aria-hidden="true"><span>Date / Reason</span><span>Type &amp; route</span><span>Amount</span><span>Receipt</span></div>
            <div className="expenses-content">{filteredGroups.length ? filteredGroups.map((group) => <LedgerGroup group={group} onScreenshots={setScreenshotTransaction} key={group.key}/>) : <div className="expenses-empty">Sorry, No data available</div>}</div>
          </section>
        </section>
      </div>

      {modal === "cash-in" ? <CashInModal options={cashInFromOptions} onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "cash-out" ? <CashOutModal fundsTypes={fundsTypes} orderOptions={orderOptions} onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "settle" ? <SettleModal onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "export" ? <ExportModal account={account} items={items} onClose={() => setModal("")} notify={notify} /> : null}
      {modal === "all" ? <AllExpensesSheet items={items} onClose={() => setModal("")} onScreenshots={setScreenshotTransaction} onExport={() => setModal("export")} /> : null}
      {screenshotTransaction ? <ScreenshotModal transaction={screenshotTransaction} onClose={() => setScreenshotTransaction(null)} /> : null}
    </>
  );
}

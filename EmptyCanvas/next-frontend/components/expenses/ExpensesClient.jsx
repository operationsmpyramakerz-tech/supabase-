"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
    name: text(shot?.name || shot?.filename || shot?.fileName) || `Receipt ${index + 1}`,
    url: text(
      shot?.url ||
      shot?.href ||
      shot?.publicUrl ||
      shot?.public_url ||
      shot?.signedUrl ||
      shot?.signedURL ||
      shot?.downloadUrl ||
      shot?.downloadURL ||
      shot?.file?.url ||
      shot?.external?.url ||
      shot?.dataUrl ||
      shot?.data_url
    ),
  })).filter((shot) => shot.url);
  if (normalized.length) return normalized;
  const fallback = text(item?.screenshotUrl || item?.screenshot_url);
  return fallback ? [{ name: text(item?.screenshotName || item?.screenshot_name) || "Receipt", url: fallback }] : [];
}
function routeEndpoints(item) {
  const cashIn = number(item?.cashIn) > 0;
  const from = text(item?.from || item?.cashInFrom) || (cashIn ? "Cash in" : "—");
  const to = text(item?.to) || (cashIn ? "Wallet" : "—");
  return { from, to };
}
function displayReason(item) {
  const orders = Array.isArray(item?.orders) ? item.orders.filter(Boolean) : [];
  const rawReason = text(item?.reason);
  const primaryLabel = text(orders[0]?.label);
  if (rawReason && primaryLabel) {
    const normalizedReason = lower(rawReason).replace(/\s+/g, " ");
    const normalizedLabel = lower(primaryLabel).replace(/\s+/g, " ");
    if (normalizedReason === normalizedLabel || normalizedReason.startsWith(`${normalizedLabel} •`)) return primaryLabel;
  }
  return rawReason || primaryLabel || (number(item?.cashIn) > 0 ? "Cash In" : text(item?.fundsType) || "Cash Out");
}
function niceChartMax(value) {
  const raw = Math.max(0, number(value));
  if (!raw) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}
function selectedMonthLabel(monthKeyValue) {
  const match = text(monthKeyValue).match(/^(\d{4})-(\d{2})$/);
  if (!match) return "—";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function settlementReceiptNumber(item) {
  return text(item?.receiptNumber || item?.receipt || item?.ordersRaw);
}
function latestSettlementReceipt(items, lastSettledAt) {
  const source = Array.isArray(items) ? items : [];
  const exact = text(lastSettledAt);
  if (exact) {
    const match = source.find((item) => isSettlement(item) && text(item?.createdTime) === exact && settlementReceiptNumber(item));
    if (match) return settlementReceiptNumber(match);
  }
  let receipt = "";
  let latest = Number.NEGATIVE_INFINITY;
  source.forEach((item) => {
    if (!isSettlement(item)) return;
    const candidate = settlementReceiptNumber(item);
    if (!candidate) return;
    const stamp = transactionTime(item);
    if (stamp >= latest) { latest = stamp; receipt = candidate; }
  });
  return receipt;
}
function fundsTypeOption(value) {
  const key = typeKey(value);
  const ownCar = key === "owncar";
  const required = SCREENSHOT_REQUIRED_KEYS.has(key);
  return {
    value,
    label: value,
    note: ownCar ? "Google Maps screenshot required" : required ? "Screenshot is required" : "Screenshot upload is optional",
    badge: ownCar ? "Maps required" : required ? "Required" : "Optional",
    tone: ownCar ? "violet" : required ? "orange" : "neutral",
  };
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

function ClassicModal({ title, onClose, children, compact = false }) {
  return (
    <div className="ex-modal" style={{ display: "flex" }} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`ex-modal-box${compact ? " ex-modal-box--compact" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <h3 className="ex-modal-title">{title}</h3>
        {children}
      </section>
    </div>
  );
}

function ClassicFieldLabel({ icon, children, compact = false }) {
  return <span className={`field-label${compact ? " field-label--compact" : ""}`}><ClassicExpenseIcon name={icon} size={compact ? 14 : 16}/>{children}</span>;
}

function ClassicSelect({ value, onChange, options = [], placeholder = "Select…", ariaLabel = "Options" }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const normalized = useMemo(() => (Array.isArray(options) ? options : []).map((option) => {
    if (typeof option === "string") return { value: option, label: option };
    return { ...option, value: text(option?.value), label: text(option?.label || option?.value) };
  }).filter((option) => option.value), [options]);
  const selected = normalized.find((option) => option.value === text(value)) || null;

  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const trigger = rootRef.current?.querySelector(".order-select__trigger");
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPad = 16;
      const width = Math.min(rect.width, window.innerWidth - viewportPad * 2);
      const left = Math.min(Math.max(viewportPad, rect.left), window.innerWidth - viewportPad - width);
      const spaceBelow = Math.max(120, window.innerHeight - rect.bottom - viewportPad);
      const spaceAbove = Math.max(120, rect.top - viewportPad);
      const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableSpace = placeAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(360, availableSpace);
      const top = placeAbove ? Math.max(viewportPad, rect.top - maxHeight - 8) : Math.min(window.innerHeight - viewportPad - maxHeight, rect.bottom + 8);
      setMenuStyle({ left, top, width, maxHeight, zIndex: 100500 });
    };
    const closeOutside = (event) => {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  const dropdown = open && menuStyle && typeof document !== "undefined" ? createPortal(
    <div ref={menuRef} className="order-select__dropdown" style={menuStyle} role="listbox" aria-label={ariaLabel}>
      <div className="order-select__options" style={{ maxHeight: Math.max(120, Math.min(260, menuStyle.maxHeight - 24)) }}>
        {normalized.length ? normalized.map((option) => {
          const active = option.value === text(value);
          return <button type="button" className={`order-select__option${active ? " is-selected" : ""}`} role="option" aria-selected={active} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>
            <span className={option.note ? "funds-select__option-main" : "order-select__option-main"}>
              <span className="order-select__option-id">{option.label}</span>
              {option.note ? <span className="funds-select__option-note">{option.note}</span> : null}
            </span>
            {option.badge ? <span className="order-select__chip" style={option.tone === "orange" ? { "--order-chip-bg": "#fff7ed", "--order-chip-fg": "#c2410c", "--order-chip-border": "#fed7aa" } : undefined}>{option.badge}</span> : null}
          </button>;
        }) : <div className="order-select__status">No options available right now.</div>}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="order-select funds-select" ref={rootRef}>
      <button type="button" className={`order-select__trigger${selected ? " is-selected" : " is-placeholder"}${open ? " is-open" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="order-select__trigger-label">
          {selected ? <span className="funds-type-summary"><span className="funds-type-summary__name">{selected.label}</span></span> : placeholder}
        </span>
        <ClassicExpenseIcon name="chevron-down" size={18}/>
      </button>
      {dropdown}
    </div>
  );
}

function ClassicFileField({ files, onChange, required = false, hint = "Upload receipt screenshots (JPG/PNG)." }) {
  const inputRef = useRef(null);
  const names = files.length ? files.map((file) => file?.name).filter(Boolean).join(", ") : "No file chosen";
  return (
    <div>
      <ClassicFieldLabel icon="image">Screenshot <span className={required ? "req-text" : "opt-tag"}>({required ? "Required" : "Optional"})</span></ClassicFieldLabel>
      <div className={`upload-control${required ? " is-required" : ""}`}>
        <input ref={inputRef} className="upload-input" type="file" accept="image/*" multiple onChange={(event) => onChange(Array.from(event.target.files || []))}/>
        <div className="upload-row">
          <button type="button" className="upload-btn" onClick={() => inputRef.current?.click()}><ClassicExpenseIcon name="upload" size={18}/><span>Upload screenshot</span></button>
          <span className="upload-filename" title={names}>{names}</span>
        </div>
      </div>
      <small className={`help${required ? " is-emphasis" : ""}`}>{hint}</small>
    </div>
  );
}

function ModernSelect({ value, onChange, options = [], placeholder = "Select…", searchable = false, searchPlaceholder = "Search…", emptyText = "No options available" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const normalized = useMemo(() => (Array.isArray(options) ? options : []).map((option) => {
    if (typeof option === "string") return { value: option, label: option };
    return { ...option, value: text(option?.value), label: text(option?.label || option?.value) };
  }).filter((option) => option.value), [options]);
  const selected = normalized.find((option) => option.value === text(value)) || null;
  const filtered = useMemo(() => {
    const q = lower(query);
    if (!q) return normalized;
    return normalized.filter((option) => lower([option.label, option.note, option.badge].join(" ")).includes(q));
  }, [normalized, query]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    const closeEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);

  return (
    <div className={`expense-modern-select${open ? " is-open" : ""}`} ref={rootRef}>
      <button type="button" className={`expense-modern-select__trigger${selected ? " is-selected" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="expense-modern-select__selected">
          <strong>{selected?.label || placeholder}</strong>
          {selected?.note ? <small>{selected.note}</small> : null}
        </span>
        {selected?.badge ? <span className={`expense-modern-select__badge is-${selected.tone || "neutral"}`}>{selected.badge}</span> : null}
        <ClassicExpenseIcon name="chevron-down" size={15} />
      </button>
      {open ? <div className="expense-modern-select__menu" role="listbox">
        {searchable ? <div className="expense-modern-select__search"><ClassicExpenseIcon name="search" size={15}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} /></div> : null}
        <div className="expense-modern-select__options">
          {filtered.length ? filtered.map((option) => <button type="button" className={`expense-modern-select__option${option.value === text(value) ? " is-selected" : ""}`} role="option" aria-selected={option.value === text(value)} key={option.value} onClick={() => { onChange(option.value); setOpen(false); setQuery(""); }}>
            <span><strong>{option.label}</strong>{option.note ? <small>{option.note}</small> : null}</span>
            {option.badge ? <em className={`expense-modern-select__badge is-${option.tone || "neutral"}`}>{option.badge}</em> : option.value === text(value) ? <ClassicExpenseIcon name="check-circle" size={16}/> : null}
          </button>) : <div className="expense-modern-select__empty">{emptyText}</div>}
        </div>
      </div> : null}
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
  const [form, setForm] = useState({ date: "", amount: "", fundsType: "", paymentBy: "", receiptNumber: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const isTransfer = typeKey(form.fundsType) === "onlinetransfer";
  const isCash = typeKey(form.fundsType) === "cashpayment";
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const typeOptions = CASH_IN_TYPES.map((value) => ({
    value,
    label: value,
    note: value === "Online Transfer" ? "Screenshot is required for this transfer" : "Receipt number is required for this payment",
    badge: value === "Online Transfer" ? "Required" : "Receipt",
    tone: value === "Online Transfer" ? "orange" : "neutral",
  }));

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
    <ClassicModal title="Add Cash In" onClose={onClose}>
      <ClassicFieldLabel icon="calendar">Date <span className="req-star">*</span></ClassicFieldLabel>
      <input type="date" className="ex-input" value={form.date} onChange={update("date")}/>

      <ClassicFieldLabel icon="plus-circle">Cash in <span className="req-star">*</span></ClassicFieldLabel>
      <input type="number" min="0" step="0.01" className="ex-input" value={form.amount} onChange={update("amount")}/>

      <ClassicFieldLabel icon="tag">Funds Type <span className="req-star">*</span></ClassicFieldLabel>
      <ClassicSelect
        value={form.fundsType}
        onChange={(value) => {
          setForm((current) => ({ ...current, fundsType: value, receiptNumber: value === "Cash Payment" ? current.receiptNumber : "" }));
          if (value !== "Online Transfer") setFiles([]);
        }}
        options={typeOptions}
        placeholder="Select funds type..."
        ariaLabel="Cash in funds types"
      />

      <ClassicFieldLabel icon="user">Payment by <span className="req-star">*</span></ClassicFieldLabel>
      <input className="ex-input" list="expense-cash-in-people" value={form.paymentBy} onChange={update("paymentBy")} placeholder="Enter the person name"/>
      <datalist id="expense-cash-in-people">{options.map((item) => <option value={text(item?.name)} key={text(item?.id || item?.name)}/>)}</datalist>

      {isCash ? <>
        <ClassicFieldLabel icon="hash">Receipt number <span className="req-star">*</span></ClassicFieldLabel>
        <input className="ex-input" value={form.receiptNumber} onChange={update("receiptNumber")} placeholder="Enter receipt number"/>
      </> : null}

      {isTransfer ? <ClassicFileField files={files} onChange={setFiles} required hint="Upload the transfer screenshot (JPG/PNG)."/> : null}

      <div className="ex-modal-actions">
        <button type="button" className="ex-btn ex-primary" onClick={submit} disabled={busy}>{busy ? "Saving..." : "Submit"}</button>
        <button type="button" className="ex-btn ex-danger" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </ClassicModal>
  );
}

function CashOutModal({ fundsTypes, orderOptions, onClose, onSaved, notify }) {
  const [scopeId, setScopeId] = useState("");
  const [date, setDate] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [form, setForm] = useState({ fundsType: "", from: "", to: "", amount: "", kilometer: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("order");
  const [showOwnCarInfo, setShowOwnCarInfo] = useState(false);
  const selectedOrder = scopeId === OTHER_SCOPE_ID ? null : orderOptions.find((item) => text(item?.id) === scopeId) || null;
  const isManual = scopeId === OTHER_SCOPE_ID;
  const isOwnCar = typeKey(form.fundsType) === "owncar";
  const screenshotRequired = SCREENSHOT_REQUIRED_KEYS.has(typeKey(form.fundsType));
  const scopeOptions = useMemo(() => [
    { value: OTHER_SCOPE_ID, label: "Other reason", note: "Write the reason manually", badge: "Manual", tone: "neutral" },
    ...(Array.isArray(orderOptions) ? orderOptions : []).map((item) => ({
      value: text(item?.id),
      label: text(item?.orderId) || text(item?.label) || "Order",
      note: [text(item?.orderType), text(item?.productName)].filter(Boolean).join(" · "),
      badge: text(item?.orderType) || "Order",
      tone: typeKey(item?.orderType).includes("maintenance") ? "orange" : "neutral",
    })),
  ], [orderOptions]);
  const fundsTypeOptions = useMemo(() => fundsTypes.map(fundsTypeOption), [fundsTypes]);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const openExpenseStep = () => {
    if (!scopeId || (!selectedOrder && !isManual)) return notify("Choose an order or Other reason first.", "error");
    if (isManual && !text(manualReason)) return notify("Write the expense reason.", "error");
    if (!date) return notify("Choose the expense date first.", "error");
    setStep("expense");
  };

  const addDraft = async () => {
    if (!date || !form.fundsType) return notify("Date and funds type are required.", "error");
    if (!isOwnCar && number(form.amount) <= 0) return notify("Cash out amount is required.", "error");
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
      setShowOwnCarInfo(false);
      setStep("order");
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
            ...(typeKey(draft.fundsType) === "owncar" ? { kilometer: draft.kilometer } : { amount: draft.amount }),
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

  if (step === "expense") {
    return <>
      <ClassicModal title="Add Expense" onClose={() => setStep("order")}>
        <div className="order-preview-card order-preview-card--inline">
          <div className="order-preview-row">
            <div>
              <div className="order-preview-label">Selected order</div>
              <div className="order-preview-text">{isManual ? "Other reason" : (text(selectedOrder?.label) || text(selectedOrder?.orderId) || "Order")}</div>
              <div className="order-preview-meta">{isManual ? text(manualReason) : [text(selectedOrder?.orderType), formatDate(date, date)].filter(Boolean).join(" · ")}</div>
            </div>
            <button type="button" className="order-change-btn" onClick={() => setStep("order")} disabled={busy}>Change</button>
          </div>
        </div>

        <ClassicFieldLabel icon="tag">Funds Type <span className="req-star">*</span></ClassicFieldLabel>
        <ClassicSelect
          value={form.fundsType}
          onChange={(value) => {
            setForm((current) => ({ ...current, fundsType: value, amount: typeKey(value) === "owncar" ? "" : current.amount }));
            if (typeKey(value) === "owncar") setShowOwnCarInfo(true);
          }}
          options={fundsTypeOptions}
          placeholder="Select funds type..."
          ariaLabel="Funds types"
        />

        <ClassicFieldLabel icon="log-out" compact>From <span className="opt-tag">(Optional)</span></ClassicFieldLabel>
        <input className="ex-input ex-input--compact" value={form.from} onChange={update("from")}/>

        <ClassicFieldLabel icon="log-in" compact>To <span className="opt-tag">(Optional)</span></ClassicFieldLabel>
        <input className="ex-input ex-input--compact" value={form.to} onChange={update("to")}/>

        {isOwnCar ? <>
          <ClassicFieldLabel icon="navigation">Kilometer <span className="opt-tag">(Optional)</span></ClassicFieldLabel>
          <input type="number" min="0" step="0.1" className="ex-input" value={form.kilometer} onChange={update("kilometer")}/>
        </> : <>
          <ClassicFieldLabel icon="minus-circle">Cash out <span className="req-text">(Required)</span></ClassicFieldLabel>
          <input type="number" min="0" step="0.01" className="ex-input" value={form.amount} onChange={update("amount")}/>
        </>}

        <ClassicFileField
          files={files}
          onChange={setFiles}
          required={screenshotRequired}
          hint={isOwnCar ? "Upload a Google Maps screenshot showing the distance between the starting point and destination." : screenshotRequired ? "Upload a screenshot or receipt for this funds type." : "Upload receipt screenshots (JPG/PNG)."}
        />

        <div className="ex-modal-actions">
          <button type="button" className="ex-btn ex-dark" onClick={addDraft} disabled={busy}>{busy ? "Adding..." : "Add Expense"}</button>
          <button type="button" className="ex-btn ex-danger" onClick={() => setStep("order")} disabled={busy}>Back</button>
        </div>
      </ClassicModal>

      {showOwnCarInfo ? <div className="mini-info-modal" style={{ display: "flex" }} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowOwnCarInfo(false)}>
        <div className="mini-info-modal__card" role="dialog" aria-modal="true" aria-label="Own car notice">
          <div className="mini-info-modal__badge">Own car notice</div>
          <h4 className="mini-info-modal__title">Google Maps screenshot required</h4>
          <p className="mini-info-modal__text">For <strong>Own car</strong> expenses, please upload a screenshot from Google Maps showing the distance between the starting point and destination.</p>
          <div className="mini-info-modal__actions"><button type="button" className="ex-btn ex-primary" onClick={() => setShowOwnCarInfo(false)}>Got it</button></div>
        </div>
      </div> : null}
    </>;
  }

  return (
    <ClassicModal title="Choose Order" onClose={onClose} compact>
      <p className="order-picker-hint">Select the order and date first, then add one or more expenses before confirming.</p>

      <ClassicFieldLabel icon="file-text">Order <span className="req-star">*</span></ClassicFieldLabel>
      <ClassicSelect
        value={scopeId}
        onChange={(value) => { setScopeId(value); setDrafts([]); }}
        options={scopeOptions}
        placeholder="Select order..."
        ariaLabel="Orders"
      />

      {isManual ? <div className="cashout-manual-reason">
        <ClassicFieldLabel icon="edit-3">Reason <span className="req-star">*</span></ClassicFieldLabel>
        <input className="ex-input" value={manualReason} onChange={(event) => setManualReason(event.target.value)} placeholder="Write the reason manually"/>
      </div> : null}

      <ClassicFieldLabel icon="calendar">Date <span className="req-star">*</span></ClassicFieldLabel>
      <input type="date" className="ex-input" value={date} onChange={(event) => { setDate(event.target.value); setDrafts([]); }}/>

      <button type="button" className="ex-btn ex-dark ex-btn--block" onClick={openExpenseStep} disabled={busy}>Add Expense</button>

      {drafts.length ? <div className="expense-drafts">
        <div className="expense-drafts__header"><span className="expense-drafts__title">Added expenses</span><span className="expense-drafts__count">{drafts.length}</span></div>
        <div className="expense-drafts__list">{drafts.map((draft) => <div className="expense-draft-card" key={draft.id}>
          <div className="expense-draft-card__main"><div className="expense-draft-card__title">{draft.fundsType}</div><div className="expense-draft-card__meta">{[draft.reason, [draft.from, draft.to].filter(Boolean).join(draft.from && draft.to ? " → " : " ")].filter(Boolean).join(" • ") || "Ready to save"}</div></div>
          <div className="expense-draft-card__value">{typeKey(draft.fundsType) === "owncar" ? `${number(draft.kilometer)} km` : money(draft.amount)}</div>
          <button type="button" className="expense-draft-card__remove" onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))} aria-label="Remove expense">×</button>
        </div>)}</div>
      </div> : null}

      <div className="ex-modal-actions">
        <button type="button" className="ex-btn ex-primary" onClick={confirm} disabled={busy || !drafts.length}>{busy ? "Saving..." : drafts.length ? `Confirm (${drafts.length})` : "Confirm"}</button>
        <button type="button" className="ex-btn ex-danger" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </ClassicModal>
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
        <div className="expense-field"><span>Funds type *</span><ModernSelect value={form.fundsType} onChange={(value) => { setForm((current) => ({ ...current, fundsType: value, receiptNumber: value === "Cash Payment" ? current.receiptNumber : "" })); if (value !== "Online Transfer") setFiles([]); }} options={CASH_IN_TYPES.map((value) => ({ value, label: value, note: value === "Online Transfer" ? "Screenshot is required for this transfer" : "Receipt number is required for this payment", badge: value === "Online Transfer" ? "Required" : "Receipt", tone: value === "Online Transfer" ? "orange" : "neutral" }))} placeholder="Select funds type…" /></div>
        <label className="expense-form-full"><span>Settled by *</span><input value={form.settledBy} onChange={update("settledBy")} placeholder="Person name" /></label>
        {isCash ? <label className="expense-form-full"><span>Receipt number *</span><input value={form.receiptNumber} onChange={update("receiptNumber")} /></label> : null}
        {isTransfer ? <div className="expense-form-full"><FileField files={files} onChange={setFiles} required hint="Upload the transfer screenshot (JPG/PNG)." /></div> : null}
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

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("expense-shots-modal-open");
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("expense-shots-modal-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
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
            const href = shot.url || fallback;
            return <a className="expense-shots-modal__item" href={href} target="_blank" rel="noreferrer" key={`${href}-${index}`}><span className="expense-shots-modal__image-wrap"><img className="expense-shots-modal__image" src={href} alt={shot.name} /></span><span className="expense-shots-modal__caption">{shot.name}</span></a>;
          })}</div> : <div className="expense-shots-modal__empty"><div className="expense-shots-modal__empty-icon"><ClassicExpenseIcon name="image" size={24}/></div><div>No screenshots uploaded for this expense.</div></div>}
        </div>
      </div>
    </div>,
    document.body,
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
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    navigation: <polygon points="3 11 22 2 13 21 11 13 3 11"/>,
    "credit-card": <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    car: <><path d="M5 17h14"/><path d="M6 17l1-6h10l1 6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
    tag: <><path d="M20.6 13.4L11 3H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    "plus-circle": <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    hash: <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></>,
    "edit-3": <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    "log-in": <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></>,
    "minus-circle": <><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    "more-horizontal": <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    coffee: <><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>,
    monitor: <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
    "shopping-cart": <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 6H6"/></>,
    tool: <><path d="M14.7 6.3a4 4 0 0 0-5-5L7 4 4 1 1 4l3 3-2.7 2.7a4 4 0 0 0 5 5L16 5z"/><path d="M12 12l8.5 8.5"/></>,
    package: <><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></>,
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
  if (key === "manualreason" || key === "otherreason" || key === "manual") return { icon: "edit-3", bg: "#F3F4F6", fg: "#111827", border: "#D1D5DB" };
  if (key === "requestproducts" || key === "delivery") return { icon: "shopping-cart", bg: "#DCFCE7", fg: "#166534", border: "#86EFAC" };
  if (key === "withdrawproducts" || key === "withdrawal") return { icon: "log-out", bg: "#FEE2E2", fg: "#B91C1C", border: "#FECACA" };
  if (key === "requestmaintenance" || key === "maintenance") return { icon: "tool", bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" };
  return { icon: "package", bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" };
}

function ExpenseOrderActions({ orders }) {
  if (!orders?.length) return null;
  return <div className="expense-ticket__order-actions">{orders.map((order, index) => {
    const href = modernReceiptViewerHref(order) || modernTrackingHref(order);
    const label = [text(order?.orderId), text(order?.orderType)].filter(Boolean).join(" · ") || text(order?.label) || "Order";
    const meta = orderMeta(order);
    const style = { "--expense-order-btn-bg": meta.bg, "--expense-order-btn-fg": meta.fg, "--expense-order-btn-border": meta.border };
    return href ? <a className="expense-ticket__order-btn" style={style} href={href} target="_blank" rel="noreferrer" key={`${label}-${index}`}><ClassicExpenseIcon name={meta.icon} size={15}/><span>{label}</span><ClassicExpenseIcon name="external-link" size={14}/></a> : <span className="expense-ticket__order-btn expense-ticket__order-btn--disabled" style={style} key={`${label}-${index}`}><ClassicExpenseIcon name={meta.icon} size={15}/><span>{label}</span></span>;
  })}</div>;
}

function ExpenseShotButton({ item, onScreenshots }) {
  const shots = screenshotsFor(item);
  return <button type="button" className={`expense-ticket__shot-btn${shots.length ? " expense-ticket__shot-btn--has-shots" : ""}`} disabled={!shots.length} onClick={() => shots.length && onScreenshots(item)} aria-label={shots.length ? `View ${shots.length} screenshots` : "No screenshots uploaded"}><span className="expense-ticket__shot-btn-icon"><ClassicExpenseIcon name="image" size={18}/></span></button>;
}

function expenseLedgerCategoryMeta(item) {
  const label = number(item?.cashIn) > 0 ? "Cash In" : text(item?.fundsType) || "Cash Out";
  const key = typeKey(label);
  if (number(item?.cashIn) > 0) return { icon: "credit-card", bg: "#edf9f2", fg: "#24935d" };
  if (/(uber|indrive|didi|taxi|bus|train|metro|swvl|transport|car)/.test(key)) return { icon: "truck", bg: "#eef5ff", fg: "#3978c9" };
  if (/(meal|food|allowance)/.test(key)) return { icon: "coffee", bg: "#fff4e9", fg: "#dd6b17" };
  if (/(online|transfer|cashpayment|payment)/.test(key)) return { icon: "credit-card", bg: "#edf9f2", fg: "#24935d" };
  if (/(software|subscription|internet)/.test(key)) return { icon: "monitor", bg: "#f5effb", fg: "#8555ad" };
  return { icon: "more-horizontal", bg: "#f1f4f8", fg: "#64748b" };
}

function LedgerGroup({ group, onScreenshots }) {
  const total = groupAmount(group);
  const rows = [...(Array.isArray(group?.items) ? group.items : [])].sort((a, b) => transactionTime(a) - transactionTime(b));
  const receiptCount = rows.reduce((count, item) => count + screenshotsFor(item).length, 0);
  return <section className="expense-ledger-group">
    <div className="expense-ledger-group__summary">
      <div className="expense-ledger-group__identity"><span className="expense-ledger-group__date">{formatDate(group.date, group.date || "No date")}</span><span className="expense-ledger-group__reason" title={group.reason}>{group.reason}</span></div>
      <div className="expense-ledger-group__orders"><ExpenseOrderActions orders={group.orders}/></div>
      <span className={`expense-ledger-group__total ${total.tone}`}>{total.text}</span>
      <span className="expense-ledger-group__receipt-label">{receiptCount ? `${receiptCount} file${receiptCount === 1 ? "" : "s"}` : "—"}</span>
    </div>
    <div className="expense-ledger-group__rows">{rows.map((item, index) => {
      const amount = expenseAmount(item);
      const route = routeEndpoints(item);
      const cashIn = number(item?.cashIn) > 0;
      const category = expenseLedgerCategoryMeta(item);
      const typeLabel = cashIn ? "Cash In" : text(item?.fundsType) || "Cash Out";
      const kindLabel = cashIn ? "Cash in" : "Cash out";
      return <div className="expense-ledger-row" key={text(item?.id) || `${group.key}-${index}`}>
        <div className="expense-ledger-row__context"><span className="expense-ledger-row__category-icon" style={{ "--category-bg": category.bg, "--category-fg": category.fg }}><ClassicExpenseIcon name={category.icon} size={14}/></span><span className="expense-ledger-row__context-copy"><span className="expense-ledger-row__type" title={typeLabel}>{typeLabel}</span><span className="expense-ledger-row__kind">{kindLabel}</span></span></div>
        <div className="expense-ledger-row__route"><span className="expense-ledger-row__route-main" title={group.reason}>{group.reason || "Expense"}</span><span className="expense-ledger-row__route-sub"><span title={route.from}>{route.from}</span><ClassicExpenseIcon name="arrow-right" size={10}/><span title={route.to}>{route.to}</span></span></div>
        <span className={`expense-ledger-row__amount ${amount.tone}`}>{amount.text}</span>
        <span className="expense-ledger-row__shot"><ExpenseShotButton item={item} onScreenshots={onScreenshots}/></span>
      </div>;
    })}</div>
  </section>;
}

function shouldHideExpenseGroupReason(group) {
  const reason = lower(group?.reason).replace(/\s+/g, " ");
  if (!reason || !Array.isArray(group?.orders) || !group.orders.length) return false;
  return group.orders.some((order) => {
    const label = lower(order?.label).replace(/\s+/g, " ");
    const orderId = lower(order?.orderId).replace(/\s+/g, " ");
    return (label && reason === label) || (orderId && reason === orderId);
  });
}

function ExpenseTicket({ group, onScreenshots, compact = false }) {
  const total = groupAmount(group);
  const rows = [...(Array.isArray(group?.items) ? group.items : [])].sort((a, b) => transactionTime(a) - transactionTime(b));
  const hideReason = shouldHideExpenseGroupReason(group);
  const hasOrders = Array.isArray(group?.orders) && group.orders.length > 0;
  return <article className={`expense-ticket${compact ? " expense-ticket--compact" : ""}`}>
    <div className="expense-ticket__top">
      <div className={`expense-ticket__header-row${hasOrders ? " expense-ticket__header-row--with-order" : ""}`}>
        <div className="expense-ticket__meta"><span className="expense-ticket__date">{formatDate(group.date, group.date || "No date")}</span></div>
        <div className="expense-ticket__header-side">{hasOrders ? <ExpenseOrderActions orders={group.orders}/> : !hideReason ? <div className="expense-ticket__reason">{group.reason}</div> : null}</div>
      </div>
      {hasOrders && !hideReason ? <div className="expense-ticket__reason expense-ticket__reason--block">{group.reason}</div> : null}
      <div className="expense-ticket__header-divider" />
    </div>
    <div className="expense-ticket__legs">{rows.map((item, index) => { const route = routeEndpoints(item); const amount = expenseAmount(item); return <div className="expense-ticket__route" key={text(item?.id) || index}><div className="expense-ticket__route-frame"><div className="expense-ticket__route-shot"><ExpenseShotButton item={item} onScreenshots={onScreenshots}/></div><div className="expense-ticket__route-body"><div className="expense-ticket__route-top"><div className="expense-ticket__route-title">{number(item?.cashIn) > 0 ? "Cash In" : text(item?.fundsType) || "Cash Out"}</div><div className={`expense-ticket__route-amount ${amount.tone}`}>{amount.text}</div></div><div className="expense-ticket__route-sub"><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--from">{route.from}</span><span className="expense-ticket__route-arrow"><ClassicExpenseIcon name="arrow-right" size={16}/></span><span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--to">{route.to}</span></div></div></div></div>; })}</div>
    <div className="expense-ticket__separator" />
    <div className="expense-ticket__footer"><span className="expense-ticket__footer-label">Total</span><span className={`expense-ticket__footer-value ${total.tone}`}>{total.text}</span></div>
  </article>;
}

function AllExpensesSheet({ items, lastSettledAt, onClose, onScreenshots, onExport }) {
  const [showPast, setShowPast] = useState(false);
  const boundary = lastSettledAt ? new Date(lastSettledAt).getTime() : Number.NaN;
  const recentItems = Number.isFinite(boundary) ? items.filter((item) => transactionTime(item) > boundary) : items;
  const pastItems = Number.isFinite(boundary) ? items.filter((item) => transactionTime(item) <= boundary) : [];
  const recentGroups = groupTransactions(recentItems);
  const pastGroups = showPast ? groupTransactions(pastItems) : [];
  return <div className="ios-modal next-ios-modal-open" style={{ display: "flex" }} role="dialog" aria-modal="true" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="ios-sheet" style={{ transform: "translateY(0)" }}><div className="ios-drag"/><h3 className="ex-modal-title" style={{ textAlign: "center" }}>All Expenses</h3><div className="next-all-expenses-sheet-actions"><button className="view-all-chip" type="button" onClick={onExport}>Export</button></div><div id="allExpensesList">
    {recentGroups.length ? recentGroups.map((group) => <ExpenseTicket group={group} onScreenshots={onScreenshots} compact key={group.key}/>) : <div className="expenses-empty">Sorry, No data available</div>}
    {showPast && pastGroups.length ? <><div className="expenses-separator"><span>Past expenses</span></div>{pastGroups.map((group) => <ExpenseTicket group={group} onScreenshots={onScreenshots} compact key={`past-${group.key}`}/>)}</> : null}
    {pastItems.length ? <div className="past-expenses-wrapper"><button type="button" className="past-expenses-btn" onClick={() => setShowPast((current) => !current)}>{showPast ? "Hide past expenses" : "Show past expenses"}</button></div> : null}
  </div><button className="next-all-expenses-close" type="button" onClick={onClose}>Close</button></div></div>;
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

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = search;
    input.placeholder = "Search expenses, funds type, route, order, or receipt…";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.placeholder = "Search";
    };
  }, []);

  const years = useMemo(() => {
    const found = new Set(items.filter((item) => number(item?.cashOut) > 0 && !isSettlement(item)).map((item) => Number(monthKey(item).slice(0, 4))).filter(Number.isFinite));
    found.add(new Date().getFullYear());
    return [...found].sort((a, b) => b - a);
  }, [items]);
  const [selectedYear, setSelectedYear] = useState(years[0] || new Date().getFullYear());
  useEffect(() => {
    if (!years.includes(Number(selectedYear))) setSelectedYear(years[0] || new Date().getFullYear());
  }, [years, selectedYear]);
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
  const lastSettlementReceipt = useMemo(() => latestSettlementReceipt(items, lastSettledAt), [items, lastSettledAt]);
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
      if (filter === "cash-out" && number(item?.cashOut) <= 0 && !(typeKey(item?.fundsType) === "owncar" && number(item?.kilometer) > 0)) return false;
      const orderSearch = (Array.isArray(item?.orders) ? item.orders : []).map((order) => [order?.orderId, order?.orderType, order?.label].join(" ")).join(" ");
      if (query && !lower([displayReason(item), item?.fundsType, item?.from, item?.to, item?.receiptNumber, item?.ordersRaw, orderSearch].join(" ")).includes(query)) return false;
      return true;
    });
  }, [items, filter, search]);
  const maxMonthly = niceChartMax(Math.max(0, ...monthlyTotals));

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
            <div className="total-card__actions"><button className="settle-btn" type="button" onClick={() => setModal("settle")}><ClassicExpenseIcon name="check-circle" size={15}/><span>Settled my account</span></button><div className={`last-settled ${lastSettledDate || lastSettledAt ? "" : "last-settled--empty"}`}><span className="last-settled__label">Last settlement</span><span className="last-settled__date">{formatDate(lastSettledDate || lastSettledAt, "No settlements yet")}</span><span className="last-settled__receipt">{lastSettlementReceipt ? `Receipt #${lastSettlementReceipt}` : ""}</span></div></div>
          </section>

          <section className="expenses-analytics-card expenses-monthly-card" aria-labelledby="monthlyExpenseTitle">
            <div className="expenses-card-head"><div><span className="expenses-eyebrow">Monthly overview</span><h2 id="monthlyExpenseTitle">Expenses by month</h2></div><label className="expenses-year-select" aria-label="Select chart year"><ClassicExpenseIcon name="calendar" size={13}/><select value={selectedYear} onChange={(event) => { const year = Number(event.target.value); setSelectedYear(year); setSelectedMonth(""); }}>{years.map((year) => <option key={year}>{year}</option>)}</select><ClassicExpenseIcon name="chevron-down" size={12}/></label></div>
            <div className="expense-monthly-chart"><div className="expense-chart-shell"><div className="expense-chart-y-axis" aria-hidden="true">{[maxMonthly, maxMonthly * .75, maxMonthly * .5, maxMonthly * .25, 0].map((value, index) => <span key={index}>{compactMoney(value)}</span>)}</div><div className="expense-chart-stage"><div className="expense-chart-grid" aria-hidden="true"><span/><span/><span/><span/><span/></div><div className="expense-month-bars">{monthlyTotals.map((value, index) => { const key = `${selectedYear}-${String(index + 1).padStart(2, "0")}`; const percent = maxMonthly ? value / maxMonthly * 100 : 0; return <button type="button" className={`expense-month-bar ${effectiveSelectedMonth === key ? "is-active " : ""}${value ? "has-data" : "is-empty"}`} onClick={() => setSelectedMonth(key)} key={key}><span className="expense-month-bar__bubble">{compactMoney(value)}</span><span className="expense-month-bar__track"><span className="expense-month-bar__fill" style={{ "--value": percent.toFixed(2) }}/></span><span className="expense-month-bar__label">{MONTHS[index]}</span></button>; })}</div></div></div></div>
          </section>

          <section className="expenses-analytics-card expenses-types-card" aria-labelledby="expenseTypesTitle">
            <div className="expenses-card-head"><div><span className="expenses-eyebrow">Selected month</span><h2 id="expenseTypesTitle">Expense types</h2></div><span className="expenses-selected-month">{selectedMonthLabel(effectiveSelectedMonth)}</span></div>
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
            <div className="expenses-content expenses-content--tickets">{filteredGroups.length ? filteredGroups.map((group) => <ExpenseTicket group={group} onScreenshots={setScreenshotTransaction} compact key={group.key}/>) : <div className="expenses-empty">Sorry, No data available</div>}</div>
          </section>
        </section>
      </div>

      {modal === "cash-in" ? <CashInModal options={cashInFromOptions} onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "cash-out" ? <CashOutModal fundsTypes={fundsTypes} orderOptions={orderOptions} onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "settle" ? <SettleModal onClose={() => setModal("")} onSaved={refresh} notify={notify} /> : null}
      {modal === "export" ? <ExportModal account={account} items={items} onClose={() => setModal("")} notify={notify} /> : null}
      {modal === "all" ? <AllExpensesSheet items={items} lastSettledAt={lastSettledAt} onClose={() => setModal("")} onScreenshots={setScreenshotTransaction} onExport={() => setModal("export")} /> : null}
      {screenshotTransaction ? <ScreenshotModal transaction={screenshotTransaction} onClose={() => setScreenshotTransaction(null)} /> : null}
    </>
  );
}

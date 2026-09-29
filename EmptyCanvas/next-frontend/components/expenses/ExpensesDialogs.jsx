"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CASH_IN_TYPES = ["Cash Payment", "Online Transfer"];
const SCREENSHOT_REQUIRED_KEYS = new Set(["owncar", "swvl", "gobus", "bybus", "train", "indrive", "uber", "uper", "didi"]);
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
async function requestExpenseMutation(action, payload = {}) {
  return await requestJson("/next/api/expenses/mutations-direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
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
      await requestExpenseMutation("cash-in", { ...form, amount: number(form.amount), screenshots: await filesPayload(files) });
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
        await requestExpenseMutation("cash-out", {
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
      await requestExpenseMutation("settle", { ...form, screenshots: await filesPayload(files) });
      notify("Account settlement saved.", "success");
      await onSaved();
      onClose();
    } catch (error) { notify(error?.message || "Failed to settle the account.", "error"); }
    finally { setBusy(false); }
  };
  return (
    <ClassicModal title="Settle my account" onClose={onClose}>
      <ClassicFieldLabel icon="calendar">Date <span className="req-star">*</span></ClassicFieldLabel>
      <input type="date" className="ex-input" value={form.date} onChange={update("date")}/>

      <ClassicFieldLabel icon="tag">Funds Type <span className="req-star">*</span></ClassicFieldLabel>
      <ClassicSelect
        value={form.fundsType}
        onChange={(value) => {
          setForm((current) => ({ ...current, fundsType: value, receiptNumber: value === "Cash Payment" ? current.receiptNumber : "" }));
          if (value !== "Online Transfer") setFiles([]);
        }}
        options={CASH_IN_TYPES.map((value) => ({
          value,
          label: value,
          note: value === "Online Transfer" ? "Screenshot is required for this transfer" : "Receipt number is required for this payment",
          badge: value === "Online Transfer" ? "Required" : "Receipt",
          tone: value === "Online Transfer" ? "orange" : "neutral",
        }))}
        placeholder="Select funds type..."
        ariaLabel="Settlement funds types"
      />

      <ClassicFieldLabel icon="user">Settled by <span className="req-star">*</span></ClassicFieldLabel>
      <input className="ex-input" value={form.settledBy} onChange={update("settledBy")} placeholder="Person name"/>

      {isCash ? <>
        <ClassicFieldLabel icon="hash">Receipt number <span className="req-star">*</span></ClassicFieldLabel>
        <input className="ex-input" value={form.receiptNumber} onChange={update("receiptNumber")} placeholder="Enter receipt number"/>
      </> : null}

      {isTransfer ? <ClassicFileField files={files} onChange={setFiles} required hint="Upload the transfer screenshot (JPG/PNG)."/> : null}

      <div className="ex-modal-actions">
        <button type="button" className="ex-btn ex-primary" onClick={submit} disabled={busy}>{busy ? "Saving..." : "Save settlement"}</button>
        <button type="button" className="ex-btn ex-danger" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </ClassicModal>
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
      const response = await fetch("/next/api/expenses/export-direct", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "current", kind: fileType, userName: `Expenses — ${text(account?.name || account?.username) || "User"}`, userId: text(account?.id || account?.userId), items: selectedItems, dateFrom, dateTo }) });
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
            const fallback = `/next/api/expenses/screenshot-direct?expenseId=${encodeURIComponent(text(transaction?.id))}&index=${index}`;
            const href = shot.url || fallback;
            return <a className="expense-shots-modal__item" href={href} target="_blank" rel="noreferrer" key={`${href}-${index}`}><span className="expense-shots-modal__image-wrap"><img className="expense-shots-modal__image" src={href} alt={shot.name} /></span><span className="expense-shots-modal__caption">{shot.name}</span></a>;
          })}</div> : <div className="expense-shots-modal__empty"><div className="expense-shots-modal__empty-icon"><ClassicExpenseIcon name="image" size={24}/></div><div>No screenshots uploaded for this expense.</div></div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}


export default function ExpensesDialogs({
  modal = "", account, items = [], cashInPeople = [], fundsTypes = [], orderOptions = [],
  screenshotTransaction = null, onClose, onSaved, notify, onCloseScreenshot,
}) {
  return (
    <>
      {modal === "cash-in" ? <CashInModal options={cashInPeople} onClose={onClose} onSaved={onSaved} notify={notify} /> : null}
      {modal === "cash-out" ? <CashOutModal fundsTypes={fundsTypes} orderOptions={orderOptions} onClose={onClose} onSaved={onSaved} notify={notify} /> : null}
      {modal === "settle" ? <SettleModal onClose={onClose} onSaved={onSaved} notify={notify} /> : null}
      {modal === "export" ? <ExportModal account={account} items={items} onClose={onClose} notify={notify} /> : null}
      {screenshotTransaction ? <ScreenshotModal transaction={screenshotTransaction} onClose={onCloseScreenshot} /> : null}
    </>
  );
}

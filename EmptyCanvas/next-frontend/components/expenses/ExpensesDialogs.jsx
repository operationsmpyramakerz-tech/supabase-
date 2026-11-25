"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ClassicOrderIcon from "../orders/ClassicOrderIcon";
import { DEFAULT_OWN_CAR_RATE_EGP_PER_KM, ownCarCostForKilometers } from "../../lib/own-car-expense.mjs";
import { expenseOrderMenuPosition } from "../../lib/expense-order-menu-position.mjs";
import { expenseDestinationMenuPosition } from "../../lib/expense-destination-menu-position.mjs";
import onlineTransferIcon from "../../public/expense-fund-icons/online-transfer.png";
import swvlIcon from "../../public/expense-fund-icons/swvl.png";
import uberIcon from "../../public/expense-fund-icons/uber.png";
import goBusIcon from "../../public/expense-fund-icons/go-bus.png";
import fuelIcon from "../../public/expense-fund-icons/fuel.png";
import taxiIcon from "../../public/expense-fund-icons/taxi.png";
import indriveIcon from "../../public/expense-fund-icons/indrive.png";
import didiIcon from "../../public/expense-fund-icons/didi.png";
import byBusIcon from "../../public/expense-fund-icons/by-bus.png";

const CASH_IN_TYPES = ["Cash Payment", "Online Transfer"];
const SCREENSHOT_REQUIRED_KEYS = new Set(["owncar", "swvl", "gobus", "bybus", "train", "indrive", "uber", "uper", "didi"]);
const OTHER_SCOPE_ID = "__expense_other_reason__";
const OTHER_DESTINATION_ID = "__expense_other_destination__";

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

// Visual assets follow the approved Funds Type mockup. They are local ERP
// images (no third-party requests, no changes to stored funds type values).
// Static imports ensure the icons are bundled by Next, rather than depending
// on a separate /next/expense-fund-icons public-asset proxy route.
const FUNDS_TYPE_ICON_FILES = Object.freeze({
  onlinetransfer: onlineTransferIcon.src,
  swvl: swvlIcon.src,
  uber: uberIcon.src,
  uper: uberIcon.src, // Legacy spelling uses Uber branding.
  gobus: goBusIcon.src,
  fuel: fuelIcon.src,
  taxi: taxiIcon.src,
  indrive: indriveIcon.src,
  didi: didiIcon.src,
  bybus: byBusIcon.src,
});

function FundsCardVisual({ value }) {
  const key = typeKey(value);
  const asset = FUNDS_TYPE_ICON_FILES[key];
  const [failedAsset, setFailedAsset] = useState(null);
  const showAsset = asset && failedAsset !== asset;
  return (
    <span className={`funds-select__card-icon funds-select__card-icon--${showAsset ? "image" : "generic"}`} aria-hidden="true">
      {showAsset ? <img key={asset} src={asset} width="44" height="44" alt="" loading="eager" onError={() => setFailedAsset(asset)}/> : <ClassicExpenseIcon name={fundsTypeIcon(value)} size={22}/>}
    </span>
  );
}

// UI-only classification: never changes the chosen funds type or receipt checks.
function fundsTypeIcon(value) {
  const key = typeKey(value);
  if (key === "owncar" || ["uber", "uper", "indrive", "didi", "taxi"].includes(key)) return "car";
  if (["swvl", "gobus", "bybus", "publictransportation", "bus"].includes(key)) return "bus";
  if (["train", "metro", "tram", "ترام"].includes(key)) return "train";
  if (["توكتوك", "tuktuk", "toktok"].includes(key)) return "car";
  if (["نقل", "transport", "delivery"].includes(key)) return "truck";
  if (["fuel", "petrol", "gasoline", "بنزين"].includes(key)) return "fuel";
  if (key === "cashpayment") return "credit-card";
  if (key === "onlinetransfer") return "bank";
  return "tag";
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
    check: <polyline points="5 12 10 17 19 7"/>,
    "external-link": <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    navigation: <polygon points="3 11 22 2 13 21 11 13 3 11"/>,
    "credit-card": <><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></>,
    car: <><path d="M5 17h14"/><path d="M6 17l1-6h10l1 6"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
    tag: <><path d="M20.6 13.4L11 3H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    "plus-circle": <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    "money-add": <><rect x="2.5" y="4" width="15.5" height="12" rx="2"/><path d="M5.5 7h1M14 13h1"/><circle cx="10.2" cy="10" r="2.7"/><circle cx="18.2" cy="17.4" r="4.2" fill="#111111" stroke="currentColor"/><path d="M18.2 15.4v4M16.2 17.4h4"/></>,
    "money-add-badge": <><rect x="2.5" y="4" width="15.5" height="12" rx="2"/><path d="M5.5 7h1M14 13h1"/><circle cx="10.2" cy="10" r="2.7"/><circle cx="18.2" cy="17.4" r="4.2"/><path d="M18.2 15.4v4M16.2 17.4h4"/></>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    hash: <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></>,
    "edit-3": <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    x: <><path d="M18 6 6 18"/><path d="M6 6 18 18"/></>,
    "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    "log-in": <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></>,
    "minus-circle": <><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    "more-horizontal": <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    truck: <><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    coffee: <><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></>,
    monitor: <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
    bank: <><path d="M3 10h18M5 10v9M10 10v9M14 10v9M19 10v9M2 21h20M12 3 2 8h20z"/></>,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 9h14M5 15h14M9 19v2M15 19v2"/><circle cx="8" cy="16.5" r="0.7" fill="currentColor" stroke="none"/><circle cx="16" cy="16.5" r="0.7" fill="currentColor" stroke="none"/></>,
    train: <><rect x="6" y="2" width="12" height="17" rx="3"/><path d="M6 8h12M6 15h12M8 22l3-3M16 22l-3-3"/></>,
    fuel: <><path d="M4 21V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M3 21h14M7 6h6v5H7zM16 8l3 3v7a2 2 0 0 0 4 0v-7l-2-3"/></>,
    "shopping-cart": <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 6H6"/></>,
    tool: <><path d="M14.7 6.3a4 4 0 0 0-5-5L7 4 4 1 1 4l3 3-2.7 2.7a4 4 0 0 0 5 5L16 5z"/><path d="M12 12l8.5 8.5"/></>,
    package: <><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></>,
  };
  return <svg {...common}>{icons[name] || icons.tag}</svg>;
}

// Reuse the exact wrench path used by Operations Orders, rather than the
// unrelated crossed-tools icon in the legacy Expenses icon set.
function ExpensePickerTypeIcon({ name, size = 18 }) {
  if (name === "tool") {
    return <span className="expense-picker-type-icon" style={{ "--expense-picker-type-size": `${size}px` }}><ClassicOrderIcon name="tool" /></span>;
  }
  return <ClassicExpenseIcon name={name} size={size}/>;
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

function ClassicModal({ title, onClose, children, compact = false, bottomSheet = false, flushBottom = false, badgeIcon = "money-add-badge", badgeTone = "expense" }) {
  const modalContent = <>
    <h3 className="ex-modal-title">{title}</h3>
    {children}
  </>;
  return (
    <div className={`ex-modal${bottomSheet ? " ex-modal--bottom-sheet" : ""}${flushBottom ? " ex-modal--flush-bottom" : ""}`} style={{ display: "flex" }} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`ex-modal-box${compact ? " ex-modal-box--compact" : ""}${bottomSheet ? " ex-modal-box--bottom-sheet" : ""}${flushBottom ? ` ex-modal-box--flush-bottom ex-modal-box--${badgeTone}` : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        {bottomSheet ? <span className="ex-modal-sheet-icon ex-modal-sheet-icon--cash-out" aria-hidden="true"><ClassicExpenseIcon name="arrow-up-right" size={28}/></span> : null}
        {flushBottom ? <span className={`ex-modal-expense-icon ex-modal-expense-icon--${badgeTone}`} aria-hidden="true"><ClassicExpenseIcon name={badgeIcon} size={28}/></span> : null}
        {bottomSheet ? <div className="ex-modal-sheet-scroll">{modalContent}</div> : flushBottom ? <div className="ex-modal-expense-scroll">{modalContent}</div> : modalContent}
      </section>
    </div>
  );
}

function ClassicFieldLabel({ icon, children, compact = false }) {
  return <span className={`field-label${compact ? " field-label--compact" : ""}`}><ClassicExpenseIcon name={icon} size={compact ? 14 : 16}/>{children}</span>;
}

function ClassicSelect({ value, onChange, options = [], placeholder = "Select…", ariaLabel = "Options", compactFundsCards = false, showSelectedVisual = false }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const normalized = useMemo(() => (Array.isArray(options) ? options : []).map((option) => {
    if (typeof option === "string") return { value: option, label: option };
    return { ...option, value: text(option?.value), label: text(option?.label || option?.value) };
  }).filter((option) => option.value), [options]);
  const selected = normalized.find((option) => option.value === text(value)) || null;
  const visibleOptions = useMemo(() => compactFundsCards && text(searchTerm)
    ? normalized.filter((option) => lower(option.label).includes(lower(searchTerm)))
    : normalized, [normalized, compactFundsCards, searchTerm]);

  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const trigger = rootRef.current?.querySelector(".order-select__trigger");
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPad = 12;
      const gap = 6;
      const width = Math.min(rect.width, window.innerWidth - viewportPad * 2);
      const left = Math.min(Math.max(viewportPad, rect.left), window.innerWidth - viewportPad - width);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPad);
      const spaceAbove = Math.max(0, rect.top - gap - viewportPad);
      // Base placement on the actual number of cards, not an empty fixed box.
      const idealHeight = compactFundsCards
        ? Math.min(418, 72 + normalized.length * 61 + Math.max(0, normalized.length - 1) * 6)
        : Math.min(344, normalized.length * 78 + Math.max(0, normalized.length - 1) * 8 + 16);
      const placeAbove = spaceBelow < Math.min(idealHeight, 230) && spaceAbove > spaceBelow;
      const available = placeAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(idealHeight, Math.max(100, available));
      const top = placeAbove
        ? Math.max(viewportPad, rect.top - gap - maxHeight)
        : Math.min(window.innerHeight - viewportPad - maxHeight, rect.bottom + gap);
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
  }, [open, normalized.length, compactFundsCards]);

  const dropdown = open && menuStyle && typeof document !== "undefined" ? createPortal(
    <div ref={menuRef} className={`order-select__dropdown funds-select__menu${compactFundsCards ? " funds-select__menu--compact" : ""}`} style={menuStyle} role="listbox" aria-label={ariaLabel}>
      {compactFundsCards ? <div className="funds-select__search">
        <ClassicExpenseIcon name="search" size={19}/>
        <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search funds type..." aria-label="Search funds type" autoComplete="off"/>
      </div> : null}
      <div className="order-select__options funds-select__cards" style={{ maxHeight: Math.max(80, menuStyle.maxHeight - (compactFundsCards ? 74 : 16)) }}>
        {visibleOptions.length ? visibleOptions.map((option) => {
          const active = option.value === text(value);
          return <button type="button" className={`${compactFundsCards ? "funds-select__card funds-select__card--compact" : "order-select__option funds-select__card"}${active ? " is-selected" : ""}`} role="option" aria-selected={active} key={option.value} onClick={() => { onChange(option.value); setOpen(false); setSearchTerm(""); }}>
            {compactFundsCards ? <FundsCardVisual value={option.value}/> : <span className="funds-select__card-icon" aria-hidden="true"><ClassicExpenseIcon name={fundsTypeIcon(option.value)} size={20}/></span>}
            <span className="funds-select__option-main">
              <span className="order-select__option-id">{option.label}</span>
              {!compactFundsCards && option.note ? <span className="funds-select__option-note">{option.note}</span> : null}
            </span>
            {compactFundsCards ? <span className={`funds-select__radio${active ? " is-selected" : ""}`} aria-hidden="true">{active ? <ClassicExpenseIcon name="check" size={14}/> : null}</span>
              : option.badge ? <span className={`funds-select__badge funds-select__badge--${option.tone || "neutral"}`}>{option.badge}</span> : null}
          </button>;
        }) : <div className="order-select__status">{normalized.length ? "No matching funds types." : "No options available right now."}</div>}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="order-select funds-select" ref={rootRef}>
      <button type="button" className={`order-select__trigger${selected ? " is-selected" : " is-placeholder"}${open ? " is-open" : ""}`} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => { if (open) setSearchTerm(""); setOpen((current) => !current); }}>
        <span className="order-select__trigger-label">
          {selected ? <span className="funds-type-summary">{showSelectedVisual ? <FundsCardVisual value={selected.value}/> : null}<span className="funds-type-summary__name">{selected.label}</span></span> : placeholder}
        </span>
        <ClassicExpenseIcon name="chevron-down" size={18}/>
      </button>
      {dropdown}
    </div>
  );
}

// A dedicated searchable Destination picker. Its portal stays attached to the
// Destination field, rather than using ClassicSelect's offset/height heuristic.
// The search field is intentionally NOT auto-focused (no keyboard on open).
function ExpenseDestinationSelect({ value, onChange, options = [], allowManual = true }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const isOtherDestination = allowManual && value === OTHER_DESTINATION_ID;
  const selected = isOtherDestination
    ? { value: OTHER_DESTINATION_ID, label: "Other destination", note: "Enter manually" }
    : options.find((option) => option.value === value) || null;
  const filtered = useMemo(() => options.filter((option) =>
    [option.label, option.note].some((part) => lower(part).includes(lower(query)))
  ), [options, query]);
  const showOtherOption = allowManual && (!lower(query) ||
    ["other destination", "other", "manual", "أخرى", "اخرى", "وجهة أخرى", "وجهه اخرى"].some((part) => part.includes(lower(query))));

  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const rect = rootRef.current?.querySelector(".expense-destination-picker__trigger")?.getBoundingClientRect();
      if (!rect) return;
      const vv = window.visualViewport;
      setMenuStyle(expenseDestinationMenuPosition(rect, {
        top: vv?.offsetTop ?? 0,
        left: vv?.offsetLeft ?? 0,
        width: vv?.width ?? window.innerWidth,
        height: vv?.height ?? window.innerHeight,
      }, options.length));
    };
    const outside = (event) => {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, options.length]);

  const toggle = () => {
    setMenuStyle(null);
    setQuery("");
    setOpen((current) => !current);
  };
  const choose = (id) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  const menu = open && menuStyle && typeof document !== "undefined" ? createPortal(
    <div ref={menuRef} className="expense-destination-menu" style={menuStyle} role="dialog" aria-label="Select destination user">
      <div className="expense-destination-menu__search">
        <ClassicExpenseIcon name="search" size={18}/>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or department..."
          aria-label="Search destination users"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          data-1p-ignore="true"
          data-lpignore="true"
        />
        <span className="expense-destination-menu__count">{filtered.length} users</span>
      </div>
      <div className="expense-destination-menu__list" role="listbox" aria-label="Destination users">
        {filtered.length ? filtered.map((option) => {
          const active = option.value === value;
          return <button
            type="button"
            key={option.value}
            className={`expense-destination-menu__card${active ? " is-selected" : ""}`}
            role="option"
            aria-selected={active}
            onClick={() => choose(option.value)}
          >
            <span className="expense-destination-menu__person" aria-hidden="true"><ClassicExpenseIcon name="user" size={19}/></span>
            <span className="expense-destination-menu__copy">
              <strong dir="auto">{option.label}</strong>
              {option.note ? <small dir="auto">{option.note}</small> : null}
            </span>
            {active ? <span className="expense-destination-menu__selected" aria-hidden="true">✓</span> : null}
          </button>;
        }) : !showOtherOption ? <div className="expense-destination-menu__empty">No matching users.</div> : null}
        {showOtherOption ? <button
          type="button"
          className={`expense-destination-menu__card expense-destination-menu__card--other${isOtherDestination ? " is-selected" : ""}`}
          role="option"
          aria-selected={isOtherDestination}
          onClick={() => choose(OTHER_DESTINATION_ID)}
        >
          <span className="expense-destination-menu__person" aria-hidden="true"><ClassicExpenseIcon name="edit-3" size={19}/></span>
          <span className="expense-destination-menu__copy">
            <strong>Other destination</strong>
            <small>Write destination manually</small>
          </span>
          {isOtherDestination ? <span className="expense-destination-menu__selected" aria-hidden="true">✓</span> : null}
        </button> : null}
      </div>
    </div>, document.body,
  ) : null;

  return <div className="expense-destination-picker" ref={rootRef}>
    <button
      type="button"
      className={`expense-destination-picker__trigger${open ? " is-open" : ""}${selected ? " is-selected" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={toggle}
    >
      <span className="expense-destination-picker__value">
        {selected ? <><span className="expense-destination-picker__person" aria-hidden="true"><ClassicExpenseIcon name={isOtherDestination ? "edit-3" : "user"} size={17}/></span><span className="expense-destination-picker__name" dir="auto">{selected.label}</span></> : <span className="expense-destination-picker__placeholder">Select destination...</span>}
      </span>
      <ClassicExpenseIcon name="chevron-down" size={18}/>
    </button>
    {menu}
  </div>;
}

// Multi-order picker is intentionally independent from ClassicSelect: the latter is
// used by single-value fields throughout Expenses.
function ExpenseOrderMultiSelect({ value = [], onChange, options = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const selectedIds = Array.isArray(value) ? value : [];
  const isManual = selectedIds.includes(OTHER_SCOPE_ID);
  const selected = options.filter((option) => selectedIds.includes(option.value));
  const filtered = options.filter((option) => [option.label, option.note, option.searchText]
    .some((part) => lower(part).includes(lower(query))));

  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      let rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const visualViewport = window.visualViewport;
      // Always anchor the Orders/Other reason dropdown BELOW its field.
      // The menu itself scrolls inside the available visual viewport height.
      const viewport = {
        top: visualViewport?.offsetTop ?? 0,
        left: visualViewport?.offsetLeft ?? 0,
        width: visualViewport?.width ?? window.innerWidth,
        height: visualViewport?.height ?? window.innerHeight,
      };
      // When Android's keyboard reduces the visible area, bring the trigger
      // higher in its own sheet before measuring the downward menu. Never
      // focus the search automatically (the keyboard stays closed on open).
      if (window.matchMedia("(max-width: 768px)").matches) {
        const below = viewport.top + viewport.height - rect.bottom - 20;
        const sheet = rootRef.current?.closest(".ex-modal-sheet-scroll");
        if (sheet && below < 230) {
          const previousScroll = sheet.scrollTop;
          sheet.scrollTop += 230 - below;
          if (sheet.scrollTop !== previousScroll) rect = rootRef.current.getBoundingClientRect();
        }
      }
      setMenuStyle({ ...expenseOrderMenuPosition(rect, viewport, { preferBelow: true }), zIndex: 100500 });
    };
    const outside = (event) => {
      if (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    // Android keyboard changes the visual viewport without always firing a
    // window resize; recalculate the floating menu while typing.
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = (id) => {
    if (id === OTHER_SCOPE_ID) {
      onChange(selectedIds.includes(OTHER_SCOPE_ID) ? [] : [OTHER_SCOPE_ID]);
      setOpen(false);
      return;
    }
    const existing = selectedIds.filter((entry) => entry !== OTHER_SCOPE_ID);
    onChange(existing.includes(id) ? existing.filter((entry) => entry !== id) : [...existing, id]);
  };

  const dropdown = open && menuStyle && typeof document !== "undefined" ? createPortal(
    <div className="expense-orders-menu" style={menuStyle} ref={menuRef} role="group" aria-label="Select expense orders">
      <div className="expense-orders-menu__search"><ClassicExpenseIcon name="search" size={17}/><input
        type="search"
        name="expense-order-lookup"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search order number or user..."
        aria-label="Search orders"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        data-1p-ignore="true"
        data-lpignore="true"
      /><span className="expense-orders-menu__count">{selectedIds.length} selected</span></div>
      <button type="button" className={`expense-orders-menu__manual${isManual ? " is-selected" : ""}`} aria-pressed={isManual} onClick={() => toggle(OTHER_SCOPE_ID)}>
        <span className="expense-orders-menu__manual-icon" aria-hidden="true"><ClassicExpenseIcon name="edit-3" size={19}/></span>
        <span className="expense-orders-menu__manual-copy"><strong>Other reason</strong><small>Write the reason manually</small></span>
      </button>
      <div className="expense-orders-menu__list">
        {filtered.length ? filtered.map((option) => {
          const active = selectedIds.includes(option.value);
          return <button type="button" key={option.value} role="checkbox" aria-checked={active}
            className={`expense-orders-menu__card${active ? " is-selected" : ""}`} onClick={() => toggle(option.value)}>
            <span className={`expense-orders-menu__icon expense-orders-menu__icon--${option.tone || "default"}`}><ExpensePickerTypeIcon name={option.icon || "shopping-cart"} size={19}/></span>
            <span className="expense-orders-menu__copy"><strong>{option.label}</strong><small dir="auto">{option.note || "—"}</small></span>
            <span className={`expense-orders-menu__check${active ? " is-selected" : ""}`} aria-hidden="true">{active ? "✓" : ""}</span>
          </button>;
        }) : <div className="order-select__status">No matching orders.</div>}
      </div>
    </div>, document.body,
  ) : null;

  return <div className="expense-orders-picker" ref={rootRef}>
    <button type="button" className={`expense-orders-picker__trigger${open ? " is-open" : ""}`} onClick={() => setOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={open}>
      <span className="expense-orders-picker__summary">{isManual ? <strong>Other reason</strong> : selected.length ? <strong>{selected.length} {selected.length === 1 ? "selection" : "selections"}</strong> : <span className="expense-orders-picker__placeholder">Select orders...</span>}</span>
      <ClassicExpenseIcon name="chevron-down" size={18}/>
    </button>
    {selected.length ? <div className="expense-orders-picker__chips" aria-label="Selected orders">{selected.map((option) => <span className="expense-orders-picker__chip" key={option.value}><span className={`expense-orders-picker__chip-icon expense-orders-picker__chip-icon--${option.tone || "products"}`}><ExpensePickerTypeIcon name={option.icon || "shopping-cart"} size={15}/></span><span className="expense-orders-picker__chip-label">{option.label}</span><button type="button" className="expense-orders-picker__chip-remove" onClick={() => onChange(selectedIds.filter((id) => id !== option.value))} aria-label={`Remove ${option.label}`}><ClassicExpenseIcon name="x" size={13}/></button></span>)}</div> : null}
    {dropdown}
  </div>;
}

function ClassicFileField({ files, onChange, required = false, hint = "Upload receipt screenshots (JPG/PNG)." }) {
  const inputRef = useRef(null);
  const [previews, setPreviews] = useState([]);
  useEffect(() => {
    const items = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(items);
    return () => items.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);
  const onSelect = (event) => {
    const added = Array.from(event.target.files || []);
    // Selecting more files adds to the current screenshots instead of deleting them.
    onChange([...files, ...added].filter((file, index, all) =>
      all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index
    ));
    event.target.value = ""; // allow the same file to be re-selected after removal
  };
  return (
    <div className="expense-upload-field">
      <ClassicFieldLabel icon="image">Screenshot <span className={required ? "req-text" : "opt-tag"}>({required ? "Required" : "Optional"})</span></ClassicFieldLabel>
      <div className={`upload-control expense-upload-control${required ? " is-required" : ""}`}>
        <input ref={inputRef} className="upload-input" type="file" accept="image/*" multiple onChange={onSelect}/>
        <button type="button" className="expense-upload-button" onClick={() => inputRef.current?.click()}>
          <span className="expense-upload-button__icon"><ClassicExpenseIcon name="upload" size={22}/></span>
          <span className="expense-upload-button__copy"><strong>{files.length ? "Add more screenshots" : "Upload screenshots"}</strong><small>Choose photos from your device</small></span>
          <span className="expense-upload-button__plus"><ClassicExpenseIcon name="plus-circle" size={21}/></span>
        </button>
        {previews.length ? <div className="expense-upload-previews" aria-label="Selected screenshots">
          {previews.map(({ file, url }, index) => <div className="expense-upload-preview" key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
            <img className="expense-upload-preview__image" src={url} alt={`Preview of ${file.name}`}/>
            <div className="expense-upload-preview__details"><strong title={file.name}>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(2)} MB · Image {index + 1}</span></div>
            <button type="button" className="expense-upload-preview__remove" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))}><ClassicExpenseIcon name="x" size={16}/></button>
          </div>)}
        </div> : null}
      </div>
      <small className={`help${required ? " is-emphasis" : ""}`}>{hint} · Up to 6 images.</small>
    </div>
  );
}

function ExpenseCurrencyInput({ value, onChange, label }) {
  return <div className="expense-currency-field">
    <input type="number" inputMode="decimal" min="0" step="0.01" className="ex-input expense-currency-field__input" value={value} onChange={onChange} aria-label={label}/>
    <span className="expense-currency-field__unit" aria-hidden="true">EGP</span>
  </div>;
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
    <ClassicModal title="Add Cash In" onClose={onClose} flushBottom badgeIcon="arrow-down-left" badgeTone="cash-in">
      <ClassicFieldLabel icon="calendar">Date <span className="req-star">*</span></ClassicFieldLabel>
      <input type="date" className="ex-input" value={form.date} onChange={update("date")}/>

      <ClassicFieldLabel icon="plus-circle">Cash in <span className="req-star">*</span></ClassicFieldLabel>
      <ExpenseCurrencyInput value={form.amount} onChange={update("amount")} label="Amount in EGP"/>

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
        compactFundsCards
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
        <button type="button" className="ex-btn ex-dark" onClick={submit} disabled={busy}>{busy ? "Saving..." : "Submit"}</button>
        <button type="button" className="ex-btn ex-danger" onClick={onClose} disabled={busy}>Close</button>
      </div>
    </ClassicModal>
  );
}

function CashOutModal({ fundsTypes, orderOptions, destinationPeople = [], ownCarRate = DEFAULT_OWN_CAR_RATE_EGP_PER_KM, onClose, onSaved, notify }) {
  const [scopeIds, setScopeIds] = useState([]);
  const [date, setDate] = useState("");
  const [destinationUserId, setDestinationUserId] = useState("");
  const [destinationManualName, setDestinationManualName] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [draftScreenshotId, setDraftScreenshotId] = useState("");
  const draftScreenshot = drafts.find((draft) => draft.id === draftScreenshotId);
  const [form, setForm] = useState({ fundsType: "", from: "", to: "", amount: "", kilometer: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("order");
  const [showOwnCarInfo, setShowOwnCarInfo] = useState(false);
  const isManual = scopeIds.includes(OTHER_SCOPE_ID);
  const isManualDestination = destinationUserId === OTHER_DESTINATION_ID;
  const selectedOrders = (Array.isArray(orderOptions) ? orderOptions : []).filter((item) => scopeIds.includes(text(item?.id)));
  const selectedOrderNames = selectedOrders.map((item) => text(item.orderId));
  const currentOrderLabel = isManual ? "Other reason" : selectedOrderNames.join(", ");
  const isOwnCar = typeKey(form.fundsType) === "owncar";
  const screenshotRequired = SCREENSHOT_REQUIRED_KEYS.has(typeKey(form.fundsType));
  const scopeOptions = useMemo(() => [
    ...(Array.isArray(orderOptions) ? orderOptions : []).map((item) => {
      const kind = typeKey(item?.orderType);
      return {
        value: text(item?.id),
        label: text(item?.orderId) || "Order",
        note: text(item?.createdByName) || "Unknown user",
        searchText: [item?.orderType, item?.label].map(text).join(" "),
        icon: kind.includes("maintenance") ? "tool" : kind.includes("withdraw") ? "log-out" : "shopping-cart",
        tone: kind.includes("maintenance") ? "maintenance" : kind.includes("withdraw") ? "withdrawal" : "products",
      };
    }),
  ], [orderOptions]);
  const fundsTypeOptions = useMemo(() => fundsTypes.map(fundsTypeOption), [fundsTypes]);
  const destinationOptions = useMemo(() => (Array.isArray(destinationPeople) ? destinationPeople : []).map((member) => ({
    value: text(member?.id),
    label: text(member?.name),
    note: text(member?.department),
  })).filter((option) => option.value && option.label), [destinationPeople]);
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const openExpenseStep = () => {
    if (!scopeIds.length || (!selectedOrders.length && !isManual)) return notify("Choose one or more orders or Other reason first.", "error");
    if (isManual && !text(manualReason)) return notify("Write the expense reason.", "error");
    if (!date) return notify("Choose the expense date first.", "error");
    if (isManualDestination) {
      if (!text(destinationManualName)) return notify("Write the destination manually.", "error");
      if (text(destinationManualName).length > 160) return notify("Destination must be 160 characters or fewer.", "error");
    } else if (!destinationUserId || !destinationOptions.some((option) => option.value === destinationUserId)) {
      return notify("Select a destination user or Other destination.", "error");
    }
    setStep("expense");
  };

  const addDraft = async () => {
    if (!date || !form.fundsType) return notify("Date and funds type are required.", "error");
    if (isManualDestination) {
      if (!text(destinationManualName)) return notify("Write the destination manually.", "error");
      if (text(destinationManualName).length > 160) return notify("Destination must be 160 characters or fewer.", "error");
    } else if (!destinationOptions.some((option) => option.value === destinationUserId)) {
      return notify("A valid destination is required.", "error");
    }
    if (!isOwnCar && number(form.amount) <= 0) return notify("Cash out amount is required.", "error");
    if (isOwnCar && (!text(form.kilometer) || number(form.kilometer) <= 0 || ownCarCostForKilometers(form.kilometer, ownCarRate) <= 0)) {
      return notify("Enter a valid distance greater than zero.", "error");
    }
    if (screenshotRequired && !files.length) return notify(isOwnCar ? "A Google Maps screenshot is required for Own car." : "Screenshot is required for this funds type.", "error");
    setBusy(true);
    try {
      const shots = await filesPayload(files);
      setDrafts((current) => [...current, {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...form,
        amount: number(form.amount),
        kilometer: number(form.kilometer),
        reason: isManual ? text(manualReason) : currentOrderLabel,
        selectedOrderIds: isManual ? [] : selectedOrders.flatMap((item) => Array.isArray(item.relationIds) ? item.relationIds : []),
        selectedOrderKeys: isManual ? [] : selectedOrders.map((item) => text(item.id)),
        selectedOrderLabel: currentOrderLabel,
        expenseDate: date,
        destinationUserId,
        destinationManualName: isManualDestination ? text(destinationManualName) : "",
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
          orderId: draft.selectedOrderKeys?.length === 1 ? draft.selectedOrderKeys[0] : "",
          orderIds: draft.selectedOrderIds || [],
          orderKeys: draft.selectedOrderKeys || [],
          orderLabel: draft.selectedOrderLabel,
          orderType: draft.selectedOrderKeys?.length ? "Multiple orders" : "Manual reason",
          orderDisplayId: draft.selectedOrderLabel,
          reason: draft.reason,
          fundsType: draft.fundsType,
          date: draft.expenseDate,
          destinationUserId: draft.destinationUserId,
          destinationManualName: draft.destinationManualName,
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
      <ClassicModal title="Add Expense" onClose={() => setStep("order")} flushBottom>
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
          compactFundsCards
        />

        <ClassicFieldLabel icon="log-out" compact>From <span className="opt-tag">(Optional)</span></ClassicFieldLabel>
        <input className="ex-input ex-input--compact" value={form.from} onChange={update("from")}/>

        <ClassicFieldLabel icon="log-in" compact>To <span className="opt-tag">(Optional)</span></ClassicFieldLabel>
        <input className="ex-input ex-input--compact" value={form.to} onChange={update("to")}/>

        {isOwnCar ? <>
          <ClassicFieldLabel icon="navigation">Kilometers <span className="req-text">(Required)</span></ClassicFieldLabel>
          <input type="number" min="0.01" step="any" className="ex-input" value={form.kilometer} onChange={update("kilometer")}/>
          <p className="expense-own-car-preview" role="status">
            <span>{money(ownCarRate)} / km</span>
            <strong>Calculated cost: {money(ownCarCostForKilometers(form.kilometer, ownCarRate))}</strong>
          </p>
        </> : <>
          <ClassicFieldLabel icon="minus-circle">Cash out <span className="req-text">(Required)</span></ClassicFieldLabel>
          <ExpenseCurrencyInput value={form.amount} onChange={update("amount")} label="Amount in EGP"/>
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

  return (<>
    <ClassicModal title="Cash Out" onClose={onClose} compact bottomSheet>

      <ClassicFieldLabel icon="file-text">Orders <span className="req-star">*</span></ClassicFieldLabel>
      <ExpenseOrderMultiSelect value={scopeIds} onChange={setScopeIds} options={scopeOptions}/>

      {isManual ? <div className="cashout-manual-reason">
        <ClassicFieldLabel icon="edit-3">Reason <span className="req-star">*</span></ClassicFieldLabel>
        <input className="ex-input" value={manualReason} onChange={(event) => setManualReason(event.target.value)} placeholder="Write the reason manually"/>
      </div> : null}

      <ClassicFieldLabel icon="calendar">Date <span className="req-star">*</span></ClassicFieldLabel>
      <input type="date" className="ex-input" value={date} onChange={(event) => setDate(event.target.value)}/>

      <ClassicFieldLabel icon="user">Destination <span className="req-star">*</span></ClassicFieldLabel>
      <ExpenseDestinationSelect
        value={destinationUserId}
        onChange={setDestinationUserId}
        options={destinationOptions}
      />
      {isManualDestination ? <div className="cashout-manual-reason expense-manual-destination">
        <ClassicFieldLabel icon="edit-3">Other destination <span className="req-star">*</span></ClassicFieldLabel>
        <input className="ex-input" type="text" maxLength={160} value={destinationManualName}
          onChange={(event) => setDestinationManualName(event.target.value)}
          placeholder="Write destination manually" aria-label="Other destination name" dir="auto" autoComplete="off"/>
      </div> : null}

      <button type="button" className="ex-btn ex-dark ex-btn--block ex-add-money" onClick={openExpenseStep} disabled={busy}><ClassicExpenseIcon name="money-add" size={23}/><span>Add Expense</span></button>

      {drafts.length ? <div className="expense-drafts">
        <div className="expense-drafts__header"><span className="expense-drafts__title">Added expenses</span><span className="expense-drafts__count">{drafts.length}</span></div>
        <div className="expense-drafts__list">{drafts.map((draft) => {
          const shots = screenshotsFor(draft);
          const cost = typeKey(draft.fundsType) === "owncar" ? ownCarCostForKilometers(draft.kilometer, ownCarRate) : number(draft.amount);
          const typeLabel = text(draft.fundsType) || "Cash Out";
          const from = text(draft.from) || "—";
          const to = text(draft.to) || "—";
          return <div className="expense-ticket__route-frame expense-draft-card--ticket" key={draft.id}>
            <div className="expense-ticket__route-shot">
              <button type="button" className={`expense-ticket__shot-btn${shots.length ? " expense-ticket__shot-btn--has-shots" : ""}`} disabled={busy || !shots.length} onClick={() => setDraftScreenshotId(draft.id)} aria-label={shots.length ? `View ${shots.length} screenshots` : "No screenshots uploaded"}>
                <span className="expense-ticket__shot-btn-icon"><ClassicExpenseIcon name="image" size={18}/></span>
              </button>
            </div>
            <div className="expense-ticket__route-body">
              <div className="expense-ticket__route-top">
                <div className="expense-ticket__route-title" dir="auto" title={typeLabel}>{typeLabel}</div>
                <div className="expense-ticket__route-amount is-negative" dir="ltr">{money(-cost)}</div>
              </div>
              <div className="expense-ticket__route-sub">
                <span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--from" dir="auto" title={from}>{from}</span>
                <span className="expense-ticket__route-arrow" aria-hidden="true"><ClassicExpenseIcon name="arrow-right" size={16}/></span>
                <span className="expense-ticket__route-endpoint expense-ticket__route-endpoint--to" dir="auto" title={to}>{to}</span>
              </div>
            </div>
            <button type="button" className="expense-draft-card__remove" disabled={busy} onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))} aria-label="Remove expense"><ClassicExpenseIcon name="x" size={16}/></button>
          </div>;
        })}</div>
      </div> : null}

      <div className="ex-modal-actions">
        <button type="button" className="ex-btn ex-confirm" onClick={confirm} disabled={busy || !drafts.length}>{busy ? "Saving..." : drafts.length ? `Confirm (${drafts.length})` : "Confirm"}</button>
        <button type="button" className="ex-btn ex-danger" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </ClassicModal>
    {draftScreenshot ? <ScreenshotModal transaction={draftScreenshot} onClose={() => setDraftScreenshotId("")} /> : null}
  </>);
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
    <ClassicModal title="Settle my account" onClose={onClose} flushBottom badgeIcon="check-circle" badgeTone="settlement">
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
        compactFundsCards
      />

      <ClassicFieldLabel icon="user">Settled by <span className="req-star">*</span></ClassicFieldLabel>
      <input className="ex-input" value={form.settledBy} onChange={update("settledBy")} placeholder="Person name"/>

      {isCash ? <>
        <ClassicFieldLabel icon="hash">Receipt number <span className="req-star">*</span></ClassicFieldLabel>
        <input className="ex-input" value={form.receiptNumber} onChange={update("receiptNumber")} placeholder="Enter receipt number"/>
      </> : null}

      {isTransfer ? <ClassicFileField files={files} onChange={setFiles} required hint="Upload the transfer screenshot (JPG/PNG)."/> : null}

      <div className="ex-modal-actions">
        <button type="button" className="ex-btn ex-dark" onClick={submit} disabled={busy}>{busy ? "Saving..." : "Save settlement"}</button>
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
  modal = "", account, items = [], cashInPeople = [], destinationPeople = [], fundsTypes = [], ownCarRate = DEFAULT_OWN_CAR_RATE_EGP_PER_KM, orderOptions = [],
  screenshotTransaction = null, onClose, onSaved, notify, onCloseScreenshot,
}) {
  return (
    <>
      {modal === "cash-in" ? <CashInModal options={cashInPeople} onClose={onClose} onSaved={onSaved} notify={notify} /> : null}
      {modal === "cash-out" ? <CashOutModal fundsTypes={fundsTypes} orderOptions={orderOptions} destinationPeople={destinationPeople} ownCarRate={ownCarRate} onClose={onClose} onSaved={onSaved} notify={notify} /> : null}
      {modal === "settle" ? <SettleModal onClose={onClose} onSaved={onSaved} notify={notify} /> : null}
      {modal === "export" ? <ExportModal account={account} items={items} onClose={onClose} notify={notify} /> : null}
      {screenshotTransaction ? <ScreenshotModal transaction={screenshotTransaction} onClose={onCloseScreenshot} /> : null}
    </>
  );
}

export { ClassicExpenseIcon, ClassicFieldLabel, ClassicSelect, FundsCardVisual, ExpenseDestinationSelect, ExpenseOrderMultiSelect, ClassicFileField, ExpenseCurrencyInput, fundsTypeOption, filesPayload, OTHER_SCOPE_ID, OTHER_DESTINATION_ID, SCREENSHOT_REQUIRED_KEYS };

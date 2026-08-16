"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

const STATUS_TABS = [
  { key: "all", label: "All", icon: "layers" },
  { key: "not-started", label: "Not started", icon: "pause-circle" },
  { key: "in-progress", label: "In progress", icon: "activity" },
  { key: "done", label: "Done", icon: "check-circle" },
];

const MAINTENANCE_STATUS_COLORS = {
  "not-started": { bg: "#F3F4F6", fg: "#374151", bd: "#E5E7EB" },
  "in-progress": { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" },
  done: { bg: "#D1FAE5", fg: "#047857", bd: "#A7F3D0" },
};

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(finite(value));
}

function effectiveQuantity(item) {
  const edited = item?.quantityEditedBySupervisor ?? item?.quantityProgress;
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  return finite(item?.quantityRequested ?? item?.quantity);
}

function itemTotal(item) {
  return Math.abs(effectiveQuantity(item)) * Math.abs(finite(item?.unitPrice ?? item?.unit_price ?? item?.price));
}

function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date.getTime()) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function orderTypeKey(value) {
  return lower(value).replace(/[^a-z0-9]/g, "");
}

function isMaintenanceOrder(value) {
  return orderTypeKey(value) === "requestmaintenance";
}

function statusIndex(value) {
  const status = lower(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received|done|complete)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress|approved)/.test(status)) return 2;
  return 1;
}

function groupKey(item, index) {
  const number = Number(item?.orderIdNumber);
  if (Number.isFinite(number)) return `order:${number}`;
  const direct = text(item?.orderId);
  if (direct && direct !== `ORD-${text(item?.id)}`) return `order:${direct}`;
  const date = text(item?.createdTime).slice(0, 16);
  const owner = lower(item?.createdByName ?? item?.teamMemberId);
  const reason = lower(item?.reason ?? item?.issueDescription);
  const fallback = `${date}|${owner}|${reason}`;
  return fallback.replace(/\|/g, "") ? fallback : `row:${text(item?.id) || index}`;
}

function orderIdLabel(items) {
  const explicit = [...new Set(items.map((item) => text(item?.orderId)).filter(Boolean))];
  if (explicit.length === 1) return explicit[0];
  const numbers = [...new Set(items.map((item) => Number(item?.orderIdNumber)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (numbers.length === 1) return `ORD-${numbers[0]}`;
  if (numbers.length > 1) return `ORD-${numbers[0]} : ORD-${numbers[numbers.length - 1]}`;
  if (explicit.length > 1) return `${explicit[0]} : ${explicit[explicit.length - 1]}`;
  return "Maintenance order";
}

function splitNames(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizeReceiptNumbers(receiptNumbers) {
  const source = Array.isArray(receiptNumbers) ? receiptNumbers : [receiptNumbers];
  const seen = new Set();
  const values = [];
  source.forEach((entry) => {
    String(entry ?? "")
      .replace(/\r\n/g, "\n")
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => {
        if (seen.has(value)) return;
        seen.add(value);
        values.push(value);
      });
  });
  return values;
}

function normalizeSpareEntries(item = {}) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const id = text(entry?.id ?? entry?.productId ?? entry?.sparePartId);
    let name = text(entry?.name ?? entry?.label ?? entry?.component ?? entry?.sparePartName);
    let qty = Number(entry?.qty ?? entry?.quantity ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    qty = Math.max(1, Math.round(qty));
    const qtyMatch = name.match(/(?:\s*[x×]\s*|\s*\(\s*qty\s*:?\s*)(\d+(?:\.\d+)?)\s*\)?\s*$/i);
    if (qtyMatch) {
      const parsed = Number(qtyMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) qty = Math.max(1, Math.round(parsed));
      name = name.slice(0, qtyMatch.index).trim();
    }
    const key = `${id || lower(name)}|${qty}`;
    if ((!id && !name) || seen.has(key)) return;
    seen.add(key);
    entries.push({ id, name, qty });
  };

  if (Array.isArray(item?.sparePartsReplacedEntries)) item.sparePartsReplacedEntries.forEach(add);
  if (!entries.length) {
    const ids = splitNames(item?.sparePartsReplacedIds?.length ? item.sparePartsReplacedIds : item?.sparePartsReplacedId);
    const names = splitNames(item?.sparePartsReplacedNames?.length ? item.sparePartsReplacedNames : item?.sparePartsReplacedName);
    if (ids.length) ids.forEach((id, index) => add({ id, name: names[index] || "" }));
    else names.forEach((name) => add({ name }));
  }
  return entries;
}

function itemHasMaintenanceLog(item = {}) {
  return Boolean(
    text(item?.resolutionMethod) ||
    text(item?.actualIssueDescription) ||
    text(item?.repairAction) ||
    normalizeSpareEntries(item).length
  );
}

function issueText(item = {}) {
  return text(item?.issueDescription ?? item?.reason) || "—";
}

function receiptEntriesFromItem(item = {}) {
  const entries = [];
  const add = (entry = {}, fallbackName = "Signed maintenance report") => {
    const url = text(entry?.url ?? entry?.rawUrl ?? entry?.raw);
    const name = text(entry?.name ?? entry?.filename) || fallbackName;
    if (url) entries.push({ name, url });
  };

  const direct = []
    .concat(Array.isArray(item?.maintenanceReceiptEntries) ? item.maintenanceReceiptEntries : [])
    .concat(Array.isArray(item?.orderReceiptEntries) ? item.orderReceiptEntries : []);
  direct.forEach((entry) => add(entry));

  const urls = []
    .concat(Array.isArray(item?.maintenanceReceiptUrls) ? item.maintenanceReceiptUrls : [item?.maintenanceReceiptUrl])
    .concat(Array.isArray(item?.orderReceiptUrls) ? item.orderReceiptUrls : [item?.orderReceiptUrl]);
  const names = []
    .concat(Array.isArray(item?.maintenanceReceiptNames) ? item.maintenanceReceiptNames : [item?.maintenanceReceiptName])
    .concat(Array.isArray(item?.orderReceiptNames) ? item.orderReceiptNames : [item?.orderReceiptName]);
  urls.filter(Boolean).forEach((url, index) => add({ url, name: names[index] }, `Signed report ${index + 1}`));
  return entries;
}

function maintenanceState(group) {
  if (group.stage >= 4) return { key: "done", label: "Done" };
  if (group.hasLog) return { key: "in-progress", label: "In progress" };
  return { key: "not-started", label: "Not started" };
}

function buildGroups(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])]
    .filter((item) => isMaintenanceOrder(item?.orderType))
    .sort((a, b) => dateValue(b?.createdTime) - dateValue(a?.createdTime));
  const map = new Map();

  sorted.forEach((item, index) => {
    const key = groupKey(item, index);
    if (!map.has(key)) {
      map.set(key, {
        key,
        items: [],
        latestCreated: item?.createdTime,
        createdByName: item?.createdByName,
        createdById: item?.createdById ?? item?.teamMemberId,
        operationsByName: item?.operationsByName,
      });
    }
    const group = map.get(key);
    group.items.push(item);
    if (dateValue(item?.createdTime) > dateValue(group.latestCreated)) group.latestCreated = item?.createdTime;
    if (!group.createdByName && item?.createdByName) group.createdByName = item.createdByName;
    if (!group.createdById && (item?.createdById ?? item?.teamMemberId)) group.createdById = item?.createdById ?? item?.teamMemberId;
    if (!group.operationsByName && item?.operationsByName) group.operationsByName = item.operationsByName;
  });

  return [...map.values()].map((group) => {
    const stage = Math.max(...group.items.map((item) => statusIndex(item?.status)), 1);
    const issues = [...new Set(group.items.map(issueText).filter((value) => value && value !== "—"))];
    const hasLog = group.items.some(itemHasMaintenanceLog);
    const receiptEntries = [];
    const receiptSeen = new Set();
    group.items.flatMap(receiptEntriesFromItem).forEach((entry) => {
      const key = `${entry.url}|${entry.name}`;
      if (!receiptSeen.has(key)) {
        receiptSeen.add(key);
        receiptEntries.push(entry);
      }
    });
    const receiptNumbers = [...new Set(group.items.flatMap((item) => splitNames(item?.receiptNumber)))];
    const spareParts = group.items.flatMap(normalizeSpareEntries);
    const state = maintenanceState({ stage, hasLog });
    return {
      ...group,
      stage,
      hasLog,
      state,
      issues,
      issueSummary: issues.join(" • ") || "—",
      orderIdLabel: orderIdLabel(group.items),
      orderIds: group.items.map((item) => text(item?.id)).filter(Boolean),
      receiptEntries,
      receiptNumbers,
      spareParts,
      total: group.items.reduce((sum, item) => sum + itemTotal(item), 0),
    };
  }).filter((group) => group.stage < 5);
}

function groupSearchText(group) {
  return lower([
    group.orderIdLabel,
    group.issueSummary,
    group.createdByName,
    group.operationsByName,
    ...group.receiptNumbers,
    ...group.items.flatMap((item) => [
      item?.productName,
      item?.issueDescription,
      item?.actualIssueDescription,
      item?.repairAction,
      item?.resolutionMethod,
      item?.sparePartsReplacedName,
      ...(Array.isArray(item?.sparePartsReplacedNames) ? item.sparePartsReplacedNames : []),
    ]),
  ].filter(Boolean).join(" "));
}

async function readJson(response) {
  return response.json().catch(() => null);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "The maintenance action failed.");
  return data;
}

function useClassicHeaderSearch(query, setQuery, placeholder) {
  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    const previousPlaceholder = input.getAttribute("placeholder") || "Search";
    const previousLabel = input.getAttribute("aria-label") || "Search";
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder.replace(/\.{3}$/, ""));
    input.value = query;
    const listener = (event) => setQuery(String(event.target?.value || ""));
    input.addEventListener("input", listener);
    return () => {
      input.removeEventListener("input", listener);
      input.placeholder = previousPlaceholder;
      input.setAttribute("aria-label", previousLabel);
    };
  }, [placeholder, setQuery]);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (input && input.value !== query) input.value = query;
  }, [query]);
}

function safeHttpUrl(value) {
  const url = text(value);
  return /^https?:\/\//i.test(url) ? url : "";
}

function profileFieldValue(profile, aliases) {
  const wanted = new Set((Array.isArray(aliases) ? aliases : [aliases]).map((value) => lower(value).replace(/[^a-z0-9]/g, "")));
  const topLevel = Object.entries(profile || {}).find(([key, value]) => wanted.has(lower(key).replace(/[^a-z0-9]/g, "")) && text(value));
  if (topLevel) return text(topLevel[1]);
  const field = (Array.isArray(profile?.fields) ? profile.fields : []).find((item) => wanted.has(lower(item?.label || item?.name || item?.key).replace(/[^a-z0-9]/g, "")) && text(item?.value));
  return text(field?.value);
}

function CreatorProfilePopover({ state, onClose }) {
  if (!state) return null;
  const profile = state.profile || {};
  const name = profileFieldValue(profile, ["name", "full name", "username"]) || text(state.name) || "Creator";
  const department = profileFieldValue(profile, ["department", "dept"]);
  const position = profileFieldValue(profile, ["position", "job title", "title"]);
  const phone = profileFieldValue(profile, ["phone", "mobile", "phone number"]);
  const email = profileFieldValue(profile, ["email", "email address"]);
  const employeeCode = profileFieldValue(profile, ["employee code", "employee id", "code"]);
  const photoUrl = safeHttpUrl(profile?.photoUrl || profile?.profilePicture || profile?.profile_picture);
  const files = (Array.isArray(profile?.filesMedia) ? profile.filesMedia : Array.isArray(profile?.files_media) ? profile.files_media : []).map((file) => ({
    name: text(file?.name || file?.filename || file?.title) || "File",
    url: safeHttpUrl(file?.url || file?.href),
  }));
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  const subtitle = [position, department].filter(Boolean).join(" • ") || "Team member";
  const details = [["Department", department], ["Position", position], ["Phone", phone], ["Email", email], ["Employee code", employeeCode]].filter(([, value]) => value);

  return (
    <div className="creator-profile-popover is-open next-maintenance-creator-popover" style={{ left: state.left, top: state.top }} aria-hidden="false">
      <div className="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile">
        <button type="button" className="creator-profile-close" onClick={onClose} aria-label="Close"><span className="creator-profile-close-x">×</span></button>
        <div className="creator-profile-head">
          <div className={`creator-profile-avatar ${photoUrl ? "has-image" : ""}`}>{photoUrl ? <img src={photoUrl} alt={name} /> : <span>{initials}</span>}</div>
          <div className="creator-profile-title-wrap"><div className="creator-profile-kicker">Created by</div><div className="creator-profile-name">{name}</div><div className="creator-profile-subtitle">{subtitle}</div></div>
        </div>
        {state.loading ? <div className="creator-profile-state"><span>Loading user details...</span></div> : state.error ? <div className="creator-profile-state creator-profile-state--error"><span>Could not load this user details.</span></div> : <>
          <div className="creator-profile-section-title">Profile details</div>
          {details.length ? <div className="creator-profile-fields next-maintenance-creator-fields">{details.map(([label, value]) => <div className="creator-profile-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> : <div className="creator-profile-empty creator-profile-empty--fields"><span>No profile details available.</span></div>}
          <div className="creator-profile-section-title creator-profile-section-title--files">Files &amp; media</div>
          {files.length ? <div className="creator-profile-files">{files.map((file, index) => file.url ? <a className="creator-profile-file" href={file.url} target="_blank" rel="noopener noreferrer" key={`${file.name}-${index}`}><span className="creator-profile-file-icon"><ClassicOrderIcon name="clipboard" /></span><span className="creator-profile-file-body"><span className="creator-profile-file-name">{file.name}</span></span><span className="creator-profile-file-open"><ClassicOrderIcon name="external-link" /></span></a> : <div className="creator-profile-file creator-profile-file--disabled" key={`${file.name}-${index}`}><span className="creator-profile-file-icon"><ClassicOrderIcon name="clipboard" /></span><span className="creator-profile-file-body"><span className="creator-profile-file-name">{file.name}</span></span></div>)}</div> : <div className="creator-profile-empty"><span>No files or media.</span></div>}
        </>}
      </div>
    </div>
  );
}

function MaintenanceFilter({ value, onChange, count }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", key); };
  }, [open]);

  const options = [
    { value: "all", label: "All Types", sub: `${count} order${count === 1 ? "" : "s"}`, icon: "layers", bg: "#F3F4F6", fg: "#111827", bd: "#E5E7EB" },
    { value: "requestmaintenance", label: "Request Maintenance", sub: `${count} maintenance order${count === 1 ? "" : "s"}`, icon: "tool", bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
  ];

  return (
    <div ref={wrapRef} className={`orders-type-filter ${open ? "is-open" : ""} ${value !== "all" ? "is-filtered" : ""}`}>
      <button type="button" className="orders-type-filter__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((state) => !state)}>
        <span className="orders-type-filter__button-icon"><ClassicOrderIcon name="filter" /></span>
        <span className="orders-type-filter__button-label">Filter</span>
        {value !== "all" ? <span className="orders-type-filter__button-dot" /> : null}
      </button>
      {open ? <div className="orders-type-filter__panel" role="menu" aria-label="Filter maintenance orders by type">
        <div className="orders-type-filter__panel-head"><span className="orders-type-filter__panel-title">Filter by type</span><span className="orders-type-filter__panel-sub">{count} order{count === 1 ? "" : "s"}</span></div>
        <div className="orders-type-filter__options">
          {options.map((option) => <button type="button" className={`orders-type-filter__option ${value === option.value ? "is-active" : ""}`} role="menuitemradio" aria-checked={value === option.value} onClick={() => { onChange(option.value); setOpen(false); }} key={option.value}>
            <span className="orders-type-filter__option-icon" style={{ "--otf-icon-bg": option.bg, "--otf-icon-fg": option.fg, "--otf-icon-border": option.bd }}><ClassicOrderIcon name={option.icon} /></span>
            <span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">{option.label}</span><span className="orders-type-filter__option-sub">{option.sub}</span></span>
            {value === option.value ? <span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span> : null}
          </button>)}
        </div>
      </div> : null}
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportFileName(group) {
  const safe = text(group?.orderIdLabel).replace(/[^a-z0-9_-]+/gi, "-") || "maintenance-order";
  return `${safe}.pdf`;
}

function Progress({ stage }) {
  const icons = ["eye", "activity", "truck", "home"];
  const safeStage = Math.max(1, Math.min(4, Number(stage) || 1));
  return (
    <div className="co-track-pill next-maintenance-track-pill" role="img" aria-label={`Order progress step ${safeStage} of 4`}>
      {icons.map((icon, index) => {
        const step = index + 1;
        return <span className="next-classic-track-fragment" key={icon}><span className={`co-track-step ${step <= safeStage ? "is-active" : ""} ${step === safeStage ? "is-current" : ""}`}><ClassicOrderIcon name={icon} /></span>{step < 4 ? <span className={`co-track-conn ${step < safeStage ? "is-active" : ""}`} /> : null}</span>;
      })}
    </div>
  );
}

function MaintenanceCard({ group, onOpen, onCreator }) {
  const vars = MAINTENANCE_STATUS_COLORS[group.state.key] || MAINTENANCE_STATUS_COLORS["not-started"];
  const thumbStyle = { "--co-thumb-bg": "#FEF3C7", "--co-thumb-fg": "#92400E", "--co-thumb-border": "#FDE68A" };
  return (
    <article className="co-card next-maintenance-order-card" role="button" tabIndex={0} aria-label={`Open ${group.orderIdLabel}`} onClick={() => onOpen(group)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(group); } }}>
      <div className="co-top">
        <div className="co-thumb co-thumb--order-type" style={thumbStyle} title="Request Maintenance"><ClassicOrderIcon name="tool" /></div>
        <div className="co-main"><div className="co-title">{group.orderIdLabel}</div><div className="co-sub">{formatDate(group.latestCreated)}</div></div>
        <div className="co-qty">x{group.items.length}</div>
      </div>
      <div className="co-divider" />
      <div className="co-bottom">
        <div className="co-est next-maintenance-card-note"><div className="co-est-label">Maintenance request</div></div>
        <div className="co-actions">
          <span className="co-status-btn" style={{ "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd }}>{group.state.label}</span>
          <button type="button" className="co-right-ico co-creator-btn next-maintenance-creator-btn" aria-label={`Created by ${group.createdByName || "user"}`} title={`Created by ${group.createdByName || "user"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCreator(event.currentTarget, group); }}><ClassicOrderIcon name="user" /></button>
        </div>
      </div>
    </article>
  );
}

function ReceiptPhotosModal({ group, onClose }) {
  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, onClose]);
  if (!group) return null;
  return (
    <div className="co-submodal-overlay is-open req-receipt-photos-modal" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="co-submodal-dialog req-receipt-photos-dialog" role="dialog" aria-modal="true" aria-label="Receipt photos">
        <button type="button" className="co-submodal-close" onClick={onClose} aria-label="Close receipt photos" />
        <div className="co-submodal-header req-receipt-photos-header"><div className="co-submodal-title">Receipt photos</div><div className="req-receipt-photos-count">{group.receiptEntries.length} photo{group.receiptEntries.length === 1 ? "" : "s"}</div></div>
        <div className="co-submodal-body"><div className="req-receipt-photos-grid">{group.receiptEntries.map((entry, index) => <a className="next-maintenance-receipt-photo" href={entry.url} target="_blank" rel="noopener noreferrer" key={`${entry.url}-${index}`}><img src={entry.url} alt={entry.name || `Receipt ${index + 1}`} /><span>{entry.name || `Receipt ${index + 1}`}</span></a>)}</div></div>
        <div className="co-submodal-actions req-receipt-photos-actions"><button type="button" className="ro-action-btn ro-action-btn--dark" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

function MaintenanceDetailsModal({ group, busy, onClose, onLog, onDone, onExport }) {
  const [photosOpen, setPhotosOpen] = useState(false);
  useEffect(() => {
    if (!group) return undefined;
    document.body.classList.add("co-modal-open");
    setPhotosOpen(false);
    const onKey = (event) => { if (event.key === "Escape" && !photosOpen) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("co-modal-open"); window.removeEventListener("keydown", onKey); };
  }, [group, onClose, photosOpen]);
  if (!group) return null;

  const canLog = group.state.key === "not-started";
  const canDone = group.state.key === "in-progress";
  const canDownload = ["in-progress", "done"].includes(group.state.key);
  const showDoneMeta = group.state.key === "done";

  return (
    <>
      <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="co-modal-dialog next-maintenance-details-dialog" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} maintenance details`}>
          <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />
          <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">Request Maintenance</div></div></div>
          <div className="next-maintenance-order-modal-summary" aria-label="Maintenance order summary">
            <div><span>Order</span><strong>{group.orderIdLabel}</strong></div>
            <div><span>Date</span><strong>{formatDate(group.latestCreated)}</strong></div>
            <div><span>Components</span><strong>{group.items.length}</strong></div>
            <div className="next-maintenance-order-modal-summary__status"><span>Status</span><strong>{group.state.label}</strong></div>
          </div>
          <Progress stage={group.stage} />
          <div className="co-modal-body">
            {showDoneMeta ? <div className="co-modal-meta next-maintenance-done-meta">
              {group.receiptNumbers.length ? <div className="co-meta-row"><span>Store Receipt Number</span><strong>{group.receiptNumbers.join(", ")}</strong></div> : null}
              <div className="co-meta-row"><span>Receipt Photos</span><strong><button type="button" className="co-inline-receipt-photos-btn" disabled={!group.receiptEntries.length} onClick={() => setPhotosOpen(true)}><ClassicOrderIcon name="image" /><span>{group.receiptEntries.length ? (group.receiptEntries.length === 1 ? "View photo" : `View ${group.receiptEntries.length} photos`) : "No photos"}</span></button></strong></div>
            </div> : null}

            <div className="co-modal-actions ro-actions ro-actions--right next-maintenance-modal-actions">
              {canDownload ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onExport(group)} disabled={busy}><ClassicOrderIcon name="download" />Download</button> : null}
              {canLog ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onLog(group)} disabled={busy}><ClassicOrderIcon name="clipboard" />Log Maintenance</button> : null}
              {canDone ? <button type="button" className="ro-action-btn ro-action-btn--dark" onClick={() => onDone(group)} disabled={busy}><ClassicOrderIcon name="check-circle" />Mark as Delivered</button> : null}
            </div>

            <div className="co-modal-items next-maintenance-modal-items">
              {[...group.items].sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true })).map((item, index) => <div className="co-item next-maintenance-modal-item" key={text(item?.id) || index}><div className="co-item-left"><div className="co-item-title"><div className="co-item-name">{text(item?.productName) || "Component"}</div></div></div><div className="co-item-right"><div className="co-item-issue-desc">{issueText(item)}</div></div></div>)}
            </div>
          </div>
        </div>
      </div>
      <ReceiptPhotosModal group={photosOpen ? group : null} onClose={() => setPhotosOpen(false)} />
    </>
  );
}

function ModernSelect({ value, options, placeholder, searchable = false, onChange, disabled = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const selected = options.find((option) => text(option.value) === text(value));
  const selectedLabel = selected?.label || text(value) || placeholder;
  const visible = searchable && query.trim() ? options.filter((option) => lower(option.label).includes(lower(query))) : options;

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", key); };
  }, [open]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  return (
    <div ref={wrapRef} className={`next-maintenance-modern-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}>
      <button type="button" className="next-maintenance-modern-select__trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel || placeholder} disabled={disabled} onClick={() => setOpen((state) => !state)}><span>{selectedLabel}</span><ClassicOrderIcon name="chevron-down" /></button>
      {open ? <div className="next-maintenance-modern-select__menu" role="listbox" aria-label={ariaLabel || placeholder}>
        {searchable ? <div className="next-maintenance-modern-select__search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components" autoFocus /></div> : null}
        <div className="next-maintenance-modern-select__options">
          <button type="button" role="option" aria-selected={!value} className={`next-maintenance-modern-select__option ${!value ? "is-selected" : ""}`} onClick={() => { onChange(""); setOpen(false); }}><span>{placeholder}</span>{!value ? <ClassicOrderIcon name="check" /> : null}</button>
          {visible.map((option) => <button type="button" role="option" aria-selected={text(value) === text(option.value)} className={`next-maintenance-modern-select__option ${text(value) === text(option.value) ? "is-selected" : ""}`} onClick={() => { onChange(option.value); setOpen(false); }} key={`${text(option.value)}-${text(option.label)}`}><span>{option.label}</span>{text(value) === text(option.value) ? <ClassicOrderIcon name="check" /> : null}</button>)}
          {searchable && query.trim() && !visible.length ? <div className="next-maintenance-modern-select__empty">No matching components</div> : null}
        </div>
      </div> : null}
    </div>
  );
}

function emptyLogForItem(item) {
  const existingSpares = normalizeSpareEntries(item);
  return {
    orderId: text(item?.id),
    productName: text(item?.productName) || "Component",
    issueDescription: issueText(item),
    resolutionMethod: text(item?.resolutionMethod),
    actualIssueDescription: text(item?.actualIssueDescription),
    repairAction: text(item?.repairAction),
    spareParts: existingSpares.length ? existingSpares : [{ id: "", name: "", qty: 1 }],
  };
}

function MaintenanceLogModal({ group, options, busy, error, onCancel, onSubmit }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    setLogs(group ? [...group.items].sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true })).map(emptyLogForItem) : []);
  }, [group]);

  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, busy, onCancel]);

  if (!group) return null;
  const resolutionMethods = (Array.isArray(options?.resolutionMethods) ? options.resolutionMethods : []).map((option) => ({ value: text(option?.name ?? option?.value ?? option), label: text(option?.name ?? option?.label ?? option) })).filter((option) => option.value);
  const spareOptions = (Array.isArray(options?.spareParts) ? options.spareParts : []).map((option) => ({ value: text(option?.id ?? option?.value ?? option?.name), label: text(option?.name ?? option?.label ?? option?.value) })).filter((option) => option.value || option.label);

  function patchLog(index, patch) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  function patchSpare(logIndex, spareIndex, patch) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const spareParts = entry.spareParts.map((part, partIndex) => partIndex === spareIndex ? { ...part, ...patch } : part);
      return { ...entry, spareParts };
    }));
  }

  function addSpare(logIndex) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === logIndex ? { ...entry, spareParts: [...entry.spareParts, { id: "", name: "", qty: 1 }] } : entry));
  }

  function removeSpare(logIndex, spareIndex) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const spareParts = entry.spareParts.filter((_, partIndex) => partIndex !== spareIndex);
      return { ...entry, spareParts: spareParts.length ? spareParts : [{ id: "", name: "", qty: 1 }] };
    }));
  }

  function submit(event) {
    event.preventDefault();
    const normalized = logs.map((entry) => {
      const spareParts = entry.spareParts.map((part) => {
        const id = text(part?.id);
        const selected = spareOptions.find((option) => text(option?.value) === id);
        const name = text(selected?.label ?? part?.name);
        const qtyValue = Number(part?.qty);
        const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? Math.max(1, Math.round(qtyValue)) : 1;
        return { id, name, qty };
      }).filter((part) => part.id || part.name);
      return {
        orderId: entry.orderId,
        resolutionMethod: text(entry.resolutionMethod),
        actualIssueDescription: text(entry.actualIssueDescription),
        repairAction: text(entry.repairAction),
        spareParts,
        sparePartIds: spareParts.map((part) => part.id).filter(Boolean),
        sparePartNames: spareParts.map((part) => part.name).filter(Boolean),
      };
    });
    onSubmit(normalized);
  }

  return (
    <div className="co-submodal-overlay is-open next-maintenance-log-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <form className="co-submodal-dialog req-maintenance-log-dialog next-maintenance-log-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <button type="button" className="co-submodal-close" onClick={onCancel} disabled={busy} aria-label="Close" />
        <div className="co-submodal-header next-maintenance-log-header"><div className="req-edit-icon"><ClassicOrderIcon name="clipboard" /></div><div><div className="co-submodal-title">Log Maintenance</div><div className="co-submodal-sub">Save the maintenance work details for this order.</div></div></div>
        <div className="co-submodal-body req-maintenance-log-body">
          <div className="req-maintenance-log-items">
            {logs.map((entry, logIndex) => <section className="req-maintenance-log-card next-maintenance-log-card" key={entry.orderId || logIndex}>
              <div className="req-maintenance-log-card__head"><div><div className="req-maintenance-log-card__label">Component {logIndex + 1}</div><div className="req-maintenance-log-card__title">{entry.productName}</div><div className="req-maintenance-log-card__issue"><span>Issue:</span> {entry.issueDescription}</div></div></div>
              <div className="req-maintenance-log-card__fields">
                <label className="co-submodal-field"><span className="co-submodal-label">Resolution Method</span><ModernSelect value={entry.resolutionMethod} options={resolutionMethods} placeholder="Select resolution method" onChange={(value) => patchLog(logIndex, { resolutionMethod: value })} disabled={busy} ariaLabel={`Resolution method for ${entry.productName}`} /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">The Actual Issue Description</span><textarea className="co-submodal-textarea" value={entry.actualIssueDescription} onChange={(event) => patchLog(logIndex, { actualIssueDescription: event.target.value })} disabled={busy} rows={4} placeholder="Write the actual issue description" /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">Repair Action</span><textarea className="co-submodal-textarea" value={entry.repairAction} onChange={(event) => patchLog(logIndex, { repairAction: event.target.value })} disabled={busy} rows={4} placeholder="Write the repair action" /></label>
                <div className="co-submodal-field req-maintenance-log-card__spares">
                  <div className="req-maintenance-spare-head"><span className="co-submodal-label">Spare parts replaced</span></div>
                  <div className="req-maintenance-spare-list">{entry.spareParts.map((part, spareIndex) => <div className="req-maintenance-spare-row next-maintenance-spare-row" key={`${logIndex}-${spareIndex}`}>
                    <div className="co-submodal-field req-maintenance-spare-row__part"><span className="co-submodal-label">Spare part</span><ModernSelect value={part.id || part.name} options={spareOptions} placeholder="Select component" searchable onChange={(value) => { const selected = spareOptions.find((option) => option.value === value); patchSpare(logIndex, spareIndex, { id: selected ? value : "", name: selected?.label || value }); }} disabled={busy} ariaLabel={`Spare part ${spareIndex + 1} for ${entry.productName}`} /></div>
                    <label className="co-submodal-field req-maintenance-spare-row__qty"><span className="co-submodal-label">Qty</span><input className="co-submodal-input" type="number" min="1" step="1" inputMode="numeric" value={part.qty} onChange={(event) => patchSpare(logIndex, spareIndex, { qty: event.target.value })} disabled={busy} /></label>
                    <button type="button" className="req-maintenance-spare-row__remove" onClick={() => removeSpare(logIndex, spareIndex)} disabled={busy || entry.spareParts.length <= 1} aria-label="Remove spare part"><span aria-hidden="true">×</span></button>
                  </div>)}</div>
                  <button type="button" className="req-maintenance-spare-add req-maintenance-spare-add--full" onClick={() => addSpare(logIndex)} disabled={busy}><span className="req-maintenance-spare-add__icon">+</span><span>Add spare part</span></button>
                </div>
              </div>
            </section>)}
          </div>
          <div className="co-submodal-error" role="alert" aria-live="polite">{error}</div>
        </div>
        <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy}>{busy ? "Saving…" : "Confirm"}</button></div>
      </form>
    </div>
  );
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name || "image"}.`)); };
    image.src = url;
  });
}

async function fileToOptimizedDataUrl(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Signed reports must be image files.");
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const maxSide = 1600;
  let scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  let quality = 0.78;
  let dataUrl = "";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= 900_000) break;
    scale *= 0.86;
    quality = Math.max(0.58, quality - 0.05);
  }

  return dataUrl;
}

function MarkDoneModal({ group, busy, error, onCancel, onSubmit }) {
  const [files, setFiles] = useState([]);
  const [receiptNumbers, setReceiptNumbers] = useState([""]);
  const inputRef = useRef(null);
  const requiresReceiptNumbers = Boolean(group?.spareParts?.length);

  useEffect(() => {
    setFiles([]);
    setReceiptNumbers([""]);
  }, [group?.key]);

  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, busy, onCancel]);

  if (!group) return null;

  function submit(event) {
    event.preventDefault();
    onSubmit({ files, receiptNumbers });
  }

  function patchReceipt(index, value) {
    setReceiptNumbers((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
  }

  function removeReceipt(index) {
    setReceiptNumbers((current) => {
      const next = current.filter((_, entryIndex) => entryIndex !== index);
      return next.length ? next : [""];
    });
  }

  return (
    <div className="co-submodal-overlay is-open next-maintenance-receipt-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <form className="co-submodal-dialog next-maintenance-receipt-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <button type="button" className="co-submodal-close" onClick={onCancel} disabled={busy} aria-label="Close" />
        <div className="co-submodal-header"><div><div className="co-submodal-title">Upload Signed Maintenance Report</div><div className="co-submodal-sub">Please upload the maintenance report after it has been signed.</div></div></div>
        <div className="co-submodal-body">
          {requiresReceiptNumbers ? <div className="co-submodal-field next-maintenance-receipt-numbers"><span className="co-submodal-label">Store Receipt Number</span><div className="co-submodal-inputs next-maintenance-receipt-inputs">{receiptNumbers.map((value, index) => <div className="next-maintenance-receipt-input-row" key={index}><input className="co-submodal-input req-delivery-receipt-input" value={value} onChange={(event) => patchReceipt(index, event.target.value)} placeholder={index === 0 ? "e.g. 12345, 67890" : "Other receipt number"} disabled={busy} inputMode="numeric" aria-label={`Store Receipt Number ${index + 1}`} />{index > 0 ? <button type="button" className="next-maintenance-receipt-input-remove" onClick={() => removeReceipt(index)} disabled={busy} aria-label={`Remove Store Receipt Number ${index + 1}`}>×</button> : null}</div>)}</div><button type="button" className="ro-action-btn ro-action-btn--light co-submodal-add" onClick={() => setReceiptNumbers((current) => [...current, ""])} disabled={busy}>Add Other Receipt</button></div> : null}
          <div className="co-submodal-field"><span className="co-submodal-label">Signed maintenance report images</span><input ref={inputRef} className="co-upload-field__input" type="file" accept="image/*" multiple hidden onChange={(event) => setFiles(Array.from(event.target.files || []))} disabled={busy} /><button type="button" className="co-upload-field next-maintenance-upload-field" onClick={() => inputRef.current?.click()} disabled={busy}><span className="co-upload-field__icon"><ClassicOrderIcon name="upload-cloud" /></span><span className="co-upload-field__content"><span className="co-upload-field__title">{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Choose images"}</span><span className="co-upload-field__meta">{files.length ? files.map((file) => file.name).join(" • ") : "PNG, JPG or WEBP"}</span></span></button></div>
          <div className="co-submodal-error" role="alert" aria-live="polite">{error}</div>
        </div>
        <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy || !files.length}>{busy ? "Uploading…" : "Confirm"}</button></div>
      </form>
    </div>
  );
}

export default function MaintenanceOrdersClient({ initialOrders = [], initialOptions = {}, bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [options, setOptions] = useState(initialOptions && typeof initialOptions === "object" ? initialOptions : {});
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [logGroup, setLogGroup] = useState(null);
  const [doneGroup, setDoneGroup] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [creatorState, setCreatorState] = useState(null);
  const creatorProfileCache = useRef(new Map());

  useClassicHeaderSearch(query, setQuery, "Search by issue, product, or user...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (STATUS_TABS.some((item) => item.key === requestedTab)) setTab(requestedTab);
    if (["all", "requestmaintenance"].includes(params.get("type"))) setType(params.get("type"));
    if (params.get("q")) setQuery(params.get("q"));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "all") params.delete("tab"); else params.set("tab", tab);
    if (type === "all") params.delete("type"); else params.set("type", type);
    if (!query.trim()) params.delete("q"); else params.set("q", query.trim());
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [tab, type, query]);

  useEffect(() => {
    const close = (event) => {
      if (!creatorState) return;
      if (event.target.closest?.(".creator-profile-popover") || event.target.closest?.(".co-creator-btn")) return;
      setCreatorState(null);
    };
    const key = (event) => { if (event.key === "Escape") setCreatorState(null); };
    const reposition = () => setCreatorState(null);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [creatorState]);

  const groups = useMemo(() => buildGroups(orders), [orders]);
  const visibleGroups = useMemo(() => {
    const needle = lower(query);
    return groups.filter((group) => {
      if (tab !== "all" && group.state.key !== tab) return false;
      if (type !== "all" && type !== "requestmaintenance") return false;
      return !needle || groupSearchText(group).includes(needle);
    });
  }, [groups, tab, type, query]);

  async function refreshOrders() {
    const response = await fetch("/api/orders/requested?scope=all-system&_fresh=1", { credentials: "include", cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login?next=/next/maintenance-orders";
      return;
    }
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || "Failed to refresh Maintenance Orders.");
    setOrders(Array.isArray(data) ? data : []);
  }

  async function ensureOptions() {
    if (Array.isArray(options?.resolutionMethods) && Array.isArray(options?.spareParts)) return options;
    const response = await fetch("/api/orders/requested/maintenance-form-options", { credentials: "include", cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || "Failed to load maintenance form options.");
    setOptions(data || {});
    return data || {};
  }

  async function openLog(group) {
    setActionError("");
    try {
      await ensureOptions();
      setLogGroup(group);
    } catch (error) {
      setNotice(error?.message || "Failed to load maintenance form options.");
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  async function saveLog(perItemLogs) {
    const logsWithDetails = perItemLogs.filter((entry) => text(entry?.resolutionMethod) || text(entry?.actualIssueDescription) || text(entry?.repairAction) || (Array.isArray(entry?.spareParts) && entry.spareParts.length));
    if (!logsWithDetails.length) {
      setActionError("Please fill maintenance details for at least one component. Spare parts are optional.");
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      await postJson("/api/orders/requested/log-maintenance", {
        orderIds: logGroup.orderIds,
        perItemLogs: logsWithDetails,
        moveToArrived: false,
        moveToShipping: false,
      });
      await refreshOrders();
      setLogGroup(null);
      setSelected(null);
      setTab("in-progress");
      setNotice("Maintenance log saved.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (error) {
      setActionError(error?.message || "Failed to save maintenance log.");
    } finally {
      setBusy(false);
    }
  }

  async function markDone(payload) {
    if (!payload?.files?.length) {
      setActionError("Please upload at least one signed report image.");
      return;
    }
    const receiptNumbers = normalizeReceiptNumbers(payload?.receiptNumbers);
    if (doneGroup?.spareParts?.length && !receiptNumbers.length) {
      setActionError("Store receipt number is required.");
      return;
    }
    if (receiptNumbers.some((value) => !/^\d+$/.test(value))) {
      setActionError("Please enter valid store receipt numbers.");
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      const dataUrls = [];
      for (const file of payload.files) dataUrls.push(await fileToOptimizedDataUrl(file));
      await postJson("/api/orders/requested/mark-arrived", {
        orderIds: doneGroup.orderIds,
        orderReceiptDataUrls: dataUrls,
        orderReceiptFilenames: payload.files.map((file, index) => text(file?.name) || `maintenance-report-${index + 1}.jpg`),
        receiptNumbers,
      });
      await refreshOrders();
      setDoneGroup(null);
      setSelected(null);
      setTab("done");
      setNotice("Marked as delivered.");
      window.setTimeout(() => setNotice(""), 4500);
    } catch (error) {
      setActionError(error?.message || "Failed to mark as delivered.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOrder(group) {
    setBusy(true);
    try {
      const response = await fetch("/api/orders/requested/export/maintenance-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: group.orderIds, tab: group.state.key }),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/maintenance-orders";
        return;
      }
      if (!response.ok) {
        const data = await readJson(response);
        throw new Error(data?.error || "Failed to download maintenance PDF.");
      }
      const blob = await response.blob();
      downloadBlob(blob, reportFileName(group));
      setNotice("Maintenance PDF downloaded.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (error) {
      setNotice(error?.message || "Download failed.");
      window.setTimeout(() => setNotice(""), 4500);
    } finally {
      setBusy(false);
    }
  }

  async function openCreatorProfile(anchor, group) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(330, window.innerWidth - 28);
    const estimatedHeight = Math.min(500, Math.max(240, window.innerHeight - 28));
    const left = Math.min(Math.max(14, rect.right - width), Math.max(14, window.innerWidth - width - 14));
    const below = rect.bottom + 10;
    const above = rect.top - estimatedHeight - 10;
    const top = below + estimatedHeight <= window.innerHeight - 14 ? below : Math.max(14, above);
    const base = { left, top, name: group.createdByName || "Creator", loading: true, profile: null, error: false };
    setCreatorState(base);
    const key = text(group.createdById || group.createdByName);
    if (!key) { setCreatorState({ ...base, loading: false, error: true }); return; }
    if (creatorProfileCache.current.has(key)) {
      setCreatorState({ ...base, loading: false, profile: creatorProfileCache.current.get(key), error: false });
      return;
    }
    try {
      const response = await fetch(`/api/team-members/${encodeURIComponent(key)}/public`, { credentials: "include", cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to load user profile.");
      creatorProfileCache.current.set(key, data);
      setCreatorState({ ...base, loading: false, profile: data, error: false });
    } catch {
      setCreatorState({ ...base, loading: false, error: true });
    }
  }

  return (
    <section className="next-classic-orders-parity next-classic-maintenance-parity">
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders/maintenance-orders?classic=1">Classic page</a></div> : null}
      {notice ? <div className="orders-parity-success" role="status"><ClassicOrderIcon name="check-circle" />{notice}</div> : null}

      <div className="next-maintenance-orders-toolbar-wrap">
        <div className="orders-toolbar" aria-label="Maintenance orders tools">
          <div className="orders-toolbar__scroll"><div className="portfolio-tabs portfolio-tabs--iconic" role="tablist" aria-label="Maintenance Orders status">{STATUS_TABS.map((item) => <button type="button" className={`tab-portfolio order-status-tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}><span className="order-status-tab__icon"><ClassicOrderIcon name={item.icon} /></span><span className="order-status-tab__label">{item.label}</span></button>)}</div></div>
          <div className="orders-toolbar__divider" aria-hidden="true" />
          <MaintenanceFilter value={type} onChange={setType} count={groups.length} />
        </div>
      </div>

      <section className="next-maintenance-orders-list-surface">
        <div className="co-cards" id="requested-list">{visibleGroups.length ? visibleGroups.map((group) => <MaintenanceCard group={group} onOpen={setSelected} onCreator={openCreatorProfile} key={group.key} />) : <div className="ops-no-data-state" role="status" aria-live="polite"><img className="ops-no-data-state__image" src="/images/no-data-illustration.png" alt="" loading="lazy" /><div className="ops-no-data-state__text">Sorry, No data available</div></div>}</div>
      </section>

      <MaintenanceDetailsModal group={selected} busy={busy} onClose={() => setSelected(null)} onLog={openLog} onDone={(group) => { setActionError(""); setDoneGroup(group); }} onExport={exportOrder} />
      <MaintenanceLogModal group={logGroup} options={options} busy={busy} error={actionError} onCancel={() => { setLogGroup(null); setActionError(""); }} onSubmit={saveLog} />
      <MarkDoneModal group={doneGroup} busy={busy} error={actionError} onCancel={() => { setDoneGroup(null); setActionError(""); }} onSubmit={markDone} />
      <CreatorProfilePopover state={creatorState} onClose={() => setCreatorState(null)} />
    </section>
  );
}

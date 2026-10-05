"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { loadTeamMemberPublicProfile } from "../../lib/team-member-public-client";

const MaintenanceDetailsModal = dynamic(() => import("./MaintenanceHeavyModals").then((module) => module.MaintenanceDetailsModal), { ssr: false });
const MaintenanceDownloadModal = dynamic(() => import("./MaintenanceHeavyModals").then((module) => module.MaintenanceDownloadModal), { ssr: false });
const MaintenanceLogModal = dynamic(() => import("./MaintenanceHeavyModals").then((module) => module.MaintenanceLogModal), { ssr: false });
const MarkDoneModal = dynamic(() => import("./MaintenanceHeavyModals").then((module) => module.MarkDoneModal), { ssr: false });
const MaintenanceActionPasswordModal = dynamic(() => import("./MaintenanceHeavyModals").then((module) => module.MaintenanceActionPasswordModal), { ssr: false });
const MaintenanceDeleteConfirmationModal = dynamic(() => import("./MaintenanceHeavyModals").then((module) => module.MaintenanceDeleteConfirmationModal), { ssr: false });

// Direct Next route handlers include the configured /next basePath.
const DIRECT_API_BASE = "/next/api";

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

const MAINTENANCE_ACTIONS = {
  edit: {
    title: "Edit maintenance log",
    description: "Enter the Maintenance Orders admin password to edit the saved maintenance details.",
    button: "Continue",
    endpoint: `${DIRECT_API_BASE}/orders/maintenance/mutations-direct`,
    icon: "edit-2",
  },
  archive: {
    title: "Archive maintenance order",
    description: "Enter the Maintenance Orders admin password to move this order to Archive.",
    button: "Archive",
    endpoint: `${DIRECT_API_BASE}/orders/maintenance/mutations-direct`,
    icon: "archive",
  },
  delete: {
    title: "Delete maintenance order",
    description: "Enter the Maintenance Orders admin password to permanently delete this order.",
    button: "Delete",
    endpoint: `${DIRECT_API_BASE}/orders/maintenance/mutations-direct`,
    icon: "trash-2",
    danger: true,
  },
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

function normalizeMaintenanceSpareEntry(entry = {}) {
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
  const unitPrice = Number(entry?.unitPrice ?? entry?.unit ?? 0);
  const total = Number(entry?.total ?? entry?.totalCost);
  return {
    id,
    name,
    qty,
    idCode: text(entry?.idCode ?? entry?.displayId),
    displayId: text(entry?.displayId ?? entry?.idCode),
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    total: Number.isFinite(total) ? total : (Number.isFinite(unitPrice) ? unitPrice * qty : 0),
    url: text(entry?.url ?? entry?.link),
  };
}

function normalizeSpareEntries(item = {}) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const normalized = normalizeMaintenanceSpareEntry(entry);
    const key = `${normalized.id || lower(normalized.name)}|${normalized.qty}`;
    if ((!normalized.id && !normalized.name) || seen.has(key)) return;
    seen.add(key);
    entries.push(normalized);
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

function normalizeNeededSpareEntries(item = {}) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const normalized = normalizeMaintenanceSpareEntry(entry);
    const key = `${normalized.id || lower(normalized.name)}|${normalized.qty}`;
    if ((!normalized.id && !normalized.name) || seen.has(key)) return;
    seen.add(key);
    entries.push(normalized);
  };
  if (Array.isArray(item?.sparePartsNeededEntries)) item.sparePartsNeededEntries.forEach(add);
  if (!entries.length) {
    const ids = splitNames(item?.sparePartsNeededIds?.length ? item.sparePartsNeededIds : item?.sparePartsNeededId);
    const names = splitNames(item?.sparePartsNeededNames?.length ? item.sparePartsNeededNames : item?.sparePartsNeededName);
    if (ids.length) ids.forEach((id, index) => add({ id, name: names[index] || "" }));
    else names.forEach((name) => add({ name }));
  }
  return entries;
}

function normalizeMaintenanceChecklist(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  source.forEach((entry) => {
    const item = text(entry?.text ?? entry?.value ?? entry);
    if (!item) return;
    const key = lower(item);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function itemHasMaintenanceLog(item = {}) {
  if (item?.maintenanceLogged === true) return true;
  return Boolean(
    text(item?.serialNumber) ||
    text(item?.resolutionMethod) ||
    text(item?.actualIssueDescription) ||
    text(item?.repairAction) ||
    normalizeSpareEntries(item).length ||
    normalizeNeededSpareEntries(item).length ||
    normalizeMaintenanceChecklist(item?.maintenanceChecklist).length
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
    const logHistory = group.items.flatMap((item) => Array.isArray(item?.maintenanceLogs) ? item.maintenanceLogs : []);
    const latestLog = logHistory
      .filter((entry) => entry?.loggedAt)
      .sort((a, b) => dateValue(b?.loggedAt) - dateValue(a?.loggedAt))[0] || logHistory[logHistory.length - 1] || null;
    const maxLogCount = Math.max(0, ...group.items.map((item) => Array.isArray(item?.maintenanceLogs) ? item.maintenanceLogs.length : (itemHasMaintenanceLog(item) ? 1 : 0)));
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
      logHistory,
      latestLog,
      maxLogCount,
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
      item?.serialNumber,
      item?.actualIssueDescription,
      item?.repairAction,
      item?.resolutionMethod,
      item?.sparePartsReplacedName,
      ...(Array.isArray(item?.sparePartsReplacedNames) ? item.sparePartsReplacedNames : []),
      item?.sparePartsNeededName,
      ...(Array.isArray(item?.sparePartsNeededNames) ? item.sparePartsNeededNames : []),
      ...normalizeMaintenanceChecklist(item?.maintenanceChecklist),
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

function templateReportFileName(group) {
  const safe = text(group?.orderIdLabel).replace(/[^a-z0-9_-]+/gi, "-") || "maintenance-order";
  return `maintenance-template-${safe}.pdf`;
}

function MaintenanceCard({ group, onOpen, onCreator }) {
  const vars = MAINTENANCE_STATUS_COLORS[group.state.key] || MAINTENANCE_STATUS_COLORS["not-started"];
  const thumbStyle = { "--co-thumb-bg": "#FEF3C7", "--co-thumb-fg": "#92400E", "--co-thumb-border": "#FDE68A" };
  return (
    <article className="co-card next-maintenance-order-card" role="button" tabIndex={0} aria-label={`Open ${group.orderIdLabel}`} onClick={() => onOpen(group)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(group); } }}>
      <div className="co-top">
        <div className="co-thumb co-thumb--order-type" style={thumbStyle} title="Request Maintenance" aria-label="Request Maintenance"><ClassicOrderIcon name="tool" /></div>
        <div className="co-main">
          <div className="co-title">{group.orderIdLabel}</div>
          <div className="next-maintenance-order-meta"><span className="co-sub">{formatDate(group.latestCreated)}</span></div>
        </div>
        <div className="next-maintenance-card-head-actions">
          <div className="next-maintenance-card-status">
            <span className="co-status-btn" style={{ "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd }}>{group.state.label}</span>
          </div>
          <button type="button" className="co-creator-btn next-maintenance-creator-btn" aria-label={`Created by ${group.createdByName || "user"}`} title={`Created by ${group.createdByName || "user"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCreator(event.currentTarget, group); }}>
            <span className="next-maintenance-creator-label">{group.createdByName || "—"}</span>
            <span className="next-maintenance-creator-icon"><ClassicOrderIcon name="user" /></span>
          </button>
        </div>
      </div>
    </article>
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


export default function MaintenanceOrdersClient({ initialOrders = [], initialOptions = {}, initialPageInfo = null, bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [pageInfo, setPageInfo] = useState(initialPageInfo || { hasMore: false, nextCursor: null, limit: 36 });
  const [listLoading, setListLoading] = useState(false);
  const [options, setOptions] = useState(initialOptions && typeof initialOptions === "object" ? initialOptions : {});
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [logGroup, setLogGroup] = useState(null);
  const [logMode, setLogMode] = useState("create");
  const [doneGroup, setDoneGroup] = useState(null);
  const [downloadState, setDownloadState] = useState(null);
  const [actionState, setActionState] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [creatorState, setCreatorState] = useState(null);
  const creatorProfileCache = useRef(new Map());
  const orderDetailsCache = useRef(new Map());
  const listRequestRef = useRef(0);
  const listAbortRef = useRef(null);
  const initialFilterKeyRef = useRef("all|all|");

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
    const key = `${tab}|${type}|${query.trim()}`;
    if (key === initialFilterKeyRef.current) return undefined;
    initialFilterKeyRef.current = key;
    const timer = window.setTimeout(() => {
      fetchOrdersPage({ reset: true }).catch((error) => {
        setNotice(error?.message || "Failed to load Maintenance Orders.");
        window.setTimeout(() => setNotice(""), 4000);
      });
    }, query.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
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
    const serverFilteredQuery = Boolean(needle)
      && pageInfo?.serverFiltered === true
      && lower(pageInfo?.query) === needle;
    return groups.filter((group) => {
      if (tab !== "all" && group.state.key !== tab) return false;
      if (type !== "all" && type !== "requestmaintenance") return false;
      return !needle || serverFilteredQuery || groupSearchText(group).includes(needle);
    });
  }, [groups, tab, type, query, pageInfo]);

  async function fetchOrdersPage({ reset = true, fresh = false } = {}) {
    const requestId = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        mode: "summary",
        paged: "1",
        tab,
        filterType: type,
        limit: String(pageInfo?.limit || 36),
      });
      if (query.trim()) params.set("q", query.trim());
      if (!reset && pageInfo?.nextCursor !== null && pageInfo?.nextCursor !== undefined) params.set("cursor", String(pageInfo.nextCursor));
      if (fresh) params.set("_fresh", "1");

      const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance/paged-summary?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/maintenance-orders";
        return;
      }
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to load Maintenance Orders.");
      if (requestId !== listRequestRef.current) return;

      const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      const nextPageInfo = !Array.isArray(data) && data?.pageInfo
        ? data.pageInfo
        : { hasMore: false, nextCursor: null, limit: pageInfo?.limit || 36 };

      setOrders((current) => {
        if (reset) return items;
        const map = new Map((Array.isArray(current) ? current : []).map((item) => [text(item?.id), item]));
        items.forEach((item) => map.set(text(item?.id), item));
        return [...map.values()];
      });
      setPageInfo(nextPageInfo);
      if (reset) {
        orderDetailsCache.current.clear();
        setSelected(null);
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      throw error;
    } finally {
      if (listAbortRef.current === controller) listAbortRef.current = null;
      if (requestId === listRequestRef.current) setListLoading(false);
    }
  }

  async function refreshOrders() {
    return fetchOrdersPage({ reset: true, fresh: true });
  }

  async function openOrderDetails(group) {
    if (!group) return;
    const needsDetails = (Array.isArray(group.items) ? group.items : []).some((item) => Boolean(item?.summaryOnly));
    if (!needsDetails) {
      setSelected(group);
      return;
    }

    const cacheKey = text(group.key || group.orderIdLabel || group.orderIds?.join("|"));
    const cached = cacheKey ? orderDetailsCache.current.get(cacheKey) : null;
    if (cached) {
      setSelected(cached);
      return;
    }

    try {
      const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance/details-direct`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds }),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/maintenance-orders";
        return;
      }
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to load maintenance order details.");
      const detailedGroups = buildGroups(Array.isArray(data) ? data : []);
      const detailed = detailedGroups.find((item) => item.key === group.key) || detailedGroups[0];
      if (!detailed) throw new Error("This maintenance order no longer exists or has no components.");
      if (cacheKey) orderDetailsCache.current.set(cacheKey, detailed);
      setSelected(detailed);
    } catch (error) {
      setNotice(error?.message || "Failed to load maintenance order details.");
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  function beginAction(action, group) {
    setActionError("");
    setActionState({ action, group });
  }

  async function runProtectedAction(action, group, password) {
    const config = MAINTENANCE_ACTIONS[action];
    if (!config) throw new Error("Unsupported maintenance action.");
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: action === "edit" ? "edit-init" : action, orderIds: group.orderIds, adminPassword: password }),
    });
    const data = await readJson(response) || {};
    if (response.status === 401) {
      const error = new Error("Wrong password. Please try again.");
      error.status = 401;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(data?.error || `Failed to ${action} maintenance order.`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function submitAction(password) {
    if (!actionState) return;
    const { action, group } = actionState;
    setActionError("");

    if (action === "delete") {
      setActionState(null);
      setDeleteConfirm({ group, password });
      return;
    }

    setBusy(true);
    try {
      const data = await runProtectedAction(action, group, password);
      if (action === "edit") {
        await ensureOptions();
        const freshItems = Array.isArray(data?.items) ? data.items : [];
        const freshGroups = freshItems.length ? buildGroups(freshItems) : [];
        const editGroup = freshGroups.find((item) => item.key === group.key) || freshGroups[0] || group;
        setLogMode("edit");
        setLogGroup(editGroup);
        setActionState(null);
        setSelected(null);
        return;
      }

      await refreshOrders();
      setActionState(null);
      setSelected(null);
      setNotice("Maintenance order moved to Archive.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (error) {
      setActionError(error?.message || "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm?.group) return;
    const { group, password } = deleteConfirm;
    setBusy(true);
    try {
      await runProtectedAction("delete", group, password);
      await refreshOrders();
      setDeleteConfirm(null);
      setSelected(null);
      setNotice("Maintenance order deleted successfully.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (error) {
      setDeleteConfirm(null);
      setActionState({ action: "delete", group });
      setActionError(error?.message || "The maintenance order could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function ensureOptions() {
    if (Array.isArray(options?.resolutionMethods) && Array.isArray(options?.spareParts) && Array.isArray(options?.checklistItems)) return options;
    const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance/form-options`, { credentials: "include", cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || "Failed to load maintenance form options.");
    setOptions(data || {});
    return data || {};
  }

  function rememberChecklistItem(item) {
    const value = text(item?.text ?? item?.value ?? item);
    const id = text(item?.id);
    if (!value) return;
    setOptions((current) => {
      const list = Array.isArray(current?.checklistItems) ? current.checklistItems : [];
      const index = list.findIndex((entry) => {
        const entryId = text(entry?.id);
        if (id && entryId) return entryId === id;
        return lower(entry?.text ?? entry?.value ?? entry) === lower(value);
      });
      const normalized = { id, text: value };
      if (index < 0) return { ...current, checklistItems: [...list, normalized] };
      const next = [...list];
      next[index] = { ...next[index], ...normalized };
      return { ...current, checklistItems: next };
    });
  }

  function forgetChecklistItem(item) {
    const id = text(item?.id);
    const value = lower(item?.text ?? item?.value ?? item);
    setOptions((current) => ({
      ...current,
      checklistItems: (Array.isArray(current?.checklistItems) ? current.checklistItems : []).filter((entry) => {
        if (id && text(entry?.id)) return text(entry?.id) !== id;
        return lower(entry?.text ?? entry?.value ?? entry) !== value;
      }),
    }));
  }

  async function openDownload(group, exportOptions = {}) {
    setActionError("");
    try {
      await ensureOptions();
      setDownloadState({ group, template: Boolean(exportOptions?.template) });
    } catch (error) {
      setNotice(error?.message || "Failed to load download options.");
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  async function openLog(group) {
    setActionError("");
    try {
      await ensureOptions();
      setLogMode("create");
      setLogGroup(group);
    } catch (error) {
      setNotice(error?.message || "Failed to load maintenance form options.");
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  async function openSecondLog(group) {
    setActionError("");
    try {
      await ensureOptions();
      setLogMode("second");
      setLogGroup(group);
    } catch (error) {
      setNotice(error?.message || "Failed to load maintenance form options.");
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  async function saveLog(perItemLogs) {
    const isEditMode = logMode === "edit";
    const isSecondMode = logMode === "second";
    const hasSelectedSparePart = (list) => Array.isArray(list) && list.some((part) => text(part?.id) || text(part?.name));
    const hasMeaningfulLogDetails = (entry, includeSerial = true) => Boolean(
      (includeSerial && text(entry?.serialNumber))
      || text(entry?.resolutionMethod)
      || text(entry?.actualIssueDescription)
      || text(entry?.repairAction)
      || hasSelectedSparePart(entry?.sparePartsNeeded)
      || hasSelectedSparePart(entry?.sparePartsReplaced)
      || normalizeMaintenanceChecklist(entry?.checklist).length
    );
    const logsWithDetails = isEditMode
      ? perItemLogs
      : perItemLogs.filter((entry) => hasMeaningfulLogDetails(entry, !isSecondMode));
    if (!logsWithDetails.length && !isEditMode) {
      setActionError(isSecondMode
        ? "Please enter new maintenance details for the second log. The fixed serial number alone is not counted as a new log."
        : "Please fill maintenance details for at least one component. Spare parts are optional.");
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      await postJson(`${DIRECT_API_BASE}/orders/maintenance/mutations-direct`, {
        action: "log-maintenance",
        orderIds: logGroup.orderIds,
        perItemLogs: logsWithDetails,
        moveToArrived: false,
        moveToShipping: false,
        replaceExisting: isEditMode,
        appendLog: isSecondMode,
      });
      await refreshOrders();
      setLogGroup(null);
      setLogMode("create");
      setSelected(null);
      if (!isEditMode) setTab("in-progress");
      setNotice(isEditMode ? "Maintenance log updated." : isSecondMode ? "Second maintenance log saved." : "Maintenance log saved.");
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
      await postJson(`${DIRECT_API_BASE}/orders/maintenance/mutations-direct`, {
        action: "mark-arrived",
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

  async function exportOrder(group, options = {}) {
    const template = Boolean(options?.template);
    setBusy(true);
    try {
      const response = await fetch(`${DIRECT_API_BASE}/orders/export-direct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scope: "maintenance",
          kind: "maintenance-pdf",
          orderIds: group.orderIds,
          tab: group.state.key,
          template,
          sparePartColumns: Array.isArray(options?.sparePartColumns) ? options.sparePartColumns : undefined,
          checklist: Array.isArray(options?.checklist) ? options.checklist : [],
        }),
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
      downloadBlob(blob, template ? templateReportFileName(group) : reportFileName(group));
      setNotice(template ? "Maintenance template downloaded." : "Maintenance PDF downloaded.");
      window.setTimeout(() => setNotice(""), 3000);
      return true;
    } catch (error) {
      setNotice(error?.message || "Download failed.");
      window.setTimeout(() => setNotice(""), 4500);
      return false;
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
      const data = await loadTeamMemberPublicProfile(key);
      creatorProfileCache.current.set(key, data);
      setCreatorState({ ...base, loading: false, profile: data, error: false });
    } catch {
      setCreatorState({ ...base, loading: false, error: true });
    }
  }

  return (
    <section className="next-classic-orders-parity next-classic-maintenance-parity">
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span></div> : null}
      {notice ? <div className="orders-parity-success" role="status"><ClassicOrderIcon name="check-circle" />{notice}</div> : null}

      <div className="next-maintenance-orders-toolbar-wrap">
        <div className="orders-toolbar" aria-label="Maintenance orders tools">
          <div className="orders-toolbar__scroll"><div className="portfolio-tabs portfolio-tabs--iconic" role="tablist" aria-label="Maintenance Orders status">{STATUS_TABS.map((item) => <button type="button" className={`tab-portfolio order-status-tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}><span className="order-status-tab__icon"><ClassicOrderIcon name={item.icon} /></span><span className="order-status-tab__label">{item.label}</span></button>)}</div></div>
          <div className="orders-toolbar__divider" aria-hidden="true" />
          <MaintenanceFilter value={type} onChange={setType} count={groups.length} />
        </div>
      </div>

      <section className="next-maintenance-orders-list-surface">
        <div className="co-cards" id="requested-list">{visibleGroups.length ? visibleGroups.map((group) => <MaintenanceCard group={group} onOpen={openOrderDetails} onCreator={openCreatorProfile} key={group.key} />) : listLoading ? <div className="ops-no-data-state" role="status" aria-live="polite"><div className="ops-no-data-state__text">Loading maintenance orders…</div></div> : <div className="ops-no-data-state" role="status" aria-live="polite"><img className="ops-no-data-state__image" src="/next/images/no-data-illustration.png" alt="" loading="lazy" /><div className="ops-no-data-state__text">Sorry, No data available</div></div>}</div>
        {pageInfo?.hasMore ? <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 4px" }}><button type="button" className="ro-action-btn ro-action-btn--light" disabled={listLoading} onClick={() => fetchOrdersPage({ reset: false }).catch((error) => { setNotice(error?.message || "Failed to load more maintenance orders."); window.setTimeout(() => setNotice(""), 4000); })}>{listLoading ? "Loading…" : "Load more orders"}</button></div> : null}
      </section>

      {selected ? <MaintenanceDetailsModal group={selected} busy={busy} onClose={() => setSelected(null)} onLog={openLog} onSecondLog={openSecondLog} onDone={(group) => { setActionError(""); setDoneGroup(group); }} onExport={openDownload} onAction={beginAction} /> : null}
      {actionState ? <MaintenanceActionPasswordModal state={actionState} busy={busy} error={actionError} onCancel={() => { setActionState(null); setActionError(""); }} onSubmit={submitAction} /> : null}
      {deleteConfirm ? <MaintenanceDeleteConfirmationModal state={deleteConfirm} busy={busy} onCancel={() => setDeleteConfirm(null)} onConfirm={confirmDelete} /> : null}
      {logGroup ? <MaintenanceLogModal group={logGroup} mode={logMode} options={options} busy={busy} error={actionError} onCancel={() => { setLogGroup(null); setLogMode("create"); setActionError(""); }} onSubmit={saveLog} onChecklistSaved={rememberChecklistItem} onChecklistUpdated={rememberChecklistItem} onChecklistDeleted={forgetChecklistItem} /> : null}
      {downloadState ? <MaintenanceDownloadModal state={downloadState} options={options} busy={busy} onClose={() => setDownloadState(null)} onDownload={exportOrder} onChecklistSaved={rememberChecklistItem} onChecklistUpdated={rememberChecklistItem} onChecklistDeleted={forgetChecklistItem} /> : null}
      {doneGroup ? <MarkDoneModal group={doneGroup} busy={busy} error={actionError} onCancel={() => { setDoneGroup(null); setActionError(""); }} onSubmit={markDone} /> : null}
      <CreatorProfilePopover state={creatorState} onClose={() => setCreatorState(null)} />
    </section>
  );
}

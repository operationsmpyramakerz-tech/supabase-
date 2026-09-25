"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { loadTeamMemberPublicProfile } from "../../lib/team-member-public-client";

// Direct Next route handlers must include the configured /next basePath.
// Root /api/* belongs to the Legacy Express app on the public ERP origin.
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

const MAINTENANCE_SPARE_EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["component", "Component"],
  ["qty", "Quantity"],
  ["unitCost", "Unit Cost"],
  ["totalCost", "Total Cost"],
];

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

async function saveMaintenanceChecklistItem(value) {
  const clean = text(value);
  if (!clean) throw new Error("Checklist text is required.");
  const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance-checklist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ text: clean }),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "Failed to save checklist item.");
  return data?.item || null;
}

async function updateMaintenanceChecklistItem(id, value) {
  const cleanId = text(id);
  const clean = text(value);
  if (!cleanId) throw new Error("Checklist item id is required.");
  if (!clean) throw new Error("Checklist text is required.");
  const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance-checklist`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ id: cleanId, text: clean }),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "Failed to update checklist item.");
  return data?.item || null;
}

async function deleteMaintenanceChecklistItem(id) {
  const cleanId = text(id);
  if (!cleanId) throw new Error("Checklist item id is required.");
  const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance-checklist`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ id: cleanId }),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "Failed to delete checklist item.");
  return data;
}

function MaintenanceChecklistOption({ item, checked, disabled, onToggle, onUpdated, onDeleted, onError }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item?.text || "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setDraft(item?.text || "");
    setEditing(false);
    setConfirmDelete(false);
  }, [item?.id, item?.text]);

  const locked = disabled || working;

  async function saveEdit() {
    const value = text(draft);
    if (!value || !item?.id || locked) return;
    setWorking(true);
    onError?.("");
    try {
      const saved = await updateMaintenanceChecklistItem(item.id, value);
      const normalized = saved || { ...item, text: value };
      onUpdated?.(item, normalized);
      setEditing(false);
      setConfirmDelete(false);
    } catch (error) {
      onError?.(error?.message || "Failed to update checklist item.");
    } finally {
      setWorking(false);
    }
  }

  async function confirmRemove() {
    if (!item?.id || locked) return;
    setWorking(true);
    onError?.("");
    try {
      await deleteMaintenanceChecklistItem(item.id);
      onDeleted?.(item);
    } catch (error) {
      onError?.(error?.message || "Failed to delete checklist item.");
      setConfirmDelete(false);
    } finally {
      setWorking(false);
    }
  }

  return <div className={`next-maintenance-checklist-option${editing ? " is-editing" : ""}${confirmDelete ? " is-delete-confirm" : ""}`}>
    {editing ? <input
      className="next-maintenance-checklist-option__edit-input"
      type="text"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); saveEdit(); }
        if (event.key === "Escape") { setDraft(item.text); setEditing(false); }
      }}
      disabled={locked}
      autoFocus
      aria-label="Edit checklist item"
    /> : <label className="next-maintenance-checklist-option__select">
      <input type="checkbox" checked={Boolean(checked)} onChange={onToggle} disabled={locked} />
      <span>{item.text}</span>
    </label>}

    <div className="next-maintenance-checklist-option__actions">
      {editing ? <>
        <button type="button" className="next-maintenance-checklist-icon-btn next-maintenance-checklist-icon-btn--save" onClick={saveEdit} disabled={locked || !text(draft)} aria-label="Save checklist item" title="Save"><ClassicOrderIcon name="check" /></button>
        <button type="button" className="next-maintenance-checklist-icon-btn" onClick={() => { setDraft(item.text); setEditing(false); }} disabled={locked} aria-label="Cancel checklist edit" title="Cancel"><ClassicOrderIcon name="x" /></button>
      </> : confirmDelete ? <>
        <button type="button" className="next-maintenance-checklist-icon-btn next-maintenance-checklist-icon-btn--danger" onClick={confirmRemove} disabled={locked} aria-label="Confirm delete checklist item" title="Confirm delete"><ClassicOrderIcon name="check" /></button>
        <button type="button" className="next-maintenance-checklist-icon-btn" onClick={() => setConfirmDelete(false)} disabled={locked} aria-label="Cancel delete checklist item" title="Cancel"><ClassicOrderIcon name="x" /></button>
      </> : <>
        <button type="button" className="next-maintenance-checklist-icon-btn" onClick={() => { setDraft(item.text); setEditing(true); }} disabled={locked || !item?.id} aria-label="Edit checklist item" title="Edit"><ClassicOrderIcon name="edit-2" /></button>
        <button type="button" className="next-maintenance-checklist-icon-btn next-maintenance-checklist-icon-btn--danger" onClick={() => setConfirmDelete(true)} disabled={locked || !item?.id} aria-label="Delete checklist item" title="Delete"><ClassicOrderIcon name="trash-2" /></button>
      </>}
    </div>
  </div>;
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

function safeMaintenanceUrl(value) {
  const url = text(value);
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return "";
}

function MaintenanceSparePartsBlock({ title, entries, emptyText }) {
  const parts = Array.isArray(entries) ? entries : [];
  const totalCost = parts.reduce((sum, part) => sum + Math.max(0, finite(part?.total ?? (finite(part?.unitPrice) * finite(part?.qty)))), 0);
  return (
    <section className="next-maintenance-spares-card">
      <div className="next-maintenance-spares-card__head">
        <span className="next-maintenance-spares-card__title"><ClassicOrderIcon name="package" />{title}</span>
        <span className="next-maintenance-spares-card__count">{parts.length}</span>
      </div>
      {parts.length ? <div className="next-maintenance-spares-list">
        {parts.map((part, index) => {
          const partUrl = safeMaintenanceUrl(part?.url);
          const unitPrice = finite(part?.unitPrice);
          const total = finite(part?.total, unitPrice * finite(part?.qty, 1));
          return <div className="next-maintenance-spare-row" key={`${text(part?.id) || text(part?.name) || index}-${index}`}>
            <div className="next-maintenance-spare-row__main">
              <span className="next-maintenance-spare-row__index">{index + 1}</span>
              <span className="next-maintenance-spare-row__identity">
                {partUrl ? <a href={partUrl} target="_blank" rel="noopener noreferrer" className="next-maintenance-spare-row__name"><span>{text(part?.name) || "Spare part"}</span><ClassicOrderIcon name="external-link" /></a> : <strong className="next-maintenance-spare-row__name">{text(part?.name) || "Spare part"}</strong>}
                <span className="next-maintenance-spare-row__id">{text(part?.idCode ?? part?.displayId) ? `ID: ${text(part?.idCode ?? part?.displayId)}` : "No ID code"}</span>
              </span>
            </div>
            <div className="next-maintenance-spare-row__stats">
              <span><small>Qty</small><strong>{Math.max(1, Math.round(finite(part?.qty, 1)))}</strong></span>
              {unitPrice > 0 ? <span><small>Unit</small><strong>{formatMoney(unitPrice)}</strong></span> : null}
              {total > 0 ? <span><small>Total</small><strong>{formatMoney(total)}</strong></span> : null}
            </div>
          </div>;
        })}
        {totalCost > 0 ? <div className="next-maintenance-spares-card__total"><span>Total cost</span><strong>{formatMoney(totalCost)}</strong></div> : null}
      </div> : <div className="next-maintenance-spares-empty">{emptyText}</div>}
    </section>
  );
}

function MaintenanceDetailsModal({ group, busy, onClose, onLog, onDone, onExport, onAction }) {
  const [photosOpen, setPhotosOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  useEffect(() => {
    setPhotosOpen(false);
    setMoreOpen(false);
  }, [group?.key]);
  useEffect(() => {
    if (!group) return undefined;
    document.body.classList.add("co-modal-open");
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (photosOpen) return;
      if (moreOpen) { setMoreOpen(false); return; }
      onClose();
    };
    const onPointerDown = (event) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(event.target)) setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.body.classList.remove("co-modal-open");
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [group, onClose, photosOpen, moreOpen]);
  if (!group) return null;

  const menuAction = (action) => {
    setMoreOpen(false);
    onAction(action, group);
  };

  const canLog = group.state.key === "not-started";
  const canTemplate = group.state.key === "not-started";
  const canDone = group.state.key === "in-progress";
  const canDownload = ["in-progress", "done"].includes(group.state.key);
  const showDoneMeta = group.state.key === "done";

  return (
    <>
      <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="co-modal-dialog next-maintenance-details-dialog" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} maintenance details`}>
          <div className="co-modal-more" ref={moreRef}>
            <button type="button" className="co-modal-more-btn" aria-label="Order actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
              <span className="co-modal-more-dots" aria-hidden="true">⋮</span>
            </button>
            {moreOpen ? <div className="co-modal-more-panel" role="menu" aria-label="Order actions">
              <button type="button" className="co-modal-more-item" role="menuitem" onClick={() => menuAction("edit")}><ClassicOrderIcon name="edit-2" /><span>Edit</span></button>
              <button type="button" className="co-modal-more-item" role="menuitem" onClick={() => menuAction("archive")}><ClassicOrderIcon name="archive" /><span>Archive</span></button>
              <button type="button" className="co-modal-more-item co-modal-more-item--danger" role="menuitem" onClick={() => menuAction("delete")}><ClassicOrderIcon name="trash-2" /><span>Delete</span></button>
            </div> : null}
          </div>
          <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />
          <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">Request Maintenance</div></div></div>
          <div className="next-maintenance-order-modal-summary" aria-label="Maintenance order summary">
            <div><span>Team member</span><strong title={group.createdByName || "—"}>{group.createdByName || "—"}</strong></div>
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
              {canTemplate ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onExport(group, { template: true })} disabled={busy}><ClassicOrderIcon name="download" />Download Template</button> : null}
              {canDownload ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onExport(group)} disabled={busy}><ClassicOrderIcon name="download" />Download</button> : null}
              {canLog ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onLog(group)} disabled={busy}><ClassicOrderIcon name="clipboard" />Log Maintenance</button> : null}
              {canDone ? <button type="button" className="ro-action-btn ro-action-btn--dark" onClick={() => onDone(group)} disabled={busy}><ClassicOrderIcon name="check-circle" />Mark as Delivered</button> : null}
            </div>

            <div className="co-modal-items next-maintenance-modal-items">
              {[...group.items].sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true })).map((item, index) => {
                const productName = text(item?.productName) || "Component";
                const productUrl = safeMaintenanceUrl(item?.productUrl);
                const serialNumber = text(item?.serialNumber) || "—";
                const resolutionMethod = text(item?.resolutionMethod) || "—";
                const actualIssue = text(item?.actualIssueDescription) || "—";
                const repairAction = text(item?.repairAction) || "—";
                const checklist = normalizeMaintenanceChecklist(item?.maintenanceChecklist);
                const neededSpareParts = normalizeNeededSpareEntries(item);
                const replacedSpareParts = normalizeSpareEntries(item);
                const idCode = text(item?.idCode ?? item?.displayId);
                const componentName = productUrl
                  ? <a className="next-maintenance-modal-item__name next-maintenance-modal-item__name-link" href={productUrl} target="_blank" rel="noopener noreferrer" title="Open product link"><span>{productName}</span><ClassicOrderIcon name="external-link" /></a>
                  : <strong className="next-maintenance-modal-item__name">{productName}</strong>;

                return <section className="co-item next-maintenance-modal-item" key={text(item?.id) || index}>
                  <div className="next-maintenance-modal-item__head">
                    <span className="next-maintenance-modal-item__icon"><ClassicOrderIcon name="tool" /></span>
                    <span className="next-maintenance-modal-item__identity">
                      <span className="next-maintenance-modal-item__kicker">Component {index + 1}</span>
                      {componentName}
                      {idCode ? <span className="next-maintenance-modal-item__id">ID: {idCode}</span> : null}
                    </span>
                  </div>

                  <div className="next-maintenance-detail-group next-maintenance-detail-group--machine">
                    <div className="next-maintenance-detail-group__title"><span>Machine details</span></div>
                    <div className="next-maintenance-detail-grid next-maintenance-detail-grid--two">
                      <div className="next-maintenance-detail-field">
                        <span>Component</span>
                        {productUrl ? <a className="next-maintenance-detail-field__product" href={productUrl} target="_blank" rel="noopener noreferrer"><span>{productName}</span><ClassicOrderIcon name="external-link" /></a> : <strong>{productName}</strong>}
                        {idCode ? <small>ID: {idCode}</small> : null}
                      </div>
                      <div className="next-maintenance-detail-field"><span>Serial number</span><strong dir="auto">{serialNumber}</strong></div>
                    </div>
                  </div>

                  <div className="next-maintenance-modal-item__issue next-maintenance-modal-item__issue--grouped">
                    <span>Initial issue</span>
                    <p dir="auto">{issueText(item)}</p>
                  </div>

                  <div className="next-maintenance-detail-group next-maintenance-detail-group--action">
                    <div className="next-maintenance-detail-group__title"><span>Maintenance action</span></div>
                    <div className="next-maintenance-detail-grid next-maintenance-detail-grid--two">
                      <div className="next-maintenance-detail-field"><span>Resolution method</span><strong dir="auto">{resolutionMethod}</strong></div>
                      <div className="next-maintenance-detail-field next-maintenance-detail-field--checklist">
                        <span>Maintenance checklist</span>
                        {checklist.length ? <div className="next-maintenance-checklist-view">{checklist.map((value, checklistIndex) => <div className="next-maintenance-checklist-view__item" key={`${value}-${checklistIndex}`}><ClassicOrderIcon name="check-circle" /><strong dir="auto">{value}</strong></div>)}</div> : <div className="next-maintenance-detail-field__empty">No checklist items recorded</div>}
                      </div>
                      <div className="next-maintenance-detail-field next-maintenance-detail-field--text"><span>Actual issue description</span><strong dir="auto">{actualIssue}</strong></div>
                      <div className="next-maintenance-detail-field next-maintenance-detail-field--text"><span>Repair action</span><strong dir="auto">{repairAction}</strong></div>
                    </div>
                  </div>

                  <div className="next-maintenance-detail-group next-maintenance-detail-group--spares">
                    <div className="next-maintenance-detail-group__title"><span>Spare parts</span></div>
                    <div className="next-maintenance-spares-grid">
                      <MaintenanceSparePartsBlock title="Spare parts needed" entries={neededSpareParts} emptyText="No spare parts needed" />
                      <MaintenanceSparePartsBlock title="Spare parts replaced" entries={replacedSpareParts} emptyText="No spare parts replaced" />
                    </div>
                  </div>
                </section>;
              })}
            </div>
          </div>
        </div>
      </div>
      <ReceiptPhotosModal group={photosOpen ? group : null} onClose={() => setPhotosOpen(false)} />
    </>
  );
}

function MaintenanceDownloadModal({ state, options, busy, onClose, onDownload, onChecklistSaved, onChecklistUpdated, onChecklistDeleted }) {
  const group = state?.group || null;
  const template = Boolean(state?.template);
  const [columns, setColumns] = useState(MAINTENANCE_SPARE_EXPORT_COLUMNS.map(([key]) => key));
  const [selectedChecklist, setSelectedChecklist] = useState([]);
  const [newChecklist, setNewChecklist] = useState("");
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!state) return;
    setColumns(MAINTENANCE_SPARE_EXPORT_COLUMNS.map(([key]) => key));
    const logged = template ? [] : normalizeMaintenanceChecklist((group?.items || []).flatMap((item) => item?.maintenanceChecklist || []));
    setSelectedChecklist(logged);
    setNewChecklist("");
    setError("");
  }, [state?.group?.key, template]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy && !savingChecklist) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, savingChecklist, onClose]);

  if (!state || !group) return null;
  const checklistItems = (Array.isArray(options?.checklistItems) ? options.checklistItems : [])
    .map((item) => ({ id: text(item?.id), text: text(item?.text ?? item?.value ?? item) }))
    .filter((item) => item.text);

  const toggleColumn = (key) => {
    setColumns((current) => current.includes(key)
      ? (current.length === 1 ? current : current.filter((item) => item !== key))
      : [...current, key]);
  };

  const toggleChecklist = (value) => {
    setSelectedChecklist((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  async function addChecklist() {
    const value = text(newChecklist);
    if (!value || savingChecklist) return;
    setSavingChecklist(true);
    setError("");
    try {
      const saved = await saveMaintenanceChecklistItem(value);
      const savedText = text(saved?.text) || value;
      onChecklistSaved?.(saved || { text: savedText });
      setSelectedChecklist((current) => normalizeMaintenanceChecklist([...current, savedText]));
      setNewChecklist("");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save checklist item.");
    } finally {
      setSavingChecklist(false);
    }
  }

  function handleChecklistUpdated(previous, saved) {
    const previousText = text(previous?.text);
    const nextText = text(saved?.text);
    if (!nextText) return;
    onChecklistUpdated?.(saved);
    setSelectedChecklist((current) => normalizeMaintenanceChecklist(current.map((value) => value === previousText ? nextText : value)));
  }

  function handleChecklistDeleted(item) {
    const removedText = text(item?.text);
    onChecklistDeleted?.(item);
    setSelectedChecklist((current) => current.filter((value) => value !== removedText));
  }

  async function runDownload() {
    setError("");
    const ok = await onDownload(group, {
      template,
      sparePartColumns: columns,
      checklist: selectedChecklist,
    });
    if (ok !== false) onClose();
  }

  return <div className="order-download-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !savingChecklist) onClose(); }}>
    <div className="order-download-dialog next-maintenance-download-dialog" role="dialog" aria-modal="true" aria-label={template ? "Download maintenance template" : "Download maintenance report"}>
      <button type="button" className="order-download-close" onClick={onClose} disabled={busy || savingChecklist} aria-label="Close download options"><ClassicOrderIcon name="x" /></button>
      <div className="order-download-header">
        <span className="order-download-header__icon"><ClassicOrderIcon name="download" /></span>
        <div><h2>{template ? "Download Template" : "Download Maintenance PDF"}</h2><p>{group.orderIdLabel}</p></div>
      </div>

      <div className="order-download-section order-download-columns">
        <span className="order-download-section__label">Spare parts table columns</span>
        <div className="order-download-columns__grid">
          {MAINTENANCE_SPARE_EXPORT_COLUMNS.map(([key, label]) => <label key={key} className="order-download-column-option">
            <input type="checkbox" checked={columns.includes(key)} onChange={() => toggleColumn(key)} />
            <span>{label}</span>
          </label>)}
        </div>
      </div>

      <div className="order-download-section next-maintenance-download-checklist">
        <div className="order-download-instructions__heading"><span className="order-download-section__label">Checklist</span></div>
        <div className="next-maintenance-checklist-options next-maintenance-checklist-options--download">
          {checklistItems.length ? checklistItems.map((item) => <MaintenanceChecklistOption
            key={item.id || item.text}
            item={item}
            checked={selectedChecklist.includes(item.text)}
            disabled={busy || savingChecklist}
            onToggle={() => toggleChecklist(item.text)}
            onUpdated={handleChecklistUpdated}
            onDeleted={handleChecklistDeleted}
            onError={setError}
          />) : <div className="next-maintenance-checklist-empty">No saved checklist items yet.</div>}
        </div>
        <div className="next-maintenance-checklist-add">
          <input type="text" value={newChecklist} onChange={(event) => setNewChecklist(event.target.value)} placeholder="Add checklist text..." disabled={busy || savingChecklist} />
          <button type="button" className="order-download-btn order-download-btn--light" onClick={addChecklist} disabled={busy || savingChecklist || !text(newChecklist)}>+ Add</button>
        </div>
      </div>

      {error ? <div className="order-download-error" role="alert">{error}</div> : null}
      <div className="order-download-actions">
        <button type="button" className="order-download-btn order-download-btn--dark" onClick={runDownload} disabled={busy || savingChecklist}><ClassicOrderIcon name="file-text" /><span>{busy ? "Preparing…" : "Download PDF"}</span></button>
      </div>
    </div>
  </div>;
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
  const existingNeeded = normalizeNeededSpareEntries(item);
  const existingReplaced = normalizeSpareEntries(item);
  return {
    orderId: text(item?.id),
    productName: text(item?.productName) || "Component",
    issueDescription: issueText(item),
    serialNumber: text(item?.serialNumber),
    resolutionMethod: text(item?.resolutionMethod),
    actualIssueDescription: text(item?.actualIssueDescription),
    repairAction: text(item?.repairAction),
    sparePartsNeeded: existingNeeded.length ? existingNeeded : [{ id: "", name: "", qty: 1 }],
    sparePartsReplaced: existingReplaced.length ? existingReplaced : [{ id: "", name: "", qty: 1 }],
    checklist: normalizeMaintenanceChecklist(item?.maintenanceChecklist),
  };
}

function MaintenanceLogModal({ group, mode = "create", options, busy, error, onCancel, onSubmit, onChecklistSaved, onChecklistUpdated, onChecklistDeleted }) {
  const [logs, setLogs] = useState([]);
  const [newChecklistText, setNewChecklistText] = useState({});
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistError, setChecklistError] = useState("");

  useEffect(() => {
    setLogs(group ? [...group.items].sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true })).map(emptyLogForItem) : []);
    setNewChecklistText({});
    setChecklistError("");
  }, [group]);

  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy && !checklistSaving) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, busy, checklistSaving, onCancel]);

  if (!group) return null;
  const isEditMode = mode === "edit";
  const resolutionMethods = (Array.isArray(options?.resolutionMethods) ? options.resolutionMethods : []).map((option) => ({ value: text(option?.name ?? option?.value ?? option), label: text(option?.name ?? option?.label ?? option) })).filter((option) => option.value);
  const spareOptions = (Array.isArray(options?.spareParts) ? options.spareParts : []).map((option) => ({ value: text(option?.id ?? option?.value ?? option?.name), label: text(option?.name ?? option?.label ?? option?.value) })).filter((option) => option.value || option.label);
  const checklistItems = (Array.isArray(options?.checklistItems) ? options.checklistItems : [])
    .map((item) => ({ id: text(item?.id), text: text(item?.text ?? item?.value ?? item) }))
    .filter((item) => item.text);

  function patchLog(index, patch) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  function patchSpare(logIndex, listKey, spareIndex, patch) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const list = Array.isArray(entry[listKey]) ? entry[listKey] : [];
      return { ...entry, [listKey]: list.map((part, partIndex) => partIndex === spareIndex ? { ...part, ...patch } : part) };
    }));
  }

  function addSpare(logIndex, listKey) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === logIndex
      ? { ...entry, [listKey]: [...(Array.isArray(entry[listKey]) ? entry[listKey] : []), { id: "", name: "", qty: 1 }] }
      : entry));
  }

  function removeSpare(logIndex, listKey, spareIndex) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const list = (Array.isArray(entry[listKey]) ? entry[listKey] : []).filter((_, partIndex) => partIndex !== spareIndex);
      return { ...entry, [listKey]: list.length ? list : [{ id: "", name: "", qty: 1 }] };
    }));
  }

  function toggleChecklist(logIndex, value) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const active = normalizeMaintenanceChecklist(entry.checklist);
      const next = active.includes(value) ? active.filter((item) => item !== value) : [...active, value];
      return { ...entry, checklist: next };
    }));
  }

  async function addChecklistItem(logIndex) {
    const value = text(newChecklistText[logIndex]);
    if (!value || checklistSaving) return;
    setChecklistSaving(true);
    setChecklistError("");
    try {
      const saved = await saveMaintenanceChecklistItem(value);
      const savedText = text(saved?.text) || value;
      onChecklistSaved?.(saved || { text: savedText });
      setNewChecklistText((current) => ({ ...current, [logIndex]: "" }));
      setLogs((current) => current.map((entry, entryIndex) => entryIndex === logIndex
        ? { ...entry, checklist: normalizeMaintenanceChecklist([...(entry.checklist || []), savedText]) }
        : entry));
    } catch (saveError) {
      setChecklistError(saveError?.message || "Failed to save checklist item.");
    } finally {
      setChecklistSaving(false);
    }
  }

  function handleChecklistUpdated(previous, saved) {
    const previousText = text(previous?.text);
    const nextText = text(saved?.text);
    if (!nextText) return;
    onChecklistUpdated?.(saved);
    setLogs((current) => current.map((entry) => ({
      ...entry,
      checklist: normalizeMaintenanceChecklist((entry.checklist || []).map((value) => value === previousText ? nextText : value)),
    })));
  }

  function handleChecklistDeleted(item) {
    const removedText = text(item?.text);
    onChecklistDeleted?.(item);
    setLogs((current) => current.map((entry) => ({
      ...entry,
      checklist: normalizeMaintenanceChecklist((entry.checklist || []).filter((value) => value !== removedText)),
    })));
  }

  function normalizeParts(list) {
    return (Array.isArray(list) ? list : []).map((part) => {
      const id = text(part?.id);
      const selected = spareOptions.find((option) => text(option?.value) === id);
      const name = text(selected?.label ?? part?.name);
      const qtyValue = Number(part?.qty);
      const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? Math.max(1, Math.round(qtyValue)) : 1;
      return { id, name, qty };
    }).filter((part) => part.id || part.name);
  }

  function submit(event) {
    event.preventDefault();
    const normalized = logs.map((entry) => {
      const sparePartsNeeded = normalizeParts(entry.sparePartsNeeded);
      const sparePartsReplaced = normalizeParts(entry.sparePartsReplaced);
      return {
        orderId: entry.orderId,
        serialNumber: text(entry.serialNumber),
        resolutionMethod: text(entry.resolutionMethod),
        actualIssueDescription: text(entry.actualIssueDescription),
        repairAction: text(entry.repairAction),
        sparePartsNeeded,
        sparePartsReplaced,
        // Backward-compatible aliases used by the legacy branch.
        spareParts: sparePartsReplaced,
        sparePartIds: sparePartsReplaced.map((part) => part.id).filter(Boolean),
        sparePartNames: sparePartsReplaced.map((part) => part.name).filter(Boolean),
        checklist: normalizeMaintenanceChecklist(entry.checklist),
      };
    });
    onSubmit(normalized);
  }

  const renderSpareBlock = (entry, logIndex, listKey, title, hint) => {
    const list = Array.isArray(entry[listKey]) ? entry[listKey] : [];
    return <div className="co-submodal-field req-maintenance-log-card__spares next-maintenance-spare-frame">
      <div className="req-maintenance-spare-head next-maintenance-spare-frame__head">
        <span className="co-submodal-label">{title}</span>
        <small>{hint}</small>
      </div>
      <div className="req-maintenance-spare-list">{list.map((part, spareIndex) => <div className="req-maintenance-spare-row next-maintenance-spare-row" key={`${logIndex}-${listKey}-${spareIndex}`}>
        <div className="co-submodal-field req-maintenance-spare-row__part"><span className="co-submodal-label">Spare part</span><ModernSelect value={part.id || part.name} options={spareOptions} placeholder="Select component" searchable onChange={(value) => { const selected = spareOptions.find((option) => option.value === value); patchSpare(logIndex, listKey, spareIndex, { id: selected ? value : "", name: selected?.label || value }); }} disabled={busy} ariaLabel={`${title} item ${spareIndex + 1} for ${entry.productName}`} /></div>
        <label className="co-submodal-field req-maintenance-spare-row__qty"><span className="co-submodal-label">Qty</span><input className="co-submodal-input" type="number" min="1" step="1" inputMode="numeric" value={part.qty} onChange={(event) => patchSpare(logIndex, listKey, spareIndex, { qty: event.target.value })} disabled={busy} /></label>
        <button type="button" className="req-maintenance-spare-row__remove" onClick={() => removeSpare(logIndex, listKey, spareIndex)} disabled={busy} aria-label={list.length <= 1 ? `Clear ${title} item` : `Remove ${title} item`}><span aria-hidden="true">×</span></button>
      </div>)}</div>
      <button type="button" className="req-maintenance-spare-add req-maintenance-spare-add--full" onClick={() => addSpare(logIndex, listKey)} disabled={busy}><span className="req-maintenance-spare-add__icon">+</span><span>Add spare part</span></button>
    </div>;
  };

  return (
    <div className="co-submodal-overlay is-open next-maintenance-log-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !checklistSaving) onCancel(); }}>
      <form className="co-submodal-dialog req-maintenance-log-dialog next-maintenance-log-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <button type="button" className="co-submodal-close" onClick={onCancel} disabled={busy || checklistSaving} aria-label="Close" />
        <div className="co-submodal-header next-maintenance-log-header">
          <div className="req-edit-icon"><ClassicOrderIcon name={isEditMode ? "edit-2" : "clipboard"} /></div>
          <div className="next-maintenance-log-header__copy">
            <div className="co-submodal-title">{isEditMode ? "Edit Maintenance Log" : "Log Maintenance"}</div>
            <div className="co-submodal-sub">{isEditMode ? "Update the saved maintenance details below. Existing values are already filled in." : "Record the maintenance work completed for each component."}</div>
            <div className="next-maintenance-log-header__meta" aria-label="Maintenance log summary">
              <span><ClassicOrderIcon name="tool" />{group.orderIdLabel || "Maintenance order"}</span>
              <span><ClassicOrderIcon name="layers" />{logs.length} component{logs.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
        <div className="co-submodal-body req-maintenance-log-body">
          <div className="req-maintenance-log-items">
            {logs.map((entry, logIndex) => <section className="req-maintenance-log-card next-maintenance-log-card" key={entry.orderId || logIndex}>
              <div className="req-maintenance-log-card__head next-maintenance-log-card__head">
                <span className="next-maintenance-log-card__icon"><ClassicOrderIcon name="tool" /></span>
                <div className="next-maintenance-log-card__identity"><div className="req-maintenance-log-card__label">Component {logIndex + 1}</div><div className="req-maintenance-log-card__title">{entry.productName}</div></div>
                <span className={`next-maintenance-log-card__mode ${isEditMode ? "is-edit" : ""}`}>{isEditMode ? "Editing" : "New log"}</span>
                <div className="req-maintenance-log-card__issue"><span>Issue:</span> {entry.issueDescription}</div>
              </div>
              <div className="req-maintenance-log-card__fields">
                <label className="co-submodal-field next-maintenance-serial-field"><span className="co-submodal-label">Serial Number</span><input className="co-submodal-input" type="text" value={entry.serialNumber} onChange={(event) => patchLog(logIndex, { serialNumber: event.target.value })} disabled={busy} placeholder="Enter equipment serial number" autoComplete="off" /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">Resolution Method</span><ModernSelect value={entry.resolutionMethod} options={resolutionMethods} placeholder="Select resolution method" onChange={(value) => patchLog(logIndex, { resolutionMethod: value })} disabled={busy} ariaLabel={`Resolution method for ${entry.productName}`} /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">The Actual Issue Description</span><textarea className="co-submodal-textarea" dir="auto" value={entry.actualIssueDescription} onChange={(event) => patchLog(logIndex, { actualIssueDescription: event.target.value })} disabled={busy} rows={4} placeholder="Write the actual issue description" /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">Repair Action</span><textarea className="co-submodal-textarea" dir="auto" value={entry.repairAction} onChange={(event) => patchLog(logIndex, { repairAction: event.target.value })} disabled={busy} rows={4} placeholder="Write the repair action" /></label>
                {renderSpareBlock(entry, logIndex, "sparePartsNeeded", "Spare parts needed", "Components that need to be replaced")}
                {renderSpareBlock(entry, logIndex, "sparePartsReplaced", "Spare parts replaced", "Components that were actually replaced")}
                <div className="co-submodal-field req-maintenance-log-card__spares next-maintenance-checklist-frame">
                  <div className="req-maintenance-spare-head next-maintenance-spare-frame__head"><span className="co-submodal-label">Maintenance Checklist</span><small>Select saved text items or add a new one.</small></div>
                  <div className="next-maintenance-checklist-options">
                    {checklistItems.length ? checklistItems.map((item) => <MaintenanceChecklistOption
                      key={item.id || item.text}
                      item={item}
                      checked={normalizeMaintenanceChecklist(entry.checklist).includes(item.text)}
                      disabled={busy || checklistSaving}
                      onToggle={() => toggleChecklist(logIndex, item.text)}
                      onUpdated={handleChecklistUpdated}
                      onDeleted={handleChecklistDeleted}
                      onError={setChecklistError}
                    />) : <div className="next-maintenance-checklist-empty">No saved checklist items yet.</div>}
                  </div>
                  <div className="next-maintenance-checklist-add">
                    <input className="co-submodal-input" type="text" value={newChecklistText[logIndex] || ""} onChange={(event) => setNewChecklistText((current) => ({ ...current, [logIndex]: event.target.value }))} placeholder="Add checklist text..." disabled={busy || checklistSaving} />
                    <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => addChecklistItem(logIndex)} disabled={busy || checklistSaving || !text(newChecklistText[logIndex])}>+ Add</button>
                  </div>
                </div>
              </div>
            </section>)}
          </div>
          <div className="co-submodal-error" role="alert" aria-live="polite">{checklistError || error}</div>
        </div>
        <div className="co-submodal-actions next-maintenance-log-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy || checklistSaving}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy || checklistSaving}>{busy ? "Saving…" : isEditMode ? "Save changes" : "Confirm"}</button></div>
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

function MaintenanceActionPasswordModal({ state, busy, error, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  useEffect(() => setPassword(""), [state?.action, state?.group?.key]);
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, onCancel]);
  if (!state) return null;
  const config = MAINTENANCE_ACTIONS[state.action];
  if (!config) return null;
  return (
    <div className="co-submodal-overlay is-open req-edit-modal" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <form className="co-submodal-dialog req-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
        <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close admin password dialog" />
        <div className="co-submodal-header req-edit-header">
          <div className={`req-edit-icon ${config.danger ? "req-edit-icon--danger" : ""}`} aria-hidden="true"><ClassicOrderIcon name={config.icon} /></div>
          <div><div className="co-submodal-title">{config.title}</div><div className="co-submodal-sub">{config.description}</div></div>
        </div>
        <div className="co-submodal-body">
          <label className="co-submodal-label" htmlFor="maintenance-order-admin-password">Admin password</label>
          <input id="maintenance-order-admin-password" className="co-submodal-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" placeholder="••••••••" disabled={busy} />
          <div className="co-submodal-error" role="alert" aria-live="polite">{error}</div>
        </div>
        <div className="co-submodal-actions">
          <button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className={`ro-action-btn ${config.danger ? "ro-action-btn--danger" : "ro-action-btn--dark"}`} disabled={busy || !password.trim()}>{busy ? "Working…" : config.button}</button>
        </div>
      </form>
    </div>
  );
}

function MaintenanceDeleteConfirmationModal({ state, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, onCancel]);
  if (!state) return null;
  const count = state.group?.items?.length || state.group?.orderIds?.length || 1;
  return (
    <div className="co-confirm-overlay is-open next-maintenance-order-delete-confirm" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <div className="co-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="maintenanceOrderDeleteTitle" aria-describedby="maintenanceOrderDeleteMessage">
        <div className="co-confirm-icon" aria-hidden="true"><ClassicOrderIcon name="trash-2" /></div>
        <div className="co-confirm-title" id="maintenanceOrderDeleteTitle">Delete {state.group?.orderIdLabel || "maintenance order"}?</div>
        <div className="co-confirm-message" id="maintenanceOrderDeleteMessage">
          You’re going to permanently delete this maintenance order and its {count} saved component{count === 1 ? "" : "s"}. This action cannot be undone.
        </div>
        <div className="co-confirm-actions">
          <button type="button" className="co-confirm-btn co-confirm-btn--light" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="co-confirm-btn co-confirm-btn--dark next-maintenance-order-delete-confirm__danger" onClick={onConfirm} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</button>
        </div>
      </div>
    </div>
  );
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
    const response = await fetch("/api/orders/requested/maintenance-form-options", { credentials: "include", cache: "no-store" });
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

  async function saveLog(perItemLogs) {
    const isEditMode = logMode === "edit";
    const logsWithDetails = isEditMode
      ? perItemLogs
      : perItemLogs.filter((entry) => text(entry?.serialNumber) || text(entry?.resolutionMethod) || text(entry?.actualIssueDescription) || text(entry?.repairAction) || (Array.isArray(entry?.sparePartsNeeded) && entry.sparePartsNeeded.length) || (Array.isArray(entry?.sparePartsReplaced) && entry.sparePartsReplaced.length) || normalizeMaintenanceChecklist(entry?.checklist).length);
    if (!logsWithDetails.length && !isEditMode) {
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
        replaceExisting: isEditMode,
      });
      await refreshOrders();
      setLogGroup(null);
      setLogMode("create");
      setSelected(null);
      if (!isEditMode) setTab("in-progress");
      setNotice(isEditMode ? "Maintenance log updated." : "Maintenance log saved.");
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

  async function exportOrder(group, options = {}) {
    const template = Boolean(options?.template);
    setBusy(true);
    try {
      const response = await fetch("/api/orders/requested/export/maintenance-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
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

      <MaintenanceDetailsModal group={selected} busy={busy} onClose={() => setSelected(null)} onLog={openLog} onDone={(group) => { setActionError(""); setDoneGroup(group); }} onExport={openDownload} onAction={beginAction} />
      <MaintenanceActionPasswordModal state={actionState} busy={busy} error={actionError} onCancel={() => { setActionState(null); setActionError(""); }} onSubmit={submitAction} />
      <MaintenanceDeleteConfirmationModal state={deleteConfirm} busy={busy} onCancel={() => setDeleteConfirm(null)} onConfirm={confirmDelete} />
      <MaintenanceLogModal group={logGroup} mode={logMode} options={options} busy={busy} error={actionError} onCancel={() => { setLogGroup(null); setLogMode("create"); setActionError(""); }} onSubmit={saveLog} onChecklistSaved={rememberChecklistItem} onChecklistUpdated={rememberChecklistItem} onChecklistDeleted={forgetChecklistItem} />
      <MaintenanceDownloadModal state={downloadState} options={options} busy={busy} onClose={() => setDownloadState(null)} onDownload={exportOrder} onChecklistSaved={rememberChecklistItem} onChecklistUpdated={rememberChecklistItem} onChecklistDeleted={forgetChecklistItem} />
      <MarkDoneModal group={doneGroup} busy={busy} error={actionError} onCancel={() => { setDoneGroup(null); setActionError(""); }} onSubmit={markDone} />
      <CreatorProfilePopover state={creatorState} onClose={() => setCreatorState(null)} />
    </section>
  );
}

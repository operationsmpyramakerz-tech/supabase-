"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

const STATUS_TABS = [
  { key: "all", label: "All", icon: "layers" },
  { key: "approved", label: "Approved", icon: "check-circle" },
  { key: "rejected", label: "Rejected", icon: "x-circle" },
  { key: "remaining", label: "Remaining", icon: "pause-circle" },
  { key: "received", label: "Shipping", icon: "truck" },
  { key: "delivered", label: "Delivered", icon: "check-circle" },
  { key: "archive", label: "Archive", icon: "archive" },
];

const STATUS_COLORS = {
  "under-supervision": { bg: "#FFEDD5", fg: "#9A3412", bd: "#FED7AA" },
  approved: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
  rejected: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
  remaining: { bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
  received: { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" },
  shipped: { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" },
  delivered: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
  arrived: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
  archive: { bg: "#EDE9FE", fg: "#6D28D9", bd: "#DDD6FE" },
  mixed: { bg: "#F3F4F6", fg: "#374151", bd: "#D1D5DB" },
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

function roundQty(value) {
  return Math.round(finite(value) * 1e6) / 1e6;
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

function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(finite(value));
}

function formatQuantity(value) {
  const number = roundQty(value);
  return Number.isInteger(number) ? String(number) : String(number);
}

function orderTypeKey(value) {
  return lower(value).replace(/[^a-z0-9]/g, "");
}

function orderTypeMeta(value) {
  const key = orderTypeKey(value);
  if (key === "requestproducts") return { label: "Request Products", icon: "shopping-cart", bg: "#DCFCE7", fg: "#166534", bd: "#86EFAC" };
  if (key === "withdrawproducts") return { label: "Withdraw Products", icon: "log-out", bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" };
  if (key === "requestmaintenance") return { label: "Request Maintenance", icon: "tool", bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" };
  return { label: text(value) || "Order", icon: "package", bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" };
}

function isMaintenance(value) {
  return orderTypeKey(value) === "requestmaintenance";
}

function statusIndex(value) {
  const status = lower(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress|approved)/.test(status)) return 2;
  return 1;
}

function approvalKey(value) {
  const state = lower(value).replace(/[_.-]+/g, " ");
  if (state.includes("reject")) return "rejected";
  if (state.includes("approv")) return "approved";
  return "not-started";
}

function itemRejectedReason(item) {
  return text(item?.rejectedReason ?? item?.rejected_reason);
}

function itemDecision(item) {
  const operations = approvalKey(item?.operationsApproval ?? item?.operations_approval);
  const supervisor = approvalKey(item?.svApproval ?? item?.sv_approval);
  if (operations === "rejected" || supervisor === "rejected" || itemRejectedReason(item)) return "rejected";
  if (operations === "approved" || supervisor === "approved" || statusIndex(item?.status) === 2) return "approved";
  return "not-started";
}

function baseQuantity(item) {
  const value = item?.quantity ?? item?.quantityRequested ?? item?.quantity_requested;
  return roundQty(value);
}

function receivedQuantity(item) {
  const value = item?.quantityReceived ?? item?.quantity_received_by_operations;
  if (value === null || value === undefined || value === "") return 0;
  return roundQty(value);
}

function remainingQuantity(item) {
  const base = baseQuantity(item);
  const received = receivedQuantity(item);
  const storedRaw = item?.quantityRemaining ?? item?.quantity_remaining;
  const stored = storedRaw === null || storedRaw === undefined || storedRaw === "" ? null : roundQty(storedRaw);
  const edited = Boolean(item?.quantityReceivedEdited ?? item?.quantity_received_edited);
  if (stored !== null) {
    if (!edited && Math.abs(base) > 1e-9 && Math.abs(received) < 1e-9 && Math.abs(stored) < 1e-9) return base;
    return stored;
  }
  return roundQty(base - received);
}

function effectiveQuantity(item) {
  const edited = item?.quantityEditedBySupervisor ?? item?.quantityProgress;
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  return baseQuantity(item);
}

function itemTotal(item) {
  return Math.abs(effectiveQuantity(item)) * Math.abs(finite(item?.unitPrice ?? item?.unit_price ?? item?.price));
}

function groupKey(item, index) {
  const number = Number(item?.orderIdNumber);
  if (Number.isFinite(number)) return `order:${number}`;
  const direct = text(item?.orderId);
  if (direct && direct !== `ORD-${text(item?.id)}`) return `order:${direct}`;
  const date = text(item?.createdTime).slice(0, 16);
  const owner = lower(item?.createdByName ?? item?.teamMemberId);
  const reason = lower(item?.reason);
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
  return "Order";
}

function receiptEntriesFromItem(item) {
  const entries = [];
  const direct = Array.isArray(item?.orderReceiptEntries) ? item.orderReceiptEntries : [];
  direct.forEach((entry) => {
    const url = text(entry?.url ?? entry?.rawUrl ?? entry?.raw);
    const name = text(entry?.name ?? entry?.filename) || "Receipt photo";
    if (url) entries.push({ name, url });
  });
  const urls = Array.isArray(item?.orderReceiptUrls) ? item.orderReceiptUrls : [item?.orderReceiptUrl];
  const names = Array.isArray(item?.orderReceiptNames) ? item.orderReceiptNames : [item?.orderReceiptName];
  urls.filter(Boolean).forEach((url, index) => entries.push({ name: text(names[index]) || `Receipt photo ${index + 1}`, url: text(url) }));
  return entries;
}

function buildGroups(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => dateValue(b?.createdTime) - dateValue(a?.createdTime));
  const map = new Map();

  sorted.forEach((item, index) => {
    const key = groupKey(item, index);
    if (!map.has(key)) {
      map.set(key, {
        key,
        items: [],
        latestCreated: item?.createdTime,
        orderType: item?.orderType,
        orderTypeColor: item?.orderTypeColor,
        createdByName: item?.createdByName,
        createdById: item?.createdById ?? item?.teamMemberId,
      });
    }
    const group = map.get(key);
    group.items.push(item);
    if (dateValue(item?.createdTime) > dateValue(group.latestCreated)) group.latestCreated = item?.createdTime;
    if (!group.orderType && item?.orderType) group.orderType = item.orderType;
    if (!group.orderTypeColor && item?.orderTypeColor) group.orderTypeColor = item.orderTypeColor;
    if (!group.createdByName && item?.createdByName) group.createdByName = item.createdByName;
    if (!group.createdById && (item?.createdById ?? item?.teamMemberId)) group.createdById = item?.createdById ?? item?.teamMemberId;
  });

  return [...map.values()].map((group) => {
    const reasons = group.items.map((item) => text(item?.reason)).filter(Boolean);
    const counts = reasons.reduce((acc, reason) => acc.set(reason, (acc.get(reason) || 0) + 1), new Map());
    const reason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "No reason";
    const stage = Math.max(...group.items.map((item) => statusIndex(item?.status)), 1);
    const decisions = group.items.map(itemDecision);
    const hasApproved = decisions.includes("approved");
    const hasRejected = decisions.includes("rejected");
    const hasRemaining = group.items.some((item) => Math.abs(remainingQuantity(item)) > 1e-9);
    const hasReceived = group.items.some((item) => Math.abs(receivedQuantity(item)) > 1e-9);
    const receiptEntries = [];
    const receiptSeen = new Set();
    group.items.flatMap(receiptEntriesFromItem).forEach((entry) => {
      const key = `${entry.url}|${entry.name}`;
      if (!receiptSeen.has(key)) {
        receiptSeen.add(key);
        receiptEntries.push(entry);
      }
    });
    const rejectedReasons = [...new Set(group.items.map(itemRejectedReason).filter(Boolean))];
    const operationsNames = [...new Set(group.items.map((item) => text(item?.operationsByName)).filter(Boolean))];
    const receiptNumbers = [...new Set(group.items.flatMap((item) => text(item?.receiptNumber).split(/[\n,]+/)).map((item) => item.trim()).filter(Boolean))];

    let state = "under-supervision";
    if (stage >= 5) state = "archive";
    else if (stage >= 4) state = "delivered";
    else if (stage >= 3) state = hasRemaining && !isMaintenance(group.orderType) ? "remaining" : "received";
    else if (hasRejected) state = "rejected";
    else if (hasApproved) state = "approved";

    return {
      ...group,
      reason,
      stage,
      state,
      hasApproved,
      hasRejected,
      hasRemaining,
      hasReceived,
      orderIdLabel: orderIdLabel(group.items),
      orderIds: group.items.map((item) => text(item?.id)).filter(Boolean),
      total: group.items.reduce((sum, item) => sum + itemTotal(item), 0),
      receivedTotal: group.items.reduce((sum, item) => sum + Math.abs(receivedQuantity(item)) * Math.abs(finite(item?.unitPrice)), 0),
      remainingTotal: group.items.reduce((sum, item) => sum + Math.abs(remainingQuantity(item)) * Math.abs(finite(item?.unitPrice)), 0),
      rejectedReason: rejectedReasons.join("\n"),
      operationsByName: operationsNames.length === 1 ? operationsNames[0] : operationsNames.length ? "Multiple" : "",
      receiptNumber: receiptNumbers.join(", "),
      receiptEntries,
    };
  }).sort((a, b) => dateValue(b.latestCreated) - dateValue(a.latestCreated));
}

function groupMatchesTab(group, tab) {
  if (tab === "all") return group.stage < 5;
  if (tab === "archive") return group.stage >= 5;
  if (tab === "delivered") return group.stage === 4;
  if (tab === "remaining") return group.stage === 3 && !isMaintenance(group.orderType) && group.hasRemaining;
  if (tab === "received") return group.stage === 3 && (isMaintenance(group.orderType) || group.hasReceived || !group.hasRemaining);
  if (tab === "approved") return group.stage === 2 && group.hasApproved;
  if (tab === "rejected") return group.stage === 2 && group.hasRejected;
  return false;
}


function groupsForTab(groups, orders, tab) {
  if (tab === "approved" || tab === "rejected") {
    const scopedRows = (Array.isArray(orders) ? orders : []).filter((item) => statusIndex(item?.status) === 2 && itemDecision(item) === tab);
    return buildGroups(scopedRows);
  }
  return groups.filter((group) => groupMatchesTab(group, tab));
}

function groupSearchText(group) {
  return [
    group.orderIdLabel,
    group.reason,
    group.createdByName,
    group.orderType,
    group.operationsByName,
    group.receiptNumber,
    group.rejectedReason,
    ...group.items.flatMap((item) => [item?.productName, item?.reason, item?.issueDescription, item?.actualIssueDescription, item?.repairAction, item?.resolutionMethod]),
  ].map(lower).join(" ");
}

function statusLabel(group) {
  if (group.stage >= 5) return "Archive";
  if (group.stage >= 4) return "Delivered";
  if (group.stage >= 3) return group.hasRemaining && !isMaintenance(group.orderType) ? "Remaining" : "Shipping";
  if (group.hasRejected && group.hasApproved) return "Mixed review";
  if (group.hasRejected) return "Rejected";
  if (group.hasApproved) return "Approved";
  return "Under Supervision";
}

function statusClass(group) {
  if (group.stage >= 5) return "status-archive";
  if (group.stage >= 4) return "status-arrived";
  if (group.stage >= 3) return group.hasRemaining && !isMaintenance(group.orderType) ? "status-remaining" : "status-shipped";
  if (group.hasRejected && group.hasApproved) return "status-mixed";
  if (group.hasRejected) return "status-rejected";
  if (group.hasApproved) return "status-approved";
  return "status-under-supervision";
}

function itemStatus(item) {
  const stage = statusIndex(item?.status);
  if (stage >= 5) return { label: "Archive", className: "status-archive" };
  if (stage >= 4) return { label: "Delivered", className: "status-arrived" };
  if (stage >= 3) return { label: "Shipping", className: "status-shipped" };
  const decision = itemDecision(item);
  if (decision === "rejected") return { label: "Rejected", className: "status-rejected" };
  if (decision === "approved") return { label: "Approved", className: "status-approved" };
  return { label: "Under Supervision", className: "status-under-supervision" };
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body || {}),
  });
  const data = await readJson(response);
  if (response.status === 401) {
    const message = text(data?.error) || "Unauthorized request.";
    if (/password/i.test(message)) throw new Error(message);
    window.location.href = "/login?next=/next/operations-orders";
    throw new Error("Your session has expired.");
  }
  if (!response.ok) throw new Error(data?.error || "The operation could not be completed.");
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

function TypeFilter({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={`orders-type-filter ${open ? "is-open" : ""} ${value !== "all" ? "is-filtered" : ""}`}>
      <button type="button" className="orders-type-filter__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((state) => !state)}>
        <span className="orders-type-filter__button-icon"><ClassicOrderIcon name="filter" /></span>
        <span className="orders-type-filter__button-label">Filter</span>
        {value !== "all" ? <span className="orders-type-filter__button-dot" /> : null}
      </button>
      {open ? (
        <div className="orders-type-filter__panel" role="menu" aria-label="Filter operations orders by type">
          <div className="orders-type-filter__panel-head"><span className="orders-type-filter__panel-title">Order type</span><span className="orders-type-filter__panel-sub">Choose one</span></div>
          <div className="orders-type-filter__options">
            <button type="button" className={`orders-type-filter__option ${value === "all" ? "is-active" : ""}`} onClick={() => { onChange("all"); setOpen(false); }}>
              <span className="orders-type-filter__option-icon"><ClassicOrderIcon name="layers" /></span>
              <span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">All order types</span><span className="orders-type-filter__option-sub">Show every order type</span></span>
              <span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span>
            </button>
            {options.map((option) => {
              const meta = orderTypeMeta(option.raw || option.label);
              const style = { "--otf-icon-bg": meta.bg, "--otf-icon-fg": meta.fg, "--otf-icon-border": meta.bd };
              return (
                <button type="button" className={`orders-type-filter__option ${value === option.key ? "is-active" : ""}`} onClick={() => { onChange(option.key); setOpen(false); }} key={option.key}>
                  <span className="orders-type-filter__option-icon" style={style}><ClassicOrderIcon name={meta.icon} /></span>
                  <span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">{option.label}</span><span className="orders-type-filter__option-sub">{option.count} order{option.count === 1 ? "" : "s"}</span></span>
                  <span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusVars(group) {
  if (group.hasRejected && group.hasApproved && group.stage <= 2) return STATUS_COLORS.mixed;
  return STATUS_COLORS[group.state] || STATUS_COLORS["under-supervision"];
}

function StatusPill({ group, className = "co-status-btn" }) {
  const vars = statusVars(group);
  return <span className={className} style={{ "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd }}>{statusLabel(group)}</span>;
}

function MixedStatusPill() {
  return <span className="co-status-btn sv-mixed-approval-pill" aria-label="Approved and Rejected"><span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--approved">Approved</span><span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--rejected">Rejected</span></span>;
}

function profileFieldValue(profile, aliases) {
  const wanted = new Set((Array.isArray(aliases) ? aliases : [aliases]).map((value) => lower(value).replace(/[^a-z0-9]/g, "")));
  const topLevel = Object.entries(profile || {}).find(([key, value]) => wanted.has(lower(key).replace(/[^a-z0-9]/g, "")) && text(value));
  if (topLevel) return text(topLevel[1]);
  const field = (Array.isArray(profile?.fields) ? profile.fields : []).find((item) => wanted.has(lower(item?.label || item?.name || item?.key).replace(/[^a-z0-9]/g, "")) && text(item?.value));
  return text(field?.value);
}

function safeHttpUrl(value) {
  const url = text(value);
  return /^https?:\/\//i.test(url) ? url : "";
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
  const details = [
    ["Department", department], ["Position", position], ["Phone", phone], ["Email", email], ["Employee code", employeeCode],
  ].filter(([, value]) => value);

  return <div className="creator-profile-popover is-open next-operations-creator-popover" style={{ left: state.left, top: state.top }} aria-hidden="false"><div className="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile">
    <button type="button" className="creator-profile-close" onClick={onClose} aria-label="Close"><span className="creator-profile-close-x">×</span></button>
    <div className="creator-profile-head"><div className={`creator-profile-avatar ${photoUrl ? "has-image" : ""}`}>{photoUrl ? <img src={photoUrl} alt={name}/> : <span>{initials}</span>}</div><div className="creator-profile-title-wrap"><div className="creator-profile-kicker">Created by</div><div className="creator-profile-name">{name}</div><div className="creator-profile-subtitle">{subtitle}</div></div></div>
    {state.loading ? <div className="creator-profile-state"><span>Loading user details...</span></div> : state.error ? <div className="creator-profile-state creator-profile-state--error"><span>Could not load this user details.</span></div> : <>
      <div className="creator-profile-section-title">Profile details</div>
      {details.length ? <div className="creator-profile-fields next-operations-creator-fields">{details.map(([label, value]) => <div className="creator-profile-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> : <div className="creator-profile-empty creator-profile-empty--fields"><span>No profile details available.</span></div>}
      <div className="creator-profile-section-title creator-profile-section-title--files">Files &amp; media</div>
      {files.length ? <div className="creator-profile-files">{files.map((file, index) => file.url ? <a className="creator-profile-file" href={file.url} target="_blank" rel="noopener noreferrer" key={`${file.name}-${index}`}><span className="creator-profile-file-icon"><ClassicOrderIcon name="clipboard" /></span><span className="creator-profile-file-body"><span className="creator-profile-file-name">{file.name}</span></span><span className="creator-profile-file-open"><ClassicOrderIcon name="external-link" /></span></a> : <div className="creator-profile-file creator-profile-file--disabled" key={`${file.name}-${index}`}><span className="creator-profile-file-icon"><ClassicOrderIcon name="clipboard" /></span><span className="creator-profile-file-body"><span className="creator-profile-file-name">{file.name}</span></span></div>)}</div> : <div className="creator-profile-empty"><span>No files or media.</span></div>}
    </>}
  </div></div>;
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

function OperationsOrderCard({ group, tab, onOpen, onCreator }) {
  const type = orderTypeMeta(group.orderType);
  const thumbStyle = { "--co-thumb-bg": type.bg, "--co-thumb-fg": type.fg, "--co-thumb-border": type.bd };
  const displayItems = tab === "remaining"
    ? group.items.filter((item) => Math.abs(remainingQuantity(item)) > 1e-9)
    : tab === "received"
      ? group.items.filter((item) => Math.abs(receivedQuantity(item)) > 1e-9)
      : group.items;
  const value = tab === "remaining" ? group.remainingTotal : tab === "received" ? group.receivedTotal : group.total;
  return (
    <article className="co-card next-operations-order-card" role="button" tabIndex={0} aria-label={`Open ${group.orderIdLabel}`} onClick={() => onOpen(group)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(group); } }}>
      <div className="co-top">
        <div className="co-thumb co-thumb--order-type" style={thumbStyle} title={type.label} aria-label={type.label}><ClassicOrderIcon name={type.icon} /></div>
        <div className="co-main">
          <div className="co-title">{group.orderIdLabel}</div>
          <div className="next-operations-order-meta"><span className="co-sub">{formatDate(group.latestCreated)}</span></div>
        </div>
        <div className="co-qty" title={`${displayItems.length} component${displayItems.length === 1 ? "" : "s"}`}>x{displayItems.length}</div>
      </div>
      <div className="co-divider" />
      <div className="co-bottom">
        <div className="co-est">
          <div className="co-est-label">Estimate Total</div>
          <div className="co-est-value">{formatMoney(value)}</div>
        </div>
        <div className="co-actions">
          {tab === "all" && group.stage === 2 && group.hasApproved && group.hasRejected ? <MixedStatusPill /> : <StatusPill group={group} />}
          <button type="button" className="co-right-ico co-creator-btn next-operations-creator-btn" aria-label={`Created by ${group.createdByName || "user"}`} title={`Created by ${group.createdByName || "user"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCreator?.(event.currentTarget, group); }}><ClassicOrderIcon name="user" /></button>
        </div>
      </div>
    </article>
  );
}

function Progress({ stage }) {
  const icons = ["eye", "activity", "truck", "home"];
  const safe = Math.min(4, Math.max(1, stage >= 5 ? 4 : stage));
  return (
    <div className="co-track-pill" role="img" aria-label="Order progress">
      {icons.map((icon, index) => {
        const step = index + 1;
        return <span className="next-classic-track-fragment" key={icon}><span className={`co-track-step ${step <= safe ? "is-active" : ""} ${step === safe ? "is-current" : ""}`}><ClassicOrderIcon name={icon} /></span>{step < 4 ? <span className={`co-track-conn ${step < safe ? "is-active" : ""}`} /> : null}</span>;
      })}
    </div>
  );
}

function OrderModal({ group, tab, busy, onClose, onAction, onExport }) {
  useEffect(() => {
    if (!group) return undefined;
    document.body.classList.add("co-modal-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("co-modal-open"); window.removeEventListener("keydown", onKey); };
  }, [group, onClose]);

  if (!group) return null;
  const maintenance = isMaintenance(group.orderType);
  const type = orderTypeMeta(group.orderType);
  const archived = group.stage >= 5;
  const delivered = group.stage === 4;
  const shipping = group.stage === 3;
  const canReceive = group.stage === 2 && group.hasApproved && !maintenance;
  const canReview = group.stage <= 2 && !archived;
  const items = [...group.items].sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true }));

  return (
    <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="co-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="operations-order-title">
        <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />
        <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status" id="operations-order-title">{type.label}</div><div className="co-modal-status-sub" hidden /></div></div>
        <div className="next-operations-order-modal-summary" aria-label="Order summary">
          <div><span>Order</span><strong>{group.orderIdLabel}</strong></div>
          <div><span>Date</span><strong>{formatDate(group.latestCreated)}</strong></div>
          <div><span>Components</span><strong>{group.items.length}</strong></div>
          <div className="next-operations-order-modal-summary__status"><span>Status</span>{group.stage === 2 && group.hasApproved && group.hasRejected ? <MixedStatusPill /> : <StatusPill group={group} />}</div>
        </div>
        <Progress stage={group.stage} />
        <div className="co-modal-body">
          <div className="co-modal-meta">
            <div className="co-meta-row co-meta-row--reason"><span>Reason</span><strong>{group.reason}</strong></div>
            {group.receiptNumber ? <div className="co-meta-row"><span>Store Receipt Number</span><strong>{group.receiptNumber}</strong></div> : null}
            {group.operationsByName ? <div className="co-meta-row"><span>Received by</span><strong>{group.operationsByName}</strong></div> : null}
            {group.rejectedReason ? <div className="co-meta-row co-meta-row--reason co-meta-row--reject-reason"><span>Rejected reason</span><strong>{group.rejectedReason}</strong></div> : null}
          </div>

          <div className="co-modal-actions ro-actions ro-actions--right">
            {canReview ? <button type="button" className="ro-action-btn ro-action-btn--dark" onClick={() => onAction("approve", group)} disabled={busy}><ClassicOrderIcon name="check-circle" />Approve</button> : null}
            {canReview ? <button type="button" className="ro-action-btn ro-action-btn--danger" onClick={() => onAction("reject", group)} disabled={busy}><ClassicOrderIcon name="x-circle" />Reject</button> : null}
            {canReceive ? <button type="button" className="ro-action-btn ro-action-btn--dark" onClick={() => onAction("receive", group)} disabled={busy}><ClassicOrderIcon name="package" />Received by operations</button> : null}
            {maintenance && group.stage < 4 && !archived ? <a className="ro-action-btn ro-action-btn--light" href={`/next/maintenance-orders?tab=${shipping ? "in-progress" : "not-started"}`}><ClassicOrderIcon name="tool" />Open maintenance</a> : null}
            {shipping ? <button type="button" className="ro-action-btn ro-action-btn--dark" onClick={() => onAction("deliver", group)} disabled={busy}><ClassicOrderIcon name="check-circle" />Mark as Delivered</button> : null}
            {delivered && orderTypeKey(group.orderType) === "requestproducts" ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onAction("withdrawal", group)} disabled={busy}>Create Withdrawal</button> : null}
            {delivered && orderTypeKey(group.orderType) === "withdrawproducts" ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onAction("delivery", group)} disabled={busy}>Create Delivery</button> : null}
            {!archived ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onAction("archive", group)} disabled={busy}><ClassicOrderIcon name="archive" />Archive</button> : null}
            {archived ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onAction("unarchive", group)} disabled={busy}><ClassicOrderIcon name="rotate-ccw" />UnArchive</button> : null}
            <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onExport("pdf", group, tab)} disabled={busy}><ClassicOrderIcon name="download" />PDF</button>
            <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onExport("excel", group, tab)} disabled={busy}><ClassicOrderIcon name="download" />Excel</button>
          </div>

          {group.receiptEntries.length ? <div className="next-classic-receipt-list"><div className="co-submodal-label">Receipt photos</div><div>{group.receiptEntries.map((entry, index) => <a className="ro-action-btn ro-action-btn--light" href={entry.url} target="_blank" rel="noreferrer" key={`${entry.url}-${index}`}><ClassicOrderIcon name="image" />{entry.name}</a>)}</div></div> : null}

          <div className="co-modal-items">
            {items.map((item, index) => {
              const state = itemStatus(item);
              const base = baseQuantity(item);
              const received = receivedQuantity(item);
              const remaining = remainingQuantity(item);
              const vars = STATUS_COLORS[state.className.replace(/^status-/, "")] || STATUS_COLORS["under-supervision"];
              return <div className="co-item" key={text(item?.id) || index}><div className="co-item-left"><div className="co-item-title"><div className="co-item-name">{text(item?.productName) || "Product"}</div></div><div className="co-item-sub">Requested: {formatQuantity(base)} · Received: {formatQuantity(received)} · Remaining: {formatQuantity(remaining)}</div>{text(item?.issueDescription) ? <div className="co-item-issue-desc">{text(item.issueDescription)}</div> : null}{text(item?.actualIssueDescription) ? <div className="co-item-issue-desc"><b>Actual issue:</b> {text(item.actualIssueDescription)}</div> : null}{text(item?.repairAction) ? <div className="co-item-issue-desc"><b>Repair:</b> {text(item.repairAction)}</div> : null}</div><div className="co-item-right"><div className="co-item-total">{formatMoney(itemTotal(item))}</div><span className="co-item-status" style={{ "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd }}>{state.label}</span></div></div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ state, busy, error, onCancel, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [state?.group?.key]);
  if (!state) return null;
  return <div className="co-submodal-overlay is-open" aria-hidden="false"><form className="co-submodal-dialog reject-reason-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}><button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close"/><div className="co-submodal-header req-edit-header"><div className="req-edit-icon req-edit-icon--danger"><ClassicOrderIcon name="x-circle" /></div><div><div className="co-submodal-title">Reject operations order</div><div className="co-submodal-sub">Enter the reason that will be saved for every selected component.</div></div></div><div className="co-submodal-body"><label className="co-submodal-label">Rejected reason</label><textarea className="co-submodal-input next-classic-textarea" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus disabled={busy}/><div className="co-submodal-error" role="alert">{error}</div></div><div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--danger" disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Reject"}</button></div></form></div>;
}

function ArchiveModal({ state, busy, error, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  useEffect(() => setPassword(""), [state?.group?.key]);
  if (!state) return null;
  return <div className="co-submodal-overlay is-open" aria-hidden="false"><form className="co-submodal-dialog req-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}><button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close"/><div className="co-submodal-header req-edit-header"><div className="req-edit-icon"><ClassicOrderIcon name="archive" /></div><div><div className="co-submodal-title">Archive operations order</div><div className="co-submodal-sub">Enter the Operations Orders admin password to move this order to Archive.</div></div></div><div className="co-submodal-body"><label className="co-submodal-label">Admin password</label><input className="co-submodal-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus disabled={busy}/><div className="co-submodal-error" role="alert">{error}</div></div><div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy || !password.trim()}>{busy ? "Archiving…" : "Archive"}</button></div></form></div>;
}

function ReceiveModal({ state, busy, error, onCancel, onSubmit }) {
  const group = state?.group;
  const [receiptNumber, setReceiptNumber] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [quantities, setQuantities] = useState({});
  useEffect(() => { if (!group) return; const initial = {}; group.items.forEach((item) => { initial[text(item?.id)] = formatQuantity(Math.abs(remainingQuantity(item))); }); setQuantities(initial); setReceiptNumber(""); setIssueDescription(""); }, [group]);
  if (!group) return null;
  return <div className="co-submodal-overlay is-open next-classic-wide-submodal" aria-hidden="false"><form className="co-submodal-dialog req-ops-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit({ receiptNumber, issueDescription, quantities }); }}><button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close"/><div className="co-submodal-header req-edit-header"><div className="req-edit-icon"><ClassicOrderIcon name="package" /></div><div><div className="co-submodal-title">Receive components</div><div className="co-submodal-sub">Enter how much is being received now.</div></div></div><div className="co-submodal-body"><div className="co-submodal-fields"><label className="co-submodal-field"><span className="co-submodal-label">Receipt number (optional)</span><input className="co-submodal-input" value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="One or more receipt numbers"/></label><label className="co-submodal-field"><span className="co-submodal-label">Issue description (optional)</span><input className="co-submodal-input" value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} placeholder="Shared note for received components"/></label><div className="co-submodal-field"><span className="co-submodal-label">Received quantities</span><div className="req-ops-edit-qty-list">{group.items.map((item) => { const id=text(item?.id); return <label className="req-ops-edit-qty-row" key={id}><span className="req-ops-edit-qty-info"><span className="req-ops-edit-qty-name">{text(item?.productName) || "Product"}</span><span className="req-ops-edit-qty-sub">Already received {formatQuantity(receivedQuantity(item))} · Remaining {formatQuantity(remainingQuantity(item))}</span></span><input className="co-submodal-input req-ops-edit-qty-input" type="number" min="0" step="any" value={quantities[id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [id]: event.target.value }))}/></label>; })}</div></div></div><div className="co-submodal-error" role="alert">{error}</div></div><div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy}>{busy ? "Receiving…" : "Confirm receipt"}</button></div></form></div>;
}

function ConfirmModal({ state, busy, error, onCancel, onSubmit }) {
  const [receiptNumbers, setReceiptNumbers] = useState("");
  useEffect(() => setReceiptNumbers(""), [state?.action, state?.group?.key]);
  if (!state) return null;
  const configs = { approve: ["Approve operations order", "Every component in this order will be approved by Operations.", "Approve", "check-circle"], deliver: ["Mark order delivered", "The order will move to Delivered and stocktaking synchronization will run.", "Mark delivered", "check-circle"], unarchive: ["Restore archived order", "The order will return to the active workflow.", "UnArchive", "rotate-ccw"], withdrawal: ["Create withdrawal order", "A new withdrawal order will be created from delivered quantities.", "Create Withdrawal", "log-out"], delivery: ["Create delivery order", "A new delivery order will be created from delivered quantities.", "Create Delivery", "package"] };
  const config = configs[state.action] || ["Confirm action", "Continue with this operation?", "Continue", "check-circle"];
  return <div className="co-submodal-overlay is-open" aria-hidden="false"><form className="co-submodal-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit({ receiptNumbers }); }}><button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close"/><div className="co-submodal-header req-edit-header"><div className="req-edit-icon"><ClassicOrderIcon name={config[3]} /></div><div><div className="co-submodal-title">{config[0]}</div><div className="co-submodal-sub">{config[1]}</div></div></div><div className="co-submodal-body">{state.action === "deliver" ? <label className="co-submodal-field"><span className="co-submodal-label">Receipt numbers (optional)</span><input className="co-submodal-input" value={receiptNumbers} onChange={(event) => setReceiptNumbers(event.target.value)} placeholder="Separate values with commas"/></label> : null}<div className="co-submodal-error" role="alert">{error}</div></div><div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy}>{busy ? "Working…" : config[2]}</button></div></form></div>;
}

export default function OperationsOrdersClient({ initialOrders = [], bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [actionState, setActionState] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [creatorState, setCreatorState] = useState(null);
  const creatorProfileCache = useRef(new Map());

  useClassicHeaderSearch(query, setQuery, "Search by reason or user...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (STATUS_TABS.some((item) => item.key === requestedTab)) setTab(requestedTab);
    if (params.get("type")) setType(params.get("type"));
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
  const tabGroups = useMemo(() => groupsForTab(groups, orders, tab), [groups, orders, tab]);
  const typeOptions = useMemo(() => {
    const map = new Map();
    tabGroups.forEach((group) => {
      const key = orderTypeKey(group.orderType) || "other";
      const meta = orderTypeMeta(group.orderType);
      const current = map.get(key) || { key, raw: group.orderType, label: meta.label, count: 0 };
      current.count += 1;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [tabGroups]);

  const visibleGroups = useMemo(() => {
    const needle = lower(query);
    return tabGroups.filter((group) => {
      if (type !== "all" && (orderTypeKey(group.orderType) || "other") !== type) return false;
      return !needle || groupSearchText(group).includes(needle);
    });
  }, [tabGroups, type, query]);

  async function refreshOrders() {
    const response = await fetch("/api/orders/requested?scope=all-system&_fresh=1", { credentials: "include", cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login?next=/next/operations-orders";
      return;
    }
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || "Failed to refresh Operations Orders.");
    setOrders(Array.isArray(data) ? data : []);
  }

  function beginAction(action, group) {
    setActionError("");
    setActionState({ action, group });
  }

  async function completeAction(message, preferredTab = tab) {
    await refreshOrders();
    setSelected(null);
    setActionState(null);
    setTab(preferredTab);
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function submitAction(payload) {
    if (!actionState) return;
    const { action, group } = actionState;
    setBusy(true);
    setActionError("");
    try {
      if (action === "approve") {
        await postJson("/api/orders/operations/approval", { ids: group.orderIds, decision: "Approved" });
        await completeAction("Order approved by operations.", "approved");
      } else if (action === "reject") {
        const reason = text(payload);
        if (!reason) throw new Error("Rejected reason is required.");
        await postJson("/api/orders/operations/approval", { ids: group.orderIds, decision: "Rejected", rejectedReason: reason });
        await completeAction("Order rejected and the reason was saved.", "rejected");
      } else if (action === "receive") {
        const quantities = {};
        group.items.forEach((item) => {
          const id = text(item?.id);
          const receiveNow = Math.max(0, finite(payload?.quantities?.[id]));
          const base = baseQuantity(item);
          const sign = base < 0 ? -1 : 1;
          const absolute = Math.min(Math.abs(base), Math.abs(receivedQuantity(item)) + receiveNow);
          quantities[id] = roundQty(sign * absolute);
        });
        await postJson("/api/orders/requested/mark-shipped", {
          orderIds: group.orderIds,
          receiptNumber: text(payload?.receiptNumber) || null,
          issueDescription: text(payload?.issueDescription) || null,
          quantities,
        });
        await completeAction("Components were received by operations.", "received");
      } else if (action === "deliver") {
        const receiptNumbers = text(payload?.receiptNumbers).split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
        await postJson("/api/orders/requested/mark-arrived", { orderIds: group.orderIds, receiptNumbers });
        await completeAction("Order marked as delivered.", "delivered");
      } else if (action === "archive") {
        const password = text(payload);
        if (!password) throw new Error("Admin password is required.");
        await postJson("/api/orders/requested/archive", { orderIds: group.orderIds, adminPassword: password });
        await completeAction("Order moved to Archive.", "archive");
      } else if (action === "unarchive") {
        await postJson("/api/orders/requested/unarchive", { orderIds: group.orderIds });
        await completeAction("Order restored from Archive.", "approved");
      } else if (action === "withdrawal") {
        await postJson("/api/orders/requested/create-withdrawal", { orderIds: group.orderIds });
        await completeAction("Withdrawal order created.", "all");
      } else if (action === "delivery") {
        await postJson("/api/orders/requested/create-delivery", { orderIds: group.orderIds });
        await completeAction("Delivery order created.", "all");
      }
    } catch (error) {
      setActionError(error?.message || "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOrder(kind, group, selectedTab) {
    setBusy(true);
    setActionError("");
    try {
      const endpoint = kind === "excel" ? "/api/orders/requested/export/excel" : "/api/orders/requested/export/pdf";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: group.orderIds, tab: selectedTab }),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/operations-orders";
        return;
      }
      if (!response.ok) {
        const data = await readJson(response);
        throw new Error(data?.error || `Failed to export ${kind.toUpperCase()}.`);
      }
      const blob = await response.blob();
      downloadBlob(blob, `${group.orderIdLabel.replace(/[^a-z0-9_-]+/gi, "-") || "operations-order"}.${kind === "excel" ? "xlsx" : "pdf"}`);
      setNotice(`${kind.toUpperCase()} downloaded.`);
      window.setTimeout(() => setNotice(""), 3000);
    } catch (error) {
      setNotice(error?.message || "Export failed.");
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
    <section className="next-classic-orders-parity next-classic-operations-parity">
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders/requested?classic=1">Classic page</a></div> : null}
      {notice ? <div className="orders-parity-success" role="status"><ClassicOrderIcon name="check-circle" />{notice}</div> : null}

      <div className="next-operations-orders-toolbar-wrap">
        <div className="orders-toolbar" aria-label="Operations orders tools">
          <div className="orders-toolbar__scroll">
            <div className="portfolio-tabs portfolio-tabs--iconic" role="tablist" aria-label="Operations Orders status">
              {STATUS_TABS.map((item) => <button type="button" className={`tab-portfolio order-status-tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}><span className="order-status-tab__icon"><ClassicOrderIcon name={item.icon}/></span><span className="order-status-tab__copy"><span className="order-status-tab__label">{item.label}</span></span></button>)}
            </div>
          </div>
          <div className="orders-toolbar__divider" aria-hidden="true" />
          <TypeFilter value={type} options={typeOptions} onChange={setType} />
        </div>
      </div>

      <section className="operations-orders-list-surface" id="operations-orders-list">
        <div className="co-cards" id="requested-list">
          {visibleGroups.length ? visibleGroups.map((group) => <OperationsOrderCard group={group} tab={tab} onOpen={setSelected} onCreator={openCreatorProfile} key={group.key} />) : <div className="ops-no-data-state" role="status" aria-live="polite"><img className="ops-no-data-state__image" src="/images/no-data-illustration.png" alt="" loading="lazy"/><div className="ops-no-data-state__text">Sorry, No data available</div></div>}
        </div>
      </section>

      <OrderModal group={selected} tab={tab} busy={busy} onClose={() => setSelected(null)} onAction={beginAction} onExport={exportOrder} />
      <RejectModal state={actionState?.action === "reject" ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
      <ArchiveModal state={actionState?.action === "archive" ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
      <ReceiveModal state={actionState?.action === "receive" ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
      <ConfirmModal state={["approve", "deliver", "unarchive", "withdrawal", "delivery"].includes(actionState?.action) ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
      <CreatorProfilePopover state={creatorState} onClose={() => setCreatorState(null)} />
    </section>
  );
}

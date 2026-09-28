"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ClassicOrderIcon from "./ClassicOrderIcon";
import ActionLoadingModal, { useActionLoading } from "../ActionLoadingModal";
import { loadTeamMemberPublicProfile } from "../../lib/team-member-public-client";

const loadOperationsOrdersHeavyModals = () => import("./OperationsOrdersHeavyModals");
const OperationsOrdersHeavyModals = dynamic(loadOperationsOrdersHeavyModals, { ssr: false });


// Direct route handlers live under the configured /next basePath. Keep the
// explicit prefix so client requests stay inside the standalone Next deployment.
const DIRECT_API_BASE = "/next/api";

const OPERATIONS_EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["component", "Component"],
  ["qty", "Quantity"],
  ["receivedQty", "Received Qty"],
  ["remainingQty", "Remaining Qty"],
  ["deliveredQty", "Delivered Qty"],
  ["unit", "Unit Cost"],
  ["total", "Total Cost"],
];

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

function requestedQuantity(item) {
  const value = item?.quantityRequested ?? item?.quantity_requested ?? item?.quantity;
  return roundQty(value);
}

function supervisorEditedQuantity(item) {
  return item?.quantityEditedBySupervisor ?? item?.quantity_edited_by_supervisor ?? item?.quantityProgress ?? item?.quantity_progress;
}

function baseQuantity(item) {
  const edited = supervisorEditedQuantity(item);
  if (edited !== null && edited !== undefined && edited !== "") return roundQty(edited);
  // The requested-orders API also exposes `quantity` as the effective quantity,
  // so keep it as the legacy fallback when the original field is unavailable.
  const original = item?.quantityRequested ?? item?.quantity_requested;
  if (original !== null && original !== undefined && original !== "") return roundQty(original);
  return roundQty(item?.quantity);
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

function deliveredQuantity(item) {
  const explicit = item?.deliveredQty ?? item?.quantityDelivered ?? item?.quantity_delivered;
  if (explicit !== null && explicit !== undefined && explicit !== "") return roundQty(explicit);
  return /(arrived|delivered|received)/i.test(text(item?.status)) ? receivedQuantity(item) : 0;
}

function effectiveQuantity(item) {
  return baseQuantity(item);
}

function itemTotal(item) {
  return Math.abs(effectiveQuantity(item)) * Math.abs(finite(item?.unitPrice ?? item?.unit_price ?? item?.price));
}

function splitNames(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
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

function maintenanceIssueText(item = {}) {
  return text(item?.issueDescription ?? item?.reason) || "—";
}

function visibleIssueDescription(item = {}) {
  const value = text(item?.issueDescription);
  if (/^created from proposal:/i.test(value)) return "";
  return value;
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
    const summaryItem = group.items.find((item) => item?._summaryCard);
    const stage = summaryItem ? (Number(summaryItem._groupStage) || statusIndex(summaryItem.status)) : Math.max(...group.items.map((item) => statusIndex(item?.status)), 1);
    const decisions = group.items.map(itemDecision);
    const hasApproved = summaryItem ? Boolean(summaryItem._groupHasApproved) : decisions.includes("approved");
    const hasRejected = summaryItem ? Boolean(summaryItem._groupHasRejected) : decisions.includes("rejected");
    const hasRemaining = summaryItem ? Boolean(summaryItem._groupHasRemaining) : group.items.some((item) => Math.abs(remainingQuantity(item)) > 1e-9);
    const hasReceived = summaryItem ? Boolean(summaryItem._groupHasReceived) : group.items.some((item) => Math.abs(receivedQuantity(item)) > 1e-9);
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
      orderIds: [...new Set(group.items.flatMap((item) => Array.isArray(item?.orderIds) && item.orderIds.length ? item.orderIds : [item?.id]).map(text).filter(Boolean))],
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
  if (tab === "received") return group.stage === 3 && (isMaintenance(group.orderType) || group.hasReceived);
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

function itemsForOperationsTab(items, tab) {
  const source = Array.isArray(items) ? items : [];
  if (tab === "remaining") return source.filter((item) => Math.abs(remainingQuantity(item)) > 1e-9);
  if (tab === "received") return source.filter((item) => Math.abs(receivedQuantity(item)) > 1e-9);
  return source;
}


function splitOrderDisplayQuantity(value, breakdown = []) {
  const sources = Array.isArray(breakdown) ? breakdown : [];
  const total = roundQty(value);
  if (!sources.length || Math.abs(total) < 1e-9) return sources.map(() => 0);
  if (sources.length === 1) return [total];

  const sign = total < 0 ? -1 : 1;
  const target = Math.max(0, Math.round(Math.abs(total)));
  const weights = sources.map((source) => Math.max(0, finite(source?.quantity)));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) return sources.map((_, index) => index === 0 ? total : 0);

  const parts = weights.map((weight, index) => {
    const raw = (weight * target) / weightTotal;
    const base = Math.floor(raw);
    return { index, value: base, fraction: raw - base };
  });
  let remaining = target - parts.reduce((sum, part) => sum + part.value, 0);
  const ranked = parts.slice().sort((a, b) => (b.fraction - a.fraction) || (a.index - b.index));
  for (let i = 0; remaining > 0 && ranked.length; i = (i + 1) % ranked.length) {
    ranked[i].value += 1;
    remaining -= 1;
  }
  return parts.sort((a, b) => a.index - b.index).map((part) => sign * part.value);
}

function expandOrderItemsForDisplay(items = []) {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const breakdown = (Array.isArray(item?.sourceBreakdown) ? item.sourceBreakdown : [])
      .filter((source) => Math.abs(finite(source?.quantity)) > 1e-9);
    if (breakdown.length <= 1) {
      out.push(item);
      continue;
    }

    const requestedParts = splitOrderDisplayQuantity(requestedQuantity(item), breakdown);
    const baseParts = splitOrderDisplayQuantity(baseQuantity(item), breakdown);
    const receivedParts = splitOrderDisplayQuantity(receivedQuantity(item), breakdown);
    const remainingParts = splitOrderDisplayQuantity(remainingQuantity(item), breakdown);
    const itemId = text(item?.id) || "item";

    breakdown.forEach((source, sourceIndex) => {
      out.push({
        ...item,
        _displayKey: `${itemId}:${text(source?.kitId) || text(source?.kitTag) || sourceIndex}:${sourceIndex}`,
        _displaySourceIndex: sourceIndex,
        _displaySourceCount: breakdown.length,
        sourceBreakdown: [source],
        kitTag: text(source?.kitTag) || text(item?.kitTag) || "Unassigned kit",
        kitFolderName: text(source?.kitFolderName) || text(item?.kitFolderName) || "Unfiled Kits",
        quantity: baseParts[sourceIndex] ?? 0,
        quantityRequested: requestedParts[sourceIndex] ?? 0,
        quantityProgress: baseParts[sourceIndex] ?? 0,
        quantityEditedBySupervisor: baseParts[sourceIndex] ?? 0,
        quantityReceived: receivedParts[sourceIndex] ?? 0,
        quantityRemaining: remainingParts[sourceIndex] ?? 0,
      });
    });
  }
  return out;
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
  if (!response.ok) {
    const syncDetail = Array.isArray(data?.stocktakingSyncErrors)
      ? text(data.stocktakingSyncErrors.find((item) => text(item?.message))?.message)
      : "";
    const baseMessage = text(data?.error) || "The operation could not be completed.";
    throw new Error(syncDetail ? `${baseMessage} ${syncDetail}` : baseMessage);
  }
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

function StatusPill({ group, tab = "", className = "co-status-btn" }) {
  const forceShipping = tab === "received" && group.stage === 3;
  const vars = forceShipping ? STATUS_COLORS.received : statusVars(group);
  const label = forceShipping ? "Shipping" : statusLabel(group);
  return <span className={className} style={{ "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd }}>{label}</span>;
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

  return <div className="creator-profile-popover is-open next-operations-creator-popover" style={{ left: state.left, top: state.top }} aria-hidden="false"><div className="creator-profile-window" style={state.maxHeight ? { maxHeight: `${state.maxHeight}px` } : undefined} role="dialog" aria-modal="false" aria-label="Created by profile">
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

function writeOperationsEditTransfer(data, group) {
  try {
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) return "";
    const orderType = text(data?.orderType || group?.orderType);
    const reason = text(group?.reason);
    const patched = products.map((item) => ({ ...item, reason: text(item?.reason) || reason }));
    const editKey = `ops-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payload = JSON.stringify({ products: patched, orderType, reason, source: "operations-orders-next", ts: Date.now() });
    const typeKey = orderTypeKey(orderType) || "default";
    const keys = [
      `shopping_cart:edit_payload:v2:${editKey}`,
      `shopping_cart:edit_fallback:v1:${typeKey}`,
      "shopping_cart:edit_fallback:v1:default",
    ];
    for (const storage of [window.sessionStorage, window.localStorage]) {
      try {
        keys.forEach((key) => storage.setItem(key, payload));
        storage.setItem("shopping_cart:edit_pending:v2", JSON.stringify({ key: editKey, orderType, reason, ts: Date.now() }));
        if (orderType) storage.setItem("shopping_cart:edit_target_type:v1", orderType);
      } catch {}
    }
    return editKey;
  } catch {
    return "";
  }
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
  return (
    <article className="co-card next-operations-order-card" role="button" tabIndex={0} aria-label={`Open ${group.orderIdLabel}`} onClick={() => onOpen(group)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(group); } }}>
      <div className="co-top">
        <div className="co-thumb co-thumb--order-type" style={thumbStyle} title={type.label} aria-label={type.label}><ClassicOrderIcon name={type.icon} /></div>
        <div className="co-main">
          <div className="co-title">{group.orderIdLabel}</div>
          <div className="next-operations-order-meta"><span className="co-sub">{formatDate(group.latestCreated)}</span></div>
        </div>
        <div className="next-operations-card-head-actions">
          <div className="next-operations-card-status">
            {group.stage === 2 && group.hasApproved && group.hasRejected ? <MixedStatusPill /> : <StatusPill group={group} tab={tab} />}
          </div>
          <button type="button" className="co-creator-btn next-operations-creator-btn" aria-label={`Created by ${group.createdByName || "user"}`} title={`Created by ${group.createdByName || "user"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCreator?.(event.currentTarget, group); }}>
            <span className="next-operations-creator-label">{group.createdByName || "—"}</span>
            <span className="next-operations-creator-icon"><ClassicOrderIcon name="user" /></span>
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


export default function OperationsOrdersClient({ initialOrders = [], initialPageInfo = null, bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [pageInfo, setPageInfo] = useState(initialPageInfo || { hasMore: false, nextCursor: null, limit: 36 });
  const [listLoading, setListLoading] = useState(false);
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [actionState, setActionState] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editMode, setEditMode] = useState(null);
  const [creatorState, setCreatorState] = useState(null);
  const [maintenanceOptions, setMaintenanceOptions] = useState(null);
  const creatorProfileCache = useRef(new Map());
  const orderDetailsCache = useRef(new Map());
  const listRequestRef = useRef(0);
  const listAbortRef = useRef(null);
  const initialFilterKeyRef = useRef("all|all|");
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();

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
    const key = `${tab}|${type}|${query.trim()}`;
    if (key === initialFilterKeyRef.current) return undefined;
    initialFilterKeyRef.current = key;
    const timer = window.setTimeout(() => {
      fetchOrdersPage({ reset: true }).catch((error) => {
        setNotice(error?.message || "Failed to load Operations Orders.");
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
    const serverFilteredQuery = Boolean(needle)
      && pageInfo?.serverFiltered === true
      && lower(pageInfo?.query) === needle;
    return tabGroups.filter((group) => {
      if (type !== "all" && (orderTypeKey(group.orderType) || "other") !== type) return false;
      return !needle || serverFilteredQuery || groupSearchText(group).includes(needle);
    });
  }, [tabGroups, type, query, pageInfo]);

  async function fetchOrdersPage({ reset = true, fresh = false } = {}) {
    const requestId = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        scope: "all-system",
        mode: "summary",
        paged: "1",
        tab,
        filterType: type,
        limit: String(pageInfo?.limit || 36),
      });
      if (query.trim()) params.set("q", query.trim());
      if (!reset && pageInfo?.nextCursor !== null && pageInfo?.nextCursor !== undefined) params.set("cursor", String(pageInfo.nextCursor));
      if (fresh) params.set("_fresh", "1");
      const response = await fetch(`${DIRECT_API_BASE}/orders/requested/paged-summary?${params.toString()}`, { credentials: "include", cache: "no-store", signal: controller.signal });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/operations-orders";
        return;
      }
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to load Operations Orders.");
      if (requestId !== listRequestRef.current) return;
      const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
      const nextPageInfo = !Array.isArray(data) && data?.pageInfo ? data.pageInfo : { hasMore: false, nextCursor: null, limit: pageInfo?.limit || 36 };
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
        setEditMode(null);
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
    // Start loading the heavy details/edit/receive modal chunk while the order
    // detail request is in flight so opening an order does not add a second
    // serial wait after the network response.
    void loadOperationsOrdersHeavyModals();
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
      const response = await fetch(`${DIRECT_API_BASE}/orders/requested/details-direct`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds }),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/operations-orders";
        return;
      }
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to load order details.");
      const detailedGroups = buildGroups(Array.isArray(data) ? data : []);
      const detailed = detailedGroups.find((item) => item.key === group.key) || detailedGroups[0];
      if (!detailed) throw new Error("This order no longer exists or has no components.");
      if (cacheKey) orderDetailsCache.current.set(cacheKey, detailed);
      setSelected(detailed);
    } catch (error) {
      setNotice(error?.message || "Failed to load order details.");
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  async function beginAction(action, group) {
    setActionError("");
    if (action === "maintenance-log") {
      try {
        let options = maintenanceOptions;
        if (!options || !Array.isArray(options?.resolutionMethods) || !Array.isArray(options?.spareParts)) {
          const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance/form-options`, { credentials: "include", cache: "no-store" });
          if (response.status === 401) {
            window.location.href = "/login?next=/next/operations-orders";
            return;
          }
          const data = await readJson(response);
          if (!response.ok) throw new Error(data?.error || "Failed to load maintenance form options.");
          options = data || {};
          setMaintenanceOptions(options);
        }
        setActionState({ action, group });
      } catch (error) {
        setNotice(error?.message || "Failed to load maintenance form options.");
        window.setTimeout(() => setNotice(""), 4500);
      }
      return;
    }
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

  function actionLoadingConfig(action, group) {
    const componentScope = group?.actionScope === "component";
    const configs = {
      approve: { title: "Approving order", message: "Saving the Operations approval…" },
      reject: { title: componentScope ? "Rejecting component" : "Rejecting order", message: "Saving the rejection reason…" },
      receive: { title: "Receiving components", message: "Updating the received quantities…" },
      "technical-visit": { title: "Saving technical visit", message: "Saving the technical visit details…" },
      "maintenance-log": { title: "Saving maintenance log", message: "Saving maintenance details…" },
      "maintenance-deliver": { title: "Marking maintenance delivered", message: "Uploading the signed maintenance report…" },
      deliver: { title: "Marking order delivered", message: "Uploading receipt photos and syncing Stocktaking…" },
      archive: { title: "Archiving order", message: "Moving the order to Archive…" },
      unarchive: { title: "Restoring order", message: "Restoring the order to the active workflow…" },
      withdrawal: { title: "Creating withdrawal order", message: "Creating the withdrawal order…" },
      delivery: { title: "Creating delivery order", message: "Creating the delivery order…" },
    };
    return configs[action] || null;
  }

  async function submitAction(payload) {
    if (!actionState) return;
    const { action, group } = actionState;
    const loadingConfig = action === "edit" ? null : actionLoadingConfig(action, group);
    let loadingStarted = false;
    let loadingSuccessMessage = "Completed successfully.";
    setBusy(true);
    setActionError("");
    if (loadingConfig) {
      startActionLoading(loadingConfig);
      loadingStarted = true;
    }
    try {
      if (action === "edit") {
        const password = text(payload);
        if (!password) throw new Error("Admin password is required.");
        const response = await fetch(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "edit-init", orderIds: group.orderIds, adminPassword: password }),
        });
        const data = await readJson(response);
        if (response.status === 401) throw new Error("Wrong password. Please try again.");
        if (!response.ok) throw new Error(data?.error || "Failed to start editing this order.");
        const items = Array.isArray(data?.items) ? data.items : [];
        const itemsById = Object.fromEntries(items.map((item) => [text(item?.id), item]).filter(([id]) => id));
        setEditMode({
          groupKey: group.key,
          password,
          itemsById,
          products: Array.isArray(data?.products) ? data.products : [],
          statusOptions: Array.isArray(data?.statusOptions) ? data.statusOptions : ["In Progress", "Shipped", "Arrived"],
          changes: {},
          additions: [],
        });
        setActionState(null);
        setActionError("");
        return;
      } else if (action === "approve") {
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, { action: "approval", ids: group.orderIds, decision: "Approved" });
        loadingSuccessMessage = "Order approved by operations.";
        await completeAction("Order approved by operations.", "approved");
      } else if (action === "reject") {
        const reason = text(payload);
        if (!reason) throw new Error("Rejected reason is required.");
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, { action: "approval", ids: group.orderIds, decision: "Rejected", rejectedReason: reason });
        loadingSuccessMessage = group.actionScope === "component" ? "Component rejected and the reason was saved." : "Order rejected and the reason was saved.";
        await completeAction(loadingSuccessMessage, group.actionScope === "component" ? "approved" : "rejected");
      } else if (action === "receive") {
        const quantities = {};
        let hasReceiveQuantity = false;
        group.items.forEach((item) => {
          const id = text(item?.id);
          const receiveNow = Math.min(Math.abs(remainingQuantity(item)), Math.max(0, finite(payload?.quantities?.[id])));
          if (receiveNow > 1e-9) hasReceiveQuantity = true;
          const base = baseQuantity(item);
          const sign = base < 0 ? -1 : 1;
          const absolute = Math.min(Math.abs(base), Math.abs(receivedQuantity(item)) + receiveNow);
          quantities[id] = roundQty(sign * absolute);
        });
        if (!hasReceiveQuantity) throw new Error("Enter the quantity received for at least one component.");
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, {
          action: "mark-shipped",
          orderIds: group.orderIds,
          receiptNumber: text(payload?.receiptNumber) || null,
          issueDescription: text(payload?.issueDescription) || null,
          quantities,
        });
        loadingSuccessMessage = "Components were received by operations.";
        await completeAction("Components were received by operations.", "received");
      } else if (action === "technical-visit") {
        if (payload?.validationError) throw new Error(payload.validationError);
        const perItemIssues = Array.isArray(payload?.perItemIssues) ? payload.perItemIssues : [];
        if (!perItemIssues.length || perItemIssues.some((entry) => !text(entry?.issueDescription))) throw new Error("Issue description is required for every component.");
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, {
          action: "mark-shipped",
          orderIds: group.orderIds,
          receiptNumber: null,
          quantities: {},
          issueDescription: text(payload?.issueDescription) || null,
          perItemIssues,
        });
        loadingSuccessMessage = "Technical visit requested.";
        await completeAction("Technical visit requested.", "received");
      } else if (action === "maintenance-log") {
        const logs = Array.isArray(payload) ? payload : [];
        const logsWithDetails = logs.filter((entry) => text(entry?.serialNumber) || text(entry?.resolutionMethod) || text(entry?.actualIssueDescription) || text(entry?.repairAction) || (Array.isArray(entry?.spareParts) && entry.spareParts.length));
        if (!logsWithDetails.length) throw new Error("Please fill maintenance details for at least one component. Spare parts are optional.");
        await postJson(`${DIRECT_API_BASE}/orders/maintenance/mutations-direct`, {
          action: "log-maintenance",
          orderIds: group.orderIds,
          perItemLogs: logsWithDetails,
          moveToArrived: false,
          moveToShipping: true,
        });
        await refreshOrders();
        setActionState(null);
        setSelected(null);
        setTab("approved");
        loadingSuccessMessage = "Maintenance log saved.";
        setNotice("Maintenance log saved.");
        window.setTimeout(() => setNotice(""), 4000);
      } else if (action === "maintenance-deliver") {
        const files = Array.isArray(payload?.files) ? payload.files : [];
        if (!files.length) throw new Error("Please upload at least one signed report image.");
        const receiptNumbers = (Array.isArray(payload?.receiptNumbers) ? payload.receiptNumbers : [payload?.receiptNumbers]).flatMap((value) => text(value).split(/[\n,]+/)).map((value) => value.trim()).filter(Boolean);
        const requiresReceiptNumbers = group.items.flatMap(normalizeSpareEntries).length > 0;
        if (requiresReceiptNumbers && !receiptNumbers.length) throw new Error("Store receipt number is required.");
        if (receiptNumbers.some((value) => !/^\d+$/.test(value))) throw new Error("Please enter valid store receipt numbers.");
        const dataUrls = await Promise.all(files.map((file) => fileToOptimizedDataUrl(file)));
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, {
          action: "mark-arrived",
          orderIds: group.orderIds,
          orderReceiptDataUrls: dataUrls,
          orderReceiptFilenames: files.map((file, index) => text(file?.name) || `maintenance-report-${index + 1}.jpg`),
          receiptNumbers,
        });
        loadingSuccessMessage = "Maintenance order marked as delivered.";
        await completeAction("Maintenance order marked as delivered.", "delivered");
      } else if (action === "deliver") {
        const files = Array.isArray(payload?.files) ? payload.files : [];
        if (!files.length) throw new Error("Receipt photos are required.");
        const dataUrls = await Promise.all(files.map((file) => fileToOptimizedDataUrl(file)));
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, {
          action: "mark-arrived",
          orderIds: group.orderIds,
          orderReceiptDataUrls: dataUrls,
          orderReceiptFilenames: files.map((file, index) => text(file?.name) || `receipt-photo-${index + 1}.jpg`),
        });
        loadingSuccessMessage = "Order marked as delivered and Stocktaking was synchronized.";
        await completeAction("Order marked as delivered.", "delivered");
      } else if (action === "archive") {
        const password = text(payload);
        if (!password) throw new Error("Admin password is required.");
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, { action: "archive", orderIds: group.orderIds, adminPassword: password });
        loadingSuccessMessage = "Order moved to Archive.";
        await completeAction("Order moved to Archive.", "archive");
      } else if (action === "unarchive") {
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, { action: "unarchive", orderIds: group.orderIds });
        loadingSuccessMessage = "Order restored from Archive.";
        await completeAction("Order restored from Archive.", "approved");
      } else if (action === "withdrawal") {
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, { action: "create-withdrawal", orderIds: group.orderIds });
        loadingSuccessMessage = "Withdrawal order created.";
        await completeAction("Withdrawal order created.", "all");
      } else if (action === "delivery") {
        await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, { action: "create-delivery", orderIds: group.orderIds });
        loadingSuccessMessage = "Delivery order created.";
        await completeAction("Delivery order created.", "all");
      }
      if (loadingStarted) await finishActionLoading("done", loadingSuccessMessage);
    } catch (error) {
      const message = error?.message || "The action could not be completed.";
      if (loadingStarted) await finishActionLoading("failed", message);
      setActionError(message);
    } finally {
      setBusy(false);
    }
  }

  function patchOperationsEditItem(patch) {
    const id = text(patch?.id);
    if (!id) return;
    const editKey = text(patch?.editKey) || id;
    setEditMode((current) => current ? {
      ...current,
      changes: {
        ...(current.changes || {}),
        [editKey]: { ...(current.changes?.[editKey] || {}), ...patch, id, editKey },
      },
    } : current);
  }

  function upsertOperationsEditAddition(patch) {
    if (!patch?.isNew) return;
    setEditMode((current) => {
      if (!current) return current;
      const existing = Array.isArray(current.additions) ? current.additions : [];
      const requestedKey = text(patch?.draftKey);
      const draftKey = requestedKey || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const cleanPatch = { ...patch, draftKey };
      delete cleanPatch.id;
      delete cleanPatch.editKey;
      const index = existing.findIndex((entry) => text(entry?.draftKey) === draftKey);
      const additions = index >= 0
        ? existing.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...cleanPatch } : entry)
        : [...existing, cleanPatch];
      return { ...current, additions };
    });
  }

  async function saveOperationsEdit(changes) {
    if (!editMode || !selected) return;
    const itemUpdates = Object.values(changes || {}).filter((entry) => entry && text(entry?.id));
    const itemAdds = (Array.isArray(editMode?.additions) ? editMode.additions : [])
      .map((entry) => {
        if (!entry || !text(entry?.productId)) return null;
        const clean = { ...entry };
        delete clean.isNew;
        delete clean.draftKey;
        delete clean.id;
        delete clean.editKey;
        return clean;
      })
      .filter(Boolean);
    if (!itemUpdates.length && !itemAdds.length) return;
    setBusy(true);
    setActionError("");
    startActionLoading({ title: "Saving order changes", message: "Updating the selected Operations Orders components…" });
    try {
      await postJson(`${DIRECT_API_BASE}/orders/operations/mutations-direct`, {
        action: "edit-save",
        orderIds: selected.orderIds,
        adminPassword: editMode.password,
        itemUpdates,
        itemAdds,
      });
      await finishActionLoading("done", "Operations order changes were saved.");
      await refreshOrders();
      setEditMode(null);
      setSelected(null);
      setNotice("Operations order changes saved.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (error) {
      const message = error?.message || "Failed to save Operations order changes.";
      await finishActionLoading("failed", message);
      setActionError(message);
    } finally {
      setBusy(false);
    }
  }

  function cancelOperationsEdit() {
    setEditMode(null);
    setActionError("");
  }

  async function exportOrder(options, group, selectedTab) {
    const kind = options?.kind === "excel" ? "excel" : "pdf";
    setBusy(true);
    setActionError("");
    try {
      const endpoint = `${DIRECT_API_BASE}/orders/export-direct`;
      const exportKind = kind === "excel" ? "excel" : (isMaintenance(group.orderType) ? "maintenance-pdf" : "pdf");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scope: "operations", kind: exportKind, orderIds: group.orderIds, tab: selectedTab, columns: options?.columns || [], signatureLabels: options?.signatureLabels || null, instruction: options?.instruction || null, sortMode: options?.sortMode || "product-tag", repeatedComponentMode: options?.repeatedComponentMode || "merge" }),
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
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function openCreatorProfile(anchor, group) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(330, window.innerWidth - 28);
    // Keep the profile visually attached to the clicked creator button.
    const left = Math.min(Math.max(14, rect.right - width), Math.max(14, window.innerWidth - width - 14));
    const gap = 8;
    const belowTop = rect.bottom + gap;
    const belowAvailable = Math.max(0, window.innerHeight - belowTop - 14);
    const aboveAvailable = Math.max(0, rect.top - gap - 14);
    const preferBelow = belowAvailable >= 220 || belowAvailable >= aboveAvailable;
    const maxHeight = Math.max(180, Math.min(520, preferBelow ? belowAvailable : aboveAvailable));
    const top = preferBelow ? belowTop : Math.max(14, rect.top - gap - maxHeight);
    const base = { left, top, maxHeight, name: group.createdByName || "Creator", loading: true, profile: null, error: false };
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
    <section className="next-classic-orders-parity next-classic-operations-parity">
      <ActionLoadingModal state={actionLoading} />
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span></div> : null}
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
          {visibleGroups.length ? visibleGroups.map((group) => <OperationsOrderCard group={group} tab={tab} onOpen={openOrderDetails} onCreator={openCreatorProfile} key={group.key} />) : listLoading ? <div className="ops-no-data-state" role="status" aria-live="polite"><div className="ops-no-data-state__text">Loading orders…</div></div> : <div className="ops-no-data-state" role="status" aria-live="polite"><img className="ops-no-data-state__image" src="/next/images/no-data-illustration.png" alt="" loading="lazy"/><div className="ops-no-data-state__text">Sorry, No data available</div></div>}
        </div>
        {pageInfo?.hasMore ? <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 4px" }}><button type="button" className="ro-action-btn ro-action-btn--light" disabled={listLoading} onClick={() => fetchOrdersPage({ reset: false }).catch((error) => { setNotice(error?.message || "Failed to load more orders."); window.setTimeout(() => setNotice(""), 4000); })}>{listLoading ? "Loading…" : "Load more orders"}</button></div> : null}
      </section>

      {(selected || actionState) ? (
        <OperationsOrdersHeavyModals
          selected={selected}
          tab={tab}
          busy={busy}
          onCloseOrder={() => { setSelected(null); setEditMode(null); }}
          onAction={beginAction}
          onExport={exportOrder}
          editMode={editMode}
          onPatchEditItem={patchOperationsEditItem}
          onUpsertEditAddition={upsertOperationsEditAddition}
          onSaveEdit={saveOperationsEdit}
          onCancelEdit={cancelOperationsEdit}
          actionState={actionState}
          actionError={actionError}
          maintenanceOptions={maintenanceOptions}
          onCancelAction={() => setActionState(null)}
          onSubmitAction={submitAction}
        />
      ) : null}
      <CreatorProfilePopover state={creatorState} onClose={() => setCreatorState(null)} />
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { navigateWithinApp } from "../../lib/client-navigation";
import ClassicOrderIcon from "./ClassicOrderIcon";

const loadCurrentOrdersHeavyModals = () => import("./CurrentOrdersHeavyModals");
const CurrentOrdersHeavyModals = dynamic(loadCurrentOrdersHeavyModals, { ssr: false });

// Direct route handlers live under the configured /next basePath. Keep the
// explicit prefix so client requests stay inside the standalone Next deployment.
const DIRECT_API_BASE = "/next/api";

const STATUS_TABS = [
  { key: "all", label: "All", icon: "layers" },
  { key: "under-supervision", label: "Under S.V", icon: "eye" },
  { key: "approved", label: "Approved", icon: "check-circle" },
  { key: "rejected", label: "Rejected", icon: "x-circle" },
  { key: "remaining", label: "Remaining", icon: "pause-circle" },
  { key: "shipped", label: "Shipping", icon: "truck" },
  { key: "arrived", label: "Arrived", icon: "check-circle" },
  { key: "archive", label: "Archive", icon: "archive" },
];

const ORDER_TYPE_FILTERS = [
  { key: "requestproducts", raw: "Request Products" },
  { key: "withdrawproducts", raw: "Withdraw Products" },
  { key: "requestmaintenance", raw: "Request Maintenance" },
];

const ACTIONS = {
  edit: {
    title: "Edit order",
    description: "Enter admin password to edit this order.",
    button: "Continue",
    endpoint: `${DIRECT_API_BASE}/orders/current/edit-direct`,
    icon: "edit-2",
  },
  archive: {
    title: "Archive order",
    description: "Enter admin password to move this order to the Archive tab.",
    button: "Archive",
    endpoint: `${DIRECT_API_BASE}/orders/current/mutations-direct`,
    icon: "archive",
  },
  unarchive: {
    title: "UnArchive order",
    description: "Enter admin password to restore this order from Archive.",
    button: "UnArchive",
    endpoint: `${DIRECT_API_BASE}/orders/current/mutations-direct`,
    icon: "rotate-ccw",
  },
  delete: {
    title: "Delete order",
    description: "Enter admin password to permanently delete this order.",
    button: "Delete",
    endpoint: `${DIRECT_API_BASE}/orders/current/mutations-direct`,
    icon: "trash-2",
    danger: true,
  },
};

const STATUS_COLORS = {
  "under-supervision": { bg: "#FFEDD5", fg: "#9A3412", bd: "#FED7AA" },
  approved: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
  rejected: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
  remaining: { bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
  shipped: { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" },
  arrived: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
  archive: { bg: "#EDE9FE", fg: "#6D28D9", bd: "#DDD6FE" },
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
  const number = Math.round(finite(value) * 1000) / 1000;
  return Number.isInteger(number) ? String(number) : String(number);
}

function supervisorEditedQuantity(item) {
  return item?.quantityEditedBySupervisor ?? item?.quantity_edited_by_supervisor ?? item?.quantityProgress ?? item?.quantity_progress;
}

function baseQuantity(item) {
  const edited = supervisorEditedQuantity(item);
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  const original = item?.quantityRequested ?? item?.quantity_requested;
  if (original !== null && original !== undefined && original !== "") return finite(original);
  return finite(item?.quantity);
}

function receivedQuantity(item) {
  const value = item?.quantityReceived ?? item?.quantity_received_by_operations;
  if (value === null || value === undefined || value === "") return 0;
  return finite(value);
}

function remainingQuantity(item) {
  const base = baseQuantity(item);
  const received = receivedQuantity(item);
  const storedRaw = item?.quantityRemaining ?? item?.quantity_remaining;
  const stored = storedRaw === null || storedRaw === undefined || storedRaw === "" ? null : finite(storedRaw);
  const edited = Boolean(item?.quantityReceivedEdited ?? item?.quantity_received_edited);
  if (stored !== null) {
    if (!edited && Math.abs(base) > 1e-9 && Math.abs(received) < 1e-9 && Math.abs(stored) < 1e-9) return base;
    return stored;
  }
  return base - received;
}

function effectiveQuantity(item) {
  return baseQuantity(item);
}

function itemTotal(item) {
  return effectiveQuantity(item) * finite(item?.unitPrice ?? item?.unit_price ?? item?.price);
}

function hasPartialRemaining(item) {
  if (statusIndex(item?.status) !== 3) return false;
  const base = Math.abs(baseQuantity(item));
  const received = Math.abs(receivedQuantity(item));
  const remaining = Math.abs(remainingQuantity(item));
  return base > 1e-9 && received > 1e-9 && remaining > 1e-9 && remaining < base - 1e-9;
}

function orderTypeKey(value) {
  return lower(value).replace(/[^a-z0-9]/g, "");
}

function notionColorVars(value) {
  const map = {
    default: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" },
    gray: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" },
    brown: { bg: "#F3E8E2", fg: "#6B4F3A", bd: "#E7D3C8" },
    orange: { bg: "#FFEDD5", fg: "#9A3412", bd: "#FED7AA" },
    yellow: { bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
    green: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
    blue: { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" },
    purple: { bg: "#EDE9FE", fg: "#6D28D9", bd: "#DDD6FE" },
    pink: { bg: "#FCE7F3", fg: "#BE185D", bd: "#FBCFE8" },
    red: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
  };
  const key = lower(value).replace(/_background$/i, "") || "default";
  return map[key] || map.default;
}

function orderTypeMeta(value, color) {
  const key = orderTypeKey(value);
  if (key === "requestproducts") return { label: "Request Products", icon: "shopping-cart", bg: "#DCFCE7", fg: "#166534", bd: "#86EFAC" };
  if (key === "withdrawproducts") return { label: "Withdraw Products", icon: "log-out", bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" };
  if (key === "requestmaintenance") return { label: "Request Maintenance", icon: "tool", bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" };
  const fallback = notionColorVars(color);
  return { label: text(value) || "Order", icon: "package", ...fallback };
}

function orderTypeHeaderTitle(value, color, fallback = "Order") {
  const key = orderTypeKey(value);
  if (key === "requestproducts") return "Request";
  if (key === "withdrawproducts") return "Withdrawal";
  if (key === "requestmaintenance") return "Maintenance";
  const label = orderTypeMeta(value, color).label;
  return label && label !== "Order" ? label : fallback;
}

function isMaintenanceOrder(value) {
  return orderTypeKey(value) === "requestmaintenance";
}

function statusIndex(value) {
  const status = lower(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress)/.test(status)) return 2;
  return 1;
}

function approvalState(value) {
  const state = lower(value).replace(/[_.-]+/g, " ");
  if (state.includes("reject")) return "rejected";
  if (state.includes("approv")) return "approved";
  return "";
}

function rejectedReason(item) {
  return text(item?.rejectedReason ?? item?.rejected_reason);
}

function statusTabForItem(item) {
  const idx = statusIndex(item?.status);
  const supervisor = approvalState(item?.svApproval ?? item?.sv_approval);
  const operations = approvalState(item?.operationsApproval ?? item?.operations_approval);

  if (idx >= 5) return "archive";
  if (supervisor === "rejected" || operations === "rejected" || rejectedReason(item)) return "rejected";
  if (idx >= 4) return "arrived";
  if (idx >= 3) return "shipped";
  if (supervisor === "approved" || operations === "approved" || idx >= 2) return "approved";
  return "under-supervision";
}

function statusLabel(tab) {
  const labels = {
    "under-supervision": "Under Supervision",
    approved: "Approved",
    rejected: "Rejected",
    remaining: "Remaining",
    shipped: "Shipping",
    arrived: "Arrived",
    archive: "Archive",
  };
  return labels[tab] || "Order";
}

function groupKey(item) {
  const number = Number(item?.orderIdNumber);
  if (Number.isFinite(number)) return `order:${number}`;
  const reason = lower(item?.reason);
  return reason ? `reason:${reason}` : `row:${text(item?.id)}`;
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

function dominantStatus(items) {
  const tabs = items.map(statusTabForItem);
  if (tabs.length && tabs.every((tab) => tab === "archive")) return "archive";
  if (tabs.includes("arrived")) return "arrived";
  if (tabs.includes("shipped")) return "shipped";
  if (tabs.includes("rejected")) return "rejected";
  if (tabs.includes("approved")) return "approved";
  return "under-supervision";
}

function hasMixedApprovedRejected(items) {
  const tabs = items.map(statusTabForItem);
  return tabs.includes("approved") && tabs.includes("rejected");
}

function receiptEntriesFromItem(item) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}, fallbackIndex = 0) => {
    const url = text(entry?.url ?? entry?.rawUrl ?? entry?.raw);
    const name = text(entry?.name ?? entry?.filename) || `Receipt photo ${fallbackIndex + 1}`;
    if (!url) return;
    const key = `${url}|${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ name, url });
  };

  const direct = Array.isArray(item?.orderReceiptEntries) ? item.orderReceiptEntries : [];
  direct.forEach((entry, index) => add(entry, index));

  const urls = Array.isArray(item?.orderReceiptUrls) ? item.orderReceiptUrls : [item?.orderReceiptUrl];
  const names = Array.isArray(item?.orderReceiptNames) ? item.orderReceiptNames : [item?.orderReceiptName];
  urls.filter(Boolean).forEach((url, index) => add({ url, name: names[index] }, index));
  return entries;
}

function buildGroups(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => dateValue(b?.createdTime) - dateValue(a?.createdTime));
  const map = new Map();

  for (const item of sorted) {
    const key = groupKey(item);
    if (!map.has(key)) {
      map.set(key, {
        key,
        representativeId: text(item?.id),
        items: [],
        latestCreated: item?.createdTime,
        orderType: item?.orderType,
        orderTypeColor: item?.orderTypeColor,
        createdByName: item?.createdByName,
      });
    }
    const group = map.get(key);
    group.items.push(item);
    if (dateValue(item?.createdTime) > dateValue(group.latestCreated)) {
      group.latestCreated = item?.createdTime;
      group.representativeId = text(item?.id);
    }
    if (!group.orderType && item?.orderType) group.orderType = item.orderType;
    if (!group.orderTypeColor && item?.orderTypeColor) group.orderTypeColor = item.orderTypeColor;
    if (!group.createdByName && item?.createdByName) group.createdByName = item.createdByName;
  }

  return [...map.values()].map((group) => {
    const reasons = group.items.map((item) => text(item?.reason)).filter(Boolean);
    const counts = reasons.reduce((acc, reason) => acc.set(reason, (acc.get(reason) || 0) + 1), new Map());
    const reason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "No reason";
    const stage = Math.max(...group.items.map((item) => statusIndex(item?.status)), 1);
    const hasRemaining = group.items.some((item) => Math.abs(remainingQuantity(item)) > 1e-9);
    const hasReceived = group.items.some((item) => Math.abs(receivedQuantity(item)) > 1e-9);
    const operationsNames = [...new Set(group.items.map((item) => text(item?.operationsByName)).filter(Boolean))];
    const receiptEntries = [];
    const receiptSeen = new Set();
    group.items.flatMap(receiptEntriesFromItem).forEach((entry) => {
      const key = `${entry.url}|${entry.name}`;
      if (receiptSeen.has(key)) return;
      receiptSeen.add(key);
      receiptEntries.push(entry);
    });
    let status = dominantStatus(group.items);
    if (stage === 3) status = hasRemaining && !isMaintenanceOrder(group.orderType) ? "remaining" : "shipped";
    return {
      ...group,
      reason,
      stage,
      hasRemaining,
      hasReceived,
      orderIdLabel: orderIdLabel(group.items),
      orderIds: group.items.map((item) => text(item?.id)).filter(Boolean),
      total: group.items.reduce((sum, item) => sum + itemTotal(item), 0),
      receivedTotal: group.items.reduce((sum, item) => sum + Math.abs(receivedQuantity(item)) * Math.abs(finite(item?.unitPrice ?? item?.unit_price ?? item?.price)), 0),
      remainingTotal: group.items.reduce((sum, item) => sum + Math.abs(remainingQuantity(item)) * Math.abs(finite(item?.unitPrice ?? item?.unit_price ?? item?.price)), 0),
      operationsByName: operationsNames.length === 1 ? operationsNames[0] : operationsNames.length ? "Multiple" : "",
      receiptEntries,
      status,
    };
  }).sort((a, b) => dateValue(b.latestCreated) - dateValue(a.latestCreated));
}

function groupSearchText(group) {
  return [
    group.orderIdLabel,
    group.reason,
    group.createdByName,
    group.orderType,
    ...group.items.flatMap((item) => [item?.productName, item?.reason, item?.orderId, item?.createdByName]),
  ].map(text).join(" ").toLowerCase();
}

function itemsForCurrentTab(items, tab) {
  const source = Array.isArray(items) ? items : [];
  if (tab === "remaining") return source.filter((item) => Math.abs(remainingQuantity(item)) > 1e-9);
  if (tab === "shipped") return source.filter((item) => Math.abs(receivedQuantity(item)) > 1e-9);
  return source;
}

function groupsForCurrentTab(groups, orders, tab) {
  if (tab === "all") return groups;
  if (tab === "remaining") {
    return groups.filter((group) => group.stage === 3 && !isMaintenanceOrder(group.orderType) && group.hasRemaining);
  }
  if (tab === "shipped") {
    return groups.filter((group) => group.stage === 3 && (isMaintenanceOrder(group.orderType) || group.hasReceived));
  }
  const scopedRows = (Array.isArray(orders) ? orders : []).filter((item) => statusTabForItem(item) === tab);
  return buildGroups(scopedRows);
}

function progressIndex(group) {
  const indexes = group.items.map((item) => Math.min(4, statusIndex(item?.status)));
  return Math.max(1, ...indexes);
}

function writeEditTransfer(data, group) {
  try {
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) return "";
    const reason = text(data?.reason || group?.reason);
    const orderType = text(data?.orderType || group?.orderType);
    const patched = products.map((item) => ({ ...item, reason: text(item?.reason) || reason }));
    const editKey = `current-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payload = JSON.stringify({
      products: patched,
      reason,
      orderType,
      editToken: text(data?.editToken),
      source: text(data?.source) || "current-orders-next",
      ts: Date.now(),
    });
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
  const activeOption = options.find((option) => option.key === value);
  const totalOrders = options.reduce((sum, option) => sum + finite(option.count), 0);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
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
        <span className="orders-type-filter__button-label">{value === "all" ? "Filter" : activeOption?.label || "Filter"}</span>
        {value !== "all" ? <span className="orders-type-filter__button-dot" /> : null}
      </button>
      {open ? (
        <div className="orders-type-filter__panel" role="menu" aria-label="Filter current orders by type">
          <div className="orders-type-filter__panel-head">
            <span className="orders-type-filter__panel-title">Order type</span>
            <span className="orders-type-filter__panel-sub">{totalOrders} order{totalOrders === 1 ? "" : "s"}</span>
          </div>
          <div className="orders-type-filter__options">
            <button type="button" className={`orders-type-filter__option ${value === "all" ? "is-active" : ""}`} onClick={() => { onChange("all"); setOpen(false); }}>
              <span className="orders-type-filter__option-icon"><ClassicOrderIcon name="layers" /></span>
              <span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">All order types</span><span className="orders-type-filter__option-sub">{totalOrders} order{totalOrders === 1 ? "" : "s"}</span></span>
              <span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span>
            </button>
            {options.map((option) => {
              const meta = orderTypeMeta(option.raw, option.color);
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

function MixedStatusPill() {
  return (
    <span className="co-status-btn sv-mixed-approval-pill" aria-label="Approved and Rejected">
      <span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--approved">Approved</span>
      <span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--rejected">Rejected</span>
    </span>
  );
}

function StatusPill({ status, className = "co-status-btn", reason = "", onReason }) {
  const vars = STATUS_COLORS[status] || notionColorVars("default");
  const style = { "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd };
  if (status === "rejected" && reason && onReason) {
    return <button type="button" className={`${className} rejected-reason-trigger`} style={style} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReason(reason); }}>{statusLabel(status)}</button>;
  }
  return <span className={className} style={style}>{statusLabel(status)}</span>;
}

function OrderCard({ group, activeTab, onOpen, onReason }) {
  const type = orderTypeMeta(group.orderType, group.orderTypeColor);
  const thumbStyle = { "--co-thumb-bg": type.bg, "--co-thumb-fg": type.fg, "--co-thumb-border": type.bd };
  const reasons = [...new Set(group.items.map(rejectedReason).filter(Boolean))].join("\n");
  const mixed = activeTab === "all" && group.stage === 2 && hasMixedApprovedRejected(group.items);
  const displayItems = itemsForCurrentTab(group.items, activeTab);
  const displayStatus = activeTab === "remaining" ? "remaining" : activeTab === "shipped" ? "shipped" : group.status;
  const displayTotal = activeTab === "remaining" ? group.remainingTotal : activeTab === "shipped" ? group.receivedTotal : group.total;
  const progress = group.status === "archive" ? 100 : Math.min(100, progressIndex(group) * 25);

  return (
    <article
      className="co-card next-current-order-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${group.orderIdLabel}`}
      onClick={() => onOpen(group)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(group); } }}
    >
      <div className="co-top">
        <div className="co-thumb co-thumb--order-type" style={thumbStyle} title={type.label} aria-label={type.label}><ClassicOrderIcon name={type.icon} /></div>
        <div className="co-main">
          <div className="co-title">{group.orderIdLabel}</div>
          <div className="next-current-order-meta">
            <span className="co-sub">{formatDate(group.latestCreated)}</span>
          </div>
        </div>
        <div className="co-qty" title={`${displayItems.length} component${displayItems.length === 1 ? "" : "s"}`}>x{displayItems.length}</div>
      </div>
      <div className="co-divider" />
      <div className="co-bottom">
        <div className="co-est"><div className="co-est-label">Estimate Total</div><div className="co-est-value">{formatMoney(displayTotal)}</div></div>
        <div className="co-actions">
          {mixed ? <MixedStatusPill /> : <StatusPill status={displayStatus} reason={reasons} onReason={onReason} />}
          <span className="next-current-order-progress next-current-order-progress--icon-only" aria-label={`${progress}% workflow progress`} title={`${progress}% workflow progress`}>
            <ClassicOrderIcon name="percent" />
          </span>
        </div>
      </div>
    </article>
  );
}

function ProgressTrack({ value }) {
  const icons = ["eye", "activity", "truck", "home"];
  const safe = Math.min(4, Math.max(1, Number(value) || 1));
  return (
    <div className="co-track-pill" role="img" aria-label="Order progress">
      {icons.map((icon, index) => {
        const step = index + 1;
        return (
          <span className="next-classic-track-fragment" key={icon}>
            <span className={`co-track-step ${step <= safe ? "is-active" : ""} ${step === safe ? "is-current" : ""}`}><ClassicOrderIcon name={icon} /></span>
            {step < 4 ? <span className={`co-track-conn ${step < safe ? "is-active" : ""}`} /> : null}
          </span>
        );
      })}
    </div>
  );
}


export default function CurrentOrdersClient({ initialOrders = [], initialPageInfo = null, bootstrapWarnings = [] }) {
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
  const [reasonView, setReasonView] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const orderDetailsCache = useRef(new Map());
  const listRequestRef = useRef(0);
  const listAbortRef = useRef(null);
  const initialFilterKeyRef = useRef("all|all|");

  useClassicHeaderSearch(query, setQuery, "Search orders by reason...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (STATUS_TABS.some((item) => item.key === requestedTab)) setTab(requestedTab);
    const requestedType = params.get("type");
    if (requestedType) setType(requestedType);
    const requestedQuery = params.get("q");
    if (requestedQuery) setQuery(requestedQuery);
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
        setNotice(error?.message || "Failed to load Current Orders.");
        window.setTimeout(() => setNotice(""), 4000);
      });
    }, query.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [tab, type, query]);

  const allGroups = useMemo(() => buildGroups(orders), [orders]);
  const statusGroups = useMemo(() => groupsForCurrentTab(allGroups, orders, tab), [allGroups, orders, tab]);
  const typeOptions = useMemo(() => {
    const counts = new Map();
    const sample = new Map();
    for (const group of statusGroups) {
      const key = orderTypeKey(group.orderType) || "other";
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!sample.has(key)) sample.set(key, group);
    }

    const preferred = ORDER_TYPE_FILTERS.map((definition) => {
      const group = sample.get(definition.key);
      const raw = group?.orderType || definition.raw;
      const color = group?.orderTypeColor || "";
      const meta = orderTypeMeta(raw, color);
      return { key: definition.key, raw, color, label: meta.label, count: counts.get(definition.key) || 0 };
    });

    const known = new Set(ORDER_TYPE_FILTERS.map((definition) => definition.key));
    const extras = [...sample.entries()]
      .filter(([key]) => !known.has(key))
      .map(([key, group]) => {
        const meta = orderTypeMeta(group.orderType, group.orderTypeColor);
        return { key, raw: group.orderType, color: group.orderTypeColor, label: meta.label, count: counts.get(key) || 0 };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return [...preferred, ...extras];
  }, [statusGroups]);

  const visibleGroups = useMemo(() => {
    const needle = lower(query);
    const serverFilteredQuery = Boolean(needle)
      && pageInfo?.serverFiltered === true
      && lower(pageInfo?.query) === needle;
    return statusGroups.filter((group) => {
      if (type !== "all" && (orderTypeKey(group.orderType) || "other") !== type) return false;
      return !needle || serverFilteredQuery || groupSearchText(group).includes(needle);
    });
  }, [statusGroups, type, query, pageInfo]);

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

      const response = await fetch(`${DIRECT_API_BASE}/orders/current/paged-summary?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/orders";
        return;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to load Current Orders.");
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
    void loadCurrentOrdersHeavyModals();
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
      const response = await fetch(`${DIRECT_API_BASE}/orders/current/details-direct`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: group.orderIds }),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/orders";
        return;
      }
      const data = await response.json().catch(() => null);
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

  function beginAction(action, group) {
    setActionError("");
    setActionState({ action, group });
  }

  async function runProtectedAction(action, group, password) {
    const config = ACTIONS[action];
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, orderIds: group.orderIds, adminPassword: password }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      const error = new Error("Wrong password. Please try again.");
      error.status = 401;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(data?.error || `Failed to ${action} order.`);
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
        const editKey = writeEditTransfer(data, group);
        const editUrl = new URL("/next/orders/new", window.location.origin);
        editUrl.searchParams.set("edit", "1");
        if (data?.orderType) editUrl.searchParams.set("type", String(data.orderType));
        if (editKey) editUrl.searchParams.set("editKey", editKey);
        navigateWithinApp(`${editUrl.pathname}${editUrl.search}`);
        return;
      }

      await refreshOrders();
      setActionState(null);
      setSelected(null);
      setNotice(action === "archive" ? "Order moved to Archive." : "Order restored from Archive.");
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
      setNotice("Order deleted successfully.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (error) {
      setDeleteConfirm(null);
      setActionState({ action: "delete", group });
      setActionError(error?.message || "The order could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOrder(options, group) {
    const kind = options?.kind === "excel" ? "excel" : "pdf";
    const endpoint = `${DIRECT_API_BASE}/orders/export-direct`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        scope: "current",
        kind,
        orderIds: group.orderIds,
        columns: options?.columns || [],
        instruction: options?.instruction || null,
        signatureLabels: options?.signatureLabels || null,
        sortMode: options?.sortMode || "product-tag",
        repeatedComponentMode: options?.repeatedComponentMode || "merge",
      }),
    });
    if (response.status === 401) {
      window.location.href = "/login?next=/next/orders";
      throw new Error("Your session expired.");
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || `Failed to export ${kind.toUpperCase()}.`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${group.orderIdLabel.replace(/[^a-z0-9_-]+/gi, "-") || "order"}.${kind === "excel" ? "xlsx" : "pdf"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`${kind.toUpperCase()} downloaded.`);
    window.setTimeout(() => setNotice(""), 3000);
  }

  return (
    <section className="next-classic-orders-parity">
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span></div> : null}
      {notice ? <div className="orders-parity-success" role="status"><ClassicOrderIcon name="check-circle" />{notice}</div> : null}

      <div className="next-current-orders-toolbar-wrap">
        <div className="orders-toolbar" aria-label="Current orders tools">
          <div className="orders-toolbar__scroll">
            <div className="portfolio-tabs portfolio-tabs--iconic" role="tablist" aria-label="Current Orders status">
              {STATUS_TABS.map((item) => (
                <button type="button" className={`tab-portfolio order-status-tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}>
                  <span className="order-status-tab__icon"><ClassicOrderIcon name={item.icon} /></span>
                  <span className="order-status-tab__copy">
                    <span className="order-status-tab__label">{item.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="orders-toolbar__divider" aria-hidden="true" />
          <TypeFilter value={type} options={typeOptions} onChange={setType} />
        </div>
      </div>

      <section className="card" id="current-orders">
        <div className="co-cards" id="orders-list">
          {visibleGroups.length ? visibleGroups.map((group) => <OrderCard group={group} activeTab={tab} onOpen={openOrderDetails} onReason={(reason) => { void loadCurrentOrdersHeavyModals(); setReasonView(reason); }} key={group.key} />) : listLoading ? (
            <div className="ops-no-data-state" role="status" aria-live="polite"><div className="ops-no-data-state__text">Loading orders…</div></div>
          ) : (
            <div className="ops-no-data-state" role="status" aria-live="polite"><img className="ops-no-data-state__image" src="/next/images/no-data-illustration.png" alt="" loading="lazy"/><div className="ops-no-data-state__text">Sorry, No data available</div></div>
          )}
        </div>
        {pageInfo?.hasMore ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 4px" }}>
            <button
              type="button"
              className="ro-action-btn ro-action-btn--light"
              disabled={listLoading}
              onClick={() => fetchOrdersPage({ reset: false }).catch((error) => {
                setNotice(error?.message || "Failed to load more orders.");
                window.setTimeout(() => setNotice(""), 4000);
              })}
            >
              {listLoading ? "Loading…" : "Load more orders"}
            </button>
          </div>
        ) : null}
      </section>

      {(selected || actionState || deleteConfirm || reasonView) ? (
        <CurrentOrdersHeavyModals
          selected={selected}
          tab={tab}
          busy={busy}
          onCloseSelected={() => setSelected(null)}
          onAction={beginAction}
          onReason={setReasonView}
          onExport={exportOrder}
          actionState={actionState}
          actionError={actionError}
          onCancelAction={() => { if (!busy) { setActionState(null); setActionError(""); } }}
          onSubmitAction={submitAction}
          deleteConfirm={deleteConfirm}
          onCancelDelete={() => { if (!busy) setDeleteConfirm(null); }}
          onConfirmDelete={confirmDelete}
          reasonView={reasonView}
          onCloseReason={() => setReasonView("")}
        />
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { groupOrderItems, OrderGroupHeader, OrderSortButton } from "./OrderGrouping";
import OrderDownloadModal from "./OrderDownloadModal";

const STATUS_TABS = [
  { key: "all", label: "All", icon: "layers" },
  { key: "under-supervision", label: "Under S.V", icon: "eye" },
  { key: "approved", label: "Approved", icon: "check-circle" },
  { key: "rejected", label: "Rejected", icon: "x-circle" },
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
    endpoint: "/api/orders/current/edit/init",
    icon: "edit-2",
  },
  archive: {
    title: "Archive order",
    description: "Enter admin password to move this order to the Archive tab.",
    button: "Archive",
    endpoint: "/api/orders/current/archive",
    icon: "archive",
  },
  unarchive: {
    title: "UnArchive order",
    description: "Enter admin password to restore this order from Archive.",
    button: "UnArchive",
    endpoint: "/api/orders/current/unarchive",
    icon: "rotate-ccw",
  },
  delete: {
    title: "Delete order",
    description: "Enter admin password to permanently delete this order.",
    button: "Delete",
    endpoint: "/api/orders/current/delete",
    icon: "trash-2",
    danger: true,
  },
};

const STATUS_COLORS = {
  "under-supervision": { bg: "#FFEDD5", fg: "#9A3412", bd: "#FED7AA" },
  approved: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
  rejected: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
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

function effectiveQuantity(item) {
  const edited = supervisorEditedQuantity(item);
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  return finite(item?.quantityRequested ?? item?.quantity);
}

function itemTotal(item) {
  return effectiveQuantity(item) * finite(item?.unitPrice ?? item?.unit_price ?? item?.price);
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
    return {
      ...group,
      reason,
      orderIdLabel: orderIdLabel(group.items),
      orderIds: group.items.map((item) => text(item?.id)).filter(Boolean),
      total: group.items.reduce((sum, item) => sum + itemTotal(item), 0),
      status: dominantStatus(group.items),
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

function progressIndex(group) {
  const indexes = group.items.map((item) => Math.min(4, statusIndex(item?.status)));
  return Math.max(1, ...indexes);
}

function writeEditTransfer(data, group) {
  try {
    const products = Array.isArray(data?.products) ? data.products : [];
    if (!products.length) return "";
    const reason = text(group?.reason);
    const orderType = text(data?.orderType || group?.orderType);
    const patched = products.map((item) => ({ ...item, reason: text(item?.reason) || reason }));
    const editKey = `current-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payload = JSON.stringify({ products: patched, reason, orderType, source: "current-orders-next", ts: Date.now() });
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
  const mixed = activeTab === "all" && hasMixedApprovedRejected(group.items);
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
        <div className="co-qty" title={`${group.items.length} component${group.items.length === 1 ? "" : "s"}`}>x{group.items.length}</div>
      </div>
      <div className="co-divider" />
      <div className="co-bottom">
        <div className="co-est"><div className="co-est-label">Estimate Total</div><div className="co-est-value">{formatMoney(group.total)}</div></div>
        <div className="co-actions">
          {mixed ? <MixedStatusPill /> : <StatusPill status={group.status} reason={reasons} onReason={onReason} />}
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

function OrderDetailsModal({ group, busy, onClose, onAction, onReason, onExport }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortMode, setSortMode] = useState("product-tag");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (downloadOpen) {
        event.preventDefault();
        setDownloadOpen(false);
        return;
      }
      if (moreOpen) {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }
      onClose();
    };
    const onPointerDown = (event) => {
      if (moreOpen && !moreRef.current?.contains(event.target)) setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.body.classList.add("co-modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.body.classList.remove("co-modal-open");
    };
  }, [group, moreOpen, downloadOpen, onClose]);

  useEffect(() => { setMoreOpen(false); setDownloadOpen(false); setSortMode("product-tag"); }, [group?.key]);
  if (!group) return null;

  const archived = group.status === "archive";
  const maintenance = isMaintenanceOrder(group.orderType);
  const headerTitle = orderTypeHeaderTitle(group.orderType, group.orderTypeColor, statusLabel(group.status));
  const groupedItems = groupOrderItems(group.items, sortMode);
  const reasons = [...new Set(group.items.map(rejectedReason).filter(Boolean))].join("\n");

  const menuAction = (action) => {
    setMoreOpen(false);
    onAction(action, group);
  };

  const renderItem = (item, index) => {
    const qtyRequested = finite(item?.quantityRequested ?? item?.quantity_requested ?? item?.quantity);
    const qtyEditedRaw = supervisorEditedQuantity(item);
    const hasEdited = qtyEditedRaw !== null && qtyEditedRaw !== undefined && qtyEditedRaw !== "" && finite(qtyEditedRaw) !== qtyRequested;
    const qty = effectiveQuantity(item);
    const itemStatus = statusTabForItem(item);
    const itemReason = rejectedReason(item);
    const safeUrl = text(item?.productUrl);
    return (
      <div className="co-item" key={text(item?.id) || index}>
        <div className="co-item-left">
          <div className="co-item-title">
            <div className="co-item-name">{text(item?.productName) || "Unknown Product"}</div>
            {/^[hH][tT][tT][pP][sS]?:\/\//.test(safeUrl) ? <a className="co-item-link" href={safeUrl} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open component link"><ClassicOrderIcon name="external-link" /></a> : null}
          </div>
          {!maintenance ? <div className="co-item-sub">Unit: {formatMoney(item?.unitPrice)} · Total: {formatMoney(itemTotal(item))}</div> : null}
        </div>
        <div className="co-item-right">
          {maintenance ? <div className="co-item-issue-desc">{text(item?.issueDescription || item?.reason) || "—"}</div> : <div className="co-item-total">Qty: {hasEdited ? <span className="sv-qty-diff"><span className="sv-qty-old">{formatQuantity(qtyRequested)}</span><strong className="sv-qty-new">{formatQuantity(qty)}</strong></span> : <strong>{formatQuantity(qtyRequested)}</strong>}</div>}
          <StatusPill status={itemStatus} className="co-item-status" reason={itemReason} onReason={onReason} />
        </div>
      </div>
    );
  };

  return (
    <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="co-modal-dialog" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} details`}>
        <div className="co-modal-more" ref={moreRef}>
          <button type="button" className="co-modal-more-btn" aria-label="Order actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((state) => !state)}><span className="co-modal-more-dots" aria-hidden="true">⋮</span></button>
          {moreOpen ? (
            <div className="co-modal-more-panel" role="menu" aria-label="Order actions">
              {!archived ? <button type="button" className="co-modal-more-item" onClick={() => menuAction("edit")}><ClassicOrderIcon name="edit-2" /><span>Edit</span></button> : null}
              {!archived ? <button type="button" className="co-modal-more-item" onClick={() => menuAction("archive")}><ClassicOrderIcon name="archive" /><span>Archive</span></button> : null}
              {archived ? <button type="button" className="co-modal-more-item" onClick={() => menuAction("unarchive")}><ClassicOrderIcon name="rotate-ccw" /><span>UnArchive</span></button> : null}
              <button type="button" className="co-modal-more-item co-modal-more-item--danger" onClick={() => menuAction("delete")}><ClassicOrderIcon name="trash-2" /><span>Delete</span></button>
            </div>
          ) : null}
        </div>
        <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />

        <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">{headerTitle}</div><div className="co-modal-status-sub" hidden /></div></div>
        <div className="next-current-order-modal-summary" aria-label="Order summary">
          <div><span>Order</span><strong>{group.orderIdLabel}</strong></div>
          <div><span>Date</span><strong>{formatDate(group.latestCreated)}</strong></div>
          <div><span>Components</span><strong>{group.items.length}</strong></div>
          <div className="next-current-order-modal-summary__status"><span>Status</span>{hasMixedApprovedRejected(group.items) ? <MixedStatusPill /> : <StatusPill status={group.status} reason={reasons} onReason={onReason} />}</div>
        </div>
        <ProgressTrack value={archived ? 4 : progressIndex(group)} />

        <div className="co-modal-body">
          {!maintenance ? <div className="co-modal-meta"><div className="co-meta-row co-meta-row--reason"><span>Reason</span><strong>{group.reason}</strong></div></div> : null}
          <div className="co-modal-actions ro-actions ro-actions--right order-group-sort-actions">
            <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => setDownloadOpen(true)} disabled={busy}><ClassicOrderIcon name="download" /><span>Download</span></button>
            <OrderSortButton value={sortMode} onChange={setSortMode} />
          </div>
          <div className="co-modal-items order-component-groups">
            {groupedItems.length ? groupedItems.map((section) => (
              <section className="order-component-group" key={`${section.folderName || "products"}:${section.tag}`}>
                <OrderGroupHeader group={section} mode={sortMode} />
                <div className="order-component-group__items">{section.items.map(renderItem)}</div>
              </section>
            )) : <div className="muted">No items.</div>}
          </div>
        </div>
        <OrderDownloadModal
          open={downloadOpen}
          title={`Download ${group.orderIdLabel}`}
          onClose={() => setDownloadOpen(false)}
          onDownload={(options) => onExport({ ...options, sortMode }, group)}
        />
      </div>
    </div>
  );
}

function PasswordModal({ state, busy, error, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  useEffect(() => setPassword(""), [state?.action, state?.group?.key]);
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, onCancel]);
  if (!state) return null;
  const config = ACTIONS[state.action];
  return (
    <div className="co-submodal-overlay is-open req-edit-modal" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <form className="co-submodal-dialog req-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
        <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close admin password dialog" />
        <div className="co-submodal-header req-edit-header">
          <div className={`req-edit-icon ${config.danger ? "req-edit-icon--danger" : ""}`} aria-hidden="true"><ClassicOrderIcon name={config.icon || "shield"} /></div>
          <div><div className="co-submodal-title">{config.title}</div><div className="co-submodal-sub">{config.description}</div></div>
        </div>
        <div className="co-submodal-body">
          <label className="co-submodal-label" htmlFor="current-order-admin-password">Admin password</label>
          <input id="current-order-admin-password" className="co-submodal-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" placeholder="••••••••" disabled={busy} />
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

function RejectedReasonModal({ reason, onClose }) {
  if (!reason) return null;
  return (
    <div className="co-submodal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="co-submodal-dialog reject-reason-dialog" role="dialog" aria-modal="true" aria-label="Rejected reason">
        <button type="button" className="co-submodal-close" onClick={onClose} aria-label="Close rejected reason" />
        <div className="co-submodal-header req-edit-header"><div className="req-edit-icon req-edit-icon--danger" aria-hidden="true"><ClassicOrderIcon name="x-circle" /></div><div><div className="co-submodal-title">Rejected reason</div><div className="co-submodal-sub">Reason saved with this rejected component.</div></div></div>
        <div className="co-submodal-body"><div className="rejected-reason-view-text">{reason}</div></div>
        <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--dark" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

function DeleteConfirmationModal({ state, busy, onCancel, onConfirm }) {
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, onCancel]);

  if (!state) return null;
  const count = state.group?.items?.length || state.group?.orderIds?.length || 1;
  return (
    <div className="co-confirm-overlay is-open next-current-order-delete-confirm" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <div className="co-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="currentOrderDeleteTitle" aria-describedby="currentOrderDeleteMessage">
        <div className="co-confirm-icon" aria-hidden="true"><ClassicOrderIcon name="trash-2" /></div>
        <div className="co-confirm-title" id="currentOrderDeleteTitle">Delete {state.group?.orderIdLabel || "order"}?</div>
        <div className="co-confirm-message" id="currentOrderDeleteMessage">
          You’re going to permanently delete this order and its {count} saved component{count === 1 ? "" : "s"}. This action cannot be undone.
        </div>
        <div className="co-confirm-actions">
          <button type="button" className="co-confirm-btn co-confirm-btn--light" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="co-confirm-btn co-confirm-btn--dark next-current-order-delete-confirm__danger" onClick={onConfirm} disabled={busy}>{busy ? "Deleting…" : "Delete permanently"}</button>
        </div>
      </div>
    </div>
  );
}

export default function CurrentOrdersClient({ initialOrders = [], bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
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

  const statusRows = useMemo(() => tab === "all" ? orders : orders.filter((item) => statusTabForItem(item) === tab), [orders, tab]);
  const statusGroups = useMemo(() => buildGroups(statusRows), [statusRows]);
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
    return statusGroups.filter((group) => {
      if (type !== "all" && (orderTypeKey(group.orderType) || "other") !== type) return false;
      return !needle || groupSearchText(group).includes(needle);
    });
  }, [statusGroups, type, query]);

  async function refreshOrders() {
    const response = await fetch("/api/orders?_fresh=1", { credentials: "include", cache: "no-store" });
    if (response.status === 401) {
      window.location.href = "/login?next=/next/orders";
      return;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Failed to refresh orders.");
    setOrders(Array.isArray(data) ? data : []);
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
      body: JSON.stringify({ orderIds: group.orderIds, adminPassword: password }),
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
        window.location.href = `${editUrl.pathname}${editUrl.search}`;
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
    const endpoint = kind === "excel" ? "/api/orders/export/excel" : "/api/orders/export/pdf";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        orderIds: group.orderIds,
        columns: options?.columns || [],
        instruction: options?.instruction || null,
        sortMode: options?.sortMode || "product-tag",
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
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders?classic=1">Classic page</a></div> : null}
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
          {visibleGroups.length ? visibleGroups.map((group) => <OrderCard group={group} activeTab={tab} onOpen={setSelected} onReason={setReasonView} key={group.key} />) : (
            <div className="ops-no-data-state" role="status" aria-live="polite"><img className="ops-no-data-state__image" src="/images/no-data-illustration.png" alt="" loading="lazy"/><div className="ops-no-data-state__text">Sorry, No data available</div></div>
          )}
        </div>
      </section>

      <OrderDetailsModal group={selected} busy={busy} onClose={() => setSelected(null)} onAction={beginAction} onReason={setReasonView} onExport={exportOrder} />
      <PasswordModal state={actionState} busy={busy} error={actionError} onCancel={() => { if (!busy) { setActionState(null); setActionError(""); } }} onSubmit={submitAction} />
      <DeleteConfirmationModal state={deleteConfirm} busy={busy} onCancel={() => { if (!busy) setDeleteConfirm(null); }} onConfirm={confirmDelete} />
      <RejectedReasonModal reason={reasonView} onClose={() => setReasonView("")} />
    </section>
  );
}

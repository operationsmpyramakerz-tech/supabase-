"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { groupOrderItems, OrderGroupHeader, OrderSortButton } from "./OrderGrouping";
import OrderComponentSearch, { matchesOrderComponentSearch } from "./OrderComponentSearch";
import { DeleteConfirmDialog, DeleteVerificationDialog } from "../shared/SystemDeleteDialogs";

const OrderDownloadModal = dynamic(() => import("./OrderDownloadModal"), { ssr: false });

const DIRECT_API_BASE = "/next/api";
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
  if (key === "requestproducts") return { label: "Request Products", icon: "shopping-cart", bg: "#DCFCE7", fg: "#166534", bd: "#86EFAC", accent: "#22c55e", accentDark: "#15803d" };
  if (key === "withdrawproducts") return { label: "Withdraw Products", icon: "log-out", bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA", accent: "#ef4444", accentDark: "#b91c1c" };
  if (key === "requestmaintenance") return { label: "Request Maintenance", icon: "tool", bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A", accent: "#f2b705", accentDark: "#a16207" };
  const fallback = notionColorVars(color);
  return { label: text(value) || "Order", icon: "package", ...fallback, accent: "#64748b", accentDark: "#334155" };
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


function hasMixedApprovedRejected(items) {
  const tabs = items.map(statusTabForItem);
  return tabs.includes("approved") && tabs.includes("rejected");
}


function itemsForCurrentTab(items, tab) {
  const source = Array.isArray(items) ? items : [];
  if (tab === "remaining") return source.filter((item) => Math.abs(remainingQuantity(item)) > 1e-9);
  if (tab === "shipped") return source.filter((item) => Math.abs(receivedQuantity(item)) > 1e-9);
  return source;
}


function progressIndex(group) {
  const indexes = group.items.map((item) => Math.min(4, statusIndex(item?.status)));
  return Math.max(1, ...indexes);
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

function OrderDetailsModal({ group, tab, busy, onClose, onAction, onReason, onExport }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortMode, setSortMode] = useState("product-tag");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [componentSearch, setComponentSearch] = useState("");
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

  useEffect(() => { setMoreOpen(false); setDownloadOpen(false); setSortMode("product-tag"); setComponentSearch(""); }, [group?.key, tab]);
  if (!group) return null;

  const archived = group.status === "archive";
  const maintenance = isMaintenanceOrder(group.orderType);
  const headerTitle = orderTypeHeaderTitle(group.orderType, group.orderTypeColor, statusLabel(group.status));
  const typeMeta = orderTypeMeta(group.orderType, group.orderTypeColor);
  const tabItems = itemsForCurrentTab(group.items, tab);
  const searchedTabItems = componentSearch.trim()
    ? tabItems.filter((item) => matchesOrderComponentSearch(item, componentSearch))
    : tabItems;
  const groupedItems = groupOrderItems(searchedTabItems, sortMode);
  const reasons = [...new Set(group.items.map(rejectedReason).filter(Boolean))].join("\n");
  const modalStatus = tab === "remaining" ? "remaining" : tab === "shipped" ? "shipped" : group.status;

  const menuAction = (action) => {
    setMoreOpen(false);
    onAction(action, group);
  };

  const renderItem = (item, index) => {
    const qtyRequested = finite(item?.quantityRequested ?? item?.quantity_requested ?? item?.quantity);
    const qtyEditedRaw = supervisorEditedQuantity(item);
    const hasEdited = qtyEditedRaw !== null && qtyEditedRaw !== undefined && qtyEditedRaw !== "" && finite(qtyEditedRaw) !== qtyRequested;
    const base = baseQuantity(item);
    const received = receivedQuantity(item);
    const remaining = remainingQuantity(item);
    const stage = statusIndex(item?.status);
    const itemStatus = tab === "remaining"
      ? "remaining"
      : tab === "shipped" && stage === 3
        ? "shipped"
        : tab === "all" && stage === 3 && !maintenance && Math.abs(remaining) > 1e-9
          ? "remaining"
          : statusTabForItem(item);
    const itemReason = rejectedReason(item);
    const safeUrl = text(item?.productUrl);
    const partialRemaining = tab === "all" && !maintenance && hasPartialRemaining(item);
    const visibleQty = tab === "remaining" ? remaining : tab === "shipped" && Math.abs(received) > 1e-9 ? received : base;
    const qtyMarkup = partialRemaining
      ? <span className="sv-qty-diff"><span className="sv-qty-old">{formatQuantity(base)}</span><strong className="sv-qty-new">{formatQuantity(remaining)}</strong></span>
      : hasEdited && tab !== "remaining" && tab !== "shipped"
        ? <span className="sv-qty-diff"><span className="sv-qty-old">{formatQuantity(qtyRequested)}</span><strong className="sv-qty-new">{formatQuantity(base)}</strong></span>
        : <strong>{formatQuantity(visibleQty)}</strong>;
    const displayTotal = (tab === "remaining" || tab === "shipped") ? Math.abs(visibleQty) * Math.abs(finite(item?.unitPrice ?? item?.unit_price ?? item?.price)) : itemTotal(item);
    return (
      <div className="co-item" key={text(item?.id) || index}>
        <div className="co-item-left">
          <div className="co-item-title">
            <div className="co-item-name">{text(item?.productName) || "Unknown Product"}</div>
            {/^[hH][tT][tT][pP][sS]?:\/\//.test(safeUrl) ? <a className="co-item-link" href={safeUrl} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open component link"><ClassicOrderIcon name="external-link" /></a> : null}
          </div>
          {!maintenance ? <div className="co-item-sub">Unit: {formatMoney(item?.unitPrice)} · Total: {formatMoney(displayTotal)}</div> : null}
        </div>
        <div className="co-item-right">
          {!maintenance ? <div className="co-item-total">{tab === "remaining" ? "Qty remaining:" : "Qty:"} {qtyMarkup}</div> : null}
          {!maintenance ? <StatusPill status={itemStatus} className="co-item-status" reason={itemReason} onReason={onReason} /> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="co-modal-dialog" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} details`}>
        <span className="co-modal-type-badge" style={{ "--co-order-type-accent": typeMeta.accent, "--co-order-type-accent-dark": typeMeta.accentDark }} aria-hidden="true"><ClassicOrderIcon name={typeMeta.icon} /></span>
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
        <div className="co-modal-scroll-region">
        <div className="next-current-order-modal-summary" aria-label="Order summary">
          <div><span>Order</span><strong>{group.orderIdLabel}</strong></div>
          <div><span>Date</span><strong>{formatDate(group.latestCreated)}</strong></div>
          <div><span>Components</span><strong>{tabItems.length}</strong></div>
          <div className="next-current-order-modal-summary__status"><span>Status</span>{tab === "all" && group.stage === 2 && hasMixedApprovedRejected(group.items) ? <MixedStatusPill /> : <StatusPill status={modalStatus} reason={reasons} onReason={onReason} />}</div>
        </div>
        <ProgressTrack value={archived ? 4 : progressIndex(group)} />

        <div className="co-modal-body">
          {!maintenance && (((tab === "shipped" || tab === "arrived") && group.operationsByName) || (tab === "arrived" && group.receiptEntries?.length)) ? (
            <div className="co-modal-meta">
              <div className="next-operations-meta-pair">
                  {(tab === "shipped" || tab === "arrived") && group.operationsByName ? (
                    <div className="co-meta-row"><span>Received by</span><strong>{group.operationsByName}</strong></div>
                  ) : null}
                  {tab === "arrived" && group.receiptEntries?.length ? (
                    <div className="co-meta-row next-operations-receipt-meta">
                      <span>Receipt photos</span>
                      <strong className="next-operations-receipt-meta__links">
                        {group.receiptEntries.map((entry, index) => (
                          <a
                            className="next-operations-receipt-meta__link"
                            href={entry.url}
                            target="_blank"
                            rel="noreferrer"
                            title={entry.name}
                            key={`${entry.url}-${index}`}
                          >
                            <ClassicOrderIcon name="image" />
                            <span>{entry.name || `Photo ${index + 1}`}</span>
                          </a>
                        ))}
                      </strong>
                    </div>
                  ) : null}
              </div>
            </div>
          ) : null}
          <div className="co-modal-actions ro-actions ro-actions--right order-group-sort-actions order-modal-search-actions">
            <OrderComponentSearch key={`${group.key}:${tab}`} value={componentSearch} onChange={setComponentSearch} disabled={busy} />
            <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => setDownloadOpen(true)} disabled={busy}><ClassicOrderIcon name="download" /><span>Download</span></button>
            <OrderSortButton value={sortMode} onChange={setSortMode} />
          </div>
          <div className="co-modal-meta co-modal-meta--after-actions">
            <div className="co-meta-row co-meta-row--reason"><span>Reason</span><strong>{group.reason}</strong></div>
          </div>
          <div className="co-modal-items order-component-groups">
            {groupedItems.length ? groupedItems.map((section) => (
              <section className="order-component-group" key={`${section.folderName || "products"}:${section.tag}`}>
                <OrderGroupHeader group={section} mode={sortMode} />
                <div className="order-component-group__items">{section.items.map(renderItem)}</div>
              </section>
            )) : <div className="order-component-search-empty">{componentSearch.trim() ? "No matching components." : "No items."}</div>}
          </div>
        </div>
        </div>
        <OrderDownloadModal
          open={downloadOpen}
          title={`Download ${group.orderIdLabel}`}
          defaultSignatureLabels={orderTypeKey(group.orderType) === "withdrawproducts" ? ["Received From", "Operations", "Storekeeper"] : ["Storekeeper", "Operations", "Delivered to"]}
          showSignatureOptions={!maintenance}
          showRepeatedComponentOptions={!maintenance}
          defaultRepeatedComponentMode="merge"
          onClose={() => setDownloadOpen(false)}
          onDownload={(options) => onExport({ ...options, sortMode }, { ...group, items: tabItems, orderIds: tabItems.map((item) => text(item?.id)).filter(Boolean) })}
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
  if (state.action === "delete") {
    return <DeleteVerificationDialog title={`Delete ${state.group?.orderIdLabel || "order"}`} password={password} onPasswordChange={setPassword} busy={busy} error={error} onCancel={onCancel} onSubmit={onSubmit} />;
  }
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
  if (!state) return null;
  const count = state.group?.items?.length || state.group?.orderIds?.length || 1;
  return <DeleteConfirmDialog
    title={`Delete ${state.group?.orderIdLabel || "order"}?`}
    message={`You’re going to permanently delete this order and its ${count} saved component${count === 1 ? "" : "s"}. This action cannot be undone.`}
    busy={busy}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />;
}

export default function CurrentOrdersHeavyModals({
  selected,
  tab,
  busy,
  onCloseSelected,
  onAction,
  onReason,
  onExport,
  actionState,
  actionError,
  onCancelAction,
  onSubmitAction,
  deleteConfirm,
  onCancelDelete,
  onConfirmDelete,
  reasonView,
  onCloseReason,
}) {
  return (
    <>
      <OrderDetailsModal
        group={selected}
        tab={tab}
        busy={busy}
        onClose={onCloseSelected}
        onAction={onAction}
        onReason={onReason}
        onExport={onExport}
      />
      <PasswordModal
        state={actionState}
        busy={busy}
        error={actionError}
        onCancel={onCancelAction}
        onSubmit={onSubmitAction}
      />
      <DeleteConfirmationModal
        state={deleteConfirm}
        busy={busy}
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
      <RejectedReasonModal reason={reasonView} onClose={onCloseReason} />
    </>
  );
}

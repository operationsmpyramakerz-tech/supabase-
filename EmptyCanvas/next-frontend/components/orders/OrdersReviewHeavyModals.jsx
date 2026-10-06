"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { groupOrderItems, OrderGroupHeader, OrderSortButton } from "./OrderGrouping";
import OrderComponentSearch, { matchesOrderComponentSearch } from "./OrderComponentSearch";

const OrderDownloadModal = dynamic(() => import("./OrderDownloadModal"), { ssr: false });

const DIRECT_API_BASE = "/next/api";
const PASSWORD_ACTIONS = {
  archive: {
    title: "Archive order",
    description: "Enter admin password to move this order to Archive.",
    button: "Archive",
    endpoint: `${DIRECT_API_BASE}/sv-orders/mutations-direct`,
    directAction: "archive",
    icon: "archive",
    danger: true,
  },
  unarchive: {
    title: "UnArchive order",
    description: "Enter admin password to restore this order.",
    button: "UnArchive",
    endpoint: `${DIRECT_API_BASE}/sv-orders/mutations-direct`,
    directAction: "unarchive",
    icon: "rotate-ccw",
  },
  editReview: {
    title: "Edit review decision",
    description: "Enter admin password to update the approval status for each component.",
    button: "Continue",
    endpoint: `${DIRECT_API_BASE}/sv-orders/mutations-direct`,
    directAction: "verify-edit",
    icon: "edit-2",
  },
};

const APPROVAL_COLORS = {
  "not-started": { bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
  approved: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
  rejected: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
  archive: { bg: "#F3E8FF", fg: "#6B21A8", bd: "#E9D5FF" },
};

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
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
  return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(finite(value));
}
function formatQuantity(value) {
  const number = finite(value);
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 1000) / 1000);
}
function normalizeApproval(value) {
  const key = lower(value).replace(/[_.-]+/g, " ").replace(/\s+/g, " ").trim();
  if (key.includes("approv")) return "Approved";
  if (key.includes("reject")) return "Rejected";
  return "Not Started";
}
function approvalKey(value) {
  const normalized = normalizeApproval(value);
  if (normalized === "Approved") return "approved";
  if (normalized === "Rejected") return "rejected";
  return "not-started";
}
function isArchived(item) { return /archive/.test(lower(item?.status)); }
function effectiveQuantity(item) {
  const edited = item?.quantityEdited ?? item?.quantity_edited_by_supervisor;
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  return finite(item?.quantityRequested ?? item?.quantity);
}
function itemTotal(item) { return Math.abs(effectiveQuantity(item)) * Math.abs(finite(item?.unitPrice ?? item?.unit_price)); }
function orderTypeKey(value) { return lower(value).replace(/[^a-z0-9]/g, ""); }
function notionColorVars(value) {
  const map = {
    default: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" }, gray: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" },
    brown: { bg: "#F3E8E2", fg: "#6B4F3A", bd: "#E7D3C8" }, orange: { bg: "#FFEDD5", fg: "#9A3412", bd: "#FED7AA" },
    yellow: { bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" }, green: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
    blue: { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" }, purple: { bg: "#EDE9FE", fg: "#6D28D9", bd: "#DDD6FE" },
    pink: { bg: "#FCE7F3", fg: "#BE185D", bd: "#FBCFE8" }, red: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
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
function isMaintenanceOrder(value) { return orderTypeKey(value) === "requestmaintenance"; }
function statusIndex(value) {
  const status = lower(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress)/.test(status)) return 2;
  return 1;
}

function statusLabel(value) {
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "mixed") return "Mixed review";
  if (value === "archive") return "Archive";
  return "Not Started";
}
function workflowProgress(group) {
  return Math.max(1, ...group.items.map((item) => Math.min(4, statusIndex(item?.status))));
}

function MixedStatusPill() {
  return <span className="co-status-btn sv-mixed-approval-pill" aria-label="Approved and Rejected"><span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--approved">Approved</span><span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--rejected">Rejected</span></span>;
}
function ApprovalPill({ approval, className = "co-status-btn", reason = "", onReason = null }) {
  const key = approval === "archive" ? "archive" : approvalKey(approval);
  const vars = APPROVAL_COLORS[key] || APPROVAL_COLORS["not-started"];
  const style = { "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd };
  if (key === "rejected" && reason && onReason) return <button type="button" className={`${className} sv-rejected-reason-trigger`} style={style} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReason(reason); }}>{statusLabel(key)}</button>;
  return <span className={className} style={style}>{statusLabel(key)}</span>;
}

function ProgressTrack({ value }) {
  const icons = ["eye", "activity", "truck", "home"];
  const safe = Math.min(4, Math.max(1, Number(value) || 1));
  return <div className="co-track-pill" role="img" aria-label="Order progress">{icons.map((icon, index) => {
    const step = index + 1;
    return <span className="next-classic-track-fragment" key={icon}><span className={`co-track-step ${step <= safe ? "is-active" : ""} ${step === safe ? "is-current" : ""}`}><ClassicOrderIcon name={icon} /></span>{step < 4 ? <span className={`co-track-conn ${step < safe ? "is-active" : ""}`} /> : null}</span>;
  })}</div>;
}

function QuantityEditor({ item, busy, onSave, onCancel }) {
  const [value, setValue] = useState(formatQuantity(effectiveQuantity(item)));
  useEffect(() => setValue(formatQuantity(effectiveQuantity(item))), [item?.id, item?.quantityEdited, item?.quantity]);
  return <form className="next-classic-qty-editor" onSubmit={(event) => { event.preventDefault(); onSave(item, value); onCancel(); }}>
    <input className="sv-qty-input" type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} aria-label={`Quantity for ${text(item?.productName) || "component"}`} />
    <div className="sv-qty-actions"><button type="button" className="sv-qty-btn" onClick={onCancel}>×</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy || !text(value)}>Save</button></div>
  </form>;
}

function ReviewDetailsLoadState({ group, loading, error, onRetry, onClose }) {
  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("co-modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("co-modal-open");
    };
  }, [group, onClose]);
  if (!group) return null;
  const typeMeta = orderTypeMeta(group.orderType, group.orderTypeColor);
  return <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="co-modal-dialog next-review-order-modal" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} review details`}>
      <span className="co-modal-type-badge" style={{ "--co-order-type-accent": typeMeta.accent, "--co-order-type-accent-dark": typeMeta.accentDark }} aria-hidden="true"><ClassicOrderIcon name={typeMeta.icon} /></span>
      <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />
      <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">Order review</div></div></div>
      <div className="co-modal-scroll-region">
      <div className="next-review-order-modal-summary" aria-label="Review order summary">
        <div><span>Order</span><strong>{group.orderIdLabel}</strong></div>
        <div><span>Date</span><strong>{formatDate(group.latestCreated)}</strong></div>
        <div><span>Components</span><strong>{group.items.length}</strong></div>
      </div>
      <div className="co-modal-body">
        <div className={`creator-profile-state ${error ? "creator-profile-state--error" : ""}`}>
          <span>{error || (loading ? "Loading order details..." : "Preparing order details...")}</span>
          {error ? <button type="button" className="ro-action-btn ro-action-btn--dark" onClick={onRetry}>Try again</button> : null}
        </div>
      </div>
      </div>
    </div>
  </div>;
}

function ReviewDetailsModal({ group, activeTab, busyIds, onClose, onQuantitySave, onDecision, onBulkDecision, onPasswordAction, onReason, onExport }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingQty, setEditingQty] = useState("");
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

  useEffect(() => { setMoreOpen(false); setEditingQty(""); setDownloadOpen(false); setSortMode("product-tag"); setComponentSearch(""); }, [group?.key, activeTab]);
  if (!group) return null;

  const archived = group.archived;
  const approval = group.approval;
  const canAct = !archived && approval === "not-started" && activeTab === "not-started";
  const showEdit = !archived && (approval === "approved" || approval === "rejected" || activeTab === "approved" || activeTab === "rejected");
  const showArchive = !archived && ["not-started", "approved", "rejected"].includes(activeTab);
  const showUnarchive = archived || activeTab === "archive";
  const maintenance = isMaintenanceOrder(group.orderType);
  const headerTitle = orderTypeHeaderTitle(group.orderType, group.orderTypeColor, statusLabel(approval));
  const typeMeta = orderTypeMeta(group.orderType, group.orderTypeColor);
  const searchedItems = componentSearch.trim()
    ? group.items.filter((item) => matchesOrderComponentSearch(item, componentSearch))
    : group.items;
  const groupedItems = groupOrderItems(searchedItems, sortMode);
  const state = archived ? "archive" : approval;

  const menuAction = (action) => {
    setMoreOpen(false);
    onPasswordAction(action, group);
  };

  const renderItem = (item, index) => {
    const itemApproval = approvalKey(item?.approval ?? item?.svApproval ?? item?.sv_approval);
    const itemBusy = busyIds.has(text(item?.id));
    const itemReason = text(item?.rejectedReason ?? item?.rejected_reason);
    const qtyRequested = finite(item?.quantityRequested ?? item?.quantity_requested ?? item?.quantity);
    const qtyEdited = item?.quantityEdited ?? item?.quantity_edited_by_supervisor ?? item?.quantityEditedBySupervisor;
    const showEdited = qtyEdited !== null && qtyEdited !== undefined && qtyEdited !== "" && finite(qtyEdited) !== qtyRequested;
    const safeUrl = text(item?.productUrl ?? item?.product_url);
    return <div className="co-item next-review-order-item" key={text(item?.id) || index}>
      <div className="co-item-left"><div className="co-item-title"><div className="co-item-name">{text(item?.productName) || "Unknown Product"}</div>{/^https?:\/\//i.test(safeUrl) ? <a className="co-item-link" href={safeUrl} target="_blank" rel="noopener noreferrer" title="Open component link" aria-label="Open component link" onClick={(event) => event.stopPropagation()}><ClassicOrderIcon name="external-link" /></a> : null}</div>{!maintenance ? <div className="co-item-sub">Unit: {formatMoney(item?.unitPrice)} · Total: {formatMoney(itemTotal(item))}</div> : null}</div>
      <div className="co-item-right">
        {!maintenance ? <div className="co-item-total">Qty: {showEdited ? <span className="sv-qty-diff"><span className="sv-qty-old">{formatQuantity(qtyRequested)}</span><strong className="sv-qty-new">{formatQuantity(qtyEdited)}</strong></span> : <strong>{formatQuantity(qtyRequested)}</strong>}</div> : null}
        {!maintenance ? <ApprovalPill approval={itemApproval} className="co-item-status" reason={itemReason} onReason={onReason} /> : null}
        {canAct && !maintenance ? <div className="next-review-item-actions"><button className="next-review-action-btn next-review-action-btn--edit" type="button" disabled={itemBusy} onClick={() => setEditingQty((current) => current === text(item?.id) ? "" : text(item?.id))}><ClassicOrderIcon name="edit-2" /><span>Edit qty</span></button><button className="next-review-action-btn next-review-action-btn--reject" type="button" disabled={itemBusy} onClick={() => onDecision(item, "Rejected")}><ClassicOrderIcon name="x" /><span>Reject</span></button><button className="next-review-action-btn next-review-action-btn--approve" type="button" disabled={itemBusy} onClick={() => onDecision(item, "Approved")}><ClassicOrderIcon name="check" /><span>Approve</span></button></div> : null}
        {editingQty === text(item?.id) ? <QuantityEditor item={item} busy={itemBusy} onSave={onQuantitySave} onCancel={() => setEditingQty("")} /> : null}
      </div>
    </div>;
  };

  return <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="co-modal-dialog next-review-order-modal" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} review details`}>
      <span className="co-modal-type-badge" style={{ "--co-order-type-accent": typeMeta.accent, "--co-order-type-accent-dark": typeMeta.accentDark }} aria-hidden="true"><ClassicOrderIcon name={typeMeta.icon} /></span>
      {(showEdit || showArchive || showUnarchive) ? <div className="co-modal-more" ref={moreRef}>
        <button type="button" className="co-modal-more-btn" aria-label="Order review actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((stateValue) => !stateValue)}><span className="co-modal-more-dots">⋮</span></button>
        {moreOpen ? <div className="co-modal-more-panel" role="menu" aria-label="Order review actions">
          {showEdit ? <button type="button" className="co-modal-more-item" onClick={() => menuAction("editReview")}><ClassicOrderIcon name="edit-2" /><span>Edit review</span></button> : null}
          {showArchive ? <button type="button" className="co-modal-more-item" onClick={() => menuAction("archive")}><ClassicOrderIcon name="archive" /><span>Archive</span></button> : null}
          {showUnarchive ? <button type="button" className="co-modal-more-item" onClick={() => menuAction("unarchive")}><ClassicOrderIcon name="rotate-ccw" /><span>UnArchive</span></button> : null}
        </div> : null}
      </div> : null}
      <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />
      <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">{headerTitle}</div></div></div>

      <div className="co-modal-scroll-region">
      <div className="next-review-order-modal-summary" aria-label="Review order summary">
        <div><span>Order</span><strong>{group.orderIdLabel}</strong></div>
        <div><span>Date</span><strong>{formatDate(group.latestCreated)}</strong></div>
        <div><span>Components</span><strong>{group.items.length}</strong></div>
        <div className="next-review-order-modal-summary__status"><span>Review</span>{approval === "mixed" && !archived ? <MixedStatusPill /> : <ApprovalPill approval={state} />}</div>
      </div>

      <ProgressTrack value={archived ? 4 : workflowProgress(group)} />
      <div className="co-modal-body">
        <div className="co-modal-actions ro-actions ro-actions--right order-group-sort-actions order-modal-search-actions">
          <OrderComponentSearch key={`${group.key}:${activeTab}`} value={componentSearch} onChange={setComponentSearch} />
          <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => setDownloadOpen(true)}><ClassicOrderIcon name="download" /><span>Download</span></button>
          <OrderSortButton value={sortMode} onChange={setSortMode} />
        </div>
        <div className="co-modal-meta co-modal-meta--after-actions"><div className="co-meta-row co-meta-row--reason"><span>Reason</span><strong>{group.reason}</strong></div></div>
        {canAct ? <div className="next-review-bulk-actions"><div><span>Review all components</span><strong>Apply one decision to every item in this order.</strong></div><div className="next-classic-review-actions"><button className="btn btn-success btn-xs" type="button" onClick={() => onBulkDecision(group, "Approved")}><ClassicOrderIcon name="check" /> Approve all</button><button className="btn btn-danger btn-xs" type="button" onClick={() => onBulkDecision(group, "Rejected")}><ClassicOrderIcon name="x" /> Reject all</button></div></div> : null}
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
        onDownload={(options) => onExport({ ...options, sortMode }, group, activeTab)}
      />
    </div>
  </div>;
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
  const config = PASSWORD_ACTIONS[state.action];
  return <div className="co-submodal-overlay is-open req-edit-modal" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <form className="co-submodal-dialog req-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
      <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close admin password dialog" />
      <div className="co-submodal-header req-edit-header"><div className={`req-edit-icon ${config.danger ? "req-edit-icon--danger" : ""}`}><ClassicOrderIcon name={config.icon} /></div><div><div className="co-submodal-title">{config.title}</div><div className="co-submodal-sub">{config.description}</div></div></div>
      <div className="co-submodal-body"><label className="co-submodal-label" htmlFor="review-admin-password">Admin password</label><input id="review-admin-password" className="co-submodal-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" placeholder="••••••••" disabled={busy}/><div className="co-submodal-error" role="alert" aria-live="polite">{error}</div></div>
      <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className={`ro-action-btn ${config.danger ? "ro-action-btn--danger" : "ro-action-btn--dark"}`} disabled={busy || !password.trim()}>{busy ? "Working…" : config.button}</button></div>
    </form>
  </div>;
}

function RejectionModal({ state, busy, error, onCancel, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [state?.key]);
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, onCancel]);
  if (!state) return null;
  return <div className="co-submodal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><form className="co-submodal-dialog reject-reason-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}>
    <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close rejected reason dialog" />
    <div className="co-submodal-header req-edit-header"><div className="req-edit-icon req-edit-icon--danger"><ClassicOrderIcon name="x-circle" /></div><div><div className="co-submodal-title">Rejected reason</div><div className="co-submodal-sub">Add the reason that should be saved with the rejected component{state.group ? "s" : ""}.</div></div></div>
    <div className="co-submodal-body"><label className="co-submodal-label" htmlFor="review-reject-reason">Reason</label><textarea id="review-reject-reason" className="co-submodal-textarea reject-reason-input" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus disabled={busy}/><div className="co-submodal-error" role="alert" aria-live="polite">{error}</div></div>
    <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--danger" disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Reject"}</button></div>
  </form></div>;
}

function ReviewEditorModal({ state, busy, error, onCancel, onSubmit }) {
  const [approvals, setApprovals] = useState({});
  useEffect(() => {
    if (!state?.group) return;
    const next = {};
    state.group.items.forEach((item) => { next[text(item?.id)] = normalizeApproval(item?.approval ?? item?.svApproval ?? item?.sv_approval); });
    setApprovals(next);
  }, [state?.group?.key]);
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, onCancel]);
  if (!state?.group) return null;
  const choices = [
    { value: "Not Started", label: "Not started", icon: "pause-circle" },
    { value: "Approved", label: "Approved", icon: "check-circle" },
    { value: "Rejected", label: "Rejected", icon: "x-circle" },
  ];
  return <div className="co-submodal-overlay is-open sv-review-edit-modal" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><form className="co-submodal-dialog sv-review-edit-dialog next-review-editor-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(approvals); }}>
    <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close review edit dialog" />
    <div className="co-submodal-header req-edit-header"><div className="req-edit-icon"><ClassicOrderIcon name="edit-2" /></div><div><div className="co-submodal-title">Edit review decision</div><div className="co-submodal-sub">Update the approval status for each component.</div></div></div>
    <div className="co-submodal-body"><div className="co-submodal-fields"><div className="co-submodal-field"><div className="co-submodal-label">Component approval status</div><div className="sv-review-edit-items">{state.group.items.map((item) => {
      const id = text(item?.id);
      const value = approvals[id] || "Not Started";
      const valueClass = value === "Approved" ? "is-approved" : value === "Rejected" ? "is-rejected" : "is-not-started";
      return <div className={`sv-review-edit-item next-review-edit-item ${valueClass}`} key={id}><div className="sv-review-edit-item__info"><div className="sv-review-edit-item__name">{text(item?.productName) || "Component"}</div><div className="sv-review-edit-item__sub">Qty: {formatQuantity(effectiveQuantity(item))}</div></div><div className="next-review-status-picker" role="radiogroup" aria-label={`Approval status for ${text(item?.productName) || "component"}`}>{choices.map((choice) => <button type="button" key={choice.value} className={`next-review-status-choice next-review-status-choice--${choice.value === "Approved" ? "approved" : choice.value === "Rejected" ? "rejected" : "pending"} ${value === choice.value ? "is-active" : ""}`} role="radio" aria-checked={value === choice.value} onClick={() => setApprovals((current) => ({ ...current, [id]: choice.value }))} disabled={busy}><ClassicOrderIcon name={choice.icon} /><span>{choice.label}</span></button>)}</div></div>;
    })}</div></div></div><div className="co-submodal-error" role="alert" aria-live="polite">{error}</div></div>
    <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy}>{busy ? "Saving…" : "Confirm"}</button></div>
  </form></div>;
}

function RejectedReasonModal({ reason, onClose }) {
  useEffect(() => {
    if (!reason) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reason, onClose]);
  if (!reason) return null;
  return <div className="co-submodal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="co-submodal-dialog reject-reason-dialog" role="dialog" aria-modal="true"><button type="button" className="co-submodal-close" onClick={onClose} aria-label="Close rejected reason"/><div className="co-submodal-header req-edit-header"><div className="req-edit-icon req-edit-icon--danger"><ClassicOrderIcon name="x-circle"/></div><div><div className="co-submodal-title">Rejected reason</div><div className="co-submodal-sub">Reason saved with this rejected component.</div></div></div><div className="co-submodal-body"><div className="rejected-reason-view-text">{reason}</div></div><div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--dark" onClick={onClose}>Done</button></div></div></div>;
}

function profileFieldValue(profile, aliases = []) {
  const wanted = new Set(aliases.map((value) => lower(value).replace(/[^a-z0-9]/g, "")));
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

  return <div className="creator-profile-popover is-open next-review-creator-popover" style={{ left: state.left, top: state.top }} aria-hidden="false"><div className="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile">
    <button type="button" className="creator-profile-close" onClick={onClose} aria-label="Close"><span className="creator-profile-close-x">×</span></button>
    <div className="creator-profile-head"><div className={`creator-profile-avatar ${photoUrl ? "has-image" : ""}`}>{photoUrl ? <img src={photoUrl} alt={name}/> : <span>{initials}</span>}</div><div className="creator-profile-title-wrap"><div className="creator-profile-kicker">Created by</div><div className="creator-profile-name">{name}</div><div className="creator-profile-subtitle">{subtitle}</div></div></div>
    {state.loading ? <div className="creator-profile-state"><span>Loading user details...</span></div> : state.error ? <div className="creator-profile-state creator-profile-state--error"><span>Could not load this user details.</span></div> : <>
      <div className="creator-profile-section-title">Profile details</div>
      {details.length ? <div className="creator-profile-fields next-review-creator-fields">{details.map(([label, value]) => <div className="creator-profile-field" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> : <div className="creator-profile-empty creator-profile-empty--fields"><span>No profile details available.</span></div>}
      <div className="creator-profile-section-title creator-profile-section-title--files">Files &amp; media</div>
      {files.length ? <div className="creator-profile-files">{files.map((file, index) => file.url ? <a className="creator-profile-file" href={file.url} target="_blank" rel="noopener noreferrer" key={`${file.name}-${index}`}><span className="creator-profile-file-icon"><ClassicOrderIcon name="clipboard" /></span><span className="creator-profile-file-body"><span className="creator-profile-file-name">{file.name}</span></span><span className="creator-profile-file-open"><ClassicOrderIcon name="external-link" /></span></a> : <div className="creator-profile-file creator-profile-file--disabled" key={`${file.name}-${index}`}><span className="creator-profile-file-icon"><ClassicOrderIcon name="clipboard" /></span><span className="creator-profile-file-body"><span className="creator-profile-file-name">{file.name}</span></span></div>)}</div> : <div className="creator-profile-empty"><span>No files or media.</span></div>}
    </>}
  </div></div>;
}
export default function OrdersReviewHeavyModals({
  selectedKey,
  selected,
  selectedSummary,
  detailLoadingKey,
  detailError,
  onRetryDetails,
  onCloseDetails,
  tab,
  busyIds,
  onQuantitySave,
  onDecision,
  onBulkDecision,
  onPasswordAction,
  onReason,
  onExport,
  passwordState,
  passwordBusy,
  passwordError,
  onCancelPassword,
  onSubmitPassword,
  rejectionState,
  rejectionBusy,
  rejectionError,
  onCancelRejection,
  onSubmitRejection,
  editorState,
  editorBusy,
  editorError,
  onCancelEditor,
  onSubmitEditor,
  reasonView,
  onCloseReason,
  creatorState,
  onCloseCreator,
}) {
  return (
    <>
      {selectedKey && !selected ? (
        <ReviewDetailsLoadState
          group={selectedSummary}
          loading={detailLoadingKey === selectedKey}
          error={detailError}
          onRetry={onRetryDetails}
          onClose={onCloseDetails}
        />
      ) : null}
      <ReviewDetailsModal
        group={selected}
        activeTab={tab}
        busyIds={busyIds}
        onClose={onCloseDetails}
        onQuantitySave={onQuantitySave}
        onDecision={onDecision}
        onBulkDecision={onBulkDecision}
        onPasswordAction={onPasswordAction}
        onReason={onReason}
        onExport={onExport}
      />
      <PasswordModal
        state={passwordState}
        busy={passwordBusy}
        error={passwordError}
        onCancel={onCancelPassword}
        onSubmit={onSubmitPassword}
      />
      <RejectionModal
        state={rejectionState}
        busy={rejectionBusy}
        error={rejectionError}
        onCancel={onCancelRejection}
        onSubmit={onSubmitRejection}
      />
      <ReviewEditorModal
        state={editorState}
        busy={editorBusy}
        error={editorError}
        onCancel={onCancelEditor}
        onSubmit={onSubmitEditor}
      />
      <RejectedReasonModal reason={reasonView} onClose={onCloseReason} />
      <CreatorProfilePopover state={creatorState} onClose={onCloseCreator} />
    </>
  );
}

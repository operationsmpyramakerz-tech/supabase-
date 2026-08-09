"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

const REVIEW_TABS = [
  { key: "all", label: "All", icon: "layers" },
  { key: "not-started", label: "Not Started", icon: "pause-circle" },
  { key: "approved", label: "Approved", icon: "check-circle" },
  { key: "rejected", label: "Rejected", icon: "x-circle" },
  { key: "archive", label: "Archive", icon: "archive" },
];

const PASSWORD_ACTIONS = {
  archive: {
    title: "Archive order",
    description: "Enter admin password to move this order to Archive.",
    button: "Archive",
    endpoint: "/api/sv-orders/actions/archive",
    icon: "archive",
    danger: true,
  },
  unarchive: {
    title: "UnArchive order",
    description: "Enter admin password to restore this order.",
    button: "UnArchive",
    endpoint: "/api/sv-orders/actions/unarchive",
    icon: "rotate-ccw",
  },
  editReview: {
    title: "Edit review decision",
    description: "Enter admin password to update the approval status for each component.",
    button: "Continue",
    endpoint: "/api/sv-orders/actions/verify-edit",
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
function isMaintenanceOrder(value) { return orderTypeKey(value) === "requestmaintenance"; }
function statusIndex(value) {
  const status = lower(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress)/.test(status)) return 2;
  return 1;
}
function groupKey(item, index) {
  const number = Number(item?.orderIdNumber);
  if (Number.isFinite(number)) return `order:${number}`;
  const direct = text(item?.orderId);
  const rowId = text(item?.id);
  const generatedFallback = rowId ? `ORD-${rowId}` : "";
  if (direct && direct !== generatedFallback) return `order:${direct}`;
  const date = text(item?.createdTime).slice(0, 16);
  const owner = lower(item?.createdByName ?? item?.teamMemberId);
  const reason = lower(item?.reason);
  const fallback = `${date}|${owner}|${reason}`;
  return fallback.replace(/\|/g, "") ? fallback : `row:${rowId || index}`;
}
function orderIdLabel(items) {
  const explicit = [...new Set(items.map((item) => text(item?.orderId)).filter(Boolean))];
  if (explicit.length === 1) return explicit[0];
  const numbers = [...new Set(items.map((item) => Number(item?.orderIdNumber)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (numbers.length === 1) return `ORD-${numbers[0]}`;
  if (numbers.length > 1) return `ORD-${numbers[0]} : ORD-${numbers[numbers.length - 1]}`;
  if (explicit.length > 1) return `${explicit[0]} : ${explicit[explicit.length - 1]}`;
  return explicit[0] || "Order";
}
function dominantApproval(items) {
  const values = [...new Set(items.map((item) => approvalKey(item?.approval ?? item?.svApproval ?? item?.sv_approval)))];
  if (values.length === 1) return values[0];
  return "mixed";
}
function buildGroups(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => dateValue(b?.createdTime) - dateValue(a?.createdTime));
  const map = new Map();
  sorted.forEach((item, index) => {
    const key = groupKey(item, index);
    if (!map.has(key)) {
      map.set(key, {
        key, items: [], latestCreated: item?.createdTime, orderType: item?.orderType, orderTypeColor: item?.orderTypeColor,
        approvalColor: item?.approvalColor, createdByName: item?.createdByName, createdById: item?.createdById ?? item?.teamMemberId,
      });
    }
    const group = map.get(key);
    group.items.push(item);
    if (dateValue(item?.createdTime) > dateValue(group.latestCreated)) group.latestCreated = item?.createdTime;
    if (!group.orderType && item?.orderType) group.orderType = item.orderType;
    if (!group.orderTypeColor && item?.orderTypeColor) group.orderTypeColor = item.orderTypeColor;
    if (!group.approvalColor && item?.approvalColor) group.approvalColor = item.approvalColor;
    if (!group.createdByName && item?.createdByName) group.createdByName = item.createdByName;
    if (!group.createdById && (item?.createdById ?? item?.teamMemberId)) group.createdById = item?.createdById ?? item?.teamMemberId;
  });
  return [...map.values()].map((group) => {
    const reasons = group.items.map((item) => text(item?.reason)).filter(Boolean);
    const counts = reasons.reduce((acc, reason) => acc.set(reason, (acc.get(reason) || 0) + 1), new Map());
    const reason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "No reason";
    return {
      ...group, reason, orderIdLabel: orderIdLabel(group.items), orderIds: group.items.map((item) => text(item?.id)).filter(Boolean),
      total: group.items.reduce((sum, item) => sum + itemTotal(item), 0), approval: dominantApproval(group.items),
      archived: group.items.length > 0 && group.items.every(isArchived),
    };
  }).sort((a, b) => dateValue(b.latestCreated) - dateValue(a.latestCreated));
}
function groupSearchText(group) {
  return [group.orderIdLabel, group.reason, group.createdByName, orderTypeMeta(group.orderType, group.orderTypeColor).label,
    ...group.items.flatMap((item) => [item?.productName, item?.issueDescription, item?.rejectedReason])].map(lower).join(" ");
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
async function readJson(response) { return response.json().catch(() => ({})); }

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
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={wrapRef} className={`orders-type-filter ${open ? "is-open" : ""} ${value !== "all" ? "is-filtered" : ""}`}>
      <button type="button" className="orders-type-filter__button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((state) => !state)}>
        <span className="orders-type-filter__button-icon"><ClassicOrderIcon name="filter" /></span><span className="orders-type-filter__button-label">Filter</span>{value !== "all" ? <span className="orders-type-filter__button-dot" /> : null}
      </button>
      {open ? <div className="orders-type-filter__panel" role="menu" aria-label="Filter review orders by type">
        <div className="orders-type-filter__panel-head"><span className="orders-type-filter__panel-title">Order type</span><span className="orders-type-filter__panel-sub">Choose one</span></div>
        <div className="orders-type-filter__options">
          <button type="button" className={`orders-type-filter__option ${value === "all" ? "is-active" : ""}`} onClick={() => { onChange("all"); setOpen(false); }}>
            <span className="orders-type-filter__option-icon"><ClassicOrderIcon name="layers" /></span><span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">All order types</span><span className="orders-type-filter__option-sub">Show every order type</span></span><span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span>
          </button>
          {options.map((option) => {
            const meta = orderTypeMeta(option.raw, option.color);
            return <button type="button" className={`orders-type-filter__option ${value === option.key ? "is-active" : ""}`} onClick={() => { onChange(option.key); setOpen(false); }} key={option.key}>
              <span className="orders-type-filter__option-icon" style={{ "--otf-icon-bg": meta.bg, "--otf-icon-fg": meta.fg, "--otf-icon-border": meta.bd }}><ClassicOrderIcon name={meta.icon} /></span>
              <span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">{option.label}</span><span className="orders-type-filter__option-sub">{option.count} order{option.count === 1 ? "" : "s"}</span></span><span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span>
            </button>;
          })}
        </div>
      </div> : null}
    </div>
  );
}

function MixedStatusPill() {
  return <span className="co-status-btn sv-mixed-approval-pill" aria-label="Approved and Rejected"><span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--approved">Approved</span><span className="sv-mixed-approval-pill__part sv-mixed-approval-pill__part--rejected">Rejected</span></span>;
}
function ApprovalPill({ approval, className = "co-status-btn", reason = "", onReason }) {
  const key = approval === "archive" ? "archive" : approvalKey(approval);
  const vars = APPROVAL_COLORS[key] || APPROVAL_COLORS["not-started"];
  const style = { "--tag-bg": vars.bg, "--tag-fg": vars.fg, "--tag-border": vars.bd };
  if (key === "rejected" && reason && onReason) return <button type="button" className={`${className} sv-rejected-reason-trigger`} style={style} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReason(reason); }}>{statusLabel(key)}</button>;
  return <span className={className} style={style}>{statusLabel(key)}</span>;
}

function OrderReviewCard({ group, activeTab, onOpen, onCreator }) {
  const type = orderTypeMeta(group.orderType, group.orderTypeColor);
  const state = group.archived ? "archive" : group.approval;
  const mixed = activeTab === "all" && !group.archived && group.approval === "mixed";
  return (
    <article className="co-card" role="button" tabIndex={0} onClick={() => onOpen(group)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(group); } }}>
      <div className="co-top">
        <div className="co-thumb co-thumb--order-type" style={{ "--co-thumb-bg": type.bg, "--co-thumb-fg": type.fg, "--co-thumb-border": type.bd }} title={type.label}><ClassicOrderIcon name={type.icon} /></div>
        <div className="co-main"><div className="co-title">{group.orderIdLabel}</div><div className="co-sub">{formatDate(group.latestCreated)}</div><div className="co-createdby">{group.createdByName || "—"}</div></div>
        <div className="co-qty">x{group.items.length}</div>
      </div>
      <div className="co-divider" />
      <div className="co-bottom">
        <div className="co-est"><div className="co-est-label">Estimate Total</div><div className="co-est-value">{formatMoney(group.total)}</div></div>
        <div className="co-actions">
          {mixed ? <MixedStatusPill /> : <ApprovalPill approval={state} />}
          <button className="co-right-ico co-creator-btn" type="button" aria-label={`Created by ${group.createdByName || "Creator"}`} title={`Created by ${group.createdByName || "Creator"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCreator(event.currentTarget, group); }}><ClassicOrderIcon name="user" /></button>
        </div>
      </div>
    </article>
  );
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

function ReviewDetailsModal({ group, activeTab, busyIds, onClose, onQuantitySave, onDecision, onBulkDecision, onPasswordAction, onReason }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingQty, setEditingQty] = useState("");
  useEffect(() => {
    if (!group) return undefined;
    const listener = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", listener);
    document.body.classList.add("co-modal-open");
    return () => { document.removeEventListener("keydown", listener); document.body.classList.remove("co-modal-open"); };
  }, [group, onClose]);
  useEffect(() => { setMoreOpen(false); setEditingQty(""); }, [group?.key]);
  if (!group) return null;

  const archived = group.archived;
  const approval = group.approval;
  const canAct = !archived && approval === "not-started" && activeTab === "not-started";
  const showEdit = !archived && (approval === "approved" || approval === "rejected" || activeTab === "approved" || activeTab === "rejected");
  const showArchive = !archived && ["not-started", "approved", "rejected"].includes(activeTab);
  const showUnarchive = archived || activeTab === "archive";
  const maintenance = isMaintenanceOrder(group.orderType);
  const headerTitle = orderTypeHeaderTitle(group.orderType, group.orderTypeColor, statusLabel(approval));
  const items = [...group.items].sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true }));

  return <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="co-modal-dialog" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} review details`}>
      {(showEdit || showArchive || showUnarchive) ? <div className="co-modal-more">
        <button type="button" className="co-modal-more-btn" aria-label="Order review actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((state) => !state)}><span className="co-modal-more-dots">⋮</span></button>
        {moreOpen ? <div className="co-modal-more-panel" role="menu">
          {showEdit ? <button type="button" className="co-modal-more-item" onClick={() => { setMoreOpen(false); onPasswordAction("editReview", group); }}><ClassicOrderIcon name="edit-2" /><span>Edit</span></button> : null}
          {showArchive ? <button type="button" className="co-modal-more-item" onClick={() => { setMoreOpen(false); onPasswordAction("archive", group); }}><ClassicOrderIcon name="archive" /><span>Archive</span></button> : null}
          {showUnarchive ? <button type="button" className="co-modal-more-item" onClick={() => { setMoreOpen(false); onPasswordAction("unarchive", group); }}><ClassicOrderIcon name="rotate-ccw" /><span>UnArchive</span></button> : null}
        </div> : null}
      </div> : null}
      <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />
      <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">{headerTitle}</div><div className="co-modal-status-sub" hidden /></div></div>
      <ProgressTrack value={archived ? 4 : workflowProgress(group)} />
      <div className="co-modal-body">
        {!maintenance ? <div className="co-modal-meta"><div className="co-meta-row co-meta-row--reason"><span>Reason</span><strong>{group.reason}</strong></div></div> : null}
        <div className="co-modal-items">
          {canAct ? <div className="co-item" data-role="bulk-actions"><div className="co-item-left"><div className="co-item-name">Bulk actions</div></div><div className="co-item-right"><div className="btn-group next-classic-review-actions"><button className="btn btn-success btn-xs" type="button" onClick={() => onBulkDecision(group, "Approved")}><ClassicOrderIcon name="check" /> Approve all</button><button className="btn btn-danger btn-xs" type="button" onClick={() => onBulkDecision(group, "Rejected")}><ClassicOrderIcon name="x" /> Reject all</button></div></div></div> : null}
          {items.length ? items.map((item, index) => {
            const itemApproval = approvalKey(item?.approval ?? item?.svApproval ?? item?.sv_approval);
            const itemBusy = busyIds.has(text(item?.id));
            const itemReason = text(item?.rejectedReason ?? item?.rejected_reason);
            const qtyRequested = finite(item?.quantityRequested ?? item?.quantity);
            const qtyEdited = item?.quantityEdited;
            const showEdited = qtyEdited !== null && qtyEdited !== undefined && qtyEdited !== "" && finite(qtyEdited) !== qtyRequested;
            return <div className="co-item" key={text(item?.id) || index}>
              <div className="co-item-left"><div className="co-item-title"><div className="co-item-name">{text(item?.productName) || "Unknown Product"}</div></div>{!maintenance ? <div className="co-item-sub">Unit: {formatMoney(item?.unitPrice)} · Total: {formatMoney(itemTotal(item))}</div> : null}</div>
              <div className="co-item-right">
                {maintenance ? <div className="co-item-issue-desc">{text(item?.issueDescription || item?.reason) || "—"}</div> : <div className="co-item-total">Qty: {showEdited ? <span className="sv-qty-diff"><span className="sv-qty-old">{formatQuantity(qtyRequested)}</span><strong className="sv-qty-new">{formatQuantity(qtyEdited)}</strong></span> : <strong>{formatQuantity(qtyRequested)}</strong>}</div>}
                <ApprovalPill approval={itemApproval} className="co-item-status" reason={itemReason} onReason={onReason} />
                {canAct && !maintenance ? <div className="btn-group sv-review-item-actions next-classic-review-actions"><button className="btn btn-xs sv-edit ro-edit-dark" type="button" disabled={itemBusy} onClick={() => setEditingQty((current) => current === text(item?.id) ? "" : text(item?.id))}><ClassicOrderIcon name="edit-2" /> Edit</button><button className="btn btn-danger btn-xs sv-reject" type="button" disabled={itemBusy} onClick={() => onDecision(item, "Rejected")}><ClassicOrderIcon name="x" /> Reject</button><button className="btn btn-success btn-xs" type="button" disabled={itemBusy} onClick={() => onDecision(item, "Approved")}><ClassicOrderIcon name="check" /> Approve</button></div> : null}
                {editingQty === text(item?.id) ? <QuantityEditor item={item} busy={itemBusy} onSave={onQuantitySave} onCancel={() => setEditingQty("")} /> : null}
              </div>
            </div>;
          }) : <div className="muted">No items.</div>}
        </div>
      </div>
    </div>
  </div>;
}

function PasswordModal({ state, busy, error, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  useEffect(() => setPassword(""), [state?.action, state?.group?.key]);
  if (!state) return null;
  const config = PASSWORD_ACTIONS[state.action];
  return <div className="co-submodal-overlay is-open req-edit-modal" aria-hidden="false">
    <form className="co-submodal-dialog req-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
      <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close admin password dialog" />
      <div className="co-submodal-header req-edit-header"><div className={`req-edit-icon ${config.danger ? "req-edit-icon--danger" : ""}`}><ClassicOrderIcon name={config.icon} /></div><div><div className="co-submodal-title">{config.title}</div><div className="co-submodal-sub">{config.description}</div></div></div>
      <div className="co-submodal-body"><label className="co-submodal-label" htmlFor="review-admin-password">Admin password</label><input id="review-admin-password" className="co-submodal-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" placeholder="••••••••" disabled={busy}/><div className="co-submodal-error" role="alert">{error}</div></div>
      <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className={`ro-action-btn ${config.danger ? "ro-action-btn--danger" : "ro-action-btn--dark"}`} disabled={busy || !password.trim()}>{busy ? "Working…" : config.button}</button></div>
    </form>
  </div>;
}

function RejectionModal({ state, busy, error, onCancel, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [state?.key]);
  if (!state) return null;
  return <div className="co-submodal-overlay is-open" aria-hidden="false"><form className="co-submodal-dialog reject-reason-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}>
    <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close rejected reason dialog" />
    <div className="co-submodal-header req-edit-header"><div className="req-edit-icon req-edit-icon--danger"><ClassicOrderIcon name="x-circle" /></div><div><div className="co-submodal-title">Rejected reason</div><div className="co-submodal-sub">Add the reason that should be saved with the rejected component{state.group ? "s" : ""}.</div></div></div>
    <div className="co-submodal-body"><label className="co-submodal-label" htmlFor="review-reject-reason">Reason</label><textarea id="review-reject-reason" className="co-submodal-textarea reject-reason-input" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus disabled={busy}/><div className="co-submodal-error" role="alert">{error}</div></div>
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
  if (!state?.group) return null;
  return <div className="co-submodal-overlay is-open sv-review-edit-modal" aria-hidden="false"><form className="co-submodal-dialog sv-review-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(approvals); }}>
    <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close review edit dialog" />
    <div className="co-submodal-header req-edit-header"><div className="req-edit-icon"><ClassicOrderIcon name="edit-2" /></div><div><div className="co-submodal-title">Edit review decision</div><div className="co-submodal-sub">Update the approval status for each component.</div></div></div>
    <div className="co-submodal-body"><div className="co-submodal-fields"><div className="co-submodal-field"><div className="co-submodal-label">Component approval status</div><div className="sv-review-edit-items">{state.group.items.map((item) => {
      const id = text(item?.id);
      const value = approvals[id] || "Not Started";
      return <div className={`sv-review-edit-item ${value === "Approved" ? "is-approved" : value === "Rejected" ? "is-rejected" : ""}`} key={id}><div className="sv-review-edit-item__info"><div className="sv-review-edit-item__name">{text(item?.productName) || "Component"}</div><div className="sv-review-edit-item__sub">Qty: {formatQuantity(effectiveQuantity(item))}</div></div><select className={`sv-review-edit-select ${value === "Approved" ? "is-approved" : value === "Rejected" ? "is-rejected" : "is-not-started"}`} value={value} onChange={(event) => setApprovals((current) => ({ ...current, [id]: event.target.value }))} disabled={busy}><option>Not Started</option><option>Approved</option><option>Rejected</option></select></div>;
    })}</div></div></div><div className="co-submodal-error" role="alert">{error}</div></div>
    <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy}>{busy ? "Saving…" : "Confirm"}</button></div>
  </form></div>;
}

function RejectedReasonModal({ reason, onClose }) {
  if (!reason) return null;
  return <div className="co-submodal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="co-submodal-dialog reject-reason-dialog" role="dialog" aria-modal="true"><button type="button" className="co-submodal-close" onClick={onClose} aria-label="Close rejected reason"/><div className="co-submodal-header req-edit-header"><div className="req-edit-icon req-edit-icon--danger"><ClassicOrderIcon name="x-circle"/></div><div><div className="co-submodal-title">Rejected reason</div><div className="co-submodal-sub">Reason saved with this rejected component.</div></div></div><div className="co-submodal-body"><div className="rejected-reason-view-text">{reason}</div></div><div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--dark" onClick={onClose}>Done</button></div></div></div>;
}

function CreatorProfilePopover({ state, onClose }) {
  if (!state) return null;
  const profile = state.profile || {};
  const name = text(profile.name || state.name) || "Creator";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
  const subtitle = [text(profile.position), text(profile.department)].filter(Boolean).join(" • ") || "Team member";
  return <div className="creator-profile-popover is-open" style={{ left: state.left, top: state.top }} aria-hidden="false"><div className="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile">
    <button type="button" className="creator-profile-close" onClick={onClose} aria-label="Close"><span className="creator-profile-close-x">×</span></button>
    <div className="creator-profile-head"><div className={`creator-profile-avatar ${profile.photoUrl ? "has-image" : ""}`}>{profile.photoUrl ? <img src={profile.photoUrl} alt={name}/> : <span>{initials}</span>}</div><div className="creator-profile-title-wrap"><div className="creator-profile-kicker">Created by</div><div className="creator-profile-name">{name}</div><div className="creator-profile-subtitle">{subtitle}</div></div></div>
    {state.loading ? <div className="creator-profile-state"><span>Loading user details...</span></div> : state.error ? <div className="creator-profile-state creator-profile-state--error"><span>Could not load this user details.</span></div> : <div className="next-classic-creator-fields">{profile.email ? <div><span>Email</span><strong>{profile.email}</strong></div> : null}{profile.phone ? <div><span>Phone</span><strong>{profile.phone}</strong></div> : null}{profile.department ? <div><span>Department</span><strong>{profile.department}</strong></div> : null}{profile.position ? <div><span>Position</span><strong>{profile.position}</strong></div> : null}</div>}
  </div></div>;
}

export default function OrdersReviewClient({ initialOrders = [], bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [busyIds, setBusyIds] = useState(new Set());
  const [notice, setNotice] = useState("");
  const [passwordState, setPasswordState] = useState(null);
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [rejectionState, setRejectionState] = useState(null);
  const [rejectionError, setRejectionError] = useState("");
  const [rejectionBusy, setRejectionBusy] = useState(false);
  const [editorState, setEditorState] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [reasonView, setReasonView] = useState("");
  const [creatorState, setCreatorState] = useState(null);

  useClassicHeaderSearch(query, setQuery, "Search by reason or item...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (REVIEW_TABS.some((item) => item.key === requestedTab)) setTab(requestedTab);
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
    const close = (event) => {
      if (!creatorState) return;
      if (event.target.closest?.(".creator-profile-popover") || event.target.closest?.(".co-creator-btn")) return;
      setCreatorState(null);
    };
    const key = (event) => { if (event.key === "Escape") setCreatorState(null); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", key); };
  }, [creatorState]);

  const allGroups = useMemo(() => buildGroups(orders), [orders]);
  const selected = useMemo(() => allGroups.find((group) => group.key === selectedKey) || null, [allGroups, selectedKey]);
  const statusRows = useMemo(() => {
    if (tab === "all") return orders.filter((item) => !isArchived(item));
    if (tab === "archive") return orders.filter(isArchived);
    return orders.filter((item) => !isArchived(item) && approvalKey(item?.approval ?? item?.svApproval ?? item?.sv_approval) === tab);
  }, [orders, tab]);
  const statusGroups = useMemo(() => buildGroups(statusRows), [statusRows]);
  const typeOptions = useMemo(() => {
    const map = new Map();
    statusGroups.forEach((group) => {
      const key = orderTypeKey(group.orderType) || "other";
      const meta = orderTypeMeta(group.orderType, group.orderTypeColor);
      const current = map.get(key) || { key, raw: group.orderType, color: group.orderTypeColor, label: meta.label, count: 0 };
      current.count += 1;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [statusGroups]);
  const visibleGroups = useMemo(() => {
    const needle = lower(query);
    return statusGroups.filter((group) => {
      if (type !== "all" && (orderTypeKey(group.orderType) || "other") !== type) return false;
      return !needle || groupSearchText(group).includes(needle);
    });
  }, [statusGroups, type, query]);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }
  async function refreshOrders() {
    const [activeResponse, archiveResponse] = await Promise.all([
      fetch("/api/sv-orders?tab=all", { credentials: "include", cache: "no-store" }),
      fetch("/api/sv-orders?tab=archive", { credentials: "include", cache: "no-store" }),
    ]);
    if (activeResponse.status === 401 || archiveResponse.status === 401) { window.location.href = "/login?next=/next/orders-review"; return; }
    const [activeData, archiveData] = await Promise.all([readJson(activeResponse), readJson(archiveResponse)]);
    if (!activeResponse.ok) throw new Error(activeData?.error || "Failed to refresh review orders.");
    if (!archiveResponse.ok) throw new Error(archiveData?.error || "Failed to refresh archived review orders.");
    setOrders([...(Array.isArray(activeData) ? activeData : []), ...(Array.isArray(archiveData) ? archiveData : [])]);
  }
  async function updateDecision(item, decision, rejectedReason = "") {
    const id = text(item?.id);
    if (!id) return;
    setBusyIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/sv-orders/${encodeURIComponent(id)}/approval`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ decision, rejectedReason }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to update approval.");
      setOrders((current) => current.map((row) => text(row?.id) === id ? { ...row, approval: normalizeApproval(decision), rejectedReason: normalizeApproval(decision) === "Rejected" ? text(rejectedReason) : "", status: data?.status || row?.status } : row));
      showNotice(`Component marked as ${normalizeApproval(decision)}.`);
    } finally {
      setBusyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }
  function beginDecision(item, decision) {
    if (decision === "Rejected") { setRejectionError(""); setRejectionState({ key: `item:${text(item?.id)}`, item }); return; }
    updateDecision(item, decision).catch((error) => showNotice(error?.message || "Decision could not be saved."));
  }
  function beginBulkDecision(group, decision) {
    if (decision === "Rejected") { setRejectionError(""); setRejectionState({ key: `group:${group.key}`, group }); return; }
    submitBulkDecision(group, decision, "").catch((error) => showNotice(error?.message || "Bulk decision could not be saved."));
  }
  async function submitBulkDecision(group, decision, rejectedReason) {
    for (const item of group?.items || []) {
      if (normalizeApproval(item?.approval ?? item?.svApproval ?? item?.sv_approval) === normalizeApproval(decision) && decision !== "Rejected") continue;
      await updateDecision(item, decision, rejectedReason);
    }
  }
  async function submitRejection(reason) {
    if (!rejectionState) return;
    setRejectionBusy(true); setRejectionError("");
    try {
      if (rejectionState.group) await submitBulkDecision(rejectionState.group, "Rejected", reason); else await updateDecision(rejectionState.item, "Rejected", reason);
      setRejectionState(null);
    } catch (error) { setRejectionError(error?.message || "The rejection could not be saved."); } finally { setRejectionBusy(false); }
  }
  async function saveQuantity(item, value) {
    const id = text(item?.id); const number = Number(value);
    if (!id || !Number.isFinite(number)) return;
    setBusyIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/sv-orders/${encodeURIComponent(id)}/quantity`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ value: number }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to update quantity.");
      setOrders((current) => current.map((row) => text(row?.id) === id ? { ...row, quantityEdited: data?.cleared ? null : finite(data?.value, number) } : row));
      showNotice("Quantity updated.");
    } catch (error) { showNotice(error?.message || "Quantity could not be updated."); } finally { setBusyIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
  }
  function beginPasswordAction(action, group) { setPasswordError(""); setPasswordState({ action, group }); }
  async function submitPasswordAction(password) {
    if (!passwordState) return;
    const { action, group } = passwordState; const config = PASSWORD_ACTIONS[action];
    setPasswordBusy(true); setPasswordError("");
    try {
      const response = await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ orderIds: group.orderIds, adminPassword: password }) });
      const data = await readJson(response);
      if (response.status === 401) throw new Error("Wrong password. Please try again.");
      if (!response.ok) throw new Error(data?.error || "The protected action could not be completed.");
      if (action === "editReview") { setPasswordState(null); setEditorState({ group, password }); return; }
      await refreshOrders(); setPasswordState(null); setSelectedKey(""); showNotice(action === "archive" ? "Order moved to Archive." : "Order restored from Archive.");
    } catch (error) { setPasswordError(error?.message || "The protected action could not be completed."); } finally { setPasswordBusy(false); }
  }
  async function submitReviewEditor(approvals) {
    if (!editorState) return;
    setEditorBusy(true); setEditorError("");
    try {
      const response = await fetch("/api/sv-orders/actions/update-approval", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ orderIds: editorState.group.orderIds, adminPassword: editorState.password, approvals }) });
      const data = await readJson(response);
      if (response.status === 401) throw new Error("The verified password is no longer valid.");
      if (!response.ok) throw new Error(data?.error || "Review decisions could not be updated.");
      await refreshOrders(); setEditorState(null); showNotice("Review decisions updated.");
    } catch (error) { setEditorError(error?.message || "Review decisions could not be updated."); } finally { setEditorBusy(false); }
  }
  async function openCreatorProfile(anchor, group) {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 28);
    const left = Math.min(Math.max(14, rect.right - width), Math.max(14, window.innerWidth - width - 14));
    const top = Math.min(Math.max(14, rect.bottom + 10), Math.max(14, window.innerHeight - 360));
    const base = { left, top, name: group.createdByName || "Creator", loading: true, profile: null, error: false };
    setCreatorState(base);
    const key = text(group.createdById || group.createdByName);
    if (!key) { setCreatorState({ ...base, loading: false, error: true }); return; }
    try {
      const response = await fetch(`/api/team-members/${encodeURIComponent(key)}/public`, { credentials: "include", cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to load user profile.");
      setCreatorState({ ...base, loading: false, profile: data, error: false });
    } catch { setCreatorState({ ...base, loading: false, error: true }); }
  }

  return <section className="next-classic-orders-parity">
    {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders/sv-orders?classic=1">Classic page</a></div> : null}
    {notice ? <div className="orders-parity-success" role="status"><ClassicOrderIcon name="check-circle" />{notice}</div> : null}
    <div className="orders-toolbar" aria-label="Orders review tools">
      <div className="orders-toolbar__scroll"><div className="portfolio-tabs portfolio-tabs--iconic" role="tablist" aria-label="Orders Review status">{REVIEW_TABS.map((item) => <button type="button" className={`tab-portfolio order-status-tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}><span className="order-status-tab__icon"><ClassicOrderIcon name={item.icon}/></span><span className="order-status-tab__label">{item.label}</span></button>)}</div></div>
      <div className="orders-toolbar__divider" aria-hidden="true"/><TypeFilter value={type} options={typeOptions} onChange={setType}/>
    </div>
    <section className="card" id="sv-orders"><div className="co-cards" id="sv-list">{visibleGroups.length ? visibleGroups.map((group) => <OrderReviewCard group={group} activeTab={tab} onOpen={(value) => setSelectedKey(value.key)} onCreator={openCreatorProfile} key={group.key}/>) : <div className="ops-no-data-state" role="status" aria-live="polite"><img className="ops-no-data-state__image" src="/images/no-data-illustration.png" alt="" loading="lazy"/><div className="ops-no-data-state__text">Sorry, No data available</div></div>}</div></section>

    <ReviewDetailsModal group={selected} activeTab={tab} busyIds={busyIds} onClose={() => setSelectedKey("")} onQuantitySave={saveQuantity} onDecision={beginDecision} onBulkDecision={beginBulkDecision} onPasswordAction={beginPasswordAction} onReason={setReasonView}/>
    <PasswordModal state={passwordState} busy={passwordBusy} error={passwordError} onCancel={() => { if (!passwordBusy) { setPasswordState(null); setPasswordError(""); } }} onSubmit={submitPasswordAction}/>
    <RejectionModal state={rejectionState} busy={rejectionBusy} error={rejectionError} onCancel={() => { if (!rejectionBusy) { setRejectionState(null); setRejectionError(""); } }} onSubmit={submitRejection}/>
    <ReviewEditorModal state={editorState} busy={editorBusy} error={editorError} onCancel={() => { if (!editorBusy) { setEditorState(null); setEditorError(""); } }} onSubmit={submitReviewEditor}/>
    <RejectedReasonModal reason={reasonView} onClose={() => setReasonView("")}/>
    <CreatorProfilePopover state={creatorState} onClose={() => setCreatorState(null)}/>
  </section>;
}

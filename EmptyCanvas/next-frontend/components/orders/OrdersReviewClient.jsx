"use client";

import { useEffect, useMemo, useState } from "react";

const REVIEW_TABS = [
  { key: "all", label: "All", icon: "▦" },
  { key: "not-started", label: "Not Started", icon: "◌" },
  { key: "approved", label: "Approved", icon: "✓" },
  { key: "rejected", label: "Rejected", icon: "×" },
  { key: "archive", label: "Archive", icon: "▣" },
];

const PASSWORD_ACTIONS = {
  archive: {
    title: "Archive order",
    description: "Enter the Orders Review admin password to move this order to Archive.",
    button: "Archive",
    endpoint: "/api/sv-orders/actions/archive",
  },
  unarchive: {
    title: "UnArchive order",
    description: "Enter the Orders Review admin password to restore this order.",
    button: "UnArchive",
    endpoint: "/api/sv-orders/actions/unarchive",
  },
  editReview: {
    title: "Edit review decisions",
    description: "Verify the Orders Review admin password before changing component approval statuses.",
    button: "Continue",
    endpoint: "/api/sv-orders/actions/verify-edit",
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

function isArchived(item) {
  return /archive/.test(lower(item?.status));
}

function effectiveQuantity(item) {
  const edited = item?.quantityEdited ?? item?.quantity_edited_by_supervisor;
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  return finite(item?.quantityRequested ?? item?.quantity);
}

function itemTotal(item) {
  return Math.abs(effectiveQuantity(item)) * Math.abs(finite(item?.unitPrice ?? item?.unit_price));
}

function orderTypeKey(value) {
  return lower(value).replace(/[^a-z0-9]/g, "");
}

function orderTypeMeta(value) {
  const key = orderTypeKey(value);
  if (key === "requestproducts") return { label: "Request Products", icon: "▤", className: "type-request" };
  if (key === "withdrawproducts") return { label: "Withdraw Products", icon: "↗", className: "type-withdraw" };
  if (key === "requestmaintenance") return { label: "Request Maintenance", icon: "⌘", className: "type-maintenance" };
  return { label: text(value) || "Order", icon: "□", className: "type-default" };
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
        key,
        items: [],
        latestCreated: item?.createdTime,
        orderType: item?.orderType,
        createdByName: item?.createdByName,
      });
    }
    const group = map.get(key);
    group.items.push(item);
    if (dateValue(item?.createdTime) > dateValue(group.latestCreated)) group.latestCreated = item?.createdTime;
    if (!group.orderType && item?.orderType) group.orderType = item.orderType;
    if (!group.createdByName && item?.createdByName) group.createdByName = item.createdByName;
  });

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
      approval: dominantApproval(group.items),
      archived: group.items.length > 0 && group.items.every(isArchived),
    };
  }).sort((a, b) => dateValue(b.latestCreated) - dateValue(a.latestCreated));
}

function groupSearchText(group) {
  return [
    group.orderIdLabel,
    group.reason,
    group.createdByName,
    orderTypeMeta(group.orderType).label,
    ...group.items.flatMap((item) => [item?.productName, item?.issueDescription, item?.rejectedReason]),
  ].map(lower).join(" ");
}

function statusLabel(value) {
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "mixed") return "Mixed review";
  if (value === "archive") return "Archive";
  return "Not Started";
}

function statusClass(value) {
  if (value === "approved") return "status-approved";
  if (value === "rejected") return "status-rejected";
  if (value === "mixed") return "status-mixed";
  if (value === "archive") return "status-archive";
  return "status-under-supervision";
}

function reviewProgress(value) {
  if (value === "approved" || value === "rejected") return 2;
  if (value === "mixed") return 1;
  return 1;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function OrderReviewCard({ group, onOpen }) {
  const type = orderTypeMeta(group.orderType);
  const state = group.archived ? "archive" : group.approval;
  return (
    <button type="button" className="next-order-card review-order-card" onClick={() => onOpen(group)}>
      <div className="next-order-card__top">
        <span className={`order-type-badge ${type.className}`}><b>{type.icon}</b>{type.label}</span>
        <span className={`order-status ${statusClass(state)}`}>{statusLabel(state)}</span>
      </div>
      <div className="next-order-card__content">
        <strong>{group.orderIdLabel}</strong>
        <h2>{group.reason}</h2>
        <p>{group.items.slice(0, 3).map((item) => text(item?.productName) || "Unnamed component").join(" · ")}</p>
      </div>
      <div className="review-card-progress" aria-label="Review progress">
        <span className="is-complete">1</span><i className={reviewProgress(state) >= 2 ? "is-complete" : ""} /><span className={reviewProgress(state) >= 2 ? "is-complete" : ""}>2</span>
        <small>Review</small><small>Decision</small>
      </div>
      <div className="next-order-card__bottom">
        <span><small>Created by</small><strong>{group.createdByName || "—"}</strong></span>
        <span><small>Components</small><strong>{group.items.length}</strong></span>
        <span><small>Estimate</small><strong>{formatMoney(group.total)}</strong></span>
      </div>
    </button>
  );
}

function QuantityEditor({ item, busy, onSave }) {
  const [value, setValue] = useState(formatQuantity(effectiveQuantity(item)));
  useEffect(() => setValue(formatQuantity(effectiveQuantity(item))), [item?.id, item?.quantityEdited, item?.quantity]);
  return (
    <form className="review-quantity-editor" onSubmit={(event) => { event.preventDefault(); onSave(item, value); }}>
      <input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} aria-label={`Quantity for ${text(item?.productName) || "component"}`} />
      <button type="submit" disabled={busy || !text(value)}>Save</button>
    </form>
  );
}

function ReviewDetailsModal({ group, busyIds, onClose, onQuantitySave, onDecision, onBulkDecision, onPasswordAction }) {
  useEffect(() => {
    if (!group) return undefined;
    const listener = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", listener);
    document.body.classList.add("next-modal-open");
    return () => { document.removeEventListener("keydown", listener); document.body.classList.remove("next-modal-open"); };
  }, [group, onClose]);

  if (!group) return null;
  const state = group.archived ? "archive" : group.approval;
  const rejectedReasons = [...new Set(group.items.map((item) => text(item?.rejectedReason ?? item?.rejected_reason)).filter(Boolean))];

  return (
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="next-order-modal review-order-modal" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} review details`}>
        <header className="next-order-modal__header">
          <div>
            <span className={`order-status ${statusClass(state)}`}>{statusLabel(state)}</span>
            <h2>{group.orderIdLabel}</h2>
            <p>{formatDate(group.latestCreated)} · {orderTypeMeta(group.orderType).label}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>

        {group.archived ? <div className="archive-banner">This order is archived.</div> : (
          <div className="order-progress review-order-progress" aria-label="Review progress">
            {["Under S.V", "Decision", "Operations", "Complete"].map((label, index) => (
              <div className={`order-progress__step ${index < (state === "approved" || state === "rejected" ? 2 : 1) ? "is-complete" : ""}`} key={label}>
                <span>{index < (state === "approved" || state === "rejected" ? 2 : 1) ? "✓" : index + 1}</span><small>{label}</small>
              </div>
            ))}
          </div>
        )}

        <div className="next-order-modal__meta">
          <span><small>Reason</small><strong>{group.reason}</strong></span>
          <span><small>Created by</small><strong>{group.createdByName || "—"}</strong></span>
          <span><small>Components</small><strong>{group.items.length}</strong></span>
          <span><small>Estimate</small><strong>{formatMoney(group.total)}</strong></span>
        </div>

        {rejectedReasons.length ? <div className="rejected-reason-box"><strong>Rejected reason</strong><p>{rejectedReasons.join("\n")}</p></div> : null}

        <div className="review-bulk-actions">
          <span>Apply decision to all components</span>
          <div>
            <button type="button" className="review-approve-button" onClick={() => onBulkDecision(group, "Approved")}>Approve all</button>
            <button type="button" className="review-reject-button" onClick={() => onBulkDecision(group, "Rejected")}>Reject all</button>
          </div>
        </div>

        <div className="next-order-items review-order-items">
          {group.items.map((item, index) => {
            const approval = approvalKey(item?.approval ?? item?.svApproval ?? item?.sv_approval);
            const itemBusy = busyIds.has(text(item?.id));
            return (
              <article className="next-order-item review-order-item" key={`${item?.id || index}`}>
                <div className="next-order-item__image">
                  {item?.productImage ? <img src={item.productImage} alt="" /> : <span>{text(item?.productName).slice(0, 1).toUpperCase() || "P"}</span>}
                </div>
                <div className="next-order-item__body">
                  <strong>{text(item?.productName) || "Unnamed component"}</strong>
                  <small>Requested {formatQuantity(item?.quantityRequested ?? item?.quantity)} · {formatMoney(item?.unitPrice)}</small>
                  {text(item?.issueDescription) ? <p>{text(item.issueDescription)}</p> : null}
                  <QuantityEditor item={item} busy={itemBusy} onSave={onQuantitySave} />
                </div>
                <div className="review-item-actions">
                  <span className={`order-status ${statusClass(approval)}`}>{statusLabel(approval)}</span>
                  <div>
                    <button type="button" className="review-approve-button" disabled={itemBusy} onClick={() => onDecision(item, "Approved")}>Approve</button>
                    <button type="button" className="review-reject-button" disabled={itemBusy} onClick={() => onDecision(item, "Rejected")}>Reject</button>
                    <button type="button" className="review-reset-button" disabled={itemBusy} onClick={() => onDecision(item, "Not Started")}>Reset</button>
                  </div>
                  <strong>{formatMoney(itemTotal(item))}</strong>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="next-order-modal__actions">
          {!group.archived ? <button type="button" className="secondary-button" onClick={() => onPasswordAction("editReview", group)}>Edit decisions</button> : null}
          {!group.archived ? <button type="button" className="secondary-button" onClick={() => onPasswordAction("archive", group)}>Archive</button> : null}
          {group.archived ? <button type="button" className="secondary-button" onClick={() => onPasswordAction("unarchive", group)}>UnArchive</button> : null}
          <button type="button" className="primary-button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}

function PasswordModal({ state, busy, error, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  useEffect(() => setPassword(""), [state?.action, state?.group?.key]);
  if (!state) return null;
  const config = PASSWORD_ACTIONS[state.action];
  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="next-password-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
        <span className="password-modal-icon">⌁</span>
        <h2>{config.title}</h2>
        <p>{config.description}</p>
        <label><span>Admin password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" disabled={busy} /></label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="next-password-modal__actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy || !password.trim()}>{busy ? "Working…" : config.button}</button>
        </div>
      </form>
    </div>
  );
}

function RejectionModal({ state, busy, error, onCancel, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [state?.key]);
  if (!state) return null;
  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="next-password-modal review-rejection-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}>
        <span className="password-modal-icon is-danger">!</span>
        <h2>Rejected reason</h2>
        <p>Add the reason that should be saved with the rejected component{state.group ? "s" : ""}.</p>
        <label><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} autoFocus rows={5} disabled={busy} /></label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="next-password-modal__actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="danger-button" disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Reject"}</button>
        </div>
      </form>
    </div>
  );
}

function ReviewEditorModal({ state, busy, error, onCancel, onSubmit }) {
  const [approvals, setApprovals] = useState({});
  useEffect(() => {
    if (!state?.group) return;
    const next = {};
    state.group.items.forEach((item) => { next[text(item?.id)] = normalizeApproval(item?.approval); });
    setApprovals(next);
  }, [state?.group?.key]);
  if (!state?.group) return null;
  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="review-editor-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(approvals); }}>
        <header><div><span className="pill">Protected edit</span><h2>Edit review decisions</h2><p>{state.group.orderIdLabel}</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></header>
        <div className="review-editor-list">
          {state.group.items.map((item) => (
            <label key={text(item?.id)}>
              <span><strong>{text(item?.productName) || "Unnamed component"}</strong><small>Qty {formatQuantity(effectiveQuantity(item))}</small></span>
              <select value={approvals[text(item?.id)] || "Not Started"} onChange={(event) => setApprovals((current) => ({ ...current, [text(item?.id)]: event.target.value }))} disabled={busy}>
                <option>Not Started</option><option>Approved</option><option>Rejected</option>
              </select>
            </label>
          ))}
        </div>
        {error ? <div className="form-error">{error}</div> : null}
        <footer><button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save decisions"}</button></footer>
      </form>
    </div>
  );
}

export default function OrdersReviewClient({ initialOrders = [], bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [tab, setTab] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(36);
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
    setVisibleLimit(36);
  }, [tab, type, query]);

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
      const meta = orderTypeMeta(group.orderType);
      const current = map.get(key) || { key, label: meta.label, count: 0 };
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

  const tabCounts = useMemo(() => {
    const counts = {
      all: buildGroups(orders.filter((item) => !isArchived(item))).length,
      archive: buildGroups(orders.filter(isArchived)).length,
    };
    ["not-started", "approved", "rejected"].forEach((key) => {
      counts[key] = buildGroups(orders.filter((item) => !isArchived(item) && approvalKey(item?.approval) === key)).length;
    });
    return counts;
  }, [orders, allGroups.length]);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function refreshOrders() {
    const [activeResponse, archiveResponse] = await Promise.all([
      fetch("/api/sv-orders?tab=all", { credentials: "include", cache: "no-store" }),
      fetch("/api/sv-orders?tab=archive", { credentials: "include", cache: "no-store" }),
    ]);
    if (activeResponse.status === 401 || archiveResponse.status === 401) {
      window.location.href = "/login?next=/next/orders-review";
      return;
    }
    const [activeData, archiveData] = await Promise.all([readJson(activeResponse), readJson(archiveResponse)]);
    if (!activeResponse.ok) throw new Error(activeData?.error || "Failed to refresh review orders.");
    if (!archiveResponse.ok) throw new Error(archiveData?.error || "Failed to refresh archived review orders.");
    setOrders([
      ...(Array.isArray(activeData) ? activeData : []),
      ...(Array.isArray(archiveData) ? archiveData : []),
    ]);
  }

  async function updateDecision(item, decision, rejectedReason = "") {
    const id = text(item?.id);
    if (!id) return;
    setBusyIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/sv-orders/${encodeURIComponent(id)}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision, rejectedReason }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to update approval.");
      setOrders((current) => current.map((row) => text(row?.id) === id ? {
        ...row,
        approval: normalizeApproval(decision),
        rejectedReason: normalizeApproval(decision) === "Rejected" ? text(rejectedReason) : "",
        status: data?.status || row?.status,
      } : row));
      showNotice(`Component marked as ${normalizeApproval(decision)}.`);
    } finally {
      setBusyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  function beginDecision(item, decision) {
    if (decision === "Rejected") {
      setRejectionError("");
      setRejectionState({ key: `item:${text(item?.id)}`, item });
      return;
    }
    updateDecision(item, decision).catch((error) => showNotice(error?.message || "Decision could not be saved."));
  }

  function beginBulkDecision(group, decision) {
    if (decision === "Rejected") {
      setRejectionError("");
      setRejectionState({ key: `group:${group.key}`, group });
      return;
    }
    submitBulkDecision(group, decision, "").catch((error) => showNotice(error?.message || "Bulk decision could not be saved."));
  }

  async function submitBulkDecision(group, decision, rejectedReason) {
    const items = group?.items || [];
    for (const item of items) {
      if (normalizeApproval(item?.approval) === normalizeApproval(decision) && decision !== "Rejected") continue;
      await updateDecision(item, decision, rejectedReason);
    }
  }

  async function submitRejection(reason) {
    if (!rejectionState) return;
    setRejectionBusy(true);
    setRejectionError("");
    try {
      if (rejectionState.group) await submitBulkDecision(rejectionState.group, "Rejected", reason);
      else await updateDecision(rejectionState.item, "Rejected", reason);
      setRejectionState(null);
    } catch (error) {
      setRejectionError(error?.message || "The rejection could not be saved.");
    } finally {
      setRejectionBusy(false);
    }
  }

  async function saveQuantity(item, value) {
    const id = text(item?.id);
    const number = Number(value);
    if (!id || !Number.isFinite(number)) return;
    setBusyIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/sv-orders/${encodeURIComponent(id)}/quantity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: number }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to update quantity.");
      setOrders((current) => current.map((row) => text(row?.id) === id ? {
        ...row,
        quantityEdited: data?.cleared ? null : finite(data?.value, number),
      } : row));
      showNotice("Quantity updated.");
    } catch (error) {
      showNotice(error?.message || "Quantity could not be updated.");
    } finally {
      setBusyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  function beginPasswordAction(action, group) {
    setPasswordError("");
    setPasswordState({ action, group });
  }

  async function submitPasswordAction(password) {
    if (!passwordState) return;
    const { action, group } = passwordState;
    const config = PASSWORD_ACTIONS[action];
    setPasswordBusy(true);
    setPasswordError("");
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: group.orderIds, adminPassword: password }),
      });
      const data = await readJson(response);
      if (response.status === 401) throw new Error("Wrong password. Please try again.");
      if (!response.ok) throw new Error(data?.error || "The protected action could not be completed.");

      if (action === "editReview") {
        setPasswordState(null);
        setEditorState({ group, password });
        return;
      }

      await refreshOrders();
      setPasswordState(null);
      setSelectedKey("");
      showNotice(action === "archive" ? "Order moved to Archive." : "Order restored from Archive.");
    } catch (error) {
      setPasswordError(error?.message || "The protected action could not be completed.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function submitReviewEditor(approvals) {
    if (!editorState) return;
    setEditorBusy(true);
    setEditorError("");
    try {
      const response = await fetch("/api/sv-orders/actions/update-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: editorState.group.orderIds, adminPassword: editorState.password, approvals }),
      });
      const data = await readJson(response);
      if (response.status === 401) throw new Error("The verified password is no longer valid.");
      if (!response.ok) throw new Error(data?.error || "Review decisions could not be updated.");
      await refreshOrders();
      setEditorState(null);
      showNotice("Review decisions updated.");
    } catch (error) {
      setEditorError(error?.message || "Review decisions could not be updated.");
    } finally {
      setEditorBusy(false);
    }
  }

  return (
    <section className="next-orders-page next-review-page">
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders/sv-orders?classic=1">Classic page</a></div> : null}
      {notice ? <div className="orders-success-notice">✓ {notice}</div> : null}

      <div className="next-orders-toolbar">
        <div className="next-orders-tabs" role="tablist" aria-label="Orders Review status">
          {REVIEW_TABS.map((item) => (
            <button type="button" className={tab === item.key ? "is-active" : ""} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}>
              <span>{item.icon}</span><b>{item.label}</b><em>{tabCounts[item.key] || 0}</em>
            </button>
          ))}
        </div>
        <div className="next-orders-tools">
          <label className="next-orders-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by order, reason, creator or component…" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button> : null}</label>
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by order type"><option value="all">All order types</option>{typeOptions.map((option) => <option value={option.key} key={option.key}>{option.label} ({option.count})</option>)}</select>
          <a className="classic-page-link" href="/orders/sv-orders?classic=1">Classic</a>
        </div>
      </div>

      <div className="next-orders-summary">
        <span><strong>{visibleGroups.length}</strong> visible orders</span>
        <span><strong>{statusRows.length}</strong> components in this status</span>
        <span><strong>{formatMoney(visibleGroups.reduce((sum, group) => sum + group.total, 0))}</strong> estimated total</span>
      </div>

      {visibleGroups.length ? <><div className="next-orders-grid">{visibleGroups.slice(0, visibleLimit).map((group) => <OrderReviewCard group={group} onOpen={(value) => setSelectedKey(value.key)} key={group.key} />)}</div>{visibleGroups.length > visibleLimit ? <button className="load-more-button" type="button" onClick={() => setVisibleLimit((value) => value + 36)}>Show more orders</button> : null}</> : <div className="next-orders-empty"><span>⌕</span><h2>No review orders found</h2><p>Try another status, order type, or search phrase.</p><button type="button" className="secondary-button" onClick={() => { setTab("all"); setType("all"); setQuery(""); }}>Clear filters</button></div>}

      <ReviewDetailsModal group={selected} busyIds={busyIds} onClose={() => setSelectedKey("")} onQuantitySave={saveQuantity} onDecision={beginDecision} onBulkDecision={beginBulkDecision} onPasswordAction={beginPasswordAction} />
      <PasswordModal state={passwordState} busy={passwordBusy} error={passwordError} onCancel={() => { if (!passwordBusy) { setPasswordState(null); setPasswordError(""); } }} onSubmit={submitPasswordAction} />
      <RejectionModal state={rejectionState} busy={rejectionBusy} error={rejectionError} onCancel={() => { if (!rejectionBusy) { setRejectionState(null); setRejectionError(""); } }} onSubmit={submitRejection} />
      <ReviewEditorModal state={editorState} busy={editorBusy} error={editorError} onCancel={() => { if (!editorBusy) { setEditorState(null); setEditorError(""); } }} onSubmit={submitReviewEditor} />
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_TABS = [
  { key: "all", label: "All", icon: "▦" },
  { key: "approved", label: "Approved", icon: "✓" },
  { key: "rejected", label: "Rejected", icon: "×" },
  { key: "remaining", label: "Remaining", icon: "◷" },
  { key: "received", label: "Shipping", icon: "➜" },
  { key: "delivered", label: "Delivered", icon: "⌂" },
  { key: "archive", label: "Archive", icon: "▣" },
];

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
  if (key === "requestproducts") return { label: "Request Products", icon: "▤", className: "type-request" };
  if (key === "withdrawproducts") return { label: "Withdraw Products", icon: "↗", className: "type-withdraw" };
  if (key === "requestmaintenance") return { label: "Request Maintenance", icon: "⌘", className: "type-maintenance" };
  return { label: text(value) || "Order", icon: "□", className: "type-default" };
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

function OperationsOrderCard({ group, tab, onOpen }) {
  const type = orderTypeMeta(group.orderType);
  const value = tab === "remaining" ? group.remainingTotal : tab === "received" ? group.receivedTotal : group.total;
  return (
    <button type="button" className="next-order-card operations-order-card" onClick={() => onOpen(group)}>
      <div className="next-order-card__top">
        <span className={`next-order-type ${type.className}`} aria-hidden="true">{type.icon}</span>
        <span className="next-order-card__title">
          <strong>{group.orderIdLabel}</strong>
          <small>{formatDate(group.latestCreated)}</small>
        </span>
        <span className="next-order-card__count">×{group.items.length}</span>
      </div>
      <div className="next-order-card__reason">{group.reason}</div>
      <div className="operations-card-meta">
        <span><small>Created by</small><strong>{group.createdByName || "—"}</strong></span>
        <span><small>{tab === "remaining" ? "Remaining value" : tab === "received" ? "Received value" : "Estimate total"}</small><strong>{formatMoney(value)}</strong></span>
      </div>
      <div className="next-order-card__bottom">
        <span><small>Operations</small><strong>{group.operationsByName || "Not assigned"}</strong></span>
        <span className={`order-status ${statusClass(group)}`}>{statusLabel(group)}</span>
      </div>
    </button>
  );
}

function Progress({ stage }) {
  const labels = ["Supervision", "In progress", "Shipping", "Delivered"];
  const progress = Math.min(4, Math.max(1, stage >= 5 ? 4 : stage));
  return (
    <div className="order-progress operations-progress" aria-label="Order progress">
      {labels.map((label, index) => (
        <div className={`order-progress__step ${index + 1 <= progress ? "is-complete" : ""}`} key={label}>
          <span>{index + 1}</span><small>{label}</small>
        </div>
      ))}
    </div>
  );
}

function OrderModal({ group, tab, busy, onClose, onAction, onExport }) {
  useEffect(() => {
    if (!group) return undefined;
    document.body.classList.add("next-modal-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("next-modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [group, onClose]);

  if (!group) return null;
  const maintenance = isMaintenance(group.orderType);
  const type = orderTypeMeta(group.orderType);
  const archived = group.stage >= 5;
  const delivered = group.stage === 4;
  const shipping = group.stage === 3;
  const canReceive = group.stage === 2 && group.hasApproved && !maintenance;
  const canReview = group.stage <= 2 && !archived;

  return (
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="next-order-modal operations-order-modal" role="dialog" aria-modal="true" aria-labelledby="operations-order-title">
        <header className="next-order-modal__header">
          <div>
            <span className={`order-type-badge ${type.className}`}><b>{type.icon}</b>{type.label}</span>
            <h2 id="operations-order-title">{group.orderIdLabel}</h2>
            <p>{formatDate(group.latestCreated)} · {group.createdByName || "Unknown creator"}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <Progress stage={group.stage} />
        {archived ? <div className="archive-banner">This order is currently archived.</div> : null}
        {group.rejectedReason ? <div className="operations-rejection-banner"><strong>Rejected reason</strong><span>{group.rejectedReason}</span></div> : null}

        <div className="next-order-modal__meta operations-modal-meta">
          <span><small>Reason</small><strong>{group.reason}</strong></span>
          <span><small>Components</small><strong>{group.items.length}</strong></span>
          <span><small>Total value</small><strong>{formatMoney(group.total)}</strong></span>
          <span><small>Received by</small><strong>{group.operationsByName || "—"}</strong></span>
          <span><small>Receipt numbers</small><strong>{group.receiptNumber || "—"}</strong></span>
        </div>

        {group.receiptEntries.length ? (
          <div className="operations-receipts">
            <strong>Receipt photos</strong>
            <div>{group.receiptEntries.map((entry, index) => <a href={entry.url} target="_blank" rel="noreferrer" key={`${entry.url}-${index}`}>{entry.name}</a>)}</div>
          </div>
        ) : null}

        <div className="next-order-items">
          {group.items.map((item) => {
            const state = itemStatus(item);
            const base = baseQuantity(item);
            const received = receivedQuantity(item);
            const remaining = remainingQuantity(item);
            return (
              <article className="next-order-item operations-order-item" key={text(item?.id)}>
                <span className="next-order-item__image">{text(item?.productName).slice(0, 1).toUpperCase() || "P"}</span>
                <div className="next-order-item__body">
                  <strong>{text(item?.productName) || "Product"}</strong>
                  <small>Requested: {formatQuantity(base)} · Received: {formatQuantity(received)} · Remaining: {formatQuantity(remaining)}</small>
                  {text(item?.issueDescription) ? <p>{text(item.issueDescription)}</p> : null}
                  {text(item?.actualIssueDescription) ? <p><b>Actual issue:</b> {text(item.actualIssueDescription)}</p> : null}
                  {text(item?.repairAction) ? <p><b>Repair:</b> {text(item.repairAction)}</p> : null}
                  {itemRejectedReason(item) ? <p className="item-rejection-reason">{itemRejectedReason(item)}</p> : null}
                </div>
                <div className="next-order-item__aside">
                  <span className={`order-status ${state.className}`}>{state.label}</span>
                  <strong>{formatMoney(itemTotal(item))}</strong>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="next-order-modal__actions operations-modal-actions">
          {canReview ? <button type="button" className="review-approve-button" onClick={() => onAction("approve", group)} disabled={busy}>Approve</button> : null}
          {canReview ? <button type="button" className="review-reject-button" onClick={() => onAction("reject", group)} disabled={busy}>Reject</button> : null}
          {canReceive ? <button type="button" className="primary-button" onClick={() => onAction("receive", group)} disabled={busy}>Received by operations</button> : null}
          {maintenance && group.stage < 4 && !archived ? <a className="secondary-button" href={`/next/maintenance-orders?tab=${shipping ? "in-progress" : "not-started"}`}>Open maintenance workflow</a> : null}
          {shipping ? <button type="button" className="primary-button" onClick={() => onAction("deliver", group)} disabled={busy}>Mark delivered</button> : null}
          {delivered && orderTypeKey(group.orderType) === "requestproducts" ? <button type="button" className="secondary-button" onClick={() => onAction("withdrawal", group)} disabled={busy}>Create Withdrawal</button> : null}
          {delivered && orderTypeKey(group.orderType) === "withdrawproducts" ? <button type="button" className="secondary-button" onClick={() => onAction("delivery", group)} disabled={busy}>Create Delivery</button> : null}
          {!archived ? <button type="button" className="secondary-button" onClick={() => onAction("archive", group)} disabled={busy}>Archive</button> : null}
          {archived ? <button type="button" className="secondary-button" onClick={() => onAction("unarchive", group)} disabled={busy}>UnArchive</button> : null}
          <button type="button" className="secondary-button" onClick={() => onExport("pdf", group, tab)} disabled={busy}>PDF</button>
          <button type="button" className="secondary-button" onClick={() => onExport("excel", group, tab)} disabled={busy}>Excel</button>
          <a className="secondary-button" href={`/orders/requested?tab=${encodeURIComponent(tab)}`}>Classic workflow</a>
          <button type="button" className="primary-button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}

function RejectModal({ state, busy, error, onCancel, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [state?.group?.key]);
  if (!state) return null;
  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="next-password-modal operations-text-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}>
        <span className="password-modal-icon is-danger">!</span>
        <h2>Reject operations order</h2>
        <p>Enter the reason that will be saved for every selected component in this order.</p>
        <label><span>Rejected reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} autoFocus disabled={busy} /></label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="next-password-modal__actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="danger-button" disabled={busy || !reason.trim()}>{busy ? "Saving…" : "Reject"}</button>
        </div>
      </form>
    </div>
  );
}

function ArchiveModal({ state, busy, error, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  useEffect(() => setPassword(""), [state?.group?.key]);
  if (!state) return null;
  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="next-password-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
        <span className="password-modal-icon">▣</span>
        <h2>Archive operations order</h2>
        <p>Enter the Operations Orders admin password to move this order to Archive.</p>
        <label><span>Admin password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus disabled={busy} /></label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="next-password-modal__actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy || !password.trim()}>{busy ? "Archiving…" : "Archive"}</button>
        </div>
      </form>
    </div>
  );
}

function ReceiveModal({ state, busy, error, onCancel, onSubmit }) {
  const group = state?.group;
  const [receiptNumber, setReceiptNumber] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [quantities, setQuantities] = useState({});

  useEffect(() => {
    if (!group) return;
    const initial = {};
    group.items.forEach((item) => { initial[text(item?.id)] = formatQuantity(Math.abs(remainingQuantity(item))); });
    setQuantities(initial);
    setReceiptNumber("");
    setIssueDescription("");
  }, [group]);

  if (!group) return null;
  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="operations-action-modal" onSubmit={(event) => { event.preventDefault(); onSubmit({ receiptNumber, issueDescription, quantities }); }}>
        <header><div><span className="pill">Operations receipt</span><h2>Receive components</h2><p>Enter how much is being received now. The backend stores the resulting absolute received quantity.</p></div><button type="button" className="icon-button" onClick={onCancel}>×</button></header>
        <div className="operations-action-fields">
          <label><span>Receipt number (optional)</span><input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} placeholder="One or more receipt numbers" /></label>
          <label><span>Issue description (optional)</span><input value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} placeholder="Shared note for received components" /></label>
        </div>
        <div className="operations-quantity-list">
          {group.items.map((item) => {
            const id = text(item?.id);
            return <label key={id}><span><strong>{text(item?.productName) || "Product"}</strong><small>Already received {formatQuantity(receivedQuantity(item))} · Remaining {formatQuantity(remainingQuantity(item))}</small></span><input type="number" min="0" step="any" value={quantities[id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [id]: event.target.value }))} /></label>;
          })}
        </div>
        {error ? <div className="form-error">{error}</div> : null}
        <footer><button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Receiving…" : "Confirm receipt"}</button></footer>
      </form>
    </div>
  );
}

function ConfirmModal({ state, busy, error, onCancel, onSubmit }) {
  const [receiptNumbers, setReceiptNumbers] = useState("");
  useEffect(() => setReceiptNumbers(""), [state?.action, state?.group?.key]);
  if (!state) return null;
  const configs = {
    approve: ["Approve operations order", "Every component in this order will be approved by Operations.", "Approve"],
    deliver: ["Mark order delivered", "The order will move to Delivered and Supabase stocktaking synchronization will run.", "Mark delivered"],
    unarchive: ["Restore archived order", "The order will return to Approved/In progress.", "UnArchive"],
    withdrawal: ["Create withdrawal order", "A new withdrawal order will be created from delivered quantities.", "Create Withdrawal"],
    delivery: ["Create delivery order", "A new delivery order will be created from delivered quantities.", "Create Delivery"],
  };
  const config = configs[state.action] || ["Confirm action", "Continue with this operation?", "Continue"];
  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="next-password-modal" onSubmit={(event) => { event.preventDefault(); onSubmit({ receiptNumbers }); }}>
        <span className="password-modal-icon">⌁</span>
        <h2>{config[0]}</h2><p>{config[1]}</p>
        {state.action === "deliver" ? <label><span>Receipt numbers (optional)</span><input value={receiptNumbers} onChange={(event) => setReceiptNumbers(event.target.value)} placeholder="Separate values with commas" /></label> : null}
        {error ? <div className="form-error">{error}</div> : null}
        <div className="next-password-modal__actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Working…" : config[2]}</button></div>
      </form>
    </div>
  );
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
  const [visibleLimit, setVisibleLimit] = useState(36);

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
    setVisibleLimit(36);
  }, [tab, type, query]);

  const groups = useMemo(() => buildGroups(orders), [orders]);
  const tabGroups = useMemo(() => groupsForTab(groups, orders, tab), [groups, orders, tab]);
  const typeOptions = useMemo(() => {
    const map = new Map();
    tabGroups.forEach((group) => {
      const key = orderTypeKey(group.orderType) || "other";
      const meta = orderTypeMeta(group.orderType);
      const current = map.get(key) || { key, label: meta.label, count: 0 };
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

  const tabCounts = useMemo(() => {
    const counts = {};
    STATUS_TABS.forEach((item) => { counts[item.key] = groupsForTab(groups, orders, item.key).length; });
    return counts;
  }, [groups, orders]);

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

  return (
    <section className="next-orders-page next-operations-page">
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders/requested">Classic page</a></div> : null}
      {notice ? <div className="orders-success-notice">✓ {notice}</div> : null}

      <div className="next-orders-toolbar">
        <div className="next-orders-tabs" role="tablist" aria-label="Operations Orders status">
          {STATUS_TABS.map((item) => (
            <button type="button" className={tab === item.key ? "is-active" : ""} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}>
              <span>{item.icon}</span><b>{item.label}</b><em>{tabCounts[item.key] || 0}</em>
            </button>
          ))}
        </div>
        <div className="next-orders-tools">
          <label className="next-orders-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by order, reason, user, receipt or component…" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button> : null}</label>
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by order type"><option value="all">All order types</option>{typeOptions.map((option) => <option value={option.key} key={option.key}>{option.label} ({option.count})</option>)}</select>
          <a className="classic-page-link" href={`/orders/requested?tab=${encodeURIComponent(tab)}`}>Classic</a>
        </div>
      </div>

      <div className="next-orders-summary">
        <span><strong>{visibleGroups.length}</strong> visible orders</span>
        <span><strong>{visibleGroups.reduce((sum, group) => sum + group.items.length, 0)}</strong> components</span>
        <span><strong>{formatMoney(visibleGroups.reduce((sum, group) => sum + (tab === "remaining" ? group.remainingTotal : tab === "received" ? group.receivedTotal : group.total), 0))}</strong> selected value</span>
      </div>

      {visibleGroups.length ? (
        <>
          <div className="next-orders-grid">{visibleGroups.slice(0, visibleLimit).map((group) => <OperationsOrderCard group={group} tab={tab} onOpen={setSelected} key={group.key} />)}</div>
          {visibleGroups.length > visibleLimit ? <button type="button" className="load-more-button" onClick={() => setVisibleLimit((value) => value + 36)}>Load more ({visibleGroups.length - visibleLimit})</button> : null}
        </>
      ) : (
        <div className="next-orders-empty"><span>⌕</span><h2>No operations orders found</h2><p>Try a different status, order type, or search term.</p><a className="secondary-button" href="/orders/requested">Open classic Operations Orders</a></div>
      )}

      <OrderModal group={selected} tab={tab} busy={busy} onClose={() => setSelected(null)} onAction={beginAction} onExport={exportOrder} />
      <RejectModal state={actionState?.action === "reject" ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
      <ArchiveModal state={actionState?.action === "archive" ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
      <ReceiveModal state={actionState?.action === "receive" ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
      <ConfirmModal state={["approve", "deliver", "unarchive", "withdrawal", "delivery"].includes(actionState?.action) ? actionState : null} busy={busy} error={actionError} onCancel={() => setActionState(null)} onSubmit={submitAction} />
    </section>
  );
}

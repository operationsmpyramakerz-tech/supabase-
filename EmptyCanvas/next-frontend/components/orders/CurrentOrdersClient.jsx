"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_TABS = [
  { key: "all", label: "All", icon: "▦" },
  { key: "under-supervision", label: "Under S.V", icon: "◉" },
  { key: "approved", label: "Approved", icon: "✓" },
  { key: "rejected", label: "Rejected", icon: "×" },
  { key: "shipped", label: "Shipping", icon: "➜" },
  { key: "arrived", label: "Arrived", icon: "⌂" },
  { key: "archive", label: "Archive", icon: "▣" },
];

const ACTIONS = {
  edit: {
    title: "Edit order",
    description: "Enter the Current Orders admin password to open this order in the existing editor.",
    button: "Continue",
    endpoint: "/api/orders/current/edit/init",
  },
  archive: {
    title: "Archive order",
    description: "Enter the Current Orders admin password to move this order to Archive.",
    button: "Archive",
    endpoint: "/api/orders/current/archive",
  },
  unarchive: {
    title: "UnArchive order",
    description: "Enter the Current Orders admin password to restore this order to In progress.",
    button: "UnArchive",
    endpoint: "/api/orders/current/unarchive",
  },
  delete: {
    title: "Delete order",
    description: "This permanently deletes every component in this order. Enter the admin password to continue.",
    button: "Delete permanently",
    endpoint: "/api/orders/current/delete",
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

function effectiveQuantity(item) {
  const edited = item?.quantityEditedBySupervisor ?? item?.quantityProgress;
  if (edited !== null && edited !== undefined && edited !== "") return finite(edited);
  return finite(item?.quantityRequested ?? item?.quantity);
}

function itemTotal(item) {
  return effectiveQuantity(item) * finite(item?.unitPrice ?? item?.unit_price ?? item?.price);
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
  return STATUS_TABS.find((item) => item.key === tab)?.label || "Order";
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

function statusProgress(tab) {
  if (tab === "arrived") return 4;
  if (tab === "shipped") return 3;
  if (tab === "approved") return 2;
  return 1;
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

function OrderCard({ group, onOpen }) {
  const type = orderTypeMeta(group.orderType);
  return (
    <button type="button" className="next-order-card" onClick={() => onOpen(group)}>
      <div className="next-order-card__top">
        <span className={`next-order-type ${type.className}`} aria-hidden="true">{type.icon}</span>
        <span className="next-order-card__title">
          <strong>{group.orderIdLabel}</strong>
          <small>{formatDate(group.latestCreated)}</small>
        </span>
        <span className="next-order-card__count">×{group.items.length}</span>
      </div>
      <div className="next-order-card__reason">{group.reason}</div>
      <div className="next-order-card__bottom">
        <span><small>Estimate total</small><strong>{formatMoney(group.total)}</strong></span>
        <span className={`order-status status-${group.status}`}>{statusLabel(group.status)}</span>
      </div>
    </button>
  );
}

function OrderDetailsModal({ group, onClose, onAction }) {
  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("next-modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("next-modal-open");
    };
  }, [group, onClose]);

  if (!group) return null;
  const archived = group.status === "archive";
  const progress = statusProgress(group.status);
  const rejected = group.items.map(rejectedReason).filter(Boolean);

  return (
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="next-order-modal" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} details`}>
        <header className="next-order-modal__header">
          <div>
            <span className={`order-status status-${group.status}`}>{statusLabel(group.status)}</span>
            <h2>{group.orderIdLabel}</h2>
            <p>{formatDate(group.latestCreated)} · {orderTypeMeta(group.orderType).label}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>

        {archived ? (
          <div className="archive-banner">This order is archived.</div>
        ) : (
          <div className="order-progress" aria-label="Order progress">
            {["Under S.V", "Approved", "Shipping", "Arrived"].map((label, index) => (
              <div className={`order-progress__step ${index + 1 <= progress ? "is-complete" : ""}`} key={label}>
                <span>{index + 1 <= progress ? "✓" : index + 1}</span><small>{label}</small>
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

        {rejected.length ? (
          <div className="rejected-reason-box"><strong>Rejected reason</strong><p>{[...new Set(rejected)].join("\n")}</p></div>
        ) : null}

        <div className="next-order-items">
          {group.items.map((item, index) => {
            const itemStatus = statusTabForItem(item);
            return (
              <article className="next-order-item" key={`${item?.id || index}`}>
                <div className="next-order-item__image">
                  {item?.imageUrl ? <img src={item.imageUrl} alt="" /> : <span>{text(item?.productName).slice(0, 1).toUpperCase() || "P"}</span>}
                </div>
                <div className="next-order-item__body">
                  <strong>{text(item?.productName) || "Unnamed component"}</strong>
                  <small>Qty {effectiveQuantity(item)} · {formatMoney(item?.unitPrice)}</small>
                  {text(item?.issueDescription) ? <p>{text(item.issueDescription)}</p> : null}
                </div>
                <div className="next-order-item__aside">
                  <span className={`order-status status-${itemStatus}`}>{statusLabel(itemStatus)}</span>
                  <strong>{formatMoney(itemTotal(item))}</strong>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="next-order-modal__actions">
          {!archived ? <button type="button" className="secondary-button" onClick={() => onAction("edit", group)}>Edit</button> : null}
          {!archived ? <button type="button" className="secondary-button" onClick={() => onAction("archive", group)}>Archive</button> : null}
          {archived ? <button type="button" className="secondary-button" onClick={() => onAction("unarchive", group)}>UnArchive</button> : null}
          <button type="button" className="danger-button" onClick={() => onAction("delete", group)}>Delete</button>
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
  const config = ACTIONS[state.action];

  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="next-password-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
        <span className={`password-modal-icon ${config.danger ? "is-danger" : ""}`}>{config.danger ? "!" : "⌁"}</span>
        <h2>{config.title}</h2>
        <p>{config.description}</p>
        <label>
          <span>Admin password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            autoComplete="current-password"
            disabled={busy}
          />
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="next-password-modal__actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className={config.danger ? "danger-button" : "primary-button"} disabled={busy || !password.trim()}>
            {busy ? "Working…" : config.button}
          </button>
        </div>
      </form>
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
  const [visibleLimit, setVisibleLimit] = useState(36);

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
    setVisibleLimit(36);
  }, [tab, type, query]);

  const statusRows = useMemo(() => {
    if (tab === "all") return orders;
    return orders.filter((item) => statusTabForItem(item) === tab);
  }, [orders, tab]);

  const statusGroups = useMemo(() => buildGroups(statusRows), [statusRows]);
  const typeOptions = useMemo(() => {
    const map = new Map();
    for (const group of statusGroups) {
      const key = orderTypeKey(group.orderType) || "other";
      const meta = orderTypeMeta(group.orderType);
      const current = map.get(key) || { key, label: meta.label, count: 0 };
      current.count += 1;
      map.set(key, current);
    }
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
    const counts = { all: buildGroups(orders).length };
    for (const item of STATUS_TABS.slice(1)) counts[item.key] = buildGroups(orders.filter((row) => statusTabForItem(row) === item.key)).length;
    return counts;
  }, [orders]);

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

  async function submitAction(password) {
    if (!actionState) return;
    const { action, group } = actionState;
    const config = ACTIONS[action];
    setBusy(true);
    setActionError("");

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: group.orderIds, adminPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Wrong password. Please try again.");
      if (!response.ok) throw new Error(data?.error || `Failed to ${action} order.`);

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
      setNotice(action === "delete" ? "Order deleted successfully." : action === "archive" ? "Order moved to Archive." : "Order restored from Archive.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (error) {
      setActionError(error?.message || "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="next-orders-page">
      {bootstrapWarnings.length ? (
        <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders">Classic page</a></div>
      ) : null}
      {notice ? <div className="orders-success-notice">✓ {notice}</div> : null}

      <div className="next-orders-toolbar">
        <div className="next-orders-tabs" role="tablist" aria-label="Current Orders status">
          {STATUS_TABS.map((item) => (
            <button
              type="button"
              className={tab === item.key ? "is-active" : ""}
              onClick={() => setTab(item.key)}
              role="tab"
              aria-selected={tab === item.key}
              key={item.key}
            >
              <span>{item.icon}</span><b>{item.label}</b><em>{tabCounts[item.key] || 0}</em>
            </button>
          ))}
        </div>

        <div className="next-orders-tools">
          <label className="next-orders-search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by order, reason or component…" />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button> : null}
          </label>
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by order type">
            <option value="all">All order types</option>
            {typeOptions.map((option) => <option value={option.key} key={option.key}>{option.label} ({option.count})</option>)}
          </select>
          <a className="classic-page-link" href="/orders">Classic</a>
        </div>
      </div>

      <div className="next-orders-summary">
        <span><strong>{visibleGroups.length}</strong> visible orders</span>
        <span><strong>{statusRows.length}</strong> components in this status</span>
        <span><strong>{formatMoney(visibleGroups.reduce((sum, group) => sum + group.total, 0))}</strong> estimated total</span>
      </div>

      {visibleGroups.length ? (
        <>
          <div className="next-orders-grid">
            {visibleGroups.slice(0, visibleLimit).map((group) => <OrderCard group={group} onOpen={setSelected} key={group.key} />)}
          </div>
          {visibleGroups.length > visibleLimit ? (
            <button className="load-more-button" type="button" onClick={() => setVisibleLimit((value) => value + 36)}>
              Show more orders
            </button>
          ) : null}
        </>
      ) : (
        <div className="next-orders-empty">
          <span>⌕</span>
          <h2>No orders found</h2>
          <p>Try another status, order type, or search phrase.</p>
          <button type="button" className="secondary-button" onClick={() => { setTab("all"); setType("all"); setQuery(""); }}>Clear filters</button>
        </div>
      )}

      <OrderDetailsModal group={selected} onClose={() => setSelected(null)} onAction={beginAction} />
      <PasswordModal
        state={actionState}
        busy={busy}
        error={actionError}
        onCancel={() => { if (!busy) { setActionState(null); setActionError(""); } }}
        onSubmit={submitAction}
      />
    </section>
  );
}

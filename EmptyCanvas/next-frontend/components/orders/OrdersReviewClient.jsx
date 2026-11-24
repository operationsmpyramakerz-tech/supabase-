"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import dynamic from "next/dynamic";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { creatorPopoverPlacement } from "./UnifiedOrderCreatorPopover";
import useCompleteOrderTypeCounts from "./useCompleteOrderTypeCounts";
import { createOrderDetailsLoader } from "./orderDetailsLoader";
import { cancelOrderOpenTimer, loadOrderAndModalWithMetrics, markOrderOpenStarted, reportOrderVisibleAfterPaint, warmOrderModalOnIdle } from "./orderOpeningPerformance";
import OrderDetailsLoadingOverlay from "./OrderDetailsLoadingOverlay";
import OrdersPerformancePanel from "./OrdersPerformancePanel";
import OrderTypeBadge from "./OrderTypeBadge";
import OrdersEmptyState, { sortOrderGroups } from "./OrdersEmptyState";
import OrdersPreferencesControl from "./OrdersPreferencesControl";
import { loadTeamMemberPublicProfile } from "../../lib/team-member-public-client";

const loadOrdersReviewHeavyModals = () => import("./OrdersReviewHeavyModals");
const OrdersReviewHeavyModals = dynamic(loadOrdersReviewHeavyModals, { ssr: false });

// Direct route handlers live under the configured /next basePath. Keep the
// explicit prefix so client requests stay inside the standalone Next deployment.
const DIRECT_API_BASE = "/next/api";

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
      ...group, reason, orderIdLabel: orderIdLabel(group.items), orderIds: [...new Set(group.items.flatMap((item) => Array.isArray(item?.orderIds) && item.orderIds.length ? item.orderIds : [item?.id]).map(text).filter(Boolean))],
      total: group.items.reduce((sum, item) => sum + itemTotal(item), 0), approval: group.items.find((item) => item?._summaryCard)?._groupApproval || dominantApproval(group.items),
      archived: group.items.find((item) => item?._summaryCard) ? Boolean(group.items.find((item) => item?._summaryCard)?._groupArchived) : (group.items.length > 0 && group.items.every(isArchived)),
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

function TypeFilter({ value, options, onChange, onOpen, loading, error }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const activeOption = options.find((option) => option.key === value);
  const totalOrders = options.every((option) => option.count !== null) ? options.reduce((sum, option) => sum + finite(option.count), 0) : null;

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
      <button type="button" className="orders-type-filter__button" aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) onOpen?.(); setOpen(!open); }}>
        <span className="orders-type-filter__button-icon"><ClassicOrderIcon name="filter" /></span>
        <span className="orders-type-filter__button-label">{value === "all" ? "Filter" : activeOption?.label || "Filter"}</span>
      </button>
      {open ? <div className="orders-type-filter__panel" role="menu" aria-label="Filter review orders by type">
        <div className="orders-type-filter__panel-head"><span className="orders-type-filter__panel-title">Order type</span><span className="orders-type-filter__panel-sub">{loading ? "Counting all orders…" : error ? "Counts unavailable" : totalOrders === null ? "Open to count" : `${totalOrders} order${totalOrders === 1 ? "" : "s"}`}</span></div>
        <div className="orders-type-filter__options">
          <button type="button" className={`orders-type-filter__option ${value === "all" ? "is-active" : ""}`} onClick={() => { onChange("all"); setOpen(false); }}>
            <span className="orders-type-filter__option-icon"><ClassicOrderIcon name="layers" /></span><span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">All order types</span><span className="orders-type-filter__option-sub">{loading ? "Counting all orders…" : error ? "Counts unavailable" : totalOrders === null ? "Open to count" : `${totalOrders} order${totalOrders === 1 ? "" : "s"}`}</span></span><span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span>
          </button>
          {options.map((option) => {
            const meta = orderTypeMeta(option.raw, option.color);
            return <button type="button" className={`orders-type-filter__option ${value === option.key ? "is-active" : ""}`} onClick={() => { onChange(option.key); setOpen(false); }} key={option.key}>
              <span className="orders-type-filter__option-icon" style={{ "--otf-icon-bg": meta.bg, "--otf-icon-fg": meta.fg, "--otf-icon-border": meta.bd }}><ClassicOrderIcon name={meta.icon} /></span>
              <span className="orders-type-filter__option-body"><span className="orders-type-filter__option-title">{option.label}</span><span className="orders-type-filter__option-sub">{loading ? "Counting…" : error ? "Count unavailable" : option.count === null ? "Open to count" : `${option.count} order${option.count === 1 ? "" : "s"}`}</span></span><span className="orders-type-filter__option-check"><ClassicOrderIcon name="check" /></span>
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

function OrderReviewCard({ group, activeTab, onOpen, onPrefetch, onCreator, canOpen = true }) {
  const state = group.archived ? "archive" : group.approval;
  const mixed = activeTab === "all" && !group.archived && group.approval === "mixed";
  return (
    <article className="co-card next-review-order-card" role={canOpen ? "button" : undefined} tabIndex={canOpen ? 0 : undefined} aria-label={canOpen ? `Open ${group.orderIdLabel}` : group.orderIdLabel} onPointerEnter={(event) => { if (canOpen && (event.pointerType === "mouse" || event.pointerType === "pen")) onPrefetch(group, true); }} onPointerLeave={() => { if (canOpen) onPrefetch(null, true); }} onFocus={(event) => { if (canOpen && event.target === event.currentTarget) onPrefetch(group); }} onClick={() => { if (canOpen) onOpen(group); }} onKeyDown={(event) => { if (canOpen && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(group); } }}>
      <div className="co-top">
        <div className="co-main">
          <OrderTypeBadge type={group.orderType} color={group.orderTypeColor} />
          <div className="orders-workspace-order-info">
            <div className="co-title">{group.orderIdLabel}</div>
            <div className="orders-workspace-user" title={group.createdByName || "Unknown user"}>{group.createdByName || "Unknown user"}</div>
          </div>
        </div>
        <div className="next-review-card-head-actions">
          <div className="next-review-card-status">{mixed ? <MixedStatusPill /> : <ApprovalPill approval={state} />}</div>
          {canOpen ? <button className="co-creator-btn next-review-creator-btn" type="button" aria-label={`Created by ${group.createdByName || "Creator"}`} title={`Created by ${group.createdByName || "Creator"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCreator(event.currentTarget, group); }}>
            <span className="next-review-creator-icon"><ClassicOrderIcon name="user" /></span>
          </button> : null}
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

export default function OrdersReviewClient({ initialOrders = [], initialPageInfo = null, bootstrapWarnings = [], account, workspaceType = "" }) {
  const canReview = (action) => featureAllowed(account, `orders.review.${action}`);
  const permissions = Object.fromEntries(["view_details", "approve", "bulk_approve", "quantity", "archive", "unarchive", "update_approval"].map(action => [action, canReview(action)]));
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [pageInfo, setPageInfo] = useState(initialPageInfo || { hasMore: false, nextCursor: null, limit: 36 });
  const [listLoading, setListLoading] = useState(false);
  const [tab, setTab] = useState("all");
  // Canonical pages stay scoped to one type; legacy deep links remain untyped.
  const [type, setType] = useState(workspaceType || "all");
  const [query, setQuery] = useState("");
  const completeTypes = useCompleteOrderTypeCounts({ endpoint: `${DIRECT_API_BASE}/sv-orders/paged-summary`, tab, query });
  const [sortMode, setSortMode] = useState("latest");
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
  const [detailGroups, setDetailGroups] = useState(() => new Map());
  const [detailLoadingKey, setDetailLoadingKey] = useState("");
  const detailRequestIdRef = useRef(0);
  const detailsLoaderRef = useRef(null);
  if (!detailsLoaderRef.current) detailsLoaderRef.current = createOrderDetailsLoader({
    endpoint: `${DIRECT_API_BASE}/sv-orders/details-direct`,
    buildGroups,
  });
  const [detailError, setDetailError] = useState("");
  const creatorProfileCache = useRef(new Map());
  const listRequestRef = useRef(0);
  const listAbortRef = useRef(null);
  const initialFilterKeyRef = useRef(`all|${workspaceType || "all"}|`);

  // Warm the modal code after the list is interactive. Never request an
  // order's private details merely because its card was rendered or touched.
  useEffect(() => {
    if (listLoading || !orders.length) return undefined;
    return warmOrderModalOnIdle(loadOrdersReviewHeavyModals);
  }, [listLoading, orders.length]);

  useClassicHeaderSearch(query, setQuery, "Search by reason or item...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (REVIEW_TABS.some((item) => item.key === requestedTab)) setTab(requestedTab);
    const requestedType = params.get("type");
    if (!workspaceType && requestedType) setType(requestedType);
    const requestedQuery = params.get("q");
    if (requestedQuery) setQuery(requestedQuery);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "all") params.delete("tab"); else params.set("tab", tab);
    if (workspaceType || type === "all") params.delete("type"); else params.set("type", type);
    if (workspaceType) { params.delete("filterType"); params.delete("orderTypeKey"); }
    if (!query.trim()) params.delete("q"); else params.set("q", query.trim());
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [tab, type, query, workspaceType]);
  useEffect(() => {
    const key = `${tab}|${type}|${query.trim()}`;
    if (key === initialFilterKeyRef.current) return undefined;
    initialFilterKeyRef.current = key;
    const timer = window.setTimeout(() => {
      fetchReviewPage({ reset: true }).catch((error) => showNotice(error?.message || "Failed to load review orders."));
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

  const allGroups = useMemo(() => buildGroups(orders), [orders]);
  const selectedSummary = useMemo(() => allGroups.find((group) => group.key === selectedKey) || null, [allGroups, selectedKey]);
  const selected = selectedKey ? (detailGroups.get(selectedKey) || null) : null;
  const statusRows = useMemo(() => {
    if (tab === "all") return orders.filter((item) => !isArchived(item));
    if (tab === "archive") return orders.filter(isArchived);
    return orders.filter((item) => !isArchived(item) && approvalKey(item?.approval ?? item?.svApproval ?? item?.sv_approval) === tab);
  }, [orders, tab]);
  const statusGroups = useMemo(() => buildGroups(statusRows), [statusRows]);
  const typeOptions = useMemo(() => {
    const full = completeTypes.counts?.options;
    const map = new Map();
    // While checking, expose all known types, including types not yet loaded.
    if (!full) for (const raw of ["Request Maintenance", "Request Products", "Withdraw Products"]) {
      const key = orderTypeKey(raw);
      map.set(key, { key, raw, label: orderTypeMeta(raw).label, count: null });
    }
    const source = full || statusGroups.map((group) => ({
      key: orderTypeKey(group.orderType) || "other", raw: group.orderType,
      color: group.orderTypeColor, count: 0,
    }));
    for (const entry of source) {
      const key = entry.key || orderTypeKey(entry.raw) || "other";
      const meta = orderTypeMeta(entry.raw, entry.color);
      map.set(key, {
        key, raw: entry.raw, color: entry.color, label: meta.label,
        count: full ? entry.count : null,
      });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [statusGroups, completeTypes.counts]);

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

  const sortedVisibleGroups = useMemo(() => sortOrderGroups(visibleGroups, sortMode), [visibleGroups, sortMode]);

  useEffect(() => {
    if (!selected || detailLoadingKey) return undefined;
    return reportOrderVisibleAfterPaint("Review");
  }, [selected, detailLoadingKey]);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }
  function closeReviewDetails() {
    cancelOrderOpenTimer("Review");
    ++detailRequestIdRef.current;
    setSelectedKey("");
    setDetailLoadingKey("");
    setDetailError("");
  }
  function patchDetailItem(id, patch) {
    const targetId = text(id);
    if (!targetId) return;
    setDetailGroups((current) => {
      let changed = false;
      const next = new Map(current);
      for (const [key, group] of next.entries()) {
        if (!(group?.items || []).some((item) => text(item?.id) === targetId)) continue;
        const items = group.items.map((item) => text(item?.id) === targetId ? { ...item, ...patch } : item);
        const rebuilt = buildGroups(items)[0];
        if (rebuilt) next.set(key, { ...rebuilt, key });
        changed = true;
      }
      return changed ? next : current;
    });
  }
  async function openReviewDetails(group, { force = false } = {}) {
    if (!canReview("view_details") || !group?.key) return;
    const attemptId = markOrderOpenStarted("Review");
    const requestId = ++detailRequestIdRef.current;
    setSelectedKey(group.key);
    setDetailError("");
    if (!force && detailGroups.has(group.key)) return;
    setDetailLoadingKey(group.key);
    try {
      // Keep the full-size loading sheet until both the review details and
      // their interactive modal code are available.
      const detail = await loadOrderAndModalWithMetrics({
        page: "Review",
        attemptId,
        loadDetails: ({ attemptId: measuredAttempt }) => detailsLoaderRef.current.get(group, { fresh: force, attemptId: measuredAttempt }),
        loadModal: loadOrdersReviewHeavyModals,
      });
      if (requestId !== detailRequestIdRef.current) return;
      setDetailGroups((current) => {
        const next = new Map(current);
        next.set(group.key, detail);
        return next;
      });
    } catch (error) {
      if (requestId !== detailRequestIdRef.current) return;
      cancelOrderOpenTimer("Review");
      if (error?.status === 401) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return; }
      setDetailError(error?.message || "Order details could not be loaded.");
    } finally {
      if (requestId === detailRequestIdRef.current) setDetailLoadingKey("");
    }
  }

  function prefetchReviewDetails(group, hover = false) {
    if (!group) { detailsLoaderRef.current.cancelPrefetch(); return; }
    detailsLoaderRef.current.prefetch(group, { defer: hover });
  }
  async function fetchReviewPage({ reset = true } = {}) {
    const requestId = ++listRequestRef.current;
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        mode: "summary",
        paged: "1",
        filterType: type,
        limit: String(pageInfo?.limit || 36),
      });
      if (query.trim()) params.set("q", query.trim());
      if (!reset && pageInfo?.nextCursor !== null && pageInfo?.nextCursor !== undefined) params.set("cursor", String(pageInfo.nextCursor));
      const response = await fetch(`${DIRECT_API_BASE}/sv-orders/paged-summary?${params.toString()}`, { credentials: "include", cache: "no-store", signal: controller.signal });
      if (response.status === 401) { window.location.href = "/login?next=/next/orders-review"; return; }
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to load review orders.");
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
        setSelectedKey("");
        detailsLoaderRef.current.clear();
        ++detailRequestIdRef.current;
        setDetailLoadingKey("");
        setDetailGroups(new Map());
        setDetailError("");
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
    return fetchReviewPage({ reset: true });
  }
  async function updateDecision(item, decision, rejectedReason = "") {
    const id = text(item?.id);
    if (!id) return;
    setBusyIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`${DIRECT_API_BASE}/sv-orders/mutations-direct`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "approval", id, decision, rejectedReason }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to update approval.");
      const patch = { approval: normalizeApproval(decision), rejectedReason: normalizeApproval(decision) === "Rejected" ? text(rejectedReason) : "", status: data?.status };
      setOrders((current) => current.map((row) => text(row?.id) === id ? { ...row, ...patch, status: data?.status || row?.status } : row));
      patchDetailItem(id, { ...patch, status: data?.status || item?.status });
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
    const items = Array.isArray(group?.items) ? group.items : [];
    const ids = [...new Set(items.map((item) => text(item?.id)).filter(Boolean))];
    if (!ids.length) throw new Error("This order has no components to review.");
    // Lock every component during the single server transaction. A failed
    // request leaves local decisions untouched (no partially optimistic UI).
    setBusyIds((current) => new Set([...current, ...ids]));
    try {
      const response = await fetch(`${DIRECT_API_BASE}/sv-orders/mutations-direct`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-approval", orderIds: ids, decision, rejectedReason }),
      });
      const data = await readJson(response);
      if (!response.ok || data?.ok === false) throw new Error(data?.error || "Could not save the entire review.");
      const changed = new Set((data?.changedIds || []).map(text));
      const normalized = normalizeApproval(decision);
      if (changed.size) {
        const patch = (item) => changed.has(text(item?.id))
          ? { ...item, approval: normalized, svApproval: normalized,
              rejectedReason: normalized === "Rejected" ? text(rejectedReason) : "", status: data?.status || item?.status }
          : item;
        setDetailGroups((current) => {
          const next = new Map(current);
          for (const [key, detailed] of current.entries()) {
            if (!(detailed?.items || []).some((item) => changed.has(text(item?.id)))) continue;
            const rebuilt = buildGroups(detailed.items.map(patch))[0];
            if (rebuilt) next.set(key, { ...rebuilt, key });
          }
          return next;
        });
        setOrders((current) => current.map((row) => {
          if (row?._summaryCard && groupKey(row, 0) === group.key) {
            return { ...row, approval: normalized, _groupApproval: lower(normalized),
              status: changed.size === ids.length ? (data?.status || row?.status) : row?.status };
          }
          return patch(row);
        }));
      }
      detailsLoaderRef.current.clear();
      showNotice(`${data?.changed ?? changed.size} component${(data?.changed ?? changed.size) === 1 ? "" : "s"} ${normalized.toLowerCase()} together.`);
    } finally {
      setBusyIds((current) => { const next = new Set(current); ids.forEach((id) => next.delete(id)); return next; });
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
    if (!id || text(value) === "" || !Number.isFinite(number)) { showNotice("Enter a valid quantity."); return false; }
    setBusyIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`${DIRECT_API_BASE}/sv-orders/mutations-direct`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "quantity", id, value: number }) });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Failed to update quantity.");
      const quantityEdited = data?.cleared ? null : finite(data?.value, number);
      setOrders((current) => current.map((row) => text(row?.id) === id ? { ...row, quantityEdited } : row));
      patchDetailItem(id, { quantityEdited });
      showNotice("Quantity updated.");
      return true;
    } catch (error) { showNotice(error?.message || "Quantity could not be updated."); return false; } finally { setBusyIds((current) => { const next = new Set(current); next.delete(id); return next; }); }
  }
  function beginPasswordAction(action, group) { setPasswordError(""); setPasswordState({ action, group }); }
  async function submitPasswordAction(password) {
    if (!passwordState) return;
    const { action, group } = passwordState; const config = PASSWORD_ACTIONS[action];
    setPasswordBusy(true); setPasswordError("");
    try {
      const response = await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: config.directAction, orderIds: group.orderIds, adminPassword: password }) });
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
      const response = await fetch(`${DIRECT_API_BASE}/sv-orders/mutations-direct`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "update-approval", orderIds: editorState.group.orderIds, adminPassword: editorState.password, approvals }) });
      const data = await readJson(response);
      if (response.status === 401) throw new Error("The verified password is no longer valid.");
      if (!response.ok) throw new Error(data?.error || "Review decisions could not be updated.");
      await refreshOrders(); setEditorState(null); setSelectedKey(""); showNotice("Review decisions updated.");
    } catch (error) { setEditorError(error?.message || "Review decisions could not be updated."); } finally { setEditorBusy(false); }
  }
  async function openCreatorProfile(anchor, group) {
    void loadOrdersReviewHeavyModals();
    const placement = creatorPopoverPlacement(anchor);
    const base = { placement, name: group.createdByName || "Creator", loading: true, profile: null, error: false };
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
    } catch { setCreatorState({ ...base, loading: false, error: true }); }
  }

  async function exportOrder(options, group, selectedTab) {
    const kind = options?.kind === "excel" ? "excel" : "pdf";
    const endpoint = `${DIRECT_API_BASE}/orders/export-direct`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        scope: "review",
        kind,
        orderIds: group.orderIds,
        tab: selectedTab,
        columns: options?.columns || [],
        instruction: options?.instruction || null,
        signatureLabels: options?.signatureLabels || null,
        sortMode: options?.sortMode || "product-tag",
        repeatedComponentMode: options?.repeatedComponentMode || "merge",
      }),
    });
    if (response.status === 401) {
      window.location.href = "/login?next=/next/orders-review";
      throw new Error("Your session expired.");
    }
    const data = response.ok ? null : await readJson(response);
    if (!response.ok) throw new Error(data?.error || `Failed to export ${kind.toUpperCase()}.`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${group.orderIdLabel.replace(/[^a-z0-9_-]+/gi, "-") || "review-order"}.${kind === "excel" ? "xlsx" : "pdf"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice(`${kind.toUpperCase()} downloaded.`);
  }

  return <section className="next-classic-orders-parity orders-workspace">
    {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span></div> : null}
    {notice ? <div className="orders-parity-success" role="status"><ClassicOrderIcon name="check-circle" />{notice}</div> : null}

    <div className="next-orders-review-toolbar-wrap">
      <div className="orders-toolbar" aria-label="Orders review tools">
        <div className="orders-toolbar__scroll"><div className="portfolio-tabs portfolio-tabs--iconic" role="tablist" aria-label="Orders Review status">{REVIEW_TABS.map((item) => <button type="button" className={`tab-portfolio order-status-tab ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)} role="tab" aria-selected={tab === item.key} key={item.key}><span className="order-status-tab__icon"><ClassicOrderIcon name={item.icon}/></span><span className="order-status-tab__copy"><span className="order-status-tab__label">{item.label}</span></span></button>)}</div></div>
        <div className="orders-toolbar__divider" aria-hidden="true"/><OrdersPreferencesControl
          sortOnly={!!workspaceType}
          sortMode={sortMode} onSortChange={setSortMode} hasMore={pageInfo?.hasMore}
          filterValue={workspaceType ? "all" : type}
          onFilterChange={workspaceType ? undefined : setType}
          onFilterOpen={workspaceType ? undefined : completeTypes.refresh}
          loading={completeTypes.loading} error={completeTypes.error}
          filterOptions={workspaceType ? [] : typeOptions.map(option => { const meta = orderTypeMeta(option.raw || option.label); return { ...option, icon: meta.icon, bg: meta.bg, fg: meta.fg, bd: meta.bd }; })} />
      </div>
    </div>

    <section className="orders-review-list-surface" id="sv-orders"><div className="co-cards" id="sv-list">{visibleGroups.length ? sortedVisibleGroups.map((group) => <OrderReviewCard group={group} activeTab={tab} onOpen={openReviewDetails} onPrefetch={prefetchReviewDetails} onCreator={openCreatorProfile} canOpen={permissions.view_details} key={group.key}/>) : listLoading ? <div className="ops-no-data-state" role="status" aria-live="polite"><div className="ops-no-data-state__text">Loading orders…</div></div> : <OrdersEmptyState filtered={tab !== "all" || type !== "all" || !!query.trim()} context={"orders"} onReset={() => { setTab("all"); if (!workspaceType) setType("all"); setQuery(""); }} />}</div>{pageInfo?.hasMore ? <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 4px" }}><button type="button" className="ro-action-btn ro-action-btn--light" disabled={listLoading} onClick={() => fetchReviewPage({ reset: false }).catch((error) => showNotice(error?.message || "Failed to load more orders."))}>{listLoading ? "Loading…" : "Load more orders"}</button></div> : null}</section>

    {selectedKey && !selected && !detailError ? <OrderDetailsLoadingOverlay group={selectedSummary} onCancel={closeReviewDetails} variant="review" /> : null}
    {(selected || detailError || passwordState || rejectionState || editorState || reasonView || creatorState) ? (
      <OrdersReviewHeavyModals
        selectedKey={selectedKey}
        selected={selected}
        selectedSummary={selectedSummary}
        detailLoadingKey={detailLoadingKey}
        detailError={detailError}
        onRetryDetails={() => selectedSummary && openReviewDetails(selectedSummary, { force: true })}
        onCloseDetails={closeReviewDetails}
        tab={tab}
        busyIds={busyIds}
        permissions={permissions}
        onQuantitySave={saveQuantity}
        onDecision={beginDecision}
        onBulkDecision={beginBulkDecision}
        onPasswordAction={beginPasswordAction}
        onReason={setReasonView}
        onExport={exportOrder}
        passwordState={passwordState}
        passwordBusy={passwordBusy}
        passwordError={passwordError}
        onCancelPassword={() => { if (!passwordBusy) { setPasswordState(null); setPasswordError(""); } }}
        onSubmitPassword={submitPasswordAction}
        rejectionState={rejectionState}
        rejectionBusy={rejectionBusy}
        rejectionError={rejectionError}
        onCancelRejection={() => { if (!rejectionBusy) { setRejectionState(null); setRejectionError(""); } }}
        onSubmitRejection={submitRejection}
        editorState={editorState}
        editorBusy={editorBusy}
        editorError={editorError}
        onCancelEditor={() => { if (!editorBusy) { setEditorState(null); setEditorError(""); } }}
        onSubmitEditor={submitReviewEditor}
        reasonView={reasonView}
        onCloseReason={() => setReasonView("")}
        creatorState={creatorState}
        onCloseCreator={() => setCreatorState(null)}
      />
    ) : null}
    <OrdersPerformancePanel />
  </section>;
}

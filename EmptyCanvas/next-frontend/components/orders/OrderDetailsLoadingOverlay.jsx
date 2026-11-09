"use client";

import { useEffect } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { orderCreatedDate, orderDeliveryDate, orderPriority } from "./order-summary-meta.mjs";

const ORDER_TYPES = {
  requestproducts: { title: "Request Products", icon: "shopping-cart", accent: "#22c55e", dark: "#15803d" },
  withdrawproducts: { title: "Withdraw Products", icon: "log-out", accent: "#ef4444", dark: "#b91c1c" },
  requestmaintenance: { title: "Request Maintenance", icon: "tool", accent: "#f2b705", dark: "#a16207" },
};

function LoadingBar({ width = "100%", height, className = "" }) {
  return <span className={`orders-detail-loading-skeleton ${className}`} style={{ width, ...(height ? { height } : {}) }} aria-hidden="true" />;
}

function SummaryCell({ label, value, width = "72%" }) {
  return <div><span>{label}</span>{value ? <strong>{value}</strong> : <LoadingBar width={width} height={13} />}</div>;
}

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function LoadingProgress({ stage }) {
  const safe = Math.min(4, Math.max(1, Number(stage) || 1));
  return (
    <div className="co-track-pill orders-detail-loading-track" aria-hidden="true">
      {["eye", "activity", "truck", "home"].map((icon, index) => (
        <span className="orders-detail-loading-track-part" key={icon}>
          <span className={`co-track-step ${index < safe ? "is-active" : ""} ${index + 1 === safe ? "is-current" : ""}`}><ClassicOrderIcon name={icon} /></span>
          {index < 3 ? <span className={`co-track-conn ${index + 1 < safe ? "is-active" : ""}`} /> : null}
        </span>
      ))}
    </div>
  );
}

function LoadingProductRows() {
  return (
    <div className="co-modal-items order-component-groups orders-detail-loading-products" aria-hidden="true">
      <div className="orders-detail-loading-group-header">
        <div><LoadingBar width="40%" height={9} /><LoadingBar width="65%" height={14} /></div>
        <LoadingBar width={65} height={25} className="orders-detail-loading-pill" />
      </div>
      {[0, 1, 2, 3].map((index) => (
        <div className="co-item orders-detail-loading-product" key={index}>
          <div className="orders-detail-loading-product-details">
            <LoadingBar width={index % 2 ? "68%" : "85%"} height={14} />
            <LoadingBar width="62%" height={10} />
          </div>
          <div className="orders-detail-loading-product-meta">
            <LoadingBar width={42} height={12} />
            <LoadingBar width={76} height={27} className="orders-detail-loading-pill" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Show the actual order-detail bottom sheet geometry immediately, while the
 * detail endpoint and the (lazy-loaded) interactive modal are being prepared.
 * No fake quantities, totals or workflow states are shown during loading.
 */
export default function OrderDetailsLoadingOverlay({ group, onCancel, variant = "operations" }) {
  useEffect(() => {
    if (!group) return undefined;
    const close = (event) => { if (event.key === "Escape") onCancel(); };
    document.body.classList.add("co-modal-open");
    document.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("co-modal-open");
      document.removeEventListener("keydown", close);
    };
  }, [group, onCancel]);

  if (!group) return null;

  const typeKey = String(group.orderType || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const type = ORDER_TYPES[typeKey] || {
    title: String(group.orderType || "Order"), icon: "package", accent: "#64748b", dark: "#334155",
  };
  const maintenance = variant === "maintenance";
  const review = variant === "review";
  const current = variant === "current";
  const modalTitle = maintenance ? "Request Maintenance" : review ? "Order review" : current
    ? (typeKey === "requestproducts" ? "Request" : typeKey === "withdrawproducts" ? "Withdrawal" : typeKey === "requestmaintenance" ? "Maintenance" : type.title)
    : type.title;
  const summaryClass = maintenance ? "next-maintenance-order-modal-summary"
    : review ? "next-review-order-modal-summary"
    : current ? "next-current-order-modal-summary"
    : "next-operations-order-modal-summary";
  const createdDate = formatDate(orderCreatedDate(group));
  const deliveryDate = formatDate(orderDeliveryDate(group));
  const priority = orderPriority(group);
  const orderCode = group.orderIdLabel || group.orderId || "";

  return (
    <div className="co-modal-overlay is-open orders-detail-loading-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className={`co-modal-dialog orders-detail-loading-dialog ${maintenance ? "next-maintenance-details-dialog" : review ? "next-review-order-modal" : ""}`} role="dialog" aria-modal="true" aria-label={`Loading ${orderCode || "order"} details`} aria-busy="true">
        <span className="co-modal-type-badge" style={{ "--co-order-type-accent": type.accent, "--co-order-type-accent-dark": type.dark }} aria-hidden="true"><ClassicOrderIcon name={maintenance ? "tool" : type.icon} /></span>
        {/* Do not render an actions-menu placeholder before permissions are verified. */}
        <button type="button" className="co-modal-close" onClick={onCancel} aria-label="Cancel opening order" />
        <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">{modalTitle}</div></div></div>
        <div className="co-modal-scroll-region">
          <div className={`${summaryClass} orders-detail-loading-summary`} aria-label="Order summary loading">
            {maintenance ? <SummaryCell label="Team member" value={group.createdByName} width="80%" /> : null}
            <SummaryCell label="Created Date" value={createdDate} width="75%" />
            <SummaryCell label="Delivery Date" value={deliveryDate} width="75%" />
            {!maintenance ? <SummaryCell label="Components" width="52%" /> : null}
            <SummaryCell label="Priority" value={priority !== "—" ? priority : "—"} width="65%" />
          </div>
          {!review ? <LoadingProgress stage={group.stage} /> : null}
          <div className="co-modal-body orders-detail-loading-body">
            {!review && !maintenance && Number(group.stage) >= 3 ? <div className="co-modal-meta orders-detail-loading-meta"><div className="co-meta-row"><span>Received by</span><LoadingBar width="47%" height={13} /></div></div> : null}
            <div className="co-modal-actions ro-actions ro-actions--right orders-detail-loading-actions" aria-hidden="true">
              {!maintenance && !review ? <div className="orders-detail-loading-search-row"><div className="orders-detail-loading-search"><ClassicOrderIcon name="search" /></div><LoadingBar width="38%" height={12} /></div> : null}
              <div className="orders-detail-loading-action-placeholder"><ClassicOrderIcon name="download" /> <span>{maintenance ? "Download Template" : "Download"}</span></div>
              {!maintenance ? <div className="orders-detail-loading-action-placeholder orders-detail-loading-action-dark"><ClassicOrderIcon name="filter" /> <span>Sort</span><ClassicOrderIcon name="chevron-down" /></div> : null}
            </div>
            {!maintenance && !review ? <div className="co-modal-meta co-modal-meta--after-actions orders-detail-loading-reason"><div className="co-meta-row co-meta-row--reason"><span>Reason</span><LoadingBar width="68%" height={13} /></div></div> : null}
            <LoadingProductRows />
            <span className="orders-detail-loading-status" role="status" aria-live="polite"><span className="orders-detail-loading-spinner" aria-hidden="true" /> Loading order details…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

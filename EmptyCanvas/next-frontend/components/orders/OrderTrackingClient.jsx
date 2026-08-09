"use client";

import { useMemo, useState } from "react";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value) {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value) {
  const date = dateValue(value);
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(finite(value));
}

function stageNumber(data) {
  if (Number.isFinite(Number(data?.stage))) return Math.max(1, Math.min(3, Number(data.stage)));
  if (Number.isFinite(Number(data?.stage?.step))) return Math.max(1, Math.min(3, Number(data.stage.step)));
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length && items.every((item) => /(arrived|delivered|received)/i.test(text(item?.status)))) return 3;
  return 2;
}

function statusTone(value) {
  const status = text(value).toLowerCase();
  if (/(arrived|delivered|received|complete)/.test(status)) return "success";
  if (/(reject|cancel|fail)/.test(status)) return "danger";
  if (/(ship|way|progress|prepared)/.test(status)) return "info";
  return "pending";
}

function effectiveQuantity(item) {
  const candidates = [
    item?.quantityReceived,
    item?.quantityEditedBySupervisor,
    item?.quantityProgress,
    item?.quantityRequested,
    item?.quantity,
  ];
  for (const value of candidates) {
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function orderLabel(data) {
  if (text(data?.orderId)) return text(data.orderId);
  if (Number.isFinite(Number(data?.orderNumber))) return `ORD-${Number(data.orderNumber)}`;
  const first = Array.isArray(data?.items) ? data.items[0] : null;
  if (text(first?.orderId)) return text(first.orderId);
  return "Order";
}

function summaryFor(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const supplied = data?.totals || data?.summary || {};
  const itemsCount = Number.isFinite(Number(supplied?.itemsCount)) ? Number(supplied.itemsCount) : items.length;
  const totalQty = Number.isFinite(Number(supplied?.totalQty ?? supplied?.totalQuantity))
    ? Number(supplied?.totalQty ?? supplied?.totalQuantity)
    : items.reduce((sum, item) => sum + effectiveQuantity(item), 0);
  const estimateTotal = Number.isFinite(Number(supplied?.estimateTotal))
    ? Number(supplied.estimateTotal)
    : items.reduce((sum, item) => sum + effectiveQuantity(item) * finite(item?.unitPrice), 0);
  return { itemsCount, totalQty, estimateTotal };
}

export default function OrderTrackingClient({ initialTracking = {}, groupId = "", bootstrapWarnings = [] }) {
  const [tracking, setTracking] = useState(initialTracking || {});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const items = useMemo(() => Array.isArray(tracking?.items) ? tracking.items : [], [tracking]);
  const stage = useMemo(() => stageNumber(tracking), [tracking]);
  const summary = useMemo(() => summaryFor(tracking), [tracking]);
  const label = useMemo(() => orderLabel(tracking), [tracking]);
  const headerTitle = text(tracking?.headerTitle || tracking?.stage?.label) || (stage >= 3 ? "Delivered" : "On the way");
  const headerSubtitle = text(tracking?.headerSubtitle || tracking?.stage?.subtitle) || (stage >= 3 ? "Your cargo has arrived." : "Your cargo is on delivery.");

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/tracking?groupId=${encodeURIComponent(groupId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/next/orders/tracking?groupId=${groupId}`)}`;
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to refresh order tracking.");
      setTracking(data || {});
      setNotice("Tracking updated.");
      window.setTimeout(() => setNotice(""), 2600);
    } catch (refreshError) {
      setError(refreshError?.message || "Tracking could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Tracking link copied.");
      window.setTimeout(() => setNotice(""), 2600);
    } catch {
      setError("The browser could not copy this link automatically.");
    }
  }

  return (
    <section className="next-tracking-page">
      {bootstrapWarnings.length ? (
        <div className="dashboard-notice">
          <strong>Partial initial load</strong>
          <span>The tracking page opened, but one optional bootstrap resource was unavailable.</span>
          <button type="button" onClick={refresh}>Refresh</button>
        </div>
      ) : null}
      {notice ? <div className="orders-success-notice">✓ {notice}</div> : null}
      {error ? <div className="form-error next-tracking-error">{error}</div> : null}

      <div className="next-tracking-toolbar">
        <a className="secondary-button" href="/next/orders">← Current Orders</a>
        <div>
          <button type="button" className="secondary-button" onClick={copyLink}>Copy link</button>
          <button type="button" className="secondary-button" onClick={() => window.print()}>Print</button>
          <button type="button" className="primary-button" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      <article className="next-tracking-hero">
        <div className="next-tracking-hero__identity">
          <span className={`next-tracking-stage-badge stage-${stage}`}>{stage >= 3 ? "✓" : "→"}</span>
          <div>
            <span className="pill">{label}</span>
            <h2>{headerTitle}</h2>
            <p>{headerSubtitle}</p>
          </div>
        </div>
        <div className="next-tracking-hero__meta">
          <span><small>Created</small><strong>{formatDate(tracking?.createdTime)}</strong></span>
          <span><small>ETA</small><strong>{formatTime(tracking?.eta)}</strong></span>
          <span><small>Order type</small><strong>{text(tracking?.orderType) || text(items[0]?.orderType) || "Request Products"}</strong></span>
        </div>
      </article>

      <div className="next-tracking-progress" aria-label="Order delivery progress">
        {[
          [1, "Order placed", "Request registered"],
          [2, "On the way", "Operations delivery"],
          [3, "Delivered", "Cargo received"],
        ].map(([step, title, subtitle]) => (
          <div className={`next-tracking-progress__step ${stage >= step ? "is-done" : ""} ${stage === step ? "is-active" : ""}`} key={step}>
            <span>{stage > step ? "✓" : step}</span>
            <div><strong>{title}</strong><small>{subtitle}</small></div>
          </div>
        ))}
        <div className="next-tracking-progress__line"><i style={{ width: `${stage <= 1 ? 0 : stage === 2 ? 50 : 100}%` }} /></div>
      </div>

      <div className="next-tracking-summary-grid">
        <article><small>Components</small><strong>{summary.itemsCount}</strong><span>line items in this order</span></article>
        <article><small>Total quantity</small><strong>{summary.totalQty}</strong><span>effective tracked quantity</span></article>
        <article><small>Estimated value</small><strong>{formatMoney(summary.estimateTotal)}</strong><span>based on stored unit prices</span></article>
        <article><small>Reason</small><strong className="next-tracking-reason">{text(tracking?.reason) || "No reason"}</strong><span>{text(tracking?.createdByName) ? `Created by ${text(tracking.createdByName)}` : "Order request reason"}</span></article>
      </div>

      <section className="next-tracking-items-card">
        <header>
          <div><span className="pill">Live items</span><h3>Order components</h3></div>
          <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
        </header>

        {items.length ? (
          <div className="next-tracking-items-list">
            {items.map((item, index) => {
              const qty = effectiveQuantity(item);
              const unit = finite(item?.unitPrice);
              const image = text(item?.productImage || item?.imageUrl);
              const productUrl = text(item?.productUrl);
              const status = text(item?.status) || "Pending";
              return (
                <article className="next-tracking-item" key={text(item?.id) || `${text(item?.productName)}-${index}`}>
                  <div className="next-tracking-item__image">
                    {image ? <img src={image} alt="" loading="lazy" /> : <span>{text(item?.productName).slice(0, 2).toUpperCase() || "PR"}</span>}
                  </div>
                  <div className="next-tracking-item__body">
                    <div>
                      <strong>{text(item?.productName) || "Unknown Product"}</strong>
                      {productUrl ? <a href={productUrl} target="_blank" rel="noreferrer">Supplier / product link ↗</a> : null}
                    </div>
                    <div className="next-tracking-item__numbers">
                      <span><small>Quantity</small><b>{qty}</b></span>
                      <span><small>Unit price</small><b>{formatMoney(unit)}</b></span>
                      <span><small>Estimate</small><b>{formatMoney(qty * unit)}</b></span>
                    </div>
                  </div>
                  <span className={`next-tracking-status tone-${statusTone(status)}`}>{status}</span>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="next-orders-empty"><span>□</span><h2>No components found</h2><p>This order does not currently contain any trackable line items.</p></div>
        )}
      </section>
    </section>
  );
}

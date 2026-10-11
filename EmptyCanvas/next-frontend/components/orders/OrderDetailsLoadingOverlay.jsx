"use client";

import { useEffect } from "react";
import OrderTypeBadge from "./OrderTypeBadge";

export default function OrderDetailsLoadingOverlay({ group, onCancel }) {
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
  return (
    <div className="orders-detail-loading-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="orders-detail-loading-dialog" role="dialog" aria-modal="true" aria-label={`Loading ${group.orderIdLabel || "order"}`} aria-busy="true">
        <button type="button" className="orders-detail-loading-close" aria-label="Cancel opening order" onClick={onCancel}>×</button>
        <div className="orders-detail-loading-heading">
          <OrderTypeBadge type={group.orderType} color={group.orderTypeColor} />
          <div>
            <strong>{group.orderIdLabel || "Order"}</strong>
            <span>{group.createdByName || "Loading order"}</span>
          </div>
        </div>
        <div className="orders-detail-loading-skeleton orders-detail-loading-skeleton--wide" />
        <div className="orders-detail-loading-skeleton orders-detail-loading-skeleton--medium" />
        <div className="orders-detail-loading-skeleton orders-detail-loading-skeleton--wide" />
        <div className="orders-detail-loading-message"><span className="orders-detail-loading-spinner" aria-hidden="true"/> Loading order details…</div>
      </section>
    </div>
  );
}

"use client";

import ClassicOrderIcon from "./ClassicOrderIcon";

/** Only the number of currently fetched groups is known, not the DB total. */
export function OrdersListHeader({ count = 0, hasMore = false, busy = false }) {
  return (
    <div className="orders-workspace-list-head" aria-live="polite">
      <span className="orders-workspace-list-head__title">Orders</span>
      <span className="orders-workspace-list-head__count">
        {busy ? "Updating…" : `${count} ${hasMore ? "loaded" : "shown"}`}
      </span>
    </div>
  );
}

export default function OrdersEmptyState({ filtered = false, context = "orders", onReset }) {
  const isOwn = context === "my-orders";
  return (
    <div className="orders-workspace-empty" role="status" aria-live="polite">
      <span className="orders-workspace-empty__icon"><ClassicOrderIcon name={filtered ? "filter" : "layers"} /></span>
      <strong>{filtered ? "No matching orders" : isOwn ? "No orders to show" : "No orders available"}</strong>
      <p>{filtered
        ? "Try another status, order type, or search term."
        : isOwn ? "Orders created by your account will appear here." : "New orders will appear here when available."}</p>
      {filtered && typeof onReset === "function" ? (
        <button type="button" className="orders-workspace-empty__reset" onClick={onReset}>
          <ClassicOrderIcon name="rotate-ccw" /> Clear filters
        </button>
      ) : null}
    </div>
  );
}

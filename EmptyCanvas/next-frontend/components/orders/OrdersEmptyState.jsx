"use client";

import ClassicOrderIcon from "./ClassicOrderIcon";

/** Sort only the fetched groups. Pagination and server-side status filters stay unchanged. */
export function sortOrderGroups(groups, mode = "latest") {
  const safe = Array.isArray(groups) ? groups : [];
  const byTime = (group) => {
    const date = new Date(group?.latestCreated || 0).getTime();
    return Number.isFinite(date) ? date : 0;
  };
  const byNumber = (group) => {
    const match = String(group?.orderIdLabel || "").match(/\d+/);
    return match ? Number(match[0]) : -1;
  };
  const byName = (group) => String(group?.createdByName || "").trim();
  const sorted = safe.slice();
  sorted.sort((a, b) => {
    if (mode === "oldest") return byTime(a) - byTime(b) || byNumber(a) - byNumber(b);
    if (mode === "number-asc") return byNumber(a) - byNumber(b);
    if (mode === "number-desc") return byNumber(b) - byNumber(a);
    if (mode === "creator") return byName(a).localeCompare(byName(b), undefined, { sensitivity: "base" }) || byTime(b) - byTime(a);
    return byTime(b) - byTime(a) || byNumber(b) - byNumber(a);
  });
  return sorted;
}

/** Only the number of currently fetched groups is known, not the DB total. */
export function OrdersListHeader({ count = 0, hasMore = false, busy = false, sortMode = "latest", onSortChange }) {
  return (
    <div className="orders-workspace-list-head" aria-live="polite">
      <span className="orders-workspace-list-head__title">Orders</span>
      <div className="orders-workspace-list-head__tools">
        <span className="orders-workspace-list-head__count">
          {busy ? "Updating…" : `${count} ${hasMore ? "loaded" : "shown"}`}
        </span>
        {typeof onSortChange === "function" ? (
          <label className="orders-workspace-sort" title={hasMore ? "Sort currently loaded orders" : "Sort orders"}>
            <ClassicOrderIcon name="sort-desc" />
            <span className="orders-workspace-sort__sr">Sort {hasMore ? "loaded orders" : "orders"}</span>
            <select aria-label={hasMore ? "Sort loaded orders" : "Sort orders"} value={sortMode} onChange={(event) => onSortChange(event.target.value)}>
              <option value="latest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="number-desc">Order # ↓</option>
              <option value="number-asc">Order # ↑</option>
              <option value="creator">Creator A–Z</option>
            </select>
          </label>
        ) : null}
      </div>
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

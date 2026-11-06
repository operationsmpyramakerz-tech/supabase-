"use client";

import { useEffect, useId, useRef, useState } from "react";
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

/** One shared, keyboard-accessible sort control for all four orders pages. */
const ORDER_SORT_OPTIONS = [
  { value: "latest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "number-desc", label: "Order # ↓" },
  { value: "number-asc", label: "Order # ↑" },
  { value: "creator", label: "Creator A–Z" },
];

export function OrdersListHeader({ sortMode = "latest", onSortChange, hasMore = false }) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  const menuId = useId();
  const activeOption = ORDER_SORT_OPTIONS.find(option => option.value === sortMode) || ORDER_SORT_OPTIONS[0];

  useEffect(() => {
    if (!sortOpen) return undefined;
    const closeOnOutsideClick = event => {
      if (!sortRef.current?.contains(event.target)) setSortOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === "Escape") {
        setSortOpen(false);
        sortRef.current?.querySelector(".orders-workspace-sort__trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sortOpen]);

  useEffect(() => {
    if (sortOpen) {
      sortRef.current?.querySelector('.orders-workspace-sort__option[aria-checked="true"]')?.focus({ preventScroll: true });
    }
  }, [sortOpen]);

  const handleMenuKeyDown = event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const options = [...(sortRef.current?.querySelectorAll(".orders-workspace-sort__option") || [])];
    if (!options.length) return;
    const current = options.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : event.key === "ArrowDown" ? (current + 1) % options.length
      : (current - 1 + options.length) % options.length;
    options[next]?.focus();
  };

  return (
    <div className="orders-workspace-toolbar-sort">
      {typeof onSortChange === "function" ? (
        <div className="orders-workspace-list-head__tools">
          <div className={`orders-workspace-sort ${sortOpen ? "is-open" : ""}`} ref={sortRef}>
            <button
              type="button"
              className="orders-workspace-sort__trigger"
              aria-label={`Sort ${hasMore ? "loaded orders" : "orders"}: ${activeOption.label}`}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              aria-controls={sortOpen ? menuId : undefined}
              onClick={() => setSortOpen(open => !open)}
            >
              <ClassicOrderIcon name="sort-desc" />
              <span className="orders-workspace-sort__value">{activeOption.label}</span>
              <ClassicOrderIcon name="chevron-down" className="orders-workspace-sort__chevron" />
            </button>
            {sortOpen ? (
              <div id={menuId} className="orders-workspace-sort__menu" role="menu" aria-label="Order sorting" onKeyDown={handleMenuKeyDown} onBlur={event => {
                if (!sortRef.current?.contains(event.relatedTarget)) setSortOpen(false);
              }}>
                <span className="orders-workspace-sort__menu-label">SORT BY</span>
                {ORDER_SORT_OPTIONS.map(option => (
                  <button
                    type="button"
                    key={option.value}
                    className={`orders-workspace-sort__option ${sortMode === option.value ? "is-active" : ""}`}
                    role="menuitemradio"
                    aria-checked={sortMode === option.value}
                    onClick={() => { onSortChange(option.value); setSortOpen(false); sortRef.current?.querySelector(".orders-workspace-sort__trigger")?.focus(); }}
                  >
                    <span>{option.label}</span>
                    {sortMode === option.value ? <ClassicOrderIcon name="check" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
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

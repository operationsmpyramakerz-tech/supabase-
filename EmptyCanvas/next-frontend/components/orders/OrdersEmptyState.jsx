"use client";

import { useEffect, useId, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";
import styles from "./OrdersEmptyState.module.css";

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

// ERP_ORDERS_EMPTY_STATE_V1
function EmptyCabinet() {
  return (
    <svg className={styles.illustration} viewBox="0 0 180 180" fill="none" aria-hidden="true" focusable="false">
      <circle cx="90" cy="91" r="79" fill="var(--empty-halo)" />
      <ellipse cx="91" cy="151" rx="67" ry="17" fill="var(--empty-shadow)" />
      <g stroke="var(--empty-outline)" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round">
        {/* Cabinet body, isometric top and side. */}
        <path d="M65 41 102 19 143 45 106 68Z" fill="var(--empty-paper)" />
        <path d="M106 68 143 45V132L106 155Z" fill="var(--empty-side)" />
        <path d="M65 41 106 68V155L65 129Z" fill="var(--empty-paper)" />
        <path d="M65 47 106 73 143 51" opacity=".48" />
        {/* Top closed drawer. */}
        <path d="M69 53 102 74V112L69 91Z" fill="var(--empty-paper)" />
        <path d="m80 68 11 7v4l-11-7Z" fill="var(--empty-side)" />
        <path d="m79 80 12 8q2 1 2 4l-1 1-12-8q-2-2-1-5Z" fill="var(--empty-paper)" />
        {/* The lower bay and genuinely empty open drawer. */}
        <path d="M69 96 102 117V148L69 128Z" fill="var(--empty-interior)" />
        <path d="M38 116 72 94 103 114 69 135Z" fill="var(--empty-paper)" />
        <path d="M42 117 72 98 99 115 69 133Z" fill="var(--empty-interior)" />
        <path d="M72 98V115L56 126M72 115l19 11" opacity=".5" />
        <path d="M69 135 103 114V140L69 161Z" fill="var(--empty-side)" />
        <path d="M72 150 100 132V136L72 154Z" fill="var(--empty-interior)" />
        <path d="M38 116 69 135V161L38 142Z" fill="var(--empty-paper)" />
        <path d="m47 128 10 6v4l-10-6Z" fill="var(--empty-side)" />
        <path d="m46 137 11 7q2 1 2 3l-1 1-11-7q-2-2-1-4Z" fill="var(--empty-paper)" />
        <path d="M106 155 111 158 119 153V147M136 137v5l5-3v-6" fill="var(--empty-side)" />
      </g>
      <g stroke="#f66b12" strokeWidth="4" strokeLinecap="round">
        <path d="M132 13v10M147 19l-6 9M157 31l-10 5" />
      </g>
    </svg>
  );
}

// Static decorative placeholders, never a loading skeleton or actual order.
// Keep the existing call signature compatible with all four orders clients.
export default function OrdersEmptyState() {
  return (
    <div className={styles.root} role="status" aria-live="polite" aria-atomic="true">
      <div className={styles.content}>
        <EmptyCabinet />
        <div className={styles.labelRow}>
          <span className={styles.rule} aria-hidden="true" />
          <span className={styles.label}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="m12 7 8-4 3 4-8 4-3-4-3 4-8-4 3-4 8 4ZM4 9v10l8 4 8-4V9M12 12v11" />
            </svg>
            Empty
          </span>
          <span className={styles.rule} aria-hidden="true" />
        </div>
        <p className={styles.message}>No orders in this category.</p>
        <div className={styles.placeholders} aria-hidden="true">
          {[0, 1, 2].map(index => (
            <div className={styles.placeholder} key={index}>
              <span className={styles.tile}><ClassicOrderIcon name="package" /></span>
              <span className={styles.lines}>
                <span className={styles.lineLong} />
                <span className={styles.lineShort} />
              </span>
              <span className={styles.emptyPill}>Empty</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

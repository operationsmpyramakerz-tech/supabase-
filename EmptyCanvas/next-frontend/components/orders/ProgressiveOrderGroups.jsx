"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OrderGroupHeader } from "./OrderGrouping";

const PAGE_SIZE = 36;

/**
 * Keep expensive component rows out of the first modal paint on large orders.
 * Filtering, grouping, edits, approvals and exports still receive the COMPLETE
 * item collection in their parent; pagination is only for the rendered rows.
 */
export default function ProgressiveOrderGroups({
  groups = [],
  mode = "product-tag",
  renderItem,
  query = "",
  resetKey = "",
}) {
  const [page, setPage] = useState({ key: resetKey, limit: PAGE_SIZE });
  const sentinelRef = useRef(null);
  const total = useMemo(
    () => groups.reduce((sum, group) => sum + (group?.items?.length || 0), 0),
    [groups],
  );
  // Reset immediately on a different order, tab, sort or search query; do not
  // show a stale expanded list during the render before the reset effect runs.
  const limit = page.key === resetKey ? page.limit : PAGE_SIZE;
  const visibleCount = Math.min(limit, total);
  const hasMore = visibleCount < total;
  const visibleGroups = useMemo(() => {
    let remaining = visibleCount;
    const result = [];
    for (const group of groups) {
      if (remaining <= 0) break;
      const count = Math.min(remaining, group.items.length);
      if (count > 0) result.push({ ...group, visibleItems: group.items.slice(0, count) });
      remaining -= count;
    }
    return result;
  }, [groups, visibleCount]);

  useEffect(() => {
    setPage({ key: resetKey, limit: PAGE_SIZE });
  }, [resetKey]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!hasMore || !node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setPage((current) => ({
        key: resetKey,
        limit: Math.min(total, (current.key === resetKey ? current.limit : PAGE_SIZE) + PAGE_SIZE),
      }));
    }, { rootMargin: "0px 0px 220px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, resetKey, total, visibleCount]);

  const expand = (all = false) => setPage((current) => ({
    key: resetKey,
    limit: all ? total : Math.min(total, (current.key === resetKey ? current.limit : PAGE_SIZE) + PAGE_SIZE),
  }));

  return (
    <div className="order-components-panel">
      {total ? (
        <div className="order-components-panel__heading">
          <strong>Components</strong>
          <span aria-live="off">{hasMore ? `${visibleCount} of ${total} shown` : `${total} item${total === 1 ? "" : "s"}`}</span>
        </div>
      ) : null}
      <div className="co-modal-items order-component-groups">
        {visibleGroups.length ? visibleGroups.map((section) => (
          <section className="order-component-group" key={`${section.folderName || "products"}:${section.tag}`}>
            <OrderGroupHeader group={section} mode={mode} />
            <div className="order-component-group__items">{section.visibleItems.map(renderItem)}</div>
          </section>
        )) : <div className="order-component-search-empty">{query.trim() ? "No matching components." : "No items."}</div>}
      </div>
      {hasMore ? (
        <div className="order-components-panel__more" ref={sentinelRef}>
          <span>{total - visibleCount} more component{total - visibleCount === 1 ? "" : "s"}</span>
          <div className="order-components-panel__more-actions">
            <button type="button" className="order-components-panel__load" onClick={() => expand(false)}>
              Show {Math.min(PAGE_SIZE, total - visibleCount)} more
            </button>
            <button type="button" className="order-components-panel__all" onClick={() => expand(true)}>Show all</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

const SORT_OPTIONS = [
  { value: "latest", label: "Newest first", icon: "sort-desc" },
  { value: "oldest", label: "Oldest first", icon: "sort-asc" },
  { value: "number-desc", label: "Order number: high to low", icon: "sort-numeric-desc" },
  { value: "number-asc", label: "Order number: low to high", icon: "sort-numeric-asc" },
  { value: "creator", label: "Creator A–Z", icon: "sort-alpha" },
];

/** Single preference trigger for type filtering and sorting on the four orders pages.
 * Changes are applied immediately using the page's existing handlers. */
export default function OrdersPreferencesControl({
  filterValue = "all", filterOptions = [], onFilterChange, onFilterOpen,
  loading = false, error = false, sortMode = "latest", onSortChange,
  hasMore = false,
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("filter");
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelId = useId();
  const tabPrefix = useId();
  const activeSort = SORT_OPTIONS.find(option => option.value === sortMode) || SORT_OPTIONS[0];
  const activeFilter = filterValue !== "all";
  const preferencesChanged = activeFilter || sortMode !== "latest";

  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const escape = event => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const show = () => {
    if (open) { setOpen(false); return; }
    if (section === "filter") onFilterOpen?.();
    setOpen(true);
  };
  const switchSection = value => {
    setSection(value);
    if (value === "filter") onFilterOpen?.();
  };
  const selectFilter = value => {
    onFilterChange?.(value);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const selectSort = value => {
    onSortChange?.(value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const filterList = [
    { key: "all", label: "All order types", icon: "layers" },
    ...filterOptions.filter(item => item?.key && item.key !== "all").map(item => ({
      key: item.key,
      label: item.label,
      icon: item.icon || "package",
      bg: item.bg,
      fg: item.fg,
      bd: item.bd,
    })),
  ];

  return (
    <div ref={rootRef} className={`orders-preferences ${open ? "is-open" : ""} ${preferencesChanged ? "has-preferences" : ""}`}>
      <button
        ref={triggerRef}
        className="orders-preferences__trigger"
        type="button"
        aria-label={`Filter and sort preferences${activeFilter ? ", order type selected" : ""}; sorting: ${activeSort.label}`}
        title="Filter & sort"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={show}
      >
        <ClassicOrderIcon name="preferences" />
        {preferencesChanged ? <span className="orders-preferences__active-dot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div id={panelId} className="orders-preferences__panel" role="dialog" aria-label="Order filter and sort preferences">
          <div className="orders-preferences__heading">
            <div>
              <strong>Preferences</strong>
            </div>
            <button type="button" className="orders-preferences__close" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} aria-label="Close preferences">
              <ClassicOrderIcon name="x" />
            </button>
          </div>
          <div className="orders-preferences__tabs" role="tablist" aria-label="Preference category" onKeyDown={event => { if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return; event.preventDefault(); const target = section === "filter" ? "sort" : "filter"; switchSection(target); document.getElementById(`${tabPrefix}-${target}`)?.focus(); }}>
            <button type="button" id={`${tabPrefix}-filter`} role="tab" aria-selected={section === "filter"} aria-controls={`${tabPrefix}-body`} className={section === "filter" ? "is-selected" : ""} onClick={() => switchSection("filter")}>
              <ClassicOrderIcon name="filter" /><span>Filter</span>{activeFilter ? <i aria-label="Active" /> : null}
            </button>
            <button type="button" id={`${tabPrefix}-sort`} role="tab" aria-selected={section === "sort"} aria-controls={`${tabPrefix}-body`} className={section === "sort" ? "is-selected" : ""} onClick={() => switchSection("sort")}>
              <ClassicOrderIcon name="sort-desc" /><span>Sort</span>
            </button>
          </div>
          <div className="orders-preferences__content" id={`${tabPrefix}-body`} role="tabpanel" aria-labelledby={`${tabPrefix}-${section}`}>
            {section === "filter" ? (
              <>
                <div className="orders-preferences__section-title"><b>Order type</b></div>
                <div className="orders-preferences__options" aria-label={loading ? "Order type counts updating" : error ? "Order type counts unavailable" : "Order types"}>
                  {filterList.map(option => (
                    <button key={option.key} type="button" className={`orders-preferences__choice ${filterValue === option.key ? "is-selected" : ""}`} aria-pressed={filterValue === option.key} onClick={() => selectFilter(option.key)}>
                      <span className="orders-preferences__choice-icon" style={option.bg ? { backgroundColor: option.bg, color: option.fg || "#162033", borderColor: option.bd || option.bg } : undefined}><ClassicOrderIcon name={option.icon} /></span>
                      <span className="orders-preferences__choice-text"><strong>{option.label}</strong></span>
                      {filterValue === option.key ? <ClassicOrderIcon name="check" /> : null}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="orders-preferences__section-title"><b>Sort by</b></div>
                <div className="orders-preferences__options" aria-label={hasMore ? "Sorting applies to loaded orders only" : "Sort options"}>
                  {SORT_OPTIONS.map(option => (
                    <button key={option.value} type="button" className={`orders-preferences__choice ${sortMode === option.value ? "is-selected" : ""}`} aria-pressed={sortMode === option.value} onClick={() => selectSort(option.value)}>
                      <span className="orders-preferences__choice-icon"><ClassicOrderIcon name={option.icon} /></span>
                      <span className="orders-preferences__choice-text"><strong>{option.label}</strong></span>
                      {sortMode === option.value ? <ClassicOrderIcon name="check" /> : null}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

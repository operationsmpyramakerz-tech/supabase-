"use client";

import { useEffect, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesOrderComponentSearch(item, query) {
  const needle = normalized(query);
  if (!needle) return true;

  const fields = [
    item?.productName,
    item?.product_name,
    item?.idCode,
    item?.id_code,
    item?.code,
    item?.sku,
    item?.productTag,
    item?.product_tag,
    item?.kitTag,
    item?.kit_tag,
    item?.kitFolderName,
    item?.kit_folder_name,
    item?.issueDescription,
    item?.issue_description,
  ];

  return fields.some((value) => normalized(value).includes(needle));
}

export default function OrderComponentSearch({ value = "", onChange, disabled = false, ariaLabel = "Search components", collapseOnToggle = false }) {
  const [expanded, setExpanded] = useState(Boolean(value));
  const inputRef = useRef(null);

  useEffect(() => {
    if (!expanded) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  const toggleSearch = () => {
    if (disabled) return;
    if (expanded && collapseOnToggle) {
      onChange?.("");
      setExpanded(false);
      return;
    }
    if (!expanded) setExpanded(true);
    else inputRef.current?.focus();
  };

  const closeSearch = () => {
    onChange?.("");
    setExpanded(false);
  };

  return (
    <div className={`order-component-search${expanded ? " is-expanded" : ""}`} role="search" aria-label={ariaLabel}>
      <button
        type="button"
        className="order-component-search__toggle"
        onClick={toggleSearch}
        aria-label={expanded && collapseOnToggle ? "Close component search" : ariaLabel}
        aria-expanded={expanded}
        title={expanded && collapseOnToggle ? "Close search" : ariaLabel}
        disabled={disabled}
      >
        <ClassicOrderIcon name="search" />
      </button>
      <input
        ref={inputRef}
        className="order-component-search__input"
        type="search"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder="Search components..."
        aria-label={ariaLabel}
        tabIndex={expanded ? 0 : -1}
        disabled={disabled}
      />
      <button
        type="button"
        className="order-component-search__close"
        onClick={closeSearch}
        aria-label="Close component search"
        title="Close search"
        tabIndex={expanded ? 0 : -1}
        disabled={disabled}
      >
        <ClassicOrderIcon name="x" />
      </button>
    </div>
  );
}

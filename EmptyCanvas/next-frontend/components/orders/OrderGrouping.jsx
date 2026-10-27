"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ClassicOrderIcon from "./ClassicOrderIcon";

function text(value) {
  return String(value ?? "").trim();
}

function naturalCompare(a, b) {
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: "base" });
}

export function groupOrderItems(items = [], mode = "product-tag") {
  const source = Array.isArray(items) ? items : [];
  const groups = new Map();

  source.forEach((item) => {
    const isKit = mode === "kit-tag";
    const tag = isKit
      ? (text(item?.kitTag ?? item?.kit_tag) || "Unassigned kit")
      : (text(item?.productTag ?? item?.product_tag) || text(item?.productTags?.[0]) || "Uncategorized");
    const folderName = isKit ? (text(item?.kitFolderName ?? item?.kit_folder_name) || "Unfiled Kits") : "";
    const key = `${folderName.toLowerCase()}|${tag.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { tag, folderName, items: [] });
    groups.get(key).items.push(item);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.slice().sort((a, b) => naturalCompare(a?.productName, b?.productName)),
    }))
    .sort((a, b) => naturalCompare(a.folderName, b.folderName) || naturalCompare(a.tag, b.tag))
    .map((group, index) => ({ ...group, tone: index % 6 }));
}

// Keep the Sort popup outside the order sheet's scroll/overflow containers.
// Its placement is always based on the actual trigger, not the screen bottom.
function getSortPopupPosition(trigger, menu) {
  const rect = trigger.getBoundingClientRect();
  const viewport = window.visualViewport;
  const minX = (viewport?.offsetLeft || 0) + 12;
  const minY = (viewport?.offsetTop || 0) + 12;
  const maxX = (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) - 12;
  const maxY = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 12;
  const width = Math.max(0, Math.min(340, maxX - minX));
  const menuHeight = menu?.scrollHeight || 160;
  const gap = 8;
  const below = Math.max(0, maxY - rect.bottom - gap);
  const above = Math.max(0, rect.top - minY - gap);
  const openAbove = below < menuHeight && above > below;
  const availableHeight = openAbove ? above : below;
  const maxHeight = Math.max(0, Math.min(menuHeight, availableHeight));
  const top = openAbove ? rect.top - gap - maxHeight : rect.bottom + gap;
  return {
    left: Math.max(minX, Math.min(rect.right - width, maxX - width)),
    top: Math.max(minY, Math.min(top, maxY - maxHeight)),
    width,
    maxHeight,
  };
}

export function OrderSortButton({ value = "product-tag", onChange, align = "right" }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const menuRef = useRef(null);
  const options = useMemo(() => [
    { value: "product-tag", title: "By products tag", note: "Group components by the tag saved on Products." },
    { value: "kit-tag", title: "By kits tag", note: "Group components by their Kits membership." },
  ], []);

  const placeMenu = useCallback(() => {
    if (triggerRef.current) {
      setPosition(getSortPopupPosition(triggerRef.current, menuRef.current));
    }
  }, []);

  // Measure the real menu after mounting (and reposition if it must open upward).
  useLayoutEffect(() => {
    if (open) placeMenu();
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    // Capture scrolling from nested modal panes, not just the window.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", placeMenu, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", placeMenu);
    window.visualViewport?.addEventListener("resize", placeMenu);
    window.visualViewport?.addEventListener("scroll", placeMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", placeMenu, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", placeMenu);
      window.visualViewport?.removeEventListener("resize", placeMenu);
      window.visualViewport?.removeEventListener("scroll", placeMenu);
    };
  }, [open, placeMenu]);

  return (
    <div className={`order-sort-menu-wrap order-sort-menu-wrap--${align}`} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ro-action-btn ro-action-btn--dark order-sort-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            if (triggerRef.current) setPosition(getSortPopupPosition(triggerRef.current, null));
            setOpen(true);
          }
        }}
      >
        <ClassicOrderIcon name="filter" /><span>Sort</span>
      </button>
      {open && position && typeof document !== "undefined" ? createPortal(
        <div className="next-classic-orders-parity order-sort-portal-scope" style={position} ref={popupRef}>
          <div className="order-sort-menu" role="menu" aria-label="Component grouping options" ref={menuRef}>
            {options.map((option) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value === option.value}
                className={value === option.value ? "is-active" : ""}
                onClick={() => { onChange?.(option.value); setOpen(false); }}
                key={option.value}
              >
                <span className="order-sort-menu__check">{value === option.value ? "✓" : ""}</span>
                <span><strong>{option.title}</strong><small>{option.note}</small></span>
              </button>
            ))}
          </div>
        </div>, document.body
      ) : null}
    </div>
  );
}

export function OrderGroupHeader({ group, mode = "product-tag" }) {
  const isKit = mode === "kit-tag";
  return (
    <div className={`order-component-group__head order-component-group__head--tone-${group?.tone ?? 0}`}>
      <div>
        <span>{isKit ? "KIT TAG" : "PRODUCT TAG"}</span>
        <strong>{group?.tag || (isKit ? "Unassigned kit" : "Uncategorized")}</strong>
        {isKit && group?.folderName ? <small>{group.folderName}</small> : null}
      </div>
      <em>{group?.items?.length || 0} item{group?.items?.length === 1 ? "" : "s"}</em>
    </div>
  );
}

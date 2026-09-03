"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export function OrderSortButton({ value = "product-tag", onChange, align = "right" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const options = useMemo(() => [
    { value: "product-tag", title: "By products tag", note: "Group components by the tag saved on Products." },
    { value: "kit-tag", title: "By kits tag", note: "Group components by their Kits membership." },
  ], []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`order-sort-menu-wrap order-sort-menu-wrap--${align}`} ref={wrapRef}>
      <button type="button" className="ro-action-btn ro-action-btn--dark order-sort-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <ClassicOrderIcon name="filter" /><span>Sort</span><ClassicOrderIcon name="chevron-down" />
      </button>
      {open ? (
        <div className="order-sort-menu" role="menu" aria-label="Component grouping options">
          {options.map((option) => (
            <button
              type="button"
              role="menuitem"
              className={value === option.value ? "is-active" : ""}
              onClick={() => { onChange?.(option.value); setOpen(false); }}
              key={option.value}
            >
              <span className="order-sort-menu__check">{value === option.value ? "✓" : ""}</span>
              <span><strong>{option.title}</strong><small>{option.note}</small></span>
            </button>
          ))}
        </div>
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

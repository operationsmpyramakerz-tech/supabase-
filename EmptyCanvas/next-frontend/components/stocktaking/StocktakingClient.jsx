"use client";

import HeaderFolderBreadcrumb from "../HeaderFolderBreadcrumb";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { featureAllowed } from "../../lib/feature-permissions-registry";

const StocktakingDialogs = dynamic(() => import("./StocktakingDialogs"), { ssr: false });


const TAG_TONES = {
  gray: { background: "#F3F4F6", color: "#374151", border: "#E5E7EB" },
  brown: { background: "#EFEBE9", color: "#4E342E", border: "#D7CCC8" },
  orange: { background: "#FFF7ED", color: "#9A3412", border: "#FED7AA" },
  yellow: { background: "#FEFCE8", color: "#854D0E", border: "#FDE68A" },
  green: { background: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
  blue: { background: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
  purple: { background: "#F5F3FF", color: "#5B21B6", border: "#DDD6FE" },
  pink: { background: "#FDF2F8", color: "#9D174D", border: "#FBCFE8" },
  red: { background: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  default: { background: "#F3F4F6", color: "#111827", border: "#E5E7EB" },
};

const TAG_GROUP_TONE_ORDER = ["orange", "blue", "green", "purple", "pink", "yellow", "brown", "red", "gray"];

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return "";
}

function tagColor(name, fallback) {
  const canonical = lower(name).replace(/[^a-z0-9]+/g, "");
  if (["requestproducts", "requestproduct", "requestcomponents", "requestcomponent"].includes(canonical)) return "green";
  if (["withdrawproducts", "withdrawproduct", "withdrawalproducts", "withdrawalproduct", "withdrawcomponents", "withdrawcomponent", "withdrawalcomponents", "withdrawalcomponent"].includes(canonical)) return "red";
  return TAG_TONES[fallback] ? fallback : "default";
}

function normalizeReceiptPhotos(value) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows.map((item, index) => ({
    name: text(item?.name) || `Receipt ${index + 1}`,
    url: normalizedUrl(item?.url),
  })).filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function normalizedRow(row, index) {
  const tagName = text(row?.tag?.name) || "Untagged";
  return {
    ...row,
    key: text(row?.id) || `${text(row?.name)}-${index}`,
    name: text(row?.name) || "Untitled component",
    idCode: text(row?.idCode),
    quantity: number(row?.quantity),
    receiptNumber: text(row?.receiptNumber),
    receiptPhotos: normalizeReceiptPhotos(row?.receiptPhotos),
    inventory: row?.inventory === null || typeof row?.inventory === "undefined" || row?.inventory === "" ? null : number(row.inventory),
    defected: row?.defected === null || typeof row?.defected === "undefined" || row?.defected === "" ? null : number(row.defected),
    unitPrice: number(row?.unitPrice),
    url: normalizedUrl(row?.url),
    componentTag: text(row?.componentTag || row?.productTag) || tagName,
    kitTag: text(row?.kitTag || row?.sourceKit) || tagName,
    orderNumber: text(row?.orderNumber || row?.sourceOrderNumber),
    sourceOrderRowId: text(row?.sourceOrderRowId),
    tag: { name: tagName, color: tagColor(tagName, text(row?.tag?.color)) },
  };
}

function sortReceiptValues(a, b) {
  const aValue = text(a);
  const bValue = text(b);
  if (!aValue && bValue) return 1;
  if (aValue && !bValue) return -1;
  return aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: "base" });
}

function groupRows(rows, rowSort = "component", groupMode = "component") {
  const groups = new Map();
  rows.forEach((row) => {
    const groupName = groupMode === "kit"
      ? (text(row.kitTag) || text(row.tag?.name) || "Untagged")
      : (text(row.componentTag) || text(row.tag?.name) || "Untagged");
    const key = lower(groupName) || "untagged";
    if (!groups.has(key)) groups.set(key, { key, name: groupName || "Untagged", items: [] });
    groups.get(key).items.push(row);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => rowSort === "receipt"
        ? (sortReceiptValues(a.receiptNumber, b.receiptNumber) || a.name.localeCompare(b.name))
        : a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const aUntagged = lower(a.name) === "untagged" || a.name === "-";
      const bUntagged = lower(b.name) === "untagged" || b.name === "-";
      if (aUntagged !== bUntagged) return aUntagged ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
}

function groupRowsByReceipt(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = text(row.receiptNumber);
    const key = lower(label) || "__no_receipt__";
    if (!groups.has(key)) groups.set(key, { key, label: label || "No receipt number", items: [] });
    groups.get(key).items.push(row);
  });
  return [...groups.values()]
    .map((group) => ({ ...group, tagGroups: groupRows(group.items, "component", "component") }))
    .sort((a, b) => {
      if (a.key === "__no_receipt__") return 1;
      if (b.key === "__no_receipt__") return -1;
      return sortReceiptValues(a.label, b.label);
    });
}

function groupRowsByOrderNumber(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = text(row.orderNumber);
    const key = lower(label) || "__no_order__";
    if (!groups.has(key)) groups.set(key, { key, label: label || "No order number", items: [] });
    groups.get(key).items.push(row);
  });
  return [...groups.values()]
    .map((group) => ({ ...group, kitGroups: groupRows(group.items, "component", "kit") }))
    .sort((a, b) => {
      if (a.key === "__no_order__") return 1;
      if (b.key === "__no_order__") return -1;
      return sortReceiptValues(a.label, b.label);
    });
}


function Icon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    chevron: <polyline points="6 9 12 15 18 9" />,
    check: <polyline points="20 6 9 17 4 12" />,
    folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></>,
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    sort: <><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    cubes: <><path d="m12 2 5 3v6l-5 3-5-3V5l5-3z" /><path d="m7 11-5 3v6l5 3 5-3v-6M17 11l5 3v6l-5 3-5-3v-6M12 14v6M2 14l5 3 5-3 5 3 5-3" /></>,
    box: <><path d="m12 2 9 5-9 5-9-5 9-5z" /><path d="M3 7v10l9 5 9-5V7M12 12v10" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    images: <><rect x="2" y="3" width="20" height="18" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m21 16-5-5L5 21" /></>,
    clipboard: <><rect x="5" y="4" width="14" height="18" rx="2" /><rect x="9" y="2" width="6" height="5" rx="1" /><path d="m9 14 2 2 4-4" /></>,
    more: <><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" /></>,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    upDown: <><path d="m7 16 4 4 4-4M11 20V4M7 8l4-4 4 4" /></>,
  };
  return <svg {...common}>{paths[name] || paths.download}</svg>;
}

function StockProductPicker({ value = "", products = [], disabled = false, placeholder = "Select component", currentLabel = "", onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const selected = products.find((product) => String(product.id) === String(value)) || null;
  const label = selected?.name || currentLabel || placeholder;

  const visibleProducts = useMemo(() => {
    const needle = lower(query);
    if (!needle) return products;
    return products.filter((product) => lower(`${product.name} ${product.displayId || ""}`).includes(needle));
  }, [products, query]);

  useEffect(() => {
    if (!open) return undefined;
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(Math.max(rect.width, 300), window.innerWidth - margin * 2, 475);
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width));
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const placeAbove = below < 250 && above > below;
      const available = Math.max(100, (placeAbove ? above : below) - 8);
      const height = Math.min(320, available);
      setMenuPosition({ left, top: placeAbove ? Math.max(margin, rect.top - height - 7) : rect.bottom + 7, width, maxHeight: height });
    };
    positionMenu();
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30);
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  const choose = (productId) => {
    onChange?.(productId);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={`stocktaking-product-picker ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`stocktaking-product-picker__trigger ${selected || currentLabel ? "has-value" : "is-placeholder"}`}
        onClick={() => { if (!disabled) setOpen((current) => { if (current) setQuery(""); return !current; }); }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{label}</span>
        <Icon name="chevron" />
      </button>
      {open && menuPosition && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className="stocktaking-product-picker__menu stocktaking-picker-floating" style={menuPosition}>
          <div className="stocktaking-product-picker__search">
            <Icon name="search" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search components..."
              aria-label="Search components"
            />
          </div>
          <div className="stocktaking-product-picker__options" role="listbox">
            {visibleProducts.length ? visibleProducts.map((product) => {
              const active = String(product.id) === String(value);
              return (
                <button
                  type="button"
                  key={product.id}
                  className={active ? "is-selected" : ""}
                  onClick={() => choose(product.id)}
                  role="option"
                  aria-selected={active}
                >
                  <span>
                    <strong>{product.name}</strong>
                    {product.displayId ? <small>{product.displayId}</small> : null}
                  </span>
                  {active ? <Icon name="check" /> : null}
                </button>
              );
            }) : <div className="stocktaking-product-picker__empty">No matching components</div>}
          </div>
        </div>, document.body
      ) : null}
    </div>
  );
}

function StockTagPicker({ value = "", tags = [], disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const inputRef = useRef(null);
  const options = useMemo(() => {
    const seen = new Set();
    return (Array.isArray(tags) ? tags : []).map(text).filter((tag) => {
      const key = lower(tag);
      if (!key || key === "untagged" || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [tags]);

  useEffect(() => {
    if (!open) return undefined;
    const positionMenu = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - margin * 2, 475);
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - width));
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const placeAbove = below < 220 && above > below;
      const height = Math.min(300, Math.max(110, (placeAbove ? above : below) - 8));
      setMenuPosition({ left, top: placeAbove ? Math.max(margin, rect.top - height - 7) : rect.bottom + 7, width, maxHeight: height });
    };
    positionMenu();
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
        setAdding(false);
        setNewTag("");
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        setAdding(false);
        setNewTag("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  const pick = (tag) => {
    onChange?.(tag);
    setOpen(false);
    setAdding(false);
    setNewTag("");
  };
  const addTag = () => {
    const tag = text(newTag);
    if (tag) pick(tag);
  };

  return (
    <div className={`stocktaking-tag-picker ${open ? "is-open" : ""}`} ref={rootRef}>
      <button type="button" className={`stocktaking-tag-picker__trigger ${value ? "has-value" : "is-placeholder"}`} onClick={() => { if (!disabled) setOpen((current) => !current); }} disabled={disabled} aria-expanded={open} aria-haspopup="listbox">
        <span>{value || "Select tag"}</span><Icon name="chevron" />
      </button>
      {open && menuPosition && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} className="stocktaking-tag-picker__menu stocktaking-picker-floating" style={menuPosition}>
          <div className="stocktaking-tag-picker__options" role="listbox">
            {options.length ? options.map((tag) => (
              <button type="button" key={tag} className={lower(value) === lower(tag) ? "is-selected" : ""} onClick={() => pick(tag)} role="option" aria-selected={lower(value) === lower(tag)}>
                <span>{tag}</span>{lower(value) === lower(tag) ? <Icon name="check" /> : null}
              </button>
            )) : <div className="stocktaking-tag-picker__empty">No saved tags yet</div>}
          </div>
          {adding ? (
            <div className="stocktaking-tag-picker__new">
              <input ref={inputRef} type="text" value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} placeholder="New tag name" autoFocus />
              <button type="button" onClick={addTag} disabled={!text(newTag)}>Add</button>
            </div>
          ) : (
            <button type="button" className="stocktaking-tag-picker__add" onClick={() => { setAdding(true); window.setTimeout(() => inputRef.current?.focus(), 20); }}><Icon name="plus" /><span>Add new tag</span></button>
          )}
        </div>, document.body
      ) : null}
    </div>
  );
}

function StockReceiptUploadPicker({ files = [], disabled = false, onChange, onError }) {
  const inputRef = useRef(null);
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const next = (Array.isArray(files) ? files : []).map((file, index) => ({ file, index, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);

  const chooseFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const invalid = incoming.find((file) => !/^image\//i.test(file.type || ""));
    if (invalid) return onError?.("Receipt uploads must be images.");
    const tooLarge = incoming.find((file) => Number(file.size || 0) > RECEIPT_SOURCE_MAX_BYTES);
    if (tooLarge) return onError?.(`${tooLarge.name} is larger than 8 MB.`);
    const combined = [...files, ...incoming];
    const seen = new Set();
    onChange?.(combined.filter((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
    onError?.("");
    if (inputRef.current) inputRef.current.value = "";
  };
  const remove = (index) => onChange?.(files.filter((_, itemIndex) => itemIndex !== index));

  return (
    <div className="stocktaking-receipt-upload">
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => chooseFiles(event.target.files)} disabled={disabled} />
      <button type="button" className={`stocktaking-receipt-upload__button ${files.length ? "has-files" : ""}`} onClick={() => inputRef.current?.click()} disabled={disabled}>
        <Icon name="plus" /><span>{files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} selected` : "Upload photos"}</span>
      </button>
      {previews.length ? (
        <div className="stocktaking-receipt-upload__previews">
          {previews.map((item) => (
            <span key={`${item.file.name}-${item.file.size}-${item.file.lastModified}-${item.index}`}>
              <img src={item.url} alt="" />
              <button type="button" onClick={() => remove(item.index)} disabled={disabled} aria-label={`Remove ${item.file.name || "receipt photo"}`}>×</button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function StocktakingClient({ account, initialStock = [], initialColumns = [] }) {
  const fallbackColumn = useMemo(() => {
    const first = (Array.isArray(initialStock) ? initialStock : []).find((item) => text(item?.quantityColumn));
    const key = text(first?.quantityColumn);
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase()).replace(/\s+Stock$/i, "").trim();
    return key ? { key, label: label || key, itemsCount: initialStock.length } : null;
  }, [initialStock]);

  const columns = useMemo(() => {
    const list = Array.isArray(initialColumns) ? initialColumns : [];
    if (list.length) return list
      .map((item) => ({
        key: text(item?.key || item?.column || item?.value),
        label: text(item?.label || item?.value || item?.key || item?.column),
        itemsCount: Number.isFinite(Number(item?.itemsCount)) ? Number(item.itemsCount) : null,
        userId: text(item?.userId),
        stocktakingLabel: text(item?.stocktakingLabel),
      }))
      .filter((item) => item.key && item.label);
    return fallbackColumn ? [fallbackColumn] : [];
  }, [initialColumns, fallbackColumn]);

  const can = (action) => featureAllowed(account, `stocktaking.${action}`);
  const canEditRow = can("edit_rows") && can("authorize_column");
  const canAddRow = can("add_row") && can("authorize_column");
  const canEditColumn = canEditRow || canAddRow;
  const canStartInventory = can("start_inventory");
  const canUpdateInventory = can("update_inventory");
  const canUploadReceipt = can("upload_receipt");
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState(null);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inventorySetupOpen, setInventorySetupOpen] = useState(false);
  const [inventoryFinishOpen, setInventoryFinishOpen] = useState(false);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventorySession, setInventorySession] = useState(null);
  const [inventorySaveError, setInventorySaveError] = useState("");
  const [sortMode, setSortMode] = useState("kit");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [groupOptionsOpen, setGroupOptionsOpen] = useState(false);
  const [groupExpandedOverrides, setGroupExpandedOverrides] = useState({});
  const [openRowActions, setOpenRowActions] = useState("");
  const [editRowId, setEditRowId] = useState("");
  const [editDraft, setEditDraft] = useState({ productId: "", quantity: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [editPasswordOpen, setEditPasswordOpen] = useState(false);
  const [editPasswordError, setEditPasswordError] = useState("");
  const [pendingEditTarget, setPendingEditTarget] = useState(null);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [newRowDraft, setNewRowDraft] = useState({ productId: "", quantity: "", tag: "", receiptNumber: "" });
  const [newRowReceiptFiles, setNewRowReceiptFiles] = useState([]);
  const inventorySaveTimers = useRef(new Map());
  const sortMenuRef = useRef(null);
  const tableScrollRef = useRef(null);
  const [tableScrollState, setTableScrollState] = useState({ canLeft: false, canRight: false });
  useEffect(() => {
    if (!editRowId && !newRowOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key !== "Escape" || editBusy || editPasswordOpen) return;
      // Let an expanded component/tag picker consume the first Escape.
      if (document.querySelector(".stocktaking-picker-floating")) return;
      if (newRowOpen) cancelNewRow();
      else cancelRowEdit();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [editRowId, newRowOpen, editBusy, editPasswordOpen]);

  useEffect(() => () => {
    inventorySaveTimers.current.forEach((timer) => clearTimeout(timer));
    inventorySaveTimers.current.clear();
  }, []);

  const updateTableScrollState = () => {
    const scroller = tableScrollRef.current;
    if (!scroller) {
      setTableScrollState({ canLeft: false, canRight: false });
      return;
    }
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    setTableScrollState({
      canLeft: scroller.scrollLeft > 2,
      canRight: scroller.scrollLeft < maxScroll - 2,
    });
  };

  const scrollTableHorizontally = (direction) => {
    const scroller = tableScrollRef.current;
    if (!scroller) return;
    const step = Math.max(240, Math.round(scroller.clientWidth * 0.78));
    scroller.scrollBy({ left: direction * step, behavior: "smooth" });
    window.setTimeout(updateTableScrollState, 260);
  };

  useEffect(() => {
    if (!activeColumn || loading) return undefined;
    const frame = window.requestAnimationFrame(updateTableScrollState);
    const onResize = () => updateTableScrollState();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [activeColumn?.key, loading, stock.length, editRowId, newRowOpen, inventorySession?.inventoryColumn, inventorySession?.defectedColumn]);

  useEffect(() => {
    if (!sortMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!sortMenuRef.current?.contains(event.target)) setSortMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSortMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!openRowActions) return undefined;
    const handlePointer = (event) => {
      if (!event.target.closest?.(".stocktaking-inline-actions")) setOpenRowActions("");
    };
    const handleEscape = (event) => { if (event.key === "Escape") setOpenRowActions(""); };
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openRowActions]);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = activeColumn ? `Search ${activeColumn.label}...` : "Search stock folders...";
    const handle = (event) => setSearch(event.target.value || "");
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && input.value) {
        input.value = "";
        setSearch("");
      }
    };
    input.addEventListener("input", handle);
    input.addEventListener("keydown", handleKeyDown);
    return () => {
      input.removeEventListener("input", handle);
      input.removeEventListener("keydown", handleKeyDown);
      input.value = "";
      input.placeholder = "Search";
    };
  }, [activeColumn?.key, activeColumn?.label]);

  useEffect(() => {
    if (!columns.length || typeof window === "undefined") return;
    const key = text(new URLSearchParams(window.location.search).get("column"));
    if (!key) return;
    const match = columns.find((item) => item.key === key);
    if (match) openFolder(match, { updateHistory: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.map((item) => item.key).join("|")]);

  async function loadColumn(column, session = inventorySession, { fresh = false } = {}) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ column: column.key });
      if (fresh) params.set("_fresh", "1");
      if (session?.inventoryColumn) params.set("inventoryColumn", session.inventoryColumn);
      if (session?.defectedColumn) params.set("defectedColumn", session.defectedColumn);
      const response = await fetch(`/next/api/stock?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body)) throw new Error(body?.error || "Failed to load this Stocktaking folder.");
      setStock(body);
    } catch (loadError) {
      setStock([]);
      setError(loadError?.message || "Failed to load this Stocktaking folder.");
    } finally {
      setLoading(false);
    }
  }

  async function startInventory({ mode, date }) {
    if (!activeColumn?.key) throw new Error("Open a Stocktaking folder first.");
    setInventoryBusy(true);
    setInventorySaveError("");
    try {
      const response = await fetch("/next/api/stock/mutations-direct", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inventory-start", column: activeColumn.key, mode, date }),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(body?.error || "Inventory columns could not be prepared.");
      const session = {
        mode: body.mode || mode,
        date: body.date || date,
        inventoryColumn: text(body.inventoryColumn),
        defectedColumn: text(body.defectedColumn),
      };
      setInventorySession(session);
      setInventorySetupOpen(false);
      await loadColumn(activeColumn, session, { fresh: true });
      return session;
    } finally {
      setInventoryBusy(false);
    }
  }

  async function saveInventoryCell(row, kind, rawValue) {
    if (!row?.id || !inventorySession) return;
    const column = kind === "inventory" ? inventorySession.inventoryColumn : inventorySession.defectedColumn;
    if (!column) return;
    const value = rawValue === "" ? null : Number(rawValue);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    const timerKey = `${row.id}:${kind}`;
    const previous = inventorySaveTimers.current.get(timerKey);
    if (previous) clearTimeout(previous);
    setStock((current) => (Array.isArray(current) ? current : []).map((item) => text(item?.id) === text(row.id) ? { ...item, [kind]: value } : item));
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/next/api/stock/mutations-direct", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "inventory-value", stockId: row.id, column, value, stockColumn: activeColumn?.key || "" }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok === false) throw new Error(body?.error || `Failed to save ${kind}.`);
        setInventorySaveError("");
      } catch (saveError) {
        setInventorySaveError(saveError?.message || `Failed to save ${kind}.`);
      } finally {
        inventorySaveTimers.current.delete(timerKey);
      }
    }, 550);
    inventorySaveTimers.current.set(timerKey, timer);
  }

  function finishInventorySession() {
    setInventoryFinishOpen(false);
    setInventorySession(null);
    setInventorySaveError("");
    if (activeColumn) loadColumn(activeColumn, null, { fresh: true });
  }

  async function loadProducts() {
    if (products.length) return products;
    setProductsLoading(true);
    try {
      const response = await fetch(`/next/api/stock/products?_ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return [];
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(body?.error || "Products could not be loaded.");
      const list = (Array.isArray(body?.products) ? body.products : [])
        .map((product) => ({
          id: text(product?.id),
          name: text(product?.name),
          displayId: text(product?.displayId || product?.idCode),
          url: text(product?.url),
          unitPrice: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null,
          tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
        }))
        .filter((product) => product.id && product.name)
        .sort((a, b) => a.name.localeCompare(b.name));
      setProducts(list);
      return list;
    } catch (productError) {
      throw new Error(productError?.message || "Products could not be loaded.");
    } finally {
      setProductsLoading(false);
    }
  }

  function matchedProductId(row, list = products) {
    const byCode = row?.idCode ? list.find((product) => lower(product.displayId) === lower(row.idCode)) : null;
    const byName = list.find((product) => lower(product.name) === lower(row?.name));
    return text(byCode?.id || byName?.id);
  }

  function openRowEditor(row, list = products) {
    if (!row?.id) return;
    setNewRowOpen(false);
    setEditRowId(row.id);
    setEditDraft({ productId: matchedProductId(row, list), quantity: String(row.quantity ?? 0) });
    setEditError("");
  }

  function openNewRowEditor() {
    setEditRowId("");
    setEditDraft({ productId: "", quantity: "" });
    setNewRowDraft({
      productId: "",
      quantity: "1",
      tag: "",
      receiptNumber: "",
    });
    setNewRowReceiptFiles([]);
    setNewRowOpen(true);
    setEditError("");
  }

  async function requestEditAccess(adminPassword = "", { fromModal = false, target = null } = {}) {
    if (!activeColumn?.key || editBusy) return;
    const requestedTarget = target || pendingEditTarget;
    if (!requestedTarget) return;
    if (target) setPendingEditTarget(target);
    setEditBusy(true);
    setEditError("");
    if (fromModal) setEditPasswordError("");
    try {
      const response = await fetch("/next/api/stock/mutations-direct", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit-access", column: activeColumn.key, adminPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && body?.requiresPassword) {
        if (fromModal) setEditPasswordError(body?.error || "Invalid Admin password.");
        else {
          setEditPasswordError("");
          setEditPasswordOpen(true);
        }
        return;
      }
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      if (!response.ok || body?.ok === false) throw new Error(body?.error || "You do not have permission to edit this Stocktaking folder.");
      const list = await loadProducts();
      setEditAdminPassword(adminPassword || editAdminPassword);
      setEditPasswordOpen(false);
      setEditPasswordError("");
      setPendingEditTarget(null);
      if (requestedTarget.type === "new") {
        // Re-authorizing an already-open editor must not erase unsaved inputs/uploads.
        if (!newRowOpen) openNewRowEditor();
      } else {
        const row = rows.find((item) => String(item.id) === String(requestedTarget.rowId));
        if (!row) throw new Error("This Stocktaking row is no longer available. Refresh and try again.");
        if (String(editRowId) !== String(row.id)) openRowEditor(row, list);
      }
    } catch (accessError) {
      const message = accessError?.message || "The Stocktaking row could not enter edit mode.";
      if (fromModal) setEditPasswordError(message);
      else setEditError(message);
    } finally {
      setEditBusy(false);
    }
  }

  function cancelRowEdit() {
    setEditRowId("");
    setEditDraft({ productId: "", quantity: "" });
    setEditError("");
  }

  async function saveEditedRow(row) {
    if (!activeColumn?.key || !row?.id || editBusy) return;
    const quantity = Number(editDraft.quantity);
    if (!String(editDraft.quantity).trim() || !Number.isSafeInteger(quantity) || quantity < 0) {
      setEditError(`Enter a valid non-negative quantity for ${row.name}.`);
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const response = await fetch("/next/api/stock/mutations-direct", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-rows",
          column: activeColumn.key,
          updates: [{ id: row.id, quantity, productId: text(editDraft.productId) || null }],
          adminPassword: editAdminPassword,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && body?.requiresPassword) {
        setPendingEditTarget({ type: "row", rowId: row.id });
        setEditPasswordOpen(true);
        setEditPasswordError(body?.error || "Admin password is required to save these changes.");
        return;
      }
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      if (!response.ok || body?.ok === false) throw new Error(body?.error || "Stocktaking changes could not be saved.");

      const selectedProduct = products.find((product) => text(product?.id) === text(editDraft.productId)) || null;
      setStock((current) => (Array.isArray(current) ? current : []).map((item) => {
        if (text(item?.id) !== text(row.id)) return item;
        return {
          ...item,
          quantity,
          ...(selectedProduct ? {
            name: selectedProduct.name,
            idCode: selectedProduct.displayId,
            url: selectedProduct.url,
            unitPrice: selectedProduct.unitPrice,
          } : {}),
        };
      }));
      cancelRowEdit();
    } catch (saveError) {
      setEditError(saveError?.message || "Stocktaking changes could not be saved.");
    } finally {
      setEditBusy(false);
    }
  }

  function cancelNewRow() {
    setNewRowOpen(false);
    setNewRowDraft({ productId: "", quantity: "", tag: "", receiptNumber: "" });
    setNewRowReceiptFiles([]);
    setEditError("");
  }

  function updateNewRowProduct(productId) {
    const selected = products.find((product) => product.id === productId) || null;
    const suggestedTag = text(selected?.tags?.[0]);
    const matchingSavedTag = availableTagNames.find((tag) => lower(tag) === lower(suggestedTag)) || "";
    setNewRowDraft((current) => ({ ...current, productId, tag: current.tag || matchingSavedTag }));
    setEditError("");
  }

  async function saveNewStockRow() {
    if (!activeColumn?.key || editBusy) return;
    const productId = text(newRowDraft.productId);
    const quantity = Number(newRowDraft.quantity);
    if (!productId) {
      setEditError("Choose a component for the new row.");
      return;
    }
    if (!String(newRowDraft.quantity).trim() || !Number.isSafeInteger(quantity) || quantity < 0) {
      setEditError("Enter a valid non-negative quantity for the new row.");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const { prepareReceiptImage } = await import("../../lib/receipt-image-client");
      const receiptPhotos = [];
      for (const file of newRowReceiptFiles) {
        const prepared = await prepareReceiptImage(file);
        const uploadResponse = await fetch("/next/api/stock/receipt-upload", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl: prepared.dataUrl, filename: prepared.name || file.name || "receipt.jpg" }),
        });
        const uploadBody = await uploadResponse.json().catch(() => ({}));
        if (uploadResponse.status === 401) {
          window.location.href = "/login?next=/next/stocktaking";
          return;
        }
        if (!uploadResponse.ok || uploadBody?.ok === false || !text(uploadBody?.url)) throw new Error(uploadBody?.error || `Failed to upload ${file.name || "receipt image"}.`);
        receiptPhotos.push({ name: text(uploadBody?.name) || prepared.name || file.name || "Receipt photo", url: text(uploadBody.url) });
      }

      const response = await fetch("/next/api/stock/mutations-direct", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-row",
          column: activeColumn.key,
          productId,
          quantity,
          tag: text(newRowDraft.tag),
          receiptNumber: text(newRowDraft.receiptNumber),
          receiptPhotos,
          adminPassword: editAdminPassword,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && body?.requiresPassword) {
        setPendingEditTarget({ type: "new" });
        setEditPasswordOpen(true);
        setEditPasswordError(body?.error || "Admin password is required to add this row.");
        return;
      }
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      if (!response.ok || body?.ok === false) throw new Error(body?.error || "The new Stocktaking row could not be saved.");
      cancelNewRow();
      await loadColumn(activeColumn, inventorySession, { fresh: true });
    } catch (saveError) {
      setEditError(saveError?.message || "The new Stocktaking row could not be saved.");
    } finally {
      setEditBusy(false);
    }
  }

  function openFolder(column, options = {}) {
    setActiveColumn(column);
    setSearch("");
    setExportOpen(false);
    setSortMode("kit");
    setSortMenuOpen(false);
    setGroupOptionsOpen(false);
    setGroupExpandedOverrides({});
    setOpenRowActions("");
    setEditRowId("");
    setEditDraft({ productId: "", quantity: "" });
    setNewRowOpen(false);
    setNewRowDraft({ productId: "", quantity: "", tag: "", receiptNumber: "" });
    setNewRowReceiptFiles([]);
    setPendingEditTarget(null);
    setEditError("");
    setEditAdminPassword("");
    setEditPasswordOpen(false);
    setEditPasswordError("");
    setInventorySession(null);
    setInventorySetupOpen(false);
    setInventoryFinishOpen(false);
    setInventorySaveError("");
    if (typeof window !== "undefined") {
      const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
      if (input) input.value = "";
      if (options.updateHistory !== false) {
        const url = new URL(window.location.href);
        url.searchParams.set("column", column.key);
        window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
      }
    }
    loadColumn(column, null);
  }

  function closeFolder() {
    setActiveColumn(null);
    setStock([]);
    setSearch("");
    setError("");
    setExportOpen(false);
    setSortMode("kit");
    setSortMenuOpen(false);
    setGroupOptionsOpen(false);
    setGroupExpandedOverrides({});
    setOpenRowActions("");
    setEditRowId("");
    setEditDraft({ productId: "", quantity: "" });
    setNewRowOpen(false);
    setNewRowDraft({ productId: "", quantity: "", tag: "", receiptNumber: "" });
    setNewRowReceiptFiles([]);
    setPendingEditTarget(null);
    setEditError("");
    setEditAdminPassword("");
    setEditPasswordOpen(false);
    setEditPasswordError("");
    setInventorySession(null);
    setInventorySetupOpen(false);
    setInventoryFinishOpen(false);
    setInventorySaveError("");
    if (typeof window !== "undefined") {
      const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
      if (input) input.value = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("column");
      const query = url.searchParams.toString();
      window.history.pushState({}, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePopState = () => {
      const key = text(new URLSearchParams(window.location.search).get("column"));
      if (!key) {
        setActiveColumn(null);
        setStock([]);
        setSearch("");
        setError("");
        setSortMode("kit");
        setSortMenuOpen(false);
        setEditRowId("");
        setEditDraft({ productId: "", quantity: "" });
        setNewRowOpen(false);
        setNewRowDraft({ productId: "", quantity: "", tag: "", receiptNumber: "" });
        setNewRowReceiptFiles([]);
        setPendingEditTarget(null);
        setEditError("");
        setEditAdminPassword("");
        setEditPasswordOpen(false);
        setEditPasswordError("");
        setInventorySession(null);
        setInventorySetupOpen(false);
        setInventoryFinishOpen(false);
        return;
      }
      const match = columns.find((item) => item.key === key);
      if (match && match.key !== activeColumn?.key) openFolder(match, { updateHistory: false });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [columns, activeColumn?.key]);

  const visibleFolders = useMemo(() => {
    const query = lower(search);
    if (!query) return columns;
    return columns.filter((item) => lower(item.label).includes(query) || lower(item.key).includes(query));
  }, [columns, search]);

  const rows = useMemo(() => (Array.isArray(stock) ? stock : [])
    .map(normalizedRow)
    .filter((row) => row.quantity !== 0), [stock]);

  const availableTagNames = useMemo(() => {
    const seen = new Set();
    return rows.map((row) => text(row?.tag?.name)).filter((tag) => {
      const key = lower(tag);
      if (!key || key === "untagged" || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = lower(search);
    if (!query) return rows;
    return rows.filter((row) =>
      lower(row.name).includes(query) ||
      lower(row.tag?.name).includes(query) ||
      lower(row.componentTag).includes(query) ||
      lower(row.kitTag).includes(query) ||
      lower(row.orderNumber).includes(query) ||
      lower(row.receiptNumber).includes(query) ||
      row.receiptPhotos.some((photo) => lower(photo.name).includes(query))
    );
  }, [rows, search]);

  const tagToneMap = useMemo(() => {
    const names = [...new Set(rows.flatMap((row) => [
      text(row.tag?.name),
      text(row.componentTag),
      text(row.kitTag),
    ]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    const map = new Map();
    names.forEach((name, index) => map.set(lower(name), TAG_GROUP_TONE_ORDER[index % TAG_GROUP_TONE_ORDER.length]));
    return map;
  }, [rows]);

  const componentTagGroups = useMemo(() => groupRows(filteredRows, "component", "component"), [filteredRows]);
  const kitTagGroups = useMemo(() => groupRows(filteredRows, "component", "kit"), [filteredRows]);
  const receiptGroups = useMemo(() => groupRowsByReceipt(filteredRows), [filteredRows]);
  const orderGroups = useMemo(() => groupRowsByOrderNumber(filteredRows), [filteredRows]);
  const tableColumnCount = 4 + (canEditColumn ? 1 : 0) + (inventorySession?.inventoryColumn ? 1 : 0) + (inventorySession?.defectedColumn ? 1 : 0);
  const kitTagCount = kitTagGroups.length;
  const visibleQuantity = filteredRows.reduce((total, row) => total + row.quantity, 0);
  const receiptsCount = filteredRows.filter((row) => Boolean(row.receiptNumber) || row.receiptPhotos.length > 0).length;
  const isGroupExpanded = (key, defaultOpen) => {
    if (Object.prototype.hasOwnProperty.call(groupExpandedOverrides, key)) return groupExpandedOverrides[key];
    return search.trim() ? true : defaultOpen;
  };
  const toggleGroupExpanded = (key, currentlyOpen) => setGroupExpandedOverrides((current) => ({ ...current, [key]: !currentlyOpen }));

  const renderTagHeader = (group, keyPrefix = "tag", label = "KIT TAG", defaultOpen = false) => {
    const groupId = `${keyPrefix}-${group.key}`;
    const isExpanded = isGroupExpanded(groupId, defaultOpen);
    const groupQty = group.items.reduce((sum, row) => sum + row.quantity, 0);
    return (
      <tr className={`stocktaking-tag-group-row ${isExpanded ? "is-expanded" : "is-collapsed"}`} key={groupId}>
        <td colSpan={tableColumnCount}>
          <button type="button" className="stocktaking-tag-group-head" onClick={() => toggleGroupExpanded(groupId, isExpanded)} aria-expanded={isExpanded} aria-label={`${isExpanded ? "Collapse" : "Expand"} ${group.name}`}>
            <span className="stocktaking-tag-head-main"><span className="stocktaking-tag-chevron"><Icon name={isExpanded ? "chevron" : "chevronRight"} /></span><small>{label}</small><strong>{group.name || "Untagged"}</strong></span>
            <span className="stocktaking-tag-head-stats"><span><Icon name="box" />{group.items.length} item{group.items.length === 1 ? "" : "s"}</span><span className="stocktaking-tag-qty"><Icon name="layers" />Σ {groupQty.toLocaleString("en-US")}</span></span>
          </button>
        </td>
      </tr>
    );
  };
  const renderGroup = (group, prefix, label, defaultOpen) => {
    const groupId = `${prefix}-${group.key}`;
    return [
      renderTagHeader(group, prefix, label, defaultOpen),
      ...(isGroupExpanded(groupId, defaultOpen) ? group.items.map((row) => renderStockRow(row)) : []),
    ];
  };

  const renderStockRow = (row) => {
    const isEditing = String(editRowId) === String(row.id);
    return (
      <tr key={row.key} className={isEditing ? "is-editing" : ""}>
        <td className="stocktaking-data-component">
          <span className="stocktaking-component-identity"><span className="stocktaking-component-thumbnail"><Icon name="box" /></span><span className="stocktaking-component-name">{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer" className="component-link">{row.name}</a> : row.name}</span></span>
        </td>
        <td className="stocktaking-data-qty"><span className="stocktaking-qty-pill">{row.quantity.toLocaleString("en-US")}</span></td>
        <td className="stocktaking-data-receipt"><span>{row.receiptNumber || "—"}</span></td>
        <td className="stocktaking-data-photos">
          {row.receiptPhotos.length ? (
            <div className="stocktaking-receipt-photo-list">
              {row.receiptPhotos.slice(0, 3).map((photo, index) => (
                <a href={photo.url} target="_blank" rel="noopener noreferrer" key={`${photo.url}-${index}`} title={photo.name}>
                  <img src={photo.url} alt={photo.name || `Receipt ${index + 1}`} />
                </a>
              ))}
              {row.receiptPhotos.length > 3 ? <span>+{row.receiptPhotos.length - 3}</span> : null}
            </div>
          ) : <span className="stocktaking-no-photo">—</span>}
        </td>
        {inventorySession?.inventoryColumn ? (
          <td className={`stocktaking-data-inventory ${row.inventory !== null && Number(row.inventory) !== Number(row.quantity) ? "is-mismatch" : ""}`}>
            {canUpdateInventory ? <input type="number" min="0" step="1" inputMode="numeric" value={row.inventory ?? ""} onChange={(event) => saveInventoryCell(row, "inventory", event.target.value)} placeholder="—" disabled={isEditing} /> : <span>{row.inventory ?? "—"}</span>}
          </td>
        ) : null}
        {inventorySession?.defectedColumn ? (
          <td className="stocktaking-data-inventory">
            {canUpdateInventory ? <input type="number" min="0" step="1" inputMode="numeric" value={row.defected ?? ""} onChange={(event) => saveInventoryCell(row, "defected", event.target.value)} placeholder="—" disabled={isEditing} /> : <span>{row.defected ?? "—"}</span>}
          </td>
        ) : null}
        {canEditColumn ? <td className="stocktaking-row-edit-cell">
          {canEditRow ? (
            <div className="stocktaking-inline-actions">
              <button type="button" className="stocktaking-row-more" onClick={() => setOpenRowActions((current) => current === row.key ? "" : row.key)} disabled={editBusy || productsLoading || !row.id || Boolean(editRowId) || newRowOpen} aria-expanded={openRowActions === row.key} aria-label={`Actions for ${row.name}`} title="Row actions"><Icon name="more" /></button>
              {openRowActions === row.key ? <div className="stocktaking-row-actions-menu"><button type="button" onClick={() => { setOpenRowActions(""); requestEditAccess(editAdminPassword, { target: { type: "row", rowId: row.id } }); }}><Icon name="edit" /><span>Edit component</span></button></div> : null}
            </div>
          ) : null}
        </td> : null}
      </tr>
    );
  };


  return (
    <section className="next-stocktaking-classic-parity next-stocktaking-folders-page">
      {activeColumn ? <HeaderFolderBreadcrumb segments={[
        {label:"Stocktaking",icon:"archive",onClick:closeFolder},
        {label:activeColumn.label,icon:"folder-check"}
      ]}/> : null}
      {!activeColumn ? (
        <section className="card stocktaking-folders-card">
          <div className="stocktaking-folders-head">
            <div className="stocktaking-folders-title">
              <span className="stocktaking-folders-title-icon" aria-hidden="true"><Icon name="folder" /></span>
              <h2>Stock Folders</h2>
            </div>
            <span className="stocktaking-folders-count">{visibleFolders.length} folder{visibleFolders.length === 1 ? "" : "s"}</span>
          </div>

          <div className="stocktaking-folder-grid" aria-live="polite">
            {visibleFolders.length ? visibleFolders.map((column) => (
              <article className="products-proposal-folder stocktaking-proposal-folder" key={column.key}>
                <button className="products-proposal-folder__main stocktaking-proposal-folder__main" type="button" onClick={() => openFolder(column)} aria-label={`Open ${column.label}`}>
                  <span className="proposal-folder-figure stocktaking-proposal-folder-figure" aria-hidden="true">
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                    <span className="proposal-folder-figure__back" />
                    <span className="proposal-folder-figure__front"><small>S</small></span>
                  </span>
                  <span className="proposal-folder-copy stocktaking-proposal-folder-copy">
                    <strong>{column.label}</strong>
                    <em>Stocktaking</em>
                  </span>
                  <span className="proposal-folder-count stocktaking-proposal-folder-count">
                    <span aria-hidden="true">▱</span>
                    <span>{column.itemsCount === null ? "Stock items" : `${column.itemsCount} item${column.itemsCount === 1 ? "" : "s"}`}</span>
                  </span>
                </button>
              </article>
            )) : (
              <div className="empty-block empty-block--no-data stocktaking-folder-empty">
                <span className="stocktaking-folder-empty__icon" aria-hidden="true"><Icon name="folder" /></span>
                <strong>No stock folders available</strong>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="card stocktaking-folder-workspace stocktaking-industrial-workspace">
          <div className="stocktaking-folder-toolbar stocktaking-industrial-heading">
            <div className="stocktaking-folder-title">
              <span className="stocktaking-folder-title-icon"><Icon name="cubes" /></span>
              <div><span>STOCKTAKING</span><h2>{activeColumn.label}</h2></div>
            </div>
            <div className="stocktaking-folder-actions" ref={sortMenuRef}>
              <div className="stocktaking-sort-menu-wrap">
                <button className="btn stocktaking-sort-btn stocktaking-main-actions-btn" type="button" onClick={() => { setSortMenuOpen((open) => !open); setGroupOptionsOpen(false); setExportOpen(false); }} disabled={loading || Boolean(error)} aria-expanded={sortMenuOpen} aria-haspopup="menu">
                  <Icon name="layers" /><span>Actions</span><Icon name="chevron" />
                </button>
                {sortMenuOpen ? <div className="stocktaking-sort-menu stocktaking-main-actions-menu" role="menu">
                  {(inventorySession ? canUpdateInventory : canStartInventory) ? <button type="button" onClick={() => { setSortMenuOpen(false); inventorySession ? setInventoryFinishOpen(true) : setInventorySetupOpen(true); }} disabled={loading || Boolean(error) || Boolean(editRowId) || newRowOpen}><Icon name="clipboard" /><span><strong>{inventorySession ? "Finish Inventory" : "Make Inventory"}</strong></span></button> : null}
                  {can("export") ? <button type="button" onClick={() => { setSortMenuOpen(false); setExportOpen(true); }} disabled={loading || Boolean(error)}><Icon name="download" /><span><strong>Download</strong></span></button> : null}
                  <div className="stocktaking-group-control">
                    <button type="button" className="stocktaking-group-control__toggle" onClick={() => setGroupOptionsOpen((open) => !open)} aria-expanded={groupOptionsOpen} aria-controls="stocktaking-group-choices"><span className="stocktaking-group-control__icon"><Icon name="layers" /></span><span className="stocktaking-group-control__copy"><strong>Group components</strong><small>{sortMode === "kit" ? "Kit tag" : sortMode === "tag" ? "Component tag" : sortMode === "receipt" ? "Receipt number" : "Order number"}</small></span><span className={`stocktaking-group-control__chevron ${groupOptionsOpen ? "is-open" : ""}`}><Icon name="chevron" /></span></button>
                    {groupOptionsOpen ? <div id="stocktaking-group-choices" className="stocktaking-action-group-options" role="group" aria-label="Group components by">
                      {[
                        { value: "kit", title: "Kit tag", description: "Group by kit" },
                        { value: "tag", title: "Component tag", description: "Group by component category" },
                        { value: "receipt", title: "Receipt number", description: "Group by receipt" },
                        { value: "order", title: "Order number", description: "Group by source order" },
                      ].map((option) => <button key={option.value} type="button" className={sortMode === option.value ? "is-active" : ""} onClick={() => { setSortMode(option.value); setSortMenuOpen(false); setGroupOptionsOpen(false); setGroupExpandedOverrides({}); }} role="menuitemradio" aria-checked={sortMode === option.value}><span className="stocktaking-group-radio" /><span className="stocktaking-group-option-copy"><strong>{option.title}</strong><small>{option.description}</small></span>{sortMode === option.value ? <Icon name="check" /> : null}</button>)}
                    </div> : null}
                  </div>
                </div> : null}
              </div>
            </div>
          </div>
          <div className="stocktaking-industrial-stats" aria-label="Stocktaking summary">
            <div><Icon name="box" /><strong>{kitTagCount.toLocaleString("en-US")}</strong><span>Kit tags</span></div>
            <div><Icon name="layers" /><strong>{filteredRows.length.toLocaleString("en-US")}</strong><span>Components</span></div>
            <div><Icon name="cubes" /><strong>{visibleQuantity.toLocaleString("en-US")}</strong><span>Total qty</span></div>
            <div><Icon name="file" /><strong>{receiptsCount.toLocaleString("en-US")}</strong><span>With receipts</span></div>
          </div>

          {loading ? (
            <div className="stocktaking-folder-state"><span className="stocktaking-folder-spinner" />Loading stocktaking...</div>
          ) : error ? (
            <div className="stocktaking-folder-state is-error"><span>{error}</span><button type="button" onClick={() => loadColumn(activeColumn)}>Try again</button></div>
          ) : (
            <>
              {inventorySaveError ? <div className="stocktaking-inventory-inline-error">{inventorySaveError}</div> : null}
              {editError && !editRowId && !newRowOpen ? <div className="stocktaking-edit-inline-error" role="alert">{editError}</div> : null}
              <div ref={tableScrollRef} className="stocktaking-data-table-wrap" aria-live="polite" onScroll={updateTableScrollState}>
                <table className="stocktaking-data-table">
                  <thead>
                    <tr>
                      <th><span className="stocktaking-th-label"><Icon name="box" />Component</span></th>
                      <th className="stocktaking-data-qty"><span className="stocktaking-th-label"><Icon name="layers" />Qty</span></th>
                      <th className="stocktaking-data-receipt"><span className="stocktaking-th-label"><Icon name="file" />Receipt no.</span></th>
                      <th className="stocktaking-data-photos"><span className="stocktaking-th-label"><Icon name="images" />Receipt photos</span></th>
                      {inventorySession?.inventoryColumn ? <th className="stocktaking-data-inventory">Inventory{inventorySession.date ? ` (${inventorySession.date})` : ""}</th> : null}
                      {inventorySession?.defectedColumn ? <th className="stocktaking-data-inventory">Defecated{inventorySession.date ? ` (${inventorySession.date})` : ""}</th> : null}
                      {canEditColumn ? <th className="stocktaking-row-edit-head"><span className="stocktaking-visually-hidden">Actions</span></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {sortMode === "receipt" ? (
                      receiptGroups.flatMap((receiptGroup) => [
                        <tr className="stocktaking-receipt-group-row" key={`receipt-${receiptGroup.key}`}>
                          <td colSpan={tableColumnCount}>
                            <div className="stocktaking-receipt-group-head">
                              <span><small>RECEIPT NO.</small><strong>{receiptGroup.label}</strong></span>
                              <em>{receiptGroup.items.length} item{receiptGroup.items.length === 1 ? "" : "s"}</em>
                            </div>
                          </td>
                        </tr>,
                        ...receiptGroup.tagGroups.flatMap((group) => [
                          ...renderGroup(group, `receipt-${receiptGroup.key}`, "COMPONENT TAG", true),
                        ]),
                      ])
                    ) : sortMode === "order" ? (
                      orderGroups.flatMap((orderGroup) => [
                        <tr className="stocktaking-receipt-group-row" key={`order-${orderGroup.key}`}>
                          <td colSpan={tableColumnCount}>
                            <div className="stocktaking-receipt-group-head">
                              <span><small>ORDER NO.</small><strong>{orderGroup.label}</strong></span>
                              <em>{orderGroup.items.length} item{orderGroup.items.length === 1 ? "" : "s"}</em>
                            </div>
                          </td>
                        </tr>,
                        ...orderGroup.kitGroups.flatMap((group) => [
                          ...renderGroup(group, `order-${orderGroup.key}`, "KIT TAG", true),
                        ]),
                      ])
                    ) : sortMode === "kit" ? (
                      kitTagGroups.flatMap((group, index) => renderGroup(group, "kit", "KIT TAG", index === 0))
                    ) : (
                      componentTagGroups.flatMap((group, index) => renderGroup(group, "component", "COMPONENT TAG", index === 0))
                    )}
                  </tbody>
                  <tfoot>
                    {canAddRow ? (
                      <tr className="stocktaking-new-row-button-row">
                        <td colSpan={tableColumnCount}>
                          <button type="button" className="stocktaking-new-row-btn" onClick={() => requestEditAccess(editAdminPassword, { target: { type: "new" } })} disabled={editBusy || productsLoading || Boolean(editRowId)}>
                            <Icon name="plus" /><span>{productsLoading ? "Loading components..." : "New Row"}</span>
                          </button>
                        </td>
                      </tr>
                    ) : null}
                  </tfoot>
                </table>
                {!filteredRows.length && !newRowOpen ? <div className="empty-block empty-block--no-data stocktaking-empty-under-table">Sorry, No data available</div> : null}
              </div>
              <div className="stocktaking-industrial-footer">
                <span>Showing {filteredRows.length.toLocaleString("en-US")} components</span>
                <strong><Icon name="box" />Total Qty:<b>{visibleQuantity.toLocaleString("en-US")}</b></strong>
              </div>
            </>
          )}
        </section>
      )}

      {(newRowOpen || editRowId) && activeColumn && typeof document !== "undefined" ? createPortal(
        <div className="stocktaking-editor-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !editBusy) { if (newRowOpen) cancelNewRow(); else cancelRowEdit(); } }}>
          <section className="stocktaking-editor-panel" role="dialog" aria-modal="true" aria-label={newRowOpen ? "Add stocktaking component" : "Edit stocktaking component"}>
            <header className="stocktaking-editor-header">
              <span className="stocktaking-editor-header__icon"><Icon name={newRowOpen ? "plus" : "edit"} /></span>
              <div><small>{newRowOpen ? "NEW STOCK RECORD" : "UPDATE STOCK RECORD"}</small><h3>{newRowOpen ? "Add component" : "Edit component"}</h3></div>
              <button type="button" className="stocktaking-editor-close" onClick={newRowOpen ? cancelNewRow : cancelRowEdit} disabled={editBusy} aria-label="Close editor"><Icon name="x" /></button>
            </header>
            <form className="stocktaking-editor-form" onSubmit={(event) => { event.preventDefault(); if (newRowOpen) saveNewStockRow(); else { const row = rows.find((item) => String(item.id) === String(editRowId)); if (row) saveEditedRow(row); } }}>
              <div className="stocktaking-editor-fields">
                <div className="stocktaking-editor-field stocktaking-editor-field--wide"><label>Component <span>*</span></label>
                  <StockProductPicker
                    value={newRowOpen ? newRowDraft.productId : editDraft.productId}
                    products={products}
                    currentLabel={newRowOpen ? "" : (rows.find((item) => String(item.id) === String(editRowId))?.name || "")}
                    onChange={newRowOpen ? updateNewRowProduct : (productId) => { setEditDraft((current) => ({ ...current, productId })); setEditError(""); }}
                    disabled={editBusy || productsLoading}
                    placeholder="Choose a component"
                  />
                </div>
                <div className="stocktaking-editor-field"><label htmlFor="stocktaking-form-quantity">Quantity <span>*</span></label>
                  <input id="stocktaking-form-quantity" type="number" min="0" step="1" inputMode="numeric" required value={newRowOpen ? newRowDraft.quantity : editDraft.quantity} onChange={(event) => { const quantity = event.target.value; if (newRowOpen) setNewRowDraft((current) => ({ ...current, quantity })); else setEditDraft((current) => ({ ...current, quantity })); setEditError(""); }} disabled={editBusy} />
                </div>
                {newRowOpen ? <>
                  <div className="stocktaking-editor-field"><label>Group tag</label><StockTagPicker value={newRowDraft.tag} tags={availableTagNames} disabled={editBusy} onChange={(tag) => { setNewRowDraft((current) => ({ ...current, tag })); setEditError(""); }} /></div>
                  <div className="stocktaking-editor-field"><label htmlFor="stocktaking-form-receipt">Receipt number</label><input id="stocktaking-form-receipt" type="text" value={newRowDraft.receiptNumber} onChange={(event) => setNewRowDraft((current) => ({ ...current, receiptNumber: event.target.value }))} placeholder="Enter receipt number" disabled={editBusy} /></div>
                  {canUploadReceipt ? <div className="stocktaking-editor-field stocktaking-editor-field--wide"><label>Receipt photos</label><StockReceiptUploadPicker files={newRowReceiptFiles} disabled={editBusy} onChange={setNewRowReceiptFiles} onError={setEditError} /></div> : null}
                </> : null}
              </div>
              {editError ? <div className="stocktaking-editor-error" role="alert">{editError}</div> : null}
              <footer className="stocktaking-editor-footer">
                <button type="button" className="stocktaking-editor-cancel" disabled={editBusy} onClick={newRowOpen ? cancelNewRow : cancelRowEdit}>Cancel</button>
                <button type="submit" className="stocktaking-editor-save" disabled={editBusy || productsLoading}><Icon name="save" />{editBusy ? "Saving..." : newRowOpen ? "Add component" : "Save changes"}</button>
              </footer>
            </form>
          </section>
        </div>, document.body
      ) : null}
      {(editPasswordOpen || exportOpen || inventorySetupOpen || inventoryFinishOpen) && activeColumn ? (
        <StocktakingDialogs
          editPasswordOpen={editPasswordOpen}
          exportOpen={exportOpen}
          inventorySetupOpen={inventorySetupOpen}
          inventoryFinishOpen={inventoryFinishOpen}
          activeColumn={activeColumn}
          inventorySession={inventorySession}
          editBusy={editBusy}
          editPasswordError={editPasswordError}
          inventoryBusy={inventoryBusy}
          onCloseEditPassword={() => { if (!editBusy) { setEditPasswordOpen(false); setEditPasswordError(""); } }}
          onSubmitEditPassword={(password) => requestEditAccess(password, { fromModal: true })}
          onCloseExport={() => setExportOpen(false)}
          onCloseInventorySetup={() => setInventorySetupOpen(false)}
          onConfirmInventorySetup={startInventory}
          onCloseInventoryFinish={() => setInventoryFinishOpen(false)}
          onFinishInventory={finishInventorySession}
        />
      ) : null}
    </section>
  );
}

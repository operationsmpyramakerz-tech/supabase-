"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OrderDownloadModal from "../orders/OrderDownloadModal";

const EXPORT_COLUMNS = [
  { value: "stock", label: "Stock", checked: true },
  { value: "receiptNumber", label: "Receipt number", checked: false },
  { value: "unityPrice", label: "Unity price", checked: true },
  { value: "totalPrice", label: "Total price", checked: true },
  { value: "inventory", label: "Inventory", checked: false },
  { value: "defected", label: "Defected", checked: false },
];

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

const RECEIPT_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const RECEIPT_UPLOAD_TARGET_BYTES = Math.floor(1.5 * 1024 * 1024);
const RECEIPT_MAX_EDGE = 2000;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file?.name || "receipt image"}.`));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function prepareStockReceiptImage(file) {
  if (!file || !/^image\//i.test(text(file.type))) throw new Error("Receipt uploads must be images.");
  if (number(file.size) > RECEIPT_SOURCE_MAX_BYTES) throw new Error(`${file.name || "Receipt image"} is larger than 8 MB.`);
  if (number(file.size) <= RECEIPT_UPLOAD_TARGET_BYTES) {
    return { dataUrl: await readFileAsDataUrl(file), name: file.name || "receipt.jpg", size: number(file.size) };
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error(`${file.name || "Receipt image"} could not be opened for optimization.`));
      candidate.src = objectUrl;
    });
    const naturalWidth = Math.max(1, number(image.naturalWidth || image.width) || 1);
    const naturalHeight = Math.max(1, number(image.naturalHeight || image.height) || 1);
    const longest = Math.max(naturalWidth, naturalHeight);
    let dimensionScale = Math.min(1, RECEIPT_MAX_EDGE / longest);
    let bestBlob = null;
    let bestType = "image/webp";
    for (let sizeAttempt = 0; sizeAttempt < 5; sizeAttempt += 1) {
      const width = Math.max(1, Math.round(naturalWidth * dimensionScale));
      const height = Math.max(1, Math.round(naturalHeight * dimensionScale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Receipt image optimization is not available in this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      let quality = 0.88;
      let blob = await canvasToBlob(canvas, "image/webp", quality);
      let mime = "image/webp";
      if (!blob) {
        quality = 0.86;
        blob = await canvasToBlob(canvas, "image/jpeg", quality);
        mime = "image/jpeg";
      }
      if (!blob) throw new Error(`${file.name || "Receipt image"} could not be optimized.`);
      while (blob.size > RECEIPT_UPLOAD_TARGET_BYTES && quality > 0.5) {
        quality = Math.max(0.5, quality - 0.08);
        blob = await canvasToBlob(canvas, mime, quality);
        if (!blob) break;
      }
      if (blob && (!bestBlob || blob.size < bestBlob.size)) { bestBlob = blob; bestType = mime; }
      if (blob && blob.size <= RECEIPT_UPLOAD_TARGET_BYTES) break;
      dimensionScale *= 0.82;
    }
    if (!bestBlob || bestBlob.size > RECEIPT_UPLOAD_TARGET_BYTES) throw new Error(`${file.name || "Receipt image"} is still too large after optimization. Choose a smaller image.`);
    const baseName = text(file.name).replace(/\.[^.]+$/, "") || "receipt";
    return { dataUrl: await readFileAsDataUrl(bestBlob), name: `${baseName}.${bestType === "image/webp" ? "webp" : "jpg"}`, size: bestBlob.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function responseFileName(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1] || match[2] || fallback);
  } catch {
    return match[1] || match[2] || fallback;
  }
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
  };
  return <svg {...common}>{paths[name] || paths.download}</svg>;
}

function StockProductPicker({ value = "", products = [], disabled = false, placeholder = "Select component", currentLabel = "", onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const rootRef = useRef(null);
  const selected = products.find((product) => String(product.id) === String(value)) || null;
  const label = selected?.name || currentLabel || placeholder;

  const visibleProducts = useMemo(() => {
    const needle = lower(query);
    if (!needle) return products;
    return products.filter((product) => lower(`${product.name} ${product.displayId || ""}`).includes(needle));
  }, [products, query]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30);
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
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
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
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
      {open ? (
        <div className="stocktaking-product-picker__menu">
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
        </div>
      ) : null}
    </div>
  );
}

function StockTagPicker({ value = "", tags = [], disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const rootRef = useRef(null);
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
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
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
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
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
      {open ? (
        <div className="stocktaking-tag-picker__menu">
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
        </div>
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

function ExportModal({ onClose, columnKey = "", inventorySession = null }) {
  const columnOptions = useMemo(() => EXPORT_COLUMNS.map((column) => [column.value, column.label]), []);
  const defaultColumns = useMemo(
    () => EXPORT_COLUMNS.filter((column) => column.checked).map((column) => column.value),
    [],
  );

  const runExport = async ({ kind, columns, signatureLabels, instruction }) => {
    const fileType = kind === "excel" ? "excel" : "pdf";
    const endpoint = fileType === "excel" ? "/api/stock/excel" : "/api/stock/pdf";
    const params = new URLSearchParams({ columns: (columns || []).join(",") });
    if (columnKey) params.set("column", columnKey);
    if (inventorySession?.inventoryColumn) params.set("inventoryColumn", inventorySession.inventoryColumn);
    if (inventorySession?.defectedColumn) params.set("defectedColumn", inventorySession.defectedColumn);

    const response = await fetch(`${endpoint}?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({
        signatureLabels: Array.isArray(signatureLabels) ? signatureLabels : null,
        instruction: instruction || null,
      }),
    });

    if (response.status === 401) {
      window.location.href = "/login?next=/next/stocktaking";
      return;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || "The stocktaking export failed.");
    }

    const fallback = fileType === "excel" ? "Stocktaking.xlsx" : "Stocktaking.pdf";
    downloadBlob(await response.blob(), responseFileName(response, fallback));
  };

  return (
    <OrderDownloadModal
      open
      title="Download stock file"
      subtitle="Choose the columns, signatures and optional instructions, then select the file type."
      columnOptions={columnOptions}
      defaultColumns={defaultColumns}
      defaultSignatureLabels={["Storekeeper", "Operations", "Delivered to"]}
      onClose={onClose}
      onDownload={runExport}
    />
  );
}

function InventorySetupModal({ column, busy, onClose, onConfirm }) {
  const [mode, setMode] = useState("both");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!date) return setError("Choose the inventory date.");
    setError("");
    try {
      await onConfirm({ mode, date });
    } catch (submitError) {
      setError(submitError?.message || "Inventory columns could not be prepared.");
    }
  };

  return (
    <div className="stocktaking-inventory-modal" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="stocktaking-inventory-modal__card" role="dialog" aria-modal="true" aria-label="Make inventory">
        <button type="button" className="stocktaking-inventory-modal__close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        <header>
          <span className="stocktaking-inventory-modal__icon"><Icon name="folder" /></span>
          <div><small>INVENTORY SETUP</small><h3>Make inventory</h3><p>{column?.label || "Stocktaking"}</p></div>
        </header>
        <form onSubmit={submit}>
          <label className="stocktaking-inventory-field">
            <span>Columns</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy}>
              <option value="both">Inventory &amp; Defecated</option>
              <option value="inventory">Inventory</option>
              <option value="defected">Defecated</option>
            </select>
          </label>
          <label className="stocktaking-inventory-field">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={busy} />
          </label>
          {error ? <div className="stocktaking-inventory-modal__error">{error}</div> : null}
          <footer>
            <button type="button" className="btn btn--light" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn stocktaking-inventory-confirm" disabled={busy}><span>{busy ? "Preparing…" : "Confirm"}</span></button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function InventoryFinishModal({ session, columnKey, busy, onClose, onDone }) {
  const hasInventory = !!session?.inventoryColumn;
  const hasDefected = !!session?.defectedColumn;
  const [fileType, setFileType] = useState("pdf");
  const [columnsMode, setColumnsMode] = useState(hasInventory && hasDefected ? "both" : (hasInventory ? "inventory" : "defected"));
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setError("");
    setFinishing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const selected = ["stock"];
      if ((columnsMode === "both" || columnsMode === "inventory") && hasInventory) selected.push("inventory");
      if ((columnsMode === "both" || columnsMode === "defected") && hasDefected) selected.push("defected");
      const params = new URLSearchParams({ column: columnKey, columns: selected.join(",") });
      if (session?.inventoryColumn) params.set("inventoryColumn", session.inventoryColumn);
      if (session?.defectedColumn) params.set("defectedColumn", session.defectedColumn);
      const endpoint = fileType === "excel" ? "/api/stock/excel" : "/api/stock/pdf";
      const response = await fetch(`${endpoint}?${params.toString()}`, { credentials: "include", cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Inventory export failed.");
      }
      const fallback = fileType === "excel" ? "Stocktaking-Inventory.xlsx" : "Stocktaking-Inventory.pdf";
      downloadBlob(await response.blob(), responseFileName(response, fallback));
      onDone();
    } catch (finishError) {
      setError(finishError?.message || "Inventory export failed.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="stocktaking-inventory-modal" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="stocktaking-inventory-modal__card" role="dialog" aria-modal="true" aria-label="Finish inventory">
        <button type="button" className="stocktaking-inventory-modal__close" onClick={onClose} disabled={busy || finishing} aria-label="Close">×</button>
        <header>
          <span className="stocktaking-inventory-modal__icon"><Icon name="download" /></span>
          <div><small>EXPORT &amp; CLOSE</small><h3>Finish inventory</h3><p>Download the inventory file, then hide the inventory columns.</p></div>
        </header>
        <div className="stocktaking-inventory-finish-fields">
          <label className="stocktaking-inventory-field">
            <span>File type</span>
            <select value={fileType} onChange={(event) => setFileType(event.target.value)}>
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
            </select>
          </label>
          {hasInventory && hasDefected ? (
            <label className="stocktaking-inventory-field">
              <span>Columns</span>
              <select value={columnsMode} onChange={(event) => setColumnsMode(event.target.value)}>
                <option value="both">Inventory &amp; Defecated</option>
                <option value="inventory">Inventory</option>
                <option value="defected">Defecated</option>
              </select>
            </label>
          ) : null}
        </div>
        {error ? <div className="stocktaking-inventory-modal__error">{error}</div> : null}
        <footer>
          <button type="button" className="btn btn--light" onClick={onClose} disabled={finishing}>Cancel</button>
          <button type="button" className="btn stocktaking-inventory-confirm" onClick={finish} disabled={finishing}><Icon name="download" /><span>{finishing ? "Preparing…" : "Download & finish"}</span></button>
        </footer>
      </section>
    </div>
  );
}

function StockEditPasswordModal({ column, busy, error, onClose, onSubmit }) {
  const [password, setPassword] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!text(password) || busy) return;
    onSubmit(text(password));
  };

  return (
    <div className="stocktaking-edit-password-modal" role="presentation">
      <button type="button" className="stocktaking-edit-password-modal__backdrop" onClick={busy ? undefined : onClose} aria-label="Close" />
      <form className="stocktaking-edit-password-modal__card" role="dialog" aria-modal="true" aria-labelledby="stockEditPasswordTitle" onSubmit={submit}>
        <button type="button" className="stocktaking-edit-password-modal__close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        <header>
          <span className="stocktaking-edit-password-modal__icon"><Icon name="edit" /></span>
          <div><small>ADMIN VERIFICATION</small><h3 id="stockEditPasswordTitle">Admin password required</h3><p>Enter the Admin password to edit “{column?.label || "this Stocktaking folder"}”.</p></div>
        </header>
        <label className="stocktaking-edit-password-field">
          <span>Admin password *</span>
          <input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <div className="stocktaking-edit-password-modal__error">{error}</div> : null}
        <footer>
          <button type="button" className="btn btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn stocktaking-edit-password-confirm" disabled={busy || !text(password)}><span>{busy ? "Checking…" : "Continue"}</span></button>
        </footer>
      </form>
    </div>
  );
}

export default function StocktakingClient({ initialStock = [], initialColumns = [] }) {
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
  const [sortMode, setSortMode] = useState("tag");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
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

  async function loadColumn(column, session = inventorySession) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ column: column.key, _fresh: "1" });
      if (session?.inventoryColumn) params.set("inventoryColumn", session.inventoryColumn);
      if (session?.defectedColumn) params.set("defectedColumn", session.defectedColumn);
      const response = await fetch(`/api/stock?${params.toString()}`, {
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
      const response = await fetch("/api/stock/inventory/start", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: activeColumn.key, mode, date }),
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
      await loadColumn(activeColumn, session);
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
        const response = await fetch(`/api/stock/${encodeURIComponent(row.id)}/inventory-value`, {
          method: "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ column, value, stockColumn: activeColumn?.key || "" }),
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
    if (activeColumn) loadColumn(activeColumn, null);
  }

  async function loadProducts() {
    if (products.length) return products;
    setProductsLoading(true);
    try {
      const response = await fetch(`/api/stock/products?_fresh=1&_ts=${Date.now()}`, { credentials: "include", cache: "no-store" });
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
      const response = await fetch("/api/stock/edit-access", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ column: activeColumn.key, adminPassword }),
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
        openNewRowEditor();
      } else {
        const row = rows.find((item) => String(item.id) === String(requestedTarget.rowId));
        if (!row) throw new Error("This Stocktaking row is no longer available. Refresh and try again.");
        openRowEditor(row, list);
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
    if (!Number.isFinite(quantity)) {
      setEditError(`Enter a valid quantity for ${row.name}.`);
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const response = await fetch("/api/stock", {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    if (!Number.isFinite(quantity)) {
      setEditError("Enter a valid quantity for the new row.");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const receiptPhotos = [];
      for (const file of newRowReceiptFiles) {
        const prepared = await prepareStockReceiptImage(file);
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

      const response = await fetch("/api/stock", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
      await loadColumn(activeColumn, inventorySession);
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
    setSortMode("tag");
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
    setSortMode("tag");
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
        setSortMode("tag");
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
  const tableColumnCount = 5 + (inventorySession?.inventoryColumn ? 1 : 0) + (inventorySession?.defectedColumn ? 1 : 0);

  const toneForTag = (name) => TAG_TONES[tagToneMap.get(lower(name)) || "default"] || TAG_TONES.default;

  const renderTagHeader = (group, keyPrefix = "tag", label = "TAG") => {
    const tone = toneForTag(group.name);
    return (
      <tr className="stocktaking-tag-group-row" key={`${keyPrefix}-${group.key}`}>
        <td colSpan={tableColumnCount}>
          <div className="stocktaking-tag-group-head" style={{ background: tone.background, color: tone.color, borderColor: tone.border }}>
            <span><small>{label}</small><strong>{group.name || "Untagged"}</strong></span>
            <em>{group.items.length} item{group.items.length === 1 ? "" : "s"}</em>
          </div>
        </td>
      </tr>
    );
  };

  const renderStockRow = (row) => {
    const isEditing = String(editRowId) === String(row.id);
    return (
      <tr key={row.key} className={isEditing ? "is-editing" : ""}>
        <td className="stocktaking-data-component">
          {isEditing ? (
            <StockProductPicker
              value={editDraft.productId}
              products={products}
              currentLabel={row.name}
              placeholder="Select component"
              onChange={(productId) => { setEditDraft((current) => ({ ...current, productId })); setEditError(""); }}
              disabled={editBusy || productsLoading}
            />
          ) : (
            row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer" className="component-link">{row.name}</a> : row.name
          )}
        </td>
        <td className="stocktaking-data-qty">
          {isEditing ? (
            <input
              className="stocktaking-edit-qty-input"
              type="number"
              step="1"
              inputMode="numeric"
              value={editDraft.quantity}
              onChange={(event) => { setEditDraft((current) => ({ ...current, quantity: event.target.value })); setEditError(""); }}
              disabled={editBusy}
              aria-label={`Quantity for ${row.name}`}
            />
          ) : row.quantity}
        </td>
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
            <input type="number" min="0" step="1" inputMode="numeric" value={row.inventory ?? ""} onChange={(event) => saveInventoryCell(row, "inventory", event.target.value)} placeholder="—" disabled={isEditing} />
          </td>
        ) : null}
        {inventorySession?.defectedColumn ? (
          <td className="stocktaking-data-inventory">
            <input type="number" min="0" step="1" inputMode="numeric" value={row.defected ?? ""} onChange={(event) => saveInventoryCell(row, "defected", event.target.value)} placeholder="—" disabled={isEditing} />
          </td>
        ) : null}
        <td className="stocktaking-row-edit-cell">
          {isEditing ? (
            <div className="stocktaking-row-edit-actions">
              <button
                type="button"
                className="is-save is-icon-only"
                onClick={() => saveEditedRow(row)}
                disabled={editBusy}
                aria-label={editBusy ? "Saving row" : "Save row"}
                title={editBusy ? "Saving..." : "Save"}
              >
                <Icon name="save" />
              </button>
              <button
                type="button"
                className="is-cancel is-icon-only"
                onClick={cancelRowEdit}
                disabled={editBusy}
                aria-label="Cancel row edit"
                title="Cancel"
              >
                <Icon name="x" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="is-edit is-icon-only"
              onClick={() => requestEditAccess(editAdminPassword, { target: { type: "row", rowId: row.id } })}
              disabled={editBusy || productsLoading || !row.id || Boolean(editRowId) || newRowOpen}
              aria-label={`Edit ${row.name}`}
              title="Edit"
            >
              <Icon name="edit" />
            </button>
          )}
        </td>
      </tr>
    );
  };


  return (
    <section className="next-stocktaking-classic-parity next-stocktaking-folders-page">
      {!activeColumn ? (
        <section className="card stocktaking-folders-card">
          <div className="stocktaking-folders-head">
            <div>
              <span className="stocktaking-folders-kicker">STOCKTAKING COLUMNS</span>
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
              <div className="empty-block empty-block--no-data stocktaking-folder-empty">Sorry, No stock folders available</div>
            )}
          </div>
        </section>
      ) : (
        <section className="card stocktaking-folder-workspace">
          <div className="stocktaking-folder-toolbar">
            <div className="stocktaking-folder-title">
              <button className="stocktaking-folder-back" type="button" onClick={closeFolder} aria-label="Back to stock folders"><Icon name="arrowLeft" /></button>
              <span className="stocktaking-folder-title-icon"><Icon name="folder" /></span>
              <div><span>STOCKTAKING</span><h2>{activeColumn.label}</h2></div>
            </div>
            <div className="stocktaking-folder-actions">
              <button className={`btn stocktaking-make-inventory-btn ${inventorySession ? "is-active" : ""}`} type="button" onClick={() => inventorySession ? setInventoryFinishOpen(true) : setInventorySetupOpen(true)} disabled={loading || Boolean(error) || Boolean(editRowId) || newRowOpen}>
                <span>{inventorySession ? "Finish inventory" : "Make inventory"}</span>
              </button>
              <button className="btn b2b-download-primary" type="button" onClick={() => { setExportOpen(true); setSortMenuOpen(false); }} disabled={loading || Boolean(error)}><Icon name="download" /><span>Download</span></button>
              <div className="stocktaking-sort-menu-wrap" ref={sortMenuRef}>
                <button className="btn stocktaking-sort-btn" type="button" onClick={() => { setSortMenuOpen((open) => !open); setExportOpen(false); }} disabled={loading || Boolean(error)} aria-expanded={sortMenuOpen}>
                  <Icon name="sort" /><span>Sort</span><Icon name="chevron" />
                </button>
                {sortMenuOpen ? (
                  <div className="stocktaking-sort-menu" role="menu">
                    <button type="button" className={sortMode === "tag" ? "is-active" : ""} onClick={() => { setSortMode("tag"); setSortMenuOpen(false); }}>
                      <span className="stocktaking-sort-menu__check">{sortMode === "tag" ? "✓" : ""}</span>
                      <span><strong>By components tag</strong><small>Component tag → components.</small></span>
                    </button>
                    <button type="button" className={sortMode === "kit" ? "is-active" : ""} onClick={() => { setSortMode("kit"); setSortMenuOpen(false); }}>
                      <span className="stocktaking-sort-menu__check">{sortMode === "kit" ? "✓" : ""}</span>
                      <span><strong>By kit tag</strong><small>Kit tag → components.</small></span>
                    </button>
                    <button type="button" className={sortMode === "receipt" ? "is-active" : ""} onClick={() => { setSortMode("receipt"); setSortMenuOpen(false); }}>
                      <span className="stocktaking-sort-menu__check">{sortMode === "receipt" ? "✓" : ""}</span>
                      <span><strong>By receipt number</strong><small>Receipt → component tag → components.</small></span>
                    </button>
                    <button type="button" className={sortMode === "order" ? "is-active" : ""} onClick={() => { setSortMode("order"); setSortMenuOpen(false); }}>
                      <span className="stocktaking-sort-menu__check">{sortMode === "order" ? "✓" : ""}</span>
                      <span><strong>By order number</strong><small>Order → kit tag → components.</small></span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="stocktaking-folder-state"><span className="stocktaking-folder-spinner" />Loading stocktaking...</div>
          ) : error ? (
            <div className="stocktaking-folder-state is-error"><span>{error}</span><button type="button" onClick={() => loadColumn(activeColumn)}>Try again</button></div>
          ) : (
            <>
              {inventorySaveError ? <div className="stocktaking-inventory-inline-error">{inventorySaveError}</div> : null}
              {editError ? <div className="stocktaking-edit-inline-error">{editError}</div> : null}
              <div ref={tableScrollRef} className="stocktaking-data-table-wrap" aria-live="polite" onScroll={updateTableScrollState}>
                <table className={`stocktaking-data-table ${editRowId || newRowOpen ? "is-edit-mode" : ""}`}>
                  <thead>
                    <tr>
                      <th>Components</th>
                      <th className="stocktaking-data-qty">Qty</th>
                      <th className="stocktaking-data-receipt">Receipt no.</th>
                      <th className="stocktaking-data-photos">Receipt photos</th>
                      {inventorySession?.inventoryColumn ? <th className="stocktaking-data-inventory">Inventory{inventorySession.date ? ` (${inventorySession.date})` : ""}</th> : null}
                      {inventorySession?.defectedColumn ? <th className="stocktaking-data-inventory">Defecated{inventorySession.date ? ` (${inventorySession.date})` : ""}</th> : null}
                      <th className="stocktaking-row-edit-head">Edit</th>
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
                          renderTagHeader(group, `receipt-${receiptGroup.key}`, "COMPONENT TAG"),
                          ...group.items.map((row) => renderStockRow(row)),
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
                          renderTagHeader(group, `order-${orderGroup.key}`, "KIT TAG"),
                          ...group.items.map((row) => renderStockRow(row)),
                        ]),
                      ])
                    ) : sortMode === "kit" ? (
                      kitTagGroups.flatMap((group) => [
                        renderTagHeader(group, "kit", "KIT TAG"),
                        ...group.items.map((row) => renderStockRow(row)),
                      ])
                    ) : (
                      componentTagGroups.flatMap((group) => [
                        renderTagHeader(group, "component", "COMPONENT TAG"),
                        ...group.items.map((row) => renderStockRow(row)),
                      ])
                    )}
                  </tbody>
                  <tfoot>
                    {newRowOpen ? (
                      <tr className="stocktaking-new-row-editor">
                        <td className="stocktaking-data-component">
                          <div className="stocktaking-new-row-component-stack">
                            <StockProductPicker
                              value={newRowDraft.productId}
                              products={products}
                              placeholder="Select component"
                              onChange={updateNewRowProduct}
                              disabled={editBusy || productsLoading}
                            />
                            <StockTagPicker value={newRowDraft.tag} tags={availableTagNames} disabled={editBusy} onChange={(tag) => { setNewRowDraft((current) => ({ ...current, tag })); setEditError(""); }} />
                          </div>
                        </td>
                        <td className="stocktaking-data-qty"><input className="stocktaking-edit-qty-input" type="number" step="1" inputMode="numeric" value={newRowDraft.quantity} onChange={(event) => setNewRowDraft((current) => ({ ...current, quantity: event.target.value }))} disabled={editBusy} /></td>
                        <td className="stocktaking-data-receipt"><input className="stocktaking-new-row-input" type="text" value={newRowDraft.receiptNumber} onChange={(event) => setNewRowDraft((current) => ({ ...current, receiptNumber: event.target.value }))} placeholder="Receipt no." /></td>
                        <td className="stocktaking-data-photos"><StockReceiptUploadPicker files={newRowReceiptFiles} disabled={editBusy} onChange={setNewRowReceiptFiles} onError={setEditError} /></td>
                        {inventorySession?.inventoryColumn ? <td className="stocktaking-data-inventory"><span className="stocktaking-no-photo">—</span></td> : null}
                        {inventorySession?.defectedColumn ? <td className="stocktaking-data-inventory"><span className="stocktaking-no-photo">—</span></td> : null}
                        <td className="stocktaking-row-edit-cell">
                          <div className="stocktaking-row-edit-actions">
                            <button type="button" className="is-save is-icon-only" onClick={saveNewStockRow} disabled={editBusy || productsLoading} aria-label={editBusy ? "Saving new row" : "Save new row"} title={editBusy ? "Saving..." : "Save"}><Icon name="save" /></button>
                            <button type="button" className="is-cancel is-icon-only" onClick={cancelNewRow} disabled={editBusy} aria-label="Cancel new row" title="Cancel"><Icon name="x" /></button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr className="stocktaking-new-row-button-row">
                        <td colSpan={tableColumnCount}>
                          <button type="button" className="stocktaking-new-row-btn" onClick={() => requestEditAccess(editAdminPassword, { target: { type: "new" } })} disabled={editBusy || productsLoading || Boolean(editRowId)}>
                            <Icon name="plus" /><span>{productsLoading ? "Loading components..." : "New Row"}</span>
                          </button>
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
                {!filteredRows.length && !newRowOpen ? <div className="empty-block empty-block--no-data stocktaking-empty-under-table">Sorry, No data available</div> : null}
              </div>
            </>
          )}
        </section>
      )}

      {editPasswordOpen && activeColumn ? <StockEditPasswordModal column={activeColumn} busy={editBusy} error={editPasswordError} onClose={() => { if (!editBusy) { setEditPasswordOpen(false); setEditPasswordError(""); } }} onSubmit={(password) => requestEditAccess(password, { fromModal: true })} /> : null}
      {exportOpen && activeColumn ? <ExportModal columnKey={activeColumn.key} inventorySession={inventorySession} onClose={() => setExportOpen(false)} /> : null}
      {inventorySetupOpen && activeColumn ? <InventorySetupModal column={activeColumn} busy={inventoryBusy} onClose={() => setInventorySetupOpen(false)} onConfirm={startInventory} /> : null}
      {inventoryFinishOpen && activeColumn && inventorySession ? <InventoryFinishModal session={inventorySession} columnKey={activeColumn.key} busy={inventoryBusy} onClose={() => setInventoryFinishOpen(false)} onDone={finishInventorySession} /> : null}
    </section>
  );
}

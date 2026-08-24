"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SaveProgressModal, { useSaveProgress } from "../SaveProgressModal";
import ActionLoadingModal, { useActionLoading } from "../ActionLoadingModal";
import { confirmDelete } from "../../lib/client-confirm";

const EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["name", "Component"],
  ["quantity", "Quantity"],
  ["unitPrice", "Unit Cost"],
  ["totalPrice", "Total Cost"],
];

const RECEIPT_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
const RECEIPT_UPLOAD_TARGET_BYTES = Math.floor(1.5 * 1024 * 1024);
const RECEIPT_MAX_EDGE = 2000;

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

function formatNumber(value) {
  return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 }).format(number(value));
}

function formatMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function openDownload(url) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

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

async function prepareReceiptImage(file) {
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
      if (blob && (!bestBlob || blob.size < bestBlob.size)) {
        bestBlob = blob;
        bestType = mime;
      }
      if (blob && blob.size <= RECEIPT_UPLOAD_TARGET_BYTES) break;
      dimensionScale *= 0.82;
    }

    if (!bestBlob || bestBlob.size > RECEIPT_UPLOAD_TARGET_BYTES) {
      throw new Error(`${file.name || "Receipt image"} is still too large after optimization. Choose a smaller image.`);
    }

    const baseName = text(file.name).replace(/\.[^.]+$/, "") || "receipt";
    return {
      dataUrl: await readFileAsDataUrl(bestBlob),
      name: `${baseName}.${bestType === "image/webp" ? "webp" : "jpg"}`,
      size: bestBlob.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeUsersCenterMembers(payload) {
  const direct = Array.isArray(payload?.members) ? payload.members : [];
  const departments = Array.isArray(payload?.departments) ? payload.departments : [];
  const nested = departments.flatMap((department) => Array.isArray(department?.members) ? department.members : []);
  const seen = new Set();
  return [...direct, ...nested]
    .map((member) => {
      const fields = Array.isArray(member?.fields) ? member.fields : [];
      const stockField = fields.find((field) => ["school", "stocktaking column", "done column"].includes(lower(field?.label)));
      return {
        ...member,
        id: text(member?.id),
        name: text(member?.name) || "Unnamed",
        stocktakingColumn: text(member?.stocktakingColumn || member?.school || stockField?.value),
      };
    })
    .filter((member) => {
      if (!member.id || !member.name || seen.has(member.id)) return false;
      seen.add(member.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const FEATHER_PATHS = {
  briefcase: [
    <rect key="r" x="3" y="7" width="18" height="13" rx="2" ry="2" />,
    <path key="p1" d="M8 21V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16" />,
    <path key="p2" d="M3 11h18" />,
  ],
  edit: [
    <path key="p1" d="M12 20h9" />,
    <path key="p2" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />,
  ],
  copy: [
    <rect key="r" x="9" y="9" width="13" height="13" rx="2" ry="2" />,
    <path key="p" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />,
  ],
  trash: [
    <polyline key="pl" points="3 6 5 6 21 6" />,
    <path key="p1" d="M19 6l-1 14H6L5 6" />,
    <path key="p2" d="M10 11v6M14 11v6M9 6V4h6v2" />,
  ],
  arrowLeft: [<line key="l" x1="19" y1="12" x2="5" y2="12" />, <polyline key="p" points="12 19 5 12 12 5" />],
  plusCircle: [<circle key="c" cx="12" cy="12" r="10" />, <path key="p" d="M12 8v8M8 12h8" />],
  plus: [<path key="p" d="M12 5v14M5 12h14" />],
  minus: [<path key="p" d="M5 12h14" />],
  chevronDown: [<polyline key="p" points="6 9 12 15 18 9" />],
  search: [<circle key="c" cx="11" cy="11" r="8" />, <line key="l" x1="21" y1="21" x2="16.65" y2="16.65" />],
  externalLink: [
    <path key="p1" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
    <polyline key="p2" points="15 3 21 3 21 9" />,
    <line key="l" x1="10" y1="14" x2="21" y2="3" />,
  ],
  save: [
    <path key="p1" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />,
    <polyline key="p2" points="17 21 17 13 7 13 7 21" />,
    <polyline key="p3" points="7 3 7 8 15 8" />,
  ],
  eye: [<path key="p" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />, <circle key="c" cx="12" cy="12" r="3" />],
  merge: [<circle key="c1" cx="18" cy="18" r="3" />, <circle key="c2" cx="6" cy="6" r="3" />, <path key="p" d="M6 21V9a9 9 0 0 0 9 9" />],
  move: [
    <polyline key="p1" points="5 9 2 12 5 15" />,
    <polyline key="p2" points="9 5 12 2 15 5" />,
    <polyline key="p3" points="15 19 12 22 9 19" />,
    <polyline key="p4" points="19 9 22 12 19 15" />,
    <line key="l1" x1="2" y1="12" x2="22" y2="12" />,
    <line key="l2" x1="12" y1="2" x2="12" y2="22" />,
  ],
  folder: [<path key="p" d="M3 5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />],
  folderPlus: [<path key="p1" d="M3 5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />, <path key="p2" d="M12 10v6M9 13h6" />],
  download: [<path key="p1" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <polyline key="p2" points="7 10 12 15 17 10" />, <line key="l" x1="12" y1="15" x2="12" y2="3" />],
  archive: [<polyline key="p1" points="21 8 21 21 3 21 3 8" />, <rect key="r" x="1" y="3" width="22" height="5" rx="1" />, <line key="l" x1="10" y1="12" x2="14" y2="12" />],
  file: [<path key="p1" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />, <polyline key="p2" points="14 2 14 8 20 8" />, <line key="l1" x1="8" y1="13" x2="16" y2="13" />, <line key="l2" x1="8" y1="17" x2="16" y2="17" />],
  grid: [<rect key="r1" x="3" y="3" width="7" height="7" rx="1" />, <rect key="r2" x="14" y="3" width="7" height="7" rx="1" />, <rect key="r3" x="3" y="14" width="7" height="7" rx="1" />, <rect key="r4" x="14" y="14" width="7" height="7" rx="1" />],
  sort: [<line key="l1" x1="3" y1="6" x2="21" y2="6" />, <line key="l2" x1="6" y1="12" x2="18" y2="12" />, <line key="l3" x1="10" y1="18" x2="14" y2="18" />],
};

function FeatherIcon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FEATHER_PATHS[name] || FEATHER_PATHS.briefcase}
    </svg>
  );
}

function firstTag(product) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  return tags.map(text).find(Boolean) || "Uncategorized";
}

function normalizeProduct(product, index = 0) {
  return {
    id: text(product?.id) || `product-${index}`,
    name: text(product?.name) || "Untitled product",
    displayId: text(product?.displayId || product?.idCode || product?.id_code),
    unitPrice: product?.unitPrice === null || typeof product?.unitPrice === "undefined" ? null : number(product.unitPrice),
    unit: text(product?.unit),
    url: normalizedUrl(product?.url),
    imageUrl: normalizedUrl(product?.imageUrl),
    tags: Array.isArray(product?.tags) ? product.tags.map(text).filter(Boolean) : [],
  };
}

function normalizeKit(kit, index = 0) {
  return {
    id: text(kit?.id) || `kit-${index}`,
    name: text(kit?.name) || "Untitled kit",
    createdBy: text(kit?.createdBy),
    createdById: text(kit?.createdById),
    createdAt: text(kit?.createdAt),
    updatedAt: text(kit?.updatedAt),
    folderId: text(kit?.folderId || kit?.folder_id),
    itemsCount: number(kit?.itemsCount),
    canEdit: kit?.canEdit === true,
  };
}

function normalizeFolder(folder, index = 0) {
  return {
    id: text(folder?.id) || `folder-${index}`,
    name: text(folder?.name) || "Untitled folder",
    createdBy: text(folder?.createdBy),
    createdById: text(folder?.createdById),
    createdAt: text(folder?.createdAt),
    updatedAt: text(folder?.updatedAt),
    canEdit: folder?.canEdit === true,
  };
}

function normalizeItem(item, index = 0) {
  return {
    id: text(item?.id) || `item-${index}`,
    kitId: text(item?.kitId),
    productId: text(item?.productId),
    productName: text(item?.productName) || "Untitled product",
    quantity: Math.max(1, Math.round(number(item?.quantity) || 1)),
    createdAt: text(item?.createdAt),
    updatedAt: text(item?.updatedAt),
  };
}

function apiErrorMessage(body, fallback) {
  return text(body?.error || body?.message) || fallback;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(apiErrorMessage(body, "The request failed."));
  return body;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-proposals-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "Kits"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, icon = "◆", children, onClose, wide = false, className = "" }) {
  return (
    <div className="products-modal-overlay next-proposals-classic-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`products-modal products-proposal-modal ${wide ? "next-proposals-classic-modal--wide" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="products-modal__close" onClick={onClose} aria-label="Close"><span aria-hidden="true">×</span></button>
        <div className="products-modal__header">
          <div className="products-modal__icon" aria-hidden="true">{icon}</div>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        <div className="next-proposals-modal__body">{children}</div>
      </section>
    </div>
  );
}


function ModernSelect({ label, value, options, placeholder = "Select", searchable = false, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const selected = options.find((option) => String(option.value) === String(value));
  const filtered = useMemo(() => {
    const needle = lower(query);
    if (!needle) return options;
    return options.filter((option) => lower(`${option.label || ""} ${option.meta || ""}`).includes(needle));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const choose = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={`next-proposals-modern-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`} ref={rootRef}>
      {label ? <span className="next-proposals-modern-select__label">{label}</span> : null}
      <button
        type="button"
        className="next-proposals-modern-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? "" : "is-placeholder"}>{selected?.label || placeholder}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open ? (
        <div className="next-proposals-modern-select__menu" role="listbox" aria-label={label || placeholder}>
          {searchable ? (
            <div className="next-proposals-modern-select__search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." />
            </div>
          ) : null}
          <div className="next-proposals-modern-select__options">
            {filtered.map((option) => {
              const active = String(option.value) === String(value);
              return (
                <button type="button" role="option" aria-selected={active} className={active ? "is-selected" : ""} key={`${label || "select"}-${option.value}`} onClick={() => choose(option.value)}>
                  <span><strong>{option.label}</strong>{option.meta ? <small>{option.meta}</small> : null}</span>
                  {active ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : null}
                </button>
              );
            })}
            {!filtered.length ? <div className="next-proposals-modern-select__empty">No matching options.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KitDownloadModal({ columns, onToggleColumn, onDownload, onClose }) {
  return (
    <Modal
      title="Download kit"
      subtitle="Choose the columns you need, then select the file type."
      icon={<FeatherIcon name="download" size={26} />}
      className="proposal-download-modal"
      onClose={onClose}
    >
      <div className="proposal-download-modal__body">
        <div className="proposal-download-modal__columns">
          <span>Columns</span>
          <div>
            {EXPORT_COLUMNS.map(([key, label]) => (
              <label key={key}>
                <input type="checkbox" checked={columns.includes(key)} onChange={() => onToggleColumn(key)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="proposal-download-modal__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--dark" onClick={() => onDownload("pdf")}>
            <FeatherIcon name="file" /><span>Download PDF</span>
          </button>
          <button type="button" className="products-btn products-btn--dark" onClick={() => onDownload("excel")}>
            <FeatherIcon name="grid" /><span>Download Excel</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReceiptImagePreviewGrid({ files, busy, onRemove }) {
  const [previews, setPreviews] = useState([]);
  useEffect(() => {
    const next = (Array.isArray(files) ? files : []).map((file, index) => ({ file, index, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((item) => URL.revokeObjectURL(item.url));
  }, [files]);

  if (!previews.length) return null;
  return (
    <div className="proposal-receipt-preview-grid" aria-label="Selected receipt images">
      {previews.map((item) => (
        <article className="proposal-receipt-preview-card" key={`${item.file.name}-${item.file.size}-${item.file.lastModified}-${item.index}`}>
          <div className="proposal-receipt-preview-card__image">
            <img src={item.url} alt={item.file.name || `Receipt image ${item.index + 1}`} />
            <span>{item.index + 1}</span>
          </div>
          <div className="proposal-receipt-preview-card__copy">
            <strong title={item.file.name}>{item.file.name || `Receipt ${item.index + 1}`}</strong>
            <small>{Math.max(1, Math.round(Number(item.file.size || 0) / 1024))} KB</small>
          </div>
          <button type="button" onClick={() => onRemove(item.index)} disabled={busy} aria-label={`Remove ${item.file.name || `receipt ${item.index + 1}`}`}>×</button>
        </article>
      ))}
    </div>
  );
}

function SendKitToStockModal({ kit, members, busy, onClose, onSubmit }) {
  const stockMembers = useMemo(() => (Array.isArray(members) ? members : []).filter((member) => text(member?.id) && text(member?.name)), [members]);
  const [memberId, setMemberId] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");

  const chooseFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const invalid = incoming.find((file) => !/^image\//i.test(file.type || ""));
    if (invalid) return setError("Receipt uploads must be images.");
    const tooLarge = incoming.find((file) => Number(file.size || 0) > RECEIPT_SOURCE_MAX_BYTES);
    if (tooLarge) return setError(`${tooLarge.name} is larger than 8 MB.`);
    setFiles((current) => {
      const combined = [...current, ...incoming];
      const seen = new Set();
      return combined.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 12);
    });
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!memberId) return setError("Choose the user who will receive the stock.");
    if (!text(receiptNumber)) return setError("Enter the receipt number.");
    if (!files.length) return setError("Upload at least one receipt image.");
    setError("");
    try {
      await onSubmit({ teamMemberId: memberId, receiptNumber: text(receiptNumber), files });
    } catch (submitError) {
      setError(submitError?.message || "The kit could not be sent to Stocktaking.");
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      title="Send to stock"
      subtitle={`Add “${kit?.name || "Kit"}” directly to a user's Stocktaking column.`}
      icon={<FeatherIcon name="archive" size={26} />}
      onClose={close}
    >
      <form className="proposal-send-stock-form proposal-send-stock-modal-form" onSubmit={submit}>
        <ModernSelect
          label="Stock user *"
          value={memberId}
          placeholder={stockMembers.length ? "Select stock user" : "No Users Center users available"}
          searchable
          options={stockMembers.map((member) => ({
            value: member.id,
            label: member.name,
            meta: text(member.stocktakingColumn)
              ? `Stock column: ${member.stocktakingColumn}`
              : `Will grant Stocktaking access and create ${member.name} Stock`,
          }))}
          onChange={(value) => { setMemberId(value); setError(""); }}
        />

        <label className="proposal-send-stock-text-field">
          <span>Receipt number *</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={receiptNumber}
            onChange={(event) => { setReceiptNumber(event.target.value); setError(""); }}
            placeholder="Enter receipt number"
            disabled={busy}
          />
        </label>

        <label className="proposal-receipt-upload-field">
          <span>Receipt images *</span>
          <div className={`proposal-receipt-upload-box ${files.length ? "has-files" : ""}`}>
            <FeatherIcon name="file" size={22} />
            <div><strong>{files.length ? `${files.length} receipt image${files.length === 1 ? "" : "s"} selected` : "Upload receipt images"}</strong><small>JPG, PNG or WEBP · up to 8 MB each · optimized before upload</small></div>
            <b>{busy ? "Uploading…" : "Choose images"}</b>
            <input type="file" accept="image/*" multiple disabled={busy} onChange={(event) => { chooseFiles(event.target.files); event.target.value = ""; }} />
          </div>
          <ReceiptImagePreviewGrid files={files} busy={busy} onRemove={(index) => setFiles((current) => current.filter((_, idx) => idx !== index))} />
        </label>

        <div className="proposal-send-stock-note proposal-send-stock-note--access">
          <FeatherIcon name="archive" size={17} />
          <span>If the selected user does not have Stocktaking access, Confirm will grant it automatically. Their existing Users Center Stocktaking column will be reused; if none exists, a <strong>Username + Stock</strong> column will be created.</span>
        </div>
        <div className="proposal-send-stock-note"><strong>Main stock</strong><span>Rows will be added to the selected user's Stocktaking column and Tag will use this kit name.</span></div>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="proposal-send-stock-actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy || !stockMembers.length}><FeatherIcon name="archive" /><span>{busy ? "Sending…" : "Confirm"}</span></button>
        </div>
      </form>
    </Modal>
  );
}

function NameModal({ dialog, busy, onClose, onSubmit }) {
  const [value, setValue] = useState(dialog?.value || "");
  const [error, setError] = useState("");
  const labels = {
    create: ["Create New Kit", "Create a reusable collection of products and quantities.", "Create Kit"],
    copy: ["Copy Kit", "Create an independent copy with all saved components.", "Create Copy"],
    rename: ["Rename Kit", "Change the folder name without changing its components.", "Save Name"],
  };
  const [title, subtitle, action] = labels[dialog?.mode] || labels.create;

  const submit = async (event) => {
    event.preventDefault();
    const name = text(value);
    if (!name) return setError("Kit name is required.");
    setError("");
    try {
      await onSubmit(name);
    } catch (submitError) {
      setError(submitError?.message || "The kit could not be saved.");
    }
  };

  return (
    <Modal title={title} subtitle={subtitle} icon="▣" onClose={onClose}>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Kit Name *</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Example: Arduino starter kit" /></label>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Saving…" : action}</button>
        </div>
      </form>
    </Modal>
  );
}

function FolderNameModal({ dialog, busy, onClose, onSubmit }) {
  const [value, setValue] = useState(dialog?.value || "");
  const [error, setError] = useState("");
  const creating = dialog?.mode !== "rename";
  const submit = async (event) => {
    event.preventDefault();
    const name = text(value);
    if (!name) return setError("Folder name is required.");
    setError("");
    try { await onSubmit(name); } catch (submitError) { setError(submitError?.message || "The folder could not be saved."); }
  };
  return (
    <Modal
      title={creating ? "Create Folder" : "Rename Folder"}
      subtitle={creating ? "Enter a name only. You can create kits after opening the folder." : "Change the folder name without changing the kits inside it."}
      icon={<FeatherIcon name="folder" size={20} />}
      onClose={onClose}
    >
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Folder Name *</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Example: TH1 Kits" /></label>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Saving…" : creating ? "Create Folder" : "Save Name"}</button>
        </div>
      </form>
    </Modal>
  );
}

function MoveKitModal({ dialog, folders, busy, onClose, onSubmit }) {
  const kit = dialog?.kit;
  const currentFolderId = text(kit?.folderId);
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId);
  const [error, setError] = useState("");

  const destinations = useMemo(() => [
    { id: "", name: "Main Kits", description: "No folder" },
    ...folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      description: `${formatNumber(folder.kitCount || 0)} kit${number(folder.kitCount) === 1 ? "" : "s"}`,
    })),
  ], [folders]);

  const submit = async (event) => {
    event.preventDefault();
    if (selectedFolderId === currentFolderId) return setError("Choose a different destination.");
    setError("");
    try {
      await onSubmit(selectedFolderId);
    } catch (submitError) {
      setError(submitError?.message || "The kit could not be moved.");
    }
  };

  return (
    <Modal
      title="Move Kit"
      subtitle={`Choose where “${kit?.name || "this kit"}” should be moved.`}
      icon={<FeatherIcon name="move" size={20} />}
      onClose={onClose}
    >
      <form className="next-kit-move-form" onSubmit={submit}>
        <div className="next-kit-move-list" role="radiogroup" aria-label="Move kit destination">
          {destinations.map((destination) => {
            const selected = selectedFolderId === destination.id;
            const current = currentFolderId === destination.id;
            return (
              <button
                type="button"
                key={destination.id || "root"}
                className={`${selected ? "is-selected" : ""} ${current ? "is-current" : ""}`}
                onClick={() => { setSelectedFolderId(destination.id); setError(""); }}
                disabled={busy}
                role="radio"
                aria-checked={selected}
              >
                <span className="next-kit-move-list__icon"><FeatherIcon name="folder" size={18} /></span>
                <span className="next-kit-move-list__copy">
                  <strong>{destination.name}</strong>
                  <small>{current ? "Current location" : destination.description}</small>
                </span>
                <span className="next-kit-move-list__check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="products-modal__actions next-kit-move-actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy || selectedFolderId === currentFolderId}>
            <FeatherIcon name="move" size={17} /><span>{busy ? "Moving…" : "Move Kit"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ request, busy, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!text(password)) return setError("Admin password is required.");
    setError("");
    try {
      await requestJson("/api/products/admin/verify", { method: "POST", body: JSON.stringify({ password }) });
      onVerified(text(password));
    } catch (verifyError) {
      setError(verifyError?.message || "Invalid Admin password.");
    }
  };

  return (
    <Modal title={request?.title || "Admin password required"} subtitle={request?.message || "Enter the Admin password to continue."} icon="⌾" onClose={onClose}>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Admin Password *</span><input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        </div>
      </form>
    </Modal>
  );
}

function CombineKitsModal({ kits, busy, onClose, onCreate }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const selectedKits = useMemo(() => selectedIds.map((id) => kits.find((kit) => kit.id === id)).filter(Boolean), [kits, selectedIds]);

  const toggleKit = (kit) => {
    setError("");
    if (selectedIds.includes(kit.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== kit.id));
      return;
    }
    if (selectedIds.length >= 2) return;
    const next = [...selectedIds, kit.id];
    setSelectedIds(next);
    if (next.length === 2 && !text(name)) {
      const names = next.map((id) => kits.find((entry) => entry.id === id)?.name).filter(Boolean);
      if (names.length === 2) setName(`${names[0]} + ${names[1]}`);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const cleanName = text(name);
    if (selectedIds.length !== 2) return setError("Select exactly two kits to combine.");
    if (!cleanName) return setError("Combined kit name is required.");
    if (!text(password)) return setError("Admin password is required.");
    setError("");
    try {
      await onCreate({ kitIds: selectedIds, name: cleanName, password: text(password) });
    } catch (submitError) {
      setError(submitError?.message || "The combined kit could not be created.");
    }
  };

  return (
    <Modal title="Combined Kits" subtitle="Select exactly two kits. Duplicate components will be merged and their quantities added together." icon={<FeatherIcon name="merge" size={20} />} onClose={onClose} wide>
      <form className="next-kit-combine-form" onSubmit={submit}>
        <div className="next-kit-combine-headline">
          <div><span>Selected kits</span><strong>{selectedIds.length} / 2</strong></div>
          <p>The source kits stay unchanged. A new independent kit will be created.</p>
        </div>

        <div className="next-kit-combine-list" role="group" aria-label="Choose two kits">
          {kits.map((kit) => {
            const selected = selectedIds.includes(kit.id);
            const disabled = !selected && selectedIds.length >= 2;
            return (
              <button type="button" key={kit.id} className={selected ? "is-selected" : ""} disabled={disabled || busy} onClick={() => toggleKit(kit)}>
                <span className="next-kit-combine-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                <span className="next-kit-combine-copy"><strong>{kit.name}</strong><small>{formatNumber(kit.itemsCount)} component{kit.itemsCount === 1 ? "" : "s"} · Created by {kit.createdBy || "—"}</small></span>
              </button>
            );
          })}
        </div>

        {selectedKits.length === 2 ? (
          <div className="next-kit-combine-preview">
            <FeatherIcon name="merge" size={18} />
            <div><strong>{selectedKits[0].name}</strong><span>+</span><strong>{selectedKits[1].name}</strong></div>
          </div>
        ) : null}

        <div className="products-form-grid next-kit-combine-fields">
          <label className="products-field products-field--wide"><span>Combined Kit Name <em>*</em></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: TH1 + TH2 Combined Kit" autoComplete="off" /></label>
          <label className="products-field products-field--wide"><span>Admin Password <em>*</em></span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        </div>

        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}

        <div className="products-modal__actions next-kit-combine-actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy || selectedIds.length !== 2}>
            <FeatherIcon name="merge" size={17} /><span>{busy ? "Combining…" : "Create Combined Kit"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddProductModal({ kit, products, busy, onClose, onSubmit }) {
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const filteredProducts = useMemo(() => {
    const needle = lower(search);
    return products.filter((product) => !needle || [product.name, product.displayId, product.unit, firstTag(product)].some((value) => lower(value).includes(needle))).slice(0, 100);
  }, [products, search]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return setError("Choose a product.");
    setError("");
    try {
      await onSubmit({ productId: selected, quantity: Math.max(1, Math.round(number(quantity) || 1)) });
    } catch (submitError) {
      setError(submitError?.message || "The product could not be added.");
    }
  };

  return (
    <Modal title={`Add Product to ${kit.name}`} subtitle="Choose a catalogue product and the quantity stored in this reusable kit." icon="＋" onClose={onClose} wide>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Search Catalogue</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name, ID code, tag or unit" /></label>
        <div className="next-proposals-product-picker">
          {filteredProducts.map((product) => (
            <button type="button" className={selected === product.id ? "active" : ""} onClick={() => setSelected(product.id)} key={product.id}>
              <span>{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : "▧"}</span>
              <div><strong>{product.name}</strong><small>{product.displayId || firstTag(product)} · {product.unit || "No unit"}</small></div>
              <b>{formatMoney(product.unitPrice)}</b>
            </button>
          ))}
          {!filteredProducts.length ? <div className="next-proposals-empty-inline">No matching catalogue products.</div> : null}
        </div>
        <div className="next-proposals-form-grid products-form-grid">
          <label><span>Quantity *</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label><span>Selected Product</span><input value={products.find((product) => product.id === selected)?.name || "No product selected"} readOnly /></label>
        </div>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Adding…" : "Add Product"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function KitsClient({ account, initialCatalog, initialKits, initialFolders, bootstrapWarnings = [] }) {
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [kits, setKits] = useState(() => (Array.isArray(initialKits?.kits) ? initialKits.kits : []).map(normalizeKit));
  const [folders, setFolders] = useState(() => (Array.isArray(initialFolders?.folders) ? initialFolders.folders : []).map(normalizeFolder));
  const [activeFolder, setActiveFolder] = useState(null);
  const [activeDetail, setActiveDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [exportColumns, setExportColumns] = useState(() => EXPORT_COLUMNS.map(([key]) => key));
  const [groupBy, setGroupBy] = useState("component-tag");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sendToStockOpen, setSendToStockOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { saveProgress, startSaveProgress, updateSaveProgress, finishSaveProgress } = useSaveProgress();
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();
  const [detailBusy, setDetailBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [moveDialog, setMoveDialog] = useState(null);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [folderMenu, setFolderMenu] = useState("");
  const [combineOpen, setCombineOpen] = useState(false);
  const [detailEdit, setDetailEdit] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [draftErrors, setDraftErrors] = useState({ name: "", items: "" });
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productQty, setProductQty] = useState(1);
  const passwordResolver = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = search;
    input.placeholder = activeDetail ? "Search components..." : activeFolder ? `Search kits in ${activeFolder.name}...` : "Search folders or kits...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.placeholder = "Search";
    };
  }, [activeDetail?.kit?.id, activeFolder?.id]);

  useEffect(() => {
    const open = Boolean(activeDetail || detailBusy);
    document.body.classList.toggle("proposal-detail-open", open);
    return () => document.body.classList.remove("proposal-detail-open");
  }, [activeDetail, detailBusy]);

  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".products-proposal-folder")) setFolderMenu("");
      if (pickerRef.current && !pickerRef.current.contains(event.target)) setProductPickerOpen(false);
      if (!event.target.closest(".proposal-download-menu-wrap") && !event.target.closest(".proposal-download-modal")) setDownloadMenuOpen(false);
      if (!event.target.closest(".proposal-sort-menu-wrap")) setSortMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setFolderMenu("");
      setProductPickerOpen(false);
      setDownloadMenuOpen(false);
      setSortMenuOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const folderKitCounts = useMemo(() => {
    const counts = new Map();
    kits.forEach((kit) => {
      if (kit.folderId) counts.set(kit.folderId, (counts.get(kit.folderId) || 0) + 1);
    });
    return counts;
  }, [kits]);

  const filteredKits = useMemo(() => {
    const needle = lower(search);
    const scoped = activeFolder
      ? kits.filter((kit) => kit.folderId === activeFolder.id)
      : kits.filter((kit) => !kit.folderId);
    return scoped.filter((kit) => !needle || [kit.name, kit.createdBy].some((value) => lower(value).includes(needle)));
  }, [kits, search, activeFolder]);

  const filteredFolders = useMemo(() => {
    if (activeFolder) return [];
    const needle = lower(search);
    return folders.filter((folder) => !needle || [folder.name, folder.createdBy].some((value) => lower(value).includes(needle)));
  }, [folders, search, activeFolder]);

  const filteredProducts = useMemo(() => {
    const needle = lower(productSearch);
    return products
      .filter((product) => !needle || [product.name, product.displayId, product.unit, firstTag(product)].some((value) => lower(value).includes(needle)))
      .slice(0, 120);
  }, [products, productSearch]);

  const enrichedRows = useMemo(() => {
    const items = Array.isArray(activeDetail?.items) ? activeDetail.items.map(normalizeItem) : [];
    return items.map((item) => {
      const product = productMap.get(item.productId) || null;
      const unitPrice = product?.unitPrice;
      return {
        ...item,
        product,
        displayId: product?.displayId || "",
        name: product?.name || item.productName,
        tag: product ? firstTag(product) : "Uncategorized",
        unit: product?.unit || "",
        unitPrice,
        totalPrice: Number.isFinite(Number(unitPrice)) ? Number(unitPrice) * item.quantity : null,
      };
    });
  }, [activeDetail, productMap]);

  const visibleEnrichedRows = useMemo(() => {
    const needle = lower(search);
    if (!activeDetail || !needle) return enrichedRows;
    return enrichedRows.filter((row) => lower(row.name).includes(needle));
  }, [activeDetail, enrichedRows, search]);

  const componentGroupedVisibleRows = useMemo(() => {
    const groups = new Map();
    for (const row of visibleEnrichedRows) {
      const label = text(row.tag) || "Uncategorized";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }
    return [...groups.entries()]
      .map(([label, rows]) => ({ label, rows: rows.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleEnrichedRows]);

  const kitGroupedVisibleRows = useMemo(() => {
    const kit = activeDetail?.kit;
    if (!kit) return [];
    const folder = folders.find((entry) => entry.id === kit.folderId);
    return [{
      id: folder?.id || "",
      label: folder?.name || "Unfiled Kits",
      kits: [{
        id: kit.id,
        label: kit.name || "Kit",
        rows: visibleEnrichedRows.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }],
    }];
  }, [activeDetail, folders, visibleEnrichedRows]);

  const detailTotals = useMemo(() => enrichedRows.reduce((acc, row) => {
    acc.items += 1;
    acc.quantity += row.quantity;
    if (Number.isFinite(Number(row.totalPrice))) acc.value += Number(row.totalPrice);
    return acc;
  }, { items: 0, quantity: 0, value: 0 }), [enrichedRows]);

  const selectedProduct = selectedProductId ? productMap.get(selectedProductId) : null;

  const notify = (message, type = "success", title = "Kits") => {
    setToast({ message, type, title });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4500);
  };

  const syncKit = (kit) => {
    const normalized = normalizeKit(kit);
    setKits((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      return exists ? current.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current];
    });
    setActiveDetail((current) => current?.kit?.id === normalized.id ? { ...current, kit: normalized } : current);
    return normalized;
  };

  const setDetailFromBody = (body) => {
    const kit = normalizeKit(body?.kit || {});
    const items = (Array.isArray(body?.items) ? body.items : []).map(normalizeItem);
    setActiveDetail({ kit, items });
    setEditName(kit.name || "");
    setKits((current) => current.map((entry) => entry.id === kit.id ? { ...kit, itemsCount: items.length } : entry));
    return { kit, items };
  };

  const resetDetailEditor = () => {
    setDetailEdit(false);
    setCreateMode(false);
    setEditAdminPassword("");
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setProductPickerOpen(false);
    setProductSearch("");
    setSelectedProductId("");
    setProductQty(1);
  };

  const backToKits = () => {
    setActiveDetail(null);
    setSearch("");
    setDownloadMenuOpen(false);
    setSortMenuOpen(false);
    setSendToStockOpen(false);
    resetDetailEditor();
  };

  const toggleExportColumn = (key) => {
    setExportColumns((current) => current.includes(key)
      ? (current.length === 1 ? current : current.filter((item) => item !== key))
      : [...current, key]);
  };

  const chooseGroupBy = (mode) => {
    setGroupBy(mode === "kit-tag" ? "kit-tag" : "component-tag");
    setSortMenuOpen(false);
  };

  const downloadKit = (type) => {
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    const columns = exportColumns.length ? exportColumns.join(",") : EXPORT_COLUMNS.map(([key]) => key).join(",");
    const params = new URLSearchParams({ columns, groupBy });
    openDownload(`/api/products/kits/${encodeURIComponent(kit.id)}/${type}?${params.toString()}`);
    setDownloadMenuOpen(false);
  };

  const openSendToStock = () => {
    setDownloadMenuOpen(false);
    setSortMenuOpen(false);
    setSendToStockOpen(true);
    requestJson(`/api/user-access/team-members?_fresh=1&_ts=${Date.now()}`)
      .then((body) => setMembers(normalizeUsersCenterMembers(body)))
      .catch((error) => notify(error?.message || "Users Center members could not be refreshed.", "error"));
  };

  const sendKitToStock = async ({ teamMemberId, receiptNumber, files = [] }) => {
    const kit = activeDetail?.kit;
    if (!kit?.id) throw new Error("Kit ID is missing.");
    setBusy(true);
    startActionLoading({ title: "Sending to stock", message: "Uploading receipt images and adding Stocktaking rows…" });
    try {
      const receipts = [];
      for (const file of files) {
        const prepared = await prepareReceiptImage(file);
        const uploaded = await requestJson("/next/api/products/proposals/receipt-upload", {
          method: "POST",
          body: JSON.stringify({ dataUrl: prepared.dataUrl, filename: prepared.name || file.name || "receipt.jpg" }),
        });
        if (uploaded?.url) receipts.push({ url: uploaded.url, name: uploaded.name || prepared.name || file.name || "Receipt" });
      }
      if (!receipts.length) throw new Error("No receipt images were uploaded.");

      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/send-to-stock`, {
        method: "POST",
        body: JSON.stringify({ teamMemberId, receiptNumber: text(receiptNumber), receipts }),
      });
      const count = Number(body?.count || 0);
      const memberName = text(body?.member?.name) || "the selected user";
      await finishActionLoading("done", `${count} Stocktaking row${count === 1 ? "" : "s"} added to ${memberName}.`);
      setSendToStockOpen(false);
      notify(`Kit sent to ${memberName} Stocktaking under Main stock.`);
      return body;
    } catch (error) {
      await finishActionLoading("failed", error?.message || "The kit could not be sent to Stocktaking.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const loadKit = async (kitId, options = {}) => {
    const edit = Boolean(options.edit);
    setSearch("");
    setFolderMenu("");
    setCreateMode(false);
    setDetailEdit(edit);
    if (Object.prototype.hasOwnProperty.call(options, "adminPassword")) setEditAdminPassword(options.adminPassword || "");
    setDetailBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
      setDetailFromBody(body);
      setDraftErrors({ name: "", items: "" });
    } catch (error) {
      notify(error?.message || "The kit could not be loaded.", "error");
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshKits = async () => {
    try {
      const [kitBody, productBody, folderBody] = await Promise.all([
        requestJson(`/next/api/products/kits?_ts=${Date.now()}`),
        requestJson(`/next/api/products?_ts=${Date.now()}`),
        requestJson(`/next/api/products/kit-folders?_ts=${Date.now()}`),
      ]);
      setKits((kitBody.kits || []).map(normalizeKit));
      setProducts((productBody.products || []).map(normalizeProduct));
      setFolders((folderBody.folders || []).map(normalizeFolder));
    } catch (error) {
      notify(error?.message || "The data could not be refreshed.", "error");
    }
  };

  const createCombinedKit = async ({ kitIds, name, password }) => {
    const ids = Array.isArray(kitIds) ? kitIds.map(text).filter(Boolean) : [];
    const cleanName = text(name);
    const adminPassword = text(password);
    if (ids.length !== 2 || new Set(ids).size !== 2) throw new Error("Select exactly two different kits.");
    if (!cleanName) throw new Error("Combined kit name is required.");
    if (!adminPassword) throw new Error("Admin password is required.");

    setBusy(true);
    let createdId = "";
    try {
      await requestJson("/api/products/admin/verify", {
        method: "POST",
        body: JSON.stringify({ password: adminPassword }),
      });

      const sourceBodies = await Promise.all(ids.map((id) => requestJson(`/next/api/products/kits/${encodeURIComponent(id)}?_ts=${Date.now()}`)));
      const productIdByName = new Map(products.map((product) => [lower(product.name), product.id]));
      const merged = new Map();

      sourceBodies.forEach((body) => {
        (Array.isArray(body?.items) ? body.items : []).map(normalizeItem).forEach((item) => {
          const productId = text(item.productId) || productIdByName.get(lower(item.productName)) || "";
          if (!productId) throw new Error(`Could not match “${item.productName || "a component"}” to the Products catalogue.`);
          const current = merged.get(productId) || { productId, quantity: 0 };
          current.quantity += Math.max(1, number(item.quantity) || 1);
          merged.set(productId, current);
        });
      });

      if (!merged.size) throw new Error("The selected kits do not contain any components to combine.");

      const createdBody = await requestJson("/next/api/products/kits", {
        method: "POST",
        body: JSON.stringify({ name: cleanName, adminPassword, folderId: activeFolder?.id || "" }),
      });
      createdId = text(createdBody?.kit?.id);
      if (!createdId) throw new Error("The combined kit was created but its ID was not returned.");

      for (const row of merged.values()) {
        await requestJson(`/next/api/products/kits/${encodeURIComponent(createdId)}/items`, {
          method: "POST",
          body: JSON.stringify({ productId: row.productId, quantity: row.quantity, adminPassword }),
        });
      }

      await refreshKits();
      setCombineOpen(false);
      notify(`Combined kit “${cleanName}” created successfully.`);
    } catch (error) {
      if (createdId) {
        try {
          await requestJson(`/next/api/products/kits/${encodeURIComponent(createdId)}`, {
            method: "DELETE",
            body: JSON.stringify({ adminPassword }),
          });
        } catch {}
      }
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const openFolder = (folder) => {
    setFolderMenu("");
    setSearch("");
    setActiveFolder(normalizeFolder(folder));
  };

  const backToFolderRoot = () => {
    setFolderMenu("");
    setSearch("");
    setActiveFolder(null);
  };

  const submitFolderDialog = async (name) => {
    const dialog = folderDialog;
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.mode === "rename" && dialog.folder?.id) {
        const body = await requestJson(`/next/api/products/kit-folders/${encodeURIComponent(dialog.folder.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ name, adminPassword: dialog.adminPassword || "" }),
        });
        const updated = normalizeFolder(body.folder || { ...dialog.folder, name });
        setFolders((current) => current.map((folder) => folder.id === updated.id ? updated : folder));
        setActiveFolder((current) => current?.id === updated.id ? updated : current);
        notify("Folder name updated.");
      } else {
        const body = await requestJson("/next/api/products/kit-folders", {
          method: "POST",
          body: JSON.stringify({ name }),
        });
        const created = normalizeFolder(body.folder || { name, canEdit: true });
        setFolders((current) => [created, ...current.filter((folder) => folder.id !== created.id)]);
        notify(`Folder “${created.name}” created.`);
      }
      setFolderDialog(null);
    } catch (error) {
      notify(error?.message || "The folder could not be saved.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const renameFolder = async (folder) => {
    let adminPassword = "";
    if (!folder?.canEdit) {
      adminPassword = await askPassword({ title: "Admin password required", message: `Enter the Admin password to rename “${folder.name}”.` });
      if (adminPassword === null) return;
    }
    setFolderDialog({ mode: "rename", folder, value: folder.name, adminPassword });
  };

  const deleteFolder = async (folder) => {
    let adminPassword = "";
    if (!folder?.canEdit) {
      adminPassword = await askPassword({ title: "Admin password required", message: `Enter the Admin password to delete “${folder.name}”.` });
      if (adminPassword === null) return;
    }
    const confirmed = await confirmDelete({
      itemName: folder.name,
      itemType: "folder",
      title: "Delete folder?",
      message: `Delete “${folder.name}”? Kits inside it will not be deleted; they will return to the main Kits page.`,
      confirmLabel: "Delete Folder",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/kit-folders/${encodeURIComponent(folder.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      setFolders((current) => current.filter((entry) => entry.id !== folder.id));
      setKits((current) => current.map((kit) => kit.folderId === folder.id ? { ...kit, folderId: "" } : kit));
      if (activeFolder?.id === folder.id) setActiveFolder(null);
      notify("Folder deleted. Its kits were moved back to the main Kits page.");
    } catch (error) {
      notify(error?.message || "The folder could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const askPassword = ({ title, message }) => new Promise((resolve) => {
    passwordResolver.current = resolve;
    setPasswordRequest({ title, message });
  });

  const closePassword = () => {
    const resolver = passwordResolver.current;
    passwordResolver.current = null;
    setPasswordRequest(null);
    resolver?.(null);
  };

  const verifyPassword = (password) => {
    const resolver = passwordResolver.current;
    passwordResolver.current = null;
    setPasswordRequest(null);
    resolver?.(password);
  };

  const protectedPassword = async (kit, message) => {
    if (kit?.canEdit) return "";
    return await askPassword({ title: "Admin password required", message: message || "This kit belongs to another user." });
  };

  const startCreateKit = async () => {
    const adminPassword = await askPassword({
      title: "Create New Kit",
      message: "Enter the Admin password to create a new kit.",
    });
    if (adminPassword === null) return;
    const createdBy = text(account?.name || account?.fullName || account?.username || account?.email);
    setCreateMode(true);
    setDetailEdit(true);
    setEditAdminPassword(adminPassword);
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setActiveDetail({
      kit: normalizeKit({ name: "", createdBy, canEdit: true, folderId: activeFolder?.id || "" }),
      items: [],
    });
    setSelectedProductId("");
    setProductSearch("");
    setProductQty(1);
  };

  const enterEditKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to edit “${kit.name}”.`);
    if (adminPassword === null) return;
    setEditAdminPassword(adminPassword);
    await loadKit(kit.id, { edit: true, adminPassword });
  };

  const startMoveKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to move “${kit.name}”.`);
    if (adminPassword === null) return;
    setMoveDialog({ kit, adminPassword });
  };

  const submitMoveKit = async (folderId) => {
    const dialog = moveDialog;
    const kit = dialog?.kit;
    if (!kit?.id) return;
    const targetFolderId = text(folderId);
    if (targetFolderId === text(kit.folderId)) return;
    setBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId: targetFolderId, adminPassword: dialog.adminPassword || "" }),
      });
      const updated = syncKit(body.kit || { ...kit, folderId: targetFolderId });
      setMoveDialog(null);
      const destination = targetFolderId ? folders.find((folder) => folder.id === targetFolderId)?.name || "the selected folder" : "Main Kits";
      notify(`“${updated.name}” moved to ${destination}.`);
    } catch (error) {
      notify(error?.message || "The kit could not be moved.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const submitNameDialog = async (name) => {
    const dialog = nameDialog;
    if (!dialog || dialog.mode !== "copy") return;
    setBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(dialog.kit.id)}/copy`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      syncKit(body.kit);
      setNameDialog(null);
      notify(`A copy named “${name}” was created.`);
    } catch (error) {
      notify(error?.message || "The kit copy could not be created.", "error");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const deleteKit = async (kit) => {
    const adminPassword = await protectedPassword(kit, `Enter the Admin password to delete “${kit.name}”.`);
    if (adminPassword === null) return;
    const confirmed = await confirmDelete({
      itemName: kit.name,
      itemType: "kit",
      title: "Delete kit?",
      message: `You’re going to permanently delete “${kit.name}” and all saved components. This action cannot be undone.`,
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      setKits((current) => current.filter((item) => item.id !== kit.id));
      if (activeDetail?.kit?.id === kit.id) backToKits();
      notify("Kit deleted.");
    } catch (error) {
      notify(error?.message || "The kit could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const addSelectedProduct = async () => {
    const product = productMap.get(selectedProductId);
    if (!product) {
      setDraftErrors((current) => ({ ...current, items: "Select a product first." }));
      return;
    }
    const quantity = Math.max(1, Math.round(number(productQty) || 1));
    startActionLoading({ title: "Adding component", message: `Adding ${product.name} to the kit…` });

    if (createMode) {
      try {
        setActiveDetail((current) => {
          const items = Array.isArray(current?.items) ? [...current.items] : [];
          const existingIndex = items.findIndex((item) => text(item.productId) === product.id);
          if (existingIndex >= 0) {
            const existing = items[existingIndex];
            items[existingIndex] = { ...existing, quantity: Math.max(1, number(existing.quantity) + quantity), updatedAt: new Date().toISOString() };
          } else {
            items.push(normalizeItem({
              id: `draft-kit-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              productId: product.id,
              productName: product.name,
              quantity,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }, items.length));
          }
          return { ...(current || {}), items };
        });
        setDraftErrors((current) => ({ ...current, items: "" }));
        setSelectedProductId("");
        setProductSearch("");
        setProductQty(1);
        setProductPickerOpen(false);
        notify("Product added to kit draft.");
        await finishActionLoading("done", `${product.name} added successfully.`);
      } catch (error) {
        const message = error?.message || "The product could not be added.";
        await finishActionLoading("failed", message);
        notify(message, "error");
      }
      return;
    }

    const kit = activeDetail?.kit;
    if (!kit?.id) {
      await finishActionLoading("failed", "The kit could not be found.");
      return;
    }
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items`, {
        method: "POST",
        body: JSON.stringify({ productId: product.id, quantity, adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      setDraftErrors((current) => ({ ...current, items: "" }));
      setSelectedProductId("");
      setProductSearch("");
      setProductQty(1);
      setProductPickerOpen(false);
      notify("Product added to kit.");
      await finishActionLoading("done", `${product.name} added successfully.`);
    } catch (error) {
      const message = error?.message || "The product could not be added.";
      await finishActionLoading("failed", message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const updateQuantity = async (row, value) => {
    const quantity = Math.max(1, Math.round(number(value) || 1));
    if (quantity === row.quantity) return;
    if (createMode) {
      setActiveDetail((current) => ({
        ...(current || {}),
        items: (current?.items || []).map((item) => item.id === row.id ? { ...item, quantity, updatedAt: new Date().toISOString() } : item),
      }));
      notify("Quantity updated.");
      return;
    }
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      notify("Quantity updated.");
    } catch (error) {
      notify(error?.message || "The quantity could not be updated.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (row) => {
    const confirmed = await confirmDelete({
      itemName: row.name,
      itemType: "component",
      title: "Remove component?",
      message: `Remove “${row.name}” from this kit? The product itself will stay in the Products catalogue.`,
      confirmLabel: "Remove Component",
    });
    if (!confirmed) return;
    if (createMode) {
      setActiveDetail((current) => ({
        ...(current || {}),
        items: (current?.items || []).filter((item) => item.id !== row.id),
      }));
      notify("Component removed.");
      return;
    }
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword: editAdminPassword }),
      });
      setDetailFromBody(body);
      setEditName(pendingName);
      notify("Component removed.");
    } catch (error) {
      notify(error?.message || "The component could not be removed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const saveKit = async () => {
    const cleanName = text(editName);
    const rows = Array.isArray(activeDetail?.items) ? activeDetail.items : [];
    const errors = {
      name: cleanName ? "" : "Kit name is required.",
      items: rows.length ? "" : createMode ? "Add at least one component before saving the kit." : "Add at least one component before saving changes.",
    };
    setDraftErrors(errors);
    if (errors.name || errors.items) return;

    const validRows = rows.filter((row) => row.productId);
    setBusy(true);
    startSaveProgress({
      title: createMode ? "Saving kit" : "Saving changes",
      message: createMode ? `Preparing ${validRows.length} component${validRows.length === 1 ? "" : "s"}…` : "Updating your kit…",
    });
    try {
      if (createMode) {
        const createdBody = await requestJson("/next/api/products/kits", {
          method: "POST",
          body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword, folderId: activeDetail?.kit?.folderId || activeFolder?.id || "" }),
        });
        const created = normalizeKit({ ...(createdBody.kit || {}), canEdit: true });
        if (!created.id) throw new Error("Kit was created but the kit ID was not returned.");

        updateSaveProgress(18, "Kit created. Saving components…");
        for (let index = 0; index < validRows.length; index += 1) {
          const row = validRows[index];
          await requestJson(`/next/api/products/kits/${encodeURIComponent(created.id)}/items`, {
            method: "POST",
            body: JSON.stringify({ productId: row.productId, quantity: row.quantity, adminPassword: editAdminPassword }),
          });
          const componentProgress = 18 + Math.round(((index + 1) / Math.max(1, validRows.length)) * 68);
          updateSaveProgress(componentProgress, `Saving component ${index + 1} of ${validRows.length}…`);
        }
        await refreshKits();
        updateSaveProgress(94, "Refreshing kits…");
        notify("Kit saved successfully.");
        await finishSaveProgress("done", "Kit saved successfully.");
        backToKits();
        return;
      }

      const kit = activeDetail?.kit;
      const body = await requestJson(`/next/api/products/kits/${encodeURIComponent(kit.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword }),
      });
      updateSaveProgress(86, "Applying the latest changes…");
      const updated = normalizeKit(body.kit || { ...kit, name: cleanName });
      setActiveDetail((current) => current ? { ...current, kit: updated } : current);
      setKits((current) => current.map((entry) => entry.id === updated.id ? { ...updated, itemsCount: rows.length } : entry));
      setEditName(updated.name);
      setDraftErrors({ name: "", items: "" });
      notify("Changes saved.");
      await finishSaveProgress("done", "Kit changes saved successfully.");
    } catch (error) {
      const message = error?.message || `Failed to ${createMode ? "create" : "update"} kit.`;
      await finishSaveProgress("failed", message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const renderKitCard = (kit) => {
    const menuKey = `kit:${kit.id}`;
    const menuOpen = folderMenu === menuKey;
    return (
      <article className={`products-proposal-folder kit-library-kit ${menuOpen ? "is-menu-open" : ""}`} key={kit.id}>
        <button type="button" className="proposal-folder-menu-btn" onClick={(event) => { event.stopPropagation(); setFolderMenu((current) => current === menuKey ? "" : menuKey); }} aria-expanded={menuOpen} aria-label={`Actions for ${kit.name}`}><span className="proposal-menu-dots" aria-hidden="true">•••</span></button>
        {menuOpen ? (
          <div className="proposal-folder-menu" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => { setFolderMenu(""); enterEditKit(kit); }}><FeatherIcon name="edit" /><span>Edit</span></button>
            <button type="button" onClick={() => { setFolderMenu(""); startMoveKit(kit); }}><FeatherIcon name="move" /><span>Move</span></button>
            <button type="button" onClick={() => { setFolderMenu(""); setNameDialog({ mode: "copy", kit, value: `${kit.name} copy` }); }}><FeatherIcon name="copy" /><span>Make a copy</span></button>
            <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteKit(kit); }}><FeatherIcon name="trash" /><span>Delete</span></button>
          </div>
        ) : null}
        <button type="button" className="products-proposal-folder__main" onClick={() => loadKit(kit.id, { edit: false, adminPassword: "" })} aria-label={`Open ${kit.name}`}>
          <span className="proposal-folder-figure" aria-hidden="true">
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
            <span className="proposal-folder-figure__back" />
            <span className="proposal-folder-figure__front"><small>K</small></span>
          </span>
          <span className="proposal-folder-copy"><strong>{kit.name}</strong><em>Created by {kit.createdBy || "—"}</em></span>
          <span className="proposal-folder-count"><FeatherIcon name="copy" /><span>{formatNumber(kit.itemsCount)} component{kit.itemsCount === 1 ? "" : "s"}</span></span>
        </button>
      </article>
    );
  };

  const renderDetailComponentCard = (row) => (
    <article className={`kit-component-card ${detailEdit ? "is-editable" : "is-view"}`} key={row.id}>
      <header className="kit-component-card__head">
        <div className="kit-component-card__title">
          <span>Component</span>
          <h4>{row.name}</h4>
        </div>
      </header>

      <div className="kit-component-card__metrics">
        <div className="kit-component-card__metric kit-component-card__metric--qty">
          <span>Qty</span>
          {detailEdit ? (
            <input
              className="proposal-item-qty kit-component-card__qty-input"
              type="number"
              min="1"
              step="1"
              defaultValue={row.quantity}
              key={`${row.id}-${row.quantity}`}
              onChange={(event) => createMode ? updateQuantity(row, event.target.value) : undefined}
              onBlur={(event) => !createMode ? updateQuantity(row, event.target.value) : undefined}
              aria-label={`Quantity for ${row.name}`}
            />
          ) : <strong>{formatNumber(row.quantity)}</strong>}
        </div>
        <div className="kit-component-card__metric">
          <span>Unit price</span>
          <strong>{formatMoney(row.unitPrice)}</strong>
        </div>
        <div className="kit-component-card__metric kit-component-card__metric--total">
          <span>Total price</span>
          <strong>{formatMoney(row.totalPrice)}</strong>
        </div>
      </div>

      <footer className="kit-component-card__actions">
        {row.product?.url ? (
          <a className="kit-component-card__action kit-component-card__action--link" href={row.product.url} target="_blank" rel="noreferrer" aria-label={`Open product link for ${row.name}`}>
            <FeatherIcon name="externalLink" /><span>Open link</span>
          </a>
        ) : (
          <span className="kit-component-card__action kit-component-card__action--disabled" aria-label="No product link">
            <FeatherIcon name="minus" /><span>No link</span>
          </span>
        )}
        {detailEdit ? (
          <button type="button" className="kit-component-card__action kit-component-card__action--remove" onClick={() => removeItem(row)} aria-label={`Delete ${row.name}`} title="Delete">
            <FeatherIcon name="trash" /><span>Remove</span>
          </button>
        ) : null}
      </footer>
    </article>
  );

  const renderLibraryFolder = (folder) => {
    const menuKey = `folder:${folder.id}`;
    const menuOpen = folderMenu === menuKey;
    const kitCount = folderKitCounts.get(folder.id) || 0;
    return (
      <article className={`products-proposal-folder kit-library-folder ${menuOpen ? "is-menu-open" : ""}`} key={folder.id}>
        <button type="button" className="proposal-folder-menu-btn" onClick={(event) => { event.stopPropagation(); setFolderMenu((current) => current === menuKey ? "" : menuKey); }} aria-expanded={menuOpen} aria-label={`Actions for folder ${folder.name}`}><span className="proposal-menu-dots" aria-hidden="true">•••</span></button>
        {menuOpen ? (
          <div className="proposal-folder-menu" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => { setFolderMenu(""); renameFolder(folder); }}><FeatherIcon name="edit" /><span>Rename</span></button>
            <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteFolder(folder); }}><FeatherIcon name="trash" /><span>Delete folder</span></button>
          </div>
        ) : null}
        <button type="button" className="products-proposal-folder__main" onClick={() => openFolder(folder)} aria-label={`Open folder ${folder.name}`}>
          <span className="proposal-folder-figure" aria-hidden="true">
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
            <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
            <span className="proposal-folder-figure__back" />
            <span className="proposal-folder-figure__front"><small>F</small></span>
          </span>
          <span className="proposal-folder-copy"><strong>{folder.name}</strong><em>Kit folder</em></span>
          <span className="proposal-folder-count"><FeatherIcon name="folder" /><span>{formatNumber(kitCount)} kit{kitCount === 1 ? "" : "s"}</span></span>
        </button>
      </article>
    );
  };

  if (activeDetail || detailBusy) {
    const kit = activeDetail?.kit;
    return (
      <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <SaveProgressModal state={saveProgress} />
        <ActionLoadingModal state={actionLoading} />
        <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
          <section className="proposals-panel">
            <section className={`products-proposal-detail ${createMode ? "is-create" : detailEdit ? "is-edit" : "is-view"}`}>
              {detailBusy && !activeDetail ? (
                <div className="products-loading-card" role="status" aria-live="polite">
                  <div className="products-spinner" aria-hidden="true" />
                  <div><strong>Loading kit</strong></div>
                </div>
              ) : (
                <>
                  {createMode ? (
                    <header className="products-proposal-detail__head kit-create-label-head">
                      <div className="kit-create-title-pill">
                        <button type="button" className="products-back-btn" onClick={backToKits} aria-label="Back to kits"><FeatherIcon name="arrowLeft" /></button>
                        <span>Create New Kit</span>
                      </div>
                    </header>
                  ) : (
                    <header className="products-proposal-detail__head proposal-detail-head--compact">
                      <button type="button" className="products-back-btn" onClick={backToKits} aria-label="Back to kits"><FeatherIcon name="arrowLeft" /></button>
                      <div className="proposal-detail-actions proposal-detail-actions--classic">
                        <div className="proposal-download-menu-wrap">
                          <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => { setDownloadMenuOpen(true); setSortMenuOpen(false); }}>
                            <FeatherIcon name="download" /><span>Download</span><FeatherIcon name="chevronDown" size={15} />
                          </button>
                        </div>
                        <div className="proposal-sort-menu-wrap">
                          <button type="button" className="products-btn proposal-sort-btn" onClick={() => { setSortMenuOpen((open) => !open); setDownloadMenuOpen(false); }}>
                            <FeatherIcon name="sort" /><span>Sort</span><FeatherIcon name="chevronDown" size={15} />
                          </button>
                          {sortMenuOpen ? (
                            <div className="proposal-sort-menu" role="menu">
                              <button type="button" className={groupBy === "component-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("component-tag")}>
                                <span className="proposal-sort-menu__check">{groupBy === "component-tag" ? "✓" : ""}</span>
                                <span><strong>By components tag</strong><small>Group by the product component tag.</small></span>
                              </button>
                              <button type="button" className={groupBy === "kit-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("kit-tag")}>
                                <span className="proposal-sort-menu__check">{groupBy === "kit-tag" ? "✓" : ""}</span>
                                <span><strong>By kits tag</strong><small>Folder → kit → components.</small></span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <button type="button" className="products-btn products-btn--dark proposal-send-stock-btn" onClick={openSendToStock} disabled={!enrichedRows.length}>
                          <FeatherIcon name="archive" /><span>Send to stock</span>
                        </button>
                      </div>
                    </header>
                  )}

                  {!createMode && !detailEdit ? (
                    <div className="proposal-classic-detail-title">
                      <span className="proposal-create-title-pill"><span>{kit?.name || "Kit"}</span></span>
                      <p>{formatNumber(enrichedRows.length)} saved component{enrichedRows.length === 1 ? "" : "s"} • View only</p>
                    </div>
                  ) : null}

                  {detailEdit ? (
                    <>
                      <div className={`proposal-name-edit-block proposal-name-edit-block--footer-save ${createMode ? "proposal-name-edit-block--create proposal-name-edit-block--kit-create" : "proposal-name-edit-block--kit-edit"}`}>
                        <label className="products-field products-field--wide">
                          <span>Kit name <em>*</em></span>
                          <input
                            type="text"
                            value={editName}
                            onChange={(event) => {
                              setEditName(event.target.value);
                              if (text(event.target.value)) setDraftErrors((current) => ({ ...current, name: "" }));
                            }}
                            autoComplete="off"
                            placeholder="Example: Arduino starter kit"
                          />
                        </label>
                        <div className="direct-create-inline-error direct-create-inline-error--name kit-create-inline-error kit-create-inline-error--name" aria-live="polite">{draftErrors.name}</div>
                      </div>

                      <div className="products-proposal-tools proposals-one-tool">
                        <div className={`products-proposal-tool-card ${productPickerOpen ? "has-open-select" : ""}`}>
                          <div className="products-proposal-tool-title"><FeatherIcon name="plusCircle" /><span>Add kit component</span></div>
                          <div className="products-proposal-control-grid">
                            <label className="products-field proposals-search-field">
                              <span>Component</span>
                              <div className={`proposal-search-select ${productPickerOpen ? "is-open" : ""}`} ref={pickerRef}>
                                <button
                                  type="button"
                                  className="proposal-search-select__button"
                                  onClick={() => setProductPickerOpen((open) => !open)}
                                  aria-haspopup="listbox"
                                  aria-expanded={productPickerOpen}
                                >
                                  <span className="proposal-search-select__value">{selectedProduct ? `${selectedProduct.name}${selectedProduct.displayId ? ` · ${selectedProduct.displayId}` : ""}` : "Search or select component"}</span>
                                  <FeatherIcon name="chevronDown" />
                                </button>
                                {productPickerOpen ? (
                                  <div className="proposal-search-select__menu" role="listbox">
                                    <div className="proposal-search-select__search">
                                      <FeatherIcon name="search" />
                                      <input autoFocus type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search..." autoComplete="off" />
                                    </div>
                                    <div className="proposal-search-select__options">
                                      {filteredProducts.map((product) => (
                                        <button
                                          type="button"
                                          className="proposal-search-select__option"
                                          key={product.id}
                                          onClick={() => {
                                            setSelectedProductId(product.id);
                                            setProductPickerOpen(false);
                                            setDraftErrors((current) => ({ ...current, items: "" }));
                                          }}
                                        >
                                          <span>{product.name}{product.displayId ? ` · ${product.displayId}` : ""}</span>
                                          <small>{[firstTag(product), product.unit].filter(Boolean).join(" · ") || "Catalogue product"}</small>
                                        </button>
                                      ))}
                                      {!filteredProducts.length ? <div className="proposal-search-select__empty">No products available</div> : null}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </label>
                            <label className="products-field products-field--qty">
                              <span>Qty</span>
                              <input type="number" min="1" step="1" value={productQty} onChange={(event) => setProductQty(event.target.value)} inputMode="numeric" />
                            </label>
                            <button type="button" className="products-btn products-btn--dark" onClick={addSelectedProduct} disabled={busy}><FeatherIcon name="plus" /><span>Add</span></button>
                          </div>
                        </div>
                      </div>
                      <div className="direct-create-inline-error direct-create-inline-error--items kit-create-inline-error kit-create-inline-error--items" aria-live="polite">{draftErrors.items}</div>
                    </>
                  ) : (
                    <div className="proposal-view-note"><FeatherIcon name="eye" /><span>View only. Use the 3-dot menu then Edit to modify this kit.</span></div>
                  )}

                  <div className="products-proposal-table-card">
                    <div className="products-proposal-table-head">
                      <div><h3>Kit components</h3><p>These quantities will be copied into any proposal when you add this kit.</p></div>
                      <span>{formatNumber(enrichedRows.length)} item{enrichedRows.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="products-proposal-table-wrap kit-components-wrap">
                      <div className="proposal-components-groups kit-components-groups">
                        {groupBy === "kit-tag" ? (
                          kitGroupedVisibleRows.map((folder) => (
                            <section className="proposal-kit-folder-group" key={`${folder.id || "unfiled"}-${folder.label}`}>
                              <div className="proposal-kit-folder-group__head">
                                <div><span>Kit folder</span><strong>{folder.label}</strong></div>
                                <em>{folder.kits.length} kit{folder.kits.length === 1 ? "" : "s"}</em>
                              </div>
                              <div className="proposal-kit-folder-group__body">
                                {folder.kits.map((groupedKit) => (
                                  <div className="proposal-kit-group" key={`${groupedKit.id || "kit"}-${groupedKit.label}`}>
                                    <div className="proposal-kit-group__head">
                                      <div><span>Kit</span><strong>{groupedKit.label}</strong></div>
                                      <em>{groupedKit.rows.length} item{groupedKit.rows.length === 1 ? "" : "s"}</em>
                                    </div>
                                    <div className="kit-components-grid">
                                      {groupedKit.rows.map(renderDetailComponentCard)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))
                        ) : (
                          componentGroupedVisibleRows.map((group) => (
                            <section className="proposal-component-group" key={group.label}>
                              <div className="proposal-component-group__head">
                                <div><span>Component tag</span><strong>{group.label}</strong></div>
                                <em>{group.rows.length} item{group.rows.length === 1 ? "" : "s"}</em>
                              </div>
                              <div className="kit-components-grid">
                                {group.rows.map(renderDetailComponentCard)}
                              </div>
                            </section>
                          ))
                        )}
                        {!visibleEnrichedRows.length ? <div className="products-table-empty kit-components-empty">{enrichedRows.length ? "No components match your search." : <>No components yet. {detailEdit ? "Add one component above." : "Open Edit from the folder menu to add components."}</>}</div> : null}
                      </div>
                    </div>
                    <div className="proposal-total-block">
                      <div><span>Total requested items</span><strong>{formatNumber(detailTotals.items)} item{detailTotals.items === 1 ? "" : "s"}</strong></div>
                      <div><span>Total quantity</span><strong>{formatNumber(detailTotals.quantity)}</strong></div>
                      <div><span>Total cost</span><strong>{formatMoney(detailTotals.value)}</strong></div>
                    </div>
                  </div>

                  {detailEdit ? (
                    <div className={`kit-create-save-footer direct-create-save-footer ${createMode ? "direct-create-save-footer--create" : "direct-create-save-footer--edit"}`}>
                      <button type="button" className="products-btn products-btn--light direct-create-cancel-btn" onClick={backToKits} disabled={busy}>Cancel</button>
                      <button type="button" className="products-btn products-btn--dark kit-create-save-btn direct-create-save-btn" onClick={saveKit} disabled={busy}>
                        <FeatherIcon name="save" /><span>{busy ? "Saving…" : createMode ? "Save" : "Save Changes"}</span>
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </section>
        </section>

        {downloadMenuOpen && kit ? (
          <KitDownloadModal
            columns={exportColumns}
            onToggleColumn={toggleExportColumn}
            onDownload={downloadKit}
            onClose={() => setDownloadMenuOpen(false)}
          />
        ) : null}
        {sendToStockOpen && kit ? (
          <SendKitToStockModal
            kit={kit}
            members={members}
            busy={busy}
            onClose={() => setSendToStockOpen(false)}
            onSubmit={sendKitToStock}
          />
        ) : null}
        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  return (
    <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="proposals-floating-actions kit-library-actions">
        {activeFolder ? (
          <>
            <button type="button" className="products-btn products-btn--light proposal-classic-combine-btn next-kit-combine-btn" onClick={() => setCombineOpen(true)} disabled={kits.length < 2}><FeatherIcon name="merge" /><span>Combined Kits</span></button>
            <button type="button" className="products-add-btn proposals-create-btn" onClick={startCreateKit}><FeatherIcon name="briefcase" /><span>Create New Kit</span></button>
          </>
        ) : (
          <>
            <button type="button" className="products-add-btn proposals-create-btn" onClick={startCreateKit}><FeatherIcon name="briefcase" /><span>Create New Kit</span></button>
            <button type="button" className="products-add-btn proposals-create-btn kit-create-folder-btn" onClick={() => setFolderDialog({ mode: "create", value: "" })}><FeatherIcon name="folderPlus" /><span>Create Folder</span></button>
          </>
        )}
      </div>

      {activeFolder ? (
        <div className="kit-folder-context">
          <button type="button" className="products-back-btn" onClick={backToFolderRoot} aria-label="Back to kit folders"><FeatherIcon name="arrowLeft" /></button>
          <div className="kit-folder-context__icon"><FeatherIcon name="folder" /></div>
          <div><span>Kit folder</span><h2>{activeFolder.name}</h2><p>{formatNumber(folderKitCounts.get(activeFolder.id) || 0)} kit{(folderKitCounts.get(activeFolder.id) || 0) === 1 ? "" : "s"}</p></div>
        </div>
      ) : null}

      {bootstrapWarnings.length ? <div className="proposal-view-note"><span aria-hidden="true">!</span><span>Some startup resources were delayed. The page remains usable; refresh if a kit or folder is missing.</span></div> : null}

      <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
        <section className="proposals-panel">
          <div className="products-proposals-list">
            {(filteredFolders.length || filteredKits.length) ? (
              <div className="products-proposal-folders kit-library-grid">
                {!activeFolder ? filteredFolders.map(renderLibraryFolder) : null}
                {filteredKits.map(renderKitCard)}
              </div>
            ) : (
              <div className="products-proposals-empty">{activeFolder ? "No kits in this folder yet. Use Create New Kit to add one." : "No folders or unfiled kits match your search."}</div>
            )}
          </div>
        </section>
      </section>

      {combineOpen ? <CombineKitsModal kits={kits} busy={busy} onClose={() => setCombineOpen(false)} onCreate={createCombinedKit} /> : null}
      {folderDialog ? <FolderNameModal key={`${folderDialog.mode}-${folderDialog.folder?.id || "new"}`} dialog={folderDialog} busy={busy} onClose={() => setFolderDialog(null)} onSubmit={submitFolderDialog} /> : null}
      {moveDialog ? <MoveKitModal key={`move-${moveDialog.kit?.id || "kit"}`} dialog={moveDialog} folders={folders.map((folder) => ({ ...folder, kitCount: folderKitCounts.get(folder.id) || 0 }))} busy={busy} onClose={() => setMoveDialog(null)} onSubmit={submitMoveKit} /> : null}
      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}

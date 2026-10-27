"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DeleteVerificationDialog } from "../shared/SystemDeleteDialogs";

const EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["name", "Component"],
  ["quantity", "Quantity"],
  ["unitPrice", "Unit Cost"],
  ["totalPrice", "Total Cost"],
];

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

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
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

export function KitDownloadModal({ columns, onToggleColumn, onDownload, onClose }) {
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

export function SendKitToStockModal({ kit, members, busy, onClose, onSubmit }) {
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

export function NameModal({ dialog, busy, onClose, onSubmit }) {
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

export function FolderNameModal({ dialog, busy, onClose, onSubmit }) {
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

export function MoveKitModal({ dialog, folders, busy, onClose, onSubmit }) {
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

export function PasswordModal({ request, busy, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!text(password)) return setError("Admin password is required.");
    setError("");
    try {
      await requestJson("/next/api/products/admin/verify", { method: "POST", body: JSON.stringify({ password }) });
      onVerified(text(password));
    } catch (verifyError) {
      setError(verifyError?.message || "Invalid Admin password.");
    }
  };

  const deleteVerification = /delete/i.test(`${request?.title || ""} ${request?.message || ""}`);
  if (deleteVerification) {
    return <DeleteVerificationDialog
      title={request?.title && !/^admin password required$/i.test(request.title) ? request.title : "Delete item"}
      password={password}
      onPasswordChange={(value) => { setPassword(value); setError(""); }}
      busy={busy}
      error={error}
      onCancel={onClose}
      onSubmit={() => submit({ preventDefault() {} })}
      confirmLabel="Continue"
    />;
  }

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

export function CombineKitsModal({ kits, busy, onClose, onCreate }) {
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

export function AddProductModal({ kit, products, busy, onClose, onSubmit }) {
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


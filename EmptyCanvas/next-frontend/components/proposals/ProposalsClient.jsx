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

const COMBINE_LOGICS = [
  { value: "add", label: "Add", description: "Add quantities for components that appear in more than one proposal." },
  { value: "max", label: "Max", description: "Keep the highest quantity found for each repeated component." },
  { value: "min", label: "Min", description: "Keep the lowest quantity found where that component exists." },
  { value: "separate", label: "Separate", description: "Keep each proposal quantity visible separately in the combined export." },
];

const PROPOSAL_ICON_PATHS = {
  download: [<path key="p1" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <polyline key="p2" points="7 10 12 15 17 10" />, <line key="l" x1="12" y1="15" x2="12" y2="3" />],
  shoppingBag: [<path key="p1" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />, <line key="l" x1="3" y1="6" x2="21" y2="6" />, <path key="p2" d="M16 10a4 4 0 0 1-8 0" />],
  archive: [<polyline key="p1" points="21 8 21 21 3 21 3 8" />, <rect key="r" x="1" y="3" width="22" height="5" rx="1" />, <line key="l" x1="10" y1="12" x2="14" y2="12" />],
  edit: [<path key="p1" d="M12 20h9" />, <path key="p2" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />],
  copy: [<rect key="r" x="9" y="9" width="13" height="13" rx="2" ry="2" />, <path key="p" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />],
  trash: [<polyline key="pl" points="3 6 5 6 21 6" />, <path key="p1" d="M19 6l-1 14H6L5 6" />, <path key="p2" d="M10 11v6M14 11v6M9 6V4h6v2" />],
  file: [<path key="p1" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />, <polyline key="p2" points="14 2 14 8 20 8" />, <line key="l1" x1="8" y1="13" x2="16" y2="13" />, <line key="l2" x1="8" y1="17" x2="16" y2="17" />],
  grid: [<rect key="r1" x="3" y="3" width="7" height="7" rx="1" />, <rect key="r2" x="14" y="3" width="7" height="7" rx="1" />, <rect key="r3" x="3" y="14" width="7" height="7" rx="1" />, <rect key="r4" x="14" y="14" width="7" height="7" rx="1" />],
  sort: [<line key="l1" x1="3" y1="6" x2="21" y2="6" />, <line key="l2" x1="6" y1="12" x2="18" y2="12" />, <line key="l3" x1="10" y1="18" x2="14" y2="18" />],
  check: [<polyline key="p" points="20 6 9 17 4 12" />],
  chevronDown: [<polyline key="p" points="6 9 12 15 18 9" />],
};

function ProposalIcon({ name, size = 18, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PROPOSAL_ICON_PATHS[name] || PROPOSAL_ICON_PATHS.file}
    </svg>
  );
}

function combineLogicLabel(value) {
  return COMBINE_LOGICS.find((option) => option.value === text(value))?.label || "Add";
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

function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

function firstTag(product) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  return tags.map(text).find(Boolean) || "Uncategorized";
}

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file?.name || "receipt image"}.`));
    reader.readAsDataURL(file);
  });
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

function normalizeProposal(proposal, index = 0) {
  return {
    id: text(proposal?.id) || `proposal-${index}`,
    name: text(proposal?.name) || "Untitled proposal",
    createdBy: text(proposal?.createdBy),
    createdById: text(proposal?.createdById),
    createdAt: text(proposal?.createdAt),
    updatedAt: text(proposal?.updatedAt),
    itemsCount: number(proposal?.itemsCount),
    canEdit: proposal?.canEdit === true,
    combinedSources: Array.isArray(proposal?.combinedSources) ? proposal.combinedSources : [],
    combineLogic: text(proposal?.combineLogic),
    combineNote: text(proposal?.combineNote),
    combinedMatrix: Array.isArray(proposal?.combinedMatrix) ? proposal.combinedMatrix : [],
  };
}

function normalizeKit(kit, index = 0) {
  return {
    id: text(kit?.id) || `kit-${index}`,
    name: text(kit?.name) || "Untitled kit",
    folderId: text(kit?.folderId || kit?.folder_id),
    itemsCount: number(kit?.itemsCount),
  };
}

function normalizeKitFolder(folder, index = 0) {
  return {
    id: text(folder?.id) || `kit-folder-${index}`,
    name: text(folder?.name) || "Untitled folder",
  };
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

function normalizeSourceKits(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((source, index) => ({
      kitId: text(source?.kitId || source?.kit_id || source?.id),
      kitName: text(source?.kitName || source?.kit_name || source?.name),
      quantity: Math.max(1, Math.round(number(source?.quantity || source?.qty) || 1)),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    }))
    .filter((source) => source.kitId || source.kitName);
}

function normalizeItem(item, index = 0) {
  return {
    id: text(item?.id) || `item-${index}`,
    proposalId: text(item?.proposalId),
    productId: text(item?.productId),
    productName: text(item?.productName) || "Untitled product",
    quantity: Math.max(1, Math.round(number(item?.quantity) || 1)),
    sourceKits: normalizeSourceKits(item?.sourceKits || item?.source_kits),
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

function openDownload(url) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`next-proposals-toast is-${toast.type || "info"}`} role="status">
      <div><strong>{toast.title || "Proposals"}</strong><span>{toast.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, subtitle, icon = "◆", children, footer, onClose, wide = false, className = "" }) {
  return (
    <div className="products-modal-overlay next-proposals-classic-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`products-modal products-proposal-modal ${wide ? "next-proposals-classic-modal--wide" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="products-modal__close" onClick={onClose} aria-label="Close"><span aria-hidden="true">×</span></button>
        <div className="products-modal__header">
          <div className="products-modal__icon" aria-hidden="true">{icon}</div>
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        </div>
        <div className="next-proposals-modal__body">{children}</div>
        {footer ? <div className="products-modal__actions">{footer}</div> : null}
      </section>
    </div>
  );
}

function NameModal({ dialog, busy, onClose, onSubmit }) {
  const [value, setValue] = useState(dialog?.value || "");
  const [error, setError] = useState("");
  const labels = {
    create: ["Create New Proposal", "Name the proposal folder so you can return to it later.", "Create Proposal"],
    copy: ["Copy Proposal", "Create an independent copy with all saved components.", "Create Copy"],
    rename: ["Rename Proposal", "Update the folder name without changing its components.", "Save Name"],
    combine: ["Save Combined Proposal", "Save the selected proposals as a reusable proposal folder.", "Save Combined Proposal"],
  };
  const [title, subtitle, action] = labels[dialog?.mode] || labels.create;

  const submit = async (event) => {
    event.preventDefault();
    const name = text(value);
    if (!name) return setError("Proposal name is required.");
    setError("");
    try {
      await onSubmit(name);
    } catch (submitError) {
      setError(submitError?.message || "The proposal could not be saved.");
    }
  };

  return (
    <Modal title={title} subtitle={subtitle} icon="▣" onClose={onClose} footer={null}>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <label><span>Proposal Name *</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Example: School supplies quotation" /></label>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Saving…" : action}</button>
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

function ProposalMultiSelect({ proposals, selectedIds, onToggle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const selectedProposals = proposals.filter((proposal) => selectedIds.includes(proposal.id));
  const filtered = useMemo(() => {
    const needle = lower(query);
    if (!needle) return proposals;
    return proposals.filter((proposal) => lower(`${proposal.name} ${proposal.createdBy}`).includes(needle));
  }, [proposals, query]);

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

  const triggerText = selectedProposals.length
    ? `${selectedProposals.length} proposal${selectedProposals.length === 1 ? "" : "s"} selected`
    : "Choose proposals";

  return (
    <div className={`proposal-combine-multi ${open ? "is-open" : ""}`} ref={rootRef}>
      <span className="proposal-combine-multi__label">Proposals</span>
      <button type="button" className="proposal-combine-multi__trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>
          <strong>{triggerText}</strong>
          <small>{selectedProposals.length ? selectedProposals.slice(0, 3).map((proposal) => proposal.name).join(" · ") + (selectedProposals.length > 3 ? ` +${selectedProposals.length - 3}` : "") : "Select two or more proposals"}</small>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open ? (
        <div className="proposal-combine-multi__menu" role="listbox" aria-multiselectable="true" aria-label="Choose proposals">
          <div className="proposal-combine-multi__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search proposals..." />
            {selectedIds.length ? <button type="button" onClick={() => selectedIds.forEach((id) => onToggle(id))}>Clear</button> : null}
          </div>
          <div className="proposal-combine-multi__options">
            {filtered.map((proposal) => {
              const active = selectedIds.includes(proposal.id);
              return (
                <button type="button" role="option" aria-selected={active} className={active ? "is-selected" : ""} key={proposal.id} onClick={() => onToggle(proposal.id)}>
                  <span className="proposal-combine-multi__check" aria-hidden="true">{active ? "✓" : ""}</span>
                  <span className="proposal-combine-multi__copy"><strong>{proposal.name}</strong><small>{formatNumber(proposal.itemsCount)} item{proposal.itemsCount === 1 ? "" : "s"}{proposal.createdBy ? ` · ${proposal.createdBy}` : ""}</small></span>
                </button>
              );
            })}
            {!filtered.length ? <div className="proposal-combine-multi__empty">No proposals match your search.</div> : null}
          </div>
          <div className="proposal-combine-multi__footer"><span>{selectedIds.length} selected</span><button type="button" onClick={() => setOpen(false)}>Done</button></div>
        </div>
      ) : null}
    </div>
  );
}

function KitBrowserDialog({ folders, kits, selectedKits, onToggleKit, onQuantityChange, onClose }) {
  const [activeFolderId, setActiveFolderId] = useState("");
  const [query, setQuery] = useState("");
  const [bulkQuantity, setBulkQuantity] = useState("1");
  const [bulkQuantityVisible, setBulkQuantityVisible] = useState(false);
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) || null;
  const needle = lower(query);
  const selectedCount = Object.keys(selectedKits || {}).length;
  const folderCounts = useMemo(() => {
    const map = new Map();
    kits.forEach((kit) => {
      if (kit.folderId) map.set(kit.folderId, (map.get(kit.folderId) || 0) + 1);
    });
    return map;
  }, [kits]);
  const visibleFolders = useMemo(() => {
    if (activeFolderId) return [];
    if (!needle) return folders;
    return folders.filter((folder) => lower(folder.name).includes(needle));
  }, [activeFolderId, folders, needle]);
  const currentScopeKits = useMemo(() => (
    activeFolderId ? kits.filter((kit) => kit.folderId === activeFolderId) : kits.filter((kit) => !kit.folderId)
  ), [activeFolderId, kits]);
  const visibleKits = useMemo(() => {
    let rows = activeFolderId
      ? kits.filter((kit) => kit.folderId === activeFolderId)
      : needle
        ? kits
        : kits.filter((kit) => !kit.folderId);
    if (needle) rows = rows.filter((kit) => lower(kit.name).includes(needle));
    return rows;
  }, [activeFolderId, kits, needle]);
  const selectedInScopeCount = currentScopeKits.filter((kit) => Object.prototype.hasOwnProperty.call(selectedKits || {}, kit.id)).length;
  const allScopeSelected = currentScopeKits.length > 0 && selectedInScopeCount === currentScopeKits.length;

  const normalizeQuantityInput = (value) => {
    const raw = String(value ?? "").replace(/[^0-9]/g, "");
    if (!raw) return "0";
    return raw.replace(/^0+(?=\d)/, "") || "0";
  };

  const selectAllInScope = () => {
    const nextQty = normalizeQuantityInput(bulkQuantity || "1");
    currentScopeKits.forEach((kit) => {
      if (!Object.prototype.hasOwnProperty.call(selectedKits || {}, kit.id)) onToggleKit(kit.id);
      onQuantityChange(kit.id, nextQty);
    });
    setBulkQuantity(nextQty);
    setBulkQuantityVisible(true);
  };

  const unselectAllInScope = () => {
    Object.keys(selectedKits || {}).forEach((kitId) => onToggleKit(kitId));
    setBulkQuantityVisible(false);
    setBulkQuantity("1");
  };

  const changeBulkQuantity = (value) => {
    const nextQty = normalizeQuantityInput(value);
    setBulkQuantity(nextQty);
    currentScopeKits.forEach((kit) => {
      if (Object.prototype.hasOwnProperty.call(selectedKits || {}, kit.id)) onQuantityChange(kit.id, nextQty);
    });
  };

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="proposal-kit-browser-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="proposal-kit-browser proposal-kit-browser--multi" role="dialog" aria-modal="true" aria-label="Select kits">
        <header className="proposal-kit-browser__head">
          <div>
            <span className="proposal-kit-browser__eyebrow">Kit library</span>
            <h3>{activeFolder ? activeFolder.name : "Select kits"}</h3>
            <p>{activeFolder ? "Select one or more kits from this folder." : "Open a folder or select one or more unfiled kits."}</p>
          </div>
          <button type="button" className="proposal-kit-browser__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="proposal-kit-browser__toolbar">
          {activeFolder ? (
            <button type="button" className="proposal-kit-browser__back" onClick={() => { setActiveFolderId(""); setQuery(""); setBulkQuantityVisible(false); }}>
              <span aria-hidden="true">←</span><span>All folders</span>
            </button>
          ) : <span className="proposal-kit-browser__location">Folders & kits</span>}
          <label className="proposal-kit-browser__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search kits..." autoComplete="off" />
          </label>
          <div className="proposal-kit-browser__bulk-actions">
            <button type="button" className="proposal-kit-browser__bulk-button" onClick={selectAllInScope} disabled={!currentScopeKits.length || allScopeSelected}>Select all</button>
            <button type="button" className="proposal-kit-browser__bulk-button proposal-kit-browser__bulk-button--muted" onClick={unselectAllInScope} disabled={!selectedCount}>Unselect all</button>
          </div>
          {bulkQuantityVisible && selectedInScopeCount ? (
            <label className="proposal-kit-browser__bulk-qty">
              <span>Qty all</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={bulkQuantity}
                onChange={(event) => changeBulkQuantity(event.target.value)}
                onFocus={(event) => { if (event.currentTarget.value === "0") event.currentTarget.select(); }}
              />
            </label>
          ) : null}
          <span className="proposal-kit-browser__selected-count">{selectedCount} selected</span>
        </div>

        <div className="proposal-kit-browser__grid">
          {visibleFolders.map((folder) => {
            const kitCount = folderCounts.get(folder.id) || 0;
            return (
              <article className="products-proposal-folder kit-library-folder proposal-kit-browser-library-folder" key={folder.id}>
                <button type="button" className="products-proposal-folder__main" onClick={() => { setActiveFolderId(folder.id); setQuery(""); setBulkQuantityVisible(false); setBulkQuantity("1"); }} aria-label={`Open folder ${folder.name}`}>
                  <span className="proposal-folder-figure" aria-hidden="true">
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                    <span className="proposal-folder-figure__back" />
                    <span className="proposal-folder-figure__front"><small>F</small></span>
                  </span>
                  <span className="proposal-folder-copy"><strong>{folder.name}</strong><em>Kit folder</em></span>
                  <span className="proposal-folder-count">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
                    <span>{formatNumber(kitCount)} kit{kitCount === 1 ? "" : "s"}</span>
                  </span>
                </button>
              </article>
            );
          })}
          {visibleKits.map((kit) => {
            const isSelected = Object.prototype.hasOwnProperty.call(selectedKits || {}, kit.id);
            const qty = isSelected ? selectedKits[kit.id] : 1;
            return (
              <article className={`products-proposal-folder kit-library-kit proposal-kit-browser-library-kit ${isSelected ? "is-selected" : ""}`} key={kit.id}>
                <button type="button" className="products-proposal-folder__main" onClick={() => onToggleKit(kit.id)} aria-pressed={isSelected} aria-label={`${isSelected ? "Unselect" : "Select"} kit ${kit.name}`}>
                  <span className="proposal-folder-figure" aria-hidden="true">
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                    <span className="proposal-folder-figure__back" />
                    <span className="proposal-folder-figure__front"><small>K</small></span>
                  </span>
                  <span className="proposal-folder-copy"><strong>{kit.name}</strong><em>Created by {kit.createdBy || "—"}</em></span>
                  <span className="proposal-folder-count">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                    <span>{formatNumber(kit.itemsCount)} component{kit.itemsCount === 1 ? "" : "s"}</span>
                  </span>
                </button>
                {isSelected ? (
                  <div className="proposal-kit-browser-library-kit__selected-panel">
                    <span className="proposal-kit-browser-library-kit__selected-name">{kit.name}</span>
                    <label onClick={(event) => event.stopPropagation()}>
                      <span>Qty</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={qty}
                        onChange={(event) => onQuantityChange(kit.id, normalizeQuantityInput(event.target.value))}
                        onFocus={(event) => { if (event.currentTarget.value === "0") event.currentTarget.select(); }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </label>
                  </div>
                ) : null}
              </article>
            );
          })}
          {!visibleFolders.length && !visibleKits.length ? <div className="proposal-kit-browser__empty">No kits found here.</div> : null}
        </div>

        <footer className="proposal-kit-browser__footer">
          <span>{selectedCount} kit{selectedCount === 1 ? "" : "s"} selected</span>
          <button type="button" className="products-btn products-btn--dark" onClick={onClose} disabled={!selectedCount}>Done</button>
        </footer>
      </section>
    </div>
  );
}

function AddItemsModal({ proposal, products, kits, kitFolders, tags, busy, onClose, onSubmit }) {
  const [mode, setMode] = useState("product");
  const [selected, setSelected] = useState("");
  const [selectedProducts, setSelectedProducts] = useState({});
  const [selectedKits, setSelectedKits] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [mergeLogic, setMergeLogic] = useState("add");
  const [search, setSearch] = useState("");
  const [kitBrowserOpen, setKitBrowserOpen] = useState(false);
  const [error, setError] = useState("");

  const filteredProducts = useMemo(() => products.filter((product) => {
    const needle = lower(search);
    if (!needle) return true;
    return [product.name, product.displayId, product.unit, firstTag(product)].some((value) => lower(value).includes(needle));
  }).slice(0, 120), [products, search]);

  const selectedProductCount = Object.keys(selectedProducts).length;
  const selectedKitCount = Object.keys(selectedKits).length;
  const selectedKitNames = Object.keys(selectedKits).map((id) => kits.find((kit) => kit.id === id)?.name).filter(Boolean);

  const toggleProduct = (productId) => {
    setSelectedProducts((current) => {
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(next, productId)) delete next[productId];
      else next[productId] = 1;
      return next;
    });
    setError("");
  };

  const normalizeQuantityInput = (value) => {
    const raw = String(value ?? "").replace(/[^0-9]/g, "");
    if (!raw) return "0";
    return raw.replace(/^0+(?=\d)/, "") || "0";
  };

  const setProductQuantity = (productId, value) => {
    setSelectedProducts((current) => ({ ...current, [productId]: normalizeQuantityInput(value) }));
  };

  const toggleKit = (kitId) => {
    setSelectedKits((current) => {
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(next, kitId)) delete next[kitId];
      else next[kitId] = 1;
      return next;
    });
    setError("");
  };

  const setKitQuantity = (kitId, value) => {
    setSelectedKits((current) => ({ ...current, [kitId]: normalizeQuantityInput(value) }));
  };

  const switchMode = (value) => {
    setMode(value);
    setSelected("");
    setSelectedProducts({});
    setSelectedKits({});
    setQuantity(1);
    setSearch("");
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (mode === "product") {
      const selections = Object.entries(selectedProducts).map(([productId, qty]) => ({ selected: productId, quantity: Math.max(1, Math.round(number(qty) || 1)) }));
      if (!selections.length) return setError("Choose at least one product.");
      setError("");
      try {
        await onSubmit({ mode, selections, mergeLogic });
      } catch (submitError) {
        setError(submitError?.message || "The components could not be added.");
      }
      return;
    }
    if (mode === "kit") {
      const selections = Object.entries(selectedKits).map(([kitId, qty]) => ({ selected: kitId, quantity: Math.max(1, Math.round(number(qty) || 1)) }));
      if (!selections.length) return setError("Choose at least one kit.");
      setError("");
      try {
        await onSubmit({ mode, selections, mergeLogic });
      } catch (submitError) {
        setError(submitError?.message || "The components could not be added.");
      }
      return;
    }
    if (!selected) return setError(`Choose a ${mode}.`);
    setError("");
    try {
      await onSubmit({ mode, selected, quantity: Math.max(1, Math.round(number(quantity) || 1)), mergeLogic });
    } catch (submitError) {
      setError(submitError?.message || "The components could not be added.");
    }
  };

  return (
    <Modal title={`Add Components to ${proposal.name || "New Proposal"}`} subtitle="Add one product or a reusable kit." icon="＋" onClose={onClose} wide className="proposal-add-items-modal">
      <form className="next-proposals-form products-form-grid proposal-add-items-form" onSubmit={submit}>
        <div className="next-proposals-segmented">
          {[["product", "Single Product"], ["kit", "Kit"]].map(([value, label]) => (
            <button type="button" key={value} className={mode === value ? "active" : ""} onClick={() => switchMode(value)}>{label}</button>
          ))}
        </div>

        {mode === "product" ? (
          <>
            <div className="proposal-multi-product-head">
              <label><span>Search Catalogue</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name, code, tag or unit" /></label>
              <span className="proposal-multi-product-count">{selectedProductCount} selected</span>
            </div>
            <div className="next-proposals-product-picker proposal-multi-product-picker">
              {filteredProducts.map((product) => {
                const isSelected = Object.prototype.hasOwnProperty.call(selectedProducts, product.id);
                return (
                  <article className={`proposal-product-choice ${isSelected ? "is-selected" : ""}`} key={product.id}>
                    <button type="button" className="proposal-product-choice__pick" onClick={() => toggleProduct(product.id)} aria-pressed={isSelected}>
                      <span className="proposal-product-choice__media">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : "▧"}</span>
                      <span className="proposal-product-choice__copy"><strong>{product.name}</strong><small>{product.displayId || "No ID"} · {firstTag(product)}</small></span>
                      <b>{formatMoney(product.unitPrice)}</b>
                    </button>
                    {isSelected ? (
                      <div
                        className="proposal-product-choice__selected-panel"
                        role="button"
                        tabIndex={0}
                        aria-label={`Unselect ${product.name}`}
                        onClick={() => toggleProduct(product.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleProduct(product.id);
                          }
                        }}
                      >
                        <span className="proposal-product-choice__selected-copy"><small>✓ Selected</small><strong>{product.name}</strong></span>
                        <label onClick={(event) => event.stopPropagation()}>
                          <span>Qty</span>
                          <input type="number" min="0" step="1" inputMode="numeric" value={selectedProducts[product.id]} onChange={(event) => setProductQuantity(product.id, event.target.value)} onFocus={(event) => { if (event.currentTarget.value === "0") event.currentTarget.select(); }} onClick={(event) => event.stopPropagation()} />
                        </label>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!filteredProducts.length ? <p className="next-proposals-empty-inline">No products match your search.</p> : null}
            </div>
          </>
        ) : null}

        {mode === "kit" ? (
          <div className="proposal-kit-select-field">
            <span className="proposal-kit-select-field__label">Kits *</span>
            <button type="button" className={`proposal-kit-select-trigger ${selectedKitCount ? "has-value" : ""}`} onClick={() => setKitBrowserOpen(true)}>
              <span className="proposal-kit-select-trigger__icon" aria-hidden="true">▣</span>
              <span className="proposal-kit-select-trigger__copy">
                <strong>{selectedKitCount ? `${selectedKitCount} kit${selectedKitCount === 1 ? "" : "s"} selected` : "Select Kits"}</strong>
                <small>{selectedKitCount ? selectedKitNames.slice(0, 3).join(" · ") + (selectedKitCount > 3 ? ` +${selectedKitCount - 3}` : "") : "Browse folders and kits"}</small>
              </span>
              <span className="proposal-kit-select-trigger__arrow" aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}

        {mode !== "product" ? (
          <div className="next-proposals-form-grid products-form-grid proposal-add-items-settings proposal-add-items-settings--kit">
            <ModernSelect
              label="When Product Already Exists"
              value={mergeLogic}
              options={[
                { value: "add", label: "Add quantities", meta: "Add the new quantity to the saved one" },
                { value: "max", label: "Keep maximum", meta: "Keep whichever quantity is higher" },
                { value: "min", label: "Keep minimum", meta: "Keep whichever quantity is lower" },
              ]}
              onChange={setMergeLogic}
            />
          </div>
        ) : (
          <ModernSelect
            label="When Product Already Exists"
            value={mergeLogic}
            options={[
              { value: "add", label: "Add quantities", meta: "Add each selected quantity to the saved one" },
              { value: "max", label: "Keep maximum", meta: "Keep whichever quantity is higher" },
              { value: "min", label: "Keep minimum", meta: "Keep whichever quantity is lower" },
            ]}
            onChange={setMergeLogic}
          />
        )}

        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions proposal-add-items-actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Adding…" : mode === "product" && selectedProductCount > 1 ? `Add ${selectedProductCount} Components` : mode === "kit" && selectedKitCount > 1 ? `Add ${selectedKitCount} Kits` : "Add Components"}</button>
        </div>
      </form>
      {kitBrowserOpen ? <KitBrowserDialog folders={kitFolders} kits={kits} selectedKits={selectedKits} onToggleKit={toggleKit} onQuantityChange={setKitQuantity} onClose={() => setKitBrowserOpen(false)} /> : null}
    </Modal>
  );
}

function ProposalDownloadModal({ columns, onToggleColumn, onDownload, onClose }) {
  return (
    <Modal
      title="Download proposal"
      subtitle="Choose the columns you need, then select the file type."
      icon={<ProposalIcon name="download" size={26} />}
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
            <ProposalIcon name="file" /><span>Download PDF</span>
          </button>
          <button type="button" className="products-btn products-btn--dark" onClick={() => onDownload("excel")}>
            <ProposalIcon name="grid" /><span>Download Excel</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReceiptImagePreviewGrid({ files, busy, onRemove }) {
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const next = (Array.isArray(files) ? files : []).map((file, index) => ({
      file,
      index,
      url: URL.createObjectURL(file),
    }));
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

function SendToStockModal({ proposal, members, busy, onClose, onSubmit }) {
  const stockMembers = useMemo(() => (Array.isArray(members) ? members : []).filter((member) => text(member?.id) && text(member?.name)), [members]);
  const [memberId, setMemberId] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");

  const chooseFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const invalid = incoming.find((file) => !/^image\//i.test(file.type || ""));
    if (invalid) return setError("Receipt uploads must be images.");
    const tooLarge = incoming.find((file) => Number(file.size || 0) > 8 * 1024 * 1024);
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
    if (!files.length) return setError("Upload at least one receipt image.");
    setError("");
    try {
      await onSubmit({ teamMemberId: memberId, files });
    } catch (submitError) {
      setError(submitError?.message || "The proposal could not be sent to Stocktaking.");
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      title="Send to stock"
      subtitle={`Add “${proposal?.name || "Proposal"}” directly to a user's Stocktaking column.`}
      icon={<ProposalIcon name="archive" size={26} />}
      className="proposal-send-stock-modal"
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

        <label className="proposal-receipt-upload-field">
          <span>Receipt images *</span>
          <div className={`proposal-receipt-upload-box ${files.length ? "has-files" : ""}`}>
            <ProposalIcon name="file" size={22} />
            <div><strong>{files.length ? `${files.length} receipt image${files.length === 1 ? "" : "s"} selected` : "Upload receipt images"}</strong><small>JPG, PNG or WEBP · up to 8 MB per image</small></div>
            <b>{busy ? "Uploading…" : "Choose images"}</b>
            <input type="file" accept="image/*" multiple disabled={busy} onChange={(event) => { chooseFiles(event.target.files); event.target.value = ""; }} />
          </div>
          <ReceiptImagePreviewGrid
            files={files}
            busy={busy}
            onRemove={(index) => setFiles((current) => current.filter((_, idx) => idx !== index))}
          />
        </label>

        <div className="proposal-send-stock-note proposal-send-stock-note--access">
          <ProposalIcon name="archive" size={17} />
          <span>If the selected user does not have Stocktaking access, Confirm will grant it automatically. Their existing Users Center Stocktaking column will be reused; if none exists, a <strong>Username + Stock</strong> column will be created.</span>
        </div>
        <div className="proposal-send-stock-note"><strong>Main stock</strong><span>Rows will be added to the selected user's Stocktaking column. If Header/Tag fields exist, Header will be “Main stock” and Tag will use the Proposal kit name.</span></div>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="proposal-send-stock-actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy || !stockMembers.length}><ProposalIcon name="archive" /><span>{busy ? "Sending…" : "Confirm"}</span></button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProposalsClient({
  account,
  initialCatalog,
  initialProposals,
  initialKits,
  initialKitFolders,
  initialMembers,
}) {
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [proposals, setProposals] = useState(() => (Array.isArray(initialProposals?.proposals) ? initialProposals.proposals : []).map(normalizeProposal));
  const [kits, setKits] = useState(() => (Array.isArray(initialKits?.kits) ? initialKits.kits : []).map(normalizeKit));
  const [kitFolders, setKitFolders] = useState(() => (Array.isArray(initialKitFolders?.folders) ? initialKitFolders.folders : []).map(normalizeKitFolder));
  const [members, setMembers] = useState(() => normalizeUsersCenterMembers(initialMembers));
  const [activeDetail, setActiveDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated-desc");
  const [selectedIds, setSelectedIds] = useState([]);
  const [combineLogic, setCombineLogic] = useState("add");
  const [exportColumns, setExportColumns] = useState(() => EXPORT_COLUMNS.map(([key]) => key));
  const [combineTotalQty, setCombineTotalQty] = useState(true);
  const [groupBy, setGroupBy] = useState("component-tag");
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [kitMembership, setKitMembership] = useState(() => new Map());
  const [kitMembershipLoaded, setKitMembershipLoaded] = useState(false);
  const [kitMembershipBusy, setKitMembershipBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const { saveProgress, startSaveProgress, updateSaveProgress, finishSaveProgress } = useSaveProgress();
  const { actionLoading, startActionLoading, finishActionLoading } = useActionLoading();
  const [detailBusy, setDetailBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [addDialog, setAddDialog] = useState(false);
  const [sendToStockOpen, setSendToStockOpen] = useState(false);
  const [folderMenu, setFolderMenu] = useState("");
  const [combineOpen, setCombineOpen] = useState(false);
  const [detailEdit, setDetailEdit] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAdminPassword, setEditAdminPassword] = useState("");
  const [draftErrors, setDraftErrors] = useState({ name: "", items: "" });
  const passwordResolver = useRef(null);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = search;
    input.placeholder = activeDetail ? "Search components, tags, kits, or ID..." : "Search proposals...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.placeholder = "Search";
    };
  }, [activeDetail?.proposal?.id, createMode]);

  useEffect(() => {
    const open = Boolean(activeDetail || detailBusy);
    document.body.classList.toggle("proposal-detail-open", open);
    return () => document.body.classList.remove("proposal-detail-open");
  }, [activeDetail, detailBusy]);

  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".products-proposal-folder")) setFolderMenu("");
      if (!event.target.closest(".proposal-download-menu-wrap") && !event.target.closest(".proposal-download-modal")) setDownloadMenuOpen(false);
      if (!event.target.closest(".proposal-sort-menu-wrap")) setSortMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const tags = useMemo(() => {
    const values = new Set((Array.isArray(initialCatalog?.tagsCatalog) ? initialCatalog.tagsCatalog : []).map(text).filter(Boolean));
    products.forEach((product) => values.add(firstTag(product)));
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [initialCatalog, products]);

  const filteredProposals = useMemo(() => {
    const needle = lower(search);
    const rows = proposals.filter((proposal) => !needle || [proposal.name, proposal.createdBy, proposal.combineNote].some((value) => lower(value).includes(needle)));
    return rows.sort((a, b) => {
      if (sort === "name-asc") return a.name.localeCompare(b.name);
      if (sort === "items-desc") return b.itemsCount - a.itemsCount || a.name.localeCompare(b.name);
      if (sort === "created-desc") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }, [proposals, search, sort]);

  const stats = useMemo(() => ({
    folders: proposals.length,
    components: proposals.reduce((sum, proposal) => sum + proposal.itemsCount, 0),
    owned: proposals.filter((proposal) => proposal.canEdit).length,
    combined: proposals.filter((proposal) => proposal.combinedSources.length > 0).length,
  }), [proposals]);

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
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeDetail, productMap]);

  const visibleEnrichedRows = useMemo(() => {
    const needle = lower(search);
    if (!activeDetail || !needle) return enrichedRows;

    const kitNameById = new Map(kits.map((kit) => [text(kit?.id), text(kit?.name)]));
    return enrichedRows.filter((row) => {
      const sourceKitNames = normalizeSourceKits(row?.sourceKits).flatMap((source) => {
        const localName = kitNameById.get(text(source?.kitId));
        return [source?.kitName, localName].map(text).filter(Boolean);
      });
      const productTags = Array.isArray(row?.product?.tags) ? row.product.tags.map(text).filter(Boolean) : [];
      const searchableValues = [
        row?.name,
        row?.displayId,
        row?.tag,
        ...productTags,
        ...sourceKitNames,
      ];
      return searchableValues.some((value) => lower(value).includes(needle));
    });
  }, [activeDetail, enrichedRows, kits, search]);

  const detailTotals = useMemo(() => enrichedRows.reduce((acc, row) => {
    acc.items += 1;
    acc.quantity += row.quantity;
    if (Number.isFinite(Number(row.totalPrice))) acc.value += Number(row.totalPrice);
    return acc;
  }, { items: 0, quantity: 0, value: 0 }), [enrichedRows]);

  const ensureKitMembership = async () => {
    if (kitMembershipLoaded) return kitMembership;
    if (kitMembershipBusy) return kitMembership;
    setKitMembershipBusy(true);
    try {
      const body = await requestJson(`/next/api/products/kits/membership?_ts=${Date.now()}`);
      const kitById = new Map(kits.map((kit) => [text(kit?.id), kit]));
      const folderById = new Map(kitFolders.map((folder) => [text(folder?.id), folder]));
      const next = new Map();
      (Array.isArray(body?.membership) ? body.membership : []).forEach((entry) => {
        const productId = text(entry?.productId);
        if (!productId) return;
        const memberships = (Array.isArray(entry?.kits) ? entry.kits : [])
          .map((kit) => {
            const id = text(kit?.id);
            const localKit = kitById.get(id) || null;
            const folderId = text(localKit?.folderId);
            const folderName = folderId ? text(folderById.get(folderId)?.name) || "Unfiled Kits" : "Unfiled Kits";
            return {
              id,
              name: text(kit?.name) || text(localKit?.name) || "Untitled kit",
              folderId,
              folderName,
            };
          })
          .filter((kit) => kit.id || kit.name)
          .sort((a, b) => a.folderName.localeCompare(b.folderName) || a.name.localeCompare(b.name));
        next.set(productId, memberships);
      });
      setKitMembership(next);
      setKitMembershipLoaded(true);
      return next;
    } finally {
      setKitMembershipBusy(false);
    }
  };

  const componentGroupedVisibleRows = useMemo(() => {
    const map = new Map();
    for (const row of visibleEnrichedRows) {
      const label = text(row?.tag) || "Uncategorized";
      const key = lower(label);
      if (!map.has(key)) map.set(key, { label, rows: [] });
      map.get(key).rows.push(row);
    }
    return [...map.values()]
      .map((group) => ({ ...group, rows: group.rows.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleEnrichedRows]);

  const kitGroupedVisibleRows = useMemo(() => {
    const foldersMap = new Map();
    const kitById = new Map(kits.map((kit) => [text(kit?.id), kit]));
    const folderById = new Map(kitFolders.map((folder) => [text(folder?.id), folder]));
    const addRow = (membership, row) => {
      const folderName = text(membership?.folderName) || "Unfiled Kits";
      const folderId = text(membership?.folderId);
      const folderKey = `${folderId || "unfiled"}:${lower(folderName)}`;
      if (!foldersMap.has(folderKey)) foldersMap.set(folderKey, { id: folderId, label: folderName, kits: new Map() });
      const folder = foldersMap.get(folderKey);
      const kitId = text(membership?.id || membership?.kitId);
      const kitName = text(membership?.name || membership?.kitName) || "Direct / legacy components";
      const kitKey = `${kitId || "unassigned"}:${lower(kitName)}`;
      if (!folder.kits.has(kitKey)) folder.kits.set(kitKey, { id: kitId, label: kitName, rows: [] });
      const kit = folder.kits.get(kitKey);
      if (!kit.rows.some((existing) => existing.id === row.id)) kit.rows.push(row);
    };

    for (const row of visibleEnrichedRows) {
      const sources = normalizeSourceKits(row?.sourceKits);
      if (!sources.length) {
        addRow({ folderName: "Untracked / Direct", name: "Direct / legacy components" }, row);
        continue;
      }

      sources.forEach((source, sourceIndex) => {
        const sourceQuantity = Math.max(1, Math.round(number(source?.quantity) || 1));
        const rawUnitPrice = row?.unitPrice;
        const unitPrice = Number(rawUnitPrice);
        const hasUnitPrice = rawUnitPrice !== null && rawUnitPrice !== undefined && rawUnitPrice !== "" && Number.isFinite(unitPrice);
        const sourceRow = {
          ...row,
          quantity: sourceQuantity,
          totalPrice: hasUnitPrice ? unitPrice * sourceQuantity : row?.totalPrice,
          _renderKey: `${row.id || row.productId || row.name}::${text(source?.kitId) || `name:${lower(source?.kitName)}`}::${sourceIndex}`,
          _sourceKit: source,
        };
        const localKit = kitById.get(text(source.kitId)) || null;
        const folderId = text(localKit?.folderId);
        const folderName = source.kitId ? (folderId ? (text(folderById.get(folderId)?.name) || "Unfiled Kits") : "Unfiled Kits") : "Untracked / Direct";
        addRow({ id: text(source.kitId), name: text(localKit?.name) || text(source.kitName) || "Direct / legacy components", folderId, folderName }, sourceRow);
      });
    }

    return [...foldersMap.values()]
      .map((folder) => ({
        ...folder,
        kits: [...folder.kits.values()]
          .map((kit) => ({ ...kit, rows: kit.rows.slice().sort((a, b) => a.name.localeCompare(b.name)) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => {
        if (a.id && !b.id) return -1;
        if (!a.id && b.id) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [visibleEnrichedRows, kits, kitFolders]);

  const chooseGroupBy = async (nextMode) => {
    setGroupBy(nextMode);
    setSortMenuOpen(false);
  };

  const notify = (message, type = "success", title = "Proposals") => {
    setToast({ message, type, title });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4500);
  };

  const syncProposal = (proposal) => {
    const normalized = normalizeProposal(proposal);
    setProposals((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      return exists ? current.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current];
    });
    setActiveDetail((current) => current?.proposal?.id === normalized.id ? { ...current, proposal: normalized } : current);
    return normalized;
  };

  const syncDetail = (body) => {
    const proposal = normalizeProposal(body?.proposal || activeDetail?.proposal || {});
    const items = (Array.isArray(body?.items) ? body.items : []).map(normalizeItem);
    setActiveDetail({ proposal, items });
    setEditName(proposal.name || "");
    syncProposal({ ...proposal, itemsCount: items.length });
    return { proposal, items };
  };

  const loadProposal = async (proposalId, options = {}) => {
    setSearch("");
    setCreateMode(false);
    setDetailEdit(Boolean(options.edit));
    if (Object.prototype.hasOwnProperty.call(options, "adminPassword")) setEditAdminPassword(options.adminPassword || "");
    setFolderMenu("");
    setDetailBusy(true);
    try {
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposalId)}?_ts=${Date.now()}`);
      syncDetail(body);
      setDraftErrors({ name: "", items: "" });
    } catch (error) {
      notify(error?.message || "The proposal could not be loaded.", "error");
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshFolders = async () => {
    setBusy(true);
    try {
      const [proposalBody, kitBody, kitFolderBody, memberBody, productBody] = await Promise.all([
        requestJson(`/next/api/products/proposals?_ts=${Date.now()}`),
        requestJson(`/next/api/products/kits?_ts=${Date.now()}`),
        requestJson(`/next/api/products/kit-folders?_ts=${Date.now()}`),
        requestJson(`/api/user-access/team-members?_fresh=1&_ts=${Date.now()}`),
        requestJson(`/next/api/products?_ts=${Date.now()}`),
      ]);
      setProposals((proposalBody.proposals || []).map(normalizeProposal));
      setKits((kitBody.kits || []).map(normalizeKit));
      setKitFolders((kitFolderBody.folders || []).map(normalizeKitFolder));
      setMembers(normalizeUsersCenterMembers(memberBody));
      setProducts((productBody.products || []).map(normalizeProduct));
      if (activeDetail?.proposal?.id) await loadProposal(activeDetail.proposal.id);
      notify("Proposal data has been refreshed.");
    } catch (error) {
      notify(error?.message || "The data could not be refreshed.", "error");
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

  const protectedPassword = async (proposal, message) => {
    if (proposal?.canEdit) return "";
    return await askPassword({ title: "Admin password required", message: message || "This proposal belongs to another user." });
  };

  const backToProposals = () => {
    setSearch("");
    setActiveDetail(null);
    setDetailEdit(false);
    setCreateMode(false);
    setEditName("");
    setEditAdminPassword("");
    setDraftErrors({ name: "", items: "" });
    setAddDialog(false);
    setSendToStockOpen(false);
  };

  const startCreateProposal = async () => {
    setSearch("");
    const adminPassword = await askPassword({
      title: "Create New Proposal",
      message: "Enter the Admin password to create a new proposal.",
    });
    if (adminPassword === null) return;
    const createdBy = text(account?.name || account?.fullName || account?.username || account?.email);
    setCreateMode(true);
    setDetailEdit(true);
    setEditAdminPassword(adminPassword);
    setEditName("");
    setDraftErrors({ name: "", items: "" });
    setActiveDetail({
      proposal: {
        id: "",
        name: "",
        createdBy,
        createdById: text(account?.id || account?.userSupabaseId),
        createdAt: "",
        updatedAt: "",
        itemsCount: 0,
        canEdit: true,
        combinedSources: [],
        combineLogic: "",
        combineNote: "",
        combinedMatrix: [],
      },
      items: [],
    });
  };

  const enterEditProposal = async (proposal) => {
    const adminPassword = await protectedPassword(proposal, `Enter the Admin password to edit “${proposal.name}”.`);
    if (adminPassword === null) return;
    setEditAdminPassword(adminPassword);
    await loadProposal(proposal.id, { edit: true, adminPassword });
  };

  const mergedDraftQuantity = (existingQuantity, incomingQuantity, logic = "add") => {
    const existing = Math.max(1, Math.round(number(existingQuantity) || 1));
    const incoming = Math.max(1, Math.round(number(incomingQuantity) || 1));
    if (logic === "max") return Math.max(existing, incoming);
    if (logic === "min") return Math.min(existing, incoming);
    return existing + incoming;
  };

  const mergeDraftSourceKits = (existingSources, incomingSources, existingQuantity, incomingQuantity, logic = "add") => {
    const existing = normalizeSourceKits(existingSources);
    const incoming = normalizeSourceKits(incomingSources);
    const existingQty = Math.max(1, Math.round(number(existingQuantity) || 1));
    const incomingQty = Math.max(1, Math.round(number(incomingQuantity) || 1));
    if (logic === "max") return incomingQty > existingQty ? incoming : existing;
    if (logic === "min") return incomingQty < existingQty ? incoming : existing;
    if (!incoming.length) return existing;
    const merged = new Map();
    [...existing, ...incoming].forEach((source, index) => {
      const key = text(source.kitId) || `name:${lower(source.kitName)}`;
      const current = merged.get(key);
      if (current) current.quantity += Math.max(1, Math.round(number(source.quantity) || 1));
      else merged.set(key, { ...source, order: Number.isFinite(Number(source.order)) ? Number(source.order) : index });
    });
    return [...merged.values()].sort((a, b) => a.order - b.order);
  };

  const addDraftProducts = (rows, mergeLogic = "add") => {
    setActiveDetail((current) => {
      const items = Array.isArray(current?.items) ? [...current.items] : [];
      rows.forEach((entry) => {
        const productId = text(entry?.productId);
        if (!productId) return;
        const quantity = Math.max(1, Math.round(number(entry?.quantity) || 1));
        const incomingSources = normalizeSourceKits(entry?.sourceKits);
        const effectiveSources = incomingSources.length ? incomingSources : [{ kitId: "", kitName: "Direct components", quantity, order: 0 }];
        const product = productMap.get(productId);
        const existingIndex = items.findIndex((item) => text(item.productId) === productId);
        if (existingIndex >= 0) {
          const existing = items[existingIndex];
          items[existingIndex] = {
            ...existing,
            quantity: mergedDraftQuantity(existing.quantity, quantity, mergeLogic),
            sourceKits: mergeDraftSourceKits(existing.sourceKits, effectiveSources, existing.quantity, quantity, mergeLogic),
            updatedAt: new Date().toISOString(),
          };
        } else {
          items.push(normalizeItem({
            id: `draft-proposal-item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            proposalId: "",
            productId,
            productName: text(entry?.productName || product?.name) || "Untitled product",
            quantity,
            sourceKits: effectiveSources,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, items.length));
        }
      });
      return { ...(current || {}), items };
    });
    setDraftErrors((current) => ({ ...current, items: "" }));
  };

  const saveProposal = async () => {
    const cleanName = text(editName);
    const rows = Array.isArray(activeDetail?.items) ? activeDetail.items : [];
    const errors = {
      name: cleanName ? "" : "Proposal name is required.",
      items: rows.length ? "" : createMode ? "Add at least one component before saving the proposal." : "Add at least one component before saving changes.",
    };
    setDraftErrors(errors);
    if (errors.name || errors.items) return;

    const validRows = rows.filter((row) => row.productId);
    setBusy(true);
    startSaveProgress({
      title: createMode ? "Saving proposal" : "Saving changes",
      message: createMode ? `Preparing ${validRows.length} component${validRows.length === 1 ? "" : "s"}…` : "Updating your proposal…",
    });
    try {
      if (createMode) {
        updateSaveProgress(22, `Preparing ${validRows.length} components for bulk save…`);
        const createdBody = await requestJson("/next/api/products/proposals", {
          method: "POST",
          body: JSON.stringify({
            name: cleanName,
            adminPassword: editAdminPassword,
            items: validRows.map((row) => ({ productId: row.productId, quantity: row.quantity, sourceKits: normalizeSourceKits(row.sourceKits) })),
          }),
        });
        updateSaveProgress(88, "Components saved. Finalizing proposal…");
        const created = normalizeProposal({ ...(createdBody.proposal || {}), canEdit: true, itemsCount: validRows.length });
        if (!created.id) throw new Error("Proposal was created but the proposal ID was not returned.");

        setProposals((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
        updateSaveProgress(97, "Proposal is ready.");
        notify("Proposal saved successfully.");
        await finishSaveProgress("done", "Proposal saved successfully.");
        backToProposals();
        return;
      }

      const proposal = activeDetail?.proposal;
      if (!proposal?.id) throw new Error("Proposal ID is missing.");
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword, itemsCount: rows.length }),
      });
      updateSaveProgress(86, "Applying the latest changes…");
      const updated = normalizeProposal(body.proposal || { ...proposal, name: cleanName });
      setActiveDetail((current) => current ? { ...current, proposal: updated } : current);
      setProposals((current) => current.map((entry) => entry.id === updated.id ? { ...updated, itemsCount: rows.length } : entry));
      setEditName(updated.name);
      setDraftErrors({ name: "", items: "" });
      notify("Changes saved.");
      await finishSaveProgress("done", "Proposal changes saved successfully.");
    } catch (error) {
      const message = error?.message || `Failed to ${createMode ? "create" : "update"} proposal.`;
      await finishSaveProgress("failed", message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const submitNameDialog = async (name) => {
    const dialog = nameDialog;
    if (!dialog) return;
    let adminPassword = "";
    if (dialog.mode === "create") {
      adminPassword = await askPassword({ title: "Create Proposal", message: "Enter the Admin password to create a new proposal folder." });
      if (adminPassword === null) return;
    } else if (dialog.mode === "rename") {
      adminPassword = await protectedPassword(dialog.proposal, "Enter the Admin password to rename a proposal created by another user.");
      if (adminPassword === null) return;
    }
    setBusy(true);
    try {
      if (dialog.mode === "create") {
        const body = await requestJson("/next/api/products/proposals", { method: "POST", body: JSON.stringify({ name, adminPassword }) });
        syncProposal({ ...(body.proposal || {}), canEdit: true });
        notify(`“${name}” was created.`);
      } else if (dialog.mode === "copy") {
        const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(dialog.proposal.id)}/copy`, { method: "POST", body: JSON.stringify({ name }) });
        const copied = syncProposal(body.proposal);
        notify(`A copy named “${name}” was created.`);
        if (copied?.id) {
          setNameDialog(null);
          await loadProposal(copied.id, { edit: true, adminPassword: "" });
          return;
        }
      } else if (dialog.mode === "rename") {
        const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(dialog.proposal.id)}`, { method: "PATCH", body: JSON.stringify({ name, adminPassword }) });
        syncProposal(body.proposal);
        notify("Proposal name updated.");
      } else if (dialog.mode === "combine") {
        const body = await requestJson("/api/products/proposals/combine/save", {
          method: "POST",
          body: JSON.stringify({ name, proposalIds: selectedIds, combineLogic }),
        });
        syncProposal(body.proposal);
        setSelectedIds([]);
        notify("Combined proposal saved.");
      }
      setNameDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const deleteProposal = async (proposal) => {
    const confirmed = await confirmDelete({
      itemName: proposal.name,
      itemType: "proposal",
      title: "Delete proposal?",
      message: `You’re going to permanently delete “${proposal.name}” and all saved components. This action cannot be undone.`,
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;
    const adminPassword = await protectedPassword(proposal, "Enter the Admin password to delete a proposal created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}`, { method: "DELETE", body: JSON.stringify({ adminPassword }) });
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      setSelectedIds((current) => current.filter((id) => id !== proposal.id));
      if (activeDetail?.proposal?.id === proposal.id) setActiveDetail(null);
      notify("Proposal deleted.");
    } catch (error) {
      notify(error?.message || "The proposal could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = async ({ mode, selected, selections = [], quantity, mergeLogic }) => {
    const proposal = activeDetail?.proposal;
    const selectionCount = mode === "product" || mode === "kit" ? selections.length : 1;
    let loadingStarted = false;

    const beginAddLoading = (message) => {
      loadingStarted = true;
      startActionLoading({
        title: mode === "kit" ? "Adding kits" : "Adding components",
        message: message || `Adding ${selectionCount} selection${selectionCount === 1 ? "" : "s"}…`,
      });
    };

    const completeAdd = async (message) => {
      setAddDialog(false);
      await finishActionLoading("done", message);
    };

    try {
      if (createMode) {
        if (mode === "product") {
          const rows = selections.map((entry) => {
            const product = productMap.get(entry.selected);
            if (!product) return null;
            return { productId: product.id, productName: product.name, quantity: Math.max(1, Math.round(number(entry.quantity) || 1)) };
          }).filter(Boolean);
          if (!rows.length) throw new Error("No valid products were selected.");
          beginAddLoading(`Adding ${rows.length} product${rows.length === 1 ? "" : "s"} to the proposal…`);
          addDraftProducts(rows, mergeLogic);
          notify(`${rows.length} product${rows.length === 1 ? "" : "s"} added to proposal draft.`);
          await completeAdd(`${rows.length} product${rows.length === 1 ? "" : "s"} added successfully.`);
          return;
        }
        if (mode === "tag") {
          const rows = products
            .filter((product) => firstTag(product) === selected)
            .map((product) => ({ productId: product.id, productName: product.name, quantity }));
          if (!rows.length) throw new Error("No products were found under this tag.");
          beginAddLoading(`Adding ${rows.length} products to the proposal…`);
          addDraftProducts(rows, mergeLogic);
          notify(`${rows.length} products added from the selected tag.`);
          await completeAdd(`${rows.length} products added successfully.`);
          return;
        }
        if (mode === "kit") {
          if (!selections.length) throw new Error("Choose at least one kit.");
          beginAddLoading(`Loading ${selections.length} kit${selections.length === 1 ? "" : "s"} and adding their components…`);
          const kitRows = [];
          for (const entry of selections) {
            const multiplier = Math.max(1, Math.round(number(entry.quantity) || 1));
            const kitBody = await requestJson(`/next/api/products/kits/${encodeURIComponent(entry.selected)}?_ts=${Date.now()}`);
            const localKit = kits.find((kit) => text(kit?.id) === text(entry.selected)) || null;
            const rows = (Array.isArray(kitBody?.items) ? kitBody.items : []).map(normalizeItem).map((item) => {
              const sourceQuantity = Math.max(1, Math.round(number(item.quantity) || 1)) * multiplier;
              return {
                productId: item.productId,
                productName: item.productName,
                quantity: sourceQuantity,
                sourceKits: [{ kitId: text(entry.selected), kitName: text(localKit?.name) || text(kitBody?.kit?.name) || "Untitled kit", quantity: sourceQuantity }],
              };
            });
            kitRows.push(...rows);
          }
          if (!kitRows.length) throw new Error("The selected kits have no components.");
          addDraftProducts(kitRows, mergeLogic);
          notify(`${selections.length} kit${selections.length === 1 ? "" : "s"} added to the proposal draft.`);
          await completeAdd(`${selections.length} kit${selections.length === 1 ? "" : "s"} added successfully.`);
          return;
        }
      }

      if (!proposal?.id) return;
      if (mode === "product" && !selections.length) throw new Error("Choose at least one product.");
      if (mode === "kit" && !selections.length) throw new Error("Choose at least one kit.");

      const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
      if (adminPassword === null) return;
      if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
      setBusy(true);
      beginAddLoading(mode === "kit"
        ? `Adding ${selections.length} kit${selections.length === 1 ? "" : "s"} to the proposal…`
        : `Adding ${selections.length || 1} component${(selections.length || 1) === 1 ? "" : "s"} to the proposal…`);

      if (mode === "product") {
        let body = null;
        for (const entry of selections) {
          body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items`, {
            method: "POST",
            body: JSON.stringify({
              productId: entry.selected,
              quantity: Math.max(1, Math.round(number(entry.quantity) || 1)),
              mergeLogic,
              adminPassword,
            }),
          });
        }
        const pendingName = editName;
        if (body) syncDetail(body);
        setEditName(pendingName);
        notify(`${selections.length} product${selections.length === 1 ? "" : "s"} added.`);
        await completeAdd(`${selections.length} product${selections.length === 1 ? "" : "s"} added successfully.`);
        return;
      }

      if (mode === "kit") {
        let body = null;
        for (const entry of selections) {
          body = await requestJson(`/api/products/proposals/${encodeURIComponent(proposal.id)}/items/by-kit`, {
            method: "POST",
            body: JSON.stringify({
              kitId: entry.selected,
              quantity: Math.max(1, Math.round(number(entry.quantity) || 1)),
              mergeLogic,
              adminPassword,
            }),
          });
        }
        const pendingName = editName;
        if (body) syncDetail(body);
        setEditName(pendingName);
        notify(`${selections.length} kit${selections.length === 1 ? "" : "s"} added.`);
        await completeAdd(`${selections.length} kit${selections.length === 1 ? "" : "s"} added successfully.`);
        return;
      }

      const endpoint = `/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items`;
      const payload = { productId: selected, quantity, mergeLogic, adminPassword };
      const body = await requestJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
      const pendingName = editName;
      syncDetail(body);
      setEditName(pendingName);
      notify(`${body.addedCount || "Components"} added.`);
      await completeAdd("Components added successfully.");
    } catch (error) {
      if (loadingStarted) await finishActionLoading("failed", error?.message || "The components could not be added.");
      throw error;
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
    const proposal = activeDetail?.proposal;
    const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, adminPassword }),
      });
      syncDetail(body);
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
      message: `Remove “${row.name}” from this proposal? The product itself will stay in the Products catalogue.`,
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
    const proposal = activeDetail?.proposal;
    const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
    setBusy(true);
    try {
      const pendingName = editName;
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      syncDetail(body);
      setEditName(pendingName);
      notify("Component removed.");
    } catch (error) {
      notify(error?.message || "The component could not be removed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const openSendToStock = () => {
    setDownloadMenuOpen(false);
    setSortMenuOpen(false);
    setSendToStockOpen(true);
    requestJson(`/api/user-access/team-members?_fresh=1&_ts=${Date.now()}`)
      .then((body) => setMembers(normalizeUsersCenterMembers(body)))
      .catch((error) => notify(error?.message || "Users Center members could not be refreshed.", "error"));
  };

  const sendToStock = async ({ teamMemberId, files = [] }) => {
    const proposal = activeDetail?.proposal;
    if (!proposal?.id) throw new Error("Proposal ID is missing.");
    setBusy(true);
    startActionLoading({ title: "Sending to stock", message: "Uploading receipt images and adding Stocktaking rows…" });
    try {
      const receipts = [];
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        const uploaded = await requestJson("/next/api/products/proposals/receipt-upload", {
          method: "POST",
          body: JSON.stringify({ dataUrl, filename: file.name || "receipt.jpg" }),
        });
        if (uploaded?.url) receipts.push({ url: uploaded.url, name: uploaded.name || file.name || "Receipt" });
      }
      if (!receipts.length) throw new Error("No receipt images were uploaded.");

      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}/send-to-stock`, {
        method: "POST",
        body: JSON.stringify({ teamMemberId, receipts }),
      });
      const count = Number(body?.count || 0);
      const memberName = text(body?.member?.name) || "the selected user";
      await finishActionLoading("done", `${count} Stocktaking row${count === 1 ? "" : "s"} added to ${memberName}.`);
      setSendToStockOpen(false);
      notify(`Proposal sent to ${memberName} Stocktaking under Main stock.`);
      return body;
    } catch (error) {
      await finishActionLoading("failed", error?.message || "The proposal could not be sent to Stocktaking.");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (proposalId) => {
    setSelectedIds((current) => current.includes(proposalId) ? current.filter((id) => id !== proposalId) : [...current, proposalId]);
  };

  const downloadSingle = (type) => {
    if (!activeDetail?.proposal?.id) return;
    const columns = exportColumns.length ? exportColumns.join(",") : EXPORT_COLUMNS.map(([key]) => key).join(",");
    const params = new URLSearchParams({ columns, groupBy });
    openDownload(`/api/products/proposals/${encodeURIComponent(activeDetail.proposal.id)}/${type}?${params.toString()}`);
    setDownloadMenuOpen(false);
  };

  const downloadCombined = (type) => {
    if (selectedIds.length < 2) return notify("Select at least two proposals.", "error");
    const params = new URLSearchParams({
      proposalIds: selectedIds.join(","),
      logic: combineLogic,
      columns: exportColumns.join(","),
      totalQty: combineTotalQty ? "1" : "0",
      groupBy,
    });
    openDownload(`/api/products/proposals/combine/${type}?${params.toString()}`);
  };

  const toggleExportColumn = (key) => {
    setExportColumns((current) => current.includes(key) ? (current.length === 1 ? current : current.filter((item) => item !== key)) : [...current, key]);
  };

  const renderComponentCard = (row, proposalForCard = activeDetail?.proposal) => {
    const matrixRow = Array.isArray(proposalForCard?.combinedMatrix)
      ? proposalForCard.combinedMatrix.find((entry) => {
          const entryProductId = text(entry?.productId || entry?.product_id);
          if (row.productId && entryProductId && row.productId === entryProductId) return true;
          return lower(entry?.name || entry?.productName || entry?.product_name) === lower(row.name);
        })
      : null;
    const sourceQuantities = proposalForCard?.combineLogic === "separate" && matrixRow?.sourceQuantities && proposalForCard?.combinedSources?.length
      ? proposalForCard.combinedSources.map((source) => ({
          id: text(source?.id),
          name: text(source?.name) || "Proposal",
          quantity: number(matrixRow.sourceQuantities?.[text(source?.id)]),
        }))
      : [];
    return (
      <article className={`kit-component-card proposal-component-card ${detailEdit ? "is-editable" : "is-view"}`} key={row._renderKey || row.id}>
        <header className="kit-component-card__head proposal-component-card__head">
          <div className="kit-component-card__title">
            <span>Component</span>
            <h4>{row.name}</h4>
            {[row.displayId, row.tag, row.unit].filter(Boolean).length ? (
              <small className="proposal-component-card__meta">{[row.displayId, row.tag, row.unit].filter(Boolean).join(" · ")}</small>
            ) : null}
          </div>
        </header>

        {sourceQuantities.length ? (
          <div className="proposal-component-card__sources">
            {sourceQuantities.map((source) => (
              <div key={source.id || source.name}>
                <span>{source.name}</span>
                <strong>{formatNumber(source.quantity)}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <div className="kit-component-card__metrics proposal-component-card__metrics">
          <div className="kit-component-card__metric kit-component-card__metric--qty">
            <span>{sourceQuantities.length ? "Total Qty" : "Qty"}</span>
            {detailEdit ? (
              <input
                className="proposal-item-qty kit-component-card__qty-input"
                type="number"
                min="1"
                step="1"
                defaultValue={row.quantity}
                key={`${row.id}-${row.quantity}`}
                onBlur={(event) => updateQuantity(row, event.target.value)}
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

        <footer className="kit-component-card__actions proposal-component-card__actions">
          {row.product?.url ? (
            <a className="kit-component-card__action kit-component-card__action--link" href={row.product.url} target="_blank" rel="noreferrer" aria-label={`Open product link for ${row.name}`}>
              <span aria-hidden="true">↗</span><span>Open link</span>
            </a>
          ) : (
            <span className="kit-component-card__action kit-component-card__action--disabled" aria-label="No product link">
              <span aria-hidden="true">—</span><span>No link</span>
            </span>
          )}
          {detailEdit ? (
            <button type="button" className="kit-component-card__action kit-component-card__action--remove" onClick={() => removeItem(row)} aria-label={`Remove ${row.name}`}>
              <span aria-hidden="true">×</span><span>Remove</span>
            </button>
          ) : null}
        </footer>
      </article>
    );
  };

  if (activeDetail || detailBusy) {
    const proposal = activeDetail?.proposal;
    return (
      <main className="products-shell proposals-shell next-proposals-classic-parity">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <SaveProgressModal state={saveProgress} />
        <ActionLoadingModal state={actionLoading} />
        {downloadMenuOpen ? (
          <ProposalDownloadModal
            columns={exportColumns}
            onToggleColumn={toggleExportColumn}
            onDownload={downloadSingle}
            onClose={() => setDownloadMenuOpen(false)}
          />
        ) : null}
        {sendToStockOpen && proposal ? (
          <SendToStockModal
            proposal={proposal}
            members={members}
            busy={busy}
            onClose={() => setSendToStockOpen(false)}
            onSubmit={sendToStock}
          />
        ) : null}
        <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
          <section className="proposals-panel">
            <section className={`products-proposal-detail ${createMode ? "is-create" : detailEdit ? "is-edit" : "is-view"}`}>
              {detailBusy && !activeDetail ? (
                <div className="products-loading-card" role="status" aria-live="polite">
                  <div className="products-spinner" aria-hidden="true" />
                  <div><strong>Loading proposal</strong></div>
                </div>
              ) : (
                <>
                  {createMode ? (
                    <header className="products-proposal-detail__head proposal-create-label-head">
                      <div className="proposal-create-title-pill">
                        <button type="button" className="products-back-btn" onClick={backToProposals} aria-label="Back to proposals">←</button>
                        <span>Create New Proposal</span>
                      </div>
                    </header>
                  ) : (
                    <header className="products-proposal-detail__head proposal-detail-head--compact">
                      <button type="button" className="products-back-btn" onClick={backToProposals} aria-label="Back to proposals">←</button>
                      <div className="proposal-detail-actions proposal-detail-actions--classic">
                        <div className="proposal-download-menu-wrap">
                          <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => { setDownloadMenuOpen(true); setSortMenuOpen(false); }}>
                            <ProposalIcon name="download" /><span>Download</span><ProposalIcon name="chevronDown" size={15} />
                          </button>
                        </div>
                        <div className="proposal-sort-menu-wrap">
                          <button type="button" className="products-btn proposal-sort-btn" onClick={() => { setSortMenuOpen((open) => !open); setDownloadMenuOpen(false); }}>
                            <ProposalIcon name="sort" /><span>Sort</span><ProposalIcon name="chevronDown" size={15} />
                          </button>
                          {sortMenuOpen ? (
                            <div className="proposal-sort-menu" role="menu">
                              <button type="button" className={groupBy === "component-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("component-tag")}>
                                <span className="proposal-sort-menu__check">{groupBy === "component-tag" ? "✓" : ""}</span>
                                <span><strong>By components tag</strong><small>Group by the product component tag.</small></span>
                              </button>
                              <button type="button" className={groupBy === "kit-tag" ? "is-active" : ""} onClick={() => chooseGroupBy("kit-tag")} disabled={kitMembershipBusy}>
                                <span className="proposal-sort-menu__check">{groupBy === "kit-tag" ? "✓" : ""}</span>
                                <span><strong>By kits tag</strong><small>Folder → kit → components.</small></span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <button type="button" className="products-btn products-btn--dark proposal-send-stock-btn" onClick={openSendToStock} disabled={!enrichedRows.length}><ProposalIcon name="archive" /><span>Send to stock</span></button>
                      </div>
                    </header>
                  )}

                  {!createMode && !detailEdit ? (
                    <div className="proposal-classic-detail-title">
                      <span className="proposal-create-title-pill"><span>{proposal?.name || "Proposal"}</span></span>
                      <p>Created by {proposal?.createdBy || "Unknown"} · Updated {formatDate(proposal?.updatedAt || proposal?.createdAt)}</p>
                    </div>
                  ) : null}

                  {!createMode && proposal?.combinedSources?.length ? (
                    <div className="proposal-view-note">
                      <span aria-hidden="true">◎</span>
                      <span>{proposal.combineNote || `Combined from ${proposal.combinedSources.map((source) => source.name || source.id).join(", ")} using ${combineLogicLabel(proposal.combineLogic)} logic.`}</span>
                    </div>
                  ) : null}

                  {detailEdit ? (
                    <>
                      <div className={`proposal-name-edit-block proposal-name-edit-block--footer-save ${createMode ? "proposal-name-edit-block--create proposal-name-edit-block--proposal-create" : "proposal-name-edit-block--proposal-edit"}`}>
                        <label className="products-field products-field--wide">
                          <span>Proposal name <em>*</em></span>
                          <input
                            value={editName}
                            onChange={(event) => {
                              setEditName(event.target.value);
                              setDraftErrors((current) => ({ ...current, name: "" }));
                            }}
                            placeholder="Example: School supplies quotation"
                            autoComplete="off"
                          />
                        </label>
                        {draftErrors.name ? <div className="direct-create-inline-error">{draftErrors.name}</div> : null}
                      </div>

                      <div className="products-proposal-tools proposals-one-tool">
                        <div className="products-proposal-tool-card proposal-add-components-tool-card">
                          <button type="button" className="products-proposal-tool-title proposal-add-components-launch" onClick={() => setAddDialog(true)}>
                            <span aria-hidden="true">＋</span><span>Add proposal components</span>
                          </button>
                          {!createMode ? (
                            <div className="proposal-classic-inline-actions proposal-classic-inline-actions--delete-only">
                              <button type="button" className="products-btn next-proposals-classic-danger" onClick={() => deleteProposal(proposal)}>Delete Proposal</button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {draftErrors.items ? <div className="direct-create-inline-error direct-create-inline-error--items">{draftErrors.items}</div> : null}
                    </>
                  ) : (
                    <div className="proposal-view-note"><span aria-hidden="true">◉</span><span>View only. Choose Edit to modify this proposal.</span></div>
                  )}

                  <div className="products-proposal-table-card proposal-components-card">
                    <div className="products-proposal-table-head">
                      <div><h3>Proposal components</h3><p>Saved products and quantities for this proposal.</p></div>
                      <span>{formatNumber(enrichedRows.length)} item{enrichedRows.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="products-proposal-table-wrap proposal-components-wrap">
                      <div className="proposal-components-groups">
                        {groupBy === "kit-tag" ? (
                          kitGroupedVisibleRows.map((folder) => (
                            <section className="proposal-kit-folder-group" key={`${folder.id || "unfiled"}-${folder.label}`}>
                              <div className="proposal-kit-folder-group__head">
                                <div><span>Kit folder</span><strong>{folder.label}</strong></div>
                                <em>{folder.kits.length} kit{folder.kits.length === 1 ? "" : "s"}</em>
                              </div>
                              <div className="proposal-kit-folder-group__body">
                                {folder.kits.map((kit) => (
                                  <div className="proposal-kit-group" key={`${kit.id || "unassigned"}-${kit.label}`}>
                                    <div className="proposal-kit-group__head">
                                      <div><span>Kit</span><strong>{kit.label}</strong></div>
                                      <em>{kit.rows.length} item{kit.rows.length === 1 ? "" : "s"}</em>
                                    </div>
                                    <div className="proposal-components-grid">
                                      {kit.rows.map((row) => renderComponentCard(row, proposal))}
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
                              <div className="proposal-components-grid">
                                {group.rows.map((row) => renderComponentCard(row, proposal))}
                              </div>
                            </section>
                          ))
                        )}
                        {!visibleEnrichedRows.length ? <div className="products-table-empty proposal-components-empty">{enrichedRows.length ? "No components match your search." : <>No components yet. {detailEdit ? "Add a product or saved kit above." : "Choose Edit to add components."}</>}</div> : null}
                      </div>
                    </div>
                    <div className="proposal-total-block">
                      <div><span>Components</span><strong>{formatNumber(detailTotals.items)}</strong></div>
                      <div><span>Total Quantity</span><strong>{formatNumber(detailTotals.quantity)}</strong></div>
                      <div><span>Estimated Total</span><strong>{formatMoney(detailTotals.value)}</strong></div>
                    </div>
                  </div>

                  {detailEdit ? (
                    <div className={`direct-create-save-footer proposal-create-save-footer ${createMode ? "direct-create-save-footer--create" : "direct-create-save-footer--edit"}`}>
                      <button type="button" className="products-btn products-btn--light direct-create-cancel-btn" onClick={backToProposals} disabled={busy}>Cancel</button>
                      <button type="button" className="products-btn products-btn--dark direct-create-save-btn" onClick={saveProposal} disabled={busy}>
                        <span>{busy ? "Saving…" : createMode ? "Save" : "Save Changes"}</span>
                      </button>
                    </div>
                  ) : null}

                </>
              )}
            </section>
          </section>
        </section>

        {addDialog && proposal ? <AddItemsModal proposal={proposal} products={products} kits={kits} kitFolders={kitFolders} tags={tags} busy={busy} onClose={() => setAddDialog(false)} onSubmit={submitAdd} /> : null}

        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.proposal?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  return (
    <main className="products-shell proposals-shell next-proposals-classic-parity">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="proposals-floating-actions">
        <button type="button" className="products-btn products-btn--light proposal-classic-combine-btn" onClick={() => setCombineOpen(true)} disabled={proposals.length < 2}>Combine Proposals</button>
        <button type="button" className="products-add-btn proposals-create-btn" onClick={startCreateProposal}><span aria-hidden="true">＋</span><span>Create New Proposal</span></button>
      </div>


      <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
        <section className="proposals-panel">
          <div className="products-proposals-list">
            {filteredProposals.length ? (
              <div className="products-proposal-folders">
                {filteredProposals.map((proposal) => (
                  <article className="products-proposal-folder" key={proposal.id}>
                    <button type="button" className="proposal-folder-menu-btn" onClick={(event) => { event.stopPropagation(); setFolderMenu((current) => current === proposal.id ? "" : proposal.id); }} aria-label={`Actions for ${proposal.name}`}><span className="proposal-menu-dots" aria-hidden="true">•••</span></button>
                    {folderMenu === proposal.id ? (
                      <div className="proposal-folder-menu" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => enterEditProposal(proposal)}><ProposalIcon name="edit" /><span>Edit</span></button>
                        <button type="button" onClick={() => { setFolderMenu(""); setNameDialog({ mode: "copy", proposal, value: `${proposal.name} Copy` }); }}><ProposalIcon name="copy" /><span>Make a copy</span></button>
                        <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteProposal(proposal); }}><ProposalIcon name="trash" /><span>Delete</span></button>
                      </div>
                    ) : null}
                    <button type="button" className="products-proposal-folder__main" onClick={() => loadProposal(proposal.id)} aria-label={`Open ${proposal.name}`}>
                      <span className="proposal-folder-figure" aria-hidden="true">
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                        <span className="proposal-folder-figure__back" />
                        <span className="proposal-folder-figure__front"><small>Q</small></span>
                      </span>
                      <span className="proposal-folder-copy"><strong>{proposal.name}</strong><em>Created by {proposal.createdBy || "—"}</em></span>
                      <span className="proposal-folder-count"><span aria-hidden="true">▱</span><span>{formatNumber(proposal.itemsCount)} item{proposal.itemsCount === 1 ? "" : "s"}</span></span>
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="products-proposals-empty">Sorry, No data available</div>
            )}
          </div>
        </section>
      </section>

      {combineOpen ? (
        <Modal title="Combine proposals" subtitle="Select two or more proposals, choose the quantity logic, then download or save the result." icon="▦" onClose={() => setCombineOpen(false)} wide className="proposal-combine-modal">
          <div className="proposal-classic-combine-form">
            <ProposalMultiSelect proposals={proposals} selectedIds={selectedIds} onToggle={toggleSelected} />
            <div className="products-field proposal-combine-logic-field">
              <span>Combine logic</span>
              <div className="proposal-combine-logic-grid" role="radiogroup" aria-label="Combine logic">
                {COMBINE_LOGICS.map((option) => {
                  const active = combineLogic === option.value;
                  return (
                    <button
                      type="button"
                      key={option.value}
                      className={`proposal-combine-logic-option ${active ? "is-selected" : ""}`}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setCombineLogic(option.value)}
                    >
                      <span className="proposal-combine-logic-option__check" aria-hidden="true">{active ? "✓" : ""}</span>
                      <span className="proposal-combine-logic-option__copy">
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="proposal-combine-logic-summary">Selected logic: <strong>{combineLogicLabel(combineLogic)}</strong></div>
            </div>
            <div className="products-field proposal-combine-logic-field">
              <span>Group export by</span>
              <div className="proposal-combine-logic-grid" role="radiogroup" aria-label="Group combined export by">
                <button
                  type="button"
                  className={`proposal-combine-logic-option ${groupBy === "component-tag" ? "is-selected" : ""}`}
                  role="radio"
                  aria-checked={groupBy === "component-tag"}
                  onClick={() => setGroupBy("component-tag")}
                >
                  <span className="proposal-combine-logic-option__check" aria-hidden="true">{groupBy === "component-tag" ? "✓" : ""}</span>
                  <span className="proposal-combine-logic-option__copy">
                    <strong>By components tag</strong>
                    <small>Group rows by the product/component tag.</small>
                  </span>
                </button>
                <button
                  type="button"
                  className={`proposal-combine-logic-option ${groupBy === "kit-tag" ? "is-selected" : ""}`}
                  role="radio"
                  aria-checked={groupBy === "kit-tag"}
                  onClick={() => setGroupBy("kit-tag")}
                >
                  <span className="proposal-combine-logic-option__check" aria-hidden="true">{groupBy === "kit-tag" ? "✓" : ""}</span>
                  <span className="proposal-combine-logic-option__copy">
                    <strong>By kits tag</strong>
                    <small>Use Folder → Kit grouping and the Kit column in Excel.</small>
                  </span>
                </button>
              </div>
            </div>
            <div className="proposal-classic-export-columns proposal-classic-export-columns--modal">
              <span>Columns</span>
              {EXPORT_COLUMNS.map(([key, label]) => (
                <label key={key}><input type="checkbox" checked={exportColumns.includes(key)} onChange={() => toggleExportColumn(key)} /><span>{label}</span></label>
              ))}
              <label><input type="checkbox" checked={combineTotalQty} onChange={(event) => setCombineTotalQty(event.target.checked)} /><span>Total Qty</span></label>
            </div>
            <div className="products-modal__actions">
              <button type="button" className="products-btn products-btn--light" onClick={() => setCombineOpen(false)}>Cancel</button>
              <button type="button" className="products-btn products-btn--light" disabled={selectedIds.length < 2} onClick={() => { setCombineOpen(false); setNameDialog({ mode: "combine", value: "" }); }}>Save as new proposal</button>
              <button type="button" className="products-btn products-btn--dark" disabled={selectedIds.length < 2} onClick={() => downloadCombined("pdf")}>Download PDF</button>
              <button type="button" className="products-btn products-btn--dark" disabled={selectedIds.length < 2} onClick={() => downloadCombined("excel")}>Download Excel</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.proposal?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}

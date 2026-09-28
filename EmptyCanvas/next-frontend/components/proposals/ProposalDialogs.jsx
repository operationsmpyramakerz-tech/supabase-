"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["name", "Component"],
  ["quantity", "Quantity"],
  ["unitPrice", "Unit Cost"],
  ["totalPrice", "Total Cost"],
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

function firstTag(product) {
  const tags = Array.isArray(product?.tags) ? product.tags : [];
  return tags.map(text).find(Boolean) || "Uncategorized";
}

function apiErrorMessage(body, fallback) {
  return text(body?.error || body?.message) || fallback;
}

function requestJson(url, options = {}) {
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
  if (!response.ok || body?.ok === false) {
    if (response.status === 413 && !text(body?.error || body?.message)) {
      throw new Error("The upload is still too large for the server. Choose a smaller image and try again.");
    }
    throw new Error(apiErrorMessage(body, "The request failed."));
  }
  return body;
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

export function NameModal({ dialog, busy, onClose, onSubmit }) {
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

export function AddItemsModal({ proposal, products, kits, kitFolders, tags, busy, onClose, onSubmit }) {
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

export function ProposalDownloadModal({ columns, repeatedComponentMode, onRepeatedComponentModeChange, onToggleColumn, onDownload, onClose }) {
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
        <div className="proposal-download-modal__columns proposal-download-modal__repeat">
          <span>Repeated components</span>
          <div>
            <label className={repeatedComponentMode === "merge" ? "is-selected" : ""}>
              <input type="radio" name="proposal-repeated-components" checked={repeatedComponentMode === "merge"} onChange={() => onRepeatedComponentModeChange("merge")} />
              <span><strong>Combine quantities</strong><small>Add matching component quantities into one row.</small></span>
            </label>
            <label className={repeatedComponentMode === "separate" ? "is-selected" : ""}>
              <input type="radio" name="proposal-repeated-components" checked={repeatedComponentMode === "separate"} onChange={() => onRepeatedComponentModeChange("separate")} />
              <span><strong>Keep separate</strong><small>Keep repeated components in their original kit/tag rows.</small></span>
            </label>
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

export function MakeOrderModal({ proposal, members, busy, onClose, onSubmit }) {
  const teamMembers = useMemo(() => (Array.isArray(members) ? members : []).filter((member) => text(member?.id) && text(member?.name)), [members]);
  const [memberId, setMemberId] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!memberId) return setError("Select the team member who will receive this order.");
    if (!text(adminPassword)) return setError("Enter the Admin password.");
    setError("");
    try {
      await onSubmit({ teamMemberId: memberId, adminPassword: text(adminPassword) });
    } catch (submitError) {
      setError(submitError?.message || "The order could not be created.");
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      title="Make order"
      subtitle={`Create a normal Request Products order from all components in “${proposal?.name || "Proposal"}”.`}
      icon={<ProposalIcon name="shoppingBag" size={26} />}
      className="proposal-make-order-modal"
      onClose={close}
    >
      <form className="next-proposals-form products-form-grid proposal-make-order-form" onSubmit={submit}>
        <ModernSelect
          label="Team Member *"
          value={memberId}
          placeholder={teamMembers.length ? "Select team member" : "No team members available"}
          searchable
          options={teamMembers.map((member) => ({
            value: member.id,
            label: member.name,
            meta: [text(member.department), text(member.position)].filter(Boolean).join(" · "),
          }))}
          onChange={(value) => { setMemberId(value); setError(""); }}
          disabled={busy}
        />

        <label>
          <span>Admin Password *</span>
          <input
            type="password"
            autoComplete="current-password"
            value={adminPassword}
            onChange={(event) => { setAdminPassword(event.target.value); setError(""); }}
            placeholder="Enter Admin password"
            disabled={busy}
          />
        </label>

        <div className="proposal-make-order-note">
          <ProposalIcon name="shoppingBag" size={18} />
          <span>The proposal components will be created as a normal <strong>Request Products</strong> order for the selected user and will continue through the standard order process.</span>
        </div>

        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={close} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy || !teamMembers.length}>
            <ProposalIcon name="shoppingBag" /><span>{busy ? "Creating…" : "Create Order"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}


"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    itemsCount: number(kit?.itemsCount),
  };
}

function normalizeItem(item, index = 0) {
  return {
    id: text(item?.id) || `item-${index}`,
    proposalId: text(item?.proposalId),
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

function Modal({ title, subtitle, icon = "◆", children, footer, onClose, wide = false }) {
  return (
    <div className="products-modal-overlay next-proposals-classic-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`products-modal products-proposal-modal ${wide ? "next-proposals-classic-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
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
                  <span className="proposal-combine-multi__copy"><strong>{proposal.name}</strong><small>{formatNumber(proposal.itemsCount)} component{proposal.itemsCount === 1 ? "" : "s"}{proposal.createdBy ? ` · ${proposal.createdBy}` : ""}</small></span>
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

function AddItemsModal({ proposal, products, kits, tags, busy, onClose, onSubmit }) {
  const [mode, setMode] = useState("product");
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [mergeLogic, setMergeLogic] = useState("add");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const filteredProducts = useMemo(() => products.filter((product) => {
    const needle = lower(search);
    if (!needle) return true;
    return [product.name, product.displayId, product.unit, firstTag(product)].some((value) => lower(value).includes(needle));
  }).slice(0, 80), [products, search]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return setError(`Choose a ${mode}.`);
    setError("");
    try {
      await onSubmit({ mode, selected, quantity: Math.max(1, Math.round(number(quantity) || 1)), mergeLogic });
    } catch (submitError) {
      setError(submitError?.message || "The components could not be added.");
    }
  };

  return (
    <Modal title={`Add Components to ${proposal.name || "New Proposal"}`} subtitle="Add one product, a complete product tag, or a reusable kit." icon="＋" onClose={onClose} wide>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <div className="next-proposals-segmented">
          {[["product", "Single Product"], ["tag", "Product Tag"], ["kit", "Kit"]].map(([value, label]) => (
            <button type="button" key={value} className={mode === value ? "active" : ""} onClick={() => { setMode(value); setSelected(""); }}>{label}</button>
          ))}
        </div>

        {mode === "product" ? (
          <>
            <label><span>Search Catalogue</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name, code, tag or unit" /></label>
            <div className="next-proposals-product-picker">
              {filteredProducts.map((product) => (
                <button type="button" key={product.id} className={selected === product.id ? "active" : ""} onClick={() => setSelected(product.id)}>
                  <span>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : "▧"}</span>
                  <div><strong>{product.name}</strong><small>{product.displayId || "No ID"} · {firstTag(product)}</small></div>
                  <b>{formatMoney(product.unitPrice)}</b>
                </button>
              ))}
              {!filteredProducts.length ? <p className="next-proposals-empty-inline">No products match your search.</p> : null}
            </div>
          </>
        ) : null}

        {mode === "tag" ? (
          <ModernSelect
            label="Product Tag *"
            value={selected}
            placeholder="Choose a tag"
            searchable
            options={tags.map((tag) => ({ value: tag, label: tag }))}
            onChange={setSelected}
          />
        ) : null}

        {mode === "kit" ? (
          <ModernSelect
            label="Kit *"
            value={selected}
            placeholder="Choose a kit"
            searchable
            options={kits.map((kit) => ({ value: kit.id, label: kit.name, meta: `${formatNumber(kit.itemsCount)} item${kit.itemsCount === 1 ? "" : "s"}` }))}
            onChange={setSelected}
          />
        ) : null}

        <div className="next-proposals-form-grid products-form-grid">
          <label><span>{mode === "kit" ? "Kit Multiplier" : "Quantity"}</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
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

        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Adding…" : "Add Components"}</button>
        </div>
      </form>
    </Modal>
  );
}

function MakeOrderModal({ proposal, members, busy, onClose, onSubmit }) {
  const [memberId, setMemberId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!memberId) return setError("Choose a team member.");
    if (!text(password)) return setError("Admin password is required.");
    setError("");
    try {
      await onSubmit({ teamMemberId: memberId, adminPassword: text(password) });
    } catch (submitError) {
      setError(submitError?.message || "The order could not be created.");
    }
  };

  return (
    <Modal title="Make Order" subtitle={`Create a Request Products order from all components in “${proposal.name}”.`} icon="▤" onClose={onClose}>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <ModernSelect
          label="Team Member *"
          value={memberId}
          placeholder="Select team member"
          searchable
          options={members.map((member) => ({ value: member.id, label: member.name, meta: member.department || "Team member" }))}
          onChange={setMemberId}
        />
        <label><span>Admin Password *</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="next-proposals-error products-form-error">{error}</div> : null}
        <div className="next-proposals-form__actions products-modal__actions">
          <button type="button" className="products-btn products-btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="products-btn products-btn--dark" disabled={busy}>{busy ? "Creating…" : "Create Order"}</button>
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
  initialMembers,
}) {
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [proposals, setProposals] = useState(() => (Array.isArray(initialProposals?.proposals) ? initialProposals.proposals : []).map(normalizeProposal));
  const [kits, setKits] = useState(() => (Array.isArray(initialKits?.kits) ? initialKits.kits : []).map(normalizeKit));
  const [members, setMembers] = useState(() => Array.isArray(initialMembers?.members) ? initialMembers.members : []);
  const [activeDetail, setActiveDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated-desc");
  const [selectedIds, setSelectedIds] = useState([]);
  const [combineLogic, setCombineLogic] = useState("add");
  const [exportColumns, setExportColumns] = useState(() => EXPORT_COLUMNS.map(([key]) => key));
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [addDialog, setAddDialog] = useState(false);
  const [orderDialog, setOrderDialog] = useState(false);
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
    input.value = "";
    input.placeholder = "Search proposals...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, []);

  useEffect(() => {
    const open = Boolean(activeDetail || detailBusy);
    document.body.classList.toggle("proposal-detail-open", open);
    return () => document.body.classList.remove("proposal-detail-open");
  }, [activeDetail, detailBusy]);

  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest(".products-proposal-folder")) setFolderMenu("");
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

  const detailTotals = useMemo(() => enrichedRows.reduce((acc, row) => {
    acc.items += 1;
    acc.quantity += row.quantity;
    if (Number.isFinite(Number(row.totalPrice))) acc.value += Number(row.totalPrice);
    return acc;
  }, { items: 0, quantity: 0, value: 0 }), [enrichedRows]);

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
      const [proposalBody, kitBody, memberBody, productBody] = await Promise.all([
        requestJson(`/next/api/products/proposals?_ts=${Date.now()}`),
        requestJson(`/next/api/products/kits?_ts=${Date.now()}`),
        requestJson(`/api/products/proposals/team-members?_ts=${Date.now()}`),
        requestJson(`/next/api/products?_ts=${Date.now()}`),
      ]);
      setProposals((proposalBody.proposals || []).map(normalizeProposal));
      setKits((kitBody.kits || []).map(normalizeKit));
      setMembers(Array.isArray(memberBody.members) ? memberBody.members : []);
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
    setActiveDetail(null);
    setDetailEdit(false);
    setCreateMode(false);
    setEditName("");
    setEditAdminPassword("");
    setDraftErrors({ name: "", items: "" });
    setAddDialog(false);
    setOrderDialog(false);
  };

  const startCreateProposal = async () => {
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

  const addDraftProducts = (rows, mergeLogic = "add") => {
    setActiveDetail((current) => {
      const items = Array.isArray(current?.items) ? [...current.items] : [];
      rows.forEach((entry) => {
        const productId = text(entry?.productId);
        if (!productId) return;
        const quantity = Math.max(1, Math.round(number(entry?.quantity) || 1));
        const product = productMap.get(productId);
        const existingIndex = items.findIndex((item) => text(item.productId) === productId);
        if (existingIndex >= 0) {
          const existing = items[existingIndex];
          items[existingIndex] = {
            ...existing,
            quantity: mergedDraftQuantity(existing.quantity, quantity, mergeLogic),
            updatedAt: new Date().toISOString(),
          };
        } else {
          items.push(normalizeItem({
            id: `draft-proposal-item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            proposalId: "",
            productId,
            productName: text(entry?.productName || product?.name) || "Untitled product",
            quantity,
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

    setBusy(true);
    try {
      if (createMode) {
        const createdBody = await requestJson("/next/api/products/proposals", {
          method: "POST",
          body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword }),
        });
        const created = normalizeProposal({ ...(createdBody.proposal || {}), canEdit: true });
        if (!created.id) throw new Error("Proposal was created but the proposal ID was not returned.");
        for (const row of rows) {
          if (!row.productId) continue;
          await requestJson(`/next/api/products/proposals/${encodeURIComponent(created.id)}/items`, {
            method: "POST",
            body: JSON.stringify({
              productId: row.productId,
              quantity: row.quantity,
              mergeLogic: "add",
              adminPassword: editAdminPassword,
            }),
          });
        }
        await refreshFolders();
        backToProposals();
        notify("Proposal saved successfully.");
        return;
      }

      const proposal = activeDetail?.proposal;
      if (!proposal?.id) return;
      const body = await requestJson(`/next/api/products/proposals/${encodeURIComponent(proposal.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName, adminPassword: editAdminPassword }),
      });
      const updated = normalizeProposal(body.proposal || { ...proposal, name: cleanName });
      setActiveDetail((current) => current ? { ...current, proposal: updated } : current);
      setProposals((current) => current.map((entry) => entry.id === updated.id ? { ...updated, itemsCount: rows.length } : entry));
      setEditName(updated.name);
      setDraftErrors({ name: "", items: "" });
      notify("Changes saved.");
    } catch (error) {
      notify(error?.message || `Failed to ${createMode ? "create" : "update"} proposal.`, "error");
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

  const submitAdd = async ({ mode, selected, quantity, mergeLogic }) => {
    const proposal = activeDetail?.proposal;
    if (createMode) {
      if (mode === "product") {
        const product = productMap.get(selected);
        if (!product) throw new Error("Product not found.");
        addDraftProducts([{ productId: product.id, productName: product.name, quantity }], mergeLogic);
        setAddDialog(false);
        notify("Product added to proposal draft.");
        return;
      }
      if (mode === "tag") {
        const rows = products
          .filter((product) => firstTag(product) === selected)
          .map((product) => ({ productId: product.id, productName: product.name, quantity }));
        if (!rows.length) throw new Error("No products were found under this tag.");
        addDraftProducts(rows, mergeLogic);
        setAddDialog(false);
        notify(`${rows.length} products added from the selected tag.`);
        return;
      }
      if (mode === "kit") {
        const kitBody = await requestJson(`/next/api/products/kits/${encodeURIComponent(selected)}?_ts=${Date.now()}`);
        const kitRows = (Array.isArray(kitBody?.items) ? kitBody.items : []).map(normalizeItem).map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: Math.max(1, Math.round(number(item.quantity) || 1)) * Math.max(1, Math.round(number(quantity) || 1)),
        }));
        if (!kitRows.length) throw new Error("The selected kit has no components.");
        addDraftProducts(kitRows, mergeLogic);
        setAddDialog(false);
        notify(`${kitRows.length} kit components added to the proposal draft.`);
        return;
      }
    }

    if (!proposal?.id) return;
    const adminPassword = editAdminPassword || await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    if (adminPassword && !editAdminPassword) setEditAdminPassword(adminPassword);
    setBusy(true);
    try {
      let endpoint = `/next/api/products/proposals/${encodeURIComponent(proposal.id)}/items`;
      let payload = { productId: selected, quantity, mergeLogic, adminPassword };
      if (mode === "tag") {
        endpoint = `/api/products/proposals/${encodeURIComponent(proposal.id)}/items/by-tag`;
        payload = { tag: selected, quantity, mergeLogic, adminPassword };
      } else if (mode === "kit") {
        endpoint = `/api/products/proposals/${encodeURIComponent(proposal.id)}/items/by-kit`;
        payload = { kitId: selected, quantity, mergeLogic, adminPassword };
      }
      const body = await requestJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
      const pendingName = editName;
      syncDetail(body);
      setEditName(pendingName);
      setAddDialog(false);
      notify(mode === "product" ? "Product added." : mode === "tag" ? `${body.addedCount || "Products"} added from the selected tag.` : `${body.addedCount || "Kit components"} added.`);
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

  const makeOrder = async (payload) => {
    const proposal = activeDetail?.proposal;
    setBusy(true);
    try {
      const body = await requestJson(`/api/products/proposals/${encodeURIComponent(proposal.id)}/make-order`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setOrderDialog(false);
      notify(`Order ${body.orderId || body.orderNumber || ""} was created with ${body.count || enrichedRows.length} components.`);
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
    openDownload(`/api/products/proposals/${encodeURIComponent(activeDetail.proposal.id)}/${type}?columns=${encodeURIComponent(columns)}`);
  };

  const downloadCombined = (type) => {
    if (selectedIds.length < 2) return notify("Select at least two proposals.", "error");
    const params = new URLSearchParams({
      proposalIds: selectedIds.join(","),
      logic: combineLogic,
      columns: exportColumns.join(","),
    });
    openDownload(`/api/products/proposals/combine/${type}?${params.toString()}`);
  };

  const toggleExportColumn = (key) => {
    setExportColumns((current) => current.includes(key) ? (current.length === 1 ? current : current.filter((item) => item !== key)) : [...current, key]);
  };

  if (activeDetail || detailBusy) {
    const proposal = activeDetail?.proposal;
    return (
      <main className="products-shell proposals-shell next-proposals-classic-parity">
        <Toast toast={toast} onClose={() => setToast(null)} />
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
                      <div className="proposal-detail-actions">
                        <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => downloadSingle("pdf")}>PDF</button>
                        <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => downloadSingle("excel")}>Excel</button>
                        <button type="button" className="products-btn products-btn--dark proposal-make-order-btn" onClick={() => setOrderDialog(true)} disabled={!enrichedRows.length}>Make Order</button>
                        {!detailEdit ? <button type="button" className="products-btn products-btn--light" onClick={() => enterEditProposal(proposal)}>Edit</button> : null}
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
                        <div className="products-proposal-tool-card">
                          <div className="products-proposal-tool-title"><span aria-hidden="true">＋</span><span>Add proposal components</span></div>
                          <div className="proposal-classic-inline-actions">
                            <button type="button" className="products-btn products-btn--dark" onClick={() => setAddDialog(true)}>Add product, tag or kit</button>
                            {!createMode ? <button type="button" className="products-btn next-proposals-classic-danger" onClick={() => deleteProposal(proposal)}>Delete Proposal</button> : null}
                          </div>
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
                      <div className="proposal-components-grid">
                        {enrichedRows.map((row) => {
                          const matrixRow = Array.isArray(proposal?.combinedMatrix)
                            ? proposal.combinedMatrix.find((entry) => {
                                const entryProductId = text(entry?.productId || entry?.product_id);
                                if (row.productId && entryProductId && row.productId === entryProductId) return true;
                                return lower(entry?.name || entry?.productName || entry?.product_name) === lower(row.name);
                              })
                            : null;
                          const sourceQuantities = proposal?.combineLogic === "separate" && matrixRow?.sourceQuantities && proposal?.combinedSources?.length
                            ? proposal.combinedSources.map((source) => ({
                                id: text(source?.id),
                                name: text(source?.name) || "Proposal",
                                quantity: number(matrixRow.sourceQuantities?.[text(source?.id)]),
                              }))
                            : [];
                          return (
                            <article className={`kit-component-card proposal-component-card ${detailEdit ? "is-editable" : "is-view"}`} key={row.id}>
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
                        })}
                        {!enrichedRows.length ? <div className="products-table-empty proposal-components-empty">No components yet. {detailEdit ? "Add one component, tag or saved kit above." : "Choose Edit to add components."}</div> : null}
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

                  {!detailEdit ? (
                    <div className="proposal-classic-export-columns">
                      <span>Download columns</span>
                      {EXPORT_COLUMNS.map(([key, label]) => (
                        <label key={key}><input type="checkbox" checked={exportColumns.includes(key)} onChange={() => toggleExportColumn(key)} /><span>{label}</span></label>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </section>
        </section>

        {addDialog && proposal ? <AddItemsModal proposal={proposal} products={products} kits={kits} tags={tags} busy={busy} onClose={() => setAddDialog(false)} onSubmit={submitAdd} /> : null}
        {orderDialog && proposal ? <MakeOrderModal proposal={proposal} members={members} busy={busy} onClose={() => setOrderDialog(false)} onSubmit={makeOrder} /> : null}
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
                        <button type="button" onClick={() => enterEditProposal(proposal)}><span>Edit</span></button>
                        <button type="button" onClick={() => { setFolderMenu(""); setNameDialog({ mode: "copy", proposal, value: `${proposal.name} Copy` }); }}><span>Make a copy</span></button>
                        <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteProposal(proposal); }}><span>Delete</span></button>
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
                      <span className="proposal-folder-count"><span aria-hidden="true">▱</span><span>{formatNumber(proposal.itemsCount)} component{proposal.itemsCount === 1 ? "" : "s"}</span></span>
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
        <Modal title="Combine proposals" subtitle="Select two or more proposals, choose the quantity logic, then download or save the result." icon="▦" onClose={() => setCombineOpen(false)} wide>
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
            <div className="proposal-classic-export-columns proposal-classic-export-columns--modal">
              <span>Columns</span>
              {EXPORT_COLUMNS.map(([key, label]) => (
                <label key={key}><input type="checkbox" checked={exportColumns.includes(key)} onChange={() => toggleExportColumn(key)} /><span>{label}</span></label>
              ))}
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

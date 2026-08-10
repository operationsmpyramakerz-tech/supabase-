"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["name", "Component"],
  ["quantity", "Quantity"],
  ["unitPrice", "Unit Cost"],
  ["totalPrice", "Total Cost"],
];

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
    <Modal title={`Add Components to ${proposal.name}`} subtitle="Add one product, a complete product tag, or a reusable kit." icon="＋" onClose={onClose} wide>
      <form className="next-proposals-form products-form-grid" onSubmit={submit}>
        <div className="next-proposals-segmented">
          {[['product', 'Single Product'], ['tag', 'Product Tag'], ['kit', 'Kit']].map(([value, label]) => (
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
          <label><span>Product Tag *</span><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a tag</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
        ) : null}

        {mode === "kit" ? (
          <label><span>Kit *</span><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a kit</option>{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name} ({kit.itemsCount} items)</option>)}</select></label>
        ) : null}

        <div className="next-proposals-form-grid products-form-grid">
          <label><span>{mode === "kit" ? "Kit Multiplier" : "Quantity"}</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label><span>When Product Already Exists</span><select value={mergeLogic} onChange={(event) => setMergeLogic(event.target.value)}><option value="add">Add quantities</option><option value="max">Keep maximum</option><option value="min">Keep minimum</option></select></label>
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
        <label><span>Team Member *</span><select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Select team member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}{member.department ? ` · ${member.department}` : ""}</option>)}</select></label>
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
  bootstrapWarnings = [],
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
      const next = exists ? current.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...current];
      return next;
    });
    setActiveDetail((current) => current?.proposal?.id === normalized.id ? { ...current, proposal: normalized } : current);
    return normalized;
  };

  const syncDetail = (body) => {
    const proposal = normalizeProposal(body?.proposal || activeDetail?.proposal || {});
    const items = (Array.isArray(body?.items) ? body.items : []).map(normalizeItem);
    setActiveDetail({ proposal, items });
    syncProposal({ ...proposal, itemsCount: items.length });
  };

  const loadProposal = async (proposalId, options = {}) => {
    setDetailEdit(Boolean(options.edit));
    setFolderMenu("");
    setDetailBusy(true);
    try {
      const body = await requestJson(`/api/products/proposals/${encodeURIComponent(proposalId)}?_ts=${Date.now()}`);
      syncDetail(body);
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
        requestJson(`/api/products/proposals?_ts=${Date.now()}`),
        requestJson(`/api/products/kits?_ts=${Date.now()}`),
        requestJson(`/api/products/proposals/team-members?_ts=${Date.now()}`),
        requestJson(`/api/products?_ts=${Date.now()}`),
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
        const body = await requestJson("/api/products/proposals", { method: "POST", body: JSON.stringify({ name, adminPassword }) });
        syncProposal({ ...(body.proposal || {}), canEdit: true });
        notify(`“${name}” was created.`);
      } else if (dialog.mode === "copy") {
        const body = await requestJson(`/api/products/proposals/${encodeURIComponent(dialog.proposal.id)}/copy`, { method: "POST", body: JSON.stringify({ name }) });
        syncProposal(body.proposal);
        notify(`A copy named “${name}” was created.`);
      } else if (dialog.mode === "rename") {
        const body = await requestJson(`/api/products/proposals/${encodeURIComponent(dialog.proposal.id)}`, { method: "PATCH", body: JSON.stringify({ name, adminPassword }) });
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
    if (!window.confirm(`Delete “${proposal.name}” and all saved components? This action cannot be undone.`)) return;
    const adminPassword = await protectedPassword(proposal, "Enter the Admin password to delete a proposal created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      await requestJson(`/api/products/proposals/${encodeURIComponent(proposal.id)}`, { method: "DELETE", body: JSON.stringify({ adminPassword }) });
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
    if (!proposal?.id) return;
    const adminPassword = await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      let endpoint = `/api/products/proposals/${encodeURIComponent(proposal.id)}/items`;
      let payload = { productId: selected, quantity, mergeLogic, adminPassword };
      if (mode === "tag") {
        endpoint += "/by-tag";
        payload = { tag: selected, quantity, mergeLogic, adminPassword };
      } else if (mode === "kit") {
        endpoint += "/by-kit";
        payload = { kitId: selected, quantity, mergeLogic, adminPassword };
      }
      const body = await requestJson(endpoint, { method: "POST", body: JSON.stringify(payload) });
      syncDetail(body);
      setAddDialog(false);
      notify(mode === "product" ? "Product added." : mode === "tag" ? `${body.addedCount || "Products"} added from the selected tag.` : `${body.addedCount || "Kit components"} added.`);
    } finally {
      setBusy(false);
    }
  };

  const updateQuantity = async (row, value) => {
    const quantity = Math.max(1, Math.round(number(value) || 1));
    if (quantity === row.quantity) return;
    const proposal = activeDetail?.proposal;
    const adminPassword = await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      const body = await requestJson(`/api/products/proposals/${encodeURIComponent(proposal.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, adminPassword }),
      });
      syncDetail(body);
      notify("Quantity updated.");
    } catch (error) {
      notify(error?.message || "The quantity could not be updated.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (row) => {
    if (!window.confirm(`Remove “${row.name}” from this proposal?`)) return;
    const proposal = activeDetail?.proposal;
    const adminPassword = await protectedPassword(proposal, "Enter the Admin password to modify a proposal created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      const body = await requestJson(`/api/products/proposals/${encodeURIComponent(proposal.id)}/items/${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword }),
      });
      syncDetail(body);
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
            <section className="products-proposal-detail">
              {detailBusy && !activeDetail ? (
                <div className="products-loading-card" role="status" aria-live="polite">
                  <div className="products-spinner" aria-hidden="true" />
                  <div><strong>Loading proposal</strong></div>
                </div>
              ) : (
                <>
                  <header className="products-proposal-detail__head proposal-detail-head--compact">
                    <button type="button" className="products-back-btn" onClick={() => { setActiveDetail(null); setDetailEdit(false); }} aria-label="Back to proposals">←</button>
                    <div className="proposal-detail-actions">
                      {detailEdit ? (
                        <>
                          <button type="button" className="products-btn products-btn--dark" onClick={() => setAddDialog(true)}>＋ <span>Add Components</span></button>
                          <button type="button" className="products-btn products-btn--light" onClick={() => setNameDialog({ mode: "rename", proposal, value: proposal?.name || "" })}>Rename</button>
                          <button type="button" className="products-btn products-btn--light" onClick={() => setDetailEdit(false)}>Done</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => downloadSingle("pdf")}>PDF</button>
                          <button type="button" className="btn b2b-download-primary proposal-download-btn" onClick={() => downloadSingle("excel")}>Excel</button>
                          <button type="button" className="products-btn products-btn--dark proposal-make-order-btn" onClick={() => setOrderDialog(true)} disabled={!enrichedRows.length}>Make Order</button>
                          <button type="button" className="products-btn products-btn--light" onClick={() => setDetailEdit(true)}>Edit</button>
                        </>
                      )}
                    </div>
                  </header>

                  <div className="proposal-classic-detail-title">
                    <span className="proposal-create-title-pill"><span>{proposal?.name || "Proposal"}</span></span>
                    <p>Created by {proposal?.createdBy || "Unknown"} · Updated {formatDate(proposal?.updatedAt || proposal?.createdAt)}</p>
                  </div>

                  {proposal?.combinedSources?.length ? (
                    <div className="proposal-view-note">
                      <span aria-hidden="true">◎</span>
                      <span>{proposal.combineNote || `Combined from ${proposal.combinedSources.map((source) => source.name || source.id).join(", ")}`}</span>
                    </div>
                  ) : null}

                  {detailEdit ? (
                    <div className="products-proposal-tools proposals-one-tool">
                      <div className="products-proposal-tool-card">
                        <div className="products-proposal-tool-title"><span aria-hidden="true">＋</span><span>Edit proposal components</span></div>
                        <div className="proposal-classic-inline-actions">
                          <button type="button" className="products-btn products-btn--dark" onClick={() => setAddDialog(true)}>Add product, tag or kit</button>
                          <button type="button" className="products-btn products-btn--light" onClick={() => loadProposal(proposal.id, { edit: true })} disabled={detailBusy}>{detailBusy ? "Refreshing…" : "Refresh"}</button>
                          <button type="button" className="products-btn next-proposals-classic-danger" onClick={() => deleteProposal(proposal)}>Delete Proposal</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="proposal-view-note"><span aria-hidden="true">◉</span><span>View only. Choose Edit to modify this proposal.</span></div>
                  )}

                  <div className="products-proposal-table-card">
                    <div className="products-proposal-table-head">
                      <div><h3>Components table</h3><p>Saved products and quantities for this proposal.</p></div>
                      <span>{formatNumber(enrichedRows.length)} item{enrichedRows.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="products-proposal-table-wrap">
                      <table className="products-proposal-table">
                        <thead><tr><th>Component name</th><th>Quantity</th><th>Unity Price</th><th>Total Price</th><th>Link</th><th /></tr></thead>
                        <tbody>
                          {enrichedRows.map((row) => (
                            <tr key={row.id}>
                              <td className="proposal-component-name">
                                <strong>{row.name}</strong>
                                <small className="proposal-classic-component-meta">{[row.displayId, row.tag, row.unit].filter(Boolean).join(" · ")}</small>
                              </td>
                              <td>{detailEdit ? <input className="proposal-item-qty" type="number" min="1" step="1" defaultValue={row.quantity} key={`${row.id}-${row.quantity}`} onBlur={(event) => updateQuantity(row, event.target.value)} /> : <strong>{formatNumber(row.quantity)}</strong>}</td>
                              <td className="proposal-price-cell">{formatMoney(row.unitPrice)}</td>
                              <td className="proposal-price-cell proposal-price-cell--total">{formatMoney(row.totalPrice)}</td>
                              <td className="proposal-link-cell">{row.product?.url ? <a className="proposal-product-link" href={row.product.url} target="_blank" rel="noreferrer">Open ↗</a> : "—"}</td>
                              <td><div className="proposal-row-actions">{detailEdit ? <button type="button" className="proposal-row-delete proposal-row-delete--icon" onClick={() => removeItem(row)} aria-label={`Delete ${row.name}`}>×</button> : null}</div></td>
                            </tr>
                          ))}
                          {!enrichedRows.length ? <tr><td colSpan="6"><div className="products-table-empty">No components yet. {detailEdit ? "Add one component, tag or saved kit above." : "Choose Edit to add components."}</div></td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="proposal-total-block">
                      <div><span>Components</span><strong>{formatNumber(detailTotals.items)}</strong></div>
                      <div><span>Total Quantity</span><strong>{formatNumber(detailTotals.quantity)}</strong></div>
                      <div><span>Estimated Total</span><strong>{formatMoney(detailTotals.value)}</strong></div>
                    </div>
                  </div>

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
        <button type="button" className="products-add-btn proposals-create-btn" onClick={() => setNameDialog({ mode: "create", value: "" })}><span aria-hidden="true">＋</span><span>Create New Proposal</span></button>
      </div>

      {bootstrapWarnings.length ? <div className="proposal-view-note"><span aria-hidden="true">!</span><span>Some startup resources were delayed. The page remains usable; refresh if a folder is missing.</span></div> : null}

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
                        <button type="button" onClick={() => loadProposal(proposal.id, { edit: true })}><span>Edit</span></button>
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
            <div className="proposal-classic-combine-list">
              {proposals.map((proposal) => (
                <label key={proposal.id} className="proposal-classic-check-row">
                  <input type="checkbox" checked={selectedIds.includes(proposal.id)} onChange={() => toggleSelected(proposal.id)} />
                  <span><strong>{proposal.name}</strong><small>{formatNumber(proposal.itemsCount)} component{proposal.itemsCount === 1 ? "" : "s"}</small></span>
                </label>
              ))}
            </div>
            <label className="products-field"><span>Combine logic</span><select value={combineLogic} onChange={(event) => setCombineLogic(event.target.value)}><option value="add">Add quantities</option><option value="separate">Separate source quantities</option></select></label>
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

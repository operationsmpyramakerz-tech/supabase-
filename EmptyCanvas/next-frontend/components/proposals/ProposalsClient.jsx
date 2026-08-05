"use client";

import { useMemo, useRef, useState } from "react";

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
    <div className="next-proposals-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`next-proposals-modal__card ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>{icon}</span>
          <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-proposals-modal__body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
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
      <form className="next-proposals-form" onSubmit={submit}>
        <label><span>Proposal Name *</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Example: School supplies quotation" /></label>
        {error ? <div className="next-proposals-error">{error}</div> : null}
        <div className="next-proposals-form__actions">
          <button type="button" className="next-proposals-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-proposals-btn primary" disabled={busy}>{busy ? "Saving…" : action}</button>
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
      <form className="next-proposals-form" onSubmit={submit}>
        <label><span>Admin Password *</span><input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="next-proposals-error">{error}</div> : null}
        <div className="next-proposals-form__actions">
          <button type="button" className="next-proposals-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-proposals-btn primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
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
      <form className="next-proposals-form" onSubmit={submit}>
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

        <div className="next-proposals-form-grid">
          <label><span>{mode === "kit" ? "Kit Multiplier" : "Quantity"}</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label><span>When Product Already Exists</span><select value={mergeLogic} onChange={(event) => setMergeLogic(event.target.value)}><option value="add">Add quantities</option><option value="max">Keep maximum</option><option value="min">Keep minimum</option></select></label>
        </div>

        {error ? <div className="next-proposals-error">{error}</div> : null}
        <div className="next-proposals-form__actions">
          <button type="button" className="next-proposals-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-proposals-btn primary" disabled={busy}>{busy ? "Adding…" : "Add Components"}</button>
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
      <form className="next-proposals-form" onSubmit={submit}>
        <label><span>Team Member *</span><select value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Select team member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}{member.department ? ` · ${member.department}` : ""}</option>)}</select></label>
        <label><span>Admin Password *</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="next-proposals-error">{error}</div> : null}
        <div className="next-proposals-form__actions">
          <button type="button" className="next-proposals-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-proposals-btn primary" disabled={busy}>{busy ? "Creating…" : "Create Order"}</button>
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
  const passwordResolver = useRef(null);

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

  const loadProposal = async (proposalId) => {
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
      <main className="next-proposals-page">
        <Toast toast={toast} onClose={() => setToast(null)} />
        {detailBusy && !activeDetail ? (
          <section className="next-proposals-detail-loading"><span /><span /><span /></section>
        ) : (
          <>
            <section className="next-proposals-detail-hero">
              <div>
                <button type="button" className="next-proposals-back" onClick={() => setActiveDetail(null)}>← All Proposals</button>
                <span className="next-proposals-chip">Quotation folder</span>
                <h2>{proposal?.name}</h2>
                <p>Created by {proposal?.createdBy || "Unknown"} · Updated {formatDate(proposal?.updatedAt || proposal?.createdAt)}</p>
                {proposal?.combinedSources?.length ? <div className="next-proposals-combined-note"><strong>Combined proposal</strong><span>{proposal.combineNote || `Sources: ${proposal.combinedSources.map((source) => source.name || source.id).join(", ")}`}</span></div> : null}
              </div>
              <aside>
                <button type="button" className="next-proposals-btn primary" onClick={() => setAddDialog(true)}>＋ Add Components</button>
                <button type="button" className="next-proposals-btn dark" onClick={() => setOrderDialog(true)} disabled={!enrichedRows.length}>Make Order</button>
                <button type="button" className="next-proposals-btn secondary" onClick={() => setNameDialog({ mode: "rename", proposal, value: proposal?.name || "" })}>Rename</button>
                <button type="button" className="next-proposals-btn danger" onClick={() => deleteProposal(proposal)}>Delete</button>
              </aside>
            </section>

            <section className="next-proposals-detail-stats">
              <article><small>Unique components</small><strong>{formatNumber(detailTotals.items)}</strong><span>Rows in proposal</span></article>
              <article><small>Total quantity</small><strong>{formatNumber(detailTotals.quantity)}</strong><span>All requested units</span></article>
              <article><small>Estimated value</small><strong>{formatMoney(detailTotals.value)}</strong><span>Based on catalogue prices</span></article>
              <article><small>Edit ownership</small><strong>{proposal?.canEdit ? "Owner" : "Protected"}</strong><span>{proposal?.canEdit ? "Direct editing enabled" : "Admin password required"}</span></article>
            </section>

            <section className="next-proposals-detail-card">
              <header>
                <div><small>Proposal components</small><h3>Quotation list</h3></div>
                <div className="next-proposals-detail-actions">
                  <button type="button" onClick={() => downloadSingle("pdf")}>PDF</button>
                  <button type="button" onClick={() => downloadSingle("excel")}>Excel</button>
                  <button type="button" onClick={() => loadProposal(proposal.id)} disabled={detailBusy}>{detailBusy ? "Refreshing…" : "Refresh"}</button>
                </div>
              </header>

              <div className="next-proposals-export-columns">
                <span>Export columns:</span>
                {EXPORT_COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={exportColumns.includes(key)} onChange={() => toggleExportColumn(key)} />{label}</label>)}
              </div>

              <div className="next-proposals-table-wrap">
                <table className="next-proposals-table">
                  <thead><tr><th>Component</th><th>Tag / Unit</th><th>Unit Cost</th><th>Quantity</th><th>Total</th><th /></tr></thead>
                  <tbody>
                    {enrichedRows.map((row) => (
                      <tr key={row.id}>
                        <td><div className="next-proposals-component"><span>{row.product?.imageUrl ? <img src={row.product.imageUrl} alt="" loading="lazy" /> : "▧"}</span><div><strong>{row.name}</strong><small>{row.displayId || "No ID code"}</small>{row.product?.url ? <a href={row.product.url} target="_blank" rel="noreferrer">Supplier link ↗</a> : null}</div></div></td>
                        <td><strong>{row.tag}</strong><small>{row.unit || "No unit"}</small></td>
                        <td>{formatMoney(row.unitPrice)}</td>
                        <td><input className="next-proposals-qty" type="number" min="1" step="1" defaultValue={row.quantity} key={`${row.id}-${row.quantity}`} onBlur={(event) => updateQuantity(row, event.target.value)} /></td>
                        <td><strong>{formatMoney(row.totalPrice)}</strong></td>
                        <td><button type="button" className="next-proposals-icon-btn danger" onClick={() => removeItem(row)} aria-label={`Remove ${row.name}`}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!enrichedRows.length ? <div className="next-proposals-empty"><span>▧</span><strong>No components yet</strong><p>Add products, a complete tag, or a reusable kit to build this quotation.</p><button type="button" className="next-proposals-btn primary" onClick={() => setAddDialog(true)}>Add Components</button></div> : null}
              </div>
            </section>
          </>
        )}

        {addDialog && proposal ? <AddItemsModal proposal={proposal} products={products} kits={kits} tags={tags} busy={busy} onClose={() => setAddDialog(false)} onSubmit={submitAdd} /> : null}
        {orderDialog && proposal ? <MakeOrderModal proposal={proposal} members={members} busy={busy} onClose={() => setOrderDialog(false)} onSubmit={makeOrder} /> : null}
        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.proposal?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  return (
    <main className="next-proposals-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section className="next-proposals-hero">
        <div>
          <span className="next-proposals-chip">Reusable quotation workspace</span>
          <h2>Build, compare and reuse complete product proposals.</h2>
          <p>Create quotation folders, add products individually or by tag and kit, export professional files, combine multiple proposals, and create an ERP order from a finished quotation.</p>
          <div>
            <button type="button" className="next-proposals-btn primary" onClick={() => setNameDialog({ mode: "create", value: "" })}>＋ Create New Proposal</button>
            <a className="next-proposals-btn secondary" href="/next/products">Open Product Catalogue</a>
            <a className="next-proposals-btn secondary" href="/kits">Open Classic Kits</a>
          </div>
        </div>
        <aside>
          <small>Workspace owner</small>
          <strong>{account?.name || account?.username || "User"}</strong>
          <span>{stats.owned} editable proposal{stats.owned === 1 ? "" : "s"}</span>
          <div><b>{products.length}</b><small>Catalogue products</small></div>
        </aside>
      </section>

      {bootstrapWarnings.length ? <section className="next-proposals-warning"><strong>Some startup resources were delayed.</strong><span>The page remains usable and you can press Refresh to retry.</span></section> : null}

      <section className="next-proposals-stats">
        <article><small>Proposal folders</small><strong>{formatNumber(stats.folders)}</strong><span>Saved quotation workspaces</span></article>
        <article><small>Saved components</small><strong>{formatNumber(stats.components)}</strong><span>Across all proposals</span></article>
        <article><small>My proposals</small><strong>{formatNumber(stats.owned)}</strong><span>Directly editable folders</span></article>
        <article><small>Combined proposals</small><strong>{formatNumber(stats.combined)}</strong><span>Built from multiple sources</span></article>
      </section>

      <section className="next-proposals-toolbar">
        <label className="next-proposals-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search proposal name or creator" /></label>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated-desc">Recently updated</option><option value="created-desc">Recently created</option><option value="name-asc">Name A–Z</option><option value="items-desc">Most components</option></select>
        <button type="button" className="next-proposals-btn secondary" onClick={refreshFolders} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </section>

      {selectedIds.length ? (
        <section className="next-proposals-combine-bar">
          <div><strong>{selectedIds.length} proposal{selectedIds.length === 1 ? "" : "s"} selected</strong><span>Select at least two folders to combine or export together.</span></div>
          <label><span>Combine logic</span><select value={combineLogic} onChange={(event) => setCombineLogic(event.target.value)}><option value="add">Add quantities</option><option value="separate">Separate source quantities</option></select></label>
          <button type="button" onClick={() => downloadCombined("pdf")} disabled={selectedIds.length < 2}>Combined PDF</button>
          <button type="button" onClick={() => downloadCombined("excel")} disabled={selectedIds.length < 2}>Combined Excel</button>
          <button type="button" className="primary" onClick={() => setNameDialog({ mode: "combine", value: "" })} disabled={selectedIds.length < 2}>Save Combined</button>
          <button type="button" onClick={() => setSelectedIds([])}>Clear</button>
        </section>
      ) : null}

      <section className="next-proposals-results-line"><div><strong>{filteredProposals.length}</strong><span>proposal folder{filteredProposals.length === 1 ? "" : "s"}</span></div><small>Check folders to combine them.</small></section>

      <section className="next-proposals-grid">
        {filteredProposals.map((proposal) => (
          <article className={`next-proposal-card ${selectedIds.includes(proposal.id) ? "is-selected" : ""}`} key={proposal.id}>
            <header>
              <label title="Select for combined proposal"><input type="checkbox" checked={selectedIds.includes(proposal.id)} onChange={() => toggleSelected(proposal.id)} /><span>✓</span></label>
              <div className="next-proposal-folder-icon"><i /><b>▤</b></div>
              <button type="button" className="next-proposals-icon-btn" onClick={() => setNameDialog({ mode: "copy", proposal, value: `${proposal.name} Copy` })} title="Make a copy">⧉</button>
            </header>
            <button type="button" className="next-proposal-card__body" onClick={() => loadProposal(proposal.id)}>
              <span>{proposal.combinedSources.length ? "Combined proposal" : proposal.canEdit ? "My proposal" : "Shared proposal"}</span>
              <h3>{proposal.name}</h3>
              <p>{proposal.combineNote || `Created by ${proposal.createdBy || "Unknown user"}`}</p>
              <div><strong>{formatNumber(proposal.itemsCount)}</strong><small>components</small><b>{formatDate(proposal.updatedAt || proposal.createdAt)}</b></div>
            </button>
            <footer>
              <button type="button" onClick={() => loadProposal(proposal.id)}>Open</button>
              <button type="button" onClick={() => setNameDialog({ mode: "rename", proposal, value: proposal.name })}>Rename</button>
              <button type="button" className="danger" onClick={() => deleteProposal(proposal)}>Delete</button>
            </footer>
          </article>
        ))}
      </section>

      {!filteredProposals.length ? <section className="next-proposals-empty"><span>▣</span><strong>{proposals.length ? "No matching proposals" : "No proposals yet"}</strong><p>{proposals.length ? "Try a different search term." : "Create your first reusable quotation folder."}</p><button type="button" className="next-proposals-btn primary" onClick={() => setNameDialog({ mode: "create", value: "" })}>Create Proposal</button></section> : null}

      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.proposal?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}

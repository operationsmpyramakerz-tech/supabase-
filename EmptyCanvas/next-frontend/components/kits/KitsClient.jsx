"use client";

import { useMemo, useRef, useState } from "react";

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
    itemsCount: number(kit?.itemsCount),
    canEdit: kit?.canEdit === true,
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

function Modal({ title, subtitle, icon = "◆", children, onClose, wide = false }) {
  return (
    <div className="next-proposals-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`next-proposals-modal__card ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>{icon}</span>
          <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="next-proposals-modal__body">{children}</div>
      </section>
    </div>
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
      <form className="next-proposals-form" onSubmit={submit}>
        <label><span>Kit Name *</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Example: Arduino starter kit" /></label>
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
      <form className="next-proposals-form" onSubmit={submit}>
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
        <div className="next-proposals-form-grid">
          <label><span>Quantity *</span><input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label><span>Selected Product</span><input value={products.find((product) => product.id === selected)?.name || "No product selected"} readOnly /></label>
        </div>
        {error ? <div className="next-proposals-error">{error}</div> : null}
        <div className="next-proposals-form__actions">
          <button type="button" className="next-proposals-btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="next-proposals-btn primary" disabled={busy}>{busy ? "Adding…" : "Add Product"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function KitsClient({ account, initialCatalog, initialKits, bootstrapWarnings = [] }) {
  const [products, setProducts] = useState(() => (Array.isArray(initialCatalog?.products) ? initialCatalog.products : []).map(normalizeProduct));
  const [kits, setKits] = useState(() => (Array.isArray(initialKits?.kits) ? initialKits.kits : []).map(normalizeKit));
  const [activeDetail, setActiveDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated-desc");
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [passwordRequest, setPasswordRequest] = useState(null);
  const [addDialog, setAddDialog] = useState(false);
  const passwordResolver = useRef(null);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredKits = useMemo(() => {
    const needle = lower(search);
    const rows = kits.filter((kit) => !needle || [kit.name, kit.createdBy].some((value) => lower(value).includes(needle)));
    return rows.sort((a, b) => {
      if (sort === "name-asc") return a.name.localeCompare(b.name);
      if (sort === "items-desc") return b.itemsCount - a.itemsCount || a.name.localeCompare(b.name);
      if (sort === "created-desc") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }, [kits, search, sort]);

  const stats = useMemo(() => ({
    folders: kits.length,
    components: kits.reduce((sum, kit) => sum + kit.itemsCount, 0),
    owned: kits.filter((kit) => kit.canEdit).length,
    average: kits.length ? kits.reduce((sum, kit) => sum + kit.itemsCount, 0) / kits.length : 0,
  }), [kits]);

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

  const syncDetail = (body) => {
    const kit = normalizeKit(body?.kit || activeDetail?.kit || {});
    const items = (Array.isArray(body?.items) ? body.items : []).map(normalizeItem);
    setActiveDetail({ kit, items });
    syncKit({ ...kit, itemsCount: items.length });
  };

  const loadKit = async (kitId) => {
    setDetailBusy(true);
    try {
      const body = await requestJson(`/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
      syncDetail(body);
    } catch (error) {
      notify(error?.message || "The kit could not be loaded.", "error");
    } finally {
      setDetailBusy(false);
    }
  };

  const refreshKits = async () => {
    setBusy(true);
    try {
      const [kitBody, productBody] = await Promise.all([
        requestJson(`/api/products/kits?_ts=${Date.now()}`),
        requestJson(`/api/products?_ts=${Date.now()}`),
      ]);
      setKits((kitBody.kits || []).map(normalizeKit));
      setProducts((productBody.products || []).map(normalizeProduct));
      if (activeDetail?.kit?.id) await loadKit(activeDetail.kit.id);
      notify("Kit data has been refreshed.");
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

  const protectedPassword = async (kit, message) => {
    if (kit?.canEdit) return "";
    return await askPassword({ title: "Admin password required", message: message || "This kit belongs to another user." });
  };

  const submitNameDialog = async (name) => {
    const dialog = nameDialog;
    if (!dialog) return;
    let adminPassword = "";
    if (dialog.mode === "create") {
      adminPassword = await askPassword({ title: "Create Kit", message: "Enter the Admin password to create a reusable kit." });
      if (adminPassword === null) return;
    } else if (dialog.mode === "rename") {
      adminPassword = await protectedPassword(dialog.kit, "Enter the Admin password to rename a kit created by another user.");
      if (adminPassword === null) return;
    }

    setBusy(true);
    try {
      if (dialog.mode === "create") {
        const body = await requestJson("/api/products/kits", { method: "POST", body: JSON.stringify({ name, adminPassword }) });
        const created = syncKit({ ...(body.kit || {}), canEdit: true });
        setNameDialog(null);
        notify(`“${name}” was created.`);
        await loadKit(created.id);
        return;
      }
      if (dialog.mode === "copy") {
        const body = await requestJson(`/api/products/kits/${encodeURIComponent(dialog.kit.id)}/copy`, { method: "POST", body: JSON.stringify({ name }) });
        syncKit(body.kit);
        notify(`A copy named “${name}” was created.`);
      } else if (dialog.mode === "rename") {
        const body = await requestJson(`/api/products/kits/${encodeURIComponent(dialog.kit.id)}`, { method: "PATCH", body: JSON.stringify({ name, adminPassword }) });
        syncKit(body.kit);
        notify("Kit name updated.");
      }
      setNameDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const deleteKit = async (kit) => {
    if (!window.confirm(`Delete “${kit.name}” and all saved components? This action cannot be undone.`)) return;
    const adminPassword = await protectedPassword(kit, "Enter the Admin password to delete a kit created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      await requestJson(`/api/products/kits/${encodeURIComponent(kit.id)}`, { method: "DELETE", body: JSON.stringify({ adminPassword }) });
      setKits((current) => current.filter((item) => item.id !== kit.id));
      if (activeDetail?.kit?.id === kit.id) setActiveDetail(null);
      notify("Kit deleted.");
    } catch (error) {
      notify(error?.message || "The kit could not be deleted.", "error");
    } finally {
      setBusy(false);
    }
  };

  const addProduct = async ({ productId, quantity }) => {
    const kit = activeDetail?.kit;
    if (!kit?.id) return;
    const adminPassword = await protectedPassword(kit, "Enter the Admin password to modify a kit created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      const body = await requestJson(`/api/products/kits/${encodeURIComponent(kit.id)}/items`, {
        method: "POST",
        body: JSON.stringify({ productId, quantity, adminPassword }),
      });
      syncDetail(body);
      setAddDialog(false);
      notify("Product added to kit.");
    } finally {
      setBusy(false);
    }
  };

  const updateQuantity = async (row, value) => {
    const quantity = Math.max(1, Math.round(number(value) || 1));
    if (quantity === row.quantity) return;
    const kit = activeDetail?.kit;
    const adminPassword = await protectedPassword(kit, "Enter the Admin password to modify a kit created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      const body = await requestJson(`/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
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
    if (!window.confirm(`Remove “${row.name}” from this kit?`)) return;
    const kit = activeDetail?.kit;
    const adminPassword = await protectedPassword(kit, "Enter the Admin password to modify a kit created by another user.");
    if (adminPassword === null) return;
    setBusy(true);
    try {
      const body = await requestJson(`/api/products/kits/${encodeURIComponent(kit.id)}/items/${encodeURIComponent(row.id)}`, {
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

  if (activeDetail || detailBusy) {
    const kit = activeDetail?.kit;
    return (
      <main className="next-proposals-page next-kits-page">
        <Toast toast={toast} onClose={() => setToast(null)} />
        {detailBusy && !activeDetail ? (
          <section className="next-proposals-detail-loading"><span /><span /><span /></section>
        ) : (
          <>
            <section className="next-proposals-detail-hero next-kits-detail-hero">
              <div>
                <button type="button" className="next-proposals-back" onClick={() => setActiveDetail(null)}>← All Kits</button>
                <span className="next-proposals-chip">Reusable product kit</span>
                <h2>{kit?.name}</h2>
                <p>Created by {kit?.createdBy || "Unknown"} · Updated {formatDate(kit?.updatedAt || kit?.createdAt)}</p>
              </div>
              <aside>
                <button type="button" className="next-proposals-btn primary" onClick={() => setAddDialog(true)}>＋ Add Product</button>
                <a className="next-proposals-btn dark" href="/next/proposals">Use in Proposal</a>
                <button type="button" className="next-proposals-btn secondary" onClick={() => setNameDialog({ mode: "rename", kit, value: kit?.name || "" })}>Rename</button>
                <button type="button" className="next-proposals-btn danger" onClick={() => deleteKit(kit)}>Delete</button>
              </aside>
            </section>

            <section className="next-proposals-detail-stats">
              <article><small>Unique components</small><strong>{formatNumber(detailTotals.items)}</strong><span>Product rows in this kit</span></article>
              <article><small>Total quantity</small><strong>{formatNumber(detailTotals.quantity)}</strong><span>All saved units</span></article>
              <article><small>Estimated value</small><strong>{formatMoney(detailTotals.value)}</strong><span>Based on catalogue prices</span></article>
              <article><small>Ownership</small><strong>{kit?.canEdit ? "Mine" : "Shared"}</strong><span>{kit?.canEdit ? "Direct editing" : "Admin password protected"}</span></article>
            </section>

            <section className="next-proposals-detail-card">
              <header>
                <div><small>Kit contents</small><h3>{enrichedRows.length} component{enrichedRows.length === 1 ? "" : "s"}</h3></div>
                <div className="next-proposals-detail-actions">
                  <button type="button" onClick={() => setAddDialog(true)}>Add Product</button>
                  <button type="button" onClick={() => loadKit(kit.id)} disabled={detailBusy}>{detailBusy ? "Refreshing…" : "Refresh"}</button>
                </div>
              </header>

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
                {!enrichedRows.length ? <div className="next-proposals-empty"><span>▧</span><strong>No components yet</strong><p>Add products and quantities to make this kit reusable inside proposals.</p><button type="button" className="next-proposals-btn primary" onClick={() => setAddDialog(true)}>Add Product</button></div> : null}
              </div>
            </section>
          </>
        )}

        {addDialog && kit ? <AddProductModal kit={kit} products={products} busy={busy} onClose={() => setAddDialog(false)} onSubmit={addProduct} /> : null}
        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  return (
    <main className="next-proposals-page next-kits-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <section className="next-proposals-hero next-kits-hero">
        <div>
          <span className="next-proposals-chip">Reusable product bundles</span>
          <h2>Build a kit once, then reuse it in every proposal.</h2>
          <p>Create standard component bundles, preserve exact quantities, copy proven configurations, and insert complete kits into quotations without rebuilding the same list.</p>
          <div>
            <button type="button" className="next-proposals-btn primary" onClick={() => setNameDialog({ mode: "create", value: "" })}>＋ Create New Kit</button>
            <a className="next-proposals-btn secondary" href="/next/products">Open Product Catalogue</a>
            <a className="next-proposals-btn secondary" href="/next/proposals">Open Proposals</a>
          </div>
        </div>
        <aside>
          <small>Workspace owner</small>
          <strong>{account?.name || account?.username || "User"}</strong>
          <span>{stats.owned} editable kit{stats.owned === 1 ? "" : "s"}</span>
          <div><b>{products.length}</b><small>Catalogue products</small></div>
        </aside>
      </section>

      {bootstrapWarnings.length ? <section className="next-proposals-warning"><strong>Some startup resources were delayed.</strong><span>The page remains usable and you can press Refresh to retry.</span></section> : null}

      <section className="next-proposals-stats">
        <article><small>Kit folders</small><strong>{formatNumber(stats.folders)}</strong><span>Reusable product bundles</span></article>
        <article><small>Saved components</small><strong>{formatNumber(stats.components)}</strong><span>Across all kits</span></article>
        <article><small>My kits</small><strong>{formatNumber(stats.owned)}</strong><span>Directly editable folders</span></article>
        <article><small>Average kit size</small><strong>{formatNumber(stats.average)}</strong><span>Components per kit</span></article>
      </section>

      <section className="next-proposals-toolbar">
        <label className="next-proposals-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search kit name or creator" /></label>
        <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated-desc">Recently updated</option><option value="created-desc">Recently created</option><option value="name-asc">Name A–Z</option><option value="items-desc">Most components</option></select>
        <button type="button" className="next-proposals-btn secondary" onClick={refreshKits} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </section>

      <section className="next-proposals-results-line"><div><strong>{filteredKits.length}</strong><span>kit folder{filteredKits.length === 1 ? "" : "s"}</span></div><small>Open a kit to manage its products and quantities.</small></section>

      <section className="next-proposals-grid">
        {filteredKits.map((kit) => (
          <article className="next-proposal-card next-kit-card" key={kit.id}>
            <header>
              <span className="next-kit-owner-badge">{kit.canEdit ? "Mine" : "Shared"}</span>
              <div className="next-proposal-folder-icon next-kit-folder-icon"><i /><b>K</b></div>
              <button type="button" className="next-proposals-icon-btn" onClick={() => setNameDialog({ mode: "copy", kit, value: `${kit.name} Copy` })} title="Make a copy">⧉</button>
            </header>
            <button type="button" className="next-proposal-card__body" onClick={() => loadKit(kit.id)}>
              <span>Reusable product kit</span>
              <h3>{kit.name}</h3>
              <p>Created by {kit.createdBy || "Unknown user"}</p>
              <div><strong>{formatNumber(kit.itemsCount)}</strong><small>components</small><b>{formatDate(kit.updatedAt || kit.createdAt)}</b></div>
            </button>
            <footer>
              <button type="button" onClick={() => loadKit(kit.id)}>Open</button>
              <button type="button" onClick={() => setNameDialog({ mode: "rename", kit, value: kit.name })}>Rename</button>
              <button type="button" className="danger" onClick={() => deleteKit(kit)}>Delete</button>
            </footer>
          </article>
        ))}
      </section>

      {!filteredKits.length ? <section className="next-proposals-empty"><span>▣</span><strong>{kits.length ? "No matching kits" : "No kits yet"}</strong><p>{kits.length ? "Try a different search term." : "Create your first reusable product kit."}</p><button type="button" className="next-proposals-btn primary" onClick={() => setNameDialog({ mode: "create", value: "" })}>Create Kit</button></section> : null}

      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}

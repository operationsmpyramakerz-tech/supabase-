"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
    <div className="products-modal-overlay next-proposals-classic-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`products-modal products-proposal-modal ${wide ? "next-proposals-classic-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
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
  const [folderMenu, setFolderMenu] = useState("");
  const [detailEdit, setDetailEdit] = useState(false);
  const passwordResolver = useRef(null);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search kits...";
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

  const loadKit = async (kitId, options = {}) => {
    setDetailEdit(Boolean(options.edit));
    setFolderMenu("");
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
        await loadKit(created.id, { edit: true });
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
      <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
          <section className="proposals-panel">
            <section className="products-proposal-detail">
              {detailBusy && !activeDetail ? (
                <div className="products-loading-card" role="status" aria-live="polite">
                  <div className="products-spinner" aria-hidden="true" />
                  <div><strong>Loading kit</strong></div>
                </div>
              ) : (
                <>
                  <header className="products-proposal-detail__head">
                    <button type="button" className="products-back-btn" onClick={() => { setActiveDetail(null); setDetailEdit(false); }} aria-label="Back to kits">←</button>
                    <div className="proposal-classic-kit-heading">
                      <h2>{kit?.name || "Kit"}</h2>
                      <p>{formatNumber(enrichedRows.length)} saved component{enrichedRows.length === 1 ? "" : "s"} · {detailEdit ? "Edit mode" : "View only"}</p>
                    </div>
                    <div className="proposal-detail-actions">
                      {detailEdit ? (
                        <>
                          <button type="button" className="products-btn products-btn--dark" onClick={() => setAddDialog(true)}>＋ <span>Add Product</span></button>
                          <button type="button" className="products-btn products-btn--light" onClick={() => setNameDialog({ mode: "rename", kit, value: kit?.name || "" })}>Rename</button>
                          <button type="button" className="products-btn products-btn--light" onClick={() => setDetailEdit(false)}>Done</button>
                        </>
                      ) : (
                        <>
                          <a className="products-btn products-btn--dark" href="/next/proposals">Use in Proposal</a>
                          <button type="button" className="products-btn products-btn--light" onClick={() => setDetailEdit(true)}>Edit</button>
                        </>
                      )}
                    </div>
                  </header>

                  {detailEdit ? (
                    <div className="products-proposal-tools proposals-one-tool">
                      <div className="products-proposal-tool-card">
                        <div className="products-proposal-tool-title"><span aria-hidden="true">＋</span><span>Add kit component</span></div>
                        <div className="proposal-classic-inline-actions">
                          <button type="button" className="products-btn products-btn--dark" onClick={() => setAddDialog(true)}>Add Product</button>
                          <button type="button" className="products-btn products-btn--light" onClick={() => loadKit(kit.id, { edit: true })} disabled={detailBusy}>{detailBusy ? "Refreshing…" : "Refresh"}</button>
                          <button type="button" className="products-btn next-proposals-classic-danger" onClick={() => deleteKit(kit)}>Delete Kit</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="proposal-view-note"><span aria-hidden="true">◉</span><span>View only. Use the 3-dot menu or choose Edit to modify this kit.</span></div>
                  )}

                  <div className="products-proposal-table-card">
                    <div className="products-proposal-table-head">
                      <div><h3>Kit components</h3><p>These quantities will be copied into any proposal when you add this kit.</p></div>
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
                          {!enrichedRows.length ? <tr><td colSpan="6"><div className="products-table-empty">No components yet. {detailEdit ? "Add one component above." : "Choose Edit to add components."}</div></td></tr> : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="proposal-total-block">
                      <div><span>Components</span><strong>{formatNumber(detailTotals.items)}</strong></div>
                      <div><span>Total Quantity</span><strong>{formatNumber(detailTotals.quantity)}</strong></div>
                      <div><span>Estimated Total</span><strong>{formatMoney(detailTotals.value)}</strong></div>
                    </div>
                  </div>
                </>
              )}
            </section>
          </section>
        </section>

        {addDialog && kit ? <AddProductModal kit={kit} products={products} busy={busy} onClose={() => setAddDialog(false)} onSubmit={addProduct} /> : null}
        {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
        {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
      </main>
    );
  }

  return (
    <main className="products-shell proposals-shell next-proposals-classic-parity next-kits-classic-parity">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="proposals-floating-actions">
        <button type="button" className="products-add-btn proposals-create-btn" onClick={() => setNameDialog({ mode: "create", value: "" })}><span aria-hidden="true">＋</span><span>Create New Kit</span></button>
      </div>

      {bootstrapWarnings.length ? <div className="proposal-view-note"><span aria-hidden="true">!</span><span>Some startup resources were delayed. The page remains usable; refresh if a kit is missing.</span></div> : null}

      <section className="products-proposals-view proposals-workspace proposals-folders-card" aria-live="polite">
        <section className="proposals-panel">
          <div className="products-proposals-list">
            {filteredKits.length ? (
              <div className="products-proposal-folders">
                {filteredKits.map((kit) => (
                  <article className="products-proposal-folder" key={kit.id}>
                    <button type="button" className="proposal-folder-menu-btn" onClick={(event) => { event.stopPropagation(); setFolderMenu((current) => current === kit.id ? "" : kit.id); }} aria-label={`Actions for ${kit.name}`}><span className="proposal-menu-dots" aria-hidden="true">•••</span></button>
                    {folderMenu === kit.id ? (
                      <div className="proposal-folder-menu" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => loadKit(kit.id, { edit: true })}><span>Edit</span></button>
                        <button type="button" onClick={() => { setFolderMenu(""); setNameDialog({ mode: "copy", kit, value: `${kit.name} Copy` }); }}><span>Make a copy</span></button>
                        <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); deleteKit(kit); }}><span>Delete</span></button>
                      </div>
                    ) : null}
                    <button type="button" className="products-proposal-folder__main" onClick={() => loadKit(kit.id)} aria-label={`Open ${kit.name}`}>
                      <span className="proposal-folder-figure" aria-hidden="true">
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                        <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                        <span className="proposal-folder-figure__back" />
                        <span className="proposal-folder-figure__front"><small>K</small></span>
                      </span>
                      <span className="proposal-folder-copy"><strong>{kit.name}</strong><em>Created by {kit.createdBy || "—"}</em></span>
                      <span className="proposal-folder-count"><span aria-hidden="true">▱</span><span>{formatNumber(kit.itemsCount)} component{kit.itemsCount === 1 ? "" : "s"}</span></span>
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

      {nameDialog ? <NameModal key={`${nameDialog.mode}-${nameDialog.kit?.id || "new"}`} dialog={nameDialog} busy={busy} onClose={() => setNameDialog(null)} onSubmit={submitNameDialog} /> : null}
      {passwordRequest ? <PasswordModal request={passwordRequest} busy={busy} onClose={closePassword} onVerified={verifyPassword} /> : null}
    </main>
  );
}

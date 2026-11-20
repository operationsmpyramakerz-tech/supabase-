"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import HeaderFolderBreadcrumb from "../HeaderFolderBreadcrumb";
import { useRouter } from "next/navigation";
import ProductAdditionForm from "../orders/ProductAdditionForm";
import ClassicOrderIcon from "../orders/ClassicOrderIcon";
import CurrentOrderCreatorPopover from "../orders/CurrentOrderCreatorPopover";
import UnifiedOrderCreatorPopover, { creatorPopoverPlacement } from "../orders/UnifiedOrderCreatorPopover";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";

const ProductImageViewer = dynamic(() => import("./ProductsDialogs").then(m => m.ProductImageViewer), { ssr: false });

function safeUrl(value) {
  try {
    const parsed = new URL(String(value ?? "").trim());
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch { return ""; }
}
function Icon({ name }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    back: <path d="m12 5-7 7 7 7M5 12h14"/>,
    tag: <><path d="M3 3h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1"/></>,
    link: <><path d="M10 13a4 4 0 0 0 6 .5l4-4a4 4 0 0 0-6-6l-2 2M14 11a4 4 0 0 0-6-.5l-4 4a4 4 0 0 0 6 6l2-2"/></>,
    zoom: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M10 7v6M7 10h6"/></>,
    money: <><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h1m12 6h1"/></>,
  };
  return paths[name] ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg> : <ClassicOrderIcon name={name}/>;
}
function RequestImage({ item, onOpen }) {
  const url = safeUrl(item.image_url);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <button type="button" className="par2-image" disabled={!url || failed} aria-label={`Preview ${item.name || "product"} image`} onClick={() => onOpen({ url, name: item.name })}>
    {url && !failed ? <><img src={url} alt={item.name || "Product image"} loading="lazy" onError={() => setFailed(true)}/><span className="par2-zoom"><Icon name="zoom"/></span></> : <span className="par2-placeholder"><Icon name="package"/></span>}
  </button>;
}
function DetailTile({ icon, label, children, full = false }) {
  return <div className={`par2-tile${full ? " par2-tile--full" : ""}`}><span className="par2-tile-label"><Icon name={icon}/>{label}</span><div className="par2-tile-value">{children}</div></div>;
}
function useHeaderRequestSearch(query, setQuery) {
  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    const oldPlaceholder = input.getAttribute("placeholder");
    const oldLabel = input.getAttribute("aria-label");
    input.placeholder = "Search products or orders...";
    input.setAttribute("aria-label", "Search product addition requests");
    const listener = event => setQuery(String(event.target?.value || ""));
    input.addEventListener("input", listener);
    return () => {
      input.removeEventListener("input", listener);
      input.value = "";
      if (oldPlaceholder == null) input.removeAttribute("placeholder"); else input.setAttribute("placeholder", oldPlaceholder);
      if (oldLabel == null) input.removeAttribute("aria-label"); else input.setAttribute("aria-label", oldLabel);
    };
  }, [setQuery]);
  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (input && input.value !== query) input.value = query;
  }, [query]);
}


const text = value => String(value ?? "").trim();
function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "Not specified";
  return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP" }).format(Number(value) || 0);
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", credentials: "include", ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) throw new Error(body?.error || body?.message || "Could not load requests.");
  return body;
}

export default function ProductAdditionReviewClient({ canUploadImage = false, tagsCatalog = [], unitsCatalog = [] }) {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [creator, setCreator] = useState(null);
  const [imageViewer, setImageViewer] = useState(null);
  useHeaderRequestSearch(query, setQuery);
  const closeCreator = useCallback(() => setCreator(null), []);
  function openCreator(event, item) {
    const placement = creatorPopoverPlacement(event.currentTarget);
    setCreator(previous => previous?.requestId === item.id ? null : {
      requestId: item.id,
      id: text(item.requested_by_id),
      name: text(item.requested_by_name) || "Requester",
      placement,
    });
  }
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await requestJson("/next/api/products/addition-requests");
      setRequests(response.requests || []);
    } catch (exception) { setError(exception.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { closeCreator(); }, [status, query, closeCreator]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter(item => {
      if (status !== "all" && item.status !== status) return false;
      return !needle || [item.name, item.order_number, `ORD-${item.order_number}`, item.tag, item.quantity, item.unit, item.requested_by_name, item.approved_product_id].some(value => text(value).toLowerCase().includes(needle));
    });
  }, [requests, status, query]);
  const count = value => requests.filter(item => item.status === value).length;
  const mutate = async (id, action, product) => {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const response = await requestJson("/next/api/products/addition-requests", {
        method: "PATCH", body: JSON.stringify({ id, action, ...(product ? { product } : {}) }),
      });
      if (response.request) setRequests(previous => previous.map(row => row.id === id ? response.request : row));
      if (action === "save") {
        setEditing(null);
        setMessage("Changes saved. The component is still waiting for approval.");
      } else {
        setMessage(response.orderLinked === false
          ? "Product added to Products, but its original order could not be linked automatically. Review that order."
          : "Product added to Products successfully.");
      }
      return true;
    } catch (exception) {
      setError(exception.message);
      throw exception;
    } finally { setBusyId(""); }
  };

  return <main className="addition-review addition-review--v2">
    <HeaderFolderBreadcrumb segments={[
      { label: "Products", icon: "package", onClick: () => router.push("/next/products") },
      { label: "Product Addition Requests", icon: "package" },
    ]}/>
    <header className="par2-heading"><span className="par2-heading-icon"><Icon name="package"/></span><h2>Requested New Products</h2></header>
    <div className="par2-overview">
      <div className="par2-stats">
        {[
          { label: "Pending", value: count("pending"), key: "pending", icon: "clock" },
          { label: "Added", value: count("approved"), key: "approved", icon: "check-circle" },
          { label: "Total", value: requests.length, key: "all", icon: "layers" },
        ].map(stat => <div className={`par2-stat par2-stat--${stat.key}`} key={stat.key}><span className="par2-stat-icon"><Icon name={stat.icon}/></span><div><strong>{stat.value}</strong><small>{stat.label}</small></div></div>)}
      </div>
    </div>
    <nav className="par2-tabs" aria-label="Request status">
      {[
        { value: "pending", label: "Pending", number: count("pending"), icon: "clock" },
        { value: "approved", label: "Added", number: count("approved"), icon: "check-circle" },
        { value: "all", label: "All", number: requests.length, icon: "layers" },
      ].map(tab => <button key={tab.value} type="button" aria-pressed={status === tab.value} className={status === tab.value ? "is-active" : ""} onClick={() => setStatus(tab.value)}><Icon name={tab.icon}/><span>{tab.label} ({tab.number})</span></button>)}
    </nav>
    {message ? <div className="dashboard-notice" role="status"><strong>{message}</strong></div> : null}
    {error ? <div className="dashboard-notice" role="alert"><strong>Could not complete this action</strong><span>{error}</span></div> : null}
    {loading ? <div className="addition-review__empty">Loading requests...</div> : !filtered.length ? <div className="addition-review__empty">No product requests found.</div> :
      <section className="par2-grid">{filtered.map(item => {
        const approved = item.status === "approved";
        const pending = item.status === "pending";
        const url = safeUrl(item.url);
        return <article className={`par2-card${pending ? " par2-card--pending" : ""}`} key={item.id}>
          <div className="par2-card-header">
            <div className="par2-card-title"><h3>{item.name}</h3><div className="par2-order"><Icon name="file-text"/><span>ORD-{item.order_number}</span></div></div>
            <div className="par2-header-actions">
              <span className={`par2-status${approved ? " is-approved" : pending ? "" : " is-processing"}`}><Icon name={approved ? "check-circle" : "clock"}/>{approved ? "Added" : pending ? "Pending" : "Processing"}</span>
              <button type="button" className={`co-creator-btn par2-person${creator?.requestId === item.id ? " is-active" : ""}`} aria-label="View requester details" title="View requester details" aria-haspopup="dialog" aria-expanded={creator?.requestId === item.id} onClick={event => openCreator(event, item)}><Icon name="user"/></button>
            </div>
          </div>
          <div className="par2-card-content">
            <RequestImage item={item} onOpen={image => { closeCreator(); setImageViewer(image); }}/>
            <div className="par2-details">
              <DetailTile icon="grid" label="Quantity">{item.quantity ?? "—"} {item.unit || ""}</DetailTile>
              <DetailTile icon="money" label="Unit price">{formatMoney(item.unit_price)}</DetailTile>
              <DetailTile icon="tag" label="Tag" full>{item.tag || "Not set"}</DetailTile>
              <DetailTile icon="link" label="Product link" full>{url ? <a className="par2-product-link" href={url} target="_blank" rel="noopener noreferrer"><span>Open URL</span><Icon name="external-link"/></a> : <span>Not available</span>}</DetailTile>
              {approved && <DetailTile icon="package" label="Product ID" full>{item.approved_product_id || "—"}</DetailTile>}
            </div>
          </div>
          {pending && <div className="par2-card-actions">
            <button type="button" disabled={!!busyId} onClick={() => { closeCreator(); setEditing(item); }}><Icon name="edit-2"/><span>Edit Details</span></button>
            <button type="button" className="par2-primary" disabled={!!busyId} onClick={() => { closeCreator(); mutate(item.id, "approve").catch(() => {}); }}><Icon name="plus"/><span>{busyId === item.id ? "Adding..." : "Add to Products"}</span></button>
          </div>}
        </article>;
      })}</section>}
    {creator && createPortal(creator.id ? <CurrentOrderCreatorPopover key={creator.requestId} creator={creator} onClose={closeCreator}/> : <UnifiedOrderCreatorPopover state={{ name: creator.name, placement: creator.placement, error: true }} onClose={closeCreator}/>, document.body)}
    {imageViewer && createPortal(<ProductImageViewer image={imageViewer} onClose={() => setImageViewer(null)}/>, document.body)}
    {editing ? <ProductAdditionForm
      review
      canUploadImage={canUploadImage}
      initial={editing}
      tags={[...new Set([...tagsCatalog, ...requests.map(item => text(item.tag))].filter(Boolean))]}
      units={[...new Set([...unitsCatalog, "Piece", "Pack", "Kilogram", "Metre", "Inch", ...requests.map(item => text(item.unit))].filter(Boolean))]}
      uploadEndpoint="/next/api/products/image-upload"
      onClose={() => setEditing(null)}
      onSave={product => mutate(editing.id, "save", product)}
    /> : null}
  </main>;
}

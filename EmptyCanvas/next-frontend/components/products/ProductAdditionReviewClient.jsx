"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProductAdditionForm from "../orders/ProductAdditionForm";

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

export default function ProductAdditionReviewClient({ canUploadImage = false }) {
  const [requests, setRequests] = useState([]);
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

  const filtered = useMemo(() => requests.filter(item => status === "all" || item.status === status), [requests, status]);
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

  return <main className="addition-review">
    <header className="addition-review__head">
      <div><h2>Requested New Products</h2><p>Review and edit submitted components before they enter the official Products catalog.</p></div>
      <a href="/next/products">← Back to Products</a>
    </header>
    <nav className="addition-review__filters" aria-label="Request status">
      {[{ value: "pending", label: `Pending (${count("pending")})` }, { value: "approved", label: `Added (${count("approved")})` }, { value: "all", label: `All (${requests.length})` }].map(option =>
        <button key={option.value} type="button" className={option.value === status ? "is-active" : ""} onClick={() => setStatus(option.value)}>{option.label}</button>)}
      <button type="button" onClick={load} disabled={loading}>Refresh</button>
    </nav>
    {message ? <div className="dashboard-notice" role="status"><strong>{message}</strong></div> : null}
    {error ? <div className="dashboard-notice" role="alert"><strong>Could not complete this action</strong><span>{error}</span></div> : null}
    {loading ? <div className="addition-review__empty">Loading requests...</div> : !filtered.length ? <div className="addition-review__empty">No {status === "all" ? "" : status} product requests found.</div> :
      <section className="addition-review__grid">{filtered.map(item => <article className="addition-review__card" key={item.id}>
        <div className="addition-review__top"><h3>{item.name}</h3><span className={`addition-review__status ${item.status === "approved" ? "is-approved" : ""}`}>{item.status === "approved" ? "Added" : item.status === "processing" ? "Processing" : "Pending"}</span></div>
        <div className="addition-review__details">
          {item.image_url ? <img src={item.image_url} alt={item.name}/> : null}
          <div className="addition-review__meta"><span><b>Order:</b> ORD-{item.order_number}</span><span><b>Qty:</b> {item.quantity} {item.unit || ""}</span><span><b>Price:</b> {formatMoney(item.unit_price)}</span><span><b>Tag:</b> {item.tag || "Not set"}</span><span><b>Requested by:</b> {item.requested_by_name || "—"}</span></div>
        </div>
        {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">Open product URL</a> : null}
        {item.status === "approved" ? <div className="addition-review__meta"><b>Product ID: {item.approved_product_id || "—"}</b></div> : null}
        {item.status === "pending" ? <div className="addition-review__actions">
          <button type="button" onClick={() => setEditing(item)} disabled={!!busyId}>Edit Details</button>
          <button className="is-primary" type="button" disabled={!!busyId} onClick={() => mutate(item.id, "approve").catch(() => {})}>{busyId === item.id ? "Adding..." : "Add to Products"}</button>
        </div> : null}
      </article>)}</section>
    }
    {editing ? <ProductAdditionForm
      review
      canUploadImage={canUploadImage}
      initial={editing}
      tags={[...new Set(requests.map(item => text(item.tag)).filter(Boolean))]}
      units={[...new Set(requests.map(item => text(item.unit)).filter(Boolean))]}
      uploadEndpoint="/next/api/products/image-upload"
      onClose={() => setEditing(null)}
      onSave={product => mutate(editing.id, "save", product)}
    /> : null}
  </main>;
}

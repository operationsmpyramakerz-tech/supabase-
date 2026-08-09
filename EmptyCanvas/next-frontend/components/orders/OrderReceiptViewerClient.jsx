"use client";

import { useMemo, useState } from "react";

function text(value) { return String(value || "").trim(); }
function lower(value) { return text(value).toLowerCase(); }

async function requestJson(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw Object.assign(new Error("Your session expired."), { status: 401 });
  if (!response.ok || body?.ok === false) throw new Error(body?.error || "Unable to load order receipts.");
  return body;
}

function fileType(item) {
  const explicit = lower(item?.type);
  if (["image", "pdf", "file"].includes(explicit)) return explicit;
  const probe = lower(`${item?.name} ${item?.url}`);
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|\s|$)/i.test(probe)) return "image";
  if (/\.pdf(\?|#|\s|$)/i.test(probe)) return "pdf";
  return "file";
}

function fileLabel(item, index) {
  return text(item?.name) || `Order receipt ${index + 1}`;
}

function Toast({ message }) {
  return message ? <div className="receipt-viewer-toast" role="status">{message}</div> : null;
}

export default function OrderReceiptViewerClient({ ids, initialPayload, canExpenses, canExpensesUsers, bootstrapWarnings = [] }) {
  const [items, setItems] = useState(() => Array.isArray(initialPayload?.items) ? initialPayload.items : []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");

  const stats = useMemo(() => {
    const images = items.filter((item) => fileType(item) === "image").length;
    const pdf = items.filter((item) => fileType(item) === "pdf").length;
    return { total: items.length, images, pdf, other: Math.max(0, items.length - images - pdf) };
  }, [items]);

  const visible = useMemo(() => {
    const token = lower(query);
    return items.filter((item, index) => {
      const type = fileType(item);
      if (filter !== "all" && type !== filter) return false;
      if (token && !lower(`${fileLabel(item, index)} ${item?.url || ""}`).includes(token)) return false;
      return true;
    });
  }, [items, query, filter]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function refresh() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const payload = await requestJson(`/api/orders/order-receipts?ids=${encodeURIComponent(ids)}`);
      setItems(Array.isArray(payload?.items) ? payload.items : []);
      notify("Receipt files refreshed.");
    } catch (refreshError) {
      if (refreshError?.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/next/orders/receipt-viewer?ids=${encodeURIComponent(ids)}`)}`;
        return;
      }
      setError(refreshError?.message || "Unable to refresh receipts.");
    } finally { setBusy(false); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("Viewer link copied.");
    } catch { notify("Copy is not available in this browser."); }
  }

  return (
    <main className="next-receipt-viewer">
      <Toast message={toast} />
      {bootstrapWarnings.length ? <div className="dashboard-notice"><strong>Partial initial data</strong><span>One receipt resource was delayed. Refresh to retry.</span></div> : null}

      <section className="next-receipt-viewer-hero">
        <div><span className="pill">Order proof</span><h2>Receipts and delivery files</h2><p>Review every receipt linked to this expense without leaving the ERP workspace.</p></div>
        <div className="next-receipt-viewer-actions">
          <button type="button" onClick={refresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
          <button type="button" onClick={copyLink}>Copy link</button>
          <button type="button" onClick={() => window.print()}>Print</button>
          {canExpenses ? <a href="/next/expenses">Expenses</a> : null}
          {canExpensesUsers ? <a href="/next/expenses/users">Expenses Users</a> : null}
        </div>
      </section>

      <section className="next-receipt-viewer-summary">
        <article><small>Total files</small><strong>{stats.total}</strong><span>Unique receipt links</span></article>
        <article><small>Images</small><strong>{stats.images}</strong><span>Previewable photos</span></article>
        <article><small>PDF files</small><strong>{stats.pdf}</strong><span>Portable documents</span></article>
        <article><small>Other files</small><strong>{stats.other}</strong><span>External attachments</span></article>
      </section>

      <section className="next-receipt-viewer-toolbar">
        <label><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search receipt name or link" /></label>
        <div role="tablist" aria-label="Receipt file type">
          {[['all', 'All'], ['image', 'Images'], ['pdf', 'PDF'], ['file', 'Other']].map(([key, label]) => <button type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)} key={key}>{label}</button>)}
        </div>
        <strong>{visible.length} shown</strong>
      </section>

      {error ? <div className="next-receipt-viewer-error" role="alert">{error}</div> : null}

      <section className="next-receipt-viewer-grid">
        {visible.length ? visible.map((item, index) => {
          const type = fileType(item);
          const label = fileLabel(item, index);
          return (
            <article className="next-receipt-card" key={`${item.url}-${index}`}>
              <button className="next-receipt-card-preview" type="button" onClick={() => type === "image" ? setSelected(item) : window.open(item.url, "_blank", "noopener,noreferrer")}>
                {type === "image" ? <img src={item.url} alt={label} loading="lazy" /> : <span className={`next-receipt-file-mark ${type}`}><b>{type === "pdf" ? "PDF" : "FILE"}</b><small>Open attachment</small></span>}
              </button>
              <div className="next-receipt-card-copy"><span>{type === "image" ? "Receipt image" : type === "pdf" ? "PDF document" : "Attachment"}</span><h3>{label}</h3><p>{text(item.sourceId) ? `Order source ${item.sourceId}` : "Linked order receipt"}</p></div>
              <footer><a href={item.url} target="_blank" rel="noreferrer">Open original</a>{type === "image" ? <button type="button" onClick={() => setSelected(item)}>Preview</button> : null}</footer>
            </article>
          );
        }) : <div className="next-receipt-viewer-empty"><strong>{items.length ? "No receipts match the current filter" : "No receipt files were found"}</strong><span>{items.length ? "Try another search or file type." : "The linked order does not currently contain an Order receipt file or link."}</span>{items.length ? <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : <button type="button" onClick={refresh}>Check again</button>}</div>}
      </section>

      {selected ? <div className="next-receipt-lightbox" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section role="dialog" aria-modal="true"><header><div><span>Receipt preview</span><strong>{text(selected.name) || "Order receipt"}</strong></div><button type="button" onClick={() => setSelected(null)} aria-label="Close preview">×</button></header><div><img src={selected.url} alt={text(selected.name) || "Order receipt"} /></div><footer><a href={selected.url} target="_blank" rel="noreferrer">Open original</a><button type="button" onClick={() => setSelected(null)}>Close</button></footer></section></div> : null}
    </main>
  );
}

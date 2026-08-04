"use client";

import { useMemo, useState } from "react";

const EXPORT_COLUMNS = [
  { value: "stock", label: "Stock", checked: true },
  { value: "receiptNumber", label: "Receipt number", checked: false },
  { value: "unityPrice", label: "Unity price", checked: true },
  { value: "totalPrice", label: "Total price", checked: true },
  { value: "inventory", label: "Inventory", checked: false },
  { value: "defected", label: "Defected", checked: false },
];

const TAG_TONES = {
  gray: { background: "#f2f4f7", color: "#344054", border: "#d0d5dd" },
  brown: { background: "#f4f0ec", color: "#7a2e0e", border: "#e8d7cb" },
  orange: { background: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  yellow: { background: "#fffaeb", color: "#b54708", border: "#fedf89" },
  green: { background: "#ecfdf3", color: "#067647", border: "#abefc6" },
  blue: { background: "#eff8ff", color: "#175cd3", border: "#b2ddff" },
  purple: { background: "#f4f3ff", color: "#5925dc", border: "#d9d6fe" },
  pink: { background: "#fdf2fa", color: "#c11574", border: "#fcceee" },
  red: { background: "#fff1f3", color: "#c01048", border: "#fecdd6" },
  default: { background: "#f2f4f7", color: "#344054", border: "#d0d5dd" },
};

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

function money(value) {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(number(value));
}

function normalizedUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return "";
}

function tagColor(name, fallback) {
  const canonical = lower(name).replace(/[^a-z0-9]+/g, "");
  if (canonical === "requestproducts" || canonical === "requestproduct") return "green";
  if (["withdrawproducts", "withdrawproduct", "withdrawalproducts", "withdrawalproduct"].includes(canonical)) return "red";
  return TAG_TONES[fallback] ? fallback : "default";
}

function normalizedRow(row, index) {
  const quantity = number(row?.quantity);
  const unitPrice = number(row?.unitPrice);
  const tagName = text(row?.tag?.name) || "Untagged";
  const color = tagColor(tagName, text(row?.tag?.color));
  return {
    ...row,
    key: text(row?.id) || `${text(row?.name)}-${index}`,
    name: text(row?.name) || "Untitled component",
    idCode: text(row?.idCode),
    quantity,
    oneKitQuantity: number(row?.oneKitQuantity),
    unitPrice,
    totalPrice: quantity * unitPrice,
    url: normalizedUrl(row?.url),
    tag: { name: tagName, color },
  };
}

function groupRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = `${lower(row.tag.name)}|${row.tag.color}`;
    if (!groups.has(key)) groups.set(key, { key, name: row.tag.name, color: row.tag.color, items: [] });
    groups.get(key).items.push(row);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.name.localeCompare(b.name)),
      quantity: group.items.reduce((sum, item) => sum + item.quantity, 0),
      value: group.items.reduce((sum, item) => sum + item.totalPrice, 0),
    }))
    .sort((a, b) => {
      const aUntagged = lower(a.name) === "untagged" || a.name === "-";
      const bUntagged = lower(b.name) === "untagged" || b.name === "-";
      if (aUntagged !== bUntagged) return aUntagged ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function responseFileName(response, fallback) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1] || match[2] || fallback);
  } catch {
    return match[1] || match[2] || fallback;
  }
}

function ExportModal({ onClose }) {
  const [fileType, setFileType] = useState("pdf");
  const [columns, setColumns] = useState(() => EXPORT_COLUMNS.filter((column) => column.checked).map((column) => column.value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggleColumn = (value) => {
    setColumns((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
    setError("");
  };

  const runExport = async () => {
    if (!columns.length) {
      setError("Choose at least one column.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const endpoint = fileType === "excel" ? "/api/stock/excel" : "/api/stock/pdf";
      const response = await fetch(`${endpoint}?columns=${encodeURIComponent(columns.join(","))}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "The stocktaking export failed.");
      }
      const fallback = fileType === "excel" ? "Stocktaking.xlsx" : "Stocktaking.pdf";
      downloadBlob(await response.blob(), responseFileName(response, fallback));
      onClose();
    } catch (exportError) {
      setError(exportError?.message || "The stocktaking export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="stock-export-modal" role="dialog" aria-modal="true" aria-labelledby="stock-export-title">
        <header>
          <div>
            <span className="pill">Stocktaking export</span>
            <h2 id="stock-export-title">Download stock file</h2>
            <p>Choose the file type and the columns that should appear.</p>
          </div>
          <button className="next-modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="stock-export-body">
          <fieldset>
            <legend>File type</legend>
            <div className="stock-export-types">
              <button className={fileType === "pdf" ? "active" : ""} type="button" onClick={() => setFileType("pdf")}>PDF</button>
              <button className={fileType === "excel" ? "active" : ""} type="button" onClick={() => setFileType("excel")}>Excel</button>
            </div>
          </fieldset>

          <fieldset>
            <legend>Columns</legend>
            <div className="stock-export-columns">
              {EXPORT_COLUMNS.map((column) => (
                <label key={column.value}>
                  <input type="checkbox" checked={columns.includes(column.value)} onChange={() => toggleColumn(column.value)} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer>
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary-button" type="button" onClick={runExport} disabled={busy}>{busy ? "Preparing…" : `Download ${fileType === "excel" ? "Excel" : "PDF"}`}</button>
        </footer>
      </section>
    </div>
  );
}

export default function StocktakingClient({ initialStock = [], bootstrapWarnings = [] }) {
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [view, setView] = useState("groups");

  const rows = useMemo(() => (Array.isArray(initialStock) ? initialStock : [])
    .map(normalizedRow)
    .filter((row) => row.quantity !== 0), [initialStock]);

  const filteredRows = useMemo(() => {
    const query = lower(search);
    if (!query) return rows;
    return rows.filter((row) => lower([row.name, row.idCode, row.tag.name, row.quantity, row.unitPrice].join(" ")).includes(query));
  }, [rows, search]);

  const groups = useMemo(() => groupRows(filteredRows), [filteredRows]);
  const totals = useMemo(() => ({
    records: rows.length,
    units: rows.reduce((sum, row) => sum + row.quantity, 0),
    positive: rows.filter((row) => row.quantity > 0).length,
    negative: rows.filter((row) => row.quantity < 0).length,
    value: rows.reduce((sum, row) => sum + row.totalPrice, 0),
  }), [rows]);

  return (
    <section className="next-stock-page">
      {bootstrapWarnings.length ? (
        <div className="dashboard-notice" role="status">
          <strong>Some stocktaking data may be temporarily unavailable.</strong>
          <span>The classic Stocktaking page remains available while the resource recovers.</span>
          <a href="/stocktaking">Open classic Stocktaking</a>
        </div>
      ) : null}

      <div className="stock-summary-grid">
        <article><span>Component records</span><strong>{totals.records}</strong><small>Non-zero stock rows</small></article>
        <article><span>Net units</span><strong className={totals.units < 0 ? "negative" : ""}>{totals.units.toLocaleString("en-EG")}</strong><small>Across all visible records</small></article>
        <article><span>Positive / withdrawal</span><strong>{totals.positive} <em>/</em> {totals.negative}</strong><small>Movement direction</small></article>
        <article><span>Estimated stock value</span><strong>{money(totals.value)}</strong><small>Quantity × unit price</small></article>
      </div>

      <div className="stock-toolbar">
        <label className="stock-search">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search components, IDs, or tags…" type="search" />
          {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button> : null}
        </label>
        <div className="stock-view-toggle" aria-label="View type">
          <button className={view === "groups" ? "active" : ""} type="button" onClick={() => setView("groups")}>Groups</button>
          <button className={view === "table" ? "active" : ""} type="button" onClick={() => setView("table")}>Table</button>
        </div>
        <button className="primary-button stock-download-button" type="button" onClick={() => setExportOpen(true)}>Download</button>
      </div>

      <div className="stock-results-line">
        <span>{filteredRows.length} of {rows.length} components</span>
        <a href="/stocktaking">Open classic Stocktaking</a>
      </div>

      {!filteredRows.length ? (
        <div className="stock-empty-state">
          <span>∅</span>
          <h2>No matching stock records</h2>
          <p>{search ? "Try another component name, ID code, or tag." : "There are no non-zero stock rows for this account."}</p>
        </div>
      ) : view === "table" ? (
        <div className="stock-flat-table-wrap">
          <table className="stock-flat-table">
            <thead><tr><th>Component</th><th>ID code</th><th>Tag</th><th className="number-cell">In stock</th><th className="number-cell">Unit price</th><th className="number-cell">Total value</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => {
                const tone = TAG_TONES[row.tag.color] || TAG_TONES.default;
                return (
                  <tr key={row.key}>
                    <td>{row.url ? <a href={row.url} target="_blank" rel="noreferrer">{row.name}</a> : <strong>{row.name}</strong>}</td>
                    <td>{row.idCode || "—"}</td>
                    <td><span className="stock-tag" style={{ backgroundColor: tone.background, color: tone.color, borderColor: tone.border }}>{row.tag.name}</span></td>
                    <td className={`number-cell ${row.quantity < 0 ? "stock-negative" : ""}`}>{row.quantity.toLocaleString("en-EG")}</td>
                    <td className="number-cell">{row.unitPrice ? money(row.unitPrice) : "—"}</td>
                    <td className={`number-cell ${row.totalPrice < 0 ? "stock-negative" : ""}`}>{row.unitPrice ? money(row.totalPrice) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="stock-group-grid">
          {groups.map((group) => {
            const tone = TAG_TONES[group.color] || TAG_TONES.default;
            return (
              <article className="stock-group-card" key={group.key} style={{ "--stock-accent": tone.color, "--stock-accent-soft": tone.background, "--stock-accent-border": tone.border }}>
                <header>
                  <div><span>Tag</span><strong>{group.name}</strong></div>
                  <div className="stock-group-totals"><span>{group.items.length} items</span><b>{group.quantity.toLocaleString("en-EG")} units</b></div>
                </header>
                <div className="stock-group-table-wrap">
                  <table>
                    <thead><tr><th>Component</th><th>ID code</th><th className="number-cell">In stock</th><th className="number-cell">Value</th></tr></thead>
                    <tbody>
                      {group.items.map((row) => (
                        <tr key={row.key}>
                          <td>{row.url ? <a href={row.url} target="_blank" rel="noreferrer">{row.name}</a> : <strong>{row.name}</strong>}</td>
                          <td>{row.idCode || "—"}</td>
                          <td className={`number-cell ${row.quantity < 0 ? "stock-negative" : ""}`}>{row.quantity.toLocaleString("en-EG")}</td>
                          <td className={`number-cell ${row.totalPrice < 0 ? "stock-negative" : ""}`}>{row.unitPrice ? money(row.totalPrice) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <footer><span>Estimated group value</span><strong>{money(group.value)}</strong></footer>
              </article>
            );
          })}
        </div>
      )}

      {exportOpen ? <ExportModal onClose={() => setExportOpen(false)} /> : null}
    </section>
  );
}

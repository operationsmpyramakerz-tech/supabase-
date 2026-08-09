"use client";

import { useEffect, useMemo, useState } from "react";

const EXPORT_COLUMNS = [
  { value: "stock", label: "Stock", checked: true },
  { value: "receiptNumber", label: "Receipt number", checked: false },
  { value: "unityPrice", label: "Unity price", checked: true },
  { value: "totalPrice", label: "Total price", checked: true },
  { value: "inventory", label: "Inventory", checked: false },
  { value: "defected", label: "Defected", checked: false },
];

const TAG_TONES = {
  gray: { background: "#F3F4F6", color: "#374151", border: "#E5E7EB" },
  brown: { background: "#EFEBE9", color: "#4E342E", border: "#D7CCC8" },
  orange: { background: "#FFF7ED", color: "#9A3412", border: "#FED7AA" },
  yellow: { background: "#FEFCE8", color: "#854D0E", border: "#FDE68A" },
  green: { background: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
  blue: { background: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
  purple: { background: "#F5F3FF", color: "#5B21B6", border: "#DDD6FE" },
  pink: { background: "#FDF2F8", color: "#9D174D", border: "#FBCFE8" },
  red: { background: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  default: { background: "#F3F4F6", color: "#111827", border: "#E5E7EB" },
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
  const tagName = text(row?.tag?.name) || "Untagged";
  return {
    ...row,
    key: text(row?.id) || `${text(row?.name)}-${index}`,
    name: text(row?.name) || "Untitled component",
    idCode: text(row?.idCode),
    quantity: number(row?.quantity),
    unitPrice: number(row?.unitPrice),
    url: normalizedUrl(row?.url),
    tag: { name: tagName, color: tagColor(tagName, text(row?.tag?.color)) },
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
    .map((group) => ({ ...group, items: [...group.items].sort((a, b) => a.name.localeCompare(b.name)) }))
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

function Icon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    chevron: <polyline points="6 9 12 15 18 9" />,
    check: <polyline points="20 6 9 17 4 12" />,
  };
  return <svg {...common}>{paths[name] || paths.download}</svg>;
}

function ExportModal({ onClose }) {
  const [fileType, setFileType] = useState("pdf");
  const [columns, setColumns] = useState(() => EXPORT_COLUMNS.filter((column) => column.checked).map((column) => column.value));
  const [fileTypeOpen, setFileTypeOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const toggleColumn = (value) => {
    setColumns((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
    setError("");
  };

  const runExport = async () => {
    if (!columns.length) {
      setError("Please choose at least one column.");
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
    <div className="b2b-export-modal next-stock-export-modal">
      <div className="b2b-export-modal__backdrop" onClick={!busy ? onClose : undefined} />
      <div className="b2b-export-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="stockExportTitle">
        <div className="b2b-export-modal__header">
          <div className="b2b-export-modal__icon" aria-hidden="true"><Icon name="download" /></div>
          <div><h3 className="b2b-export-modal__title" id="stockExportTitle">Download stock file</h3><p className="b2b-export-modal__hint">Choose the file type and the columns that should appear in the file.</p></div>
          <button className="b2b-export-modal__close" type="button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        </div>
        <div className="b2b-export-modal__body">
          <div className="b2b-export-field b2b-export-filetype">
            <span className="b2b-export-field__label">File type</span>
            <button className={`b2b-export-picker-button ${fileTypeOpen ? "is-open" : ""}`} type="button" aria-expanded={fileTypeOpen} onClick={() => { setFileTypeOpen((value) => !value); setColumnsOpen(false); }}><span>{fileType === "excel" ? "Excel" : "PDF"}</span><Icon name="chevron" /></button>
            <div className="b2b-export-filetype__panel b2b-export-floating-panel" role="listbox" aria-label="File type" hidden={!fileTypeOpen}>
              {["pdf", "excel"].map((value) => <button className={`b2b-export-option ${fileType === value ? "is-selected" : ""}`} type="button" role="option" aria-selected={fileType === value} onClick={() => { setFileType(value); setFileTypeOpen(false); }} key={value}><span>{value === "excel" ? "Excel" : "PDF"}</span>{fileType === value ? <Icon name="check" /> : <Icon name="check" />}</button>)}
            </div>
          </div>

          <div className="b2b-export-field b2b-export-multiselect">
            <span className="b2b-export-field__label">Columns</span>
            <button className={`b2b-export-multiselect__button ${columnsOpen ? "is-open" : ""}`} type="button" aria-expanded={columnsOpen} onClick={() => { setColumnsOpen((value) => !value); setFileTypeOpen(false); }}><span>{columns.length} columns selected</span><Icon name="chevron" /></button>
            <div className="b2b-export-multiselect__panel b2b-export-floating-panel" role="listbox" aria-label="Columns" hidden={!columnsOpen}>
              <div className="b2b-export-columns">
                {EXPORT_COLUMNS.map((column) => <label className="b2b-export-check" role="option" key={column.value}><input type="checkbox" value={column.value} checked={columns.includes(column.value)} onChange={() => toggleColumn(column.value)} /><span>{column.label}</span></label>)}
              </div>
            </div>
          </div>
          <div className="b2b-export-modal__error next-stock-export-error" hidden={!error}>{error}</div>
        </div>
        <div className="b2b-export-modal__footer">
          <button className="btn btn--light" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`btn b2b-export-confirm ${busy ? "is-busy" : ""}`} type="button" onClick={runExport} disabled={busy}><Icon name="download" /><span>{busy ? "Preparing…" : "Download"}</span></button>
        </div>
      </div>
    </div>
  );
}

export default function StocktakingClient({ initialStock = [], bootstrapWarnings = [] }) {
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = "Search components...";
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.value = "";
      input.placeholder = "Search";
    };
  }, []);

  const rows = useMemo(() => (Array.isArray(initialStock) ? initialStock : [])
    .map(normalizedRow)
    .filter((row) => row.quantity !== 0), [initialStock]);

  const filteredRows = useMemo(() => {
    const query = lower(search);
    if (!query) return rows;
    return rows.filter((row) => lower([row.name, row.idCode, row.tag.name, row.quantity].join(" ")).includes(query));
  }, [rows, search]);

  const groups = useMemo(() => groupRows(filteredRows), [filteredRows]);

  return (
    <section className="next-stocktaking-classic-parity">
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some stocktaking data may be temporarily unavailable.</strong><span>The classic Stocktaking page remains available while the resource recovers.</span><a href="/stocktaking?classic=1">Open classic Stocktaking</a></div> : null}

      <section className="card">
        <div className="card-toolbar"><button className="btn b2b-download-primary" type="button" onClick={() => setExportOpen(true)}><Icon name="download" /><span>Download</span></button></div>
        <div className="groups-grid" aria-live="polite">
          {!groups.length ? (
            <div className="empty-block empty-block--no-data">Sorry, No data available</div>
          ) : groups.map((group) => {
            const tone = TAG_TONES[group.color] || TAG_TONES.default;
            return (
              <section className="card card--elevated group-card" style={{ "--group-accent-bg": tone.background, "--group-accent-text": tone.color, "--group-accent-border": tone.border }} key={group.key}>
                <div className="group-card__head">
                  <div className="group-head-left"><span className="group-title">Tag</span><span className="group-tag"><span className={`tag-pill tag--${group.color}`}>{group.name}</span></span></div>
                  <div className="group-head-right"><span className="group-count">{group.items.length} items</span></div>
                </div>
                <div className="group-table-wrap">
                  <table className="group-table">
                    <thead><tr><th>Component</th><th className="col-num">In Stock</th></tr></thead>
                    <tbody>{group.items.map((row) => <tr key={row.key}><td style={{ fontWeight: 600 }}>{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer" className="component-link">{row.name}</a> : row.name}</td><td className="col-num">{row.quantity}</td></tr>)}</tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {exportOpen ? <ExportModal onClose={() => setExportOpen(false)} /> : null}
    </section>
  );
}

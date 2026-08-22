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
    receiptNumber: text(row?.receiptNumber),
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
    folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></>,
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
  };
  return <svg {...common}>{paths[name] || paths.download}</svg>;
}

function ExportModal({ onClose, columnKey = "" }) {
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
      const params = new URLSearchParams({ columns: columns.join(",") });
      if (columnKey) params.set("column", columnKey);
      const response = await fetch(`${endpoint}?${params.toString()}`, {
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
      const fallback = fileType === "excel" ? "Stocktaking.plse" : "Stocktaking.pdf";
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

export default function StocktakingClient({ initialStock = [], initialColumns = [] }) {
  const fallbackColumn = useMemo(() => {
    const first = (Array.isArray(initialStock) ? initialStock : []).find((item) => text(item?.quantityColumn));
    const key = text(first?.quantityColumn);
    return key ? { key, label: key.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase()), itemsCount: initialStock.length } : null;
  }, [initialStock]);

  const columns = useMemo(() => {
    const list = Array.isArray(initialColumns) ? initialColumns : [];
    if (list.length) return list
      .map((item) => ({
        key: text(item?.key || item?.column || item?.value),
        label: text(item?.label || item?.value || item?.key || item?.column),
        itemsCount: Number.isFinite(Number(item?.itemsCount)) ? Number(item.itemsCount) : null,
      }))
      .filter((item) => item.key && item.label);
    return fallbackColumn ? [fallbackColumn] : [];
  }, [initialColumns, fallbackColumn]);

  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState(null);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
    if (!input) return undefined;
    input.value = "";
    input.placeholder = activeColumn ? `Search ${activeColumn.label}...` : "Search stock folders...";
    const handle = (event) => setSearch(event.target.value || "");
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && input.value) {
        input.value = "";
        setSearch("");
      }
    };
    input.addEventListener("input", handle);
    input.addEventListener("keydown", handleKeyDown);
    return () => {
      input.removeEventListener("input", handle);
      input.removeEventListener("keydown", handleKeyDown);
      input.value = "";
      input.placeholder = "Search";
    };
  }, [activeColumn?.key, activeColumn?.label]);

  useEffect(() => {
    if (!columns.length || typeof window === "undefined") return;
    const key = text(new URLSearchParams(window.location.search).get("column"));
    if (!key) return;
    const match = columns.find((item) => item.key === key);
    if (match) openFolder(match, { updateHistory: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.map((item) => item.key).join("|")]);

  async function loadColumn(column) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/stock?column=${encodeURIComponent(column.key)}&_fresh=1`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body)) throw new Error(body?.error || "Failed to load this Stocktaking folder.");
      setStock(body);
    } catch (loadError) {
      setStock([]);
      setError(loadError?.message || "Failed to load this Stocktaking folder.");
    } finally {
      setLoading(false);
    }
  }

  function openFolder(column, options = {}) {
    setActiveColumn(column);
    setSearch("");
    setExportOpen(false);
    if (typeof window !== "undefined") {
      const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
      if (input) input.value = "";
      if (options.updateHistory !== false) {
        const url = new URL(window.location.href);
        url.searchParams.set("column", column.key);
        window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
      }
    }
    loadColumn(column);
  }

  function closeFolder() {
    setActiveColumn(null);
    setStock([]);
    setSearch("");
    setError("");
    setExportOpen(false);
    if (typeof window !== "undefined") {
      const input = document.querySelector(".classic-app-shell .main-header .searchbar input");
      if (input) input.value = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("column");
      const query = url.searchParams.toString();
      window.history.pushState({}, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePopState = () => {
      const key = text(new URLSearchParams(window.location.search).get("column"));
      if (!key) {
        setActiveColumn(null);
        setStock([]);
        setSearch("");
        setError("");
        return;
      }
      const match = columns.find((item) => item.key === key);
      if (match && match.key !== activeColumn?.key) openFolder(match, { updateHistory: false });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [columns, activeColumn?.key]);

  const visibleFolders = useMemo(() => {
    const query = lower(search);
    if (!query) return columns;
    return columns.filter((item) => lower(item.label).includes(query) || lower(item.key).includes(query));
  }, [columns, search]);

  const rows = useMemo(() => (Array.isArray(stock) ? stock : [])
    .map(normalizedRow)
    .filter((row) => row.quantity !== 0), [stock]);

  const filteredRows = useMemo(() => {
    const query = lower(search);
    if (!query) return rows;
    return rows.filter((row) => lower(row.name).includes(query) || lower(row.receiptNumber).includes(query));
  }, [rows, search]);


  return (
    <section className="next-stocktaking-classic-parity next-stocktaking-folders-page">
      {!activeColumn ? (
        <section className="card stocktaking-folders-card">
          <div className="stocktaking-folders-head">
            <div>
              <span className="stocktaking-folders-kicker">STOCKTAKING COLUMNS</span>
              <h2>Stock Folders</h2>
            </div>
            <span className="stocktaking-folders-count">{visibleFolders.length} folder{visibleFolders.length === 1 ? "" : "s"}</span>
          </div>

          <div className="stocktaking-folder-grid" aria-live="polite">
            {visibleFolders.length ? visibleFolders.map((column) => (
              <article className="products-proposal-folder stocktaking-proposal-folder" key={column.key}>
                <button className="products-proposal-folder__main stocktaking-proposal-folder__main" type="button" onClick={() => openFolder(column)} aria-label={`Open ${column.label}`}>
                  <span className="proposal-folder-figure stocktaking-proposal-folder-figure" aria-hidden="true">
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--left" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--middle" />
                    <span className="proposal-folder-figure__paper proposal-folder-figure__paper--right" />
                    <span className="proposal-folder-figure__back" />
                    <span className="proposal-folder-figure__front"><small>S</small></span>
                  </span>
                  <span className="proposal-folder-copy stocktaking-proposal-folder-copy">
                    <strong>{column.label}</strong>
                    <em>Stocktaking</em>
                  </span>
                  <span className="proposal-folder-count stocktaking-proposal-folder-count">
                    <span aria-hidden="true">▱</span>
                    <span>{column.itemsCount === null ? "Stock items" : `${column.itemsCount} item${column.itemsCount === 1 ? "" : "s"}`}</span>
                  </span>
                </button>
              </article>
            )) : (
              <div className="empty-block empty-block--no-data stocktaking-folder-empty">Sorry, No stock folders available</div>
            )}
          </div>
        </section>
      ) : (
        <section className="card stocktaking-folder-workspace">
          <div className="stocktaking-folder-toolbar">
            <div className="stocktaking-folder-title">
              <button className="stocktaking-folder-back" type="button" onClick={closeFolder} aria-label="Back to stock folders"><Icon name="arrowLeft" /></button>
              <span className="stocktaking-folder-title-icon"><Icon name="folder" /></span>
              <div><span>STOCKTAKING</span><h2>{activeColumn.label}</h2></div>
            </div>
            <button className="btn b2b-download-primary" type="button" onClick={() => setExportOpen(true)} disabled={loading || Boolean(error)}><Icon name="download" /><span>Download</span></button>
          </div>

          {loading ? (
            <div className="stocktaking-folder-state"><span className="stocktaking-folder-spinner" />Loading stocktaking...</div>
          ) : error ? (
            <div className="stocktaking-folder-state is-error"><span>{error}</span><button type="button" onClick={() => loadColumn(activeColumn)}>Try again</button></div>
          ) : (
            <div className="stocktaking-data-table-wrap" aria-live="polite">
              {!filteredRows.length ? (
                <div className="empty-block empty-block--no-data">Sorry, No data available</div>
              ) : (
                <table className="stocktaking-data-table">
                  <thead>
                    <tr>
                      <th>Components</th>
                      <th className="stocktaking-data-qty">Qty</th>
                      <th className="stocktaking-data-receipt">Receipt no.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.key}>
                        <td className="stocktaking-data-component">{row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer" className="component-link">{row.name}</a> : row.name}</td>
                        <td className="stocktaking-data-qty">{row.quantity}</td>
                        <td className="stocktaking-data-receipt"><span>{row.receiptNumber || "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      )}

      {exportOpen && activeColumn ? <ExportModal columnKey={activeColumn.key} onClose={() => setExportOpen(false)} /> : null}
    </section>
  );
}

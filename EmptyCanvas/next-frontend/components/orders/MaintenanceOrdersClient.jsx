"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_TABS = [
  { key: "all", label: "All", icon: "▦" },
  { key: "not-started", label: "Not started", icon: "○" },
  { key: "in-progress", label: "In progress", icon: "↻" },
  { key: "done", label: "Done", icon: "✓" },
];

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date.getTime()) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function orderTypeKey(value) {
  return lower(value).replace(/[^a-z0-9]/g, "");
}

function isMaintenanceOrder(value) {
  return orderTypeKey(value) === "requestmaintenance";
}

function statusIndex(value) {
  const status = lower(value).replace(/[_-]+/g, " ");
  if (/(archive|archived)/.test(status)) return 5;
  if (/(arrived|delivered|received|done|complete)/.test(status)) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(status)) return 3;
  if (/(in progress|inprogress|progress|approved)/.test(status)) return 2;
  return 1;
}

function groupKey(item, index) {
  const number = Number(item?.orderIdNumber);
  if (Number.isFinite(number)) return `order:${number}`;
  const direct = text(item?.orderId);
  if (direct && direct !== `ORD-${text(item?.id)}`) return `order:${direct}`;
  const date = text(item?.createdTime).slice(0, 16);
  const owner = lower(item?.createdByName ?? item?.teamMemberId);
  const reason = lower(item?.reason ?? item?.issueDescription);
  const fallback = `${date}|${owner}|${reason}`;
  return fallback.replace(/\|/g, "") ? fallback : `row:${text(item?.id) || index}`;
}

function orderIdLabel(items) {
  const explicit = [...new Set(items.map((item) => text(item?.orderId)).filter(Boolean))];
  if (explicit.length === 1) return explicit[0];
  const numbers = [...new Set(items.map((item) => Number(item?.orderIdNumber)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (numbers.length === 1) return `ORD-${numbers[0]}`;
  if (numbers.length > 1) return `ORD-${numbers[0]} : ORD-${numbers[numbers.length - 1]}`;
  if (explicit.length > 1) return `${explicit[0]} : ${explicit[explicit.length - 1]}`;
  return "Maintenance order";
}

function splitNames(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizeSpareEntries(item = {}) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const id = text(entry?.id ?? entry?.productId ?? entry?.sparePartId);
    let name = text(entry?.name ?? entry?.label ?? entry?.component ?? entry?.sparePartName);
    let qty = Number(entry?.qty ?? entry?.quantity ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    qty = Math.max(1, Math.round(qty));
    const qtyMatch = name.match(/(?:\s*[x×]\s*|\s*\(\s*qty\s*:?\s*)(\d+(?:\.\d+)?)\s*\)?\s*$/i);
    if (qtyMatch) {
      const parsed = Number(qtyMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) qty = Math.max(1, Math.round(parsed));
      name = name.slice(0, qtyMatch.index).trim();
    }
    const key = `${id || lower(name)}|${qty}`;
    if ((!id && !name) || seen.has(key)) return;
    seen.add(key);
    entries.push({ id, name, qty });
  };

  if (Array.isArray(item?.sparePartsReplacedEntries)) item.sparePartsReplacedEntries.forEach(add);
  if (!entries.length) {
    const ids = splitNames(item?.sparePartsReplacedIds?.length ? item.sparePartsReplacedIds : item?.sparePartsReplacedId);
    const names = splitNames(item?.sparePartsReplacedNames?.length ? item.sparePartsReplacedNames : item?.sparePartsReplacedName);
    if (ids.length) ids.forEach((id, index) => add({ id, name: names[index] || "" }));
    else names.forEach((name) => add({ name }));
  }
  return entries;
}

function itemHasMaintenanceLog(item = {}) {
  return Boolean(
    text(item?.resolutionMethod) ||
    text(item?.actualIssueDescription) ||
    text(item?.repairAction) ||
    normalizeSpareEntries(item).length
  );
}

function issueText(item = {}) {
  return text(item?.issueDescription ?? item?.reason) || "No issue description";
}

function receiptEntriesFromItem(item = {}) {
  const entries = [];
  const add = (entry = {}, fallbackName = "Signed maintenance report") => {
    const url = text(entry?.url ?? entry?.rawUrl ?? entry?.raw);
    const name = text(entry?.name ?? entry?.filename) || fallbackName;
    if (url) entries.push({ name, url });
  };

  const direct = []
    .concat(Array.isArray(item?.maintenanceReceiptEntries) ? item.maintenanceReceiptEntries : [])
    .concat(Array.isArray(item?.orderReceiptEntries) ? item.orderReceiptEntries : []);
  direct.forEach((entry) => add(entry));

  const urls = []
    .concat(Array.isArray(item?.maintenanceReceiptUrls) ? item.maintenanceReceiptUrls : [item?.maintenanceReceiptUrl])
    .concat(Array.isArray(item?.orderReceiptUrls) ? item.orderReceiptUrls : [item?.orderReceiptUrl]);
  const names = []
    .concat(Array.isArray(item?.maintenanceReceiptNames) ? item.maintenanceReceiptNames : [item?.maintenanceReceiptName])
    .concat(Array.isArray(item?.orderReceiptNames) ? item.orderReceiptNames : [item?.orderReceiptName]);
  urls.filter(Boolean).forEach((url, index) => add({ url, name: names[index] }, `Signed report ${index + 1}`));
  return entries;
}

function maintenanceState(group) {
  if (group.stage >= 4) return { key: "done", label: "Done", className: "status-done", step: 3 };
  if (group.hasLog) return { key: "in-progress", label: "In progress", className: "status-in-progress", step: 2 };
  return { key: "not-started", label: "Not started", className: "status-not-started", step: 1 };
}

function buildGroups(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])]
    .filter((item) => isMaintenanceOrder(item?.orderType))
    .sort((a, b) => dateValue(b?.createdTime) - dateValue(a?.createdTime));
  const map = new Map();

  sorted.forEach((item, index) => {
    const key = groupKey(item, index);
    if (!map.has(key)) {
      map.set(key, {
        key,
        items: [],
        latestCreated: item?.createdTime,
        createdByName: item?.createdByName,
        operationsByName: item?.operationsByName,
      });
    }
    const group = map.get(key);
    group.items.push(item);
    if (dateValue(item?.createdTime) > dateValue(group.latestCreated)) group.latestCreated = item?.createdTime;
    if (!group.createdByName && item?.createdByName) group.createdByName = item.createdByName;
    if (!group.operationsByName && item?.operationsByName) group.operationsByName = item.operationsByName;
  });

  return [...map.values()].map((group) => {
    const stage = Math.max(...group.items.map((item) => statusIndex(item?.status)), 1);
    const issues = [...new Set(group.items.map(issueText).filter(Boolean))];
    const hasLog = group.items.some(itemHasMaintenanceLog);
    const receiptEntries = [];
    const receiptSeen = new Set();
    group.items.flatMap(receiptEntriesFromItem).forEach((entry) => {
      const key = `${entry.url}|${entry.name}`;
      if (!receiptSeen.has(key)) {
        receiptSeen.add(key);
        receiptEntries.push(entry);
      }
    });
    const receiptNumbers = [...new Set(group.items.flatMap((item) => splitNames(item?.receiptNumber)))];
    const spareParts = group.items.flatMap(normalizeSpareEntries);
    const state = maintenanceState({ stage, hasLog });
    return {
      ...group,
      stage,
      hasLog,
      state,
      issues,
      issueSummary: issues.join(" • ") || "No issue description",
      orderIdLabel: orderIdLabel(group.items),
      orderIds: group.items.map((item) => text(item?.id)).filter(Boolean),
      receiptEntries,
      receiptNumbers,
      spareParts,
    };
  }).filter((group) => group.stage < 5);
}

function groupSearchText(group) {
  return lower([
    group.orderIdLabel,
    group.issueSummary,
    group.createdByName,
    group.operationsByName,
    ...group.receiptNumbers,
    ...group.items.flatMap((item) => [
      item?.productName,
      item?.issueDescription,
      item?.actualIssueDescription,
      item?.repairAction,
      item?.resolutionMethod,
      item?.sparePartsReplacedName,
      ...(Array.isArray(item?.sparePartsReplacedNames) ? item.sparePartsReplacedNames : []),
    ]),
  ].filter(Boolean).join(" "));
}

async function readJson(response) {
  const data = await response.json().catch(() => null);
  return data;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "The maintenance action failed.");
  return data;
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

function reportFileName(group, extension) {
  const safe = text(group?.orderIdLabel).replace(/[^a-z0-9_-]+/gi, "-") || "maintenance-order";
  return `${safe}.${extension}`;
}

function Progress({ state }) {
  const steps = ["Not started", "In progress", "Done"];
  return (
    <div className="maintenance-progress" aria-label={`Maintenance status: ${state.label}`}>
      {steps.map((label, index) => (
        <div className={`maintenance-progress__step ${index + 1 <= state.step ? "is-complete" : ""}`} key={label}>
          <span>{index + 1}</span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}

function MaintenanceCard({ group, onOpen }) {
  return (
    <button type="button" className="next-order-card maintenance-order-card" onClick={() => onOpen(group)}>
      <div className="next-order-card__top">
        <span className="order-type-badge type-maintenance"><b>⌘</b>Request Maintenance</span>
        <span className={`order-status ${group.state.className}`}>{group.state.label}</span>
      </div>
      <h3>{group.orderIdLabel}</h3>
      <p className="next-order-card__reason maintenance-card-issue">{group.issueSummary}</p>
      <div className="maintenance-card-meta">
        <span><small>Components</small><strong>{group.items.length}</strong></span>
        <span><small>Created by</small><strong>{group.createdByName || "Unknown"}</strong></span>
        <span><small>Technician</small><strong>{group.operationsByName || "Not assigned"}</strong></span>
        <span><small>Signed reports</small><strong>{group.receiptEntries.length}</strong></span>
      </div>
      <div className="next-order-card__bottom">
        <span><small>Date</small><strong>{formatDate(group.latestCreated)}</strong></span>
        <span><small>Spare parts</small><strong>{group.spareParts.length || "None"}</strong></span>
      </div>
    </button>
  );
}

function MaintenanceDetailsModal({ group, busy, onClose, onLog, onDone, onExport }) {
  useEffect(() => {
    if (!group) return undefined;
    document.body.classList.add("next-modal-open");
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("next-modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [group, onClose]);

  if (!group) return null;
  const canLog = group.state.key === "not-started";
  const canDone = group.state.key === "in-progress";
  const canDownload = ["in-progress", "done"].includes(group.state.key);

  return (
    <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="next-order-modal maintenance-order-modal" role="dialog" aria-modal="true" aria-labelledby="maintenance-order-title">
        <header className="next-order-modal__header">
          <div>
            <span className="order-type-badge type-maintenance"><b>⌘</b>Request Maintenance</span>
            <h2 id="maintenance-order-title">{group.orderIdLabel}</h2>
            <p>{formatDate(group.latestCreated)} · {group.createdByName || "Unknown creator"}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </header>

        <Progress state={group.state} />

        <div className="next-order-modal__meta maintenance-modal-meta">
          <span><small>Components</small><strong>{group.items.length}</strong></span>
          <span><small>Technician</small><strong>{group.operationsByName || "—"}</strong></span>
          <span><small>Receipt numbers</small><strong>{group.receiptNumbers.join(", ") || "—"}</strong></span>
          <span><small>Signed reports</small><strong>{group.receiptEntries.length}</strong></span>
        </div>

        {group.receiptEntries.length ? (
          <div className="maintenance-reports">
            <strong>Signed maintenance reports</strong>
            <div>
              {group.receiptEntries.map((entry, index) => (
                <a href={entry.url} target="_blank" rel="noreferrer" key={`${entry.url}-${index}`}>{entry.name}</a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="next-order-items maintenance-order-items">
          {group.items.map((item, index) => {
            const spares = normalizeSpareEntries(item);
            return (
              <article className="next-order-item maintenance-order-item" key={text(item?.id)}>
                <span className="next-order-item__image">{text(item?.productName).slice(0, 1).toUpperCase() || "M"}</span>
                <div className="next-order-item__body">
                  <strong>{text(item?.productName) || `Component ${index + 1}`}</strong>
                  <p className="maintenance-issue"><b>Issue:</b> {issueText(item)}</p>
                  {text(item?.resolutionMethod) ? <p><b>Resolution:</b> {text(item.resolutionMethod)}</p> : null}
                  {text(item?.actualIssueDescription) ? <p><b>Actual issue:</b> {text(item.actualIssueDescription)}</p> : null}
                  {text(item?.repairAction) ? <p><b>Repair action:</b> {text(item.repairAction)}</p> : null}
                  {spares.length ? (
                    <p><b>Spare parts:</b> {spares.map((part) => `${part.name || part.id}${part.qty > 1 ? ` ×${part.qty}` : ""}`).join(", ")}</p>
                  ) : null}
                </div>
                <div className="next-order-item__aside">
                  <span className={`order-status ${itemHasMaintenanceLog(item) ? "status-in-progress" : "status-not-started"}`}>
                    {itemHasMaintenanceLog(item) ? "Logged" : "Pending log"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="next-order-modal__actions maintenance-modal-actions">
          {canLog ? <button type="button" className="primary-button" onClick={() => onLog(group)} disabled={busy}>Log Maintenance</button> : null}
          {canDone ? <button type="button" className="primary-button" onClick={() => onDone(group)} disabled={busy}>Mark Done</button> : null}
          {canDownload ? <button type="button" className="secondary-button" onClick={() => onExport("pdf", group)} disabled={busy}>Maintenance PDF</button> : null}
          {canDownload ? <button type="button" className="secondary-button" onClick={() => onExport("excel", group)} disabled={busy}>Excel</button> : null}
          <a className="secondary-button" href={`/orders/maintenance-orders?tab=${encodeURIComponent(group.state.key)}&classic=1`}>Classic workflow</a>
          <button type="button" className="primary-button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}

function emptyLogForItem(item) {
  const existingSpares = normalizeSpareEntries(item);
  return {
    orderId: text(item?.id),
    productName: text(item?.productName) || "Component",
    issueDescription: issueText(item),
    resolutionMethod: text(item?.resolutionMethod),
    actualIssueDescription: text(item?.actualIssueDescription),
    repairAction: text(item?.repairAction),
    spareParts: existingSpares.length ? existingSpares : [{ id: "", name: "", qty: 1 }],
  };
}

function MaintenanceLogModal({ group, options, busy, error, onCancel, onSubmit }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    setLogs(group ? group.items.map(emptyLogForItem) : []);
  }, [group]);

  if (!group) return null;
  const resolutionMethods = Array.isArray(options?.resolutionMethods) ? options.resolutionMethods : [];
  const spareOptions = Array.isArray(options?.spareParts) ? options.spareParts : [];

  function patchLog(index, patch) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  function patchSpare(logIndex, spareIndex, patch) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const spareParts = entry.spareParts.map((part, partIndex) => partIndex === spareIndex ? { ...part, ...patch } : part);
      return { ...entry, spareParts };
    }));
  }

  function addSpare(logIndex) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === logIndex
      ? { ...entry, spareParts: [...entry.spareParts, { id: "", name: "", qty: 1 }] }
      : entry));
  }

  function removeSpare(logIndex, spareIndex) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const spareParts = entry.spareParts.filter((_, partIndex) => partIndex !== spareIndex);
      return { ...entry, spareParts: spareParts.length ? spareParts : [{ id: "", name: "", qty: 1 }] };
    }));
  }

  function submit(event) {
    event.preventDefault();
    const normalized = logs.map((entry) => {
      const spareParts = entry.spareParts.map((part) => {
        const id = text(part?.id);
        const selected = spareOptions.find((option) => text(option?.id) === id);
        const name = text(selected?.name ?? part?.name);
        const qtyValue = Number(part?.qty);
        const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? Math.max(1, Math.round(qtyValue)) : 1;
        return { id, name, qty };
      }).filter((part) => part.id || part.name);
      return {
        orderId: entry.orderId,
        resolutionMethod: text(entry.resolutionMethod),
        actualIssueDescription: text(entry.actualIssueDescription),
        repairAction: text(entry.repairAction),
        spareParts,
        sparePartIds: spareParts.map((part) => part.id).filter(Boolean),
        sparePartNames: spareParts.map((part) => part.name).filter(Boolean),
      };
    });
    onSubmit(normalized);
  }

  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="maintenance-log-modal" onSubmit={submit}>
        <header>
          <div>
            <span className="pill">Maintenance log</span>
            <h2>{group.orderIdLabel}</h2>
            <p>Record the diagnosis and repair details for each component. Spare parts are optional.</p>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} disabled={busy}>×</button>
        </header>

        <div className="maintenance-log-list">
          {logs.map((entry, logIndex) => (
            <article className="maintenance-log-card" key={entry.orderId || logIndex}>
              <div className="maintenance-log-card__head">
                <div><small>Component {logIndex + 1}</small><strong>{entry.productName}</strong></div>
                <p>{entry.issueDescription}</p>
              </div>
              <div className="maintenance-log-grid">
                <label>
                  <span>Resolution method</span>
                  <select value={entry.resolutionMethod} onChange={(event) => patchLog(logIndex, { resolutionMethod: event.target.value })} disabled={busy}>
                    <option value="">Select method</option>
                    {resolutionMethods.map((option) => <option value={text(option?.name)} key={text(option?.name)}>{text(option?.name)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Actual issue description</span>
                  <textarea value={entry.actualIssueDescription} onChange={(event) => patchLog(logIndex, { actualIssueDescription: event.target.value })} disabled={busy} rows={3} />
                </label>
                <label className="maintenance-log-grid__wide">
                  <span>Repair action</span>
                  <textarea value={entry.repairAction} onChange={(event) => patchLog(logIndex, { repairAction: event.target.value })} disabled={busy} rows={3} />
                </label>
              </div>
              <div className="maintenance-spares">
                <div className="maintenance-spares__heading"><strong>Spare parts replaced</strong><button type="button" onClick={() => addSpare(logIndex)} disabled={busy}>+ Add spare part</button></div>
                {entry.spareParts.map((part, spareIndex) => (
                  <div className="maintenance-spare-row" key={`${logIndex}-${spareIndex}`}>
                    <select value={part.id || part.name} onChange={(event) => {
                      const value = event.target.value;
                      const selected = spareOptions.find((option) => text(option?.id) === value);
                      patchSpare(logIndex, spareIndex, { id: selected ? value : "", name: selected ? text(selected?.name) : value });
                    }} disabled={busy}>
                      <option value="">Select component</option>
                      {part.name && !part.id ? <option value={part.name}>{part.name}</option> : null}
                      {spareOptions.map((option) => <option value={text(option?.id)} key={text(option?.id)}>{text(option?.name)}</option>)}
                    </select>
                    <input type="number" min="1" step="1" value={part.qty} onChange={(event) => patchSpare(logIndex, spareIndex, { qty: event.target.value })} disabled={busy} aria-label="Spare part quantity" />
                    <button type="button" onClick={() => removeSpare(logIndex, spareIndex)} disabled={busy || entry.spareParts.length <= 1} aria-label="Remove spare part">×</button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        {error ? <div className="form-error">{error}</div> : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save Maintenance Log"}</button>
        </footer>
      </form>
    </div>
  );
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name || "image"}.`)); };
    image.src = url;
  });
}

async function fileToOptimizedDataUrl(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Signed reports must be image files.");
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const maxSide = 1600;
  let scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  let quality = 0.78;
  let dataUrl = "";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= 900_000) break;
    scale *= 0.86;
    quality = Math.max(0.58, quality - 0.05);
  }

  return dataUrl;
}

function MarkDoneModal({ group, busy, error, onCancel, onSubmit }) {
  const [files, setFiles] = useState([]);
  const [receiptNumbers, setReceiptNumbers] = useState("");
  const requiresReceiptNumbers = Boolean(group?.spareParts?.length);

  useEffect(() => {
    setFiles([]);
    setReceiptNumbers("");
  }, [group?.key]);

  if (!group) return null;

  function submit(event) {
    event.preventDefault();
    onSubmit({ files, receiptNumbers });
  }

  return (
    <div className="next-modal-backdrop next-modal-backdrop--front" role="presentation">
      <form className="next-password-modal maintenance-done-modal" onSubmit={submit}>
        <span className="password-modal-icon">✓</span>
        <h2>Complete maintenance order</h2>
        <p>Upload at least one image of the signed maintenance report. Images are optimized before upload.</p>
        {requiresReceiptNumbers ? (
          <label>
            <span>Store receipt numbers</span>
            <textarea value={receiptNumbers} onChange={(event) => setReceiptNumbers(event.target.value)} placeholder="One number per line or separated by commas" disabled={busy} rows={3} />
            <small>Required because spare parts were replaced.</small>
          </label>
        ) : null}
        <label className="maintenance-file-field">
          <span>Signed report images</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 4))} disabled={busy} />
          <small>{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "PNG, JPG or WEBP · up to 4 images"}</small>
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="next-password-modal__actions">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy || !files.length}>{busy ? "Uploading…" : "Mark Done"}</button>
        </div>
      </form>
    </div>
  );
}

export default function MaintenanceOrdersClient({ initialOrders = [], initialOptions = {}, bootstrapWarnings = [] }) {
  const [orders, setOrders] = useState(Array.isArray(initialOrders) ? initialOrders : []);
  const [options, setOptions] = useState(initialOptions && typeof initialOptions === "object" ? initialOptions : {});
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [logGroup, setLogGroup] = useState(null);
  const [doneGroup, setDoneGroup] = useState(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(36);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (STATUS_TABS.some((item) => item.key === requestedTab)) setTab(requestedTab);
    if (params.get("q")) setQuery(params.get("q"));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (tab === "all") params.delete("tab"); else params.set("tab", tab);
    if (!query.trim()) params.delete("q"); else params.set("q", query.trim());
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    setVisibleLimit(36);
  }, [tab, query]);

  const groups = useMemo(() => buildGroups(orders), [orders]);
  const tabCounts = useMemo(() => {
    const counts = { all: groups.length, "not-started": 0, "in-progress": 0, done: 0 };
    groups.forEach((group) => { counts[group.state.key] = (counts[group.state.key] || 0) + 1; });
    return counts;
  }, [groups]);

  const visibleGroups = useMemo(() => {
    const needle = lower(query);
    return groups.filter((group) => {
      if (tab !== "all" && group.state.key !== tab) return false;
      return !needle || groupSearchText(group).includes(needle);
    });
  }, [groups, tab, query]);

  async function refreshOrders() {
    const response = await fetch("/api/orders/requested?scope=all-system&_fresh=1", {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.href = "/login?next=/next/maintenance-orders";
      return;
    }
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || "Failed to refresh Maintenance Orders.");
    setOrders(Array.isArray(data) ? data : []);
  }

  async function ensureOptions() {
    if (Array.isArray(options?.resolutionMethods) && Array.isArray(options?.spareParts)) return options;
    const response = await fetch("/api/orders/requested/maintenance-form-options", { credentials: "include", cache: "no-store" });
    const data = await readJson(response);
    if (!response.ok) throw new Error(data?.error || "Failed to load maintenance form options.");
    setOptions(data || {});
    return data || {};
  }

  async function openLog(group) {
    setActionError("");
    try {
      await ensureOptions();
      setLogGroup(group);
    } catch (error) {
      setNotice(error?.message || "Failed to load maintenance form options.");
      window.setTimeout(() => setNotice(""), 4500);
    }
  }

  async function saveLog(perItemLogs) {
    const hasDetails = perItemLogs.some((entry) => (
      text(entry?.resolutionMethod) ||
      text(entry?.actualIssueDescription) ||
      text(entry?.repairAction) ||
      (Array.isArray(entry?.spareParts) && entry.spareParts.length)
    ));
    if (!hasDetails) {
      setActionError("Please fill maintenance details for at least one component. Spare parts are optional.");
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      await postJson("/api/orders/requested/log-maintenance", {
        orderIds: logGroup.orderIds,
        perItemLogs: perItemLogs.filter((entry) => (
          text(entry?.resolutionMethod) || text(entry?.actualIssueDescription) || text(entry?.repairAction) || entry?.spareParts?.length
        )),
      });
      await refreshOrders();
      setLogGroup(null);
      setSelected(null);
      setTab("in-progress");
      setNotice("Maintenance log saved. The order moved to In progress.");
      window.setTimeout(() => setNotice(""), 4000);
    } catch (error) {
      setActionError(error?.message || "Failed to save maintenance log.");
    } finally {
      setBusy(false);
    }
  }

  async function markDone(payload) {
    if (!payload?.files?.length) {
      setActionError("Please upload at least one signed maintenance report image.");
      return;
    }
    if (doneGroup?.spareParts?.length && !text(payload?.receiptNumbers)) {
      setActionError("Store receipt number is required because spare parts were replaced.");
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      const dataUrls = [];
      for (const file of payload.files) dataUrls.push(await fileToOptimizedDataUrl(file));
      const receiptNumbers = text(payload?.receiptNumbers).split(/[\n,]+/).map((value) => value.trim()).filter(Boolean);
      await postJson("/api/orders/requested/mark-arrived", {
        orderIds: doneGroup.orderIds,
        maintenanceReceiptDataUrls: dataUrls,
        maintenanceReceiptFilenames: payload.files.map((file, index) => text(file?.name) || `maintenance-report-${index + 1}.jpg`),
        receiptNumbers,
      });
      await refreshOrders();
      setDoneGroup(null);
      setSelected(null);
      setTab("done");
      setNotice("Maintenance order marked Done and the signed report was uploaded.");
      window.setTimeout(() => setNotice(""), 4500);
    } catch (error) {
      setActionError(error?.message || "Failed to complete maintenance order.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOrder(kind, group) {
    setBusy(true);
    try {
      const endpoint = kind === "excel"
        ? "/api/orders/requested/export/excel"
        : "/api/orders/requested/export/maintenance-pdf";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: group.orderIds, tab: group.state.key }),
      });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/maintenance-orders";
        return;
      }
      if (!response.ok) {
        const data = await readJson(response);
        throw new Error(data?.error || `Failed to export ${kind.toUpperCase()}.`);
      }
      const blob = await response.blob();
      downloadBlob(blob, reportFileName(group, kind === "excel" ? "xlsx" : "pdf"));
      setNotice(`${kind.toUpperCase()} downloaded.`);
      window.setTimeout(() => setNotice(""), 3000);
    } catch (error) {
      setNotice(error?.message || "Export failed.");
      window.setTimeout(() => setNotice(""), 4500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="next-orders-page next-maintenance-page">
      {bootstrapWarnings.length ? (
        <div className="dashboard-notice"><strong>Partial data</strong><span>One resource was not available during the initial load.</span><a href="/orders/maintenance-orders?classic=1">Classic page</a></div>
      ) : null}
      {notice ? <div className="orders-success-notice">✓ {notice}</div> : null}

      <div className="next-orders-toolbar maintenance-toolbar">
        <div className="next-order-tabs" role="tablist" aria-label="Maintenance order status">
          {STATUS_TABS.map((item) => (
            <button type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)} key={item.key}>
              <b>{item.icon}</b><span>{item.label}</span><em>{tabCounts[item.key] || 0}</em>
            </button>
          ))}
        </div>
        <label className="next-orders-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issue, component, technician, or receipt…" />
        </label>
      </div>

      <div className="orders-page-summary maintenance-page-summary">
        <span><small>Visible orders</small><strong>{visibleGroups.length}</strong></span>
        <span><small>Components</small><strong>{visibleGroups.reduce((sum, group) => sum + group.items.length, 0)}</strong></span>
        <span><small>In progress</small><strong>{tabCounts["in-progress"] || 0}</strong></span>
        <a href="/orders/maintenance-orders?classic=1">Open classic Maintenance Orders</a>
      </div>

      {visibleGroups.length ? (
        <div className="next-orders-grid">
          {visibleGroups.slice(0, visibleLimit).map((group) => <MaintenanceCard group={group} onOpen={setSelected} key={group.key} />)}
        </div>
      ) : (
        <div className="next-orders-empty"><span>⌘</span><h2>No maintenance orders found</h2><p>Try another status or search term.</p></div>
      )}

      {visibleLimit < visibleGroups.length ? (
        <button type="button" className="orders-load-more" onClick={() => setVisibleLimit((value) => value + 36)}>Load more orders</button>
      ) : null}

      <MaintenanceDetailsModal
        group={selected}
        busy={busy}
        onClose={() => setSelected(null)}
        onLog={openLog}
        onDone={(group) => { setActionError(""); setDoneGroup(group); }}
        onExport={exportOrder}
      />
      <MaintenanceLogModal
        group={logGroup}
        options={options}
        busy={busy}
        error={actionError}
        onCancel={() => { setLogGroup(null); setActionError(""); }}
        onSubmit={saveLog}
      />
      <MarkDoneModal
        group={doneGroup}
        busy={busy}
        error={actionError}
        onCancel={() => { setDoneGroup(null); setActionError(""); }}
        onSubmit={markDone}
      />
    </section>
  );
}

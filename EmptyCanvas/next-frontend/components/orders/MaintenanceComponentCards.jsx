"use client";

import { useMemo } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";
import { matchesOrderComponentSearch } from "./OrderComponentSearch";

export function text(value) {
  return String(value ?? "").trim();
}

export function lower(value) {
  return text(value).toLowerCase();
}

export function finite(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(finite(value));
}

export function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function formatDate(value) {
  const date = dateValue(value);
  if (!date.getTime()) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function splitNames(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n]+/).map((item) => item.trim()).filter(Boolean);
}

export function normalizeMaintenanceSpareEntry(entry = {}) {
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
  const unitPrice = Number(entry?.unitPrice ?? entry?.unit ?? 0);
  const total = Number(entry?.total ?? entry?.totalCost);
  return {
    id,
    name,
    qty,
    idCode: text(entry?.idCode ?? entry?.displayId),
    displayId: text(entry?.displayId ?? entry?.idCode),
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    total: Number.isFinite(total) ? total : (Number.isFinite(unitPrice) ? unitPrice * qty : 0),
    url: text(entry?.url ?? entry?.link),
  };
}

export function normalizeSpareEntries(item = {}) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const normalized = normalizeMaintenanceSpareEntry(entry);
    const key = `${normalized.id || lower(normalized.name)}|${normalized.qty}`;
    if ((!normalized.id && !normalized.name) || seen.has(key)) return;
    seen.add(key);
    entries.push(normalized);
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

export function normalizeNeededSpareEntries(item = {}) {
  const entries = [];
  const seen = new Set();
  const add = (entry = {}) => {
    const normalized = normalizeMaintenanceSpareEntry(entry);
    const key = `${normalized.id || lower(normalized.name)}|${normalized.qty}`;
    if ((!normalized.id && !normalized.name) || seen.has(key)) return;
    seen.add(key);
    entries.push(normalized);
  };
  if (Array.isArray(item?.sparePartsNeededEntries)) item.sparePartsNeededEntries.forEach(add);
  if (!entries.length) {
    const ids = splitNames(item?.sparePartsNeededIds?.length ? item.sparePartsNeededIds : item?.sparePartsNeededId);
    const names = splitNames(item?.sparePartsNeededNames?.length ? item.sparePartsNeededNames : item?.sparePartsNeededName);
    if (ids.length) ids.forEach((id, index) => add({ id, name: names[index] || "" }));
    else names.forEach((name) => add({ name }));
  }
  return entries;
}

export function normalizeMaintenanceChecklist(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  source.forEach((entry) => {
    const item = text(entry?.text ?? entry?.value ?? entry);
    if (!item) return;
    const key = lower(item);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

export function issueText(item = {}) {
  return text(item?.issueDescription ?? item?.reason) || "—";
}

function safeMaintenanceUrl(value) {
  const url = text(value);
  if (/^https?:\/\//i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return "";
}

function MaintenanceSparePartsBlock({ title, entries, emptyText }) {
  const parts = Array.isArray(entries) ? entries : [];
  const totalCost = parts.reduce((sum, part) => sum + Math.max(0, finite(part?.total ?? (finite(part?.unitPrice) * finite(part?.qty)))), 0);
  return (
    <section className="next-maintenance-spares-card">
      <div className="next-maintenance-spares-card__head">
        <span className="next-maintenance-spares-card__title"><ClassicOrderIcon name="package" />{title}</span>
        <span className="next-maintenance-spares-card__count">{parts.length}</span>
      </div>
      {parts.length ? <div className="next-maintenance-spares-list">
        {parts.map((part, index) => {
          const partUrl = safeMaintenanceUrl(part?.url);
          const unitPrice = finite(part?.unitPrice);
          const total = finite(part?.total, unitPrice * finite(part?.qty, 1));
          return <div className="next-maintenance-spare-row" key={`${text(part?.id) || text(part?.name) || index}-${index}`}>
            <div className="next-maintenance-spare-row__main">
              <span className="next-maintenance-spare-row__index">{index + 1}</span>
              <span className="next-maintenance-spare-row__identity">
                {partUrl ? <a href={partUrl} target="_blank" rel="noopener noreferrer" className="next-maintenance-spare-row__name"><span>{text(part?.name) || "Spare part"}</span><ClassicOrderIcon name="external-link" /></a> : <strong className="next-maintenance-spare-row__name">{text(part?.name) || "Spare part"}</strong>}
                <span className="next-maintenance-spare-row__id">{text(part?.idCode ?? part?.displayId) ? `ID: ${text(part?.idCode ?? part?.displayId)}` : "No ID code"}</span>
              </span>
            </div>
            <div className="next-maintenance-spare-row__stats">
              <span><small>Qty</small><strong>{Math.max(1, Math.round(finite(part?.qty, 1)))}</strong></span>
              {unitPrice > 0 ? <span><small>Unit</small><strong>{formatMoney(unitPrice)}</strong></span> : null}
              {total > 0 ? <span><small>Total</small><strong>{formatMoney(total)}</strong></span> : null}
            </div>
          </div>;
        })}
        {totalCost > 0 ? <div className="next-maintenance-spares-card__total"><span>Total cost</span><strong>{formatMoney(totalCost)}</strong></div> : null}
      </div> : <div className="next-maintenance-spares-empty">{emptyText}</div>}
    </section>
  );
}

export function maintenanceLogsForItem(item = {}) {
  const stored = Array.isArray(item?.maintenanceLogs) ? item.maintenanceLogs.filter(Boolean) : [];
  if (stored.length) return stored;
  const hasLegacy = Boolean(
    text(item?.serialNumber) || text(item?.resolutionMethod) || text(item?.actualIssueDescription) || text(item?.repairAction)
    || normalizeNeededSpareEntries(item).length || normalizeSpareEntries(item).length || normalizeMaintenanceChecklist(item?.maintenanceChecklist).length
  );
  if (!hasLegacy) return [];
  return [{
    serialNumber: text(item?.serialNumber),
    resolutionMethod: text(item?.resolutionMethod),
    actualIssueDescription: text(item?.actualIssueDescription),
    repairAction: text(item?.repairAction),
    sparePartsNeededEntries: normalizeNeededSpareEntries(item),
    sparePartsReplacedEntries: normalizeSpareEntries(item),
    maintenanceChecklist: normalizeMaintenanceChecklist(item?.maintenanceChecklist),
    loggedAt: item?.maintenanceLoggedAt || null,
    technicianName: text(item?.maintenanceTechnicianName),
  }];
}

function maintenanceLogLabel(index) {
  if (index === 0) return "Log One";
  if (index === 1) return "Log Two";
  return `Log ${index + 1}`;
}

/** Same read-only log presentation in Maintenance Orders, My Orders and Operations Orders. */
export function MaintenanceComponentCards({ items = [], query = "", onClearSearch }) {
  const source = Array.isArray(items) ? items : [];
  const search = text(query).toLowerCase();
  const visibleMaintenanceItems = useMemo(() => source
    .filter((item) => !search || matchesOrderComponentSearch(item, search)
      || text(item?.idCode ?? item?.displayId).toLowerCase().includes(search)
      || maintenanceLogsForItem(item).some((log) => text(log?.serialNumber).toLowerCase().includes(search)))
    .sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true })), [items, search]);
  return <>
            <div className="order-components-panel__heading next-maintenance-components-heading">
              <strong>Components</strong>
              <span role="status" aria-live="polite">{search.trim() ? `${visibleMaintenanceItems.length} matches of ${source.length}` : `${source.length} item${source.length === 1 ? "" : "s"}`}</span>
              {search.trim() ? <button type="button" className="order-components-panel__clear" onClick={() => onClearSearch?.()}>Clear search</button> : null}
            </div>
            <div className="co-modal-items next-maintenance-modal-items">
              {!visibleMaintenanceItems.length ? <div className="order-component-search-empty" role="status">No matching components. <button type="button" onClick={() => onClearSearch?.()}>Show all components</button></div> : null}
              {visibleMaintenanceItems.map((item, index) => {
                const productName = text(item?.productName) || "Component";
                const productUrl = safeMaintenanceUrl(item?.productUrl);
                const logs = maintenanceLogsForItem(item);
                const idCode = text(item?.idCode ?? item?.displayId);
                const componentName = productUrl
                  ? <a className="next-maintenance-modal-item__name next-maintenance-modal-item__name-link" href={productUrl} target="_blank" rel="noopener noreferrer" title="Open product link"><span>{productName}</span><ClassicOrderIcon name="external-link" /></a>
                  : <strong className="next-maintenance-modal-item__name">{productName}</strong>;

                return <section className="co-item next-maintenance-modal-item" key={text(item?.id) || index}>
                  <div className="next-maintenance-modal-item__head">
                    <span className="next-maintenance-modal-item__icon"><ClassicOrderIcon name="tool" /></span>
                    <span className="next-maintenance-modal-item__identity">
                      <span className="next-maintenance-modal-item__kicker">Component {index + 1}</span>
                      {componentName}
                      {idCode ? <span className="next-maintenance-modal-item__id">ID: {idCode}</span> : null}
                    </span>
                  </div>

                  {logs.length ? <div className="next-maintenance-log-history">
                    {logs.map((log, logIndex) => {
                      const serialNumber = text(log?.serialNumber) || "—";
                      const resolutionMethod = text(log?.resolutionMethod) || "—";
                      const actualIssue = text(log?.actualIssueDescription) || "—";
                      const repairAction = text(log?.repairAction) || "—";
                      const checklist = normalizeMaintenanceChecklist(log?.maintenanceChecklist);
                      const neededSpareParts = Array.isArray(log?.sparePartsNeededEntries) ? log.sparePartsNeededEntries : [];
                      const replacedSpareParts = Array.isArray(log?.sparePartsReplacedEntries) ? log.sparePartsReplacedEntries : [];
                      const logTechnician = text(log?.technicianName) || "—";
                      const logDate = log?.loggedAt ? formatDate(log.loggedAt) : "—";
                      return <fieldset className={`next-maintenance-log-frame next-maintenance-log-frame--${logIndex === 0 ? "one" : logIndex === 1 ? "two" : "more"}`} key={`${text(item?.id) || index}-log-${logIndex}`}>
                        <legend><span>{maintenanceLogLabel(logIndex)}</span></legend>
                        <div className="next-maintenance-log-frame__meta">
                          <div><span>Technician name</span><strong>{logTechnician}</strong></div>
                          <div><span>Date</span><strong>{logDate}</strong></div>
                        </div>
                        <div className="next-maintenance-detail-group next-maintenance-detail-group--machine">
                          <div className="next-maintenance-detail-group__title"><span>Machine details</span></div>
                          <div className="next-maintenance-detail-grid next-maintenance-detail-grid--two">
                            <div className="next-maintenance-detail-field">
                              <span>Component</span>
                              {productUrl ? <a className="next-maintenance-detail-field__product" href={productUrl} target="_blank" rel="noopener noreferrer"><span>{productName}</span><ClassicOrderIcon name="external-link" /></a> : <strong>{productName}</strong>}
                              {idCode ? <small>ID: {idCode}</small> : null}
                            </div>
                            <div className="next-maintenance-detail-field"><span>Serial number</span><strong dir="auto">{serialNumber}</strong></div>
                          </div>
                        </div>

                        <div className="next-maintenance-modal-item__issue next-maintenance-modal-item__issue--grouped">
                          <span>Initial issue</span>
                          <p dir="auto">{issueText(item)}</p>
                        </div>

                        <div className="next-maintenance-detail-group next-maintenance-detail-group--action">
                          <div className="next-maintenance-detail-group__title"><span>Maintenance action</span></div>
                          <div className="next-maintenance-detail-grid next-maintenance-detail-grid--two">
                            <div className="next-maintenance-detail-field"><span>Resolution method</span><strong dir="auto">{resolutionMethod}</strong></div>
                            <div className="next-maintenance-detail-field next-maintenance-detail-field--checklist">
                              <span>Maintenance checklist</span>
                              {checklist.length ? <div className="next-maintenance-checklist-view">{checklist.map((value, checklistIndex) => <div className="next-maintenance-checklist-view__item" key={`${value}-${checklistIndex}`}><ClassicOrderIcon name="check-circle" /><strong dir="auto">{value}</strong></div>)}</div> : <div className="next-maintenance-detail-field__empty">No checklist items recorded</div>}
                            </div>
                            <div className="next-maintenance-detail-field next-maintenance-detail-field--text"><span>Actual issue description</span><strong dir="auto">{actualIssue}</strong></div>
                            <div className="next-maintenance-detail-field next-maintenance-detail-field--text"><span>Repair action</span><strong dir="auto">{repairAction}</strong></div>
                          </div>
                        </div>

                        <div className="next-maintenance-detail-group next-maintenance-detail-group--spares">
                          <div className="next-maintenance-detail-group__title"><span>Spare parts</span></div>
                          <div className="next-maintenance-spares-grid">
                            <MaintenanceSparePartsBlock title="Spare parts needed" entries={neededSpareParts} emptyText="No spare parts needed" />
                            <MaintenanceSparePartsBlock title="Spare parts replaced" entries={replacedSpareParts} emptyText="No spare parts replaced" />
                          </div>
                        </div>
                      </fieldset>;
                    })}
                  </div> : <>
                    <div className="next-maintenance-detail-group next-maintenance-detail-group--machine">
                      <div className="next-maintenance-detail-group__title"><span>Machine details</span></div>
                      <div className="next-maintenance-detail-grid next-maintenance-detail-grid--two">
                        <div className="next-maintenance-detail-field"><span>Component</span>{productUrl ? <a className="next-maintenance-detail-field__product" href={productUrl} target="_blank" rel="noopener noreferrer"><span>{productName}</span><ClassicOrderIcon name="external-link" /></a> : <strong>{productName}</strong>}{idCode ? <small>ID: {idCode}</small> : null}</div>
                        <div className="next-maintenance-detail-field"><span>Serial number</span><strong>—</strong></div>
                      </div>
                    </div>
                    <div className="next-maintenance-modal-item__issue next-maintenance-modal-item__issue--grouped"><span>Initial issue</span><p dir="auto">{issueText(item)}</p></div>
                  </>}
                </section>;
              })}
            </div>
  </>;
}


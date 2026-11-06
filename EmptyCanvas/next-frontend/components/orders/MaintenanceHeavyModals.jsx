"use client";

import { useEffect, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";
import OrderPriorityBadge from "./OrderPriorityBadge";
import { orderCreatedDate, orderDeliveryDate, orderPriority } from "./order-summary-meta.mjs";
import OrderComponentSearch from "./OrderComponentSearch";
import { text, lower, finite, formatMoney, dateValue, formatDate, splitNames, normalizeMaintenanceSpareEntry, normalizeSpareEntries, normalizeNeededSpareEntries, normalizeMaintenanceChecklist, issueText, MaintenanceComponentCards } from "./MaintenanceComponentCards";
import { DeleteConfirmDialog, DeleteVerificationDialog } from "../shared/SystemDeleteDialogs";
import { confirmDelete as confirmDeleteAction } from "../../lib/client-confirm";

const MAINTENANCE_SPARE_EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["component", "Component"],
  ["qty", "Quantity"],
  ["unitCost", "Unit Cost"],
  ["totalCost", "Total Cost"],
];

const DIRECT_API_BASE = "/next/api";

const MAINTENANCE_ACTIONS = {
  edit: {
    title: "Edit maintenance log",
    description: "Enter the Maintenance Orders admin password to edit the saved maintenance details.",
    button: "Continue",
    icon: "edit-2",
  },
  archive: {
    title: "Archive maintenance order",
    description: "Enter the Maintenance Orders admin password to move this order to Archive.",
    button: "Archive",
    icon: "archive",
  },
  delete: {
    title: "Delete maintenance order",
    description: "Enter the Maintenance Orders admin password to permanently delete this order.",
    button: "Delete",
    icon: "trash-2",
    danger: true,
  },
};

function readJson(response) {
  return response.json().catch(() => null);
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

async function saveMaintenanceChecklistItem(value) {
  const clean = text(value);
  if (!clean) throw new Error("Checklist text is required.");
  const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance-checklist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ text: clean }),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "Failed to save checklist item.");
  return data?.item || null;
}

async function updateMaintenanceChecklistItem(id, value) {
  const cleanId = text(id);
  const clean = text(value);
  if (!cleanId) throw new Error("Checklist item id is required.");
  if (!clean) throw new Error("Checklist text is required.");
  const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance-checklist`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ id: cleanId, text: clean }),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "Failed to update checklist item.");
  return data?.item || null;
}

async function deleteMaintenanceChecklistItem(id) {
  const cleanId = text(id);
  if (!cleanId) throw new Error("Checklist item id is required.");
  const response = await fetch(`${DIRECT_API_BASE}/orders/maintenance-checklist`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ id: cleanId }),
  });
  if (response.status === 401) {
    window.location.href = "/login?next=/next/maintenance-orders";
    throw new Error("Authentication required.");
  }
  const data = await readJson(response);
  if (!response.ok) throw new Error(data?.error || "Failed to delete checklist item.");
  return data;
}

function MaintenanceChecklistOption({ item, checked, disabled, onToggle, onUpdated, onDeleted, onError, canManage = true }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item?.text || "");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setDraft(item?.text || "");
    setEditing(false);
  }, [item?.id, item?.text]);

  const locked = disabled || working;

  async function saveEdit() {
    const value = text(draft);
    if (!value || !item?.id || locked) return;
    setWorking(true);
    onError?.("");
    try {
      const saved = await updateMaintenanceChecklistItem(item.id, value);
      const normalized = saved || { ...item, text: value };
      onUpdated?.(item, normalized);
      setEditing(false);
      } catch (error) {
      onError?.(error?.message || "Failed to update checklist item.");
    } finally {
      setWorking(false);
    }
  }

  async function confirmRemove() {
    if (!item?.id || locked) return;
    setWorking(true);
    onError?.("");
    try {
      await deleteMaintenanceChecklistItem(item.id);
      onDeleted?.(item);
    } catch (error) {
      onError?.(error?.message || "Failed to delete checklist item.");
      } finally {
      setWorking(false);
    }
  }

  return <div className={`next-maintenance-checklist-option${editing ? " is-editing" : ""}`}>
    {editing ? <input
      className="next-maintenance-checklist-option__edit-input"
      type="text"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); saveEdit(); }
        if (event.key === "Escape") { setDraft(item.text); setEditing(false); }
      }}
      disabled={locked}
      autoFocus
      aria-label="Edit checklist item"
    /> : <label className="next-maintenance-checklist-option__select">
      <input type="checkbox" checked={Boolean(checked)} onChange={onToggle} disabled={locked} />
      <span>{item.text}</span>
    </label>}

    {canManage ? <div className="next-maintenance-checklist-option__actions">
      {editing ? <>
        <button type="button" className="next-maintenance-checklist-icon-btn next-maintenance-checklist-icon-btn--save" onClick={saveEdit} disabled={locked || !text(draft)} aria-label="Save checklist item" title="Save"><ClassicOrderIcon name="check" /></button>
        <button type="button" className="next-maintenance-checklist-icon-btn" onClick={() => { setDraft(item.text); setEditing(false); }} disabled={locked} aria-label="Cancel checklist edit" title="Cancel"><ClassicOrderIcon name="x" /></button>
      </> : <>
        <button type="button" className="next-maintenance-checklist-icon-btn" onClick={() => { setDraft(item.text); setEditing(true); }} disabled={locked || !item?.id} aria-label="Edit checklist item" title="Edit"><ClassicOrderIcon name="edit-2" /></button>
        <button type="button" className="next-maintenance-checklist-icon-btn next-maintenance-checklist-icon-btn--danger" onClick={async () => { const confirmed = await confirmDeleteAction({ title: "Delete checklist item?", itemType: "checklist item", itemName: item.text, message: `“${item.text}” will be permanently removed from the maintenance checklist.` }); if (confirmed) confirmRemove(); }} disabled={locked || !item?.id} aria-label="Delete checklist item" title="Delete"><ClassicOrderIcon name="trash-2" /></button>
      </>}
    </div> : null}
  </div>;
}

function safeHttpUrl(value) {
  const url = text(value);
  return /^https?:\/\//i.test(url) ? url : "";
}

function ReceiptPhotosModal({ group, onClose }) {
  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, onClose]);
  if (!group) return null;
  return (
    <div className="co-submodal-overlay is-open req-receipt-photos-modal" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="co-submodal-dialog req-receipt-photos-dialog" role="dialog" aria-modal="true" aria-label="Receipt photos">
        <button type="button" className="co-submodal-close" onClick={onClose} aria-label="Close receipt photos" />
        <div className="co-submodal-header req-receipt-photos-header"><div className="co-submodal-title">Receipt photos</div><div className="req-receipt-photos-count">{group.receiptEntries.length} photo{group.receiptEntries.length === 1 ? "" : "s"}</div></div>
        <div className="co-submodal-body"><div className="req-receipt-photos-grid">{group.receiptEntries.map((entry, index) => <a className="next-maintenance-receipt-photo" href={entry.url} target="_blank" rel="noopener noreferrer" key={`${entry.url}-${index}`}><img src={entry.url} alt={entry.name || `Receipt ${index + 1}`} /><span>{entry.name || `Receipt ${index + 1}`}</span></a>)}</div></div>
        <div className="co-submodal-actions req-receipt-photos-actions"><button type="button" className="ro-action-btn ro-action-btn--dark" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

function Progress({ stage }) {
  const icons = ["eye", "activity", "truck", "home"];
  const safeStage = Math.max(1, Math.min(4, Number(stage) || 1));
  return (
    <div className="co-track-pill next-maintenance-track-pill" role="img" aria-label={`Order progress step ${safeStage} of 4`}>
      {icons.map((icon, index) => {
        const step = index + 1;
        return <span className="next-classic-track-fragment" key={icon}><span className={`co-track-step ${step <= safeStage ? "is-active" : ""} ${step === safeStage ? "is-current" : ""}`}><ClassicOrderIcon name={icon} /></span>{step < 4 ? <span className={`co-track-conn ${step < safeStage ? "is-active" : ""}`} /> : null}</span>;
      })}
    </div>
  );
}

export function MaintenanceDetailsModal({ group, busy, onClose, onLog, onSecondLog, onDone, onExport, onAction, permissions = {} }) {
  const [photosOpen, setPhotosOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [componentSearch, setComponentSearch] = useState("");
  const moreRef = useRef(null);
  useEffect(() => {
    setPhotosOpen(false);
    setMoreOpen(false);
    setComponentSearch("");
  }, [group?.key]);
  useEffect(() => {
    if (!group) return undefined;
    document.body.classList.add("co-modal-open");
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (photosOpen) return;
      if (moreOpen) { setMoreOpen(false); return; }
      onClose();
    };
    const onPointerDown = (event) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(event.target)) setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.body.classList.remove("co-modal-open");
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [group, onClose, photosOpen, moreOpen]);

  const menuAction = (action) => {
    setMoreOpen(false);
    onAction(action, group);
  };

  const canLog = group.state.key === "not-started";
  const canTemplate = group.state.key === "not-started";
  const canDone = group.state.key === "in-progress";
  const canSecondLog = group.state.key === "in-progress" && Number(group.maxLogCount || 1) < 2;
  const canDownload = ["in-progress", "done"].includes(group.state.key);
  const showDoneMeta = group.state.key === "done";

  return (
    <>
      <div className="co-modal-overlay is-open" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="co-modal-dialog next-maintenance-details-dialog" role="dialog" aria-modal="true" aria-label={`${group.orderIdLabel} maintenance details`}>
          <span className="co-modal-type-badge" style={{ "--co-order-type-accent": "#f2b705", "--co-order-type-accent-dark": "#a16207" }} aria-hidden="true"><ClassicOrderIcon name="tool" /></span>
          {(permissions.edit !== false || permissions.archive !== false || permissions.delete !== false) ? <div className="co-modal-more" ref={moreRef}>
            <button type="button" className="co-modal-more-btn" aria-label="Order actions" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
              <span className="co-modal-more-dots" aria-hidden="true">⋮</span>
            </button>
            {moreOpen ? <div className="co-modal-more-panel" role="menu" aria-label="Order actions">
              {permissions.edit !== false ? <button type="button" className="co-modal-more-item" role="menuitem" onClick={() => menuAction("edit")}><ClassicOrderIcon name="edit-2" /><span>Edit</span></button> : null}
              {permissions.archive !== false ? <button type="button" className="co-modal-more-item" role="menuitem" onClick={() => menuAction("archive")}><ClassicOrderIcon name="archive" /><span>Archive</span></button> : null}
              {permissions.delete !== false ? <button type="button" className="co-modal-more-item co-modal-more-item--danger" role="menuitem" onClick={() => menuAction("delete")}><ClassicOrderIcon name="trash-2" /><span>Delete</span></button> : null}
            </div> : null}
          </div> : null}
          <button type="button" className="co-modal-close" onClick={onClose} aria-label="Close order details" />
          <div className="co-modal-header"><div className="co-modal-head-left"><div className="co-modal-status">Request Maintenance</div></div></div>
          <div className="co-modal-scroll-region">
          <div className="next-maintenance-order-modal-summary" aria-label="Maintenance order summary">
            <div><span>Team member</span><strong title={group.createdByName || "—"}>{group.createdByName || "—"}</strong></div>
            <div><span>Created Date</span><strong>{formatDate(orderCreatedDate(group))}</strong></div>
            <div><span>Delivery Date</span><strong>{formatDate(orderDeliveryDate(group))}</strong></div>
            <div><span>Priority</span><OrderPriorityBadge value={orderPriority(group)} /></div>
          </div>
          <Progress stage={group.stage} />
          <div className="co-modal-body">
            {showDoneMeta ? <div className="co-modal-meta next-maintenance-done-meta">
              {group.receiptNumbers.length ? <div className="co-meta-row"><span>Store Receipt Number</span><strong>{group.receiptNumbers.join(", ")}</strong></div> : null}
              <div className="co-meta-row"><span>Receipt Photos</span><strong><button type="button" className="co-inline-receipt-photos-btn" disabled={!group.receiptEntries.length} onClick={() => setPhotosOpen(true)}><ClassicOrderIcon name="image" /><span>{group.receiptEntries.length ? (group.receiptEntries.length === 1 ? "View photo" : `View ${group.receiptEntries.length} photos`) : "No photos"}</span></button></strong></div>
            </div> : null}

            <div className="co-modal-actions ro-actions ro-actions--right next-maintenance-modal-actions order-detail-workflow-actions">
              {canTemplate && permissions.export !== false ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onExport(group, { template: true })} disabled={busy}><ClassicOrderIcon name="download" />Download Template</button> : null}
              {canDownload && permissions.export !== false ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onExport(group)} disabled={busy}><ClassicOrderIcon name="download" />Download</button> : null}
              {canLog && permissions.log !== false ? <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => onLog(group)} disabled={busy}><ClassicOrderIcon name="clipboard" />Log Maintenance</button> : null}
              {canSecondLog && permissions.log !== false ? <button type="button" className="ro-action-btn ro-action-btn--light next-maintenance-second-log-btn" onClick={() => onSecondLog(group)} disabled={busy}><ClassicOrderIcon name="clipboard" />Make Second Log</button> : null}
              {canDone && permissions.mark_arrived !== false ? <button type="button" className="ro-action-btn ro-action-btn--dark" onClick={() => onDone(group)} disabled={busy}><ClassicOrderIcon name="check-circle" />Mark as Delivered</button> : null}
            </div>

            <div className="co-modal-actions ro-actions order-detail-toolkit next-maintenance-search-tools">
              <OrderComponentSearch value={componentSearch} onChange={setComponentSearch} ariaLabel="Search maintenance components or serial numbers" collapseOnToggle />
            </div>
            <MaintenanceComponentCards items={group.items} query={componentSearch} onClearSearch={() => setComponentSearch("")} />
          </div>
          </div>
        </div>
      </div>
      <ReceiptPhotosModal group={photosOpen ? group : null} onClose={() => setPhotosOpen(false)} />
    </>
  );
}

export function MaintenanceDownloadModal({ state, options, busy, onClose, onDownload, onChecklistSaved, onChecklistUpdated, onChecklistDeleted, canReadChecklist = true, canManageChecklist = true }) {
  const group = state?.group || null;
  const template = Boolean(state?.template);
  const [columns, setColumns] = useState(MAINTENANCE_SPARE_EXPORT_COLUMNS.map(([key]) => key));
  const [selectedChecklist, setSelectedChecklist] = useState([]);
  const [newChecklist, setNewChecklist] = useState("");
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!state) return;
    setColumns(MAINTENANCE_SPARE_EXPORT_COLUMNS.map(([key]) => key));
    const logged = template ? [] : normalizeMaintenanceChecklist((group?.items || []).flatMap((item) => item?.maintenanceChecklist || []));
    setSelectedChecklist(logged);
    setNewChecklist("");
    setError("");
  }, [state?.group?.key, template]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy && !savingChecklist) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, savingChecklist, onClose]);

  if (!state || !group) return null;
  const checklistItems = (Array.isArray(options?.checklistItems) ? options.checklistItems : [])
    .map((item) => ({ id: text(item?.id), text: text(item?.text ?? item?.value ?? item) }))
    .filter((item) => item.text);

  const toggleColumn = (key) => {
    setColumns((current) => current.includes(key)
      ? (current.length === 1 ? current : current.filter((item) => item !== key))
      : [...current, key]);
  };

  const toggleChecklist = (value) => {
    setSelectedChecklist((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  async function addChecklist() {
    const value = text(newChecklist);
    if (!value || savingChecklist) return;
    setSavingChecklist(true);
    setError("");
    try {
      const saved = await saveMaintenanceChecklistItem(value);
      const savedText = text(saved?.text) || value;
      onChecklistSaved?.(saved || { text: savedText });
      setSelectedChecklist((current) => normalizeMaintenanceChecklist([...current, savedText]));
      setNewChecklist("");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save checklist item.");
    } finally {
      setSavingChecklist(false);
    }
  }

  function handleChecklistUpdated(previous, saved) {
    const previousText = text(previous?.text);
    const nextText = text(saved?.text);
    if (!nextText) return;
    onChecklistUpdated?.(saved);
    setSelectedChecklist((current) => normalizeMaintenanceChecklist(current.map((value) => value === previousText ? nextText : value)));
  }

  function handleChecklistDeleted(item) {
    const removedText = text(item?.text);
    onChecklistDeleted?.(item);
    setSelectedChecklist((current) => current.filter((value) => value !== removedText));
  }

  async function runDownload() {
    setError("");
    const ok = await onDownload(group, {
      template,
      sparePartColumns: columns,
      checklist: canReadChecklist ? selectedChecklist : [],
    });
    if (ok !== false) onClose();
  }

  return <div className="order-download-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !savingChecklist) onClose(); }}>
    <div className="order-download-dialog next-maintenance-download-dialog" role="dialog" aria-modal="true" aria-label={template ? "Download maintenance template" : "Download maintenance report"}>
      <button type="button" className="order-download-close" onClick={onClose} disabled={busy || savingChecklist} aria-label="Close download options"><ClassicOrderIcon name="x" /></button>
      <div className="order-download-header">
        <span className="order-download-header__icon"><ClassicOrderIcon name="download" /></span>
        <div><h2>{template ? "Download Template" : "Download Maintenance PDF"}</h2><p>{group.orderIdLabel}</p></div>
      </div>

      <div className="order-download-section order-download-columns">
        <span className="order-download-section__label">Spare parts table columns</span>
        <div className="order-download-columns__grid">
          {MAINTENANCE_SPARE_EXPORT_COLUMNS.map(([key, label]) => <label key={key} className="order-download-column-option">
            <input type="checkbox" checked={columns.includes(key)} onChange={() => toggleColumn(key)} />
            <span>{label}</span>
          </label>)}
        </div>
      </div>

      {canReadChecklist ? <div className="order-download-section next-maintenance-download-checklist">
        <div className="order-download-instructions__heading"><span className="order-download-section__label">Checklist</span></div>
        <div className="next-maintenance-checklist-options next-maintenance-checklist-options--download">
          {checklistItems.length ? checklistItems.map((item) => <MaintenanceChecklistOption
            key={item.id || item.text}
            item={item}
            checked={selectedChecklist.includes(item.text)}
            disabled={busy || savingChecklist}
            onToggle={() => toggleChecklist(item.text)}
            canManage={canManageChecklist}
            onUpdated={handleChecklistUpdated}
            onDeleted={handleChecklistDeleted}
            onError={setError}
          />) : <div className="next-maintenance-checklist-empty">No saved checklist items yet.</div>}
        </div>
        {canManageChecklist ? <div className="next-maintenance-checklist-add">
          <input type="text" value={newChecklist} onChange={(event) => setNewChecklist(event.target.value)} placeholder="Add checklist text..." disabled={busy || savingChecklist} />
          <button type="button" className="order-download-btn order-download-btn--light" onClick={addChecklist} disabled={busy || savingChecklist || !text(newChecklist)}>+ Add</button>
        </div> : null}
      </div> : null}

      {error ? <div className="order-download-error" role="alert">{error}</div> : null}
      <div className="order-download-actions">
        <button type="button" className="order-download-btn order-download-btn--dark" onClick={runDownload} disabled={busy || savingChecklist}><ClassicOrderIcon name="file-text" /><span>{busy ? "Preparing…" : "Download PDF"}</span></button>
      </div>
    </div>
  </div>;
}

function ModernSelect({ value, options, placeholder, searchable = false, onChange, disabled = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const selected = options.find((option) => text(option.value) === text(value));
  const selectedLabel = selected?.label || text(value) || placeholder;
  const visible = searchable && query.trim() ? options.filter((option) => lower(option.label).includes(lower(query))) : options;

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", key); };
  }, [open]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  return (
    <div ref={wrapRef} className={`next-maintenance-modern-select ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}>
      <button type="button" className="next-maintenance-modern-select__trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel || placeholder} disabled={disabled} onClick={() => setOpen((state) => !state)}><span>{selectedLabel}</span><ClassicOrderIcon name="chevron-down" /></button>
      {open ? <div className="next-maintenance-modern-select__menu" role="listbox" aria-label={ariaLabel || placeholder}>
        {searchable ? <div className="next-maintenance-modern-select__search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components" autoFocus /></div> : null}
        <div className="next-maintenance-modern-select__options">
          <button type="button" role="option" aria-selected={!value} className={`next-maintenance-modern-select__option ${!value ? "is-selected" : ""}`} onClick={() => { onChange(""); setOpen(false); }}><span>{placeholder}</span>{!value ? <ClassicOrderIcon name="check" /> : null}</button>
          {visible.map((option) => <button type="button" role="option" aria-selected={text(value) === text(option.value)} className={`next-maintenance-modern-select__option ${text(value) === text(option.value) ? "is-selected" : ""}`} onClick={() => { onChange(option.value); setOpen(false); }} key={`${text(option.value)}-${text(option.label)}`}><span>{option.label}</span>{text(value) === text(option.value) ? <ClassicOrderIcon name="check" /> : null}</button>)}
          {searchable && query.trim() && !visible.length ? <div className="next-maintenance-modern-select__empty">No matching components</div> : null}
        </div>
      </div> : null}
    </div>
  );
}

function emptyLogForItem(item, mode = "create") {
  const history = Array.isArray(item?.maintenanceLogs) ? item.maintenanceLogs : [];
  const historySerial = [...history].reverse().map((entry) => text(entry?.serialNumber)).find(Boolean) || "";
  const fixedSerialNumber = text(item?.serialNumber) || historySerial;
  const isSecondMode = mode === "second";
  const existingNeeded = isSecondMode ? [] : normalizeNeededSpareEntries(item);
  const existingReplaced = isSecondMode ? [] : normalizeSpareEntries(item);
  return {
    orderId: text(item?.id),
    productName: text(item?.productName) || "Component",
    issueDescription: issueText(item),
    serialNumber: fixedSerialNumber,
    resolutionMethod: isSecondMode ? "" : text(item?.resolutionMethod),
    actualIssueDescription: isSecondMode ? "" : text(item?.actualIssueDescription),
    repairAction: isSecondMode ? "" : text(item?.repairAction),
    sparePartsNeeded: existingNeeded.length ? existingNeeded : [{ id: "", name: "", qty: 1 }],
    sparePartsReplaced: existingReplaced.length ? existingReplaced : [{ id: "", name: "", qty: 1 }],
    checklist: isSecondMode ? [] : normalizeMaintenanceChecklist(item?.maintenanceChecklist),
  };
}

export function MaintenanceLogModal({ group, mode = "create", options, busy, error, onCancel, onSubmit, onChecklistSaved, onChecklistUpdated, onChecklistDeleted, canReadChecklist = true, canManageChecklist = true }) {
  const [logs, setLogs] = useState([]);
  const [newChecklistText, setNewChecklistText] = useState({});
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistError, setChecklistError] = useState("");

  useEffect(() => {
    setLogs(group ? [...group.items].sort((a, b) => text(a?.productName).localeCompare(text(b?.productName), undefined, { sensitivity: "base", numeric: true })).map((item) => emptyLogForItem(item, mode)) : []);
    setNewChecklistText({});
    setChecklistError("");
  }, [group, mode]);

  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy && !checklistSaving) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, busy, checklistSaving, onCancel]);

  if (!group) return null;
  const isEditMode = mode === "edit";
  const isSecondMode = mode === "second";
  const resolutionMethods = (Array.isArray(options?.resolutionMethods) ? options.resolutionMethods : []).map((option) => ({ value: text(option?.name ?? option?.value ?? option), label: text(option?.name ?? option?.label ?? option) })).filter((option) => option.value);
  const spareOptions = (Array.isArray(options?.spareParts) ? options.spareParts : []).map((option) => ({ value: text(option?.id ?? option?.value ?? option?.name), label: text(option?.name ?? option?.label ?? option?.value) })).filter((option) => option.value || option.label);
  const checklistItems = (Array.isArray(options?.checklistItems) ? options.checklistItems : [])
    .map((item) => ({ id: text(item?.id), text: text(item?.text ?? item?.value ?? item) }))
    .filter((item) => item.text);

  function patchLog(index, patch) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  function patchSpare(logIndex, listKey, spareIndex, patch) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const list = Array.isArray(entry[listKey]) ? entry[listKey] : [];
      return { ...entry, [listKey]: list.map((part, partIndex) => partIndex === spareIndex ? { ...part, ...patch } : part) };
    }));
  }

  function addSpare(logIndex, listKey) {
    setLogs((current) => current.map((entry, entryIndex) => entryIndex === logIndex
      ? { ...entry, [listKey]: [...(Array.isArray(entry[listKey]) ? entry[listKey] : []), { id: "", name: "", qty: 1 }] }
      : entry));
  }

  function removeSpare(logIndex, listKey, spareIndex) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const list = (Array.isArray(entry[listKey]) ? entry[listKey] : []).filter((_, partIndex) => partIndex !== spareIndex);
      return { ...entry, [listKey]: list.length ? list : [{ id: "", name: "", qty: 1 }] };
    }));
  }

  function toggleChecklist(logIndex, value) {
    setLogs((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== logIndex) return entry;
      const active = normalizeMaintenanceChecklist(entry.checklist);
      const next = active.includes(value) ? active.filter((item) => item !== value) : [...active, value];
      return { ...entry, checklist: next };
    }));
  }

  async function addChecklistItem(logIndex) {
    const value = text(newChecklistText[logIndex]);
    if (!value || checklistSaving) return;
    setChecklistSaving(true);
    setChecklistError("");
    try {
      const saved = await saveMaintenanceChecklistItem(value);
      const savedText = text(saved?.text) || value;
      onChecklistSaved?.(saved || { text: savedText });
      setNewChecklistText((current) => ({ ...current, [logIndex]: "" }));
      setLogs((current) => current.map((entry, entryIndex) => entryIndex === logIndex
        ? { ...entry, checklist: normalizeMaintenanceChecklist([...(entry.checklist || []), savedText]) }
        : entry));
    } catch (saveError) {
      setChecklistError(saveError?.message || "Failed to save checklist item.");
    } finally {
      setChecklistSaving(false);
    }
  }

  function handleChecklistUpdated(previous, saved) {
    const previousText = text(previous?.text);
    const nextText = text(saved?.text);
    if (!nextText) return;
    onChecklistUpdated?.(saved);
    setLogs((current) => current.map((entry) => ({
      ...entry,
      checklist: normalizeMaintenanceChecklist((entry.checklist || []).map((value) => value === previousText ? nextText : value)),
    })));
  }

  function handleChecklistDeleted(item) {
    const removedText = text(item?.text);
    onChecklistDeleted?.(item);
    setLogs((current) => current.map((entry) => ({
      ...entry,
      checklist: normalizeMaintenanceChecklist((entry.checklist || []).filter((value) => value !== removedText)),
    })));
  }

  function normalizeParts(list) {
    return (Array.isArray(list) ? list : []).map((part) => {
      const id = text(part?.id);
      const selected = spareOptions.find((option) => text(option?.value) === id);
      const name = text(selected?.label ?? part?.name);
      const qtyValue = Number(part?.qty);
      const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? Math.max(1, Math.round(qtyValue)) : 1;
      return { id, name, qty };
    }).filter((part) => part.id || part.name);
  }

  function submit(event) {
    event.preventDefault();
    const normalized = logs.map((entry) => {
      const sparePartsNeeded = normalizeParts(entry.sparePartsNeeded);
      const sparePartsReplaced = normalizeParts(entry.sparePartsReplaced);
      return {
        orderId: entry.orderId,
        serialNumber: text(entry.serialNumber),
        resolutionMethod: text(entry.resolutionMethod),
        actualIssueDescription: text(entry.actualIssueDescription),
        repairAction: text(entry.repairAction),
        sparePartsNeeded,
        sparePartsReplaced,
        // Backward-compatible aliases used by the legacy branch.
        spareParts: sparePartsReplaced,
        sparePartIds: sparePartsReplaced.map((part) => part.id).filter(Boolean),
        sparePartNames: sparePartsReplaced.map((part) => part.name).filter(Boolean),
        checklist: normalizeMaintenanceChecklist(entry.checklist),
      };
    });
    onSubmit(normalized);
  }

  const renderSpareBlock = (entry, logIndex, listKey, title, hint) => {
    const list = Array.isArray(entry[listKey]) ? entry[listKey] : [];
    return <div className="co-submodal-field req-maintenance-log-card__spares next-maintenance-spare-frame">
      <div className="req-maintenance-spare-head next-maintenance-spare-frame__head">
        <span className="co-submodal-label">{title}</span>
        <small>{hint}</small>
      </div>
      <div className="req-maintenance-spare-list">{list.map((part, spareIndex) => <div className="req-maintenance-spare-row next-maintenance-spare-row" key={`${logIndex}-${listKey}-${spareIndex}`}>
        <div className="co-submodal-field req-maintenance-spare-row__part"><span className="co-submodal-label">Spare part</span><ModernSelect value={part.id || part.name} options={spareOptions} placeholder="Select component" searchable onChange={(value) => { const selected = spareOptions.find((option) => option.value === value); patchSpare(logIndex, listKey, spareIndex, { id: selected ? value : "", name: selected?.label || value }); }} disabled={busy} ariaLabel={`${title} item ${spareIndex + 1} for ${entry.productName}`} /></div>
        <label className="co-submodal-field req-maintenance-spare-row__qty"><span className="co-submodal-label">Qty</span><input className="co-submodal-input" type="number" min="1" step="1" inputMode="numeric" value={part.qty} onChange={(event) => patchSpare(logIndex, listKey, spareIndex, { qty: event.target.value })} disabled={busy} /></label>
        <button type="button" className="req-maintenance-spare-row__remove" onClick={() => removeSpare(logIndex, listKey, spareIndex)} disabled={busy} aria-label={list.length <= 1 ? `Clear ${title} item` : `Remove ${title} item`}><span aria-hidden="true">×</span></button>
      </div>)}</div>
      <button type="button" className="req-maintenance-spare-add req-maintenance-spare-add--full" onClick={() => addSpare(logIndex, listKey)} disabled={busy}><span className="req-maintenance-spare-add__icon">+</span><span>Add spare part</span></button>
    </div>;
  };

  return (
    <div className="co-submodal-overlay is-open next-maintenance-log-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy && !checklistSaving) onCancel(); }}>
      <form className="co-submodal-dialog req-maintenance-log-dialog next-maintenance-log-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <button type="button" className="co-submodal-close" onClick={onCancel} disabled={busy || checklistSaving} aria-label="Close" />
        <div className="co-submodal-header next-maintenance-log-header">
          <div className="req-edit-icon"><ClassicOrderIcon name={isEditMode ? "edit-2" : "clipboard"} /></div>
          <div className="next-maintenance-log-header__copy">
            <div className="co-submodal-title">{isEditMode ? "Edit Maintenance Log" : isSecondMode ? "Make Second Log" : "Log Maintenance"}</div>
            {!isSecondMode ? <div className="co-submodal-sub">{isEditMode ? "Update the latest saved maintenance log below." : "Record the maintenance work completed for each component."}</div> : null}
            <div className="next-maintenance-log-header__meta" aria-label="Maintenance log summary">
              <span><ClassicOrderIcon name="tool" />{group.orderIdLabel || "Maintenance order"}</span>
              <span><ClassicOrderIcon name="layers" />{logs.length} component{logs.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
        <div className="co-submodal-body req-maintenance-log-body">
          <div className="req-maintenance-log-items">
            {logs.map((entry, logIndex) => <section className="req-maintenance-log-card next-maintenance-log-card" key={entry.orderId || logIndex}>
              <div className="req-maintenance-log-card__head next-maintenance-log-card__head">
                <span className="next-maintenance-log-card__icon"><ClassicOrderIcon name="tool" /></span>
                <div className="next-maintenance-log-card__identity"><div className="req-maintenance-log-card__label">Component {logIndex + 1}</div><div className="req-maintenance-log-card__title">{entry.productName}</div></div>
                <span className={`next-maintenance-log-card__mode ${isEditMode ? "is-edit" : ""}`}>{isEditMode ? "Editing" : isSecondMode ? "Log Two" : "Log One"}</span>
                <div className="req-maintenance-log-card__issue"><span>Issue:</span> {entry.issueDescription}</div>
              </div>
              <div className="req-maintenance-log-card__fields">
                <label className="co-submodal-field next-maintenance-serial-field"><span className="co-submodal-label">Serial Number</span><input className="co-submodal-input" type="text" value={entry.serialNumber} onChange={(event) => patchLog(logIndex, { serialNumber: event.target.value })} disabled={busy} readOnly={isSecondMode} aria-readonly={isSecondMode} placeholder="Enter equipment serial number" autoComplete="off" /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">Resolution Method</span><ModernSelect value={entry.resolutionMethod} options={resolutionMethods} placeholder="Select resolution method" onChange={(value) => patchLog(logIndex, { resolutionMethod: value })} disabled={busy} ariaLabel={`Resolution method for ${entry.productName}`} /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">The Actual Issue Description</span><textarea className="co-submodal-textarea" dir="auto" value={entry.actualIssueDescription} onChange={(event) => patchLog(logIndex, { actualIssueDescription: event.target.value })} disabled={busy} rows={4} placeholder="Write the actual issue description" /></label>
                <label className="co-submodal-field"><span className="co-submodal-label">Repair Action</span><textarea className="co-submodal-textarea" dir="auto" value={entry.repairAction} onChange={(event) => patchLog(logIndex, { repairAction: event.target.value })} disabled={busy} rows={4} placeholder="Write the repair action" /></label>
                {renderSpareBlock(entry, logIndex, "sparePartsNeeded", "Spare parts needed", "Components that need to be replaced")}
                {renderSpareBlock(entry, logIndex, "sparePartsReplaced", "Spare parts replaced", "Components that were actually replaced")}
                {canReadChecklist ? <div className="co-submodal-field req-maintenance-log-card__spares next-maintenance-checklist-frame">
                  <div className="req-maintenance-spare-head next-maintenance-spare-frame__head"><span className="co-submodal-label">Maintenance Checklist</span><small>Select saved text items or add a new one.</small></div>
                  <div className="next-maintenance-checklist-options">
                    {checklistItems.length ? checklistItems.map((item) => <MaintenanceChecklistOption
                      key={item.id || item.text}
                      item={item}
                      checked={normalizeMaintenanceChecklist(entry.checklist).includes(item.text)}
                      disabled={busy || checklistSaving}
                      onToggle={() => toggleChecklist(logIndex, item.text)}
                      canManage={canManageChecklist}
                      onUpdated={handleChecklistUpdated}
                      onDeleted={handleChecklistDeleted}
                      onError={setChecklistError}
                    />) : <div className="next-maintenance-checklist-empty">No saved checklist items yet.</div>}
                  </div>
                  {canManageChecklist ? <div className="next-maintenance-checklist-add">
                    <input className="co-submodal-input" type="text" value={newChecklistText[logIndex] || ""} onChange={(event) => setNewChecklistText((current) => ({ ...current, [logIndex]: event.target.value }))} placeholder="Add checklist text..." disabled={busy || checklistSaving} />
                    <button type="button" className="ro-action-btn ro-action-btn--light" onClick={() => addChecklistItem(logIndex)} disabled={busy || checklistSaving || !text(newChecklistText[logIndex])}>+ Add</button>
                  </div> : null}
                </div> : null}
              </div>
            </section>)}
          </div>
          <div className="co-submodal-error" role="alert" aria-live="polite">{checklistError || error}</div>
        </div>
        <div className="co-submodal-actions next-maintenance-log-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy || checklistSaving}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy || checklistSaving}>{busy ? "Saving…" : isEditMode ? "Save changes" : "Confirm"}</button></div>
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

export function MarkDoneModal({ group, busy, error, onCancel, onSubmit }) {
  const [files, setFiles] = useState([]);
  const [receiptNumbers, setReceiptNumbers] = useState([""]);
  const inputRef = useRef(null);
  const requiresReceiptNumbers = Boolean(group?.spareParts?.length);

  useEffect(() => {
    setFiles([]);
    setReceiptNumbers([""]);
  }, [group?.key]);

  useEffect(() => {
    if (!group) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, busy, onCancel]);

  if (!group) return null;

  function submit(event) {
    event.preventDefault();
    onSubmit({ files, receiptNumbers });
  }

  function patchReceipt(index, value) {
    setReceiptNumbers((current) => current.map((entry, entryIndex) => entryIndex === index ? value : entry));
  }

  function removeReceipt(index) {
    setReceiptNumbers((current) => {
      const next = current.filter((_, entryIndex) => entryIndex !== index);
      return next.length ? next : [""];
    });
  }

  return (
    <div className="co-submodal-overlay is-open next-maintenance-receipt-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <form className="co-submodal-dialog next-maintenance-receipt-dialog" role="dialog" aria-modal="true" onSubmit={submit}>
        <button type="button" className="co-submodal-close" onClick={onCancel} disabled={busy} aria-label="Close" />
        <div className="co-submodal-header"><div><div className="co-submodal-title">Upload Signed Maintenance Report</div><div className="co-submodal-sub">Please upload the maintenance report after it has been signed.</div></div></div>
        <div className="co-submodal-body">
          {requiresReceiptNumbers ? <div className="co-submodal-field next-maintenance-receipt-numbers"><span className="co-submodal-label">Store Receipt Number</span><div className="co-submodal-inputs next-maintenance-receipt-inputs">{receiptNumbers.map((value, index) => <div className="next-maintenance-receipt-input-row" key={index}><input className="co-submodal-input req-delivery-receipt-input" value={value} onChange={(event) => patchReceipt(index, event.target.value)} placeholder={index === 0 ? "e.g. 12345, 67890" : "Other receipt number"} disabled={busy} inputMode="numeric" aria-label={`Store Receipt Number ${index + 1}`} />{index > 0 ? <button type="button" className="next-maintenance-receipt-input-remove" onClick={() => removeReceipt(index)} disabled={busy} aria-label={`Remove Store Receipt Number ${index + 1}`}>×</button> : null}</div>)}</div><button type="button" className="ro-action-btn ro-action-btn--light co-submodal-add" onClick={() => setReceiptNumbers((current) => [...current, ""])} disabled={busy}>Add Other Receipt</button></div> : null}
          <div className="co-submodal-field"><span className="co-submodal-label">Signed maintenance report images</span><input ref={inputRef} className="co-upload-field__input" type="file" accept="image/*" multiple hidden onChange={(event) => setFiles(Array.from(event.target.files || []))} disabled={busy} /><button type="button" className="co-upload-field next-maintenance-upload-field" onClick={() => inputRef.current?.click()} disabled={busy}><span className="co-upload-field__icon"><ClassicOrderIcon name="upload-cloud" /></span><span className="co-upload-field__content"><span className="co-upload-field__title">{files.length ? `${files.length} image${files.length === 1 ? "" : "s"} selected` : "Choose images"}</span><span className="co-upload-field__meta">{files.length ? files.map((file) => file.name).join(" • ") : "PNG, JPG or WEBP"}</span></span></button></div>
          <div className="co-submodal-error" role="alert" aria-live="polite">{error}</div>
        </div>
        <div className="co-submodal-actions"><button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="ro-action-btn ro-action-btn--dark" disabled={busy || !files.length}>{busy ? "Uploading…" : "Confirm"}</button></div>
      </form>
    </div>
  );
}

export function MaintenanceActionPasswordModal({ state, busy, error, onCancel, onSubmit }) {
  const [password, setPassword] = useState("");
  useEffect(() => setPassword(""), [state?.action, state?.group?.key]);
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, onCancel]);
  if (!state) return null;
  const config = MAINTENANCE_ACTIONS[state.action];
  if (!config) return null;
  if (state.action === "delete") {
    return <DeleteVerificationDialog title={`Delete ${state.group?.orderIdLabel || "maintenance order"}`} password={password} onPasswordChange={setPassword} busy={busy} error={error} onCancel={onCancel} onSubmit={onSubmit} />;
  }
  return (
    <div className="co-submodal-overlay is-open req-edit-modal" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <form className="co-submodal-dialog req-edit-dialog" role="dialog" aria-modal="true" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
        <button type="button" className="co-submodal-close" onClick={onCancel} aria-label="Close admin password dialog" />
        <div className="co-submodal-header req-edit-header">
          <div className={`req-edit-icon ${config.danger ? "req-edit-icon--danger" : ""}`} aria-hidden="true"><ClassicOrderIcon name={config.icon} /></div>
          <div><div className="co-submodal-title">{config.title}</div><div className="co-submodal-sub">{config.description}</div></div>
        </div>
        <div className="co-submodal-body">
          <label className="co-submodal-label" htmlFor="maintenance-order-admin-password">Admin password</label>
          <input id="maintenance-order-admin-password" className="co-submodal-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" placeholder="••••••••" disabled={busy} />
          <div className="co-submodal-error" role="alert" aria-live="polite">{error}</div>
        </div>
        <div className="co-submodal-actions">
          <button type="button" className="ro-action-btn ro-action-btn--light" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className={`ro-action-btn ${config.danger ? "ro-action-btn--danger" : "ro-action-btn--dark"}`} disabled={busy || !password.trim()}>{busy ? "Working…" : config.button}</button>
        </div>
      </form>
    </div>
  );
}

export function MaintenanceDeleteConfirmationModal({ state, busy, onCancel, onConfirm }) {
  if (!state) return null;
  const count = state.group?.items?.length || state.group?.orderIds?.length || 1;
  return <DeleteConfirmDialog
    title={`Delete ${state.group?.orderIdLabel || "maintenance order"}?`}
    message={`You’re going to permanently delete this maintenance order and its ${count} saved component${count === 1 ? "" : "s"}. This action cannot be undone.`}
    busy={busy}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />;
}


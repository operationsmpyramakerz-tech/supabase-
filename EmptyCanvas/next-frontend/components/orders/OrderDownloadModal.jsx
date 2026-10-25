"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ClassicOrderIcon from "./ClassicOrderIcon";

export const ORDER_EXPORT_COLUMNS = [
  ["idCode", "ID Code"],
  ["component", "Component"],
  ["qty", "Quantity"],
  ["unit", "Unit Cost"],
  ["total", "Total Cost"],
];

export const ORDER_SIGNATURE_OPTIONS = [
  "Storekeeper",
  "Operations",
  "Delivered to",
  "Received From",
];

const STORAGE_KEY = "operations-hub.order-download-instructions.v1";

function text(value) {
  return String(value ?? "").trim();
}

function containsArabic(value) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(value || ""));
}

function splitLegacyInstructionText(value) {
  const raw = text(value);
  if (!raw) return { englishText: "", arabicText: "" };

  const english = [];
  const arabic = [];
  const blocks = raw.split(/\n[ \t]*\n+/).map((part) => text(part)).filter(Boolean);
  for (const block of blocks.length ? blocks : [raw]) {
    (containsArabic(block) ? arabic : english).push(block);
  }
  return { englishText: english.join("\n\n"), arabicText: arabic.join("\n\n") };
}

function normalizeTemplate(item) {
  const legacy = splitLegacyInstructionText(item?.text || item?.body);
  return {
    id: text(item?.id),
    title: text(item?.title),
    englishText: text(item?.englishText || item?.english_text || item?.english || legacy.englishText),
    arabicText: text(item?.arabicText || item?.arabic_text || item?.arabic || legacy.arabicText),
  };
}

function loadLegacyTemplates() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeTemplate)
          .filter((item) => item.title && (item.englishText || item.arabicText))
      : [];
  } catch {
    return [];
  }
}

function clearLegacyTemplates() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

async function instructionApi(options = {}) {
  const response = await fetch(`/next/api/orders/download-instructions`, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || "Saved instructions request failed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadTemplatesFromDatabase() {
  const payload = await instructionApi();
  const source = Array.isArray(payload) ? payload : payload?.items;
  return {
    items: (Array.isArray(source) ? source : [])
      .map(normalizeTemplate)
      .filter((item) => item.id && item.title && (item.englishText || item.arabicText)),
    canManage: payload?.canManage === true,
  };
}

async function createTemplateInDatabase(template) {
  const payload = await instructionApi({
    method: "POST",
    body: JSON.stringify({
      title: text(template?.title),
      englishText: text(template?.englishText),
      arabicText: text(template?.arabicText),
    }),
  });
  return normalizeTemplate(payload?.item || payload);
}

async function updateTemplateInDatabase(template) {
  const id = text(template?.id);
  if (!id) return createTemplateInDatabase(template);
  const payload = await instructionApi({
    method: "PATCH",
    body: JSON.stringify({
      id,
      title: text(template?.title),
      englishText: text(template?.englishText),
      arabicText: text(template?.arabicText),
    }),
  });
  return normalizeTemplate(payload?.item || payload);
}

function templateFingerprint(item) {
  const normalized = normalizeTemplate(item);
  return [normalized.title, normalized.englishText, normalized.arabicText]
    .map((value) => value.toLowerCase())
    .join("\u0000");
}

function InstructionComposer({ onClose, onSave, initialTemplate = null }) {
  const normalizedInitial = useMemo(() => normalizeTemplate(initialTemplate || {}), [initialTemplate]);
  const [title, setTitle] = useState(() => text(normalizedInitial.title));
  const [englishBody, setEnglishBody] = useState(() => text(normalizedInitial.englishText));
  const [arabicBody, setArabicBody] = useState(() => text(normalizedInitial.arabicText));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus?.();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = Boolean(text(title) && (text(englishBody) || text(arabicBody)));

  return (
    <div className="order-instruction-editor-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form
        className="order-instruction-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-instruction-editor-title"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSave || saving) return;
          setSaving(true);
          setSaveError("");
          try {
            await onSave({
              id: text(initialTemplate?.id),
              title: text(title),
              englishText: text(englishBody),
              arabicText: text(arabicBody),
            });
          } catch (saveInstructionError) {
            setSaveError(saveInstructionError?.message || "Instructions could not be saved.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <button type="button" className="order-download-close" onClick={onClose} aria-label="Close add instructions dialog"><ClassicOrderIcon name="x" /></button>
        <div className="order-download-header">
          <span className="order-download-header__icon"><ClassicOrderIcon name="file-text" /></span>
          <div>
            <h3 id="order-instruction-editor-title">{initialTemplate ? "Edit Instructions" : "Add new Instructions"}</h3>
            <p>{initialTemplate ? "Update the selected reusable instructions." : "Save separate English and Arabic instructions for future order files."}</p>
          </div>
        </div>
        <div className="order-instruction-editor__fields">
          <label>
            <span>Title *</span>
            <input ref={titleRef} type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Example: Delivery notes" />
          </label>
          <label>
            <span>English Instructions</span>
            <textarea
              value={englishBody}
              onChange={(event) => setEnglishBody(event.target.value)}
              maxLength={2000}
              rows={6}
              dir="ltr"
              placeholder="Write the English instructions..."
            />
          </label>
          <label>
            <span>Arabic Instructions</span>
            <textarea
              value={arabicBody}
              onChange={(event) => setArabicBody(event.target.value)}
              maxLength={2000}
              rows={6}
              dir="rtl"
              lang="ar"
              placeholder="اكتب التعليمات باللغة العربية..."
            />
          </label>
        </div>
        {saveError ? <div className="order-download-error" role="alert">{saveError}</div> : null}
        <div className="order-download-actions order-instruction-editor__actions">
          <button type="button" className="order-download-btn order-download-btn--light" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="order-download-btn order-download-btn--dark" disabled={!canSave || saving}><ClassicOrderIcon name="check" /><span>{saving ? "Saving…" : (initialTemplate ? "Save Changes" : "Save Instructions")}</span></button>
        </div>
      </form>
    </div>
  );
}

export default function OrderDownloadModal({
  open,
  title = "Download order",
  defaultColumns = null,
  columnOptions = null,
  defaultSignatureLabels = null,
  showSignatureOptions = true,
  showRepeatedComponentOptions = false,
  defaultRepeatedComponentMode = "merge",
  showCombinedOrderOptions = false,
  orderOptions = [],
  currentOrderKey = "",
  onClose,
  onDownload,
}) {
  const availableColumns = useMemo(() => {
    const source = Array.isArray(columnOptions) && columnOptions.length ? columnOptions : ORDER_EXPORT_COLUMNS;
    return source
      .map((entry) => Array.isArray(entry)
        ? [text(entry[0]), text(entry[1]) || text(entry[0])]
        : [text(entry?.key ?? entry?.value), text(entry?.label ?? entry?.name ?? entry?.key ?? entry?.value)])
      .filter(([key]) => Boolean(key));
  }, [columnOptions]);

  const startingColumns = useMemo(() => {
    const valid = new Set(availableColumns.map(([key]) => key));
    const requested = Array.isArray(defaultColumns) ? defaultColumns.filter((key) => valid.has(key)) : [];
    return requested.length ? requested : availableColumns.map(([key]) => key);
  }, [defaultColumns, availableColumns]);

  const startingSignatures = useMemo(() => {
    const canonical = new Map(ORDER_SIGNATURE_OPTIONS.map((label) => [label.toLowerCase().replace(/[^a-z]/g, ""), label]));
    const requested = Array.isArray(defaultSignatureLabels)
      ? defaultSignatureLabels
          .map((label) => canonical.get(String(label || "").toLowerCase().replace(/[^a-z]/g, "")))
          .filter(Boolean)
      : [];
    return Array.from(new Set(requested.length ? requested : ["Storekeeper", "Operations", "Delivered to"]));
  }, [defaultSignatureLabels]);

  const normalizedOrderOptions = useMemo(() => {
    const seen = new Set();
    return (Array.isArray(orderOptions) ? orderOptions : [])
      .map((option) => ({
        key: text(option?.key),
        label: text(option?.label) || "Order",
        userName: text(option?.userName) || "—",
        orderIds: [...new Set((Array.isArray(option?.orderIds) ? option.orderIds : []).map(text).filter(Boolean))],
      }))
      .filter((option) => {
        if (!option.key || !option.orderIds.length || seen.has(option.key)) return false;
        seen.add(option.key);
        return true;
      });
  }, [orderOptions]);

  const effectiveCurrentOrderKey = useMemo(() => {
    const requested = text(currentOrderKey);
    if (requested && normalizedOrderOptions.some((option) => option.key === requested)) return requested;
    return normalizedOrderOptions[0]?.key || "";
  }, [currentOrderKey, normalizedOrderOptions]);

  const [columns, setColumns] = useState(startingColumns);
  const [signatureLabels, setSignatureLabels] = useState(startingSignatures);
  const [repeatedComponentMode, setRepeatedComponentMode] = useState(
    String(defaultRepeatedComponentMode || "").toLowerCase() === "separate" ? "separate" : "merge",
  );
  const [selectedOrderKeys, setSelectedOrderKeys] = useState(() => effectiveCurrentOrderKey ? [effectiveCurrentOrderKey] : []);
  const [orderSelectorOpen, setOrderSelectorOpen] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [canManageInstructions, setCanManageInstructions] = useState(false);
  const [canDownloadInstructions, setCanDownloadInstructions] = useState(true);
  const [selectedInstructionId, setSelectedInstructionId] = useState("");
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectorRef = useRef(null);
  const orderSelectorRef = useRef(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = Boolean(open && !wasOpenRef.current);
    wasOpenRef.current = Boolean(open);
    if (!justOpened) return;

    setColumns(startingColumns);
    setSignatureLabels(startingSignatures);
    setRepeatedComponentMode(String(defaultRepeatedComponentMode || "").toLowerCase() === "separate" ? "separate" : "merge");
    setSelectedOrderKeys(effectiveCurrentOrderKey ? [effectiveCurrentOrderKey] : []);
    setOrderSelectorOpen(false);
    setOrderQuery("");
    setTemplates([]);
    setCanManageInstructions(false);
    setCanDownloadInstructions(true);
    setTemplatesLoading(true);
    setSelectedInstructionId("");
    setInstructionOpen(false);
    setComposerOpen(false);
    setEditingInstruction(null);
    setBusy(false);
    setError("");
  }, [open, startingColumns, startingSignatures, defaultRepeatedComponentMode, effectiveCurrentOrderKey]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const permissionResult = await loadTemplatesFromDatabase();
        let databaseTemplates = permissionResult.items;
        const legacyTemplates = loadLegacyTemplates();

        if (permissionResult.canManage && legacyTemplates.length) {
          const existing = new Set(databaseTemplates.map(templateFingerprint));
          const missingLegacy = legacyTemplates.filter((item) => !existing.has(templateFingerprint(item)));
          let migratedAll = true;
          for (const legacyTemplate of missingLegacy) {
            try {
              const created = await createTemplateInDatabase(legacyTemplate);
              if (created?.id) {
                databaseTemplates.push(created);
                existing.add(templateFingerprint(created));
              }
            } catch {
              migratedAll = false;
            }
          }
          if (migratedAll) clearLegacyTemplates();
        }

        databaseTemplates = databaseTemplates
          .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
          .sort((a, b) => a.title.localeCompare(b.title));

        if (!cancelled) {
          setTemplates(databaseTemplates);
          setCanManageInstructions(permissionResult.canManage);
          setCanDownloadInstructions(true);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setTemplates([]);
          setCanManageInstructions(false);
          setCanDownloadInstructions(loadError?.status !== 403);
          setError(loadError?.status === 403 ? "" : (loadError?.message || "Saved instructions could not be loaded."));
        }
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape" || composerOpen) return;
      event.preventDefault();
      if (orderSelectorOpen) setOrderSelectorOpen(false);
      else if (instructionOpen) setInstructionOpen(false);
      else if (!busy) onClose();
    };
    const onPointerDown = (event) => {
      if (instructionOpen && !selectorRef.current?.contains(event.target)) setInstructionOpen(false);
      if (orderSelectorOpen && !orderSelectorRef.current?.contains(event.target)) setOrderSelectorOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, instructionOpen, orderSelectorOpen, composerOpen, busy, onClose]);

  if (!open) return null;

  const selectedInstruction = templates.find((item) => item.id === selectedInstructionId) || null;
  const selectedOrders = normalizedOrderOptions.filter((option) => selectedOrderKeys.includes(option.key));
  const combinedMode = showCombinedOrderOptions && selectedOrders.length > 1;
  const visibleOrderOptions = normalizedOrderOptions.filter((option) => {
    const needle = text(orderQuery).toLowerCase();
    if (!needle) return true;
    return `${option.label} ${option.userName}`.toLowerCase().includes(needle);
  });

  const toggleOrder = (key) => {
    const cleanKey = text(key);
    if (!cleanKey || cleanKey === effectiveCurrentOrderKey) return;
    setSelectedOrderKeys((current) => {
      if (current.includes(cleanKey)) return current.filter((item) => item !== cleanKey);
      return [...current, cleanKey];
    });
  };

  const toggleColumn = (key) => {
    setColumns((current) => {
      if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
      return [...current, key];
    });
  };

  const toggleSignature = (label) => {
    setSignatureLabels((current) => {
      if (current.includes(label)) return current.filter((item) => item !== label);
      return [...current, label];
    });
  };

  const runDownload = async (kind) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onDownload({
        kind,
        columns,
        signatureLabels: showSignatureOptions ? signatureLabels : null,
        repeatedComponentMode: showRepeatedComponentOptions ? (combinedMode ? "merge" : repeatedComponentMode) : null,
        combinedOrders: showCombinedOrderOptions
          ? selectedOrders.map((order) => ({
              key: order.key,
              label: order.label,
              userName: order.userName,
              orderIds: order.orderIds,
            }))
          : null,
        instruction: selectedInstruction
          ? {
              title: selectedInstruction.title,
              englishText: selectedInstruction.englishText,
              arabicText: selectedInstruction.arabicText,
            }
          : null,
      });
      // Keep the modal open after a successful download so the current choices
      // remain selected (useful when downloading PDF then Excel with the same setup).
    } catch (downloadError) {
      setError(downloadError?.message || "The file could not be downloaded.");
    } finally {
      setBusy(false);
    }
  };

  const saveInstruction = async (template) => {
    if (!canManageInstructions) throw new Error("You do not have permission to edit shared instructions.");
    const saved = template?.id
      ? await updateTemplateInDatabase(template)
      : await createTemplateInDatabase(template);
    if (!saved?.id) throw new Error("Instructions were saved but no record was returned.");

    setTemplates((current) => {
      const exists = current.some((item) => item.id === saved.id);
      const next = exists
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved];
      return next.sort((a, b) => a.title.localeCompare(b.title));
    });
    setSelectedInstructionId(saved.id);
    setEditingInstruction(null);
    setComposerOpen(false);
    setInstructionOpen(false);
    setError("");
  };

  return (
    <div className="order-download-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="order-download-dialog" role="dialog" aria-modal="true" aria-labelledby="order-download-title">
        <button type="button" className="order-download-close" onClick={onClose} disabled={busy} aria-label="Close download dialog"><ClassicOrderIcon name="x" /></button>
        <div className="order-download-header">
          <span className="order-download-header__icon"><ClassicOrderIcon name="download" /></span>
          <div>
            <h2 id="order-download-title">{title}</h2>
          </div>
        </div>

        {showCombinedOrderOptions && normalizedOrderOptions.length > 1 ? (
          <div className="order-download-section order-download-combined-orders">
            <div className="order-download-instructions__heading">
              <span className="order-download-section__label">Combine orders</span>
              <small>{selectedOrders.length > 1 ? `${selectedOrders.length} orders selected` : "Add orders to compare in one file"}</small>
            </div>
            <div className="order-combined-select" ref={orderSelectorRef}>
              <button
                type="button"
                className={`order-combined-select__trigger ${combinedMode ? "has-value" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={orderSelectorOpen}
                onClick={() => setOrderSelectorOpen((value) => !value)}
              >
                <span className="order-combined-select__trigger-icon"><ClassicOrderIcon name="layers" /></span>
                <span className="order-combined-select__copy">
                  <small>Orders</small>
                  <strong>{selectedOrders.length > 1 ? `${selectedOrders.length} orders combined` : `${selectedOrders[0]?.label || "Current order"} only`}</strong>
                </span>
                <ClassicOrderIcon name="chevron-down" />
              </button>
              {orderSelectorOpen ? (
                <div className="order-combined-select__menu" role="listbox" aria-label="Select orders to combine">
                  <label className="order-combined-select__search">
                    <ClassicOrderIcon name="search" />
                    <input type="search" value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Search order or user..." autoFocus />
                  </label>
                  <div className="order-combined-select__options">
                    {visibleOrderOptions.map((option) => {
                      const checked = selectedOrderKeys.includes(option.key);
                      const current = option.key === effectiveCurrentOrderKey;
                      return (
                        <label className={`order-combined-select__option ${checked ? "is-selected" : ""} ${current ? "is-current" : ""}`} key={option.key}>
                          <input type="checkbox" checked={checked} disabled={current} onChange={() => toggleOrder(option.key)} />
                          <span className="order-combined-select__option-copy">
                            <strong>{option.label}</strong>
                            <small>{option.userName}{current ? " · Current order" : ""}</small>
                          </span>
                          {checked ? <ClassicOrderIcon name="check" /> : null}
                        </label>
                      );
                    })}
                    {!visibleOrderOptions.length ? <div className="order-combined-select__empty">No matching orders</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
            {combinedMode ? <div className="order-combined-select__note"><ClassicOrderIcon name="check-circle" /><span>Matching components will use one row. Selected quantity columns become one column per order.</span></div> : null}
          </div>
        ) : null}

        <div className="order-download-section order-download-columns">
          <span className="order-download-section__label">Columns</span>
          <div className="order-download-columns__grid">
            {availableColumns.map(([key, label]) => (
              <label key={key} className="order-download-column-option">
                <input type="checkbox" checked={columns.includes(key)} onChange={() => toggleColumn(key)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {showRepeatedComponentOptions ? (
          <div className="order-download-section order-download-repeated-components">
            <div className="order-download-instructions__heading">
              <span className="order-download-section__label">Repeated components</span>
              {combinedMode ? <small>Combined exports always merge matching components.</small> : null}
            </div>
            {combinedMode ? (
              <div className="order-download-repeat-auto"><ClassicOrderIcon name="layers" /><span><strong>Combined automatically</strong><small>Each component appears once, with each order quantity in its own column.</small></span></div>
            ) : (
              <div className="order-download-columns__grid order-download-repeat-grid">
                <label className={`order-download-column-option order-download-repeat-option ${repeatedComponentMode === "merge" ? "is-selected" : ""}`}>
                  <input type="radio" name="repeated-component-mode" checked={repeatedComponentMode === "merge"} onChange={() => setRepeatedComponentMode("merge")} />
                  <span><strong>Combine quantities</strong><small>Add matching component quantities into one row.</small></span>
                </label>
                <label className={`order-download-column-option order-download-repeat-option ${repeatedComponentMode === "separate" ? "is-selected" : ""}`}>
                  <input type="radio" name="repeated-component-mode" checked={repeatedComponentMode === "separate"} onChange={() => setRepeatedComponentMode("separate")} />
                  <span><strong>Keep separate</strong><small>Keep repeated components in their original kit/tag rows.</small></span>
                </label>
              </div>
            )}
          </div>
        ) : null}

        {showSignatureOptions ? (
          <div className="order-download-section order-download-signatures">
            <div className="order-download-instructions__heading">
              <span className="order-download-section__label">Signatures</span>
            </div>
            <div className="order-download-columns__grid">
              {ORDER_SIGNATURE_OPTIONS.map((label) => (
                <label key={label} className="order-download-column-option">
                  <input type="checkbox" checked={signatureLabels.includes(label)} onChange={() => toggleSignature(label)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {canDownloadInstructions ? <div className="order-download-section order-download-instructions">
          <div className="order-download-instructions__heading">
            <span className="order-download-section__label">Instructions</span>
          </div>
          <div className="order-instruction-select" ref={selectorRef}>
            <button
              type="button"
              className={`order-instruction-select__trigger ${selectedInstruction ? "has-value" : ""}`}
              aria-haspopup="listbox"
              aria-expanded={instructionOpen}
              onClick={() => setInstructionOpen((value) => !value)}
            >
              <span className="order-instruction-select__copy">
                <small>{selectedInstruction ? "Selected instructions" : "Instructions"}</small>
                <strong>{selectedInstruction?.title || "No instructions"}</strong>
              </span>
              <ClassicOrderIcon name="chevron-down" />
            </button>
            {instructionOpen ? (
              <div className="order-instruction-select__menu" role="listbox" aria-label="Saved instructions">
                <button type="button" className={`order-instruction-select__option ${!selectedInstructionId ? "is-selected" : ""}`} onClick={() => { setSelectedInstructionId(""); setInstructionOpen(false); }}>
                  <span><strong>No instructions</strong><small>Export without an instructions block</small></span>
                  {!selectedInstructionId ? <ClassicOrderIcon name="check" /> : null}
                </button>
                {templatesLoading ? (
                  <div className="order-instruction-select__option" aria-disabled="true">
                    <span><strong>Loading instructions…</strong><small>Reading saved templates from the database</small></span>
                  </div>
                ) : null}
                {!templatesLoading && templates.length === 0 ? (
                  <div className="order-instruction-select__option" aria-disabled="true">
                    <span><strong>No saved instructions yet</strong><small>Add one below and it will be stored in Supabase</small></span>
                  </div>
                ) : null}
                {templates.map((template) => (
                  <button type="button" className={`order-instruction-select__option ${selectedInstructionId === template.id ? "is-selected" : ""}`} key={template.id} onClick={() => { setSelectedInstructionId(template.id); setInstructionOpen(false); }}>
                    <span><strong>{template.title}</strong><small>{template.englishText || template.arabicText}</small></span>
                    {selectedInstructionId === template.id ? <ClassicOrderIcon name="check" /> : null}
                  </button>
                ))}
                {canManageInstructions ? <div className="order-instruction-select__divider" /> : null}
                {canManageInstructions ? <button type="button" className="order-instruction-select__add" onClick={() => { setInstructionOpen(false); setEditingInstruction(null); setComposerOpen(true); }}>
                  <span className="order-instruction-select__add-icon">+</span>
                  <span><strong>Add new Instructions</strong><small>Save English and Arabic text separately</small></span>
                </button> : null}
              </div>
            ) : null}
          </div>
          {selectedInstruction ? (
            <div className="order-download-instruction-preview">
              <div className="order-download-instruction-preview__head">
                <strong>{selectedInstruction.title}</strong>
                {canManageInstructions ? <button
                  type="button"
                  className="order-download-instruction-edit"
                  aria-label="Edit selected instructions"
                  title="Edit instructions"
                  onClick={() => { setInstructionOpen(false); setEditingInstruction(selectedInstruction); setComposerOpen(true); }}
                >
                  <ClassicOrderIcon name="edit-2" />
                </button> : null}
              </div>
              {selectedInstruction.englishText ? <p dir="ltr">{selectedInstruction.englishText}</p> : null}
              {selectedInstruction.arabicText ? <p dir="rtl" lang="ar">{selectedInstruction.arabicText}</p> : null}
            </div>
          ) : null}
        </div> : null}

        {error ? <div className="order-download-error" role="alert">{error}</div> : null}

        <div className="order-download-actions">
          <button type="button" className="order-download-btn order-download-btn--dark" disabled={busy} onClick={() => runDownload("pdf")}><ClassicOrderIcon name="file-text" /><span>{busy ? "Preparing…" : "Download PDF"}</span></button>
          <button type="button" className="order-download-btn order-download-btn--dark" disabled={busy} onClick={() => runDownload("excel")}><ClassicOrderIcon name="grid" /><span>{busy ? "Preparing…" : "Download Excel"}</span></button>
        </div>
      </div>
      {composerOpen && canManageInstructions ? <InstructionComposer initialTemplate={editingInstruction} onClose={() => { setComposerOpen(false); setEditingInstruction(null); }} onSave={saveInstruction} /> : null}
    </div>
  );
}

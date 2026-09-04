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
    englishText: text(item?.englishText || item?.english || legacy.englishText),
    arabicText: text(item?.arabicText || item?.arabic || legacy.arabicText),
  };
}

function loadTemplates() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeTemplate)
          .filter((item) => item.id && item.title && (item.englishText || item.arabicText))
      : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {}
}

function makeTemplateId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `instruction-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function InstructionComposer({ onClose, onSave, initialTemplate = null }) {
  const normalizedInitial = useMemo(() => normalizeTemplate(initialTemplate || {}), [initialTemplate]);
  const [title, setTitle] = useState(() => text(normalizedInitial.title));
  const [englishBody, setEnglishBody] = useState(() => text(normalizedInitial.englishText));
  const [arabicBody, setArabicBody] = useState(() => text(normalizedInitial.arabicText));
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
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onSave({
            id: text(initialTemplate?.id) || makeTemplateId(),
            title: text(title),
            englishText: text(englishBody),
            arabicText: text(arabicBody),
          });
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
        <div className="order-download-actions order-instruction-editor__actions">
          <button type="button" className="order-download-btn order-download-btn--light" onClick={onClose}>Cancel</button>
          <button type="submit" className="order-download-btn order-download-btn--dark" disabled={!canSave}><ClassicOrderIcon name="check" /><span>{initialTemplate ? "Save Changes" : "Save Instructions"}</span></button>
        </div>
      </form>
    </div>
  );
}

export default function OrderDownloadModal({
  open,
  title = "Download order",
  subtitle = "Choose the columns and optional instructions, then select the file type.",
  defaultColumns = null,
  onClose,
  onDownload,
}) {
  const startingColumns = useMemo(() => {
    const valid = new Set(ORDER_EXPORT_COLUMNS.map(([key]) => key));
    const requested = Array.isArray(defaultColumns) ? defaultColumns.filter((key) => valid.has(key)) : [];
    return requested.length ? requested : ORDER_EXPORT_COLUMNS.map(([key]) => key);
  }, [defaultColumns]);

  const [columns, setColumns] = useState(startingColumns);
  const [templates, setTemplates] = useState([]);
  const [selectedInstructionId, setSelectedInstructionId] = useState("");
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectorRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setColumns(startingColumns);
    setTemplates(loadTemplates());
    setSelectedInstructionId("");
    setInstructionOpen(false);
    setComposerOpen(false);
    setEditingInstruction(null);
    setBusy(false);
    setError("");
  }, [open, startingColumns]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape" || composerOpen) return;
      event.preventDefault();
      if (instructionOpen) setInstructionOpen(false);
      else if (!busy) onClose();
    };
    const onPointerDown = (event) => {
      if (instructionOpen && !selectorRef.current?.contains(event.target)) setInstructionOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, instructionOpen, composerOpen, busy, onClose]);

  if (!open) return null;

  const selectedInstruction = templates.find((item) => item.id === selectedInstructionId) || null;

  const toggleColumn = (key) => {
    setColumns((current) => {
      if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
      return [...current, key];
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
        instruction: selectedInstruction
          ? {
              title: selectedInstruction.title,
              englishText: selectedInstruction.englishText,
              arabicText: selectedInstruction.arabicText,
            }
          : null,
      });
      onClose();
    } catch (downloadError) {
      setError(downloadError?.message || "The file could not be downloaded.");
    } finally {
      setBusy(false);
    }
  };

  const saveInstruction = (template) => {
    const exists = templates.some((item) => item.id === template.id);
    const next = exists
      ? templates.map((item) => (item.id === template.id ? template : item))
      : [...templates, template];
    setTemplates(next);
    saveTemplates(next);
    setSelectedInstructionId(template.id);
    setEditingInstruction(null);
    setComposerOpen(false);
    setInstructionOpen(false);
  };

  return (
    <div className="order-download-overlay" aria-hidden="false" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="order-download-dialog" role="dialog" aria-modal="true" aria-labelledby="order-download-title">
        <button type="button" className="order-download-close" onClick={onClose} disabled={busy} aria-label="Close download dialog"><ClassicOrderIcon name="x" /></button>
        <div className="order-download-header">
          <span className="order-download-header__icon"><ClassicOrderIcon name="download" /></span>
          <div>
            <h2 id="order-download-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>

        <div className="order-download-section order-download-columns">
          <span className="order-download-section__label">Columns</span>
          <div className="order-download-columns__grid">
            {ORDER_EXPORT_COLUMNS.map(([key, label]) => (
              <label key={key} className="order-download-column-option">
                <input type="checkbox" checked={columns.includes(key)} onChange={() => toggleColumn(key)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="order-download-section order-download-instructions">
          <div className="order-download-instructions__heading">
            <span className="order-download-section__label">Instructions</span>
            <small>Optional text block shown at the beginning of the exported file.</small>
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
                {templates.map((template) => (
                  <button type="button" className={`order-instruction-select__option ${selectedInstructionId === template.id ? "is-selected" : ""}`} key={template.id} onClick={() => { setSelectedInstructionId(template.id); setInstructionOpen(false); }}>
                    <span><strong>{template.title}</strong><small>{template.englishText || template.arabicText}</small></span>
                    {selectedInstructionId === template.id ? <ClassicOrderIcon name="check" /> : null}
                  </button>
                ))}
                <div className="order-instruction-select__divider" />
                <button type="button" className="order-instruction-select__add" onClick={() => { setInstructionOpen(false); setEditingInstruction(null); setComposerOpen(true); }}>
                  <span className="order-instruction-select__add-icon">+</span>
                  <span><strong>Add new Instructions</strong><small>Save English and Arabic text separately</small></span>
                </button>
              </div>
            ) : null}
          </div>
          {selectedInstruction ? (
            <div className="order-download-instruction-preview">
              <div className="order-download-instruction-preview__head">
                <strong>{selectedInstruction.title}</strong>
                <button
                  type="button"
                  className="order-download-instruction-edit"
                  aria-label="Edit selected instructions"
                  title="Edit instructions"
                  onClick={() => { setInstructionOpen(false); setEditingInstruction(selectedInstruction); setComposerOpen(true); }}
                >
                  <ClassicOrderIcon name="edit-2" />
                </button>
              </div>
              {selectedInstruction.englishText ? <p dir="ltr">{selectedInstruction.englishText}</p> : null}
              {selectedInstruction.arabicText ? <p dir="rtl" lang="ar">{selectedInstruction.arabicText}</p> : null}
            </div>
          ) : null}
        </div>

        {error ? <div className="order-download-error" role="alert">{error}</div> : null}

        <div className="order-download-actions">
          <button type="button" className="order-download-btn order-download-btn--dark" disabled={busy} onClick={() => runDownload("pdf")}><ClassicOrderIcon name="file-text" /><span>{busy ? "Preparing…" : "Download PDF"}</span></button>
          <button type="button" className="order-download-btn order-download-btn--dark" disabled={busy} onClick={() => runDownload("excel")}><ClassicOrderIcon name="grid" /><span>{busy ? "Preparing…" : "Download Excel"}</span></button>
        </div>
      </div>
      {composerOpen ? <InstructionComposer initialTemplate={editingInstruction} onClose={() => { setComposerOpen(false); setEditingInstruction(null); }} onSave={saveInstruction} /> : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import OrderDownloadModal from "../orders/OrderDownloadModal";

const EXPORT_COLUMNS = [
  { value: "stock", label: "Stock", checked: true },
  { value: "receiptNumber", label: "Receipt number", checked: false },
  { value: "unityPrice", label: "Unity price", checked: true },
  { value: "totalPrice", label: "Total price", checked: true },
  { value: "inventory", label: "Inventory", checked: false },
  { value: "defected", label: "Defected", checked: false },
];

function text(value) {
  return String(value ?? "").trim();
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
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
    sort: <><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
    x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  };
  return <svg {...common}>{paths[name] || paths.download}</svg>;
}

function ExportModal({ onClose, columnKey = "", inventorySession = null }) {
  const columnOptions = useMemo(() => EXPORT_COLUMNS.map((column) => [column.value, column.label]), []);
  const defaultColumns = useMemo(
    () => EXPORT_COLUMNS.filter((column) => column.checked).map((column) => column.value),
    [],
  );

  const runExport = async ({ kind, columns, signatureLabels, instruction }) => {
    const fileType = kind === "excel" ? "excel" : "pdf";
    const endpoint = `/next/api/stock/export-direct?kind=${fileType}`;
    const params = new URLSearchParams({ columns: (columns || []).join(",") });
    if (columnKey) params.set("column", columnKey);
    if (inventorySession?.inventoryColumn) params.set("inventoryColumn", inventorySession.inventoryColumn);
    if (inventorySession?.defectedColumn) params.set("defectedColumn", inventorySession.defectedColumn);

    const response = await fetch(`${endpoint}&${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({
        signatureLabels: Array.isArray(signatureLabels) ? signatureLabels : null,
        instruction: instruction || null,
      }),
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
  };

  return (
    <OrderDownloadModal
      open
      title="Download stock file"
      subtitle="Choose the columns, signatures and optional instructions, then select the file type."
      columnOptions={columnOptions}
      defaultColumns={defaultColumns}
      defaultSignatureLabels={["Storekeeper", "Operations", "Delivered to"]}
      onClose={onClose}
      onDownload={runExport}
    />
  );
}

function InventorySetupModal({ column, busy, onClose, onConfirm }) {
  const [mode, setMode] = useState("both");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!date) return setError("Choose the inventory date.");
    setError("");
    try {
      await onConfirm({ mode, date });
    } catch (submitError) {
      setError(submitError?.message || "Inventory columns could not be prepared.");
    }
  };

  return (
    <div className="stocktaking-inventory-modal" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="stocktaking-inventory-modal__card" role="dialog" aria-modal="true" aria-label="Make inventory">
        <button type="button" className="stocktaking-inventory-modal__close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        <header>
          <span className="stocktaking-inventory-modal__icon"><Icon name="folder" /></span>
          <div><small>INVENTORY SETUP</small><h3>Make inventory</h3><p>{column?.label || "Stocktaking"}</p></div>
        </header>
        <form onSubmit={submit}>
          <label className="stocktaking-inventory-field">
            <span>Columns</span>
            <select value={mode} onChange={(event) => setMode(event.target.value)} disabled={busy}>
              <option value="both">Inventory &amp; Defecated</option>
              <option value="inventory">Inventory</option>
              <option value="defected">Defecated</option>
            </select>
          </label>
          <label className="stocktaking-inventory-field">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={busy} />
          </label>
          {error ? <div className="stocktaking-inventory-modal__error">{error}</div> : null}
          <footer>
            <button type="button" className="btn btn--light" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn stocktaking-inventory-confirm" disabled={busy}><span>{busy ? "Preparing…" : "Confirm"}</span></button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function InventoryFinishModal({ session, columnKey, busy, onClose, onDone }) {
  const hasInventory = !!session?.inventoryColumn;
  const hasDefected = !!session?.defectedColumn;
  const [fileType, setFileType] = useState("pdf");
  const [columnsMode, setColumnsMode] = useState(hasInventory && hasDefected ? "both" : (hasInventory ? "inventory" : "defected"));
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setError("");
    setFinishing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const selected = ["stock"];
      if ((columnsMode === "both" || columnsMode === "inventory") && hasInventory) selected.push("inventory");
      if ((columnsMode === "both" || columnsMode === "defected") && hasDefected) selected.push("defected");
      const params = new URLSearchParams({ column: columnKey, columns: selected.join(",") });
      if (session?.inventoryColumn) params.set("inventoryColumn", session.inventoryColumn);
      if (session?.defectedColumn) params.set("defectedColumn", session.defectedColumn);
      const endpoint = `/next/api/stock/export-direct?kind=${fileType}`;
      const response = await fetch(`${endpoint}&${params.toString()}`, { credentials: "include", cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login?next=/next/stocktaking";
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Inventory export failed.");
      }
      const fallback = fileType === "excel" ? "Stocktaking-Inventory.xlsx" : "Stocktaking-Inventory.pdf";
      downloadBlob(await response.blob(), responseFileName(response, fallback));
      onDone();
    } catch (finishError) {
      setError(finishError?.message || "Inventory export failed.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="stocktaking-inventory-modal" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="stocktaking-inventory-modal__card" role="dialog" aria-modal="true" aria-label="Finish inventory">
        <button type="button" className="stocktaking-inventory-modal__close" onClick={onClose} disabled={busy || finishing} aria-label="Close">×</button>
        <header>
          <span className="stocktaking-inventory-modal__icon"><Icon name="download" /></span>
          <div><small>EXPORT &amp; CLOSE</small><h3>Finish inventory</h3><p>Download the inventory file, then hide the inventory columns.</p></div>
        </header>
        <div className="stocktaking-inventory-finish-fields">
          <label className="stocktaking-inventory-field">
            <span>File type</span>
            <select value={fileType} onChange={(event) => setFileType(event.target.value)}>
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
            </select>
          </label>
          {hasInventory && hasDefected ? (
            <label className="stocktaking-inventory-field">
              <span>Columns</span>
              <select value={columnsMode} onChange={(event) => setColumnsMode(event.target.value)}>
                <option value="both">Inventory &amp; Defecated</option>
                <option value="inventory">Inventory</option>
                <option value="defected">Defecated</option>
              </select>
            </label>
          ) : null}
        </div>
        {error ? <div className="stocktaking-inventory-modal__error">{error}</div> : null}
        <footer>
          <button type="button" className="btn btn--light" onClick={onClose} disabled={finishing}>Cancel</button>
          <button type="button" className="btn stocktaking-inventory-confirm" onClick={finish} disabled={finishing}><Icon name="download" /><span>{finishing ? "Preparing…" : "Download & finish"}</span></button>
        </footer>
      </section>
    </div>
  );
}

function StockEditPasswordModal({ column, busy, error, onClose, onSubmit }) {
  const [password, setPassword] = useState("");

  const submit = (event) => {
    event.preventDefault();
    if (!text(password) || busy) return;
    onSubmit(text(password));
  };

  return (
    <div className="stocktaking-edit-password-modal" role="presentation">
      <button type="button" className="stocktaking-edit-password-modal__backdrop" onClick={busy ? undefined : onClose} aria-label="Close" />
      <form className="stocktaking-edit-password-modal__card" role="dialog" aria-modal="true" aria-labelledby="stockEditPasswordTitle" onSubmit={submit}>
        <button type="button" className="stocktaking-edit-password-modal__close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        <header>
          <span className="stocktaking-edit-password-modal__icon"><Icon name="edit" /></span>
          <div><small>ADMIN VERIFICATION</small><h3 id="stockEditPasswordTitle">Admin password required</h3><p>Enter the Admin password to edit “{column?.label || "this Stocktaking folder"}”.</p></div>
        </header>
        <label className="stocktaking-edit-password-field">
          <span>Admin password *</span>
          <input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <div className="stocktaking-edit-password-modal__error">{error}</div> : null}
        <footer>
          <button type="button" className="btn btn--light" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn stocktaking-edit-password-confirm" disabled={busy || !text(password)}><span>{busy ? "Checking…" : "Continue"}</span></button>
        </footer>
      </form>
    </div>
  );
}



export default function StocktakingDialogs({
  editPasswordOpen, exportOpen, inventorySetupOpen, inventoryFinishOpen, activeColumn, inventorySession,
  editBusy, editPasswordError, inventoryBusy, onCloseEditPassword, onSubmitEditPassword, onCloseExport,
  onCloseInventorySetup, onConfirmInventorySetup, onCloseInventoryFinish, onFinishInventory,
}) {
  if (!activeColumn) return null;
  return (
    <>
      {editPasswordOpen ? <StockEditPasswordModal column={activeColumn} busy={editBusy} error={editPasswordError} onClose={onCloseEditPassword} onSubmit={onSubmitEditPassword} /> : null}
      {exportOpen ? <ExportModal columnKey={activeColumn.key} inventorySession={inventorySession} onClose={onCloseExport} /> : null}
      {inventorySetupOpen ? <InventorySetupModal column={activeColumn} busy={inventoryBusy} onClose={onCloseInventorySetup} onConfirm={onConfirmInventorySetup} /> : null}
      {inventoryFinishOpen && inventorySession ? <InventoryFinishModal session={inventorySession} columnKey={activeColumn.key} busy={inventoryBusy} onClose={onCloseInventoryFinish} onDone={onFinishInventory} /> : null}
    </>
  );
}

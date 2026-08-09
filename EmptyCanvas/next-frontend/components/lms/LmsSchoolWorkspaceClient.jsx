"use client";

import { useMemo, useRef, useState } from "react";

const EXPORT_COLUMNS = [
  { key: "stock", label: "In Stock", defaultChecked: true },
  { key: "receiptNumber", label: "Receipt Number", defaultChecked: false },
  { key: "unityPrice", label: "Unity Price", defaultChecked: true },
  { key: "totalPrice", label: "Total Price", defaultChecked: true },
  { key: "inventory", label: "Inventory", defaultChecked: false },
  { key: "defected", label: "Defected", defaultChecked: false },
];

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-GB") : "0";
}

function formatDate(value) {
  const raw = text(value);
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function splitValues(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|]/).map(text).filter(Boolean);
}

function normalizeSchool(item = {}) {
  const fields = item?.fields && typeof item.fields === "object" ? item.fields : {};
  const grades = item?.grades && typeof item.grades === "object" ? item.grades : {};
  const educationSystem = Array.isArray(item?.educationSystem)
    ? item.educationSystem.map(text).filter(Boolean)
    : splitValues(fields.education_system);
  return {
    id: text(item?.id),
    name: text(item?.name || fields.school_name) || "School",
    governorate: text(item?.governorate?.name || fields.governorate),
    governorateColor: text(item?.governorate?.color || "default"),
    location: text(item?.location || fields.location),
    solutionType: text(item?.programType || fields.solution_type),
    educationSystem,
    contractStatus: text(item?.contractStatus || fields.contract_status),
    stocktakingColumn: text(item?.stocktakingColumn || fields.stocktaking_column),
    grades,
    fields,
  };
}

function normalizeStockPayload(payload = {}) {
  const rawItems = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  return {
    meta: payload && !Array.isArray(payload) && typeof payload === "object" ? (payload.meta || {}) : {},
    items: rawItems.map((item) => ({
      id: text(item?.id),
      name: text(item?.name) || "Untitled component",
      url: text(item?.url),
      idCode: text(item?.idCode),
      receiptNumber: text(item?.receiptNumber),
      doneQuantity: Number(item?.doneQuantity) || 0,
      inventory: numeric(item?.inventory),
      defected: numeric(item?.defected),
      tag: {
        name: text(item?.tag?.name) || "Untagged",
        color: text(item?.tag?.color) || "default",
      },
    })),
  };
}

function checkedGrades(school) {
  const output = [];
  const grades = school?.grades || {};
  for (let index = 1; index <= 12; index += 1) {
    const checked = grades[index] ?? grades[String(index)] ?? grades[`G${index}`] ?? grades[`g${index}`] ?? school?.fields?.[`g${index}`];
    if (checked) output.push(`G${index}`);
  }
  return output;
}

function tagTone(color, name) {
  const canon = lower(name).replace(/[^a-z0-9]+/g, "");
  if (canon.includes("requestproduct")) return { bg: "#ecfdf3", fg: "#087443", border: "#a6f4c5" };
  if (canon.includes("withdrawproduct")) return { bg: "#fff1f3", fg: "#c01048", border: "#fecdd6" };
  const tones = {
    gray: ["#f2f4f7", "#344054", "#d0d5dd"],
    brown: ["#f7f0ec", "#7a3e22", "#e6cbbd"],
    orange: ["#fff6ed", "#c4320a", "#fedf89"],
    yellow: ["#fefbe8", "#a15c07", "#fef0c7"],
    green: ["#ecfdf3", "#087443", "#a6f4c5"],
    blue: ["#eff8ff", "#175cd3", "#b2ddff"],
    purple: ["#f4f3ff", "#5925dc", "#d9d6fe"],
    pink: ["#fdf2fa", "#c11574", "#fcceee"],
    red: ["#fff1f3", "#c01048", "#fecdd6"],
    default: ["#f2f4f7", "#344054", "#d0d5dd"],
  };
  const [bg, fg, border] = tones[color] || tones.default;
  return { bg, fg, border };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 401 && !url.includes("/admin/verify")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session expired.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(text(body?.details || body?.error || body?.message) || "The request could not be completed.");
  }
  return body;
}

async function verifyAdmin(password) {
  if (!text(password)) throw new Error("Enter the Admin password.");
  return requestJson("/api/b2b/admin/verify", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

async function downloadFile(url, fallbackName) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (response.status === 401 || response.redirected) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new Error("Your session expired.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(text(body?.details || body?.error) || "The file could not be generated.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filename = decodeURIComponent((match && (match[1] || match[2])) || fallbackName);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function Toast({ value, onClose }) {
  if (!value) return null;
  return (
    <div className={`next-lms-school-toast ${value.type === "error" ? "is-error" : value.type === "warning" ? "is-warning" : ""}`} role="status">
      <div><strong>{value.title || "School workspace"}</strong><span>{value.message}</span></div>
      <button type="button" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

function Modal({ title, description, children, footer, onClose, wide = false }) {
  return (
    <div className="next-lms-school-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button className="next-lms-school-modal-backdrop" type="button" onClick={onClose} aria-label="Close" />
      <section className={`next-lms-school-modal-card ${wide ? "is-wide" : ""}`}>
        <header><div><span>Protected LMS action</span><h3>{title}</h3><p>{description}</p></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="next-lms-school-modal-body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}

function StartInventoryModal({ onClose, onStart }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!date) return setError("Choose the inventory date.");
    if (!text(password)) return setError("Enter the Admin password.");
    setBusy(true);
    setError("");
    try {
      await onStart({ date, password });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Unable to start inventory.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Start inventory"
      description="Choose the inventory date. The system will prepare the Inventory and Defected fields for this school."
      onClose={onClose}
      footer={<><button type="button" onClick={onClose}>Cancel</button><button type="submit" form="next-lms-start-inventory" disabled={busy}>{busy ? "Preparing…" : "Verify & Start"}</button></>}
    >
      <form id="next-lms-start-inventory" className="next-lms-school-form" onSubmit={submit}>
        <label><span>Inventory date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label><span>Admin password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter Admin password" required /></label>
        {error ? <p className="next-lms-school-form-error">{error}</p> : null}
      </form>
    </Modal>
  );
}

function FinishInventoryModal({ onClose, onFinish }) {
  const [fileType, setFileType] = useState("pdf");
  const [columns, setColumns] = useState("both");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!text(password)) return setError("Enter the Admin password.");
    setBusy(true);
    setError("");
    try {
      await onFinish({ fileType, columns, password });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Unable to finish inventory.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Finish inventory"
      description="Save pending values, download the final file, and hide the Inventory and Defected columns."
      onClose={onClose}
      footer={<><button type="button" onClick={onClose}>Cancel</button><button type="submit" form="next-lms-finish-inventory" disabled={busy}>{busy ? "Finalizing…" : "Verify & Download"}</button></>}
    >
      <form id="next-lms-finish-inventory" className="next-lms-school-form" onSubmit={submit}>
        <div className="next-lms-school-form-grid">
          <label><span>File type</span><select value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="pdf">PDF</option><option value="excel">Excel</option></select></label>
          <label><span>Columns</span><select value={columns} onChange={(event) => setColumns(event.target.value)}><option value="both">Inventory & Defected</option><option value="inventory">Inventory only</option><option value="defected">Defected only</option></select></label>
        </div>
        <label><span>Admin password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter Admin password" required /></label>
        {error ? <p className="next-lms-school-form-error">{error}</p> : null}
      </form>
    </Modal>
  );
}

function ExportModal({ onClose, onExport }) {
  const [fileType, setFileType] = useState("pdf");
  const [selected, setSelected] = useState(() => new Set(EXPORT_COLUMNS.filter((column) => column.defaultChecked).map((column) => column.key)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const columns = EXPORT_COLUMNS.map((column) => column.key).filter((key) => selected.has(key));
    if (!columns.length) return setError("Select at least one column.");
    setBusy(true);
    setError("");
    try {
      await onExport({ fileType, columns });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || "Unable to download the stock file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Download stock file"
      description="Choose the file format and the columns that should appear in the export."
      onClose={onClose}
      footer={<><button type="button" onClick={onClose}>Cancel</button><button type="submit" form="next-lms-stock-export" disabled={busy}>{busy ? "Preparing…" : "Download"}</button></>}
    >
      <form id="next-lms-stock-export" className="next-lms-school-form" onSubmit={submit}>
        <label><span>File type</span><select value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="pdf">PDF</option><option value="excel">Excel</option></select></label>
        <fieldset className="next-lms-school-export-columns"><legend>Columns</legend>{EXPORT_COLUMNS.map((column) => (
          <label className={selected.has(column.key) ? "active" : ""} key={column.key}>
            <input type="checkbox" checked={selected.has(column.key)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(column.key); else next.delete(column.key); return next; })} />
            <span>{column.label}</span>
          </label>
        ))}</fieldset>
        {error ? <p className="next-lms-school-form-error">{error}</p> : null}
      </form>
    </Modal>
  );
}

function DetailItem({ label, value, children }) {
  return <div className="next-lms-school-detail-item"><span>{label}</span>{children || <strong>{text(value) || "—"}</strong>}</div>;
}

export default function LmsSchoolWorkspaceClient({ schoolId, initialSchool, initialStock, access, bootstrapWarnings = [] }) {
  const [school, setSchool] = useState(() => normalizeSchool(initialSchool));
  const normalizedInitialStock = normalizeStockPayload(initialStock);
  const [items, setItems] = useState(normalizedInitialStock.items);
  const [meta, setMeta] = useState(normalizedInitialStock.meta);
  const [query, setQuery] = useState("");
  const [inventoryMode, setInventoryMode] = useState(false);
  const [modal, setModal] = useState("");
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [writeStates, setWriteStates] = useState({});
  const pendingWrites = useRef(new Map());

  const accessPage = (Array.isArray(access?.pages) ? access.pages : []).find((page) => lower(page?.pageKey || page?.page_key) === "lms-b2b");
  const accessLevel = lower(accessPage?.accessLevel || accessPage?.access_level || "view");
  const accessLabel = access?.isBuiltInAdmin ? "Built-in Admin" : accessLevel ? `${accessLevel[0]?.toUpperCase()}${accessLevel.slice(1)} access` : "View access";
  const grades = useMemo(() => checkedGrades(school), [school]);

  const filteredItems = useMemo(() => {
    const token = lower(query);
    if (!token) return items;
    return items.filter((item) => lower([item.name, item.idCode, item.receiptNumber, item.tag?.name].join(" ")).includes(token));
  }, [items, query]);

  const groups = useMemo(() => {
    const map = new Map();
    filteredItems.forEach((item) => {
      const name = item.tag?.name || "Untagged";
      const key = lower(name);
      if (!map.has(key)) map.set(key, { name, color: item.tag?.color || "default", items: [] });
      map.get(key).items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (lower(a.name) === "untagged") return 1;
      if (lower(b.name) === "untagged") return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredItems]);

  const totals = useMemo(() => {
    let stock = 0;
    let inventory = 0;
    let defected = 0;
    let mismatches = 0;
    items.forEach((item) => {
      stock += Number(item.doneQuantity) || 0;
      if (item.inventory !== null) {
        inventory += Number(item.inventory) || 0;
        if (Number(item.inventory) !== Number(item.doneQuantity || 0)) mismatches += 1;
      }
      if (item.defected !== null) defected += Number(item.defected) || 0;
    });
    return { stock, inventory, defected, mismatches };
  }, [items]);

  function notify(message, type = "success", title = "School workspace") {
    setToast({ message, type, title });
    window.setTimeout(() => setToast(null), 4200);
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      const [schoolResult, stockResult] = await Promise.all([
        requestJson(`/api/b2b/schools/${encodeURIComponent(schoolId)}?t=${Date.now()}`),
        requestJson(`/api/b2b/schools/${encodeURIComponent(schoolId)}/stock?t=${Date.now()}`),
      ]);
      setSchool(normalizeSchool(schoolResult));
      const normalized = normalizeStockPayload(stockResult);
      setItems(normalized.items);
      setMeta(normalized.meta);
      notify("School details and stocktaking were refreshed.");
    } catch (error) {
      notify(error?.message || "Unable to refresh the school workspace.", "error");
    } finally {
      setRefreshing(false);
    }
  }

  function updateItemValue(itemId, kind, rawValue) {
    const value = rawValue === "" ? null : Math.max(0, Number(rawValue) || 0);
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, [kind]: value } : item));
    scheduleWrite(itemId, kind, value);
  }

  function scheduleWrite(itemId, kind, value) {
    const key = `${kind}:${itemId}`;
    const previous = pendingWrites.current.get(key);
    if (previous?.timer) window.clearTimeout(previous.timer);

    const entry = { itemId, kind, value, promise: null, timer: null };
    entry.run = () => {
      if (entry.promise) return entry.promise;
      if (entry.timer) window.clearTimeout(entry.timer);
      setWriteStates((current) => ({ ...current, [key]: "saving" }));
      entry.promise = requestJson(`/api/b2b/schools/${encodeURIComponent(schoolId)}/stock/${encodeURIComponent(itemId)}/${kind}`, {
        method: "PATCH",
        body: JSON.stringify({
          value,
          inventoryPropName: meta?.inventoryPropName || "",
          inventoryDate: meta?.inventoryDate || "",
          defectedPropName: meta?.defectedPropName || "",
          defectedDate: meta?.defectedDate || meta?.inventoryDate || "",
        }),
      }).then((result) => {
        setMeta((current) => ({
          ...current,
          inventoryPropName: result?.inventoryPropName || current?.inventoryPropName,
          inventoryDate: result?.inventoryDate || current?.inventoryDate,
          defectedPropName: result?.defectedPropName || current?.defectedPropName,
          defectedDate: result?.defectedDate || current?.defectedDate,
        }));
        setWriteStates((current) => ({ ...current, [key]: "saved" }));
        window.setTimeout(() => setWriteStates((current) => { const next = { ...current }; if (next[key] === "saved") delete next[key]; return next; }), 1800);
        return result;
      }).catch((error) => {
        setWriteStates((current) => ({ ...current, [key]: "error" }));
        notify(`${kind === "inventory" ? "Inventory" : "Defected"} value was not saved: ${error?.message || "Unknown error"}`, "error");
        throw error;
      }).finally(() => {
        pendingWrites.current.delete(key);
      });
      return entry.promise;
    };
    entry.timer = window.setTimeout(entry.run, 600);
    pendingWrites.current.set(key, entry);
    setWriteStates((current) => ({ ...current, [key]: "queued" }));
  }

  async function flushPendingWrites() {
    const entries = Array.from(pendingWrites.current.values());
    if (!entries.length) return;
    await Promise.all(entries.map((entry) => entry.run()));
  }

  async function startInventory({ date, password }) {
    await verifyAdmin(password);
    const result = await requestJson(`/api/b2b/schools/${encodeURIComponent(schoolId)}/inventory`, {
      method: "POST",
      body: JSON.stringify({ inventoryDate: date }),
    });
    const refreshed = normalizeStockPayload(await requestJson(`/api/b2b/schools/${encodeURIComponent(schoolId)}/stock?t=${Date.now()}`));
    setItems(refreshed.items);
    setMeta({ ...refreshed.meta, ...result });
    setInventoryMode(true);
    notify(result?.note || `Inventory fields are ready for ${date}.`, result?.note ? "warning" : "success", "Inventory started");
  }

  async function finishInventory({ fileType, columns, password }) {
    await verifyAdmin(password);
    await flushPendingWrites();
    const isExcel = fileType === "excel";
    const endpoint = `/api/b2b/schools/${encodeURIComponent(schoolId)}/stock/${isExcel ? "excel" : "pdf"}?cols=${encodeURIComponent(columns)}`;
    const safeName = school.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "School";
    await downloadFile(endpoint, `Stocktaking-${safeName}.${isExcel ? "xlsx" : "pdf"}`);
    setInventoryMode(false);
    notify("The inventory file was downloaded and editing columns are now hidden.", "success", "Inventory finished");
  }

  async function exportStock({ fileType, columns }) {
    const isExcel = fileType === "excel";
    const params = new URLSearchParams({ columns: columns.join(",") });
    const endpoint = `/api/b2b/schools/${encodeURIComponent(schoolId)}/stock/${isExcel ? "excel" : "pdf"}?${params.toString()}`;
    const safeName = school.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "School";
    await downloadFile(endpoint, `Stocktaking-${safeName}.${isExcel ? "xlsx" : "pdf"}`);
    notify("The stocktaking file was downloaded.");
  }

  const details = school.fields || {};
  const hasPendingWrites = Object.values(writeStates).some((state) => state === "queued" || state === "saving");

  return (
    <main className="next-lms-school-page">
      <Toast value={toast} onClose={() => setToast(null)} />
      {bootstrapWarnings.length ? <div className="dashboard-notice" role="status"><strong>Some school data could not be included in the first load.</strong><span>The available data is shown below; use Refresh to retry.</span><a href={`/lms/b2b/school/${encodeURIComponent(schoolId)}?classic=1`}>Open classic workspace</a></div> : null}

      <section className="next-lms-school-hero">
        <div className="next-lms-school-hero-copy">
          <div className="next-lms-school-breadcrumb"><a href="/next/lms">LMS</a><span>/</span><a href="/next/lms/schools">Schools</a><span>/</span><b>{school.name}</b></div>
          <span className="next-lms-kicker">Live school operations</span>
          <h2>{school.name}</h2>
          <p>{[school.governorate, school.solutionType, school.contractStatus].filter(Boolean).join(" • ") || "School details and live stocktaking workspace"}</p>
          <div className="next-lms-school-hero-tags">
            {school.educationSystem.map((value) => <span key={value}>{value}</span>)}
            {grades.slice(0, 6).map((value) => <span key={value}>{value}</span>)}
            {grades.length > 6 ? <span>+{grades.length - 6} grades</span> : null}
            <span>{accessLabel}</span>
          </div>
        </div>
        <div className="next-lms-school-hero-actions">
          <a href="/next/lms/schools">← Schools</a>
          <a href={`/lms/b2b/school/${encodeURIComponent(schoolId)}?classic=1`}>Classic workspace</a>
          <button type="button" onClick={refreshAll} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>
        </div>
      </section>

      <section className="next-lms-school-summary" aria-label="Stocktaking summary">
        <article><small>Components</small><strong>{formatNumber(items.length)}</strong><span>Rows with stock activity</span></article>
        <article><small>Stock balance</small><strong>{formatNumber(totals.stock)}</strong><span>Current school Done total</span></article>
        <article><small>Tags</small><strong>{formatNumber(new Set(items.map((item) => lower(item.tag?.name))).size)}</strong><span>Component groups</span></article>
        <article className={totals.mismatches ? "is-warning" : ""}><small>Mismatches</small><strong>{formatNumber(totals.mismatches)}</strong><span>Inventory differs from stock</span></article>
        <article className={totals.defected ? "is-danger" : ""}><small>Defected</small><strong>{formatNumber(totals.defected)}</strong><span>Latest recorded total</span></article>
      </section>

      <section className="next-lms-school-layout">
        <aside className="next-lms-school-details-card">
          <header><div><span>School reference</span><h3>School details</h3></div>{school.location ? <a href={school.location} target="_blank" rel="noreferrer">Open map ↗</a> : null}</header>
          <div className="next-lms-school-details-list">
            <DetailItem label="Governorate" value={school.governorate} />
            <DetailItem label="Solution type" value={school.solutionType} />
            <DetailItem label="Contract status" value={school.contractStatus} />
            <DetailItem label="Stocktaking column" value={school.stocktakingColumn} />
            <DetailItem label="Education system"><div className="next-lms-school-detail-tags">{school.educationSystem.length ? school.educationSystem.map((value) => <span key={value}>{value}</span>) : <strong>—</strong>}</div></DetailItem>
            <DetailItem label="Grades"><div className="next-lms-school-detail-tags">{grades.length ? grades.map((value) => <span key={value}>{value}</span>) : <strong>—</strong>}</div></DetailItem>
          </div>

          <div className="next-lms-school-detail-section">
            <h4>Contract & accreditation</h4>
            <DetailItem label="Supply date" value={formatDate(details.date_of_supply)} />
            <DetailItem label="Contract period" value={details.contract_period} />
            <DetailItem label="Accreditation" value={details.accreditation} />
            <DetailItem label="Accreditation time" value={details.accreditation_time} />
            {details.contract_file ? <a className="next-lms-school-file-link" href={details.contract_file} target="_blank" rel="noreferrer">Open contract file ↗</a> : null}
          </div>

          <div className="next-lms-school-detail-section">
            <h4>Contacts</h4>
            <DetailItem label="Coordinator" value={details.coordinator_name} />
            <DetailItem label="Coordinator phone" value={details.coordinator_phone} />
            <DetailItem label="Accountant" value={details.accountant_name} />
            <DetailItem label="Accountant phone" value={details.accountant_phone_number} />
          </div>

          <div className="next-lms-school-capacity">
            <div><span>Students</span><strong>{formatNumber(details.total_student_population)}</strong></div>
            <div><span>Instructors</span><strong>{formatNumber(details.number_of_instructor)}</strong></div>
            <div><span>Classes</span><strong>{formatNumber(details.number_of_class)}</strong></div>
            <div><span>Largest class</span><strong>{formatNumber(details.max_students_largest_class)}</strong></div>
          </div>
        </aside>

        <section className="next-lms-school-stock-card">
          <header className="next-lms-school-stock-head">
            <div><span>Live stocktaking</span><h3>School stock</h3><p>{meta?.donePropName || `${school.name} Done`}{meta?.inventoryDate ? ` • Latest inventory ${formatDate(meta.inventoryDate)}` : ""}</p></div>
            <div className="next-lms-school-stock-actions">
              <button type="button" onClick={() => setModal("export")}>Download</button>
              <button className={inventoryMode ? "is-finish" : "is-primary"} type="button" onClick={() => setModal(inventoryMode ? "finish" : "start")}>{inventoryMode ? "Finish inventory" : "Make inventory"}</button>
            </div>
          </header>

          <div className="next-lms-school-stock-toolbar">
            <label><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Component, ID code, receipt or tag…" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear">×</button> : null}</label>
            <div><strong>{filteredItems.length}</strong><span>items in {groups.length} tags</span></div>
            {inventoryMode ? <div className="next-lms-school-inventory-live"><i /> <span>Inventory mode</span><b>{hasPendingWrites ? "Saving changes…" : "All changes saved"}</b></div> : null}
          </div>

          <div className="next-lms-school-groups">
            {groups.length ? groups.map((group) => {
              const tone = tagTone(group.color, group.name);
              const groupStock = group.items.reduce((sum, item) => sum + (Number(item.doneQuantity) || 0), 0);
              return (
                <article className="next-lms-school-group" key={`${group.name}-${group.color}`} style={{ "--tag-bg": tone.bg, "--tag-fg": tone.fg, "--tag-border": tone.border }}>
                  <header><div><span className="next-lms-school-tag">{group.name}</span><small>{group.items.length} components</small></div><strong>{formatNumber(groupStock)} in stock</strong></header>
                  <div className="next-lms-school-table-wrap">
                    <table>
                      <thead><tr><th>Component</th><th>ID Code</th><th>Receipt</th><th className="is-number">In Stock</th>{inventoryMode ? <><th className="is-number">Inventory</th><th className="is-number">Defected</th></> : null}</tr></thead>
                      <tbody>{group.items.slice().sort((a, b) => a.name.localeCompare(b.name)).map((item) => {
                        const mismatch = item.inventory !== null && Number(item.inventory) !== Number(item.doneQuantity || 0);
                        const inventoryKey = `inventory:${item.id}`;
                        const defectedKey = `defected:${item.id}`;
                        return (
                          <tr className={mismatch ? "has-mismatch" : ""} key={item.id}>
                            <td data-label="Component"><div className="next-lms-school-component"><strong>{item.name}</strong>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Open source ↗</a> : null}</div></td>
                            <td data-label="ID Code">{item.idCode || "—"}</td>
                            <td data-label="Receipt">{item.receiptNumber || "—"}</td>
                            <td className="is-number" data-label="In Stock"><strong>{formatNumber(item.doneQuantity)}</strong></td>
                            {inventoryMode ? <>
                              <td className="is-number" data-label="Inventory"><div className="next-lms-school-number-field"><input type="number" min="0" step="1" value={item.inventory ?? ""} onChange={(event) => updateItemValue(item.id, "inventory", event.target.value)} placeholder="—" className={mismatch ? "is-mismatch" : ""} /><small className={`state-${writeStates[inventoryKey] || "idle"}`}>{writeStates[inventoryKey] === "saving" ? "Saving" : writeStates[inventoryKey] === "queued" ? "Queued" : writeStates[inventoryKey] === "saved" ? "Saved" : writeStates[inventoryKey] === "error" ? "Error" : mismatch ? "Mismatch" : ""}</small></div></td>
                              <td className="is-number" data-label="Defected"><div className="next-lms-school-number-field"><input type="number" min="0" step="1" value={item.defected ?? ""} onChange={(event) => updateItemValue(item.id, "defected", event.target.value)} placeholder="—" /><small className={`state-${writeStates[defectedKey] || "idle"}`}>{writeStates[defectedKey] === "saving" ? "Saving" : writeStates[defectedKey] === "queued" ? "Queued" : writeStates[defectedKey] === "saved" ? "Saved" : writeStates[defectedKey] === "error" ? "Error" : ""}</small></div></td>
                            </> : null}
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </article>
              );
            }) : <div className="next-lms-school-empty"><strong>No stock rows match the current search.</strong><span>Clear the search or refresh the school workspace.</span><button type="button" onClick={() => setQuery("")}>Clear search</button></div>}
          </div>
        </section>
      </section>

      {modal === "start" ? <StartInventoryModal onClose={() => setModal("")} onStart={startInventory} /> : null}
      {modal === "finish" ? <FinishInventoryModal onClose={() => setModal("")} onFinish={finishInventory} /> : null}
      {modal === "export" ? <ExportModal onClose={() => setModal("")} onExport={exportStock} /> : null}
    </main>
  );
}

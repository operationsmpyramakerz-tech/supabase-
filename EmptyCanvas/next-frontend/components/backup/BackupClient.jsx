"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { confirmDelete as showDeleteConfirm } from "../../lib/client-confirm";

const MAX_CSV_SIZE = 25 * 1024 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function filenameFromResponse(response, fallback) {
  const disposition = text(response.headers.get("Content-Disposition"));
  const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) {
    try { return decodeURIComponent(utf[1].replace(/["']/g, "")); } catch {}
  }
  const normal = disposition.match(/filename="?([^";]+)"?/i);
  return text(normal?.[1]) || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "database-export.csv";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch {}
    link.remove();
  }, 1200);
}

async function readResponseError(response, fallback = "Request failed.") {
  const contentType = lower(response.headers.get("Content-Type"));
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return text(body?.error || body?.message || body?.details) || fallback;
  }
  const body = text(await response.text().catch(() => ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  return body || `${fallback} (${response.status})`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && !lower(body?.error).includes("password")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  if (!response.ok || body?.ok === false || body?.success === false) {
    throw new Error(text(body?.error || body?.message) || `Request failed with ${response.status}.`);
  }
  return body;
}

async function fetchDownload(url, fallbackName) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("Your session has expired.");
  }
  if (!response.ok) throw new Error(await readResponseError(response, "Export failed, so delete was stopped."));
  const blob = await response.blob();
  if (!blob?.size) throw new Error("Export file is empty, so delete was stopped.");
  downloadBlob(blob, filenameFromResponse(response, fallbackName));
  return blob;
}

function FeatherIcon({ name = "database" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const icons = {
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    "download-cloud": <><path d="M8 17l4 4 4-4"/><path d="M12 12v9"/><path d="M20.9 18.1A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 3 16.3"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    "upload-cloud": <><path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.9 18.1A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 3 16.3"/></>,
    upload: <><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></>,
    "trash-2": <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
    x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    "alert-triangle": <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    check: <path d="m20 6-11 11-5-5"/>,
    "shopping-cart": <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    package: <><path d="m16.5 9.4-9-5.2"/><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></>,
    tag: <><path d="M20.6 13.6 11 23.2 1.8 14V4.8h9.2z"/><circle cx="6.5" cy="9.5" r="1.5"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    box: <><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    "map-pin": <><path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
    "dollar-sign": <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></>,
    folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
    columns: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></>,
    sliders: <><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    "git-branch": <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    "git-pull-request": <><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></>,
    "git-merge": <><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/><path d="m15 6 3-3 3 3"/><path d="M18 3v12"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    "trending-up": <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    "bar-chart-2": <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    award: <><circle cx="12" cy="8" r="6"/><path d="M15.5 12.9 17 22l-5-3-5 3 1.5-9.1"/></>,
    "user-plus": <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    "arrow-left": <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
  };
  return <svg {...common}>{icons[name] || icons.database}</svg>;
}

function BodyPortal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`backup-toast ${toast.variant === "danger" ? "backup-toast--danger" : ""} is-visible`} role="status" aria-live="polite">
      <FeatherIcon name={toast.variant === "danger" ? "alert-triangle" : "check"} />
      <span>{toast.message}</span>
    </div>
  );
}

const DATABASE_PAGE_GROUPS = [
  { key: "orders", label: "Orders", tableKeys: ["orders"] },
  { key: "stocktaking", label: "Stocktaking", tableKeys: ["stocktaking"] },
  { key: "products", label: "Products", tableKeys: ["products", "product-tags"] },
  { key: "events", label: "Events", tableKeys: ["events", "event-types", "event-governorate-transport-rates"] },
  { key: "event-components", label: "Event Components", tableKeys: ["event-components", "event-component-categories"] },
  { key: "expenses", label: "Expenses", tableKeys: ["expenses"] },
  { key: "b2b-schools", label: "B2B Schools", tableKeys: ["b2b-schools"] },
  { key: "b2c-database", label: "B2C Database", tableKeys: ["b2c-databases", "b2c-customer-fields", "b2c-customers"] },
  { key: "b2c-forms", label: "B2C Forms", tableKeys: ["b2c-forms", "b2c-form-fields"] },
  { key: "proposals", label: "Proposals", tableKeys: ["proposals", "proposal-items"] },
  { key: "kits", label: "Kits", tableKeys: ["kits", "kit-items"] },
  { key: "task-management", label: "Task Management", tableKeys: ["department-tickets", "department-ticket-sections", "department-ticket-section-edges"] },
  { key: "kpis", label: "KPIs", tableKeys: ["kpi-standards", "kpi-sections", "kpi-items", "kpi-reviews", "kpi-scores"] },
  { key: "users-center", label: "Users Center", tableKeys: ["team-members", "team-departments", "team-sv-schools", "page-access", "signup-requests"] },
  { key: "system-history", label: "System History", tableKeys: ["history"] },
];

function buildDatabasePageGroups(tables = []) {
  const byKey = new Map((Array.isArray(tables) ? tables : []).map((item) => [text(item?.key), item]));
  const used = new Set();
  const groups = DATABASE_PAGE_GROUPS.map((group) => {
    const items = group.tableKeys.map((key) => byKey.get(key)).filter(Boolean);
    items.forEach((item) => used.add(text(item?.key)));
    return { ...group, tables: items };
  }).filter((group) => group.tables.length);

  const ungrouped = (Array.isArray(tables) ? tables : []).filter((item) => !used.has(text(item?.key)));
  if (ungrouped.length) groups.push({ key: "other", label: "Other", tableKeys: ungrouped.map((item) => text(item?.key)), tables: ungrouped });
  return groups;
}

export default function BackupClient({ initialTables = [] }) {
  const [tables, setTables] = useState(() => Array.isArray(initialTables) ? initialTables : []);
  const [importTarget, setImportTarget] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importPassword, setImportPassword] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStage, setImportStage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteStage, setDeleteStage] = useState("");
  const [toast, setToast] = useState(null);
  const [folderMenu, setFolderMenu] = useState("");
  const [activePageKey, setActivePageKey] = useState("");
  const [search, setSearch] = useState("");

  const pageGroups = useMemo(() => buildDatabasePageGroups(tables), [tables]);
  const activePage = useMemo(() => pageGroups.find((group) => group.key === activePageKey) || null, [pageGroups, activePageKey]);
  const visiblePageGroups = useMemo(() => {
    const needle = lower(search);
    if (!needle) return pageGroups;
    return pageGroups.filter((group) => lower([
      group.label,
      ...(group.tables || []).flatMap((item) => [item?.pageName, item?.tableName, item?.moduleName]),
    ].join(" ")).includes(needle));
  }, [pageGroups, search]);
  const visibleTables = useMemo(() => {
    const items = activePage?.tables || [];
    const needle = lower(search);
    if (!needle) return items;
    return items.filter((item) => lower([item?.pageName, item?.tableName, item?.moduleName, item?.description].join(" ")).includes(needle));
  }, [activePage, search]);

  const modalOpen = Boolean(importTarget || deleteTarget);

  useEffect(() => {
    document.body.classList.toggle("backup-modal-open", modalOpen);
    if (!modalOpen) return undefined;
    function keyDown(event) {
      if (event.key !== "Escape" || importing || deleting) return;
      if (importTarget) closeImportModal();
      else if (deleteTarget) closeDeleteModal();
    }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.body.classList.remove("backup-modal-open");
      document.removeEventListener("keydown", keyDown);
    };
  }, [modalOpen, importTarget, deleteTarget, importing, deleting]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!folderMenu) return undefined;
    function closeMenu(event) {
      if (!event.target.closest(".backup-folder-card")) setFolderMenu("");
    }
    function keyDown(event) {
      if (event.key === "Escape") setFolderMenu("");
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", keyDown);
    };
  }, [folderMenu]);

  useEffect(() => {
    function syncFolderFromUrl() {
      const requested = text(new URLSearchParams(window.location.search).get("folder"));
      const exists = pageGroups.some((group) => group.key === requested);
      setActivePageKey(exists ? requested : "");
      setFolderMenu("");
      setSearch("");
    }
    syncFolderFromUrl();
    window.addEventListener("popstate", syncFolderFromUrl);
    return () => window.removeEventListener("popstate", syncFolderFromUrl);
  }, [pageGroups.map((group) => group.key).join("|")]);

  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .searchbar input, .main-header .searchbar input");
    if (!input) return undefined;
    const previousPlaceholder = input.getAttribute("placeholder") || "Search";
    const previousValue = input.value || "";
    input.value = "";
    input.placeholder = activePage ? `Search tables in ${activePage.label}...` : "Search database pages...";
    setSearch("");
    const handle = (event) => setSearch(event.target.value || "");
    input.addEventListener("input", handle);
    input.addEventListener("search", handle);
    return () => {
      input.removeEventListener("input", handle);
      input.removeEventListener("search", handle);
      input.placeholder = previousPlaceholder;
      input.value = previousValue;
    };
  }, [activePageKey]);

  function openPageFolder(key) {
    const clean = text(key);
    if (!clean) return;
    setActivePageKey(clean);
    setFolderMenu("");
    setSearch("");
    const url = new URL(window.location.href);
    url.searchParams.set("folder", clean);
    window.history.pushState({}, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
  }

  function closePageFolder() {
    setActivePageKey("");
    setFolderMenu("");
    setSearch("");
    const url = new URL(window.location.href);
    url.searchParams.delete("folder");
    const query = url.searchParams.toString();
    window.history.pushState({}, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
  }

  function showToast(message, variant = "success") {
    setToast({ message, variant, stamp: Date.now() });
  }

  async function reloadTables() {
    try {
      const body = await requestJson("/api/backup/tables");
      setTables(Array.isArray(body?.tables) ? body.tables : []);
    } catch (error) {
      showToast(error?.message || "Failed to load database tables.", "danger");
    }
  }

  function openImportModal(table) {
    setImportTarget(table);
    setImportFile(null);
    setImportPassword("");
    setImportError("");
    setImportStage("");
  }

  function closeImportModal() {
    if (importing) return;
    setImportTarget(null);
    setImportFile(null);
    setImportPassword("");
    setImportError("");
    setImportStage("");
  }

  async function confirmImport() {
    if (!importTarget) return;
    if (!importFile) return setImportError("Choose a CSV file first.");
    const fileName = lower(importFile.name);
    if (fileName && !fileName.endsWith(".csv")) return setImportError("Only CSV files are allowed.");
    if (importFile.size > MAX_CSV_SIZE) return setImportError("CSV file is too large. Maximum size is 25 MB.");
    if (!text(importPassword)) return setImportError("Admin password is required.");

    setImportError("");
    setImporting(true);
    try {
      setImportStage("Reading...");
      const csvText = await importFile.text();
      if (!text(csvText)) throw new Error("CSV file is empty.");
      setImportStage("Validating...");
      const response = await fetch(`/api/backup/tables/${encodeURIComponent(importTarget.key)}/import`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "X-Admin-Password": encodeURIComponent(text(importPassword)),
          "X-CSV-Filename": encodeURIComponent(importFile.name || ""),
        },
        body: csvText,
      });
      const body = response.ok ? await response.json().catch(() => ({})) : {};
      if (!response.ok || body?.ok === false) {
        throw new Error(response.ok ? (body?.error || "Failed to import CSV data.") : await readResponseError(response, "Failed to import CSV data."));
      }
      const importedTarget = importTarget;
      setImporting(false);
      setImportTarget(null);
      setImportFile(null);
      setImportPassword("");
      setImportStage("");
      showToast(`Imported ${Number(body?.importedRows || 0).toLocaleString()} row${Number(body?.importedRows || 0) === 1 ? "" : "s"} into ${body?.tableName || importedTarget?.tableName}.`);
      await reloadTables();
    } catch (error) {
      setImportError(error?.message || "Failed to import CSV data.");
      showToast(error?.message || "Failed to import CSV data.", "danger");
      setImporting(false);
      setImportStage("");
    }
  }

  function openDeleteModal(table) {
    setDeleteTarget(table);
    setDeletePassword("");
    setDeleteError("");
    setDeleteStage("");
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeletePassword("");
    setDeleteError("");
    setDeleteStage("");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const password = text(deletePassword);
    if (!password) return setDeleteError("Admin password is required.");

    const isAll = Boolean(deleteTarget?.isAll);
    const confirmed = await showDeleteConfirm({
      title: isAll ? "Delete all system data?" : `Delete ${deleteTarget?.pageName || "table data"}?`,
      itemType: isAll ? "system data" : "table data",
      itemName: isAll ? "all system data" : (deleteTarget?.pageName || deleteTarget?.tableName || "this table"),
      message: isAll
        ? "A complete ZIP backup will download first, then all rows from all database tables will be permanently deleted. This action cannot be undone."
        : `A CSV backup will download first, then every row from “${deleteTarget?.tableName || "this table"}” will be permanently deleted. This action cannot be undone.`,
      cancelLabel: "No, keep it.",
      confirmLabel: "Yes, Delete!",
    });
    if (!confirmed) return;

    setDeleteError("");
    setDeleting(true);
    try {
      setDeleteStage("Exporting...");
      const exportUrl = isAll ? "/api/backup/export-all" : `/api/backup/tables/${encodeURIComponent(deleteTarget.key)}/download`;
      const fallbackName = isAll ? `database-export-${Date.now()}.zip` : `${deleteTarget?.tableName || "table"}-${Date.now()}.csv`;
      await fetchDownload(exportUrl, fallbackName);
      await new Promise((resolve) => window.setTimeout(resolve, 450));

      setDeleteStage("Deleting...");
      const deleteUrl = isAll ? "/api/backup/delete-all" : `/api/backup/tables/${encodeURIComponent(deleteTarget.key)}`;
      await requestJson(deleteUrl, {
        method: "DELETE",
        body: JSON.stringify({ adminPassword: password }),
      });
      setDeleting(false);
      setDeleteTarget(null);
      setDeletePassword("");
      setDeleteStage("");
      showToast(isAll ? "Export downloaded and all data deleted." : "CSV downloaded and table data deleted.");
      await reloadTables();
    } catch (error) {
      setDeleteError(error?.message || "Failed to delete data.");
      showToast(error?.message || "Failed to delete data.", "danger");
      setDeleting(false);
      setDeleteStage("");
    }
  }

  return (
    <>
      {toast ? <BodyPortal><Toast toast={toast} /></BodyPortal> : null}

      <main className="backup-page-shell backup-folder-page">
        <section className="backup-hero card">
          <span className="backup-hero-icon"><FeatherIcon name="database" /></span>
          <div className="backup-hero-copy">
            <p className="backup-kicker">SYSTEM DATA</p>
            <h2>Database</h2>
          </div>
          <div className="backup-hero-actions">
            <a className="backup-export-all-btn" href="/api/backup/export-all" download>
              <FeatherIcon name="download-cloud" /><span>Export all data</span>
            </a>
            <button type="button" className="backup-delete-all-btn" onClick={() => openDeleteModal({ key: "__all__", pageName: "all system data", tableName: "all database tables", isAll: true })}>
              <FeatherIcon name="trash-2" /><span>Delete all data</span>
            </button>
          </div>
        </section>

        <section className="backup-list-card card backup-folders-card">
          <div className="backup-list-head">
            <div className="backup-folder-level-heading">
              {activePage ? (
                <button type="button" className="backup-page-folder-back" onClick={closePageFolder} aria-label="Back to database pages">
                  <FeatherIcon name="arrow-left" />
                </button>
              ) : null}
              <div>
                <p className="backup-kicker">{activePage ? "DATABASE TABLES" : "DATABASE PAGES"}</p>
                <h2>{activePage ? activePage.label : "Pages"}</h2>
              </div>
            </div>
            <span className="backup-count">
              {activePage
                ? `${visibleTables.length} table${visibleTables.length === 1 ? "" : "s"}`
                : `${visiblePageGroups.length} page${visiblePageGroups.length === 1 ? "" : "s"}`}
            </span>
          </div>

          <div className="backup-folder-grid" aria-live="polite">
            {!activePage ? (
              visiblePageGroups.length ? visiblePageGroups.map((group) => (
                <article className="backup-folder-card backup-page-folder-card" key={group.key}>
                  <button
                    type="button"
                    className="backup-folder-main"
                    onClick={() => openPageFolder(group.key)}
                    aria-label={`Open ${group.label} tables`}
                  >
                    <span className="backup-folder-figure" aria-hidden="true">
                      <span className="backup-folder-paper backup-folder-paper--left" />
                      <span className="backup-folder-paper backup-folder-paper--middle" />
                      <span className="backup-folder-paper backup-folder-paper--right" />
                      <span className="backup-folder-back" />
                      <span className="backup-folder-front"><small>DB</small></span>
                    </span>
                    <span className="backup-folder-copy">
                      <strong>{group.label}</strong>
                      <em>Database page</em>
                    </span>
                    <span className="backup-folder-table-name">{group.tables.length} table{group.tables.length === 1 ? "" : "s"}</span>
                  </button>
                </article>
              )) : (
                <div className="backup-empty"><FeatherIcon name="folder" /><span>No database pages match your search.</span></div>
              )
            ) : visibleTables.length ? visibleTables.map((item) => {
              const menuOpen = folderMenu === item.key;
              return (
                <article className={`backup-folder-card ${menuOpen ? "is-menu-open" : ""}`} key={item.key || item.tableName}>
                  <button
                    type="button"
                    className="backup-folder-menu-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFolderMenu((current) => current === item.key ? "" : item.key);
                    }}
                    aria-label={`Actions for ${item.pageName || item.tableName}`}
                    aria-expanded={menuOpen}
                  >
                    <span aria-hidden="true">•••</span>
                  </button>
                  {menuOpen ? (
                    <div className="backup-folder-menu" onClick={(event) => event.stopPropagation()}>
                      <a href={`/api/backup/tables/${encodeURIComponent(item.key)}/download`} download onClick={() => setFolderMenu("")}>
                        <FeatherIcon name="download" /><span>Export</span>
                      </a>
                      <button type="button" onClick={() => { setFolderMenu(""); openImportModal(item); }}>
                        <FeatherIcon name="upload" /><span>Import</span>
                      </button>
                        <button type="button" className="is-danger" onClick={() => { setFolderMenu(""); openDeleteModal(item); }}>
                        <FeatherIcon name="trash-2" /><span>Delete</span>
                      </button>
                  </div>
                  ) : null}
                  <button
                    type="button"
                    className="backup-folder-main"
                    onClick={() => { window.location.href = `/next/backup/${encodeURIComponent(item.key)}?folder=${encodeURIComponent(activePage.key)}`; }}
                    aria-label={`Open ${item.pageName || item.tableName}`}
                  >
                    <span className="backup-folder-figure" aria-hidden="true">
                      <span className="backup-folder-paper backup-folder-paper--left" />
                      <span className="backup-folder-paper backup-folder-paper--middle" />
                      <span className="backup-folder-paper backup-folder-paper--right" />
                      <span className="backup-folder-back" />
                      <span className="backup-folder-front"><small>DB</small></span>
                    </span>
                    <span className="backup-folder-copy">
                      <strong>{item.pageName || item.tableName || "Database table"}</strong>
                      <em>{item.moduleName || activePage.label}</em>
                    </span>
                    <span className="backup-folder-table-name" title={item.tableName || ""}>{item.tableName || "table"}</span>
                  </button>
                </article>
              );
            }) : (
              <div className="backup-empty"><FeatherIcon name="database" /><span>No tables in this page match your search.</span></div>
            )}
          </div>
        </section>
      </main>

      {deleteTarget ? <BodyPortal>
        <div className="backup-delete-modal">
          <div className="backup-modal-backdrop" onMouseDown={closeDeleteModal} />
          <section className="backup-delete-card" role="dialog" aria-modal="true" aria-labelledby="backupDeleteTitle">
            <button type="button" className="backup-modal-close" onClick={closeDeleteModal} aria-label="Close" disabled={deleting}><FeatherIcon name="x" /></button>
            <div className="backup-delete-head">
              <span className="backup-delete-icon"><FeatherIcon name="trash-2" /></span>
              <div>
                <p className="backup-kicker">DELETE DATA</p>
                <h2 id="backupDeleteTitle">{deleteTarget.isAll ? "Delete all data?" : `Delete ${deleteTarget.pageName || deleteTarget.tableName}?`}</h2>
              </div>
            </div>
            <p className="backup-delete-copy">
              {deleteTarget.isAll
                ? "A ZIP export containing CSV files will download first, then all table rows will be deleted."
                : `A CSV export will download first, then all rows in “${deleteTarget.tableName}” will be deleted.`}
            </p>
            <label className="backup-field">
              <span>Admin password</span>
              <input type="password" autoComplete="off" placeholder="Enter admin password" value={deletePassword} onChange={(event) => { setDeletePassword(event.target.value); setDeleteError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !deleting) confirmDelete(); }} autoFocus />
            </label>
            {deleteError ? <p className="backup-error">{deleteError}</p> : null}
            <div className="backup-delete-actions">
              <button type="button" className="backup-cancel-btn" onClick={closeDeleteModal} disabled={deleting}>Cancel</button>
              <button type="button" className={`backup-delete-next-btn ${deleting ? "is-loading" : ""}`} onClick={confirmDelete} disabled={deleting}>
                <FeatherIcon name="trash-2" /><span>{deleting ? (deleteStage || "Deleting...") : "Delete data"}</span>
              </button>
            </div>
          </section>
        </div>
      </BodyPortal> : null}

      {importTarget ? <BodyPortal>
        <div className="backup-import-modal">
          <div className="backup-modal-backdrop" onMouseDown={closeImportModal} />
          <section className="backup-import-card" role="dialog" aria-modal="true" aria-labelledby="backupImportTitle">
            <button type="button" className="backup-modal-close" onClick={closeImportModal} aria-label="Close" disabled={importing}><FeatherIcon name="x" /></button>
            <div className="backup-import-head">
              <span className="backup-import-icon"><FeatherIcon name="upload-cloud" /></span>
              <div>
                <p className="backup-kicker">IMPORT CSV</p>
                <h2 id="backupImportTitle">Import {importTarget.pageName || importTarget.tableName}</h2>
                <p className="backup-import-table">{importTarget.tableName || ""}</p>
              </div>
            </div>
            <label className="backup-field backup-file-field">
              <span>CSV file</span>
              <input type="file" accept=".csv,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportError(""); }} autoFocus />
            </label>
            <label className="backup-field">
              <span>Admin password</span>
              <input type="password" autoComplete="off" placeholder="Enter admin password" value={importPassword} onChange={(event) => { setImportPassword(event.target.value); setImportError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !importing) confirmImport(); }} />
            </label>
            <p className="backup-import-note"><FeatherIcon name="shield" /><span>The CSV header must match the selected Supabase table columns.</span></p>
            {importError ? <p className="backup-error">{importError}</p> : null}
            <div className="backup-import-actions">
              <button type="button" className="backup-cancel-btn" onClick={closeImportModal} disabled={importing}>Cancel</button>
              <button type="button" className={`backup-import-confirm-btn ${importing ? "is-loading" : ""}`} onClick={confirmImport} disabled={importing}>
                <FeatherIcon name="upload" /><span>{importing ? (importStage || "Importing...") : "Import CSV"}</span>
              </button>
            </div>
          </section>
        </div>
      </BodyPortal> : null}
    </>
  );
}

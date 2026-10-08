"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const BackupDialogs = dynamic(() => import("./BackupDialogs"), { ssr: false });
const BackupToast = dynamic(() => import("./BackupDialogs").then((module) => module.BackupToast), { ssr: false });
const preloadBackupDialogs = () => import("./BackupDialogs");

function text(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
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
    upload: <><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></>,
    "trash-2": <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
    folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
    "arrow-left": <><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></>,
  };
  return <svg {...common}>{icons[name] || icons.database}</svg>;
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
  const router = useRouter();
  const [tables, setTables] = useState(() => Array.isArray(initialTables) ? initialTables : []);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);
  const [folderMenu, setFolderMenu] = useState("");
  const [activePageKey, setActivePageKey] = useState("");
  const [search, setSearch] = useState("");
  const folderLongPressTimerRef = useRef(null);
  const folderLongPressStartRef = useRef(null);
  const suppressFolderClickRef = useRef(false);

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

  useEffect(() => () => {
    if (folderLongPressTimerRef.current) window.clearTimeout(folderLongPressTimerRef.current);
  }, []);

  function cancelFolderLongPress() {
    if (folderLongPressTimerRef.current) {
      window.clearTimeout(folderLongPressTimerRef.current);
      folderLongPressTimerRef.current = null;
    }
    folderLongPressStartRef.current = null;
  }

  function startFolderLongPress(event, itemKey) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelFolderLongPress();
    suppressFolderClickRef.current = false;
    folderLongPressStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    folderLongPressTimerRef.current = window.setTimeout(() => {
      folderLongPressTimerRef.current = null;
      folderLongPressStartRef.current = null;
      suppressFolderClickRef.current = true;
      setFolderMenu(itemKey);
      try { if (navigator.vibrate) navigator.vibrate(28); } catch {}
    }, 550);
  }

  function moveFolderLongPress(event) {
    const start = folderLongPressStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) cancelFolderLongPress();
  }

  function openFolderActionsFromKeyboard(event, itemKey) {
    if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
      event.preventDefault();
      cancelFolderLongPress();
      suppressFolderClickRef.current = true;
      setFolderMenu(itemKey);
    }
  }

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
      const response = await fetch("/next/api/backup/tables", { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      if (!response.ok || body?.ok === false) throw new Error(text(body?.error || body?.message) || `Request failed with ${response.status}.`);
      setTables(Array.isArray(body?.tables) ? body.tables : []);
    } catch (error) {
      showToast(error?.message || "Failed to load database tables.", "danger");
    }
  }

  function openImportModal(table) {
    preloadBackupDialogs();
    setDialog({ mode: "import", target: table });
  }

  function openDeleteModal(table) {
    preloadBackupDialogs();
    setDialog({ mode: "delete", target: table });
  }

  async function handleDialogSuccess(message) {
    showToast(message);
    await reloadTables();
  }

  return (
    <>
      {toast ? <BackupToast toast={toast} /> : null}

      <main className="backup-page-shell backup-folder-page">
        <section className="backup-hero card">
          <span className="backup-hero-icon"><FeatherIcon name="database" /></span>
          <div className="backup-hero-copy">
            <p className="backup-kicker">SYSTEM DATA</p>
            <h2>Database</h2>
          </div>
          <div className="backup-hero-actions">
            <a className="backup-export-all-btn" href="/next/api/backup/export-direct?scope=all" download>
              <FeatherIcon name="download-cloud" /><span>Export all data</span>
            </a>
            <button type="button" className="backup-delete-all-btn" onMouseEnter={preloadBackupDialogs} onFocus={preloadBackupDialogs} onClick={() => openDeleteModal({ key: "__all__", pageName: "all system data", tableName: "all database tables", isAll: true })}>
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
                  {menuOpen ? (
                    <div className="backup-folder-menu" onClick={(event) => event.stopPropagation()}>
                      <a href={`/next/api/backup/export-direct?key=${encodeURIComponent(item.key)}`} download onClick={() => setFolderMenu("")}>
                        <FeatherIcon name="download" /><span>Export</span>
                      </a>
                      <button type="button" onMouseEnter={preloadBackupDialogs} onFocus={preloadBackupDialogs} onClick={() => { setFolderMenu(""); openImportModal(item); }}>
                        <FeatherIcon name="upload" /><span>Import</span>
                      </button>
                        <button type="button" className="is-danger" onMouseEnter={preloadBackupDialogs} onFocus={preloadBackupDialogs} onClick={() => { setFolderMenu(""); openDeleteModal(item); }}>
                        <FeatherIcon name="trash-2" /><span>Delete</span>
                      </button>
                  </div>
                  ) : null}
                  <button
                    type="button"
                    className="backup-folder-main backup-folder-main--long-press"
                    onPointerDown={(event) => startFolderLongPress(event, item.key)}
                    onPointerMove={moveFolderLongPress}
                    onPointerUp={cancelFolderLongPress}
                    onPointerCancel={cancelFolderLongPress}
                    onPointerLeave={cancelFolderLongPress}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      cancelFolderLongPress();
                      suppressFolderClickRef.current = true;
                      setFolderMenu(item.key);
                    }}
                    onKeyDown={(event) => openFolderActionsFromKeyboard(event, item.key)}
                    onClick={() => {
                      if (suppressFolderClickRef.current) {
                        suppressFolderClickRef.current = false;
                        return;
                      }
                      router.push(`/backup/${encodeURIComponent(item.key)}?folder=${encodeURIComponent(activePage.key)}`);
                    }}
                    aria-label={`Open ${item.pageName || item.tableName}. Press and hold for actions.`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
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

      {dialog ? (
        <BackupDialogs
          key={`${dialog.mode}:${dialog.target?.key || "all"}`}
          mode={dialog.mode}
          target={dialog.target}
          onClose={() => setDialog(null)}
          onSuccess={handleDialogSuccess}
          onToast={showToast}
        />
      ) : null}

    </>
  );
}

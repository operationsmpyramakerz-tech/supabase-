"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HISTORY_PERMISSIONS = ["History", "System History", "Audit History", "Audit Log", "System Audit", "/history"];
const BACKUP_PERMISSIONS = ["Backup", "Back up", "Database", "System Database", "System Backup", "Data Backup", "/backup"];
const HARD_REFRESH_MARKER_KEY = "ops.hardRefresh.pendingAt";
const CHROME_CACHE_KEY = "ops.ui.chrome.v1";
const ALLOWED_PAGES_KEY = "allowedPages";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hasPermission(allowedPages, candidates) {
  const allowed = new Set((Array.isArray(allowedPages) ? allowedPages : []).map(normalize));
  return candidates.some((candidate) => allowed.has(normalize(candidate)));
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || "") : "";
  return `${first}${last}`.toUpperCase() || "U";
}

function MenuIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
    smartphone: <><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  };
  return <svg {...common}>{paths[name] || paths.user}</svg>;
}

function readChromeSnapshot() {
  const snapshot = { username: "", allowedPages: null, chromeCache: null };
  try { snapshot.username = String(localStorage.getItem("username") || "").trim(); } catch {}
  try {
    const allowed = JSON.parse(sessionStorage.getItem(ALLOWED_PAGES_KEY) || "null");
    if (Array.isArray(allowed)) snapshot.allowedPages = allowed;
  } catch {}
  try {
    const chrome = JSON.parse(localStorage.getItem(CHROME_CACHE_KEY) || "null");
    if (chrome && typeof chrome === "object") {
      snapshot.chromeCache = chrome;
      if (!snapshot.username && chrome.name) snapshot.username = String(chrome.name || "").trim();
      if (!snapshot.allowedPages && Array.isArray(chrome.allowedPages)) snapshot.allowedPages = chrome.allowedPages;
    }
  } catch {}
  return snapshot;
}

function restoreChromeSnapshot(snapshot) {
  const safe = snapshot && typeof snapshot === "object" ? snapshot : {};
  try { if (safe.username) localStorage.setItem("username", safe.username); } catch {}
  try { if (Array.isArray(safe.allowedPages)) sessionStorage.setItem(ALLOWED_PAGES_KEY, JSON.stringify(safe.allowedPages)); } catch {}
  try {
    if (safe.chromeCache && typeof safe.chromeCache === "object") {
      localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify({ ...safe.chromeCache, savedAt: Date.now() }));
    } else if (safe.username || Array.isArray(safe.allowedPages)) {
      localStorage.setItem(CHROME_CACHE_KEY, JSON.stringify({
        name: safe.username || "",
        allowedPages: Array.isArray(safe.allowedPages) ? safe.allowedPages : [],
        savedAt: Date.now(),
      }));
    }
  } catch {}
}

async function clearBrowserCachesForHardRefresh() {
  const chromeSnapshot = readChromeSnapshot();

  try { sessionStorage.clear(); } catch {}
  try { localStorage.setItem(HARD_REFRESH_MARKER_KEY, String(Date.now())); } catch {}
  restoreChromeSnapshot(chromeSnapshot);

  try {
    if (window.caches && typeof caches.keys === "function") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch {}

  try {
    if ("serviceWorker" in navigator && typeof navigator.serviceWorker.getRegistrations === "function") {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(async (registration) => {
        try { await registration.update(); } catch {}
        try { await registration.unregister(); } catch {}
      }));
    }
  } catch {}
}

async function clearServerCaches() {
  const response = await fetch(`/api/hard-refresh?_fresh=1&_refresh=${encodeURIComponent(String(Date.now()))}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      "X-Ops-Hard-Refresh": "1",
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || "Failed to clear server cache.");
  }
}

export default function UserProfileMenu({ account }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeTimerRef = useRef(0);
  const [renderPanel, setRenderPanel] = useState(false);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileAccount, setProfileAccount] = useState(() => account || {});

  useEffect(() => {
    setProfileAccount(account || {});
  }, [account]);

  useEffect(() => {
    let cancelled = false;

    async function handleUserUpdated(event) {
      const supplied = event?.detail?.account;
      if (supplied && typeof supplied === "object") {
        if (!cancelled) setProfileAccount((current) => ({ ...current, ...supplied }));
        return;
      }

      try {
        const response = await fetch(`/api/account?_refresh=${encodeURIComponent(String(Date.now()))}`, {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;
        const fresh = await response.json().catch(() => null);
        if (!cancelled && fresh && typeof fresh === "object") setProfileAccount((current) => ({ ...current, ...fresh }));
      } catch {}
    }

    window.addEventListener("user:updated", handleUserUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("user:updated", handleUserUpdated);
    };
  }, []);

  const displayName = String(profileAccount?.name || profileAccount?.username || "User").trim() || "User";
  const role = String(profileAccount?.position || profileAccount?.department || "").trim();
  const photoUrl = String(profileAccount?.photoUrl || "").trim();
  const allowedPages = Array.isArray(profileAccount?.allowedPages) ? profileAccount.allowedPages : [];
  const canSeeHistory = useMemo(() => hasPermission(allowedPages, HISTORY_PERMISSIONS), [allowedPages]);
  const canSeeBackup = useMemo(() => hasPermission(allowedPages, BACKUP_PERMISSIONS), [allowedPages]);

  function positionPanel() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 12;
    const top = Math.round(rect.bottom + gap);
    const right = Math.max(14, Math.round(window.innerWidth - rect.right));
    const maxHeight = Math.max(180, Math.round(window.innerHeight - top - 16));
    const style = { top: `${top}px`, right: `${right}px`, left: "auto", maxHeight: `${maxHeight}px`, overflow: "auto" };

    if (window.innerWidth < 348) {
      style.left = "14px";
      style.right = "14px";
    }
    setPanelStyle(style);
  }

  function openMenu() {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setRenderPanel(true);
    requestAnimationFrame(() => {
      positionPanel();
      requestAnimationFrame(() => setOpen(true));
    });
  }

  function closeMenu({ immediate = false } = {}) {
    setOpen(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    if (immediate) {
      setRenderPanel(false);
      return;
    }
    closeTimerRef.current = window.setTimeout(() => setRenderPanel(false), 240);
  }

  useEffect(() => {
    function handlePointerDown(event) {
      if (!renderPanel) return;
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      closeMenu();
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") closeMenu();
    }
    function handleViewportChange() {
      if (renderPanel) positionPanel();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [renderPanel]);

  function navigate(href) {
    closeMenu({ immediate: true });
    window.location.href = href;
  }

  async function hardRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    closeMenu();
    try {
      await clearBrowserCachesForHardRefresh();
      await clearServerCaches();
      const url = new URL(window.location.href);
      url.searchParams.set("_fresh", "1");
      url.searchParams.set("_refresh", String(Date.now()));
      window.location.replace(url.toString());
    } catch (error) {
      console.error("Hard refresh failed:", error);
      setRefreshing(false);
      window.alert(error?.message || "Could not clear the server cache.");
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await fetch("/api/logout", { method: "POST", credentials: "include" }); } catch {}
    try { sessionStorage.clear(); } catch {}
    try {
      localStorage.removeItem("ui.sidebarMini");
      localStorage.removeItem("ui.sidebarCollapsed");
      localStorage.removeItem("username");
      localStorage.removeItem(CHROME_CACHE_KEY);
    } catch {}
    window.location.href = "/login";
  }

  const panel = renderPanel ? (
    <div
      ref={panelRef}
      id="userMenuPanel"
      className={`user-menu-panel user-menu-panel--portal ${open ? "is-open" : ""}`}
      role="menu"
      aria-label="User menu"
      style={{ position: "fixed", zIndex: 999999, ...panelStyle }}
    >
      <div className="user-menu-shell">
        <div className="user-menu-user" aria-label="Signed in user">
          <span className="user-menu-user__avatar" aria-hidden="true">
            {photoUrl ? <img className="user-menu-user__img" src={photoUrl} alt="" style={{ display: "block" }} /> : <span className="user-menu-user__fallback" style={{ display: "grid" }}>{initials(displayName)}</span>}
          </span>
          <div className="user-menu-user__meta">
            <div className="user-menu-user__name">{displayName}</div>
            <div className="user-menu-user__role">{role}</div>
          </div>
        </div>

        <div className="user-menu-sep user-menu-sep--tight" role="separator" />

        <button type="button" className="user-menu-item" role="menuitem" onClick={() => navigate("/next/account")}>
          <span className="umi-ico"><MenuIcon name="user" /></span><span className="umi-label">User Profile</span>
        </button>

        {canSeeHistory ? (
          <button type="button" className="user-menu-item" role="menuitem" onClick={() => navigate("/next/history")}>
            <span className="umi-ico"><MenuIcon name="clock" /></span><span className="umi-label">History</span>
          </button>
        ) : null}

        {canSeeBackup ? (
          <button type="button" className="user-menu-item" role="menuitem" onClick={() => navigate("/next/backup")}>
            <span className="umi-ico"><MenuIcon name="database" /></span><span className="umi-label">Database</span>
          </button>
        ) : null}

        <button type="button" className="user-menu-item" role="menuitem" onClick={() => navigate("/next/how-it-works")}>
          <span className="umi-ico"><MenuIcon name="activity" /></span><span className="umi-label">How it works</span>
        </button>

        <button type="button" className="user-menu-item user-menu-item--app" role="menuitem" onClick={() => navigate("/next/app-install")}>
          <span className="umi-ico"><MenuIcon name="smartphone" /></span><span className="umi-label">App</span>
        </button>

        <button type="button" className={`user-menu-item user-menu-item--refresh ${refreshing ? "is-loading" : ""}`} role="menuitem" onClick={hardRefresh} disabled={refreshing}>
          <span className="umi-ico"><MenuIcon name="refresh" /><span className="umi-spinner" aria-hidden="true" /></span><span className="umi-label">{refreshing ? "Refreshing…" : "Hard Refresh"}</span>
        </button>

        <div className="user-menu-sep" role="separator" />

        <button type="button" className="user-menu-item user-menu-item--danger" role="menuitem" onClick={logout} disabled={loggingOut}>
          <span className="umi-ico"><MenuIcon name="logout" /></span><span className="umi-label">{loggingOut ? "Logging out…" : "Log out"}</span>
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="header-user"
        aria-label="User menu"
        title={displayName}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (renderPanel && open) closeMenu();
          else openMenu();
        }}
      >
        <span className="header-user__avatar">
          {photoUrl ? <img className="header-user__img" src={photoUrl} alt="" /> : <span className="header-user__fallback" aria-hidden="true">{initials(displayName)}</span>}
        </span>
      </button>
      {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </>
  );
}

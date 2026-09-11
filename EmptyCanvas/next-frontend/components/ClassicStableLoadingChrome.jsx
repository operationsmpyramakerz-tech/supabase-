import { cache } from "react";
import { cookies } from "next/headers";
import { BodyClassSync, ClassicMobileDockStructure, ClassicSidebarViewportKeeper } from "./ClassicShellControls";
import { fetchLegacyJson } from "../lib/legacy-api";
import ClassicStableLoadingNavItem from "./ClassicStableLoadingNavItem";

const ALLOWED_PAGES_COOKIE = "ops_ui_allowed_pages_v1";
const PROFILE_URL_COOKIE = "ops_ui_profile_url_v1";
const SIDEBAR_SCROLL_COOKIE = "ops_ui_sidebar_scroll_top_v1";
const SIDEBAR_SCROLL_LEFT_COOKIE = "ops_ui_sidebar_scroll_left_v1";

const CLASSIC_MAIN_LINKS = [
  { label: "Home", href: "/next/home", icon: "home", permissions: [], alwaysVisible: true, boundary: "workspace" },
  { label: "Current Orders", href: "/next/orders", icon: "list", permissions: ["Current Orders"] },
  { label: "Orders Review", href: "/next/orders-review", icon: "award", permissions: ["Orders Review"] },
  { label: "Operations Orders", href: "/next/operations-orders", icon: "users", permissions: ["Requested Orders", "Operations Orders"] },
  { label: "Maintenance Orders", href: "/next/maintenance-orders", icon: "tool", permissions: ["Maintenance Orders"] },
  { label: "Events", href: "/next/events", icon: "calendar", permissions: ["Event Requests", "Event Calendar", "Event Components", "Events", "/events", "/events/requests", "/events/calendar", "/events/components"] },
  { label: "Shopping Cart", href: "/next/orders/new", icon: "shopping-cart", permissions: ["Create New Order", "Shopping Cart", "Cart", "/orders/new"] },
  { label: "Stocktaking", href: "/next/stocktaking", icon: "archive", permissions: ["Stocktaking"] },
  { label: "B2C", href: "/next/b2c", icon: "user-plus", permissions: ["B2C", "Customer Database", "B2C Customer Database", "Customer Form", "B2C Customer Form", "/b2c/database", "/b2c/form"] },
  { label: "Products", href: "/next/products", icon: "package", permissions: ["Products", "Product", "Components"] },
  { label: "Kits", href: "/next/kits", icon: "briefcase", permissions: ["Kits", "Proposals", "Products"] },
  { label: "Proposals", href: "/next/proposals", icon: "file-text", permissions: ["Proposals", "Products"] },
  { label: "Expenses", href: "/next/expenses", icon: "dollar-sign", permissions: ["Expenses"] },
  { label: "Expenses by Users", href: "/next/expenses/users", icon: "credit-card", permissions: ["Expenses Users"] },
  { label: "Task Management", href: "/next/task-management", icon: "git-branch", permissions: ["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"] },
  { label: "KPIs", href: "/next/kpis", icon: "bar-chart-2", permissions: ["KPIs"] },
  { label: "Users Center", href: "/next/users-center", icon: "shield", permissions: ["Users Center", "User Access & Data", "User Access and Data", "User Access", "Team Members"], boundary: "users" },
];

function ClassicIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    home: <><path d="M3 11l9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-6h6v6"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    award: <><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    "shopping-cart": <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    "user-plus": <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    package: <><path d="M16.5 9.4L7.5 4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    "dollar-sign": <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></>,
    "credit-card": <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    "git-branch": <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    "bar-chart-2": <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  };
  return <svg {...common}>{paths[name] || paths.home}</svg>;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function canSee(link, allowedPages) {
  if (link?.alwaysVisible) return true;
  const allowed = new Set((Array.isArray(allowedPages) ? allowedPages : []).map(normalize));
  if (!allowed.size) return false;
  return (link.permissions || []).some((permission) => allowed.has(normalize(permission)));
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function parseAllowedPagesCookie(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function parseHttpUrlCookie(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch {}
  decoded = String(decoded || "").trim();
  if (!decoded || decoded.length > 3200) return "";
  try {
    const parsed = new URL(decoded);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

const readStableChrome = cache(async () => {
  const cookieStore = await cookies();
  const scrollTop = Math.max(0, Number(cookieStore.get(SIDEBAR_SCROLL_COOKIE)?.value) || 0);
  const scrollLeft = Math.max(0, Number(cookieStore.get(SIDEBAR_SCROLL_LEFT_COOKIE)?.value) || 0);
  const fromCookie = parseAllowedPagesCookie(cookieStore.get(ALLOWED_PAGES_COOKIE)?.value);
  const profileUrl = parseHttpUrlCookie(cookieStore.get(PROFILE_URL_COOKIE)?.value);
  if (Array.isArray(fromCookie)) {
    return { allowedPages: fromCookie, name: "", photoUrl: profileUrl, scrollTop, scrollLeft };
  }

  // First request after deploying this fix may not have the UI cookie yet.
  // Fall back to the authenticated account endpoint so the loading sidebar is
  // still permission-correct rather than collapsing to Home only.
  try {
    const response = await fetchLegacyJson("/api/account", { timeoutMs: 4000 });
    if (response.ok && response.data && typeof response.data === "object") {
      return {
        allowedPages: Array.isArray(response.data.allowedPages) ? response.data.allowedPages : [],
        name: String(response.data.name || response.data.username || "").trim(),
        photoUrl: String(response.data.photoUrl || response.data.profilePicture || profileUrl || "").trim(),
        scrollTop,
        scrollLeft,
      };
    }
  } catch {}

  return { allowedPages: [], name: "", photoUrl: profileUrl, scrollTop, scrollLeft };
});

export async function ClassicStableLoadingSidebar({ activeIndex = -1 }) {
  const chrome = await readStableChrome();
  const allowed = Array.isArray(chrome?.allowedPages) ? chrome.allowedPages : [];
  const links = CLASSIC_MAIN_LINKS
    .map((link, originalIndex) => ({ ...link, originalIndex }))
    .filter((link) => canSee(link, allowed));
  const visibleHrefs = links.map((link) => link.href);
  const loadingViewportStyle = {
    "--next-loading-sidebar-scroll-top": `${Math.round(chrome?.scrollTop || 0)}px`,
    "--next-loading-sidebar-scroll-left": `${Math.round(chrome?.scrollLeft || 0)}px`,
  };

  return (
    <aside className="sidebar next-stable-loading-sidebar" aria-label="Main navigation" style={loadingViewportStyle}>
      <ClassicMobileDockStructure />
      <ClassicSidebarViewportKeeper />
      <div className="sidebar-header">
        <div className="sidebar-brand-toggle next-classic-loading-brand">
          <img className="brand-logo-full" src="/images/Logo%20horizontal.png" alt="" />
          <img className="brand-logo-icon" src="/images/logo.png" alt="" />
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="Loading navigation">
        <ul className="nav-list">
          {links.map((link) => (
            <ClassicStableLoadingNavItem
              key={link.href}
              href={link.href}
              allHrefs={visibleHrefs}
              fallbackActive={link.originalIndex === activeIndex}
              itemClassName={link.boundary === "workspace" ? "sidebar-workspace-boundary" : link.boundary === "users" ? "sidebar-users-boundary" : ""}
              label={link.label}
            >
              <ClassicIcon name={link.icon} />
              <span className="nav-label">{link.label}</span>
            </ClassicStableLoadingNavItem>
          ))}
        </ul>
      </nav>
      <div className="sidebar-footer" />
    </aside>
  );
}

export async function ClassicStableLoadingHeader({ title = "Home" }) {
  const chrome = await readStableChrome();
  const photoUrl = String(chrome?.photoUrl || "").trim();
  const name = String(chrome?.name || "User").trim() || "User";

  return (
    <header className="main-header dash-header dash-hide-row2 next-stable-loading-header">
      <div className="header-row1">
        <div className="left">
          <div className="dash-title">{title}</div>
        </div>
        <div className="right topbar-right">
          <span className="system-header-search__toggle next-stable-loading-header-button" aria-hidden="true"><ClassicIcon name="search" /></span>
          <span className="notif-bell-btn next-stable-loading-header-button" aria-hidden="true"><BellIcon /></span>
          <span className="header-user next-stable-loading-user" aria-label={name}>
            <span className="header-user__avatar next-stable-loading-user__avatar" aria-hidden="true">
              {photoUrl ? <img className="header-user__img" src={photoUrl} alt="" /> : <span className="next-stable-loading-user__fallback"><UserIcon /></span>}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}

export function ClassicStableLoadingShell({
  title = "Home",
  bodyClass = "",
  activeIndex = -1,
  children,
  mainClassName = "container-full-width next-classic-page-content",
  ariaLabel = "Loading page",
  classicStyles = [],
}) {
  const classes = [bodyClass, "next-classic-shell-active"].filter(Boolean).join(" ");
  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      {classicStyles.map((href) => <link rel="stylesheet" href={href} key={href} />)}
      <BodyClassSync className={classes} />
      <div className="app-container classic-app-shell next-classic-stable-loading" aria-label={ariaLabel}>
        <ClassicStableLoadingSidebar activeIndex={activeIndex} />
        <div className="main-content">
          <ClassicStableLoadingHeader title={title} />
          <main className={mainClassName}>{children}</main>
        </div>
      </div>
    </>
  );
}

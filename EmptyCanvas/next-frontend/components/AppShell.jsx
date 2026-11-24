"use client";

import ShellStyleLinks from "./ShellStyleLinks";
import { useLayoutEffect } from "react";
import dynamic from "next/dynamic";
import { usePersistentShellContext } from "./PersistentShellContext";
import Link from "next/link";
import NotificationsBell from "./notifications/NotificationsBell";
import UserProfileMenu from "./UserProfileMenu";
import HeaderSearch from "./HeaderSearch";
import { MODULE_LINKS, CLASSIC_MAIN_LINKS, canSeeNavigationLink } from "../lib/navigation-config";
import { featureAllowed } from "../lib/feature-permissions-registry";
import {
  BodyClassSync,
  ClassicChromeAccessSync,
  ClassicSidebarBootstrap,
  ClassicSmallWindowSidebarGuard,
  ClassicSidebarViewportKeeper,
  ClassicSidebarActiveIndicator,
  ClassicMobileDockStructure,
  ClassicMobileDockQuickOpen,
  HeaderMenuToggle,
  SidebarBrandToggle,
} from "./ClassicShellControls";

const TaskManagementSidebarFlyout = dynamic(() => import("./task-management/TaskManagementSidebarFlyout"), { ssr: false });
const EventsSidebarFlyout = dynamic(() => import("./events/EventsSidebarFlyout"), { ssr: false });
const ShoppingCartSidebarFlyout = dynamic(() => import("./orders/ShoppingCartSidebarFlyout"), { ssr: false });


function toNextClientHref(value) {
  const raw = String(value || "").trim() || "/";
  // next.config.mjs mounts this app at basePath=/next. <Link> adds the base
  // path automatically, so feed it the route-local pathname to avoid
  // /next/next/... while still rendering the same public URL.
  if (raw === "/next") return "/";
  if (raw.startsWith("/next/")) return raw.slice(5) || "/";
  return raw;
}


export function isActive(activePath, href) {
  const current = String(activePath || "").replace(/\/$/, "") || "/";
  const target = String(href || "").replace(/\/$/, "") || "/";
  if (current === target) return true;
  if (target === "/" || !current.startsWith(`${target}/`)) return false;

  const allLinks = [...MODULE_LINKS, ...CLASSIC_MAIN_LINKS];
  const moreSpecificOwner = allLinks.some((link) => {
    const candidate = String(link?.href || "").replace(/\/$/, "") || "/";
    return candidate !== target && candidate.startsWith(`${target}/`) &&
      (current === candidate || current.startsWith(`${candidate}/`));
  });
  return !moreSpecificOwner;
}

function isClassicNavActive(activePath, href) {
  const current = String(activePath || "").replace(/\/+$/, "") || "/";
  if (href === "/next/events") {
    return current === "/next/events"
      || current === "/next/events-calendar"
      || current.startsWith("/next/events-calendar/")
      || current === "/next/event-components"
      || current.startsWith("/next/event-components/")
      || current === "/next/event-team"
      || current.startsWith("/next/event-team/");
  }
  return isActive(activePath, href);
}

export function ClassicIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    home: <><path d="M3 11l9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-6h6v6"/></>,
    "book-open": <><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/></>,
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
    "folder-check": <><path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z"/><path d="m9 14 2 2 4-4"/></>,
    "file-text": <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    "dollar-sign": <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></>,
    "credit-card": <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
    "git-branch": <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    "bar-chart-2": <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  };
  return <svg {...common}>{paths[name] || paths.home}</svg>;
}


// All authenticated routes share this compact active chevron. Subfolder
// breadcrumbs in Projects Preparing continue to own their complete path.
const HEADER_ICON_BY_TITLE = Object.freeze({
  "Home": "home", "My Orders": "list", "Orders Review": "award",
  "Operations Orders": "users", "Maintenance Orders": "tool",
  "Products": "package", "Stocktaking": "archive",
  "Kits": "briefcase", "Proposals": "file-text",
  "Projects Preparing": "folder-check", "Shopping Cart": "shopping-cart",
  "Request Products": "shopping-cart", "Withdraw Products": "shopping-cart",
  "Request Maintenance": "tool", "Events": "calendar",
  "New Event Request": "calendar", "Task Management": "git-branch",
  "All Tasks": "git-branch", "My Tasks": "git-branch", "Delegated Tasks": "git-branch",
  "Expenses": "dollar-sign", "Expenses by User": "credit-card",
  "KPIs": "bar-chart-2", "Users Center": "shield",
  "B2C": "user-plus", "B2C Table": "user-plus", "Forms": "file-text",
  "Database": "archive", "Database Table": "archive",
  "Notifications": "file-text", "History": "archive",
  "User Profile": "users", "How it works": "book-open",
});

function PageTitleChevron({ title, activePath }) {
  const knownIcon = HEADER_ICON_BY_TITLE[title];
  const matchingNav = CLASSIC_MAIN_LINKS
    .filter((link) => isActive(activePath, link.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const icon = knownIcon || matchingNav?.icon || "file-text";
  return (
    <span className="erp-title-chevron" title={title}>
      <span className="erp-title-chevron-icon"><ClassicIcon name={icon} /></span>
      <span className="erp-title-chevron-label">{title}</span>
    </span>
  );
}

export default function AppShell({
  account,
  children,
  title = "Home",
  eyebrow = "Incremental frontend migration",
  activePath = "/next/home",
  bodyClass = "",
  pageStyles = [],
}) {
  const persistentShell = usePersistentShellContext();
  const allowedPages = Array.isArray(account?.allowedPages) ? account.allowedPages : [];
  const classicLinks = CLASSIC_MAIN_LINKS.filter((link) => {
    if (!canSeeNavigationLink(link, allowedPages)) return false;
    if (link.href === "/next/notifications") return featureAllowed(account, "notifications.view");
    if (link.href === "/next/account") return featureAllowed(account, "account.view");
    if (link.href === "/next/home") return featureAllowed(account, "home.view");
    if (link.href === "/next/kpis") return featureAllowed(account, "kpis.view");
    if (link.href === "/next/users-center") return featureAllowed(account, "users.view");
    if (link.href === "/next/b2c") return featureAllowed(account, "b2c.database.view") || featureAllowed(account, "b2c.forms.view");
    if (link.href === "/next/stocktaking") return featureAllowed(account, "stocktaking.view");
    if (link.href === "/next/expenses") return featureAllowed(account, "expenses.view");
    if (link.href === "/next/expenses/users") return featureAllowed(account, "expenses.users.view");
    if (link.href === "/next/backup") return featureAllowed(account, "backup.view");
    if (link.href === "/next/history") return featureAllowed(account, "history.view");
    if (link.href === "/next/kits") return featureAllowed(account, "kits.view");
    if (link.href === "/next/proposals") return featureAllowed(account, "proposals.view");
    if (link.href === "/next/projects-preparing") return featureAllowed(account, "preparing.view");
    if (link.href === "/next/operations-orders") return featureAllowed(account, "orders.operations.view");
    if (link.href === "/next/orders-review") return featureAllowed(account, "orders.review.view");
    if (link.href === "/next/task-management") return featureAllowed(account, "tasks.view");
    if (link.href === "/next/events") return ["events.calendar.view", "events.requests.view", "events.components.view", "events.team.view"].some(key => featureAllowed(account, key));
    return true;
  });
  // The desktop bottom dock must occupy only as much space as the links
  // authorized for this account. ClassicMobileDockStructure lifts the first
  // (Home) item into its own rail; remaining items use 52px tiles, 10px gaps
  // and the current list's intrinsic horizontal padding. CSS caps the total width at 960px and
  // leaves horizontal scrolling available whenever the links overflow.
  const dockPageCount = Math.max(0, classicLinks.length - 1);
  const desktopDockPagesWidth = `${Math.max(64, dockPageCount * 62 + 22)}px`;
  const combinedBodyClass = [bodyClass, "next-classic-shell-active"].filter(Boolean).join(" ");
  const pageMainClass = [
    "container-full-width",
    "next-classic-page-content",
    activePath === "/next/orders" ? "current-orders-main-surface" : "",
  ].filter(Boolean).join(" ");

  useLayoutEffect(() => {
    if (!persistentShell?.persistent || typeof persistentShell.registerPage !== "function") return;
    persistentShell.registerPage({ account, title, activePath });
  }, [persistentShell, account, title, activePath]);

  // RootLayout now owns one long-lived AppShell. Page-level AppShell instances
  // remain in place so the migration does not require moving/deleting routes;
  // inside the persistent shell they only apply page-specific styles/classes
  // and refresh the chrome account/title metadata.
  // React 19 stylesheet precedence hoists CSS into <head> and keeps page
  // content behind its loading boundary until the styles are ready.
  // Preserve the original cascade order: shell -> route performance ->
  // workspace adjustments -> actual page styles.
  if (persistentShell?.persistent) {
    return (
      <>
        {pageStyles.map((href) => <link rel="stylesheet" href={href} key={href} precedence="erp-detail" />)}
        <link rel="stylesheet" href="/next/css/unified-white-workspace.css?v=sidebar-autofit-v419" precedence="erp-workspace" />
        <link rel="stylesheet" href="/next/css/scrollbar-hidden.css?v=global-hidden-v1" precedence="erp-workspace" />
        <link rel="stylesheet" href="/next/css/erp-inner-frame.css?v=v329-white-frame-dark-divider" precedence="erp-inner-frame" />
        <link rel="stylesheet" href="/next/css/erp-global-title-chevron.css?v=v332-folder-paths" precedence="erp-page-title" />
        <BodyClassSync className={combinedBodyClass} />
        <ClassicChromeAccessSync account={account} />
        {children}
      </>
    );
  }

  return (
    <>
      <ShellStyleLinks />
      {pageStyles.map((href) => <link rel="stylesheet" href={href} key={href} precedence="erp-performance" />)}
      <link rel="stylesheet" href="/next/css/unified-white-workspace.css?v=sidebar-autofit-v419" precedence="erp-workspace" />
      <link rel="stylesheet" href="/next/css/scrollbar-hidden.css?v=global-hidden-v1" precedence="erp-workspace" />
      <link rel="stylesheet" href="/next/css/erp-inner-frame.css?v=v329-white-frame-dark-divider" precedence="erp-inner-frame" />
      <link rel="stylesheet" href="/next/css/erp-global-title-chevron.css?v=v332-folder-paths" precedence="erp-page-title" />
      <BodyClassSync className={combinedBodyClass} />
      <ClassicChromeAccessSync account={account} />
      <ClassicSidebarBootstrap />
      <ClassicSmallWindowSidebarGuard />
      <ClassicMobileDockStructure activePath={activePath} />
      <ClassicMobileDockQuickOpen />
      <ClassicSidebarViewportKeeper />
      <ClassicSidebarActiveIndicator activePath={activePath} />
      <TaskManagementSidebarFlyout allowedPages={allowedPages} account={account} activePath={activePath} />
      <EventsSidebarFlyout allowedPages={allowedPages} account={account} activePath={activePath} />
      <ShoppingCartSidebarFlyout allowedPages={allowedPages} activePath={activePath} />
      <ShoppingCartSidebarFlyout module="operations" account={account} allowedPages={allowedPages} activePath={activePath} />
      <ShoppingCartSidebarFlyout module="review" account={account} allowedPages={allowedPages} activePath={activePath} />

      <div className="app-container classic-app-shell">
        <aside className="sidebar" style={{ "--desktop-dock-pages-width": desktopDockPagesWidth }}>
          <div className="sidebar-header">
            <h2 aria-label="Dashboard">Dashboard</h2>
            <SidebarBrandToggle />
          </div>
          <nav className="sidebar-nav" aria-label="Main navigation">
            <ul className="nav-list">
              {classicLinks.map((link) => (
                <li
                  key={link.href}
                  className={link.boundary === "workspace" ? "sidebar-workspace-boundary" : link.boundary === "users" ? "sidebar-users-boundary" : ""}
                >
                  <Link
                    className={`nav-link ${isClassicNavActive(activePath, link.href) ? "active" : ""}`}
                    href={toNextClientHref(link.href)}
                    prefetch={true}
                    title={link.label}
                    aria-label={link.label}
                  >
                    <ClassicIcon name={link.icon} />
                    <span className="nav-label">{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="sidebar-footer" />
        </aside>

        <div className="main-content">
          <header className="main-header dash-header dash-hide-row2">
            <div className="header-row1">
              <div className="left">
                <HeaderMenuToggle />
                {/* Desktop dock has no vertical sidebar to collapse. Keep the
                    company mark next to the orange page divider on every page,
                    including Home; clicking it navigates without hiding it. */}
                <Link className="desktop-header-brand" href="/home" aria-label="Go to Home" title="Home" prefetch={true}>
                  <img src="/next/images/logo.png" alt="" aria-hidden="true" />
                </Link>
                <div className="dash-title"><PageTitleChevron title={title} activePath={activePath} /></div>
              </div>
              <div className="right topbar-right">
                <HeaderSearch title={title} />
                {featureAllowed(account, "notifications.view") ? <NotificationsBell classic canManageRead={featureAllowed(account, "notifications.read_manage")} /> : null}
                <UserProfileMenu account={account} />
              </div>
            </div>
            <div className="header-row2"><h1 className="page-title">{title}</h1></div>
          </header>

          <main className={pageMainClass}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

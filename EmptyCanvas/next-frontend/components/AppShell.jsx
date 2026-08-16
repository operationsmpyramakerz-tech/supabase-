import NotificationsBell from "./notifications/NotificationsBell";
import UserProfileMenu from "./UserProfileMenu";
import {
  BodyClassSync,
  ClassicSidebarBootstrap,
  ClassicSidebarViewportKeeper,
  HeaderMenuToggle,
  SidebarBrandToggle,
} from "./ClassicShellControls";

const MODULE_LINKS = [
  { label: "LMS", href: "/next/lms", classicHref: "/lms", permissions: [], alwaysVisible: true },
  { label: "Notifications", href: "/next/notifications", classicHref: "/home", permissions: [], alwaysVisible: true },
  { label: "How it works", href: "/next/how-it-works", classicHref: "/how-it-works", permissions: [], alwaysVisible: true },
  { label: "Current Orders", href: "/next/orders", classicHref: "/orders", permissions: ["Current Orders"] },
  { label: "Orders Review", href: "/next/orders-review", classicHref: "/orders/sv-orders", permissions: ["Orders Review"] },
  { label: "Operations Orders", href: "/next/operations-orders", classicHref: "/orders/requested", permissions: ["Requested Orders", "Operations Orders"] },
  { label: "Maintenance Orders", href: "/next/maintenance-orders", classicHref: "/orders/maintenance-orders", permissions: ["Maintenance Orders"] },
  { label: "Shopping Cart", href: "/next/orders/new", classicHref: "/orders/new", permissions: ["Create New Order", "Shopping Cart", "Cart", "/orders/new"] },
  { label: "Stocktaking", href: "/next/stocktaking", classicHref: "/stocktaking", permissions: ["Stocktaking"] },
  { label: "Events", href: "/next/events", classicHref: "/events", permissions: ["Event Requests"] },
  { label: "New Event Request", href: "/next/events/new", classicHref: "/events/new", permissions: ["Event Requests"] },
  { label: "Event Calendar", href: "/next/events-calendar", classicHref: "/events/calendar", permissions: ["Event Calendar"] },
  { label: "Event Components", href: "/next/event-components", classicHref: "/events/components", permissions: ["Event Components"] },
  { label: "Products", href: "/next/products", classicHref: "/products", permissions: ["Products"] },
  { label: "Proposals", href: "/next/proposals", classicHref: "/proposals", permissions: ["Proposals", "Products"] },
  { label: "Kits", href: "/next/kits", classicHref: "/kits", permissions: ["Kits", "Proposals", "Products"] },
  { label: "B2C Database", href: "/next/b2c/database", classicHref: "/b2c/database", permissions: ["B2C", "Customer Database", "B2C Customer Database", "/b2c/database"] },
  { label: "B2C Forms", href: "/next/b2c/forms", classicHref: "/b2c/form", permissions: ["B2C", "Customer Form", "B2C Customer Form", "Customer Database", "B2C Customer Database", "/b2c/form"] },
  { label: "Task Management", href: "/next/task-management", classicHref: "/task-management", permissions: ["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"] },
  { label: "Expenses", href: "/next/expenses", classicHref: "/expenses", permissions: ["Expenses"] },
  { label: "Expenses Users", href: "/next/expenses/users", classicHref: "/expenses/users", permissions: ["Expenses Users"] },
  { label: "KPIs", href: "/next/kpis", classicHref: "/kpis", permissions: ["KPIs"] },
  { label: "Users Center", href: "/next/users-center", classicHref: "/user-access", permissions: ["Users Center", "User Access & Data", "User Access and Data", "User Access", "Team Members"] },
  { label: "System History", href: "/next/history", classicHref: "/history", permissions: ["History", "System History", "Audit History", "Audit Log", "System Audit", "/history"] },
  { label: "Database Backup", href: "/next/backup", classicHref: "/backup", permissions: ["Backup", "Back Up", "Database", "System Database", "System Backup", "Data Backup", "/backup"] },
];

// Matches the final Classic Operations Hub sidebar order.  System History,
// Backup, Notifications and How-it-works stay available through their direct
// routes/profile controls, just like the current Classic interface.
const CLASSIC_MAIN_LINKS = [
  { label: "Home", href: "/next/home", icon: "home", permissions: [], alwaysVisible: true },
  { label: "LMS", href: "/next/lms", icon: "book-open", permissions: [], alwaysVisible: true, boundary: "workspace" },
  { label: "Current Orders", href: "/next/orders", icon: "list", permissions: ["Current Orders"] },
  { label: "Orders Review", href: "/next/orders-review", icon: "award", permissions: ["Orders Review"] },
  { label: "Operations Orders", href: "/next/operations-orders", icon: "users", permissions: ["Requested Orders", "Operations Orders"] },
  { label: "Maintenance Orders", href: "/next/maintenance-orders", icon: "tool", permissions: ["Maintenance Orders"] },
  { label: "Events", href: "/next/events", icon: "calendar", permissions: ["Event Requests", "Events"] },
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

const LMS_LINKS = [
  { label: "Overview", href: "/next/lms", key: "", alwaysVisible: true },
  { label: "Users Center", href: "/next/lms/users-center", key: "lms-users-center" },
  { label: "Schools", href: "/next/lms/schools", key: "lms-b2b" },
  { label: "Curriculum", href: "/next/lms/curriculum", key: "lms-curriculum" },
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function canSee(link, allowedPages) {
  if (link?.alwaysVisible) return true;
  const allowed = new Set((Array.isArray(allowedPages) ? allowedPages : []).map(normalize));
  if (!allowed.size) return false;
  return (link.permissions || []).some((permission) => allowed.has(normalize(permission)));
}

function lmsAccessKeys(access) {
  return new Set((Array.isArray(access?.pages) ? access.pages : [])
    .filter((page) => page?.isEnabled !== false)
    .map((page) => normalize(page?.pageKey || page?.page_key))
    .filter(Boolean));
}

function visibleLmsLinks(access) {
  const keys = lmsAccessKeys(access);
  return LMS_LINKS.filter((link) => link.alwaysVisible || access?.isBuiltInAdmin || keys.has(link.key));
}

function withClassicFlag(value) {
  const raw = String(value || "").trim() || "/home";
  const hashIndex = raw.indexOf("#");
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : "";
  if (/(?:\?|&)classic=(?:1|true|yes|on)(?:&|$)/i.test(beforeHash)) return raw;
  const separator = beforeHash.includes("?") ? "&" : "?";
  return `${beforeHash}${separator}classic=1${hash}`;
}

function isActive(activePath, href) {
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

function ClassicIcon({ name }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    home: <><path d="M3 11l9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-6h6v6"/></>,
    "book-open": <><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    award: <><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    tool: <><path d="M14.7 6.3a4 4 0 0 0-5-5L7.4 3.6l3 3 2.3-2.3a4 4 0 0 0 2 5"/><path d="M5 13L2 16l6 6 3-3"/><path d="M12 12l8.6 8.6"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    "shopping-cart": <><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></>,
    archive: <><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></>,
    "user-plus": <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></>,
    package: <><path d="M16.5 9.4L7.5 4.2"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
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

export default function AppShell({
  account,
  children,
  title = "Home",
  eyebrow = "Incremental frontend migration",
  activePath = "/next/home",
  classicHrefOverride = "",
  lmsAccess = null,
  bodyClass = "",
  classicStyles = [],
}) {
  const allowedPages = Array.isArray(account?.allowedPages) ? account.allowedPages : [];
  const visibleLinks = MODULE_LINKS.filter((link) => canSee(link, allowedPages));
  const activeLink = MODULE_LINKS.find((link) => isActive(activePath, link.href));
  const classicHref = withClassicFlag(classicHrefOverride || activeLink?.classicHref || "/home");
  const initials = String(account?.name || account?.username || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
  const inLmsWorkspace = isActive(activePath, "/next/lms");
  const effectiveLmsAccess = lmsAccess || account?.lmsAccess || null;
  const permittedLmsLinks = visibleLmsLinks(effectiveLmsAccess);
  const lmsLinks = inLmsWorkspace
    ? permittedLmsLinks
    : permittedLmsLinks.filter((link) => !link.alwaysVisible);
  const showLmsSubmenu = lmsLinks.length > 0;

  // Keep the existing pilot LMS shell untouched in this stage.  LMS has its own
  // Classic workspace chrome and will be parity-migrated as a dedicated stage.
  if (inLmsWorkspace) {
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <a className="brand" href="/next/home" aria-label="Operations Hub Next.js pilot home">
            <span className="brand-mark">OH</span>
            <span><strong>Operations Hub</strong><small>Next.js pilot</small></span>
          </a>
          <nav className="navigation" aria-label="Main navigation">
            <a className={`nav-link ${isActive(activePath, "/next/home") ? "active" : ""}`} href="/next/home"><span>Home</span><em>Pilot</em></a>
            {visibleLinks.map((link) => (
              <div className={`nav-entry ${link.href === "/next/lms" && showLmsSubmenu ? "nav-entry-open" : ""}`} key={link.href}>
                <a className={`nav-link ${isActive(activePath, link.href) ? "active" : ""}`} href={link.href}><span>{link.label}</span>{link.href.startsWith("/next/") ? <em>Pilot</em> : null}</a>
                {link.href === "/next/lms" && showLmsSubmenu ? (
                  <div className="nav-submenu" aria-label="LMS pages">
                    {lmsLinks.map((child) => (
                      <a className={`nav-sublink ${activePath === child.href || (isActive(activePath, child.href) && child.href !== "/next/lms") ? "active" : ""}`} href={child.href} key={child.href}>
                        <span>{child.label}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <a className={isActive(activePath, "/next/account") ? "active" : ""} href="/next/account">My account</a>
            <a className={isActive(activePath, "/next/app-install") ? "active" : ""} href="/next/app-install">Install App</a>
            <a href={classicHref}>Open current interface</a>
            <a href="/next/migration-status">Migration status</a>
          </div>
        </aside>
        <main className="main-area">
          <header className="topbar">
            <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
            <div className="topbar-actions">
              <NotificationsBell />
              <a className={`profile ${isActive(activePath, "/next/account") ? "active" : ""}`} href="/next/account">
                {account?.photoUrl ? <img src={account.photoUrl} alt="" /> : <span>{initials}</span>}
                <b>{account?.name || account?.username || "User"}</b>
              </a>
            </div>
          </header>
          {children}
        </main>
      </div>
    );
  }

  const classicLinks = CLASSIC_MAIN_LINKS.filter((link) => canSee(link, allowedPages));
  const combinedBodyClass = [bodyClass, "next-classic-shell-active"].filter(Boolean).join(" ");

  return (
    <>
      <link rel="stylesheet" href="/css/style.css?v=bidi-mixed-v1" />
      <link rel="stylesheet" href="/css/ui-redesign.css?v=sidebar-page-label-frame-v3" />
      <link rel="stylesheet" href="/css/page-canvas-fix.css?v=page-canvas-single-layer-v3" />
      {classicStyles.map((href) => <link rel="stylesheet" href={href} key={href} />)}
      <BodyClassSync className={combinedBodyClass} />
      <ClassicSidebarBootstrap />
      <ClassicSidebarViewportKeeper />

      <div className="app-container classic-app-shell">
        <aside className="sidebar">
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
                  <a className={`nav-link ${isActive(activePath, link.href) ? "active" : ""}`} href={link.href} title={link.label} aria-label={link.label}>
                    <ClassicIcon name={link.icon} />
                    <span className="nav-label">{link.label}</span>
                  </a>
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
                <div className="dash-title">{title}</div>
                <div className="searchbar" role="search">
                  <ClassicIcon name="search" />
                  <input type="search" placeholder="Search" aria-label={`Search in ${title}`} />
                </div>
              </div>
              <div className="right topbar-right">
                <NotificationsBell classic />
                <UserProfileMenu account={account} />
              </div>
            </div>
            <div className="header-row2"><h1 className="page-title">{title}</h1></div>
          </header>

          <main className="container-full-width next-classic-page-content">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

const MODULE_LINKS = [
  { label: "LMS", href: "/next/lms", classicHref: "/lms", permissions: [], alwaysVisible: true },
  { label: "Current Orders", href: "/next/orders", classicHref: "/orders", permissions: ["Current Orders"] },
  { label: "Orders Review", href: "/next/orders-review", classicHref: "/orders/sv-orders", permissions: ["Orders Review"] },
  { label: "Operations Orders", href: "/next/operations-orders", classicHref: "/orders/requested", permissions: ["Requested Orders", "Operations Orders"] },
  { label: "Maintenance Orders", href: "/next/maintenance-orders", classicHref: "/orders/maintenance-orders", permissions: ["Maintenance Orders"] },
  { label: "Stocktaking", href: "/next/stocktaking", classicHref: "/stocktaking", permissions: ["Stocktaking"] },
  { label: "Events", href: "/next/events", classicHref: "/events", permissions: ["Event Requests"] },
  { label: "Event Calendar", href: "/next/events-calendar", classicHref: "/events/calendar", permissions: ["Event Calendar"] },
  { label: "Event Components", href: "/next/event-components", classicHref: "/events/components", permissions: ["Event Components"] },
  { label: "Products", href: "/next/products", classicHref: "/products", permissions: ["Products"] },
  { label: "Task Management", href: "/next/task-management", classicHref: "/task-management", permissions: ["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"] },
  { label: "Expenses", href: "/next/expenses", classicHref: "/expenses", permissions: ["Expenses"] },
  { label: "KPIs", href: "/next/kpis", classicHref: "/kpis", permissions: ["KPIs"] },
  { label: "Users Center", href: "/next/users-center", classicHref: "/user-access", permissions: ["Users Center", "User Access & Data", "User Access and Data", "User Access", "Team Members"] },
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
  return link.permissions.some((permission) => allowed.has(normalize(permission)));
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

function isActive(activePath, href) {
  const current = String(activePath || "").replace(/\/$/, "") || "/";
  const target = String(href || "").replace(/\/$/, "") || "/";
  return current === target || (target !== "/" && current.startsWith(`${target}/`));
}

export default function AppShell({
  account,
  children,
  title = "Home",
  eyebrow = "Incremental frontend migration",
  activePath = "/next/home",
  classicHrefOverride = "",
  lmsAccess = null,
}) {
  const allowedPages = Array.isArray(account?.allowedPages) ? account.allowedPages : [];
  const visibleLinks = MODULE_LINKS.filter((link) => canSee(link, allowedPages));
  const activeLink = MODULE_LINKS.find((link) => isActive(activePath, link.href));
  const classicHref = classicHrefOverride || activeLink?.classicHref || (activePath === "/next/home" ? "/home" : "/home");
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/next/home" aria-label="Operations Hub Next.js pilot home">
          <span className="brand-mark">OH</span>
          <span><strong>Operations Hub</strong><small>Next.js pilot</small></span>
        </a>

        <nav className="navigation" aria-label="Main navigation">
          <a className={`nav-link ${isActive(activePath, "/next/home") ? "active" : ""}`} href="/next/home">
            <span>Home</span><em>Pilot</em>
          </a>
          {visibleLinks.map((link) => (
            <div className={`nav-entry ${link.href === "/next/lms" && showLmsSubmenu ? "nav-entry-open" : ""}`} key={link.href}>
              <a className={`nav-link ${isActive(activePath, link.href) ? "active" : ""}`} href={link.href}>
                <span>{link.label}</span>
                {link.href.startsWith("/next/") ? <em>Pilot</em> : null}
              </a>
              {link.href === "/next/lms" && showLmsSubmenu ? (
                <div className="nav-submenu" aria-label="LMS pages">
                  {lmsLinks.map((child) => (
                    <a
                      className={`nav-sublink ${activePath === child.href || (!child.classic && isActive(activePath, child.href) && child.href !== "/next/lms") ? "active" : ""}`}
                      href={child.href}
                      key={child.href}
                    >
                      <span>{child.label}</span>
                      {child.classic ? <em>Classic</em> : null}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a href={classicHref}>Open current interface</a>
          <a href="/next/migration-status">Migration status</a>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <a className="profile" href="/account">
            {account?.photoUrl ? <img src={account.photoUrl} alt="" /> : <span>{initials}</span>}
            <b>{account?.name || account?.username || "User"}</b>
          </a>
        </header>
        {children}
      </main>
    </div>
  );
}

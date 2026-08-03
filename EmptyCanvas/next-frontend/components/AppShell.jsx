const MODULE_LINKS = [
  { label: "Current Orders", href: "/orders", permissions: ["Current Orders"] },
  { label: "Requested Orders", href: "/orders/requested", permissions: ["Requested Orders"] },
  { label: "Events", href: "/events", permissions: ["Event Calendar", "Event Requests", "Event Components"] },
  { label: "Products", href: "/products", permissions: ["Products"] },
  { label: "Task Management", href: "/task-management", permissions: ["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"] },
  { label: "Expenses", href: "/expenses", permissions: ["Expenses"] },
  { label: "KPIs", href: "/kpis", permissions: ["KPIs"] },
  { label: "LMS", href: "/lms", permissions: ["LMS", "lms-curriculum", "lms-users-center", "lms-b2b"] },
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function canSee(link, allowedPages) {
  const allowed = new Set((Array.isArray(allowedPages) ? allowedPages : []).map(normalize));
  if (!allowed.size) return false;
  return link.permissions.some((permission) => allowed.has(normalize(permission)));
}

export default function AppShell({ account, children, title = "Home", eyebrow = "Incremental frontend migration" }) {
  const allowedPages = Array.isArray(account?.allowedPages) ? account.allowedPages : [];
  const visibleLinks = MODULE_LINKS.filter((link) => canSee(link, allowedPages));
  const initials = String(account?.name || account?.username || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/next/home" aria-label="Operations Hub Next.js pilot home">
          <span className="brand-mark">OH</span>
          <span><strong>Operations Hub</strong><small>Next.js pilot</small></span>
        </a>

        <nav className="navigation" aria-label="Main navigation">
          <a className="nav-link active" href="/next/home"><span>Home</span><em>Pilot</em></a>
          {visibleLinks.map((link) => (
            <a className="nav-link" href={link.href} key={link.href}>{link.label}</a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a href="/home">Open current interface</a>
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

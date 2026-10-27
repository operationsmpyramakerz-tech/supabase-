// Shared navigation source of truth for the persistent shell and loading chrome.
// Keep labels, routes and permission aliases here so every page renders the same dock/sidebar.

export const MODULE_LINKS = [
  { label: "Notifications", href: "/next/notifications", permissions: [], alwaysVisible: true },
  { label: "How it works", href: "/next/how-it-works", permissions: [], alwaysVisible: true },
  { label: "My Orders", href: "/next/orders", permissions: ["Current Orders", "/orders"] },
  { label: "Orders Review", href: "/next/orders-review", permissions: ["Orders Review", "/orders-review"] },
  { label: "Operations Orders", href: "/next/operations-orders", permissions: ["Requested Orders", "Operations Orders", "/operations-orders", "/orders/requested"] },
  { label: "Maintenance Orders", href: "/next/maintenance-orders", permissions: ["Maintenance Orders", "/maintenance-orders"] },
  { label: "Shopping Cart", href: "/next/orders/new", permissions: ["Create New Order", "Shopping Cart", "Cart", "/orders/new"] },
  { label: "Stocktaking", href: "/next/stocktaking", permissions: ["Stocktaking", "/stocktaking"] },
  { label: "Events", href: "/next/events", permissions: ["Event Requests", "Events", "/events", "/events/requests"] },
  { label: "New Event Request", href: "/next/events/new", permissions: ["Event Requests", "Events", "/events", "/events/requests"] },
  { label: "Event Calendar", href: "/next/events-calendar", permissions: ["Event Calendar", "Events", "/events/calendar"] },
  { label: "Event Components", href: "/next/event-components", permissions: ["Event Components", "Events", "/events/components"] },
  { label: "Event Team", href: "/next/event-team", permissions: ["Event Team", "Event Requests", "Event Calendar", "Event Components", "Events", "/events/team"] },
  { label: "Products", href: "/next/products", permissions: ["Products", "Product", "Components", "/products"] },
  { label: "Proposals", href: "/next/proposals", permissions: ["Proposals", "Products", "/proposals"] },
  { label: "Kits", href: "/next/kits", permissions: ["Kits", "Proposals", "Products", "/kits"] },
  { label: "B2C Database", href: "/next/b2c/database", permissions: ["B2C", "Customer Database", "B2C Customer Database", "/b2c/database"] },
  { label: "B2C Forms", href: "/next/b2c/forms", permissions: ["B2C", "Customer Form", "B2C Customer Form", "Customer Database", "B2C Customer Database", "/b2c/form", "/b2c/forms"] },
  { label: "Task Management", href: "/next/task-management", permissions: ["All Tasks", "My Tasks", "Delegated Tasks", "Task Management", "/task-management", "/task-management/all-tasks", "/task-management/my-tasks", "/task-management/delegated-tasks"] },
  { label: "Expenses", href: "/next/expenses", permissions: ["Expenses", "/expenses"] },
  { label: "Expenses Users", href: "/next/expenses/users", permissions: ["Expenses Users", "/expenses/users"] },
  { label: "KPIs", href: "/next/kpis", permissions: ["KPIs", "/kpis"] },
  { label: "Users Center", href: "/next/users-center", permissions: ["Users Center", "User Access & Data", "User Access and Data", "User Access", "Team Members", "/users-center"] },
  { label: "System History", href: "/next/history", permissions: ["History", "System History", "Audit History", "Audit Log", "System Audit", "/history"] },
  { label: "Database Backup", href: "/next/backup", permissions: ["Backup", "Back Up", "Database", "System Database", "System Backup", "Data Backup", "/backup"] },
];

export const CLASSIC_MAIN_LINKS = [
  { label: "Home", href: "/next/home", icon: "home", permissions: [], alwaysVisible: true, boundary: "workspace" },
  { label: "My Orders", href: "/next/orders", icon: "list", permissions: ["Current Orders", "/orders"] },
  { label: "Orders Review", href: "/next/orders-review", icon: "award", permissions: ["Orders Review", "/orders-review"] },
  { label: "Operations Orders", href: "/next/operations-orders", icon: "users", permissions: ["Requested Orders", "Operations Orders", "/operations-orders", "/orders/requested"] },
  { label: "Maintenance Orders", href: "/next/maintenance-orders", icon: "tool", permissions: ["Maintenance Orders", "/maintenance-orders"] },
  { label: "Events", href: "/next/events", icon: "calendar", permissions: ["Event Requests", "Event Calendar", "Event Components", "Event Team", "Events", "/events", "/events/requests", "/events/calendar", "/events/components", "/events/team"] },
  { label: "Shopping Cart", href: "/next/orders/new", icon: "shopping-cart", permissions: ["Create New Order", "Shopping Cart", "Cart", "/orders/new"] },
  { label: "Stocktaking", href: "/next/stocktaking", icon: "archive", permissions: ["Stocktaking", "/stocktaking"] },
  { label: "B2C", href: "/next/b2c", icon: "user-plus", permissions: ["B2C", "Customer Database", "B2C Customer Database", "Customer Form", "B2C Customer Form", "/b2c/database", "/b2c/form", "/b2c/forms"] },
  { label: "Products", href: "/next/products", icon: "package", permissions: ["Products", "Product", "Components", "/products"] },
  { label: "Kits", href: "/next/kits", icon: "briefcase", permissions: ["Kits", "Proposals", "Products", "/kits"] },
  { label: "Proposals", href: "/next/proposals", icon: "file-text", permissions: ["Proposals", "Products", "/proposals"] },
  { label: "Expenses", href: "/next/expenses", icon: "dollar-sign", permissions: ["Expenses", "/expenses"] },
  { label: "Expenses by Users", href: "/next/expenses/users", icon: "credit-card", permissions: ["Expenses Users", "/expenses/users"] },
  { label: "Task Management", href: "/next/task-management", icon: "git-branch", permissions: ["All Tasks", "My Tasks", "Delegated Tasks", "Task Management", "/task-management", "/task-management/all-tasks", "/task-management/my-tasks", "/task-management/delegated-tasks"] },
  { label: "KPIs", href: "/next/kpis", icon: "bar-chart-2", permissions: ["KPIs", "/kpis"] },
  { label: "Users Center", href: "/next/users-center", icon: "shield", permissions: ["Users Center", "User Access & Data", "User Access and Data", "User Access", "Team Members", "/users-center"], boundary: "users" },
];

export function normalizeNavigationPermission(value) {
  return String(value || "").trim().toLowerCase();
}

export function canSeeNavigationLink(link, allowedPages) {
  if (link?.alwaysVisible) return true;
  const allowed = new Set((Array.isArray(allowedPages) ? allowedPages : []).map(normalizeNavigationPermission));
  if (!allowed.size) return false;
  return (link?.permissions || []).some((permission) => allowed.has(normalizeNavigationPermission(permission)));
}

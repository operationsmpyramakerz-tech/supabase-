// Map a Page Access entry to its enforced Advanced Permissions module.
// Never infer authorization from a category like "Orders" or "Operations":
// unmatched pages keep legacy Base Access only.
const PAGE_MODULES = Object.freeze({
  home: "home", dashboard: "home",
  currentorders: "orders.my", myorders: "orders.my",
  operationsorders: "orders.operations", requestedorders: "orders.operations", schoolsrequestedorders: "orders.operations",
  maintenanceorders: "orders.maintenance", shoppingcart: "orders.shopping", createneworder: "orders.shopping",
  ordersreview: "orders.review", svorders: "orders.review",
  orderdocuments: "orders.documents",
  products: "products", kits: "kits", productkits: "kits", proposals: "proposals", productproposals: "proposals",
  projectspreparing: "preparing", preparingprojects: "preparing",
  stocktaking: "stocktaking", expenses: "expenses", expensesusers: "expenses.users", expensesbyusers: "expenses.users",
  userscenter: "users", useraccessdata: "users", useraccess: "users", teammembers: "users",
  taskmanagement: "tasks", taskmanagementalltasks: "tasks", taskmanagementmytasks: "tasks", taskmanagementdelegatedtasks: "tasks", alltasks: "tasks", mytasks: "tasks", delegatedtasks: "tasks",
  eventsrequests: "events.requests", eventrequests: "events.requests",
  eventscalendar: "events.calendar", eventcalendar: "events.calendar",
  eventscomponents: "events.components", eventcomponents: "events.components",
  eventsteam: "events.team", eventteam: "events.team",
  b2ccustomerdatabase: "b2c.database", customerdatabase: "b2c.database",
  b2ccustomerform: "b2c.forms", customerform: "b2c.forms",
  notifications: "notifications", account: "account", userprofile: "account",
  howitworks: "guide", guide: "guide", backup: "backup", database: "backup", databasebackup: "backup",
  history: "history", systemhistory: "history", kpis: "kpis", sla: "sla", slasettings: "sla",
});

export function featureModuleForPage(page = {}) {
  const candidates = [page.pageKey, page.pageName, page.routePath];
  for (const candidate of candidates) {
    const token = String(candidate || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (Object.hasOwn(PAGE_MODULES, token)) return PAGE_MODULES[token];
    // Only strip the fixed app route prefix. Never guess a module by substring.
    if (token.startsWith("next") && Object.hasOwn(PAGE_MODULES, token.slice(4))) return PAGE_MODULES[token.slice(4)];
  }
  return null;
}

import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { DashboardNotice, QuickActionsCard, RecentOrdersCard, ScopeCard } from "../../components/home/DashboardCards";
import HomeOverviewClient from "../../components/home/HomeOverviewClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function allowedSet(account = {}) {
  return new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map((value) => lower(value)));
}
function hasAccess(account, aliases = []) {
  const allowed = allowedSet(account);
  return aliases.some((alias) => allowed.has(lower(alias)));
}
function quickActions(account) {
  const actions = [{ href: "/next/home", icon: "activity", title: "Refresh dashboard", sub: "Quick overview of your work" }];
  if (hasAccess(account, ["Create New Order", "Shopping Cart", "/orders/new"])) actions.push({ href: "/next/orders/new", icon: "plus-circle", title: "Create new order", sub: "Start a new components request" });
  if (hasAccess(account, ["Current Orders", "/orders"])) actions.push({ href: "/next/orders", icon: "list", title: "Current orders", sub: "Track your recent requests" });
  if (hasAccess(account, ["Requested Orders", "Operations Orders", "/orders/requested"])) actions.push({ href: "/next/operations-orders", icon: "users", title: "Operations orders", sub: "Review schools requested orders" });
  if (hasAccess(account, ["Stocktaking", "/stocktaking"])) actions.push({ href: "/next/stocktaking", icon: "archive", title: "Stocktaking", sub: "View your school inventory" });
  if (hasAccess(account, ["Expenses", "/expenses"])) actions.push({ href: "/next/expenses", icon: "dollar-sign", title: "Expenses", sub: "Your cash in/out records" });
  actions.push({ href: "/next/account", icon: "user", title: "Account", sub: "Profile & permissions" });
  return actions;
}
function resourceMap(bundle) {
  const map = new Map();
  for (const resource of Array.isArray(bundle?.resources) ? bundle.resources : []) map.set(resource.url, resource.body);
  return map;
}
function getResource(map, prefix, fallback) {
  for (const [url, body] of map.entries()) if (url === prefix || url.startsWith(prefix)) return body;
  return fallback;
}

export default async function HomePage({ searchParams }) {
  const params = await Promise.resolve(searchParams || {});
  const requestedUserId = text(Array.isArray(params?.analysisUser) ? params.analysisUser[0] : params?.analysisUser) || "all";
  const requestedDuration = text(Array.isArray(params?.analysisDuration) ? params.analysisDuration[0] : params?.analysisDuration) || "all";
  const duration = ["all", "week", "month", "year"].includes(requestedDuration) ? requestedDuration : "all";

  const query = new URLSearchParams({ scope: "home" });
  if (requestedUserId !== "all") query.set("analysisUser", requestedUserId);
  if (duration !== "all") query.set("analysisDuration", duration);

  const response = await fetchLegacyJson(`/api/page-bootstrap?${query.toString()}`, { timeoutMs: 20000 });
  if (response.status === 401 || response.status === 403) redirect("/login?next=/next/home");
  if (!response.ok || !response.data?.ok) {
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The new Home could not load</h1><p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p><a className="primary-button" href="/next/home">Try again</a></section></main>;
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  if (!account) redirect("/login?next=/next/home");

  const overview = getResource(resources, "/api/home/overview", null);
  if (!overview) {
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The Home overview could not load</h1><p>Please try again.</p><a className="primary-button" href="/next/home">Try again</a></section></main>;
  }

  const actions = quickActions(account);
  const selectedAnalysisUsers = overview.selectedUser ? [overview.selectedUser] : [];

  return (
    <AppShell
      account={account}
      title="Home"
      activePath="/next/home"
      bodyClass="page-home"
      pageStyles={["/next/css/home.css?v=home-overview-summary-v2"]}
    >
      <DashboardNotice omitted={response.data.omitted || []} />

      <HomeOverviewClient
        analysisUsers={selectedAnalysisUsers}
        analysisUsersReady={false}
        selectedUser={overview.selectedUserId || requestedUserId}
        selectedDuration={overview.selectedDuration || duration}
        currentMatrix={overview.currentMatrix}
        reviewMatrix={overview.reviewMatrix}
        operationsMatrix={overview.operationsMatrix}
        maintenanceSummary={overview.maintenanceSummary}
        stockTagSummaries={overview.stockTagSummaries}
        stockTags={overview.stockTags}
        expenseSummary={overview.expenseSummary}
        showCurrent={overview.showCurrent}
        showReview={overview.showReview}
        showOperations={overview.showOperations}
        showMaintenance={overview.showMaintenance}
        showStock={overview.showStock}
        showExpenses={overview.showExpenses}
      />

      <section aria-label="Details" className="home-grid">
        {overview.showCurrent ? <RecentOrdersCard orders={overview.recentOrders || []} totalGroups={overview.currentTotalGroups || 0} /> : null}
        <QuickActionsCard actions={actions} />
        <ScopeCard account={account} />
      </section>
    </AppShell>
  );
}

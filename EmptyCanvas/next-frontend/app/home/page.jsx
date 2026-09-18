import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { DashboardNotice, QuickActionsCard, RecentOrdersCard, ScopeCard } from "../../components/home/DashboardCards";
import HomeOverviewClient from "../../components/home/HomeOverviewClient";
import { fetchLegacyJson } from "../../lib/legacy-api";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { loadHomeOverviewDirect } from "../../lib/home-overview-data";

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

function HomeUnavailable({ message }) {
  return (
    <main className="standalone-state">
      <section className="state-card">
        <span className="status-dot warning" />
        <h1>The new Home could not load</h1>
        <p>{message}</p>
        <a className="primary-button" href="/next/home">Try again</a>
      </section>
    </main>
  );
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

async function legacyHomeBootstrap(requestedUserId, duration) {
  const query = new URLSearchParams({ scope: "home" });
  if (requestedUserId !== "all") query.set("analysisUser", requestedUserId);
  if (duration !== "all") query.set("analysisDuration", duration);
  return await fetchLegacyJson(`/api/page-bootstrap?${query.toString()}`, { timeoutMs: 20000 });
}

export default async function HomePage({ searchParams }) {
  const params = await Promise.resolve(searchParams || {});
  const requestedUserId = text(Array.isArray(params?.analysisUser) ? params.analysisUser[0] : params?.analysisUser) || "all";
  const requestedDuration = text(Array.isArray(params?.analysisDuration) ? params.analysisDuration[0] : params?.analysisDuration) || "all";
  const duration = ["all", "week", "month", "year"].includes(requestedDuration) ? requestedDuration : "all";

  // Fast path: resolve the signed-in account directly in Next, then load the
  // dashboard datasets from Supabase in parallel. Home no longer waits for the
  // monolithic Express page-bootstrap request before it can render.
  const gate = await getLegacyAccountGate([]);

  if (gate.status === 401) redirect("/login?next=/next/home");

  let account = gate.ok ? gate.account : null;
  let overview = null;
  let bootstrapWarnings = [];

  if (account) {
    overview = await loadHomeOverviewDirect({
      account,
      requestedUserId,
      duration,
    }).catch(() => null);
  }

  // Compatibility fallback only. The normal Home path never waits for the
  // legacy page-bootstrap bundle; it is kept here so a customized/older
  // Supabase schema cannot make the dashboard unavailable.
  if (!account || !overview) {
    const fallback = await legacyHomeBootstrap(requestedUserId, duration);
    if (fallback.status === 401 || fallback.status === 403) {
      redirect("/login?next=/next/home");
    }

    if (fallback.ok && fallback.data?.ok) {
      const resources = resourceMap(fallback.data);
      if (!account) account = getResource(resources, "/api/account", null);
      if (!overview) overview = getResource(resources, "/api/home/overview", null);
      bootstrapWarnings = fallback.data.omitted || [];
    }

    if (!account || !overview) {
      return <HomeUnavailable message={fallback.error || fallback.data?.error || gate.error || "The current ERP API is temporarily unavailable."} />;
    }
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
      <DashboardNotice omitted={bootstrapWarnings} />

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

import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { DashboardNotice, ExpensesCard, OrdersCard, QuickActionsCard, RecentOrdersCard, ScopeCard, StockCard } from "../../components/home/DashboardCards";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function text(value) { return String(value ?? "").trim(); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function lower(value) { return text(value).toLowerCase(); }
function rowCost(row = {}) {
  const quantity = number(row.quantity ?? row.qty ?? row.requestedQuantity ?? row.requested_quantity ?? 1);
  const unit = number(row.unitPrice ?? row.unit_price ?? row.unityPrice ?? row.price ?? row.cost);
  const explicit = number(row.totalCost ?? row.total_cost ?? row.total ?? row.amount);
  return explicit || quantity * unit;
}
function rowDate(row = {}) { return text(row.createdAt ?? row.created_at ?? row.date ?? row.requestDate ?? row.request_date); }
function groupKey(row = {}, index = 0) {
  const direct = text(row.orderId ?? row.order_id ?? row.requestId ?? row.request_id ?? row.orderCode ?? row.order_code ?? row.code);
  if (direct) return direct;
  const date = rowDate(row).slice(0, 16);
  const owner = text(row.requestedBy ?? row.requested_by ?? row.userName ?? row.username ?? row.createdBy);
  return `${date}|${owner}|${index}`;
}
function groupRows(rows = []) {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = groupKey(row, index);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return [...map.values()].map((items) => ({ items, cost: items.reduce((sum, item) => sum + rowCost(item), 0) }));
}
function bucketCurrent(group) {
  const statuses = group.items.map((item) => lower(item.status ?? item.orderStatus ?? item.order_status));
  if (statuses.some((status) => status.includes("reject") || status.includes("cancel"))) return "rejected";
  if (statuses.length && statuses.every((status) => status.includes("complete") || status.includes("deliver") || status.includes("done"))) return "completed";
  return "progress";
}
function bucketReview(group) {
  const statuses = group.items.map((item) => lower(item.approval ?? item.svApproval ?? item.sv_approval ?? item.status));
  if (statuses.some((status) => status.includes("reject"))) return "rejected";
  if (statuses.length && statuses.every((status) => status.includes("approve"))) return "approved";
  return "pending";
}
function bucketOperations(group) {
  const statuses = group.items.map((item) => lower(item.status));
  if (statuses.some((status) => status.includes("deliver") || status.includes("complete"))) return "delivered";
  if (statuses.some((status) => status.includes("receive") || status.includes("prepare") || status.includes("ship"))) return "received";
  return "pending";
}
function bucketMaintenance(group) {
  const statuses = group.items.map((item) => lower(item.status));
  const hasWork = group.items.some((item) => text(item.repairAction ?? item.repair_action ?? item.resolutionMethod ?? item.resolution_method));
  if (statuses.some((status) => status.includes("deliver") || status.includes("complete") || status.includes("done"))) return "completed";
  if (hasWork || statuses.some((status) => status.includes("progress") || status.includes("repair") || status.includes("receive"))) return "progress";
  return "pending";
}
function summarizeGroups(rows, definitions, bucketFn, filterFn = () => true) {
  const groups = groupRows((Array.isArray(rows) ? rows : []).filter(filterFn));
  const buckets = definitions.map((definition) => ({ ...definition, count: 0, cost: 0 }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  groups.forEach((group) => {
    const bucket = byKey.get(bucketFn(group)) || buckets[0];
    bucket.count += 1;
    bucket.cost += group.cost;
  });
  return { total: groups.length, totalCost: groups.reduce((sum, group) => sum + group.cost, 0), buckets };
}
function stockSummary(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
    const quantity = number(row.quantity ?? row.qty);
    summary.quantity += quantity;
    summary.cost += quantity * number(row.unitPrice ?? row.unit_price ?? row.unityPrice ?? row.price);
    summary.records += 1;
    return summary;
  }, { quantity: 0, cost: 0, records: 0 });
}
function expensesSummary(payload = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const year = new Date().getFullYear();
  const values = Array(12).fill(0);
  items.forEach((item) => {
    const date = new Date(item.date ?? item.createdAt ?? item.created_at ?? "");
    if (Number.isNaN(date.getTime()) || date.getFullYear() !== year) return;
    // Classic Home visualizes monthly cash-out totals in this chart.
    values[date.getMonth()] += number(item.cashOut ?? item.cash_out);
  });
  const currentMonth = new Date().getMonth();
  return { year, currentMonth, months: MONTHS.map((label, index) => ({ label, value: values[index] })) };
}
function allowedSet(account = {}) {
  return new Set((Array.isArray(account?.allowedPages) ? account.allowedPages : []).map((value) => lower(value)));
}
function hasAccess(account, aliases = []) {
  const allowed = allowedSet(account);
  return aliases.some((alias) => allowed.has(lower(alias)));
}
function formatDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function recentOrders(rows = []) {
  const groups = groupRows(rows).map((group, index) => {
    const first = group.items[0] || {};
    const created = rowDate(first);
    const statusKey = bucketCurrent(group);
    const status = statusKey === "completed" ? "Completed" : statusKey === "rejected" ? "Rejected" : "In progress";
    const tone = statusKey === "completed" ? "success" : statusKey === "rejected" ? "danger" : "info";
    return {
      key: `${groupKey(first, index)}-${index}`,
      title: text(first.reason ?? first.orderReason ?? first.order_reason ?? first.productName ?? first.product_name) || "Order",
      itemCount: group.items.length,
      status,
      tone,
      date: formatDate(created),
      createdTs: new Date(created || 0).getTime() || 0,
      total: group.cost,
      href: "/next/orders",
    };
  });
  return groups.sort((a, b) => b.createdTs - a.createdTs).slice(0, 5);
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

export default async function HomePage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=home", { timeoutMs: 25000 });
  if (response.status === 401 || response.status === 403) redirect("/login?next=/next/home");
  if (!response.ok || !response.data?.ok) {
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The new Home could not load</h1><p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p><a className="primary-button" href="/home?classic=1">Open classic Home</a></section></main>;
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  if (!account) redirect("/login?next=/next/home");
  const currentRows = getResource(resources, "/api/orders", []);
  const requestedRows = getResource(resources, "/api/orders/requested", []);
  const reviewPayload = getResource(resources, "/api/sv-orders", []);
  const reviewRows = Array.isArray(reviewPayload) ? reviewPayload : (Array.isArray(reviewPayload?.items) ? reviewPayload.items : []);
  const stockRows = getResource(resources, "/api/stock", []);
  const expensePayload = getResource(resources, "/api/expenses", { items: [] });

  const current = summarizeGroups(currentRows, [
    { key: "progress", label: "In progress", color: "#f97316" },
    { key: "completed", label: "Completed", color: "#168455" },
    { key: "rejected", label: "Rejected", color: "#dc2626" },
  ], bucketCurrent);
  const review = summarizeGroups(reviewRows, [
    { key: "pending", label: "Pending", color: "#f97316" },
    { key: "approved", label: "Approved", color: "#168455" },
    { key: "rejected", label: "Rejected", color: "#dc2626" },
  ], bucketReview);
  const operations = summarizeGroups(requestedRows, [
    { key: "pending", label: "Pending", color: "#f97316" },
    { key: "received", label: "Received", color: "#101828" },
    { key: "delivered", label: "Delivered", color: "#168455" },
  ], bucketOperations, (row) => !lower(row.orderType ?? row.order_type ?? row.type).includes("maintenance"));
  const maintenance = summarizeGroups(requestedRows, [
    { key: "pending", label: "Pending", color: "#f97316" },
    { key: "progress", label: "In progress", color: "#18223a" },
    { key: "completed", label: "Completed", color: "#168455" },
  ], bucketMaintenance, (row) => lower(row.orderType ?? row.order_type ?? row.type).includes("maintenance"));

  const recent = recentOrders(currentRows);
  const actions = quickActions(account);
  const showCurrent = hasAccess(account, ["Current Orders", "/orders"]);
  const showReview = hasAccess(account, ["Orders Review", "/orders/sv-orders"]);
  const showOperations = hasAccess(account, ["Requested Orders", "Operations Orders", "/orders/requested"]);
  const showMaintenance = hasAccess(account, ["Maintenance Orders", "/orders/maintenance-orders"]);
  const showStock = hasAccess(account, ["Stocktaking", "/stocktaking"]);
  const showExpenses = hasAccess(account, ["Expenses", "/expenses"]);

  return (
    <AppShell
      account={account}
      title="Home"
      activePath="/next/home"
      bodyClass="page-home"
      classicStyles={["/css/home.css?v=home-expenses-dark-card-v1"]}
    >
      <DashboardNotice omitted={response.data.omitted || []} />

      <section aria-label="Overview" className="card home-card home-card--hero">
        <div className="home-section-head">
          <h2 className="home-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            Overview
          </h2>
          <div className="home-global-analysis">
            <button className="home-global-analysis__trigger" type="button" aria-expanded="false" title="User/duration filters will be enabled in the behavior-parity stage">
              <span className="home-global-analysis__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg></span>
              <strong>Analysis</strong>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          </div>
        </div>

        <div className="stats home-kpis">
          {showCurrent ? <OrdersCard title="Current orders" href="/next/orders" variant="current" {...current} /> : null}
          {showReview ? <OrdersCard title="Orders review" href="/next/orders-review" variant="review" {...review} /> : null}
          {showOperations ? <OrdersCard title="Operations orders" href="/next/operations-orders" variant="operations" {...operations} /> : null}
          {showMaintenance ? <OrdersCard title="Maintenance orders" href="/next/maintenance-orders" variant="maintenance" {...maintenance} /> : null}
          {showStock ? <StockCard summary={stockSummary(stockRows)} /> : null}
          {showExpenses ? <ExpensesCard summary={expensesSummary(expensePayload)} /> : null}
        </div>
      </section>

      <section aria-label="Details" className="home-grid">
        {showCurrent ? <RecentOrdersCard orders={recent} totalGroups={current.total} /> : null}
        <QuickActionsCard actions={actions} />
        <ScopeCard account={account} />
      </section>
    </AppShell>
  );
}

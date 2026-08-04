import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { DashboardNotice, ExpensesCard, OrdersCard, StockCard } from "../../components/home/DashboardCards";
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
    values[date.getMonth()] += number(item.cashIn ?? item.cash_in) - number(item.cashOut ?? item.cash_out);
  });
  const currentMonth = new Date().getMonth();
  return { year, currentMonthBalance: values[currentMonth], months: MONTHS.map((label, index) => ({ label, value: values[index] })) };
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
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The new Home could not load</h1><p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p><a className="primary-button" href="/home">Open classic Home</a></section></main>;
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

  return (
    <AppShell account={account} title="Home" eyebrow="Live ERP overview" activePath="/next/home">
      <DashboardNotice omitted={response.data.omitted || []} />
      <section className="dashboard-overview">
        <div className="dashboard-title-row"><div><span className="overview-icon">⌁</span><h2>Overview</h2></div><a href="/home">Classic Home</a></div>
        <div className="dashboard-orders-grid">
          <OrdersCard title="Current orders" href="/next/orders" {...current} />
          <OrdersCard title="Orders review" href="/next/orders-review" {...review} />
          <OrdersCard title="Operations orders" href="/next/operations-orders" {...operations} />
          <OrdersCard title="Maintenance orders" href="/orders/maintenance-orders" {...maintenance} />
        </div>
        <div className="dashboard-lower-grid">
          <StockCard summary={stockSummary(stockRows)} />
          <ExpensesCard summary={expensesSummary(expensePayload)} />
        </div>
      </section>
    </AppShell>
  );
}

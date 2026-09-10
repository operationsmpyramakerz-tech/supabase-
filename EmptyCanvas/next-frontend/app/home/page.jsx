import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import { DashboardNotice, QuickActionsCard, RecentOrdersCard, ScopeCard } from "../../components/home/DashboardCards";
import HomeOverviewClient from "../../components/home/HomeOverviewClient";
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

const TYPE_ANALYSIS_DEFINITIONS = [
  { key: "request", label: "Request", color: "#176b3a" },
  { key: "withdrawal", label: "Withdrawal", color: "#dc2626" },
  { key: "maintenance", label: "Maintenance", color: "#eab308" },
];

function optionText(value) {
  if (Array.isArray(value)) return value.map(optionText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return text(value.name ?? value.label ?? value.title ?? value.value);
  return text(value);
}

function orderTypeBucket(group = {}) {
  const rows = Array.isArray(group.items) ? group.items : [];
  const candidates = [
    group.orderType,
    group.order_type,
    group.type,
    ...rows.flatMap((row) => [row.orderType, row.order_type, row.type, row.requestType, row.request_type]),
  ];
  for (const candidate of candidates) {
    const key = lower(optionText(candidate)).replace(/[^a-z0-9]+/g, "");
    if (!key) continue;
    if (/(withdraw|withdrawal)/.test(key)) return "withdrawal";
    if (/(maintenance|requestmaintenance)/.test(key)) return "maintenance";
    if (/(request|delivery|product)/.test(key)) return "request";
  }
  return "request";
}

function groupCreatedDate(group = {}) {
  const dates = (Array.isArray(group.items) ? group.items : [])
    .map((row) => new Date(rowDate(row) || 0))
    .filter((date) => Number.isFinite(date.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function filterGroupsByTime(groups = [], range = "all") {
  const source = Array.isArray(groups) ? groups : [];
  if (range === "all") return source;
  const now = new Date();
  const from = new Date(now);
  if (range === "week") from.setDate(from.getDate() - 7);
  else if (range === "month") from.setMonth(from.getMonth() - 1);
  else if (range === "year") from.setFullYear(from.getFullYear() - 1);
  else return source;
  return source.filter((group) => {
    const date = groupCreatedDate(group);
    return date && date >= from && date <= now;
  });
}

function itemOwnerValues(item = {}) {
  return [
    item.createdById, item.createdByName, item.teamMemberId, item.teamMemberName,
    item.userId, item.userName, item.username, item.requestedBy, item.ownerName,
    item.createdBy, item.requesterName,
  ].flatMap((value) => Array.isArray(value) ? value : [value]).map(lower).filter(Boolean);
}

function groupMatchesUser(group, user) {
  if (!user) return true;
  const targets = [user.id, user.name, user.username, user.email, user.employeeCode].map(lower).filter(Boolean);
  if (!targets.length) return true;
  return (Array.isArray(group?.items) ? group.items : []).some((item) => {
    const owners = itemOwnerValues(item);
    return targets.some((target) => owners.some((owner) => owner === target || owner.includes(target) || target.includes(owner)));
  });
}

function summarizeGroupList(groups, definitions, bucketFn) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const buckets = definitions.map((definition) => ({ ...definition, count: 0, cost: 0 }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  safeGroups.forEach((group) => {
    const bucket = byKey.get(bucketFn(group)) || buckets[0];
    bucket.count += 1;
    bucket.cost += number(group.cost);
  });
  return {
    total: safeGroups.length,
    totalCost: safeGroups.reduce((sum, group) => sum + number(group.cost), 0),
    buckets,
  };
}

function analysisMatrix(groups, statusDefinitions, statusBucketFn) {
  const result = { status: {}, type: {} };
  for (const mode of ["status", "type"]) {
    const definitions = mode === "type" ? TYPE_ANALYSIS_DEFINITIONS : statusDefinitions;
    const bucketFn = mode === "type" ? orderTypeBucket : statusBucketFn;
    for (const range of ["all", "week", "month", "year"]) {
      result[mode][range] = summarizeGroupList(filterGroupsByTime(groups, range), definitions, bucketFn);
    }
  }
  return result;
}

function filterItemsByDuration(items = [], duration = "all") {
  const source = Array.isArray(items) ? items : [];
  if (duration === "all") return source;
  const now = new Date();
  const from = new Date(now);
  if (duration === "week") from.setDate(from.getDate() - 7);
  else if (duration === "month") from.setMonth(from.getMonth() - 1);
  else if (duration === "year") from.setFullYear(from.getFullYear() - 1);
  else return source;
  return source.filter((item) => {
    const date = new Date(item.date ?? item.createdAt ?? item.created_at ?? 0);
    return Number.isFinite(date.getTime()) && date >= from && date <= now;
  });
}

function stockTagName(item = {}) {
  return text(item?.tag?.name ?? item?.tag) || "Untagged";
}

function stockTagAnalysis(rows = []) {
  const source = Array.isArray(rows) ? rows : [];
  const tags = Array.from(new Set(source.map(stockTagName).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const summaries = { all: stockSummary(source) };
  tags.forEach((tag) => { summaries[tag] = stockSummary(source.filter((row) => stockTagName(row) === tag)); });
  return { tags, summaries };
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

export default async function HomePage({ searchParams }) {
  const params = await Promise.resolve(searchParams || {});
  const requestedUserId = text(Array.isArray(params?.analysisUser) ? params.analysisUser[0] : params?.analysisUser) || "all";
  const requestedDuration = text(Array.isArray(params?.analysisDuration) ? params.analysisDuration[0] : params?.analysisDuration) || "all";
  const globalDuration = ["all", "week", "month", "year"].includes(requestedDuration) ? requestedDuration : "all";

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
  const defaultStockRows = getResource(resources, "/api/stock", []);
  const defaultExpensePayload = getResource(resources, "/api/expenses", { items: [] });

  const showCurrent = hasAccess(account, ["Current Orders", "/orders"]);
  const showReview = hasAccess(account, ["Orders Review", "/orders/sv-orders"]);
  const showOperations = hasAccess(account, ["Requested Orders", "Operations Orders", "/orders/requested"]);
  const showMaintenance = hasAccess(account, ["Maintenance Orders", "/orders/maintenance-orders"]);
  const showStock = hasAccess(account, ["Stocktaking", "/stocktaking"]);
  const showExpenses = hasAccess(account, ["Expenses", "/expenses"]);

  let analysisUsers = [];
  if (requestedUserId !== "all") {
    const analysisUsersResponse = await fetchLegacyJson("/api/home/analysis-users", { timeoutMs: 12000 });
    analysisUsers = analysisUsersResponse.ok && Array.isArray(analysisUsersResponse.data?.users)
      ? analysisUsersResponse.data.users
      : [];
  }
  const selectedUser = requestedUserId === "all"
    ? null
    : (analysisUsers.find((user) => String(user.id) === String(requestedUserId)) || { id: requestedUserId });

  let stockRows = Array.isArray(defaultStockRows) ? defaultStockRows : [];
  let expensePayload = defaultExpensePayload && typeof defaultExpensePayload === "object" ? defaultExpensePayload : { items: [] };
  if (selectedUser) {
    const [stockResponse, expenseResponse] = await Promise.all([
      showStock ? fetchLegacyJson(`/api/home/stocktaking-users/${encodeURIComponent(requestedUserId)}`, { timeoutMs: 15000 }) : Promise.resolve(null),
      showExpenses ? fetchLegacyJson(`/api/home/analysis-users/${encodeURIComponent(requestedUserId)}/expenses`, { timeoutMs: 15000 }) : Promise.resolve(null),
    ]);
    stockRows = stockResponse?.ok && Array.isArray(stockResponse.data?.items) ? stockResponse.data.items : [];
    expensePayload = expenseResponse?.ok && Array.isArray(expenseResponse.data?.items) ? { items: expenseResponse.data.items } : { items: [] };
  }

  const applyGlobalFilters = (groups) => filterGroupsByTime(
    (Array.isArray(groups) ? groups : []).filter((group) => groupMatchesUser(group, selectedUser)),
    globalDuration,
  );

  const currentGroups = applyGlobalFilters(groupRows(Array.isArray(currentRows) ? currentRows : []));
  const reviewGroups = applyGlobalFilters(groupRows(reviewRows));
  const requestedGroups = groupRows(Array.isArray(requestedRows) ? requestedRows : []);
  const operationsGroups = applyGlobalFilters(requestedGroups.filter((group) => orderTypeBucket(group) !== "maintenance"));
  const maintenanceGroups = applyGlobalFilters(requestedGroups.filter((group) => orderTypeBucket(group) === "maintenance"));

  const currentStatusDefinitions = [
    { key: "progress", label: "In progress", color: "#f97316" },
    { key: "completed", label: "Completed", color: "#168455" },
    { key: "rejected", label: "Rejected", color: "#dc2626" },
  ];
  const reviewStatusDefinitions = [
    { key: "pending", label: "Pending", color: "#f97316" },
    { key: "approved", label: "Approved", color: "#168455" },
    { key: "rejected", label: "Rejected", color: "#dc2626" },
  ];
  const operationsStatusDefinitions = [
    { key: "pending", label: "Pending", color: "#f97316" },
    { key: "received", label: "Received", color: "#101828" },
    { key: "delivered", label: "Delivered", color: "#168455" },
  ];
  const maintenanceStatusDefinitions = [
    { key: "pending", label: "Pending", color: "#f97316" },
    { key: "progress", label: "In progress", color: "#18223a" },
    { key: "completed", label: "Completed", color: "#168455" },
  ];

  const currentMatrix = analysisMatrix(currentGroups, currentStatusDefinitions, bucketCurrent);
  const reviewMatrix = analysisMatrix(reviewGroups, reviewStatusDefinitions, bucketReview);
  const operationsMatrix = analysisMatrix(operationsGroups, operationsStatusDefinitions, bucketOperations);
  const maintenanceSummary = summarizeGroupList(maintenanceGroups, maintenanceStatusDefinitions, bucketMaintenance);
  const stockAnalysis = stockTagAnalysis(stockRows);
  const filteredExpenseItems = filterItemsByDuration(Array.isArray(expensePayload?.items) ? expensePayload.items : [], globalDuration);
  const homeExpenseSummary = expensesSummary({ items: filteredExpenseItems });

  const current = currentMatrix.status.all;
  const recent = recentOrders(currentRows);
  const actions = quickActions(account);
  return (
    <AppShell
      account={account}
      title="Home"
      activePath="/next/home"
      bodyClass="page-home"
      classicStyles={["/css/home.css?v=home-expenses-dark-card-v1"]}
    >
      <DashboardNotice omitted={response.data.omitted || []} />

      <HomeOverviewClient
        analysisUsers={analysisUsers}
        selectedUser={requestedUserId}
        selectedDuration={globalDuration}
        currentMatrix={currentMatrix}
        reviewMatrix={reviewMatrix}
        operationsMatrix={operationsMatrix}
        maintenanceSummary={maintenanceSummary}
        stockTagSummaries={stockAnalysis.summaries}
        stockTags={stockAnalysis.tags}
        expenseSummary={homeExpenseSummary}
        showCurrent={showCurrent}
        showReview={showReview}
        showOperations={showOperations}
        showMaintenance={showMaintenance}
        showStock={showStock}
        showExpenses={showExpenses}
      />

      <section aria-label="Details" className="home-grid">
        {showCurrent ? <RecentOrdersCard orders={recent} totalGroups={current.total} /> : null}
        <QuickActionsCard actions={actions} />
        <ScopeCard account={account} />
      </section>
    </AppShell>
  );
}

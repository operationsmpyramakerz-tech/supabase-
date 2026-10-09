export function notificationText(value) {
  return String(value ?? "").trim();
}

export function notificationTimestamp(value) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(notificationText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function notificationTimeAgo(value) {
  const ts = notificationTimestamp(value);
  if (!ts) return "Unknown time";
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 30) return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export function notificationDateTime(value) {
  const ts = notificationTimestamp(value);
  if (!ts) return "Unknown time";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function notificationScope(value) {
  const ts = notificationTimestamp(value);
  if (!ts) return "earlier";
  const date = new Date(ts);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const startWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday).getTime();
  if (date.getTime() >= startToday) return "today";
  if (date.getTime() >= startWeek) return "week";
  return "earlier";
}

export function notificationTone(item = {}) {
  const haystack = `${notificationText(item.type)} ${notificationText(item.title)}`.toLowerCase();
  if (haystack.includes("maintenance") || haystack.includes("repair")) return { key: "maintenance", label: "MT" };
  if (haystack.includes("expense") || haystack.includes("cash") || haystack.includes("payment")) return { key: "expense", label: "$" };
  if (haystack.includes("stock") || haystack.includes("inventory")) return { key: "stock", label: "ST" };
  if (haystack.includes("order") || haystack.includes("request")) return { key: "order", label: "OR" };
  if (haystack.includes("task") || haystack.includes("project")) return { key: "task", label: "TK" };
  if (haystack.includes("event")) return { key: "event", label: "EV" };
  if (haystack.includes("test")) return { key: "test", label: "TS" };
  return { key: "general", label: "NT" };
}

const NEXT_ROUTE_MAP = [
  ["/how-it-works", "/next/how-it-works"],
  ["/orders/maintenance-orders", "/next/maintenance-orders"],
  ["/orders/order-receipt-viewer", "/next/orders/receipt-viewer"],
  ["/orders/sv-orders", "/next/orders-review"],
  ["/orders/requested", "/next/operations-orders"],
  ["/orders/new", "/next/orders/new"],
  ["/events/new", "/next/events/new"],
  ["/events/components", "/next/event-components"],
  ["/events/calendar", "/next/events-calendar"],
  ["/expenses/users", "/next/expenses/users"],
  ["/b2c/database", "/next/b2c/database"],
  ["/b2c/form", "/next/b2c/forms"],
  ["/task-management", "/next/task-management"],
  ["/stocktaking", "/next/stocktaking"],
  ["/proposals", "/next/proposals"],
  ["/products", "/next/products"],
  ["/expenses", "/next/expenses"],
  ["/events", "/next/events"],
  ["/history", "/next/history"],
  ["/backup", "/next/backup"],
  ["/user-access", "/next/users-center"],
  ["/kpis", "/next/kpis"],
  ["/kits", "/next/kits"],
  ["/orders", "/next/orders"],
  ["/dashboard", "/next/home"],
  ["/home", "/next/home"],
];

export function modernNotificationUrl(value) {
  const raw = notificationText(value);
  if (!raw) return "";
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://operations.local";
    const parsed = new URL(raw, origin);
    // Stored notifications can originate from mutable ERP data. Navigation must
    // never execute javascript:/data: URLs or forward a user to an external
    // domain supplied by a notification payload (phishing/open redirect).
    if (!(["http:", "https:"].includes(parsed.protocol)) || parsed.origin !== origin) return "";
    if (parsed.pathname.startsWith("/next/")) return `${parsed.pathname}${parsed.search}${parsed.hash}`;

    for (const [legacy, next] of NEXT_ROUTE_MAP) {
      if (parsed.pathname === legacy || parsed.pathname.startsWith(`${legacy}/`)) {
        const suffix = parsed.pathname.slice(legacy.length);
        return `${next}${suffix}${parsed.search}${parsed.hash}`;
      }
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}

export function notificationMatches(item, query) {
  const clean = notificationText(query).toLowerCase();
  if (!clean) return true;
  const haystack = [item?.title, item?.body, item?.type, item?.url]
    .map(notificationText)
    .join(" ")
    .toLowerCase();
  return haystack.includes(clean);
}

// Display grouping never deletes the underlying event or changes its read state.
// Without an explicit entity reference, actionable orders/tasks/maintenance MUST
// remain distinct: two different tasks can have identical titles and statuses.
const GROUP_WINDOW_MS = 45 * 60 * 1000;
const ENTITY_REF_PATTERN = /\b(?:TKT|ORD|MNT|MTN|REQ)[-\s]?\d{3,}\b/i;

function groupingIdentity(item) {
  const type = notificationText(item.type).toLowerCase();
  if (type === "test" || type === "system" && /test/i.test(notificationText(item.title))) return "";
  const category = notificationTone(item).key;
  const content = `${notificationText(item.title)} ${notificationText(item.body)}`;
  const explicitRef = content.match(ENTITY_REF_PATTERN)?.[0]?.replace(/\s+/g, "-").toUpperCase();
  if (explicitRef) return `${category}:ref:${explicitRef}`;

  // A URL only identifies a record when it contains a record-specific parameter.
  // Generic URLs (/next/orders, /next/task-management/...) are NOT identities.
  try {
    const url = new URL(notificationText(item.url), "https://operations.local");
    if (url.origin === "https://operations.local") {
      const id = ["taskId", "orderId", "eventId", "maintenanceId", "recordId", "id"]
        .map(key => url.searchParams.get(key)).find(value => value && /^[\w-]{3,100}$/.test(value));
      if (id && ["task", "order", "maintenance", "event"].includes(category)) {
        return `${category}:record:${id}`;
      }
    }
  } catch { /* Invalid/missing URL: do not infer a record identity. */ }

  if (["task", "order", "maintenance", "event", "expense", "test"].includes(category)) return "";
  return [category, type, notificationText(item.title).toLowerCase(),
    notificationText(item.body).toLowerCase(), notificationText(item.url)].join("\u001f");
}

export function groupNotificationRows(items, enabled = true) {
  const rows = Array.isArray(items) ? items : [];
  if (!enabled) return rows.map(item => ({ id: String(item.id), items: [item] }));
  const groups = [];
  const mostRecent = new Map();
  for (const item of rows) {
    const ts = notificationTimestamp(item.ts);
    const key = groupingIdentity(item);
    const candidate = key ? mostRecent.get(key) : null;
    // Compare with the latest message in the group, not merely the previous
    // sibling, so a sequence cannot stretch a group across an entire day.
    if (candidate && ts && candidate.latestTs &&
        Math.abs(candidate.latestTs - ts) <= GROUP_WINDOW_MS) {
      candidate.items.push(item);
      continue;
    }
    const group = { id: String(item.id), items: [item], latestTs: ts };
    groups.push(group);
    if (key) mostRecent.set(key, group);
  }
  return groups;
}

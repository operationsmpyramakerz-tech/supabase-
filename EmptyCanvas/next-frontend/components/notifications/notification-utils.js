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
  ["/lms/user-access", "/next/lms/users-center"],
  ["/lms/curriculum", "/next/lms/curriculum"],
  ["/lms/b2b", "/next/lms/schools"],
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
  ["/lms", "/next/lms"],
  ["/dashboard", "/next/home"],
  ["/home", "/next/home"],
];

export function modernNotificationUrl(value) {
  const raw = notificationText(value);
  if (!raw) return "";
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://operations.local";
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin && origin !== "https://operations.local") return parsed.href;
    if (parsed.pathname.startsWith("/next/")) return `${parsed.pathname}${parsed.search}${parsed.hash}`;

    for (const [legacy, next] of NEXT_ROUTE_MAP) {
      if (parsed.pathname === legacy || parsed.pathname.startsWith(`${legacy}/`)) {
        const suffix = parsed.pathname.slice(legacy.length);
        return `${next}${suffix}${parsed.search}${parsed.hash}`;
      }
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return raw;
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

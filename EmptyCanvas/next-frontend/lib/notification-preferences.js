import "server-only";

import { select, supabaseRequest } from "./supabase-rest";

// These are defaults, not enforced policies. Every member can disable every channel.
export const NOTIFICATION_CATEGORIES = [
  { id: "orders", label: "Orders", detail: "Requests, approvals and shipping" },
  { id: "tasks", label: "Tasks", detail: "Assignments, changes and deadlines" },
  { id: "maintenance", label: "Maintenance", detail: "Technician assignments and work logs" },
  { id: "events", label: "Events", detail: "Team and event updates" },
  { id: "expenses", label: "Expenses", detail: "Expense changes and approvals" },
  { id: "stock", label: "Stocktaking", detail: "Stock and inventory activity" },
  { id: "system", label: "System", detail: "Account and operational alerts" },
  { id: "other", label: "Other", detail: "Other ERP notifications" },
];

const CHANNELS = ["in_app", "push", "email"];
const DEFAULT_CHANNELS = {
  orders: { in_app: true, push: true, email: false },
  tasks: { in_app: true, push: true, email: true },
  maintenance: { in_app: true, push: true, email: true },
  events: { in_app: true, push: true, email: false },
  expenses: { in_app: true, push: false, email: false },
  stock: { in_app: true, push: false, email: false },
  system: { in_app: true, push: true, email: true },
  other: { in_app: true, push: false, email: false },
};

export function defaultNotificationPreferences() {
  return {
    channels: structuredClone(DEFAULT_CHANNELS),
    digest: "daily",
    quiet_hours: { enabled: false, start: "21:00", end: "08:00", timezone: "Africa/Cairo" },
  };
}

function validTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimezone(value) {
  if (typeof value !== "string" || value.length > 80) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

export function normalizeNotificationPreferences(input = {}) {
  const defaults = defaultNotificationPreferences();
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const channels = {};
  for (const category of NOTIFICATION_CATEGORIES) {
    const values = source.channels?.[category.id];
    channels[category.id] = {};
    for (const channel of CHANNELS) {
      channels[category.id][channel] = typeof values?.[channel] === "boolean"
        ? values[channel] : defaults.channels[category.id][channel];
    }
  }
  const quiet = source.quiet_hours || {};
  const digest = ["off", "daily", "weekly"].includes(source.digest) ? source.digest : defaults.digest;
  return {
    channels,
    digest,
    quiet_hours: {
      enabled: typeof quiet.enabled === "boolean" ? quiet.enabled : defaults.quiet_hours.enabled,
      start: validTime(quiet.start) ? quiet.start : defaults.quiet_hours.start,
      end: validTime(quiet.end) ? quiet.end : defaults.quiet_hours.end,
      timezone: validTimezone(quiet.timezone) ? quiet.timezone : defaults.quiet_hours.timezone,
    },
  };
}

function table() {
  return String(process.env.SUPABASE_NOTIFICATION_PREFERENCES_TABLE || "notification_preferences").trim();
}

export function notificationCategory(type = "") {
  const raw = String(type || "").trim().toLowerCase();
  if (["order", "orders", "request", "shopping", "purchase"].includes(raw)) return "orders";
  if (["task", "tasks", "deadline"].includes(raw)) return "tasks";
  if (["maintenance", "repair", "technician"].includes(raw)) return "maintenance";
  if (["event", "events", "event-team"].includes(raw)) return "events";
  if (["expense", "expenses", "cash"].includes(raw)) return "expenses";
  if (["stock", "stocktaking", "inventory"].includes(raw)) return "stock";
  if (["system", "security", "account", "test"].includes(raw)) return "system";
  return "other";
}

export function allowsChannel(preferences, type, channel) {
  if (!CHANNELS.includes(channel)) return false;
  const category = notificationCategory(type);
  const prefs = normalizeNotificationPreferences(preferences);
  return prefs.channels[category][channel] === true;
}

export function isQuietHour(preferences, now = new Date()) {
  const { quiet_hours: quiet } = normalizeNotificationPreferences(preferences);
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: quiet.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(now);
    const current = formatted.slice(0, 5);
    return quiet.start < quiet.end
      ? current >= quiet.start && current < quiet.end
      : current >= quiet.start || current < quiet.end;
  } catch { return false; }
}

export async function getNotificationPreferences(memberId) {
  const id = String(memberId || "").trim();
  if (!id) throw Object.assign(new Error("Authentication required."), { status: 401 });
  const rows = await select(table(), {
    select: "user_id,settings,updated_at", user_id: `eq.${id}`, limit: "1",
  }, { profileName: "notifications.preferences.read" });
  return { settings: normalizeNotificationPreferences(rows?.[0]?.settings), updatedAt: rows?.[0]?.updated_at || null };
}

export async function saveNotificationPreferences(memberId, input) {
  const id = String(memberId || "").trim();
  if (!id) throw Object.assign(new Error("Authentication required."), { status: 401 });
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("Invalid preference settings."), { status: 400 });
  }
  const settings = normalizeNotificationPreferences(input);
  const now = new Date().toISOString();
  await supabaseRequest(`/${encodeURIComponent(table())}?on_conflict=user_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { user_id: id, settings, updated_at: now },
    profileName: "notifications.preferences.save",
  });
  return { settings, updatedAt: now };
}

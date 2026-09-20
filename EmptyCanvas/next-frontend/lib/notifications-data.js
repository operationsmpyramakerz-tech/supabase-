import "server-only";

import { select, supabaseRequest, updateById } from "./supabase-rest";

const NOTIFICATION_CACHE_TTL_MS = 5_000;
const NOTIFICATION_CACHE_MAX = 200;
const listCache = new Map();
const listInflight = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off"].includes(raw)) return false;
  return fallback;
}

function notificationTable() {
  return text(process.env.SUPABASE_NOTIFICATIONS_TABLE) || "notifications";
}

function timestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function itemFromRow(row = {}) {
  const id = text(row.notification_id || row.notif_id || row.id);
  if (!id) return null;
  return {
    id,
    type: text(row.type || row.notification_type) || "update",
    title: text(row.title) || "Update",
    body: text(row.body || row.message || row.description),
    url: text(row.url || row.target_url) || "/home",
    ts: timestamp(row.ts ?? row.timestamp_ms ?? row.created_ms ?? row.created_at),
    read: bool(row.read ?? row.is_read, false),
  };
}

function safeLimit(value, fallback = 25) {
  return Math.max(1, Math.min(80, Number(value) || fallback));
}

function cacheKey(memberId, limit) {
  return `${text(memberId)}:${safeLimit(limit)}`;
}

function invalidate(memberId) {
  const prefix = `${text(memberId)}:`;
  for (const key of listCache.keys()) {
    if (key.startsWith(prefix)) listCache.delete(key);
  }
  for (const key of listInflight.keys()) {
    if (key.startsWith(prefix)) listInflight.delete(key);
  }
}

function setCache(key, value) {
  if (listCache.size >= NOTIFICATION_CACHE_MAX) {
    const oldest = listCache.keys().next().value;
    if (oldest) listCache.delete(oldest);
  }
  listCache.set(key, { value, expiresAt: Date.now() + NOTIFICATION_CACHE_TTL_MS });
}

export async function notificationsForMember(memberId, { limit = 25, fresh = false } = {}) {
  const id = text(memberId);
  if (!id) {
    const error = new Error("Notification user is not available.");
    error.status = 404;
    throw error;
  }

  const cleanLimit = safeLimit(limit);
  const key = cacheKey(id, cleanLimit);
  if (!fresh) {
    const cached = listCache.get(key);
    if (cached?.expiresAt > Date.now()) return cached.value;
    if (listInflight.has(key)) return await listInflight.get(key);
  }

  // Read a slightly wider window so the unread badge remains consistent with
  // the legacy endpoint while only returning the requested visible slice.
  const pending = select(notificationTable(), {
    select: "id,notification_id,type,title,body,url,read,ts,created_at",
    user_id: `eq.${id}`,
    order: "ts.desc",
    limit: "200",
  }, { profileName: "notifications.list" }).then((rows) => {
    const allItems = (Array.isArray(rows) ? rows : [])
      .map(itemFromRow)
      .filter(Boolean)
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    return {
      success: true,
      source: "supabase",
      items: allItems.slice(0, cleanLimit),
      unreadCount: allItems.reduce((count, item) => count + (!item.read ? 1 : 0), 0),
    };
  });

  if (!fresh) listInflight.set(key, pending);
  try {
    const value = await pending;
    setCache(key, value);
    return value;
  } finally {
    if (listInflight.get(key) === pending) listInflight.delete(key);
  }
}

export async function markNotificationReadForMember(memberId, notificationId) {
  const id = text(memberId);
  const notifId = text(notificationId);
  if (!id || !notifId) {
    const error = new Error(!notifId ? "Missing notification id." : "Notification user is not available.");
    error.status = !notifId ? 400 : 404;
    throw error;
  }

  const rows = await select(notificationTable(), {
    select: "id,notification_id,read",
    user_id: `eq.${id}`,
    notification_id: `eq.${notifId}`,
    limit: "1",
  }, { profileName: "notifications.lookup" });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) return { success: true, changed: false };
  if (!bool(row.read, false)) {
    await updateById(notificationTable(), row.id, { read: true, updated_at: new Date().toISOString() });
  }
  invalidate(id);
  return { success: true, changed: !bool(row.read, false) };
}

export async function markAllNotificationsReadForMember(memberId) {
  const id = text(memberId);
  if (!id) {
    const error = new Error("Notification user is not available.");
    error.status = 404;
    throw error;
  }

  const table = encodeURIComponent(notificationTable());
  const filter = encodeURIComponent(id);
  const rows = await supabaseRequest(`/${table}?user_id=eq.${filter}&read=eq.false`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: { read: true, updated_at: new Date().toISOString() },
    profileName: "notifications.mark-all-read",
  });
  invalidate(id);
  return { success: true, changed: Array.isArray(rows) ? rows.length : 0 };
}

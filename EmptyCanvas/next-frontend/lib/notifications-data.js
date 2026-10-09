import "server-only";

import crypto from "node:crypto";
import { select, selectAll, supabaseRequest, updateById } from "./supabase-rest";
import { sendPushToMember } from "./push-notifications";
import { sendNotificationEmail } from "./notification-email";
import { allowsChannel, defaultNotificationPreferences, getNotificationPreferences, isQuietHour } from "./notification-preferences";

const NOTIFICATION_CACHE_TTL_MS = 5_000;
const NOTIFICATION_CACHE_MAX = 200;
const NOTIFICATION_AUTOSCAN_INTERVAL_MS = Math.max(
  5_000,
  Math.min(120_000, Number(process.env.NOTIFICATIONS_AUTOSCAN_INTERVAL_MS || 10_000) || 10_000),
);
const NOTIFICATION_LASTCHECK_KEY = "notif:next:lastCheck:v1";
const NOTIFICATION_AUTOSCAN_KEY = "notif:next:autoScan:v1";

const listCache = new Map();
const listInflight = new Map();
let scanInflight = null;

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return text(value.name || value.value || value.label || value.title || value.email || value.url || "");
  }
  return String(value).replace(/\u00a0/g, " ").trim();
}

function canonical(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function valueFor(row = {}, aliases = []) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  const wanted = new Set(aliases.map(canonical).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(canonical(key))) return value;
  }
  return null;
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function splitValues(value) {
  if (Array.isArray(value)) return value.flatMap(splitValues).filter(Boolean);
  if (value && typeof value === "object") {
    const nested = value.values || value.items || value.options || value.pages;
    if (Array.isArray(nested)) return nested.flatMap(splitValues).filter(Boolean);
    const single = text(value);
    return single ? [single] : [];
  }
  const raw = text(value);
  if (!raw) return [];
  if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
    try {
      return splitValues(JSON.parse(raw));
    } catch {}
  }
  return raw.split(/[\n,;|]+/).map((item) => item.trim()).filter(Boolean);
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).flatMap(splitValues).map((value) => text(value)).filter(Boolean))];
}

function notificationTable() {
  return text(process.env.SUPABASE_NOTIFICATIONS_TABLE) || "notifications";
}

function notificationStateTable() {
  return text(process.env.SUPABASE_NOTIFICATION_STATE_TABLE) || "notification_state";
}

function teamMembersTable() {
  return text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members";
}

function expensesTable() {
  return text(process.env.SUPABASE_EXPENSES_TABLE) || "expenses";
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function stocktakingTable() {
  return text(process.env.SUPABASE_STOCKTAKING_TABLE) || "stocktaking";
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

function rowUpdatedAt(row = {}) {
  const raw = valueFor(row, [
    "updated_at",
    "updated time",
    "Updated time",
    "last_edited_time",
    "notion_last_edited_time",
    "created_at",
    "created time",
    "Created time",
    "notion_created_time",
  ]);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(text(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function notificationRowId(memberId, notificationId) {
  const user = encodeURIComponent(text(memberId) || "-");
  const notif = encodeURIComponent(text(notificationId) || crypto.randomUUID());
  return `${user}:${notif}`.slice(0, 240);
}

async function notificationStateGet(key) {
  const cleanKey = text(key);
  if (!cleanKey) return null;
  try {
    const rows = await select(notificationStateTable(), {
      select: "key,value,updated_at",
      key: `eq.${cleanKey}`,
      limit: "1",
    }, { profileName: "notifications.state-get" });
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? (row.value ?? row.data ?? row.payload ?? null) : null;
  } catch {
    return null;
  }
}

async function notificationStateSet(key, value) {
  const cleanKey = text(key);
  if (!cleanKey) return;
  const now = new Date().toISOString();
  try {
    const existing = await select(notificationStateTable(), {
      select: "key",
      key: `eq.${cleanKey}`,
      limit: "1",
    }, { profileName: "notifications.state-lookup" });
    const row = { key: cleanKey, value: value || {}, updated_at: now };
    if (Array.isArray(existing) && existing.length) {
      await supabaseRequest(`/${encodeURIComponent(notificationStateTable())}?key=eq.${encodeURIComponent(cleanKey)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: row,
        profileName: "notifications.state-update",
      });
    } else {
      await supabaseRequest(`/${encodeURIComponent(notificationStateTable())}`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: row,
        profileName: "notifications.state-create",
      });
    }
  } catch {
    // Notification state is only an optimization. Stable notification ids keep
    // a scan safe even when the optional state table is temporarily unavailable.
  }
}

async function rowsEditedSince(table, afterIso, { limit = 3000 } = {}) {
  const safe = Math.max(1, Math.min(5000, Number(limit) || 3000));
  const cutoff = Date.parse(text(afterIso)) || 0;
  try {
    const rows = await select(table, {
      select: "*",
      updated_at: `gt.${afterIso}`,
      order: "updated_at.desc",
      limit: String(safe),
    }, { profileName: `notifications.scan.${table}` });
    return (Array.isArray(rows) ? rows : []).filter((row) => rowUpdatedAt(row) > cutoff);
  } catch (fastError) {
    try {
      const rows = await selectAll(table, { limit: safe, order: "updated_at.desc", profileName: `notifications.scan-fallback.${table}` });
      return rows.filter((row) => rowUpdatedAt(row) > cutoff);
    } catch {
      try {
        const rows = await selectAll(table, { limit: safe, order: "id.desc", profileName: `notifications.scan-id-fallback.${table}` });
        return rows.filter((row) => rowUpdatedAt(row) > cutoff);
      } catch {
        throw fastError;
      }
    }
  }
}

async function notificationUsers() {
  const [members, pages, accessRows] = await Promise.all([
    selectAll(teamMembersTable(), {
      limit: 5000,
      order: "id.asc",
      select: "id,name,department,allowed_pages",
      profileName: "notifications.scan.members-compact",
    }).catch(() => selectAll(teamMembersTable(), {
      limit: 5000,
      order: "id.asc",
      profileName: "notifications.scan.members-fallback",
    }).catch(() => [])),
    selectAll("app_pages", {
      limit: 1000,
      order: "sort_order.asc",
      select: "id,page_name,page_key,route_path,sort_order",
      profileName: "notifications.scan.pages-compact",
    }).catch(() => selectAll("app_pages", {
      limit: 1000,
      order: "sort_order.asc",
      profileName: "notifications.scan.pages-fallback",
    }).catch(() => [])),
    selectAll("team_member_page_access", {
      limit: 5000,
      order: "team_member_id.asc",
      select: "team_member_id,page_id,is_enabled,access_level",
      profileName: "notifications.scan.access-compact",
    }).catch(() => selectAll("team_member_page_access", {
      limit: 5000,
      order: "team_member_id.asc",
      profileName: "notifications.scan.access-fallback",
    }).catch(() => [])),
  ]);

  const pagesById = new Map();
  for (const page of pages || []) {
    const id = text(valueFor(page, ["id", "page_id"]));
    if (!id) continue;
    pagesById.set(id, text(valueFor(page, ["page_name", "name", "page_key", "route_path"])));
  }

  const accessByMember = new Map();
  for (const access of accessRows || []) {
    if (!bool(valueFor(access, ["is_enabled", "enabled"]), false)) continue;
    const memberId = text(valueFor(access, ["team_member_id", "member_id", "user_id"]));
    const pageId = text(valueFor(access, ["page_id"]));
    if (!memberId) continue;
    const pageName = pagesById.get(pageId) || text(valueFor(access, ["page_name", "page_key", "route_path"]));
    if (!pageName) continue;
    if (!accessByMember.has(memberId)) accessByMember.set(memberId, []);
    accessByMember.get(memberId).push(pageName);
  }

  return (members || []).map((row) => {
    const id = text(valueFor(row, ["id", "ID"]));
    const name = text(valueFor(row, ["name", "Name", "username", "Username"]));
    const department = text(valueFor(row, ["department", "Department"]));
    const directAllowed = uniqueStrings(valueFor(row, ["allowed_pages", "Allowed Pages", "allowedPages"]));
    const allowedPages = uniqueStrings([...directAllowed, ...(accessByMember.get(id) || [])]);
    return { id, name, department, allowedPages };
  }).filter((user) => user.id);
}

function matchUsersByName(users = [], rawNames = []) {
  const wanted = new Set(uniqueStrings(rawNames).map(canonical).filter(Boolean));
  if (!wanted.size) return [];
  return users.filter((user) => wanted.has(canonical(user.name))).map((user) => user.id).filter(Boolean);
}

function canSeeAnyPage(user, pageNames = []) {
  const allowed = new Set((user?.allowedPages || []).map(canonical).filter(Boolean));
  return pageNames.some((page) => allowed.has(canonical(page)));
}

// Defaults are used while the migration is rolling out, without blocking older notifications.
// Once a user saves preferences, their choices are read from Supabase on the server.
const settingsCache = new Map();
async function settingsForMember(memberId) {
  const key = text(memberId);
  const cached = settingsCache.get(key);
  if (cached?.expires > Date.now()) return cached.value;
  const value = await getNotificationPreferences(key).then((row) => row.settings).catch(() => defaultNotificationPreferences());
  if (settingsCache.size > 250) settingsCache.clear();
  settingsCache.set(key, { value, expires: Date.now() + 1_000 });
  return value;
}

export async function saveNotificationForMember(memberId, notif = {}) {
  const userId = text(memberId);
  const notificationId = text(notif.id);
  if (!userId || !notificationId) return false;
  const settings = await settingsForMember(userId);
  if (!allowsChannel(settings, notif.type, "in_app")) return false;

  const existing = await select(notificationTable(), {
    select: "id,notification_id,read",
    user_id: `eq.${userId}`,
    notification_id: `eq.${notificationId}`,
    limit: "1",
  }, { profileName: "notifications.save-lookup" }).catch(() => []);
  const row = Array.isArray(existing) ? existing[0] : null;
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    notification_id: notificationId,
    type: text(notif.type) || "update",
    title: text(notif.title) || "Update",
    body: text(notif.body),
    url: text(notif.url) || "/home",
    ts: Number(notif.ts) || Date.now(),
    read: row ? bool(row.read, false) : bool(notif.read, false),
    payload: notif && typeof notif === "object" ? notif : {},
    updated_at: nowIso,
  };

  if (row?.id) {
    await updateById(notificationTable(), row.id, payload);
  } else {
    const stableId = notificationRowId(userId, notificationId);
    try {
      await supabaseRequest(`/${encodeURIComponent(notificationTable())}`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: {
          id: stableId,
          ...payload,
          created_at: nowIso,
        },
        profileName: "notifications.save-insert",
      });
    } catch (error) {
      // Two serverless refreshes can race after a cold start. If another one
      // inserted the same stable row first, patch it instead of failing the scan.
      if (Number(error?.status) !== 409 && !/duplicate|unique/i.test(String(error?.message || ""))) throw error;
      await updateById(notificationTable(), stableId, payload);
    }
  }
  invalidate(userId);
  return true;
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

export async function addTestNotificationForMember(memberId) {
  const id = text(memberId);
  if (!id) {
    const error = new Error("Notification user is not available.");
    error.status = 404;
    throw error;
  }
  const notif = {
    id: `test_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
    type: "test",
    title: "Test notification",
    body: "This is a test notification from the server ✅",
    url: "/next/home",
    ts: Date.now(),
    read: false,
  };
  const preferences = await settingsForMember(id);
  const saved = await saveNotificationForMember(id, notif);
  const push = allowsChannel(preferences, "test", "push") && !isQuietHour(preferences)
    ? await sendPushToMember(id, { title: notif.title, body: notif.body, url: notif.url }).catch((error) => ({
    ok: false, sent: 0, error: error?.message || "Push delivery failed",
  })) : { ok: false, sent: 0, skipped: true, reason: "disabled-by-user-or-quiet-hours" };
  let email = { ok: false, skipped: true, reason: "disabled-by-user" };
  if (allowsChannel(preferences, "test", "email")) {
    try {
      const team = await select(teamMembersTable(), { select: "id,name,email", id: `eq.${id}`, limit: "1" }, { profileName: "notifications.test.member" });
      const member = Array.isArray(team) ? team[0] : null;
      email = await sendNotificationEmail({
        to: member?.email, name: member?.name, id: `${id}-${notif.id}`,
        title: notif.title, body: notif.body, url: "/next/notifications", category: "System",
      });
    } catch { email = { ok: false, reason: "member-email-unavailable" }; }
  }
  return { success: true, notif: saved ? notif : null, inAppSaved: saved, push, email };
}

export async function runNotificationsScan({ force = false } = {}) {
  if (!force) {
    const lastAuto = (await notificationStateGet(NOTIFICATION_AUTOSCAN_KEY)) || {};
    const lastAutoTs = Number(lastAuto?.ts || 0);
    if (lastAutoTs && Date.now() - lastAutoTs < NOTIFICATION_AUTOSCAN_INTERVAL_MS) {
      return { ok: true, skipped: true, reason: "throttled" };
    }
  }

  if (scanInflight) return await scanInflight;

  scanInflight = (async () => {
    const now = new Date();
    const nowIso = now.toISOString();
    const lastState = (await notificationStateGet(NOTIFICATION_LASTCHECK_KEY)) || {};
    const lastIso = text(lastState?.iso) || new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const users = await notificationUsers().catch(() => []);
    const notified = new Set();
    const perUser = new Map();
    const bump = (memberId, type, amount = 1) => {
      const id = text(memberId);
      if (!id) return;
      const counts = perUser.get(id) || { expenses: 0, orders: 0, stock: 0, other: 0 };
      if (Object.prototype.hasOwnProperty.call(counts, type)) counts[type] += amount;
      else counts.other += amount;
      perUser.set(id, counts);
    };

    let expensesChanged = [];
    try {
      expensesChanged = await rowsEditedSince(expensesTable(), lastIso, { limit: 3000 });
      for (const row of expensesChanged) {
        const rowId = text(valueFor(row, ["id", "ID"]));
        const reason = text(valueFor(row, ["reason", "Reason", "description", "Description", "title", "Title"])) || "Expense updated";
        const userIds = uniqueStrings(valueFor(row, [
          "team_member_id", "team_member_ids", "member_id", "member_ids", "user_id", "user_ids",
          "Team Member ID", "Team Member IDs", "User ID", "User IDs",
        ]));
        const userNames = uniqueStrings(valueFor(row, [
          "team_member", "team_member_name", "team_member_names", "member", "member_name", "payment_by",
          "Payment By", "Team Member", "Team Member Name",
        ]));
        const targetIds = uniqueStrings([...userIds, ...matchUsersByName(users, userNames)]);
        const ts = rowUpdatedAt(row) || Date.now();
        for (const userId of targetIds) {
          await saveNotificationForMember(userId, {
            id: `exp:sb:${rowId || canonical(reason)}:${ts}`,
            type: "expense",
            title: "Expense updated",
            body: reason,
            url: "/next/expenses",
            ts,
            read: false,
          });
          notified.add(userId);
          bump(userId, "expenses");
        }
      }
    } catch {
      expensesChanged = [];
    }

    // Phase-2 queue replaces generic order broadcasts. A missing migration
    // keeps the legacy scan available until the new event table is installed.
    const eventEngineReady = await select("erp_notification_events", {
      select: "id", limit: "1",
    }, { profileName: "notifications.events.enabled" }).then(() => true).catch(() => false);
    let ordersChanged = [];
    if (!eventEngineReady) {
      try {
        ordersChanged = await rowsEditedSince(ordersTable(), lastIso, { limit: 3000 });
      } catch {
        ordersChanged = [];
      }
    }
    if (!eventEngineReady && ordersChanged.length && users.length) {
      const newestTs = Math.max(...ordersChanged.map(rowUpdatedAt).filter(Boolean), Date.now());
      const orderPages = ["Current Orders", "Requested Orders", "Operations Orders", "Orders Review", "Maintenance Orders"];
      for (const user of users) {
        if (!canSeeAnyPage(user, orderPages)) continue;
        await saveNotificationForMember(user.id, {
          id: `orders:sb:${newestTs}:${encodeURIComponent(user.id)}`,
          type: "orders",
          title: "Orders updated",
          body: `${ordersChanged.length} change(s) detected`,
          url: "/next/home",
          ts: newestTs,
          read: false,
        });
        notified.add(user.id);
        bump(user.id, "orders");
      }
    }

    let stockChanged = [];
    try {
      stockChanged = await rowsEditedSince(stocktakingTable(), lastIso, { limit: 3000 });
    } catch {
      stockChanged = [];
    }
    if (stockChanged.length && users.length) {
      const newestTs = Math.max(...stockChanged.map(rowUpdatedAt).filter(Boolean), Date.now());
      for (const user of users) {
        if (!canSeeAnyPage(user, ["Stocktaking"])) continue;
        await saveNotificationForMember(user.id, {
          id: `stock:sb:${newestTs}:${encodeURIComponent(user.id)}`,
          type: "stock",
          title: "Stocktaking updated",
          body: `${stockChanged.length} change(s) detected`,
          url: "/next/stocktaking",
          ts: newestTs,
          read: false,
        });
        notified.add(user.id);
        bump(user.id, "stock");
      }
    }

    let pushUsers = 0;
    for (const [memberId, counts] of perUser.entries()) {
      const settings = await settingsForMember(memberId);
      if (isQuietHour(settings)) continue;
      const pushed = {
        expenses: counts.expenses && allowsChannel(settings, "expenses", "push") ? counts.expenses : 0,
        orders: counts.orders && allowsChannel(settings, "orders", "push") ? counts.orders : 0,
        stock: counts.stock && allowsChannel(settings, "stock", "push") ? counts.stock : 0,
        other: counts.other && allowsChannel(settings, "other", "push") ? counts.other : 0,
      };
      if (!Object.values(pushed).some(Boolean)) continue;
      const parts = [];
      if (pushed.expenses) parts.push(`${pushed.expenses} expense update(s)`);
      if (pushed.orders) parts.push(`${pushed.orders} orders update(s)`);
      if (pushed.stock) parts.push(`${pushed.stock} stock update(s)`);
      if (pushed.other) parts.push(`${pushed.other} update(s)`);
      const out = await sendPushToMember(memberId, {
        title: "Operations updates",
        body: parts.slice(0, 3).join(", ") || "New updates available",
        url: "/next/home",
      }).catch(() => ({ ok: false, sent: 0 }));
      if (out?.ok && Number(out?.sent || 0) > 0) pushUsers += 1;
    }

    await notificationStateSet(NOTIFICATION_LASTCHECK_KEY, { iso: nowIso });
    await notificationStateSet(NOTIFICATION_AUTOSCAN_KEY, { ts: Date.now(), iso: nowIso });

    return {
      ok: true,
      source: "supabase",
      lastIso,
      nowIso,
      tasksChanged: 0,
      expensesChanged: expensesChanged.length,
      ordersChanged: ordersChanged.length,
      stockChanged: stockChanged.length,
      usersNotified: notified.size,
      pushUsers,
    };
  })();

  try {
    return await scanInflight;
  } finally {
    scanInflight = null;
  }
}

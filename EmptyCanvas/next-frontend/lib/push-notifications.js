import "server-only";

import crypto from "node:crypto";
import webpush from "web-push";
import { validateVapidSettings } from "./push-vapid-config";
import { deleteById, insert, select, selectById, updateById } from "./supabase-rest";

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value).trim();
}

function subscriptionsTable() {
  return text(process.env.SUPABASE_PUSH_SUBSCRIPTIONS_TABLE) || "push_subscriptions";
}

function publicKey() {
  return text(process.env.VAPID_PUBLIC_KEY);
}

function privateKey() {
  return text(process.env.VAPID_PRIVATE_KEY);
}

function subject() {
  return text(process.env.VAPID_SUBJECT);
}

function rowId(memberId, endpoint) {
  const user = text(memberId);
  const hash = crypto.createHash("sha1").update(text(endpoint)).digest("hex");
  return `${user}:${hash}`.slice(0, 240);
}

function parseObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const raw = text(value);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function cleanPushSubscription(subscription) {
  const raw = parseObject(subscription) || subscription;
  if (!raw || typeof raw !== "object") return null;
  const endpoint = text(raw.endpoint);
  if (!endpoint) return null;
  const keys = parseObject(raw.keys) || raw.keys || {};
  const p256dh = text(keys?.p256dh);
  const auth = text(keys?.auth);
  if (!p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime: raw.expirationTime ?? raw.expiration_time ?? null,
    keys: { p256dh, auth },
  };
}

function subscriptionFromRow(row = {}) {
  const nested = parseObject(row.subscription) || parseObject(row.payload) || parseObject(row.sub);
  return cleanPushSubscription(nested || row);
}

let configuredSignature = "";
let configuredOk = false;

function configureWebPush() {
  const pub = publicKey();
  const priv = privateKey();
  const sub = subject();
  const signature = `${pub}\n${priv}\n${sub}`;
  if (configuredSignature === signature) return configuredOk;
  configuredSignature = signature;
  configuredOk = false;
  const validation = validateVapidSettings();
  if (!validation.enabled) return false;
  try {
    webpush.setVapidDetails(sub, pub, priv);
    configuredOk = true;
  } catch (error) {
    console.warn("[next-push] VAPID setup failed:", error?.message || error);
  }
  return configuredOk;
}

export function pushConfiguration() {
  const pub = publicKey();
  const validation = validateVapidSettings();
  const enabled = validation.enabled && configureWebPush();
  return {
    success: true,
    enabled,
    publicKey: enabled ? pub : "",
    code: enabled ? "ready" : validation.enabled ? "initialization-failed" : validation.code,
    message: enabled ? validation.message : validation.enabled ? "Web Push could not initialize; inspect Vercel runtime logs." : validation.message,
  };
}

export async function listPushSubscriptions(memberId) {
  const id = text(memberId);
  if (!id) return [];
  const rows = await select(subscriptionsTable(), {
    select: "*",
    user_id: `eq.${id}`,
    order: "updated_at.desc",
    limit: "20",
  }, { profileName: "push.subscriptions.list" });
  return (Array.isArray(rows) ? rows : []).map(subscriptionFromRow).filter(Boolean);
}

export async function upsertPushSubscription(memberId, subscription) {
  const id = text(memberId);
  const cleaned = cleanPushSubscription(subscription);
  if (!id) {
    const error = new Error("Push notification user is not available.");
    error.status = 404;
    throw error;
  }
  if (!cleaned) {
    const error = new Error("Invalid push subscription.");
    error.status = 400;
    throw error;
  }

  const idValue = rowId(id, cleaned.endpoint);
  const now = new Date().toISOString();
  const row = {
    id: idValue,
    user_id: id,
    endpoint: cleaned.endpoint,
    subscription: cleaned,
    expiration_time: cleaned.expirationTime || null,
    updated_at: now,
  };
  const existing = await selectById(subscriptionsTable(), idValue, { profileName: "push.subscription.lookup" }).catch(() => null);
  if (existing) await updateById(subscriptionsTable(), idValue, row);
  else await insert(subscriptionsTable(), { ...row, created_at: now });

  // An endpoint belongs to a browser installation, not permanently to a user.
  // If someone signs in with another account on a shared phone, transfer the
  // endpoint rather than accidentally notifying the previous signed-in user.
  const matches = await select(subscriptionsTable(), {
    select: "id,user_id", endpoint: `eq.${cleaned.endpoint}`, limit: "50",
  }, { profileName: "push.subscriptions.endpoint-owner" });
  for (const candidate of matches || []) {
    if (String(candidate.id) !== idValue && candidate.id) {
      await deleteById(subscriptionsTable(), candidate.id);
    }
  }
  return { success: true };
}

export async function removePushSubscription(memberId, endpoint) {
  const id = text(memberId);
  const ep = text(endpoint);
  if (!id) {
    const error = new Error("Push notification user is not available.");
    error.status = 404;
    throw error;
  }
  if (!ep) {
    const error = new Error("Missing push subscription endpoint.");
    error.status = 400;
    throw error;
  }
  await deleteById(subscriptionsTable(), rowId(id, ep)).catch(() => null);
  return { success: true };
}

export async function sendPushToMember(memberId, payload = {}) {
  const id = text(memberId);
  if (!id) return { ok: false, sent: 0, error: "User not found" };
  if (!configureWebPush()) {
    const configuration = pushConfiguration();
    return { ok: false, sent: 0, error: configuration.message, code: configuration.code };
  }

  let subscriptions = [];
  try {
    subscriptions = await listPushSubscriptions(id);
  } catch (error) {
    console.warn("[next-push] subscription load failed:", error?.message || error);
    return { ok: false, sent: 0, error: "Subscriptions unavailable" };
  }
  if (!subscriptions.length) return { ok: false, sent: 0, error: "No subscriptions" };

  const message = JSON.stringify(payload && typeof payload === "object" ? payload : {});
  let sent = 0;
  let expired = 0;
  let firstFailure = null;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, message);
      sent += 1;
    } catch (error) {
      const status = Number(error?.statusCode || error?.status) || 0;
      if (status === 404 || status === 410) {
        expired += 1;
        await removePushSubscription(id, subscription.endpoint).catch(() => undefined);
      } else {
        if (!firstFailure) firstFailure = {
          code: status === 401 || status === 403 ? "push-authorization-failed" : "push-provider-error",
          status,
        };
        console.warn("[next-push] send failed:", status || "unknown", error?.message || error);
      }
    }
  }
  return {
    ok: sent > 0,
    sent,
    expired,
    code: sent > 0 ? "ready" : expired > 0 ? "expired-subscriptions" : firstFailure?.code || "delivery-failed",
    error: sent > 0 ? "" : expired > 0
      ? "Device subscription expired. Re-enable Push on this phone."
      : firstFailure?.code === "push-authorization-failed"
        ? "Push provider rejected the subscription (401/403). Reconnect this device's Push subscription."
        : firstFailure?.status ? `Push service returned HTTP ${firstFailure.status}.` : "Push delivery failed",
  };
}

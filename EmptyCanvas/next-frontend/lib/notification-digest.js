import "server-only";
import { createHash } from "node:crypto";

import { select, supabaseRequest } from "./supabase-rest";
import { allowsChannel, getNotificationPreferences, normalizeNotificationPreferences, notificationCategory } from "./notification-preferences";
import { sendNotificationDigestEmail } from "./notification-email";
import { logNotificationDelivery } from "./notification-delivery-log";

const TABLE = "erp_notification_digest_items";
const clean = (value, length = 500) => String(value ?? "").trim().slice(0, length);
let availability = { checkedAt: 0, ready: false };

export async function digestAvailable() {
  if (Date.now() - availability.checkedAt < 30_000) return availability.ready;
  let ready = false;
  try { await select(TABLE, { select: "event_id", limit: "1" }, { profileName: "notifications.digest.available" }); ready = true; }
  catch { /* Phase 4 migration not yet applied: retain current immediate email behavior. */ }
  availability = { checkedAt: Date.now(), ready };
  return ready;
}

// Critical and actionable messages keep instant email. Less urgent categories
// are eligible for the user's chosen Daily / Weekly digest only.
export function eligibleForDigest(event, preferences) {
  const settings = normalizeNotificationPreferences(preferences);
  const category = notificationCategory(event.category);
  if (settings.digest === "off" || !allowsChannel(settings, category, "email")) return false;
  if (!["events", "expenses", "stock", "other"].includes(category)) return false;
  const message = `${clean(event.title)} ${clean(event.body)}`.toLowerCase();
  return !/urgent|critical|cancelled|canceled|cancelation|cancellation|reschedul|overdue|deadline|due today|security/.test(message);
}

export async function enqueueDigestEvent(event) {
  const item = {
    event_id: clean(event.id, 150), recipient_id: clean(event.recipient_id, 120),
    category: notificationCategory(event.category), title: clean(event.title, 200),
    body: clean(event.body, 1000), url: clean(event.url, 500),
  };
  if (!item.event_id || !item.recipient_id) throw new Error("Invalid digest event");
  await supabaseRequest(`/${TABLE}?on_conflict=event_id`, {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: item, profileName: "notifications.digest.enqueue",
  });
}

async function markItems(items, updates) {
  // Claim tokens are unique per claimed item and prevent stale workers from
  // marking a newer retry as sent. Avoid exposing the tokens in the client.
  for (const row of items) {
    await supabaseRequest(`/${TABLE}?event_id=eq.${encodeURIComponent(row.event_id)}&claim_token=eq.${encodeURIComponent(row.claim_token)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: updates,
      profileName: "notifications.digest.update",
    });
  }
}

export async function dispatchNotificationDigests() {
  if (!await digestAvailable()) return { installed: false, sent: 0, skipped: 0 };
  let rows;
  try {
    rows = await supabaseRequest("/rpc/claim_erp_notification_digest_items", {
      method: "POST", body: { p_limit: 12 }, profileName: "notifications.digest.claim",
    });
  } catch (error) {
    if (Number(error?.status) === 404 || /PGRST202|claim_erp_notification_digest_items|schema cache/i.test(clean(error?.message))) {
      return { installed: false, sent: 0, skipped: 0 };
    }
    throw error;
  }
  const byUser = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = clean(row.recipient_id, 120);
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(row);
  }
  let sent = 0, skipped = 0, deferred = 0;
  async function sendOne(id, items) {
    async function audit(itemsToLog, outcome, reason = "") {
      await Promise.all(itemsToLog.map(row => logNotificationDelivery({
        eventId: row.event_id, recipientId: id, channel: "email", outcome,
        reason, provider: "digest",
      })));
    }
    try {
      const { settings } = await getNotificationPreferences(id);
      const allowed = settings.digest !== "off" && items.filter(row => allowsChannel(settings, row.category, "email"));
      // Recheck preferences at delivery time: users can revoke consent after enqueue.
      if (!allowed || !allowed.length) {
        await markItems(items, { sent_at: new Date().toISOString(), claim_token: null, claim_until: null, last_error: null });
        await audit(items, "skipped", "preferences disabled");
        return "skipped";
      }
      const team = await select(process.env.SUPABASE_TEAM_MEMBERS_TABLE || "team_members", {
        select: "id,name,email", id: `eq.${id}`, limit: "1",
      }, { profileName: "notifications.digest.member" });
      const member = team?.[0];
      if (!member?.email) {
        await markItems(items, { sent_at: new Date().toISOString(), claim_token: null, claim_until: null, last_error: "No email address" });
        await audit(items, "skipped", "no email address");
        return "skipped";
      }
      const result = await sendNotificationDigestEmail({ to: member.email, name: member.name,
        frequency: settings.digest, items: allowed,
        id: `erp-digest-${id}-${createHash("sha256").update(allowed.map(row => row.event_id).join("|")).digest("hex").slice(0, 24)}`,
      });
      if (!result.ok) throw new Error(`Digest email not accepted: ${clean(result.reason, 80)}`);
      await markItems(items, { sent_at: new Date().toISOString(), claim_token: null, claim_until: null, last_error: null });
      await audit(allowed, "accepted");
      await audit(items.filter(row => !allowed.includes(row)), "skipped", "preferences disabled");
      return "sent";
    } catch (error) {
      // Retry after claim expiry. An SMTP timeout can be ambiguous; exactly-once
      // delivery cannot be guaranteed by Gmail SMTP.
      console.warn("[notification-digest] Delivery deferred:", clean(error?.message, 110));
      try { await markItems(items, { claim_token: null, claim_until: null, last_error: clean(error?.message, 180) }); }
      catch { /* Lease expiry will unblock the next attempt. */ }
      await audit(items, "retrying", "digest delivery failed");
      return "deferred";
    }
  }
  const batches = [...byUser.entries()];
  // Cap concurrent SMTP connections and keep the cron within its 60s budget.
  for (let offset = 0; offset < batches.length; offset += 3) {
    const outcomes = await Promise.all(batches.slice(offset, offset + 3).map(([id, items]) => sendOne(id, items)));
    for (const outcome of outcomes) {
      if (outcome === "sent") sent++;
      else if (outcome === "skipped") skipped++;
      else deferred++;
    }
  }
  return { installed: true, sent, skipped, deferred };
}

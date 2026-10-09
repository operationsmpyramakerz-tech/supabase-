import "server-only";

import { select, supabaseRequest } from "./supabase-rest";
import { getNotificationPreferences, allowsChannel, isQuietHour } from "./notification-preferences";
import { sendNotificationEmail } from "./notification-email";
import { sendPushToMember } from "./push-notifications";
import { saveNotificationForMember } from "./notifications-data";
import { digestAvailable, eligibleForDigest, enqueueDigestEvent } from "./notification-digest";
import { logNotificationDelivery } from "./notification-delivery-log";

// Event records are inserted atomically by Supabase triggers. The RPC claims
// them with row locks and a temporary lease, preventing parallel cron/route
// executions from delivering the same event at once.
const EVENTS_TABLE = "erp_notification_events";
const MAX_ATTEMPTS = 5;
const safe = (value, max = 500) => String(value ?? "").trim().slice(0, max);

export async function notificationEventEngineReady() {
  try {
    await select(EVENTS_TABLE, { select: "id", limit: "1" }, { profileName: "notifications.events.health" });
    return true;
  } catch { return false; }
}

async function claim(limit = 6) {
  return await supabaseRequest("/rpc/claim_erp_notification_events", {
    method: "POST",
    body: { p_limit: Math.max(1, Math.min(20, Number(limit) || 6)) },
    profileName: "notifications.events.claim",
  });
}

function whereLease(event) {
  const id = encodeURIComponent(safe(event.id, 200));
  const token = encodeURIComponent(safe(event.lease_token, 80));
  return `/${EVENTS_TABLE}?id=eq.${id}&lease_token=eq.${token}&status=eq.processing`;
}

async function patchClaim(event, updates) {
  await supabaseRequest(whereLease(event), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: updates,
    profileName: "notifications.events.progress",
  });
}

async function deliver(event) {
  const memberId = safe(event.recipient_id, 120);
  if (!memberId || !event.id) throw new Error("Invalid notification event recipient");
  const { settings } = await getNotificationPreferences(memberId);
  const type = safe(event.category, 40);
  const notif = {
    id: `event:${event.id}`,
    type,
    title: safe(event.title, 200) || "ERP update",
    body: safe(event.body, 1000),
    url: safe(event.url, 500) || "/next/notifications",
    ts: Date.parse(event.created_at) || Date.now(),
    read: false,
  };
  const audit = (channel, outcome, reason = "", provider = "") => logNotificationDelivery({
    eventId: event.id, recipientId: memberId, channel, outcome, reason, provider,
  });
  if (!event.in_app_done) {
    if (allowsChannel(settings, type, "in_app")) {
      try {
        await saveNotificationForMember(memberId, notif);
        await audit("in_app", "stored", "", "in-app");
      } catch (error) {
        await audit("in_app", "retrying", "Delivery could not be completed");
        throw error;
      }
    } else await audit("in_app", "skipped", "preferences disabled");
    await patchClaim(event, { in_app_done: true });
  }
  let pushRetryError = "";
  if (!event.push_done) {
    let pushCompleted = true;
    if (!allowsChannel(settings, type, "push")) {
      await audit("push", "skipped", "preferences disabled");
    } else if (isQuietHour(settings)) {
      await audit("push", "skipped", "quiet hours");
    } else {
      let pushed;
      try {
        pushed = await sendPushToMember(memberId, {
          title: notif.title, body: notif.body, url: notif.url,
          tag: `erp-${event.id}`,
        });
      } catch (error) {
        await audit("push", "retrying", "push provider error");
        pushed = { ok: false, error: "Push provider error", code: "push-provider-error" };
      }
      // No registered device is a permanent skip for this event. Provider or
      // subscription-query failures are retried later, without blocking email.
      if (!pushed.ok) {
        console.info("[notification-event] Push not accepted", safe(pushed.error, 80));
        if (!["No subscriptions"].includes(pushed.error) && !pushed.expired) {
          pushRetryError = safe(pushed.error, 100) || "Push delivery failed";
          pushCompleted = false;
          if (pushed.error !== "Push provider error") await audit("push", "retrying", pushed.code || pushed.error);
        } else {
          await audit("push", "skipped", pushed.error);
        }
      } else await audit("push", "accepted", "", "web-push");
    }
    if (pushCompleted) await patchClaim(event, { push_done: true });
  }
  if (!event.email_done) {
    if (allowsChannel(settings, type, "email") && eligibleForDigest(event, settings) && await digestAvailable()) {
      // Persist digest eligibility before marking email as complete; a retry
      // cannot lose the email or enqueue it twice (event_id is unique).
      await enqueueDigestEvent(event);
      await audit("email", "queued", "digest scheduled", "digest");
    } else if (allowsChannel(settings, type, "email")) {
      const rows = await select(process.env.SUPABASE_TEAM_MEMBERS_TABLE || "team_members", {
        select: "id,name,email", id: `eq.${memberId}`, limit: "1",
      }, { profileName: "notifications.events.recipient" });
      const member = rows?.[0];
      if (member?.email) {
        let result;
        try {
          result = await sendNotificationEmail({
            to: member.email, name: member.name,
            id: `erp-event-${event.id}-${memberId}`,
            title: notif.title, body: notif.body, url: notif.url,
            category: type.charAt(0).toUpperCase() + type.slice(1),
          });
        } catch {
          await audit("email", "retrying", "email send failed");
          throw new Error("Email provider request failed");
        }
        if (!result.ok) {
          await audit("email", "retrying", result.reason || "email send failed", result.provider);
          throw new Error(`Email not accepted: ${safe(result.reason, 100) || "delivery failed"}`);
        }
        await audit("email", "accepted", "", result.provider);
      } else {
        console.info("[notification-event] Member has no registered email");
        await audit("email", "skipped", "no email address");
      }
    } else await audit("email", "skipped", "preferences disabled");
    await patchClaim(event, { email_done: true });
  }
  if (pushRetryError) throw new Error(`Push not accepted: ${pushRetryError}`);
  await patchClaim(event, {
    status: "delivered", lease_token: null, lease_until: null,
    delivered_at: new Date().toISOString(), last_error: null,
  });
}

async function recover(event, error) {
  const attempts = Number(event.attempts || 1);
  const exhausted = attempts >= MAX_ATTEMPTS;
  const delayMinutes = Math.min(60, 2 ** attempts);
  const message = safe(error?.message || "Notification delivery error", 220);
  try {
    await patchClaim(event, {
      status: exhausted ? "failed" : "pending",
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      lease_token: null, lease_until: null, last_error: message,
    });
  } catch (updateError) {
    console.error("[notification-event] Could not release event lease", updateError?.message);
  }
  console.warn("[notification-event] Delivery deferred", message);
}

export async function dispatchQueuedNotifications({ limit = 6 } = {}) {
  let batch;
  try { batch = await claim(limit); }
  catch (error) {
    // The Phase-2 SQL must be installed first. Do not break order mutations,
    // existing notifications, or the daily cron while deploying code.
    const message = safe(error?.message || error, 200);
    if (Number(error?.status) === 404 || /claim_erp_notification_events|erp_notification_events|schema cache/i.test(message)) {
      return { ok: true, installed: false, processed: 0 };
    }
    throw error;
  }
  const events = Array.isArray(batch) ? batch : [];
  let delivered = 0;
  // Limit provider connections and complete each batch within Vercel's
  // execution budget, instead of serially sending a dozen Gmail messages.
  for (let index = 0; index < events.length; index += 3) {
    await Promise.all(events.slice(index, index + 3).map(async (event) => {
      try { await deliver(event); delivered += 1; }
      catch (error) { await recover(event, error); }
    }));
  }
  return { ok: true, installed: true, processed: events.length, delivered, deferred: events.length - delivered };
}

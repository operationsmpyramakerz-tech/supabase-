import "server-only";

import { select, supabaseRequest } from "./supabase-rest";
import { getNotificationPreferences, allowsChannel, isQuietHour } from "./notification-preferences";
import { sendNotificationEmail } from "./notification-email";
import { sendPushToMember } from "./push-notifications";
import { saveNotificationForMember } from "./notifications-data";
import { digestAvailable, eligibleForDigest, enqueueDigestEvent } from "./notification-digest";
import { logNotificationDelivery } from "./notification-delivery-log";
import { deliveryReason } from "./notification-delivery-utils";
import { canReceiveOrderReviewNotice } from "./direct-session-account";

// Event records are inserted atomically by Supabase triggers. The RPC claims
// them with row locks and a temporary lease, preventing parallel cron/route
// executions from delivering the same event at once.
const EVENTS_TABLE = "erp_notification_events";
const SUPERVISION_EVENTS_TABLE = "erp_order_supervision_notification_events";
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
  const table = event._supervisionQueue === true ? SUPERVISION_EVENTS_TABLE : EVENTS_TABLE;
  return `/${table}?id=eq.${id}&lease_token=eq.${token}&status=eq.processing`;
}

async function patchClaim(event, updates) {
  await supabaseRequest(whereLease(event), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: updates,
    profileName: "notifications.events.progress",
  });
  // Keep local channel flags in sync for correct final-failure audit records.
  Object.assign(event, updates);
}

// Keep the new queue's delivery history independent from any foreign key on
// the older event-attempt table. Audit metadata never controls delivery.
async function auditEvent(event, channel, outcome, reason = "", provider = "") {
  if (event._supervisionQueue !== true) {
    return logNotificationDelivery({ eventId: event.id, recipientId: event.recipient_id, channel, outcome, reason, provider });
  }
  const results = { ...(event.delivery_outcomes || {}), [channel]: {
    outcome, detail: deliveryReason(reason), provider, attemptedAt: new Date().toISOString(),
  } };
  try { await patchClaim(event, { delivery_outcomes: results }); }
  catch { console.warn("[notification-event] Supervision delivery audit deferred"); }
}

async function deliver(event) {
  const memberId = safe(event.recipient_id, 120);
  if (!memberId || !event.id) throw new Error("Invalid notification event recipient");
  if (event._supervisionQueue === true) {
    const current = await supabaseRequest("/rpc/erp_order_supervision_notice_current_v464", {
      method: "POST", body: { p_id: event.id, p_lease_token: event.lease_token },
      profileName: "notifications.order-supervision.current",
    });
    if (current !== true || !await canReceiveOrderReviewNotice(memberId)) {
      const skipReason = "Order no longer awaiting approval or supervisor access revoked";
      const outcomes = { ...(event.delivery_outcomes || {}) };
      for (const channel of ["in_app", "push", "email"]) if (!event[`${channel}_done`]) {
        outcomes[channel] = { outcome: "skipped", detail: skipReason, provider: "", attemptedAt: new Date().toISOString() };
      }
      await patchClaim(event, { status: "delivered", in_app_done: true, push_done: true, email_done: true,
        delivered_at: new Date().toISOString(), lease_token: null, lease_until: null,
        last_error: skipReason, delivery_outcomes: outcomes });
      return;
    }
  }
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
  // One stable tray entry for consecutive updates to the SAME referenced
  // order/task; each change still gets its own In-App record and delivery log.
  // Do not collapse generic same-title updates from different records.
  const reference = `${notif.title} ${notif.body}`.match(/\b(?:TKT|ORD|MNT|MTN|REQ)[-\s]?\d{3,}\b/i)?.[0];
  const pushTag = reference
    ? `erp-${type}-${reference.replace(/\s+/g, "-").toLowerCase()}`
    : `erp-${event.id}`;
  const audit = (channel, outcome, reason = "", provider = "") => auditEvent(event, channel, outcome, reason, provider);
  if (!event.in_app_done) {
    if (allowsChannel(settings, type, "in_app")) {
      try {
        const stored = await saveNotificationForMember(memberId, notif, { settings });
        await audit("in_app", stored ? "stored" : "skipped", stored ? "" : "preferences disabled", stored ? "in-app" : "");
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
          tag: pushTag,
        });
      } catch (error) {
        await audit("push", "retrying", "push provider error");
        pushed = { ok: false, error: "Push provider error", code: "push-provider-error" };
      }
      // No registered device is a permanent skip for this event. Provider or
      // subscription-query failures are retried later, without blocking email.
      if (!pushed.ok || Number(pushed.sent) < 1) {
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
    if (exhausted && event._supervisionQueue === true) {
      for (const channel of ["in_app", "push", "email"].filter(channel => !event[`${channel}_done`])) {
        await auditEvent(event, channel, "failed", message);
      }
    }
    await patchClaim(event, {
      status: exhausted ? "failed" : "pending",
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      lease_token: null, lease_until: null, last_error: message,
    });
    if (exhausted && event._supervisionQueue !== true) {
      await Promise.all(["in_app", "push", "email"].filter(channel => !event[`${channel}_done`]).map(channel =>
        logNotificationDelivery({ eventId: event.id, recipientId: event.recipient_id,
          channel, outcome: "failed", reason: message })
      ));
    }
  } catch (updateError) {
    console.error("[notification-event] Could not release event lease", updateError?.message);
  }
  console.warn("[notification-event] Delivery deferred", message);
}

export async function dispatchQueuedNotifications({ limit = 6, supervisionOnly = false } = {}) {
  // The supplementary queue is optional until the V464 SQL is installed.
  // Keep the original queue's bounded work budget and isolate failures.
  const size = Math.max(1, Math.min(20, Number(limit) || 6));
  const events = [];
  let installed = false;
  let unexpectedError = null;
  async function collect(pending, supervision) {
    try {
      const result = await pending;
      installed = true;
      if (Array.isArray(result)) events.push(...result.map(event => ({ ...event, _supervisionQueue: supervision })));
    } catch (error) {
      const message = safe(error?.message || error, 200);
      const missing = Number(error?.status) === 404 || /PGRST202|PGRST205|schema cache|could not find the function/i.test(message);
      if (!missing) {
        unexpectedError ||= error;
        console.warn("[notification-event] Queue claim deferred", message);
      }
    }
  }
  await collect(supabaseRequest("/rpc/erp_claim_order_supervision_notifications_v464", {
    method: "POST", body: { p_limit: supervisionOnly ? size : Math.max(1, Math.floor(size / 2)) },
    profileName: "notifications.order-supervision.claim",
  }), true);
  if (!supervisionOnly && events.length < size) await collect(claim(size - events.length), false);
  if (!installed && unexpectedError) throw unexpectedError;
  let delivered = 0;
  for (let index = 0; index < events.length; index += 3) {
    await Promise.all(events.slice(index, index + 3).map(async (event) => {
      try { await deliver(event); delivered += 1; }
      catch (error) { await recover(event, error); }
    }));
  }
  return { ok: true, installed, processed: events.length, delivered, deferred: events.length - delivered };
}

import "server-only";
import { select, supabaseRequest } from "./supabase-rest";
import { DELIVERY_CHANNELS, DELIVERY_OUTCOMES, deliveryReason, buildDeliveryHistory } from "./notification-delivery-utils";

const TABLE = "erp_notification_delivery_attempts";
let installed = { until: 0, value: false };

async function logReady() {
  if (Date.now() < installed.until) return installed.value;
  let value = false;
  try {
    await select(TABLE, { select: "id", limit: "1" }, { profileName: "notifications.delivery.available" });
    value = true;
  } catch { /* Deployment before migration: do not break sending. */ }
  installed = { until: Date.now() + 30_000, value };
  return value;
}

/** Best-effort telemetry: a history failure must never prevent delivery. */
export async function logNotificationDelivery({ eventId, recipientId, channel, outcome, reason, provider } = {}) {
  if (!eventId || !recipientId || !DELIVERY_CHANNELS.includes(channel) || !DELIVERY_OUTCOMES.includes(outcome)) return;
  if (!await logReady()) return;
  const normalizedProvider = ["gmail-smtp", "resend", "web-push", "in-app", "digest"].includes(provider) ? provider : "";
  const row = {
    event_id: String(eventId).slice(0, 150), recipient_id: String(recipientId).slice(0, 120),
    channel, outcome, detail: reason ? deliveryReason(reason) : "",
    provider: normalizedProvider,
  };
  try {
    await supabaseRequest(`/${TABLE}`, {
      method: "POST", body: row, headers: { Prefer: "return=minimal" },
      profileName: "notifications.delivery.log",
    });
  } catch {
    // Never expose SMTP credentials or push subscription endpoints via logging.
    installed = { until: Date.now() + 30_000, value: false };
    console.warn("[notification-delivery] Attempt logging deferred");
  }
}

/** Only an authenticated user's own history may be requested by API routes. */
export async function getMemberDeliveryHistory(memberId) {
  if (!memberId) throw new Error("Authentication required");
  if (!await logReady()) return { installed: false, rows: [], totals: null };
  const id = String(memberId).slice(0, 120);
  const [events, attempts] = await Promise.all([
    select("erp_notification_events", {
      select: "id,title,category,status,attempts,created_at",
      recipient_id: `eq.${id}`, order: "created_at.desc", limit: "30",
    }, { profileName: "notifications.delivery.events" }),
    select(TABLE, {
      select: "event_id,channel,outcome,detail,provider,attempted_at,id",
      recipient_id: `eq.${id}`, order: "attempted_at.desc,id.desc", limit: "180",
    }, { profileName: "notifications.delivery.attempts" }),
  ]);
  const data = buildDeliveryHistory(Array.isArray(events) ? events : [], Array.isArray(attempts) ? attempts : []);
  return { installed: true, ...data };
}

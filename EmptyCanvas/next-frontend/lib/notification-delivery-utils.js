// Pure, shared delivery-history helpers. Do not store provider payloads, tokens,
// SMTP responses, Push endpoints or user email addresses in history.
export const DELIVERY_CHANNELS = ["in_app", "push", "email"];
export const DELIVERY_OUTCOMES = ["stored", "accepted", "queued", "skipped", "retrying", "failed"];

export function deliveryReason(code = "") {
  const raw = String(code || "").toLowerCase();
  if (!raw) return "";
  if (raw.includes("quiet")) return "Quiet hours enabled";
  if (raw.includes("preference") || raw.includes("disabled")) return "Disabled in notification preferences";
  if (raw.includes("no subscription") || raw.includes("no-device")) return "No registered push device";
  if (raw.includes("expired")) return "Push subscription expired";
  if (raw.includes("vapid") || raw.includes("authorization")) return "Push device authorization needs attention";
  if (raw.includes("smtp-auth")) return "Email provider authentication failed";
  if (raw.includes("no email") || raw.includes("no-email")) return "No email address configured";
  if (raw.includes("smtp") || raw.includes("email")) return "Email provider could not accept message";
  if (raw.includes("push") || raw.includes("subscription")) return "Push service could not accept message";
  if (raw.includes("digest")) return "Email digest will be sent on schedule";
  return "Delivery could not be completed";
}

export function deliveryLabel(channel, outcome) {
  const state = String(outcome || "").toLowerCase();
  if (state === "stored") return "Saved in app";
  if (state === "accepted") return channel === "email" ? "Accepted by email provider" : "Accepted by push service";
  if (state === "queued") return "Scheduled in email digest";
  if (state === "skipped") return "Skipped";
  if (state === "retrying") return "Retry scheduled";
  if (state === "failed") return "Could not send";
  return "Awaiting processing";
}

export function buildDeliveryHistory(events = [], attempts = []) {
  const byEvent = new Map();
  for (const attempt of attempts) {
    const id = String(attempt.event_id || "");
    if (!id || !DELIVERY_CHANNELS.includes(attempt.channel)) continue;
    if (!byEvent.has(id)) byEvent.set(id, {});
    // Rows are ordered newest first; preserve the most recent channel result.
    if (!byEvent.get(id)[attempt.channel]) byEvent.get(id)[attempt.channel] = {
      outcome: attempt.outcome,
      detail: attempt.detail || "",
      provider: attempt.provider || "",
      attemptedAt: attempt.attempted_at,
    };
  }
  const rows = events.map(event => ({
    id: String(event.id), title: String(event.title || "ERP update").slice(0, 160),
    category: String(event.category || "other"),
    at: event.created_at, state: event.status,
    attempts: Math.max(0, Number(event.attempts) || 0),
    channels: byEvent.get(String(event.id)) || {},
  }));
  const totals = { events: rows.length, accepted: 0, skipped: 0, retrying: 0, failed: 0 };
  for (const row of rows) {
    if (row.state === "failed") totals.failed++;
    else if (row.state === "pending" || row.state === "processing") totals.retrying++;
    else totals.accepted++;
    if (Object.values(row.channels).some(channel => channel.outcome === "skipped")) totals.skipped++;
  }
  return { rows, totals };
}

import "server-only";

// Transactional email transport for the notification engine. The notification
// event integrations and scheduled digests are rolled out separately.
function htmlEscape(input) {
  return String(input ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function validEmail(input) {
  const address = String(input || "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) && address.length <= 250 ? address : "";
}

export function renderNotificationEmail({ name, title, body, url, category = "System" } = {}) {
  const greeting = String(name || "Team Member").trim().slice(0, 100);
  const subject = String(title || "Operations update").trim().slice(0, 160);
  const message = String(body || "You have a new ERP update.").trim().slice(0, 1600);
  const domain = String(process.env.ERP_PUBLIC_URL || "").trim();
  let target = "";
  try {
    const origin = new URL(domain);
    const targetUrl = new URL(String(url || "/next/notifications"), origin);
    if (origin.protocol === "https:" && targetUrl.origin === origin.origin) target = targetUrl.href;
  } catch { /* If a verified ERP origin is missing, omit the email link. */ }
  const safeCategory = htmlEscape(category);
  const safeSubject = htmlEscape(subject);
  const safeMessage = htmlEscape(message).replace(/\r?\n/g, "<br>");
  const link = target ? `<tr><td style="padding:22px 0 0;"><a href="${htmlEscape(target)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-size:14px;font-weight:700;border-radius:12px;padding:14px 22px;">Open in Pyramakerz ERP →</a></td></tr>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:30px 10px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#171717;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:580px;margin:0 auto;">
    <tr><td style="padding:0 3px 18px;font-weight:900;font-size:20px;letter-spacing:.4px;color:#171717;">PYRA<span style="color:#f97316;">MAKERZ</span><span style="display:block;font-size:10px;letter-spacing:1.7px;color:#737373;margin-top:4px;">OPERATIONS ERP</span></td></tr>
    <tr><td style="background:#fff;border:1px solid #e9e9e9;border-radius:18px;padding:32px 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      <tr><td style="color:#ea580c;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">${safeCategory} Notification</td></tr>
      <tr><td style="padding:16px 0 8px;font-size:24px;font-weight:800;line-height:1.2;">${safeSubject}</td></tr>
      <tr><td style="color:#525252;font-size:14px;line-height:1.7;padding:7px 0;">Hello ${htmlEscape(greeting)},</td></tr>
      <tr><td style="color:#404040;font-size:15px;line-height:1.75;padding:8px 0;">${safeMessage}</td></tr>
      ${link}
      </table>
    </td></tr><tr><td style="padding:18px 6px;color:#737373;font-size:11px;line-height:1.7;text-align:center;">Pyramakerz Technologies · Automated ERP notification<br>Manage delivery preferences from your User Profile.</td></tr></table>
  </body></html>`;
  const plainText = [`Hello ${greeting},`, "", subject, "", message, "", target ? `Open: ${target}` : "", "", "Pyramakerz ERP · Manage notifications from User Profile."].join("\n");
  return { subject, html, text: plainText };
}

export async function sendNotificationEmail({ to, id, ...message } = {}) {
  const recipient = validEmail(to);
  if (!recipient) return { ok: false, skipped: true, reason: "no-email-address" };
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const sender = String(process.env.ERP_NOTIFICATION_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || process.env.PASSWORD_RECOVERY_FROM_EMAIL || "").trim();
  if (!apiKey || !sender) return { ok: false, skipped: true, reason: "resend-not-configured" };
  const email = renderNotificationEmail(message);
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  // Resend deduplicates the same event/member pair when the caller retries it.
  if (id) headers["Idempotency-Key"] = `erp-notification/${String(id).replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 170)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST", headers,
      body: JSON.stringify({ from: sender, to: recipient, ...email }),
      signal: controller.signal,
    });
    const response = await result.json().catch(() => ({}));
    if (!result.ok) return { ok: false, reason: "provider-rejected", status: result.status };
    return { ok: true, provider: "resend", messageId: String(response.id || "") };
  } catch { return { ok: false, reason: "provider-unavailable" }; }
  finally { clearTimeout(timeout); }
}

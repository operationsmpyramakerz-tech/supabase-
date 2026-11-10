import "server-only";

import { smtpConfigured, sendNotificationViaSmtp, smtpFailureReason } from "./notification-smtp";
import { renderUsersCenterMemberInviteEmail } from "./users-center-invite-template";

function text(value) { return String(value ?? "").trim(); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }

function buildSignupStatusEmail({ to, name, status, department, position }) {
  const approved = text(status).toLowerCase() === "approved";
  const safeName = text(name) || "Team Member";
  const subject = approved ? "Operations Dashboard Sign Up Request Approved" : "Operations Dashboard Sign Up Request Rejected";
  const statusLabel = approved ? "Approved" : "Rejected";
  const statusColor = approved ? "#059669" : "#dc2626";
  const mainText = approved
    ? "Your Operations Dashboard sign up request was approved. You can now sign in using your registered username and password."
    : "Your Operations Dashboard sign up request was rejected. Please contact your administrator for more information.";
  const details = approved && (department || position) ? `Department: ${department || "-"}\nPosition: ${position || "-"}` : "";
  const plainText = [`Hello ${safeName},`, "", mainText, "", `Request status: ${statusLabel}`, details].filter(Boolean).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto;padding:24px;"><div style="border:1px solid #fed7aa;border-radius:18px;padding:22px;background:#fff7ed;"><h2 style="margin:0 0 10px;color:#111827;">Operations Dashboard Sign Up Request</h2><p style="margin:0 0 14px;color:#374151;">Hello ${escapeHtml(safeName)},</p><p style="margin:0 0 14px;color:#374151;">${escapeHtml(mainText)}</p><div style="background:#ffffff;border:1px solid #fdba74;border-radius:14px;padding:16px;margin:18px 0;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9a3412;font-weight:700;margin-bottom:6px;">Request Status</div><div style="font-size:22px;font-weight:800;color:${statusColor};word-break:break-word;">${escapeHtml(statusLabel)}</div>${approved ? `<div style="margin-top:12px;color:#374151;font-size:14px;"><div><strong>Department:</strong> ${escapeHtml(department || "-")}</div><div><strong>Position:</strong> ${escapeHtml(position || "-")}</div></div>` : ""}</div><p style="margin:0;color:#6b7280;font-size:13px;">This email was sent automatically by Operations Hub.</p></div></div>`;
  return { to, subject, text: plainText, html };
}

async function sendWithResend({ to, subject, text: plainText, html }) {
  const apiKey = text(process.env.RESEND_API_KEY || process.env.PASSWORD_RECOVERY_RESEND_API_KEY);
  if (!apiKey) return false;
  const from = text(process.env.PASSWORD_RECOVERY_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "Operations Dashboard <onboarding@resend.dev>");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: plainText, html }),
  });
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) {
    const error = new Error(payload && typeof payload === "object" ? (payload.message || payload.error || JSON.stringify(payload)) : (raw || `Resend failed with status ${response.status}`));
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return true;
}

// All ERP email uses the same secure SMTP transport. Prefer the configured
// company mailbox; Resend remains available when SMTP is not configured.
async function sendWithSmtp(email) {
  if (!smtpConfigured()) return false;
  try {
    await sendNotificationViaSmtp(email);
    return true;
  } catch (error) {
    const reason = smtpFailureReason(error);
    const messages = {
      "smtp-invalid-configuration": "Invalid SMTP configuration. Check SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_FROM.",
      "smtp-timeout": "SMTP connection timed out. Check the mail server and firewall.",
      "smtp-auth-failed": "SMTP authentication failed. Check the mailbox username and password.",
      "smtp-connection-failed": "Could not connect to the SMTP server. Check SMTP_HOST, SMTP_PORT and the firewall.",
      "smtp-tls-failed": "SMTP encryption failed. Use STARTTLS on port 587 or implicit TLS on port 465, and check the mail server certificate.",
      "smtp-send-failed": "The SMTP server could not send the email. Check the mail server logs and sender permissions.",
    };
    const safeError = new Error(messages[reason] || messages["smtp-send-failed"]);
    safeError.status = reason === "smtp-invalid-configuration" ? 503 : 502;
    throw safeError;
  }
}

export async function sendUsersCenterSignupStatusEmail(args = {}) {
  const email = buildSignupStatusEmail(args);
  const sentWithSmtp = await sendWithSmtp(email); if (sentWithSmtp) return { provider: "smtp" };
  const sentWithResend = await sendWithResend(email); if (sentWithResend) return { provider: "resend" };
  const error = new Error("Email service is not configured. Add RESEND_API_KEY or SMTP settings."); error.status = 500; throw error;
}

function buildPasswordRecoveryEmail({ to, name, password }) {
  const safeName = text(name) || "Team Member";
  const subject = "Operations Dashboard Password Recovery";
  const plainText = [
    `Hello ${safeName},`,
    "",
    "You requested your Operations Dashboard password.",
    "",
    `Your registered password is: ${password}`,
    "",
    "If you did not request this email, please contact your administrator.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto;padding:24px;"><div style="border:1px solid #fed7aa;border-radius:18px;padding:22px;background:#fff7ed;"><h2 style="margin:0 0 10px;color:#111827;">Operations Dashboard Password Recovery</h2><p style="margin:0 0 14px;color:#374151;">Hello ${escapeHtml(safeName)},</p><p style="margin:0 0 14px;color:#374151;">You requested your Operations Dashboard password.</p><div style="background:#ffffff;border:1px solid #fdba74;border-radius:14px;padding:16px;margin:18px 0;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9a3412;font-weight:700;margin-bottom:6px;">Registered Password</div><div style="font-size:20px;font-weight:800;color:#111827;word-break:break-word;">${escapeHtml(password)}</div></div><p style="margin:0;color:#6b7280;font-size:13px;">If you did not request this email, please contact your administrator.</p></div></div>`;
  return { to, subject, text: plainText, html };
}

export async function sendPasswordRecoveryEmail(args = {}) {
  const email = buildPasswordRecoveryEmail(args);
  const sentWithSmtp = await sendWithSmtp(email); if (sentWithSmtp) return { provider: "smtp" };
  const sentWithResend = await sendWithResend(email); if (sentWithResend) return { provider: "resend" };
  const error = new Error("Email service is not configured. Add RESEND_API_KEY + PASSWORD_RECOVERY_FROM_EMAIL, or SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS + SMTP_FROM in Vercel Environment Variables.");
  error.status = 500;
  throw error;
}


/** Explicitly administrator-confirmed account invitation. Credentials are read
 * exclusively on the server; never return, log or embed them in client data.
 * This matches the legacy direct-auth account schema until a password-reset
 * workflow replaces password-in-email delivery. */
export async function sendUsersCenterMemberInviteEmail({ to, name, username, password }) {
  const recipient = text(to);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || /[\r\n]/.test(recipient)) {
    const error = new Error("The member needs a valid email address before inviting."); error.status = 400; throw error;
  }
  if (!text(username) || !text(password)) {
    const error = new Error("The member needs a saved username and password before inviting."); error.status = 409; throw error;
  }
  const base = text(process.env.ERP_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://operation.propyramakerz.com");
  let loginUrl;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    loginUrl = new URL("/next/login", url.origin).toString();
  } catch {
    const error = new Error("ERP_PUBLIC_APP_URL must be an HTTPS address."); error.status = 500; throw error;
  }
  const subject = "Your Pyramakerz Operations ERP Invitation";
  const safeName = text(name) || "Team Member";
  const plainText = [
    `Hello ${safeName},`, "", "You have been invited to Pyramakerz Operations ERP.", "",
    `Application: ${loginUrl}`, `Username: ${text(username)}`, `Password: ${text(password)}`, "",
    "Keep these login details confidential. Contact your administrator to change the password if the message reached an unexpected mailbox.",
  ].join("\n");
  const imageBaseUrl = `${new URL(base).origin}/next/images`;
  const html = renderUsersCenterMemberInviteEmail({
    name: safeName,
    username: text(username),
    password: text(password),
    loginUrl,
    imageBaseUrl,
  });
  const email = { to: recipient, subject, text: plainText, html };
  const smtp = await sendWithSmtp(email);
  if (smtp) return { provider: "smtp" };
  const resend = await sendWithResend(email);
  if (resend) return { provider: "resend" };
  const error = new Error("Email is not configured. Configure RESEND_API_KEY or SMTP_HOST, SMTP_USER and SMTP_PASS."); error.status = 503; throw error;
}

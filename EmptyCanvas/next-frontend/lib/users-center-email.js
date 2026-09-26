import "server-only";

import net from "node:net";
import tls from "node:tls";

function text(value) { return String(value ?? "").trim(); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function extractEmailAddress(value) { const raw = text(value); const match = raw.match(/<([^<>@\s]+@[^<>@\s]+)>/); return match ? match[1].trim() : raw; }
function dotStuffSmtpBody(value) { return String(value || "").replace(/\r?\n/g, "\r\n").split("\r\n").map((line) => line.startsWith(".") ? `.${line}` : line).join("\r\n"); }

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

function createSmtpReader(socket) {
  let buffer = "";
  const waiters = [];
  const hasCompleteResponse = () => buffer.split(/\r?\n/).some((line) => /^\d{3} /.test(line));
  const notify = () => { if (!hasCompleteResponse()) return; while (waiters.length) waiters.shift()(); };
  socket.on("data", (chunk) => { buffer += chunk.toString("utf8"); notify(); });
  async function readResponse() {
    while (!hasCompleteResponse()) {
      await new Promise((resolve, reject) => {
        const onError = (error) => { cleanup(); reject(error); };
        const onClose = () => { cleanup(); reject(new Error("SMTP connection closed before response.")); };
        const done = () => { cleanup(); resolve(); };
        const cleanup = () => { socket.off("error", onError); socket.off("close", onClose); const index = waiters.indexOf(done); if (index >= 0) waiters.splice(index, 1); };
        waiters.push(done); socket.once("error", onError); socket.once("close", onClose);
      });
    }
    const lines = buffer.split(/\r?\n/); let endIndex = lines.findIndex((line) => /^\d{3} /.test(line)); if (endIndex < 0) endIndex = lines.length - 1;
    const responseLines = lines.slice(0, endIndex + 1); buffer = lines.slice(endIndex + 1).join("\r\n");
    const finalLine = responseLines[responseLines.length - 1] || "";
    return { code: Number(finalLine.slice(0, 3)), text: responseLines.join("\n") };
  }
  return { readResponse };
}

async function smtpWriteAndRead(socket, reader, line, expected = []) {
  socket.write(`${line}\r\n`);
  const response = await reader.readResponse();
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (allowed.length && !allowed.includes(response.code)) { const error = new Error(`SMTP command failed (${response.code}): ${response.text}`); error.status = 502; throw error; }
  return response;
}

async function sendWithSmtp({ to, subject, text: plainText, html }) {
  const host = text(process.env.SMTP_HOST); const user = text(process.env.SMTP_USER); const pass = text(process.env.SMTP_PASS || process.env.SMTP_PASSWORD);
  if (!host || !user || !pass) return false;
  const port = Number(process.env.SMTP_PORT || 587); const secure = text(process.env.SMTP_SECURE).toLowerCase() === "true" || port === 465;
  const from = text(process.env.PASSWORD_RECOVERY_FROM_EMAIL || process.env.SMTP_FROM || process.env.EMAIL_FROM || user);
  const fromAddress = extractEmailAddress(from); const toAddress = extractEmailAddress(to);
  const boundary = `erp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const message = [`From: ${from}`, `To: ${toAddress}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", plainText, "", `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", html, "", `--${boundary}--`, ""].join("\r\n");
  let socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  await new Promise((resolve, reject) => { socket.once(secure ? "secureConnect" : "connect", resolve); socket.once("error", reject); });
  let reader = createSmtpReader(socket);
  try {
    const greeting = await reader.readResponse(); if (greeting.code !== 220) throw new Error(`SMTP greeting failed: ${greeting.text}`);
    await smtpWriteAndRead(socket, reader, `EHLO ${process.env.VERCEL_URL || "localhost"}`, [250]);
    if (!secure) { await smtpWriteAndRead(socket, reader, "STARTTLS", [220]); socket = tls.connect({ socket, servername: host }); await new Promise((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); }); reader = createSmtpReader(socket); await smtpWriteAndRead(socket, reader, `EHLO ${process.env.VERCEL_URL || "localhost"}`, [250]); }
    await smtpWriteAndRead(socket, reader, "AUTH LOGIN", [334]); await smtpWriteAndRead(socket, reader, Buffer.from(user, "utf8").toString("base64"), [334]); await smtpWriteAndRead(socket, reader, Buffer.from(pass, "utf8").toString("base64"), [235]);
    await smtpWriteAndRead(socket, reader, `MAIL FROM:<${fromAddress}>`, [250]); await smtpWriteAndRead(socket, reader, `RCPT TO:<${toAddress}>`, [250, 251]); await smtpWriteAndRead(socket, reader, "DATA", [354]);
    socket.write(`${dotStuffSmtpBody(message)}\r\n.\r\n`); const sent = await reader.readResponse(); if (sent.code !== 250) throw new Error(`SMTP send failed: ${sent.text}`);
    try { await smtpWriteAndRead(socket, reader, "QUIT", [221]); } catch {}
    return true;
  } finally { try { socket.end(); } catch {} }
}

export async function sendUsersCenterSignupStatusEmail(args = {}) {
  const email = buildSignupStatusEmail(args);
  const sentWithResend = await sendWithResend(email); if (sentWithResend) return { provider: "resend" };
  const sentWithSmtp = await sendWithSmtp(email); if (sentWithSmtp) return { provider: "smtp" };
  const error = new Error("Email service is not configured. Add RESEND_API_KEY or SMTP settings."); error.status = 500; throw error;
}

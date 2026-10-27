import "server-only";

import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";

// No third-party dependency: this server-side sender supports Gmail's implicit
// TLS (465) and STARTTLS (587), AUTH LOGIN, and UTF-8 multipart HTML/text mail.
const DEFAULT_TIMEOUT_MS = 12_000;

function trimmed(value) { return String(value ?? "").trim(); }
function emailAddress(value) {
  const raw = trimmed(value);
  if (/[\r\n]/.test(raw)) return "";
  const bracketed = raw.match(/^([^<>]*)<([^<>]+)>$/);
  const address = trimmed(bracketed ? bracketed[2] : raw);
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) && address.length <= 254 ? address : "";
}

function configuredSender(user) {
  // SMTP_FROM is independent from the Resend sender. Gmail usually requires
  // the From address to match SMTP_USER or a verified "Send mail as" alias.
  const requested = trimmed(process.env.SMTP_FROM || user);
  const address = emailAddress(requested);
  if (!address) throw Object.assign(new Error("SMTP_FROM is not a valid email address."), { code: "SMTP_CONFIG" });
  const display = requested.match(/^([^<>]*)<[^<>]+>$/)?.[1]?.trim();
  if (!display) return address;
  const safeName = display.replace(/[\r\n<>\"]+/g, " ").trim().slice(0, 90);
  return safeName ? `${safeName} <${address}>` : address;
}

export function smtpConfigured() {
  return Boolean(trimmed(process.env.SMTP_HOST) && trimmed(process.env.SMTP_USER) &&
    trimmed(process.env.SMTP_PASS || process.env.SMTP_PASSWORD));
}

function encodedHeader(value) {
  const clean = String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words = [];
  let chunk = "";
  for (const character of clean) {
    if (Buffer.byteLength(chunk + character, "utf8") > 36 && chunk) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
  return words.join("\r\n ");
}

function base64Lines(value) {
  const encoded = Buffer.from(String(value ?? ""), "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || "";
}

function buildMessage({ to, from, subject, text, html }) {
  const safeTo = emailAddress(to);
  if (!safeTo) throw Object.assign(new Error("Invalid email recipient."), { code: "SMTP_CONFIG" });
  const fromAddress = emailAddress(from);
  if (!fromAddress) throw Object.assign(new Error("Invalid sender."), { code: "SMTP_CONFIG" });
  const senderName = from.includes("<") ? trimmed(from.split("<")[0]) : "";
  const fromHeader = senderName ? `${encodedHeader(senderName)} <${fromAddress}>` : fromAddress;
  const boundary = `pyramakerz_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
  const lines = [
    `From: ${fromHeader}`, `To: ${safeTo}`, `Subject: ${encodedHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    base64Lines(text), "",
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    base64Lines(html), "", `--${boundary}--`, "",
  ];
  return lines.join("\r\n");
}

function createSmtpReader(socket) {
  let buffer = "";
  let responseLines = [];
  const queued = [];
  const waiters = [];
  let failed = null;
  function flush() {
    while (waiters.length && (queued.length || failed)) {
      const { resolve, reject } = waiters.shift();
      if (queued.length) resolve(queued.shift()); else reject(failed);
    }
  }
  function onData(chunk) {
    buffer += chunk.toString("utf8");
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (!/^\d{3}[- ]/.test(line)) continue;
      responseLines.push(line);
      if (line[3] === " ") {
        queued.push({ code: Number(line.slice(0, 3)), details: responseLines.join("\n") });
        responseLines = [];
        flush();
      }
    }
  }
  function onError(error) { failed = error; flush(); }
  function onClose() { if (!failed) failed = new Error("SMTP connection closed."); flush(); }
  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);
  return {
    read() {
      if (queued.length) return Promise.resolve(queued.shift());
      if (failed) return Promise.reject(failed);
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    dispose() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    },
  };
}

function smtpError(code, command) {
  const error = new Error(`SMTP rejected ${command} (${code}).`);
  error.code = command === "AUTH LOGIN" || command === "AUTH USER" || command === "AUTH PASSWORD" ? "SMTP_AUTH" : "SMTP_REJECTED";
  error.smtpStatus = code;
  return error;
}

async function command(socket, reader, line, expected, name = line.split(" ")[0]) {
  socket.write(`${line}\r\n`);
  const response = await reader.read();
  if (!expected.includes(response.code)) throw smtpError(response.code, name);
  return response;
}

function connected(socket, event) {
  return new Promise((resolve, reject) => {
    function onSuccess() { cleanup(); resolve(); }
    function onError(error) { cleanup(); reject(error); }
    function cleanup() { socket.off(event, onSuccess); socket.off("error", onError); }
    socket.once(event, onSuccess);
    socket.once("error", onError);
  });
}

function setTimeoutForSocket(socket) {
  socket.setTimeout(DEFAULT_TIMEOUT_MS, () => {
    const error = new Error("SMTP connection timed out.");
    error.code = "SMTP_TIMEOUT";
    socket.destroy(error);
  });
}

function normalizeEhlo() {
  const name = trimmed(process.env.VERCEL_URL || "localhost").split("/")[0];
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(name) ? name : "localhost";
}

export async function sendNotificationViaSmtp({ to, subject, text, html }) {
  if (!smtpConfigured()) throw Object.assign(new Error("SMTP is not configured."), { code: "SMTP_CONFIG" });
  const host = trimmed(process.env.SMTP_HOST);
  const user = trimmed(process.env.SMTP_USER);
  const pass = trimmed(process.env.SMTP_PASS || process.env.SMTP_PASSWORD);
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || !host || !emailAddress(user)) {
    throw Object.assign(new Error("Invalid SMTP host, port, or user."), { code: "SMTP_CONFIG" });
  }
  const implicitTls = port === 465 || trimmed(process.env.SMTP_SECURE).toLowerCase() === "true";
  const from = configuredSender(user);
  const message = buildMessage({ to, from, subject, text, html });
  let socket;
  let reader;
  try {
    socket = implicitTls ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    setTimeoutForSocket(socket);
    await connected(socket, implicitTls ? "secureConnect" : "connect");
    reader = createSmtpReader(socket);
    const hello = await reader.read();
    if (hello.code !== 220) throw smtpError(hello.code, "GREETING");
    await command(socket, reader, `EHLO ${normalizeEhlo()}`, [250], "EHLO");
    if (!implicitTls) {
      await command(socket, reader, "STARTTLS", [220], "STARTTLS");
      reader.dispose();
      socket = tls.connect({ socket, servername: host });
      setTimeoutForSocket(socket);
      await connected(socket, "secureConnect");
      reader = createSmtpReader(socket);
      await command(socket, reader, `EHLO ${normalizeEhlo()}`, [250], "EHLO");
    }
    await command(socket, reader, "AUTH LOGIN", [334], "AUTH LOGIN");
    await command(socket, reader, Buffer.from(user).toString("base64"), [334], "AUTH USER");
    await command(socket, reader, Buffer.from(pass).toString("base64"), [235], "AUTH PASSWORD");
    // Use the authenticated account for the envelope sender; Gmail can rewrite
    // an unverified From alias and may reject a foreign envelope sender.
    await command(socket, reader, `MAIL FROM:<${user}>`, [250], "MAIL FROM");
    await command(socket, reader, `RCPT TO:<${emailAddress(to)}>`, [250, 251], "RCPT TO");
    await command(socket, reader, "DATA", [354], "DATA");
    // Base64 MIME bodies have no dot-leading lines, but dot-stuffing keeps
    // message framing safe if headers or content change in the future.
    socket.write(`${message.replace(/(^|\r\n)\./g, "$1..")}\r\n.\r\n`);
    const accepted = await reader.read();
    if (accepted.code !== 250) throw smtpError(accepted.code, "DATA");
    try { await command(socket, reader, "QUIT", [221], "QUIT"); } catch { /* accepted already */ }
    return { ok: true, provider: "gmail-smtp" };
  } finally {
    reader?.dispose();
    if (socket) socket.destroy();
  }
}

export function smtpFailureReason(error) {
  if (error?.code === "SMTP_CONFIG") return "smtp-invalid-configuration";
  if (error?.code === "SMTP_TIMEOUT" || error?.code === "ETIMEDOUT") return "smtp-timeout";
  if (error?.code === "SMTP_AUTH" || [534, 535].includes(error?.smtpStatus)) return "smtp-auth-failed";
  if (["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ENOTFOUND"].includes(error?.code)) return "smtp-connection-failed";
  if (error?.code?.startsWith("ERR_TLS_") || error?.code?.startsWith("CERT_")) return "smtp-tls-failed";
  return "smtp-send-failed";
}

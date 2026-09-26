import "server-only";

import crypto from "node:crypto";

const EVENTS_AUTH_TTL_MS = 5 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function identityKey(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function accountMemberId(account = {}) {
  return text(account?.teamMemberId || account?.userSupabaseId || account?.userId || account?.id);
}

function accountUsername(account = {}) {
  return text(account?.username || account?.name);
}

function currentIdentity(account = {}) {
  return identityKey(accountUsername(account)) || accountMemberId(account);
}

function signingSecret() {
  return String(process.env.SESSION_SECRET || "dev-fallback-secret");
}

function base64urlJson(payload = {}) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signPayload(payload = {}) {
  const encoded = base64urlJson(payload);
  const signature = crypto.createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function authError(message, status = 403) {
  const error = new Error(message || "Events Admin authorization is required.");
  error.status = Number(status) || 403;
  error.code = "EVENTS_AUTHORIZATION_FAILED";
  return error;
}

export function issueEventsAuthorizationToken(account = {}, scope = "", claims = {}, ttlMs = EVENTS_AUTH_TTL_MS) {
  const uid = currentIdentity(account);
  const cleanScope = text(scope);
  if (!uid || !cleanScope) throw authError("Could not create Events authorization.", 500);
  const now = Date.now();
  return signPayload({
    scope: cleanScope,
    uid,
    iat: now,
    exp: now + Math.max(30_000, Number(ttlMs) || EVENTS_AUTH_TTL_MS),
    ...claims,
  });
}

export function verifyEventsAuthorizationToken(tokenValue = "", account = {}, expectedScope = "", expectedClaims = {}) {
  const raw = text(tokenValue);
  const splitAt = raw.lastIndexOf(".");
  if (splitAt <= 0) throw authError();

  const encoded = raw.slice(0, splitAt);
  const signature = raw.slice(splitAt + 1);
  const expectedSignature = crypto.createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expectedSignature);
  if (!left.length || left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw authError();

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw authError();
  }

  if (text(payload?.scope) !== text(expectedScope)) throw authError();
  if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < Date.now()) {
    throw authError("Events Admin authorization expired. Enter the Admin password again.", 401);
  }

  const uid = currentIdentity(account);
  if (!uid || text(payload?.uid) !== uid) throw authError("This Events authorization belongs to another account.");

  for (const [key, expectedValue] of Object.entries(expectedClaims || {})) {
    if (expectedValue === undefined || expectedValue === null || expectedValue === "") continue;
    if (text(payload?.[key]) !== text(expectedValue)) throw authError();
  }
  return payload;
}

export const EVENTS_AUTHORIZATION_TTL_MS = EVENTS_AUTH_TTL_MS;

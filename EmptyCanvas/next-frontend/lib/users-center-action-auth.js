import "server-only";

import crypto from "node:crypto";

const USERS_CENTER_AUTH_TTL_MS = 5 * 60 * 1000;
const USERS_CENTER_SCOPE = "users-center-admin";

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
  const error = new Error(message || "Users Center Admin authorization is required.");
  error.status = Number(status) || 403;
  error.code = "USERS_CENTER_AUTHORIZATION_FAILED";
  return error;
}

export function issueUsersCenterAuthorizationToken(account = {}, ttlMs = USERS_CENTER_AUTH_TTL_MS) {
  const uid = currentIdentity(account);
  if (!uid) throw authError("Could not create Users Center authorization.", 500);
  const now = Date.now();
  const expiresAt = now + Math.max(30_000, Number(ttlMs) || USERS_CENTER_AUTH_TTL_MS);
  return {
    token: signPayload({ scope: USERS_CENTER_SCOPE, uid, iat: now, exp: expiresAt }),
    expiresAt,
    expiresInSeconds: Math.max(1, Math.floor((expiresAt - now) / 1000)),
  };
}

export function verifyUsersCenterAuthorizationToken(tokenValue = "", account = {}) {
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

  if (text(payload?.scope) !== USERS_CENTER_SCOPE) throw authError();
  if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < Date.now()) {
    throw authError("Admin verification expired. Please enter the Admin password first.", 403);
  }

  const uid = currentIdentity(account);
  if (!uid || text(payload?.uid) !== uid) throw authError("This Users Center authorization belongs to another account.");
  return payload;
}

export const USERS_CENTER_AUTHORIZATION_TTL_MS = USERS_CENTER_AUTH_TTL_MS;

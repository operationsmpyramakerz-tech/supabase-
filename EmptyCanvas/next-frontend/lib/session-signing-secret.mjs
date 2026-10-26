/**
 * One signing secret for session cookies and account-bound action tokens.
 * Never use a fixed, publicly known fallback: it would let anyone with access
 * to a session-store ID forge a session or a privileged action token.
 *
 * Development without SESSION_SECRET gets an ephemeral per-process key only.
 * Production must provide the SAME SESSION_SECRET to every Next instance.
 */
import crypto from "node:crypto";

const insecureValues = new Set([
  "dev-fallback-secret", "changeme", "change-me", "default", "secret",
  "session-secret", "replace-me", "your-secret-here",
]);
const ephemeralDevelopmentSecret = crypto.randomBytes(48).toString("base64url");

function environmentMode(env) {
  return String(env?.NODE_ENV || "development").trim().toLowerCase();
}

export function sessionSigningStatus(env = process.env) {
  const value = String(env?.SESSION_SECRET || "").trim();
  const production = environmentMode(env) === "production";
  if (!value) {
    return production
      ? { ok: false, code: "SESSION_SECRET_MISSING", message: "SESSION_SECRET must be set before starting the production ERP server." }
      : { ok: true, ephemeral: true, warning: "Using an ephemeral development session secret. Sessions will reset when the process restarts." };
  }
  if (insecureValues.has(value.toLowerCase())) {
    return { ok: false, code: "SESSION_SECRET_INSECURE", message: "Replace the publicly known/default SESSION_SECRET before starting the ERP server." };
  }
  return { ok: true, ephemeral: false, ...(value.length < 32 ? { warning: "SESSION_SECRET should be a random secret of at least 32 characters." } : {}) };
}

export function sessionSigningSecret(env = process.env) {
  const status = sessionSigningStatus(env);
  if (!status.ok) {
    const error = new Error(status.message);
    error.code = status.code;
    error.status = 503;
    throw error;
  }
  return status.ephemeral ? ephemeralDevelopmentSecret : String(env.SESSION_SECRET).trim();
}

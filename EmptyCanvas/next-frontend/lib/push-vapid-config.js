// Server-side configuration diagnostics; never return or log the VAPID private key.
import crypto from "node:crypto";

function value(raw) { return String(raw ?? "").trim(); }

function decodeKey(raw) {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(raw)) return null;
  try {
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const normalized = decoded.toString("base64url");
    if (normalized !== raw.replace(/=+$/, "")) return null;
    return decoded;
  } catch { return null; }
}

export function validateVapidSettings(env = process.env) {
  const pub = value(env.VAPID_PUBLIC_KEY);
  const priv = value(env.VAPID_PRIVATE_KEY);
  const subject = value(env.VAPID_SUBJECT);
  const fail = (code, message) => ({ enabled: false, code, message });
  if (!pub) return fail("missing-public-key", "Add VAPID_PUBLIC_KEY to Vercel Production environment variables.");
  if (!priv) return fail("missing-private-key", "Add VAPID_PRIVATE_KEY to Vercel Production environment variables.");
  if (!subject) return fail("missing-subject", "Add VAPID_SUBJECT (mailto:your-real-email@example.com) to Vercel.");
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(subject) && !/^https:\/\/[^\s/]+\.[^\s/]+(?:\/\S*)?$/i.test(subject)) {
    return fail("invalid-subject", "VAPID_SUBJECT must be a real mailto: email address or an HTTPS URL.");
  }
  const pubBytes = decodeKey(pub);
  if (!pubBytes || pubBytes.length !== 65 || pubBytes[0] !== 4) {
    return fail("invalid-public-key", "VAPID_PUBLIC_KEY is not a valid P-256 public key. Regenerate the VAPID key pair.");
  }
  const privBytes = decodeKey(priv);
  if (!privBytes || privBytes.length !== 32) {
    return fail("invalid-private-key", "VAPID_PRIVATE_KEY is not a valid P-256 private key. Regenerate the VAPID key pair.");
  }
  try {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(privBytes);
    if (!ecdh.getPublicKey().equals(pubBytes)) {
      return fail("mismatched-key-pair", "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY do not belong to the same pair.");
    }
  } catch {
    return fail("invalid-private-key", "VAPID_PRIVATE_KEY cannot be used as a P-256 private key.");
  }
  return { enabled: true, code: "ready", message: "Web Push credentials are ready." };
}

// A profile photo may only be committed using a short-lived, tamper-evident
// ticket issued for that exact member, object path and raster payload.
import crypto from "node:crypto";

const MAX_AGE_MS = 10 * 60 * 1000;
const RASTER_MIMES = Object.freeze({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" });
function reject(message, status = 403) {
  const error = new Error(message);
  error.status = status;
  error.code = "ACCOUNT_IMAGE_TICKET_INVALID";
  throw error;
}
export function rasterExtension(mime) { return RASTER_MIMES[String(mime || "").trim().toLowerCase()] || ""; }
export function validateRasterBytes(bytes, mime) {
  const buffer = Buffer.from(bytes || []);
  const type = String(mime || "").toLowerCase();
  const png = type === "image/png" && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const jpeg = type === "image/jpeg" && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = type === "image/webp" && buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) reject("Uploaded file is not a valid PNG, JPEG or WEBP image.", 400);
  return true;
}
function secret() {
  const key = String(process.env.SESSION_SECRET || process.env.STORAGE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!key) reject("Secure upload signing is not configured.", 503);
  return key;
}
function signature(data) { return crypto.createHmac("sha256", secret()).update(data).digest("base64url"); }
function safeString(value) { return String(value ?? "").trim(); }
export function issueAccountImageTicket({ memberId, kind, path, mime, size }, now = Date.now()) {
  const id = safeString(memberId);
  const filePath = safeString(path);
  const normalizedMime = safeString(mime).toLowerCase();
  const bytes = Number(size);
  if (!id || kind !== "profile" || !filePath.startsWith(`team-members/profile-pictures/${id}/`) || !rasterExtension(normalizedMime) || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 10 * 1024 * 1024) reject("Invalid image upload details.", 400);
  const payload = { v: 1, purpose: "account-profile-image", memberId: id, kind, path: filePath, mime: normalizedMime, size: bytes, exp: now + MAX_AGE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}
export function verifyAccountImageTicket(reference, { memberId, kind, path }, now = Date.now()) {
  const value = safeString(reference);
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || value.length > 2500) reject("Missing or invalid image upload ticket.");
  const encoded = value.slice(0, dot);
  const supplied = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(signature(encoded));
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) reject("Image upload ticket signature is invalid.");
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { reject("Image upload ticket cannot be read.", 400); }
  if (payload?.v !== 1 || payload?.purpose !== "account-profile-image" || payload?.memberId !== safeString(memberId)
    || payload?.kind !== kind || payload?.path !== safeString(path) || !rasterExtension(payload?.mime)
    || !Number.isSafeInteger(payload?.size) || payload.size <= 0 || payload.size > 10 * 1024 * 1024) reject("This upload ticket is not valid for this account or image.");
  if (!Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.exp > now + MAX_AGE_MS) reject("The image upload ticket has expired.", 410);
  return payload;
}

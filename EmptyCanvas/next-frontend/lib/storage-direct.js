import "server-only";

import crypto from "node:crypto";

import { directPageAccessLevel } from "./order-action-auth";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  deleteStorageObjects,
  getSupabaseConfig,
  isSupabaseConfigured,
} from "./supabase-rest";

const FILE_REF_VERSION = 1;
const UPLOAD_REF_VERSION = 1;
const DEFAULT_DOWNLOAD_TTL_SECONDS = 180;
const DEFAULT_UPLOAD_TTL_SECONDS = 10 * 60;
const signedDownloadCache = new Map();

const diagnostics = {
  uploadTicketsCreated: 0,
  uploadsVerified: 0,
  uploadsRejected: 0,
  fileRedirects: 0,
  signedUrlCacheHits: 0,
  signedUrlCacheMisses: 0,
};

const POLICIES = Object.freeze({
  "task-management": Object.freeze({
    pages: ["All Tasks", "My Tasks", "Delegated Tasks", "Task Management"],
    prefix: "task-management/attachments",
    maxSize: 10 * 1024 * 1024,
  }),
  b2c: Object.freeze({
    pages: ["Customer Database", "Customer Form", "B2C"],
    prefix: "b2c/customer-files",
    maxSize: 10 * 1024 * 1024,
  }),
  "kpi-evidence": Object.freeze({
    pages: ["KPIs"],
    prefix: "kpi-evidence",
    maxSize: 15 * 1024 * 1024,
  }),
});

function safeText(value, max = 500) {
  return String(value ?? "").replace(/[\r\n\0]/g, "").trim().slice(0, max);
}
function normalizePath(value) { return String(value || "").replace(/^\/+/, "").trim(); }
function normalizeBucket(value) { return String(value || "").replace(/^\/+|\/+$/g, "").trim(); }
function base64UrlEncode(value) { return Buffer.from(value).toString("base64url"); }
function base64UrlDecode(value) { return Buffer.from(String(value || ""), "base64url").toString("utf8"); }

function signingSecret() {
  const secret = String(
    process.env.STORAGE_LINK_SECRET
    || process.env.SESSION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || "",
  ).trim();
  if (!secret) {
    const error = new Error("Direct Storage needs STORAGE_LINK_SECRET or SESSION_SECRET.");
    error.code = "DIRECT_STORAGE_SECRET_MISSING";
    error.status = 503;
    throw error;
  }
  return secret;
}
function signEncodedPayload(encodedPayload) {
  return crypto.createHmac("sha256", signingSecret()).update(encodedPayload).digest("base64url");
}
function signPayload(payload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signEncodedPayload(encoded)}`;
}
function verifyPayload(reference, expectedKind) {
  const raw = String(reference || "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) throw storageError("Invalid storage reference.", "DIRECT_STORAGE_REFERENCE_INVALID", 400);
  const encoded = raw.slice(0, dot);
  const suppliedSignature = raw.slice(dot + 1);
  const expectedSignature = signEncodedPayload(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw storageError("Invalid storage reference signature.", "DIRECT_STORAGE_REFERENCE_INVALID", 403);
  }
  let payload = null;
  try { payload = JSON.parse(base64UrlDecode(encoded)); } catch {
    throw storageError("Invalid storage reference payload.", "DIRECT_STORAGE_REFERENCE_INVALID", 400);
  }
  if (!payload || typeof payload !== "object" || payload.kind !== expectedKind) {
    throw storageError("Unexpected storage reference type.", "DIRECT_STORAGE_REFERENCE_INVALID", 400);
  }
  if (payload.exp && Date.now() > Number(payload.exp)) {
    throw storageError("The upload ticket has expired. Please choose the file again.", "DIRECT_STORAGE_REFERENCE_EXPIRED", 410);
  }
  return payload;
}
function storageError(message, code = "DIRECT_STORAGE_ERROR", status = 500) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function storagePolicy(scope) {
  return POLICIES[String(scope || "").trim().toLowerCase()] || null;
}
export function storageOwner(account = {}) {
  return safeText(
    account?.userSupabaseId
    || account?.teamMemberId
    || account?.id
    || account?.userNotionId
    || account?.username
    || account?.name,
    300,
  );
}
export function payloadMatchesPolicy(payload, policy) {
  const pathValue = normalizePath(payload?.path);
  const prefix = String(policy?.prefix || "").replace(/^\/+|\/+$/g, "");
  return Boolean(prefix && (pathValue === prefix || pathValue.startsWith(`${prefix}/`)));
}
export function canUseStorage(account = {}, policy, { write = false } = {}) {
  const level = directPageAccessLevel(account, policy?.pages || []);
  if (level === null) return { ok: false, status: 503, code: "ACCESS_CONTEXT_UNAVAILABLE", error: "Storage access could not be verified." };
  if (!level) return { ok: false, status: 403, code: "ACCESS_DENIED", error: "You are not authorized to access files on this page." };
  if (write && level === "view") {
    return { ok: false, status: 403, code: "VIEW_ONLY_ACCESS", error: "View-only access: you are not authorized to upload files on this page." };
  }
  return { ok: true, status: 200, level };
}

export function safeFileName(value) {
  const original = safeText(value || "attachment", 500) || "attachment";
  const clean = original.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-220) || `attachment-${Date.now()}`;
  return { original, clean };
}
export function objectPathFor(policy, cleanName) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const random = crypto.randomBytes(12).toString("hex");
  return `${policy.prefix}/${year}/${month}/${Date.now()}-${random}-${cleanName}`;
}

export function createFileReference({ bucket, path, name, type, size, scope }) {
  const payload = {
    v: FILE_REF_VERSION,
    kind: "file",
    bucket: normalizeBucket(bucket),
    path: normalizePath(path),
    name: safeText(name || "Attachment", 500) || "Attachment",
    type: safeText(type || "application/octet-stream", 180) || "application/octet-stream",
    size: Math.max(0, Number(size) || 0),
    scope: safeText(scope, 80),
  };
  if (!payload.bucket || !payload.path || !payload.scope) {
    throw storageError("Incomplete storage file reference.", "DIRECT_STORAGE_REFERENCE_INVALID", 500);
  }
  return signPayload(payload);
}
export function verifyFileReference(reference) { return verifyPayload(reference, "file"); }
export function createUploadReference({ bucket, path, name, type, size, maxSize, scope, owner, expiresInSeconds = DEFAULT_UPLOAD_TTL_SECONDS }) {
  const ttl = Math.max(60, Math.min(30 * 60, Number(expiresInSeconds) || DEFAULT_UPLOAD_TTL_SECONDS));
  const payload = {
    v: UPLOAD_REF_VERSION,
    kind: "upload",
    bucket: normalizeBucket(bucket),
    path: normalizePath(path),
    name: safeText(name || "Attachment", 500) || "Attachment",
    type: safeText(type || "application/octet-stream", 180) || "application/octet-stream",
    size: Math.max(0, Number(size) || 0),
    maxSize: Math.max(1, Number(maxSize) || Number(size) || 1),
    scope: safeText(scope, 80),
    owner: safeText(owner, 300),
    exp: Date.now() + ttl * 1000,
  };
  if (!payload.bucket || !payload.path || !payload.scope || !payload.owner) {
    throw storageError("Incomplete direct upload ticket.", "DIRECT_STORAGE_REFERENCE_INVALID", 500);
  }
  return signPayload(payload);
}
export function verifyUploadReference(reference) { return verifyPayload(reference, "upload"); }
export function fileUrl(reference, name = "") {
  const query = new URLSearchParams({ reference: String(reference || "") });
  if (name) query.set("name", safeText(name, 500));
  return `/next/api/storage/file-direct?${query.toString()}`;
}

function appendDownloadParameter(url, fileName) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  return `${raw}${raw.includes("?") ? "&" : "?"}download=${encodeURIComponent(safeText(fileName || "download", 500) || "download")}`;
}
function pruneSignedDownloadCache(now = Date.now()) {
  if (signedDownloadCache.size < 500) return;
  for (const [key, entry] of signedDownloadCache.entries()) {
    if (!entry || Number(entry.expiresAt || 0) <= now + 10_000) signedDownloadCache.delete(key);
  }
  if (signedDownloadCache.size > 1000) {
    const oldest = [...signedDownloadCache.entries()]
      .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0))
      .slice(0, signedDownloadCache.size - 800);
    oldest.forEach(([key]) => signedDownloadCache.delete(key));
  }
}
export async function signedDownloadUrl(payload, { download = false, expiresIn = DEFAULT_DOWNLOAD_TTL_SECONDS } = {}) {
  const ttl = Math.max(30, Math.min(900, Number(expiresIn) || DEFAULT_DOWNLOAD_TTL_SECONDS));
  const cacheKey = `${payload.bucket}:${payload.path}:${download ? "download" : "inline"}:${payload.name || ""}`;
  const now = Date.now();
  const cached = signedDownloadCache.get(cacheKey);
  if (cached?.url && Number(cached.expiresAt || 0) > now + 30_000) {
    diagnostics.signedUrlCacheHits += 1;
    return cached.url;
  }
  diagnostics.signedUrlCacheMisses += 1;
  const signed = await createSignedDownloadUrl(payload.path, { bucketName: payload.bucket, expiresIn: ttl });
  const url = download ? appendDownloadParameter(signed.signedUrl, payload.name) : signed.signedUrl;
  signedDownloadCache.set(cacheKey, { url, createdAt: now, expiresAt: now + ttl * 1000 });
  pruneSignedDownloadCache(now);
  return url;
}
function parseObjectSize(response) {
  const contentRange = String(response?.headers?.get?.("content-range") || "");
  const totalMatch = contentRange.match(/\/(\d+)\s*$/);
  if (totalMatch) return Number(totalMatch[1]);
  const contentLength = Number(response?.headers?.get?.("content-length") || 0);
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : 0;
}
async function inspectStorageObject(payload) {
  const signed = await createSignedDownloadUrl(payload.path, { bucketName: payload.bucket, expiresIn: 90 });
  let response = await fetch(signed.signedUrl, { method: "HEAD", headers: { Accept: "*/*", "Accept-Encoding": "identity" }, cache: "no-store" });
  let size = parseObjectSize(response);
  if ((!response.ok || !size) && response.status !== 404) {
    try { await response.body?.cancel?.(); } catch {}
    response = await fetch(signed.signedUrl, { method: "GET", headers: { Range: "bytes=0-0", Accept: "*/*", "Accept-Encoding": "identity" }, cache: "no-store" });
    size = parseObjectSize(response);
  }
  const contentType = safeText(response.headers.get("content-type") || payload.type || "application/octet-stream", 180);
  const ok = response.ok || response.status === 206;
  try { await response.body?.cancel?.(); } catch {}
  if (!ok) {
    throw storageError(
      response.status === 404 ? "The uploaded file was not found in storage." : "Storage could not verify the uploaded file.",
      "DIRECT_STORAGE_UPLOAD_NOT_FOUND",
      response.status === 404 ? 404 : 502,
    );
  }
  return { size, contentType };
}
export async function verifyCompletedUpload(payload) {
  try {
    const inspected = await inspectStorageObject(payload);
    const actualSize = Math.max(0, Number(inspected.size) || 0);
    const expectedSize = Math.max(0, Number(payload.size) || 0);
    const maxSize = Math.max(1, Number(payload.maxSize) || expectedSize || 1);
    if (!actualSize) throw storageError("The uploaded file is empty or its size could not be verified.", "DIRECT_STORAGE_SIZE_INVALID", 400);
    if (actualSize > maxSize) throw storageError("The uploaded file is larger than the allowed limit.", "DIRECT_STORAGE_SIZE_INVALID", 413);
    if (expectedSize && actualSize !== expectedSize) throw storageError("The uploaded file did not finish correctly. Please try again.", "DIRECT_STORAGE_SIZE_MISMATCH", 409);
    diagnostics.uploadsVerified += 1;
    return {
      name: payload.name,
      type: inspected.contentType && inspected.contentType !== "application/octet-stream" ? inspected.contentType : (payload.type || inspected.contentType || "application/octet-stream"),
      size: actualSize,
      bucket: payload.bucket,
      path: payload.path,
      scope: payload.scope,
    };
  } catch (error) {
    diagnostics.uploadsRejected += 1;
    try { await deleteStorageObjects([payload.path], { bucketName: payload.bucket }); } catch {}
    throw error;
  }
}

export async function prepareUploadTicket(account = {}, input = {}) {
  const scope = String(input?.scope || "").trim().toLowerCase();
  const policy = storagePolicy(scope);
  if (!policy) throw storageError("Unsupported upload area.", "DIRECT_STORAGE_SCOPE_INVALID", 400);
  const access = canUseStorage(account, policy, { write: true });
  if (!access.ok) throw storageError(access.error, access.code, access.status);
  const owner = storageOwner(account);
  if (!owner) throw storageError("Login is required before uploading files.", "AUTH_REQUIRED", 401);

  const { original, clean } = safeFileName(input?.filename || input?.name);
  const size = Math.max(0, Number(input?.size) || 0);
  const type = safeText(input?.mime || input?.type || "application/octet-stream", 180) || "application/octet-stream";
  if (!size) throw storageError("The selected file is empty.", "DIRECT_STORAGE_FILE_EMPTY", 400);
  if (size > policy.maxSize) throw storageError(`The selected file must be ${Math.round(policy.maxSize / 1024 / 1024)} MB or less.`, "DIRECT_STORAGE_FILE_TOO_LARGE", 413);

  const cfg = getSupabaseConfig();
  const bucket = String(cfg?.storageBucket || "").trim();
  if (!isSupabaseConfigured() || !bucket) throw storageError("Supabase Storage is not configured for direct uploads.", "SUPABASE_STORAGE_NOT_CONFIGURED", 503);

  const objectPath = objectPathFor(policy, clean);
  const uploadTicket = await createSignedUploadUrl(objectPath, { bucketName: bucket });
  const uploadRef = createUploadReference({ bucket, path: objectPath, name: original, type, size, maxSize: policy.maxSize, scope, owner });
  diagnostics.uploadTicketsCreated += 1;
  return {
    ok: true,
    direct: true,
    upload: { method: "PUT", signedUrl: uploadTicket.signedUrl, headers: { "Content-Type": type, "x-upsert": "false" } },
    uploadRef,
    expiresInSeconds: 600,
  };
}

export async function completeUpload(account = {}, reference = "") {
  const payload = verifyUploadReference(reference);
  const policy = storagePolicy(payload.scope);
  if (!policy || !payloadMatchesPolicy(payload, policy)) throw storageError("Unsupported upload area.", "DIRECT_STORAGE_SCOPE_INVALID", 400);
  const access = canUseStorage(account, policy, { write: true });
  if (!access.ok) throw storageError(access.error, access.code, access.status);
  const owner = storageOwner(account);
  if (!owner || owner !== String(payload.owner || "")) throw storageError("This upload ticket belongs to another session.", "DIRECT_STORAGE_OWNER_MISMATCH", 403);
  const verified = await verifyCompletedUpload(payload);
  const fileReference = createFileReference(verified);
  return {
    ok: true,
    direct: true,
    file: {
      name: verified.name,
      url: fileUrl(fileReference, verified.name),
      type: verified.type,
      size: verified.size,
      storagePath: verified.path,
      storageBucket: verified.bucket,
      directStorage: true,
    },
  };
}

export function storageDiagnostics() {
  return {
    ...diagnostics,
    signedUrlCacheEntries: signedDownloadCache.size,
    configured: Boolean(String(process.env.STORAGE_LINK_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim()),
  };
}
export function markFileRedirect() { diagnostics.fileRedirects += 1; }
export function storageErrorPayload(error, fallbackMessage = "Direct storage request failed.") {
  const status = Number(error?.status || error?.statusCode) || 500;
  const code = String(error?.code || "DIRECT_STORAGE_ERROR");
  const unavailable = ["SUPABASE_STORAGE_NOT_CONFIGURED", "DIRECT_STORAGE_SECRET_MISSING", "SUPABASE_NOT_CONFIGURED"].includes(code);
  return {
    status: status >= 400 && status <= 599 ? status : 500,
    body: { ok: false, code: unavailable ? "DIRECT_STORAGE_UNAVAILABLE" : code, fallbackAllowed: unavailable, error: error?.message || fallbackMessage },
  };
}

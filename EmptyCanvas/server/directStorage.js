const crypto = require('crypto');

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

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function signingSecret() {
  const secret = String(
    process.env.STORAGE_LINK_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    '',
  ).trim();
  if (!secret) {
    const error = new Error('Direct Storage needs STORAGE_LINK_SECRET or SESSION_SECRET.');
    error.code = 'DIRECT_STORAGE_SECRET_MISSING';
    error.status = 503;
    throw error;
  }
  return secret;
}

function signEncodedPayload(encodedPayload) {
  return crypto.createHmac('sha256', signingSecret()).update(encodedPayload).digest('base64url');
}

function signPayload(payload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${signEncodedPayload(encoded)}`;
}

function verifyPayload(reference, expectedKind) {
  const raw = String(reference || '').trim();
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) {
    const error = new Error('Invalid storage reference.');
    error.code = 'DIRECT_STORAGE_REFERENCE_INVALID';
    error.status = 400;
    throw error;
  }
  const encoded = raw.slice(0, dot);
  const suppliedSignature = raw.slice(dot + 1);
  const expectedSignature = signEncodedPayload(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    const error = new Error('Invalid storage reference signature.');
    error.code = 'DIRECT_STORAGE_REFERENCE_INVALID';
    error.status = 403;
    throw error;
  }
  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch {
    const error = new Error('Invalid storage reference payload.');
    error.code = 'DIRECT_STORAGE_REFERENCE_INVALID';
    error.status = 400;
    throw error;
  }
  if (!payload || typeof payload !== 'object' || payload.kind !== expectedKind) {
    const error = new Error('Unexpected storage reference type.');
    error.code = 'DIRECT_STORAGE_REFERENCE_INVALID';
    error.status = 400;
    throw error;
  }
  if (payload.exp && Date.now() > Number(payload.exp)) {
    const error = new Error('The upload ticket has expired. Please choose the file again.');
    error.code = 'DIRECT_STORAGE_REFERENCE_EXPIRED';
    error.status = 410;
    throw error;
  }
  return payload;
}

function safeText(value, max = 500) {
  return String(value ?? '').replace(/[\r\n\0]/g, '').trim().slice(0, max);
}

function normalizePath(value) {
  return String(value || '').replace(/^\/+/, '').trim();
}

function normalizeBucket(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '').trim();
}

function createFileReference({ bucket, path, name, type, size, scope }) {
  const payload = {
    v: FILE_REF_VERSION,
    kind: 'file',
    bucket: normalizeBucket(bucket),
    path: normalizePath(path),
    name: safeText(name || 'Attachment', 500) || 'Attachment',
    type: safeText(type || 'application/octet-stream', 180) || 'application/octet-stream',
    size: Math.max(0, Number(size) || 0),
    scope: safeText(scope, 80),
  };
  if (!payload.bucket || !payload.path || !payload.scope) {
    const error = new Error('Incomplete storage file reference.');
    error.code = 'DIRECT_STORAGE_REFERENCE_INVALID';
    error.status = 500;
    throw error;
  }
  return signPayload(payload);
}

function verifyFileReference(reference) {
  return verifyPayload(reference, 'file');
}

function createUploadReference({ bucket, path, name, type, size, maxSize, scope, owner, expiresInSeconds = DEFAULT_UPLOAD_TTL_SECONDS }) {
  const ttl = Math.max(60, Math.min(30 * 60, Number(expiresInSeconds) || DEFAULT_UPLOAD_TTL_SECONDS));
  const payload = {
    v: UPLOAD_REF_VERSION,
    kind: 'upload',
    bucket: normalizeBucket(bucket),
    path: normalizePath(path),
    name: safeText(name || 'Attachment', 500) || 'Attachment',
    type: safeText(type || 'application/octet-stream', 180) || 'application/octet-stream',
    size: Math.max(0, Number(size) || 0),
    maxSize: Math.max(1, Number(maxSize) || Number(size) || 1),
    scope: safeText(scope, 80),
    owner: safeText(owner, 300),
    exp: Date.now() + ttl * 1000,
  };
  if (!payload.bucket || !payload.path || !payload.scope || !payload.owner) {
    const error = new Error('Incomplete direct upload ticket.');
    error.code = 'DIRECT_STORAGE_REFERENCE_INVALID';
    error.status = 500;
    throw error;
  }
  return signPayload(payload);
}

function verifyUploadReference(reference) {
  return verifyPayload(reference, 'upload');
}

function fileUrl(reference) {
  return `/api/storage/file/${encodeURIComponent(reference)}`;
}

function appendDownloadParameter(url, fileName) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  const separator = raw.includes('?') ? '&' : '?';
  return `${raw}${separator}download=${encodeURIComponent(safeText(fileName || 'download', 500) || 'download')}`;
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

async function signedDownloadUrl(supabaseDb, payload, { download = false, expiresIn = DEFAULT_DOWNLOAD_TTL_SECONDS } = {}) {
  const ttl = Math.max(30, Math.min(900, Number(expiresIn) || DEFAULT_DOWNLOAD_TTL_SECONDS));
  const cacheKey = `${payload.bucket}:${payload.path}:${download ? 'download' : 'inline'}:${payload.name || ''}`;
  const now = Date.now();
  const cached = signedDownloadCache.get(cacheKey);
  if (cached?.url && Number(cached.expiresAt || 0) > now + 30_000) {
    diagnostics.signedUrlCacheHits += 1;
    return cached.url;
  }
  diagnostics.signedUrlCacheMisses += 1;
  const signed = await supabaseDb.createSignedDownloadUrl(payload.path, {
    bucketName: payload.bucket,
    expiresIn: ttl,
  });
  const url = download ? appendDownloadParameter(signed.signedUrl, payload.name) : signed.signedUrl;
  signedDownloadCache.set(cacheKey, {
    url,
    createdAt: now,
    expiresAt: now + ttl * 1000,
  });
  pruneSignedDownloadCache(now);
  return url;
}

function parseObjectSize(response) {
  const contentRange = String(response?.headers?.get?.('content-range') || '');
  const totalMatch = contentRange.match(/\/(\d+)\s*$/);
  if (totalMatch) return Number(totalMatch[1]);
  const contentLength = Number(response?.headers?.get?.('content-length') || 0);
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : 0;
}

async function inspectStorageObject(supabaseDb, payload) {
  const signed = await supabaseDb.createSignedDownloadUrl(payload.path, {
    bucketName: payload.bucket,
    expiresIn: 90,
  });
  let response = await fetch(signed.signedUrl, {
    method: 'HEAD',
    headers: { Accept: '*/*', 'Accept-Encoding': 'identity' },
  });
  let size = parseObjectSize(response);
  if ((!response.ok || !size) && response.status !== 404) {
    try { await response.body?.cancel?.(); } catch {}
    response = await fetch(signed.signedUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', Accept: '*/*', 'Accept-Encoding': 'identity' },
    });
    size = parseObjectSize(response);
  }
  const contentType = safeText(response.headers.get('content-type') || payload.type || 'application/octet-stream', 180);
  const ok = response.ok || response.status === 206;
  try { await response.body?.cancel?.(); } catch {}
  if (!ok) {
    const error = new Error(response.status === 404 ? 'The uploaded file was not found in storage.' : 'Storage could not verify the uploaded file.');
    error.code = 'DIRECT_STORAGE_UPLOAD_NOT_FOUND';
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return { size, contentType };
}

async function verifyCompletedUpload(supabaseDb, payload) {
  let inspected;
  try {
    inspected = await inspectStorageObject(supabaseDb, payload);
    const actualSize = Math.max(0, Number(inspected.size) || 0);
    const expectedSize = Math.max(0, Number(payload.size) || 0);
    const maxSize = Math.max(1, Number(payload.maxSize) || expectedSize || 1);
    if (!actualSize) {
      const error = new Error('The uploaded file is empty or its size could not be verified.');
      error.code = 'DIRECT_STORAGE_SIZE_INVALID';
      error.status = 400;
      throw error;
    }
    if (actualSize > maxSize) {
      const error = new Error('The uploaded file is larger than the allowed limit.');
      error.code = 'DIRECT_STORAGE_SIZE_INVALID';
      error.status = 413;
      throw error;
    }
    // Browser PUT uploads should preserve the exact Blob size. A mismatch means
    // the ticket metadata was modified or the upload was incomplete.
    if (expectedSize && actualSize !== expectedSize) {
      const error = new Error('The uploaded file did not finish correctly. Please try again.');
      error.code = 'DIRECT_STORAGE_SIZE_MISMATCH';
      error.status = 409;
      throw error;
    }
    diagnostics.uploadsVerified += 1;
    const verifiedType = inspected.contentType && inspected.contentType !== 'application/octet-stream'
      ? inspected.contentType
      : (payload.type || inspected.contentType || 'application/octet-stream');
    return {
      name: payload.name,
      type: verifiedType,
      size: actualSize,
      bucket: payload.bucket,
      path: payload.path,
      scope: payload.scope,
    };
  } catch (error) {
    diagnostics.uploadsRejected += 1;
    try {
      await supabaseDb.deleteStorageObjects([payload.path], { bucketName: payload.bucket });
    } catch {}
    throw error;
  }
}

function markUploadTicketCreated() {
  diagnostics.uploadTicketsCreated += 1;
}

function markFileRedirect() {
  diagnostics.fileRedirects += 1;
}

function getDiagnostics() {
  return {
    ...diagnostics,
    signedUrlCacheEntries: signedDownloadCache.size,
    configured: Boolean(
      String(process.env.STORAGE_LINK_SECRET || process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
    ),
  };
}

module.exports = {
  createFileReference,
  verifyFileReference,
  createUploadReference,
  verifyUploadReference,
  fileUrl,
  signedDownloadUrl,
  verifyCompletedUpload,
  markUploadTicketCreated,
  markFileRedirect,
  getDiagnostics,
};

// Server-only usage: never send the signing secret to a browser or use it in NEXT_PUBLIC_ env vars.
import {createHmac, timingSafeEqual} from 'node:crypto';

export const VALID_LABEL_KINDS = Object.freeze(['kit','carton']);
export const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
export function labelIdentity(kind, id) {
  if (!VALID_LABEL_KINDS.includes(kind) || typeof id !== 'string' || !UUID_RE.test(id)) return null;
  return `${kind}:${id.toLowerCase()}`;
}
export function configuredLabelSecret() {
  const secret = String(process.env.PREPARING_LABEL_QR_SECRET || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    const error = new Error('Set PREPARING_LABEL_QR_SECRET (at least 32 random characters) on the Next.js server before printing QR labels.');
    error.status = 503;
    throw error;
  }
  return secret;
}
export function labelToken(kind, id, secret) {
  const identity = labelIdentity(kind, id);
  if (!identity || typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Invalid QR label identity or signing secret.');
  // v1 domain separation: keep tokens independent of other HMAC uses in the ERP.
  return createHmac('sha256', secret).update(`preparing-label:v1:${identity}`).digest('base64url');
}
export function verifyLabelToken(kind, id, token, secret) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  try {
    const expected = Buffer.from(labelToken(kind, id, secret));
    const actual = Buffer.from(token);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
export function publicLabelUrl(kind, id, token, baseUrl) {
  if (!labelIdentity(kind, id) || typeof token !== 'string') throw new Error('Invalid QR label URL.');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Configure a valid public label URL.');
  // Only the root origin is used; the Next app is mounted under /next.
  return `${base.origin}/next/label/${kind}/${id.toLowerCase()}?token=${encodeURIComponent(token)}`;
}

export function configuredPublicLabelBase() {
  const url=String(process.env.PREPARING_LABEL_PUBLIC_URL||'').trim();
  try {
    const base=new URL(url);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname!=='/') throw new Error();
    if (process.env.NODE_ENV==='production' && base.protocol!=='https:') throw new Error();
    return base.origin;
  } catch {
    const error=new Error('Set PREPARING_LABEL_PUBLIC_URL to the public HTTPS ERP origin (without /next).');
    error.status=503;throw error;
  }
}

// Server-only capability links. A signed URL grants read-only access to exactly
// one stored expense attachment or its verified linked order components.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
const text = v => String(v ?? '').trim();
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const numberPattern = /^\d{1,18}$/;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('base64url');
function secretFor(secret) {
  const key = [secret ?? process.env.ERP_EXPENSE_SHARE_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_KEY, process.env.SESSION_SECRET].map(text).find(v => v.length >= 32);
  if (!key) { const error = new Error('Configure ERP_EXPENSE_SHARE_SECRET (at least 32 random characters) to export public links.'); error.status = 503; throw error; }
  return key;
}
function validIdentity(id, kind, target) {
  return idPattern.test(id) && (kind === 'order' ? (target === 'all' || numberPattern.test(target)) : kind === 'screenshot' && /^(0|[1-9]\d{0,3})$/.test(target));
}
function signature(id, kind, target, fingerprint, secret) {
  return createHmac('sha256', secretFor(secret)).update(JSON.stringify(['erp-expense-public-share-v1', id, kind, target, fingerprint])).digest('base64url');
}
export function verifyExpenseShare(id, kind, target, token, { secret } = {}) {
  if (!validIdentity(id, kind, target) || !/^[\w-]{43}\.[\w-]{43}$/.test(token || '')) return '';
  const [fingerprint, sig] = token.split('.');
  try { return timingSafeEqual(Buffer.from(sig), Buffer.from(signature(id, kind, target, fingerprint, secret))) ? fingerprint : ''; } catch { return ''; }
}
export function expenseShareUrl(baseUrl, id, kind, target, fingerprint, { secret } = {}) {
  id = text(id); target = text(target);
  if (!validIdentity(id, kind, target) || !/^[\w-]{43}$/.test(fingerprint || '')) return '';
  let base; try { base = new URL(baseUrl); } catch { return ''; }
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) return '';
  const token = `${fingerprint}.${signature(id, kind, target, fingerprint, secret)}`;
  return `${base.origin}/next/share/expenses/${kind}?${new URLSearchParams({ expenseId: id, target, token })}`;
}
export function expenseOrderNumbers(item = {}) {
  // Use original label, not the derived orderId (legacy receipt number '25'
  // and UUID fragments can otherwise be incorrectly treated as ORD-25).
  if (!(Number(item.cashOut) > 0)) return [];
  return [...new Set((Array.isArray(item.orders) ? item.orders : []).map(o => {
    const m = text(o?.label || o?.orderId).match(/^(?:ORD[-\s]?|ord:)(\d{1,18})$/i);
    return m?.[1] || '';
  }).filter(Boolean))];
}
export function expenseOrderReference(item = {}) {
  const numbers = expenseOrderNumbers(item);
  const raw = text(item.ordersRaw);
  const ids = [...new Set(raw.split(',').map(text).filter(Boolean))];
  if (!numbers.length || numbers.length > 25 || !ids.length || ids.length > 200 || !ids.every(id => idPattern.test(id) && !/^ORD[-\s]?\d+$/i.test(id))) return null;
  return { numbers, ids, fingerprint: digest([numbers, ids]) };
}
export function expenseShotEntries(item = {}) {
  const shots = Array.isArray(item.screenshots) ? item.screenshots : [];
  const entries = shots.map((shot, index) => ({ name: text(shot?.name || shot?.filename || shot?.fileName) || `Screenshot ${index + 1}`, url: text(shot?.url || shot?.href || shot?.publicUrl || shot?.public_url || shot?.signedUrl || shot?.signedURL || shot?.downloadUrl || shot?.downloadURL) })).filter(shot => shot.url);
  if (entries.length) return entries;
  const url = text(item.screenshotUrl || item.screenshot_url);
  return url ? [{ name: text(item.screenshotName || item.screenshot_name) || 'Screenshot', url }] : [];
}
export const screenshotFingerprint = shot => shot?.url ? digest([shot.url]) : '';
export function expenseScreenshotShareLink(item, index, baseUrl, options) {
  return expenseShareUrl(baseUrl, item.id, 'screenshot', index, screenshotFingerprint(expenseShotEntries(item)[index]), options);
}
// Never turn a user-editable receipt URL into a privileged read of arbitrary
// storage objects. Only the ERP's expense upload namespaces can be re-signed.
export function expenseStorageObject(rawUrl, config = {}) {
  try {
    const url = new URL(rawUrl), base = new URL(config.url);
    if (url.origin !== base.origin || url.username || url.password) return null;
    const prefix = `${base.pathname.replace(/\/$/, '')}/storage/v1/object/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const parts = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
    const [mode, bucket, ...path] = parts;
    if (!['public', 'sign', 'authenticated'].includes(mode) || bucket !== config.storageBucket || path.some(p => !p || p === '.' || p === '..' || /[\\/\x00-\x1f]/.test(p))) return null;
    const key = path.join('/');
    if (!/^(?:(?:receipt|cashin|settlement)-\d{10,}-|expense-edit-[A-Za-z0-9_-]+-\d{10,}-)[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(key)) return null;
    return { bucket, key };
  } catch { return null; }
}
// Exact relation IDs are the authority. Never fetch arbitrary orders just
// because an expense's free-text reason looks like an order number.
export function groupSharedOrderRows(reference, rows, target) {
  if (!reference || !Array.isArray(rows) || rows.length !== reference.ids.length) return null;
  const byId = new Map(rows.map(r => [text(r?.id), r]));
  if (byId.size !== reference.ids.length || reference.ids.some(id => !byId.has(id))) return null;
  const groups = new Map(reference.numbers.map(n => [n, []]));
  for (const id of reference.ids) {
    const row = byId.get(id), n = text(row.order_number);
    if (!groups.has(n)) return null;
    groups.get(n).push(row);
  }
  if ([...groups.values()].some(group => !group.length)) return null;
  return target === 'all' ? [...groups.values()] : groups.has(target) ? [groups.get(target)] : null;
}

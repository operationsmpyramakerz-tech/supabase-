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
// Historical picker labels include the order type (e.g. ORD-129 - Request
// Maintenance). Parse the complete structured label, never free-text Reason
// or a numeric receipt number. Do not use the derived orderId if a label exists.
export function expenseOrderNumber(order = {}) {
  const label = text(order?.label || order?.orderId);
  const match = label.match(/^(?:ORD|ORDER)[-:\s]?(\d{1,18})(?:\s*(?:[-–—·]|\|)\s*(?:Request(?:\s+Products|\s+Maintenance)?|Withdraw(?:\s+Products)?|Withdrawal|Maintenance|Delivery|Approved|Pending|Shipped|Arrived|Delivered|Under Supervision))?$/i);
  return match ? String(BigInt(match[1])) : '';
}
export function expenseOrderNumbers(item = {}) {
  if (!(Number(item.cashOut) > 0)) return [];
  return [...new Set((Array.isArray(item.orders) ? item.orders : []).map(expenseOrderNumber).filter(Boolean))];
}
function relationTokens(value) {
  if (Array.isArray(value)) {
    if (value.some(entry => typeof entry !== 'string' && typeof entry !== 'number')) return [];
    return value.map(text).filter(Boolean);
  }
  if (value && typeof value === 'object') return [];
  const raw = text(value);
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? relationTokens(parsed) : []; }
    catch { return []; }
  }
  return raw.split(/[,\n]+/).map(text).filter(Boolean);
}
export function expenseOrderReference(item = {}) {
  const numbers = expenseOrderNumbers(item);
  const ids = [...new Set(relationTokens(item.ordersRaw))];
  if (!numbers.length || numbers.length > 25 || !ids.length || ids.length > 200) return null;
  // Only explicit group references stored in orders_raw may authorize a whole
  // historical group. The names must agree exactly; mixed raw IDs/group keys
  // and free-text labels alone cannot grant access.
  const groupNumbers = ids.map(id => /^(?:ORD|ORDER)[-:\s]?(\d{1,18})$/i.exec(id)?.[1]);
  if (groupNumbers.some(Boolean)) {
    const groups = [...new Set(groupNumbers.filter(Boolean).map(n => String(BigInt(n))))];
    if (groupNumbers.some(n => !n) || groups.length !== numbers.length || numbers.some(n => !groups.includes(n))) return null;
    return { numbers, ids, mode: 'group', fingerprint: digest(['legacy-group', numbers, ids]) };
  }
  if (!ids.every(id => idPattern.test(id))) return null;
  return { numbers, ids, fingerprint: digest([numbers, ids]) };
}
// Same-origin UI links use exactly the same capability as Excel; the signing
// secret stays on the server. No dependency on Host headers or client routing.
export function expensePublicOrderHref(item, number, options) {
  const reference = expenseOrderReference(item);
  if (!reference || !reference.numbers.includes(number)) return '';
  const url = expenseShareUrl('https://erp.invalid', item.id, 'order', number, reference.fingerprint, options);
  return url ? url.slice('https://erp.invalid'.length) : '';
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

// Group-key legacy records are a distinct signed mode, not a fallback from a
// missing/mismatched primary-key relationship.
export function groupExplicitSharedOrderRows(reference, rows, target) {
  if (reference?.mode !== 'group' || !Array.isArray(rows) || !rows.length || rows.length > 200) return null;
  const groups = new Map(reference.numbers.map(n => [n, []]));
  const ids = new Set();
  for (const row of rows) {
    const id = text(row?.id), n = text(row?.order_number);
    if (!id || ids.has(id) || !groups.has(n)) return null;
    ids.add(id); groups.get(n).push(row);
  }
  if ([...groups.values()].some(group => !group.length)) return null;
  return target === 'all' ? [...groups.values()] : groups.has(target) ? [groups.get(target)] : null;
}

// Resolve imported Notion row IDs only if an actual order row has the exact
// old ID. Never infer a match merely from the expense's display label.
const legacyUuid = value => {
  const compact = text(value).replace(/-/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(compact) ? compact : '';
};
export async function loadSharedExpenseRows(reference, { loadByIds, loadByLegacyId, loadByNumbers }) {
  if (reference.mode === 'group') return await loadByNumbers(reference.numbers);
  try { return await loadByIds(reference.ids); } catch (error) {
    // Only an imported UUID can require a legacy alias lookup. Numeric or
    // other missing row IDs cannot silently become an order number lookup.
    if (!reference.ids.some(legacyUuid)) throw error;
    const result = [];
    for (const id of reference.ids) {
      let rows;
      try { rows = await loadByIds([id]); } catch (error) {
        const uuid = legacyUuid(id);
        if (!uuid) throw error;
        rows = await loadByLegacyId(uuid);
      }
      if (!Array.isArray(rows) || rows.length !== 1) return [];
      const row = rows[0];
      const aliases = ['id', 'notion_page_id', 'notion_id', 'page_id', 'legacy_id'];
      if (text(row.id) !== id && (!legacyUuid(id) || !aliases.some(key => legacyUuid(row[key]) === legacyUuid(id)))) return [];
      // The group verifier checks row IDs against the signed original refs.
      // Preserve the canonical row separately to detect aliases of one row.
      result.push({ ...row, __shareCanonicalId: text(row.id), id });
    }
    if (new Set(result.map(row => row.__shareCanonicalId)).size !== result.length) return [];
    return result;
  }
}

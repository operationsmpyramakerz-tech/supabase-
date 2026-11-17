import { expenseForPublicShare } from '../../../../lib/expenses-data';
import { loadRawOrderRowsByIds, serializeOperationsOrderDetail } from '../../../../lib/order-details-data';
import { createSignedDownloadUrl, getSupabaseConfig, select } from '../../../../lib/supabase-rest';
import { expenseOrderReference, expenseShotEntries, screenshotFingerprint, expenseStorageObject, groupSharedOrderRows, groupExplicitSharedOrderRows, loadSharedExpenseRows, verifyExpenseShare } from '../../../../lib/expense-public-share.mjs';
import { renderPublicExpenseOrders } from '../../../../lib/expense-public-order-template.mjs';
import { parseStrictImageDataUrl } from '../../../../lib/strict-upload-image.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" };
const unavailable = (status = 404) => new Response('This shared link is invalid, or the shared item is no longer available.', { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
const maxBytes = 15 * 1024 * 1024;
function imageResponse(dataUrl) {
  const { buffer, mime } = parseStrictImageDataUrl(dataUrl, { maxBytes, label: 'Receipt image' });
  return new Response(buffer, { headers: { ...headers, 'Content-Type': mime, 'Content-Disposition': 'inline', 'Content-Length': String(buffer.length) } });
}
async function screenshotResponse(shot) {
  if (shot.url.startsWith('data:image/')) return imageResponse(shot.url);
  const config = getSupabaseConfig();
  const object = expenseStorageObject(shot.url, config);
  if (object) {
    // Renew the signed download on every request, and serve it through the ERP
    // so recipients need not be on the private Supabase network or logged in.
    const { signedUrl } = await createSignedDownloadUrl(object.key, { bucketName: object.bucket, expiresIn: 180 });
    const signed = new URL(signedUrl);
    if (signed.origin !== new URL(config.url).origin || signed.username || signed.password) return unavailable();
    const response = await fetch(signed, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) return unavailable();
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try { for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) return unavailable(); chunks.push(Buffer.from(value)); } } finally { await reader.cancel().catch(()=>{}); }
    const buffer = Buffer.concat(chunks);
    const mime = buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'image/png' : buffer.subarray(0,3).equals(Buffer.from('ffd8ff','hex')) ? 'image/jpeg' : buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP' ? 'image/webp' : '';
    if (!mime) return unavailable();
    return imageResponse(`data:${mime};base64,${buffer.toString('base64')}`);
  }
  // Legacy receipts may already be hosted on an external public service. Never
  // proxy arbitrary URLs or give a service-role signed URL to other buckets.
  const url = new URL(shot.url);
  if (url.protocol !== 'https:' || url.username || url.password) return unavailable();
  if (config.url && url.origin === new URL(config.url).origin && !url.pathname.includes('/storage/v1/object/public/')) return unavailable();
  return new Response(null, { status: 302, headers: { ...headers, Location: url.href } });
}
// Exact compatibility reads for imported IDs. All calls happen only after
// the signed expense reference has been validated.
async function loadLegacyOrderId(uuid) {
  const table = String(process.env.SUPABASE_ORDERS_TABLE || 'orders');
  const hyphenated = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
  const rowsById = new Map();
  for (const column of ['id', 'notion_page_id', 'notion_id', 'page_id', 'legacy_id']) {
    try {
      const matches = await select(table, { select: '*', [column]: `in.(${uuid},${hyphenated})`, limit: '2' }, { profileName: 'expenses.public-legacy-order-id' });
      if (!Array.isArray(matches) || matches.length > 1) return [];
      for (const row of matches) rowsById.set(String(row.id), row);
    } catch (error) {
      // Older schemas do not have every legacy column, and numeric PKs do
      // not accept UUID filters. Other failures must not authorize a fallback.
      const details = `${error?.message || ''} ${JSON.stringify(error?.details || {})}`;
      if (Number(error?.status) !== 400 || !/column|22P02|invalid input syntax/i.test(details)) throw error;
    }
  }
  return [...rowsById.values()];
}
export async function GET(request, { params }) {
  const { kind } = await params;
  const url = new URL(request.url);
  const id = url.searchParams.get('expenseId') || '', target = url.searchParams.get('target') || '', token = url.searchParams.get('token') || '';
  // No anonymous database queries before the capability signature is verified.
  const fingerprint = verifyExpenseShare(id, kind, target, token);
  if (!fingerprint) return unavailable();
  try {
    const item = await expenseForPublicShare(id);
    if (!item || item.id !== id) return unavailable();
    if (kind === 'screenshot') {
      const shot = expenseShotEntries(item)[Number(target)];
      if (!shot || screenshotFingerprint(shot) !== fingerprint) return unavailable();
      return await screenshotResponse(shot);
    }
    const reference = expenseOrderReference(item);
    if (!reference || reference.fingerprint !== fingerprint) return unavailable();
    const rows = await loadSharedExpenseRows(reference, {
      loadByIds: loadRawOrderRowsByIds,
      loadByLegacyId: loadLegacyOrderId,
      loadByNumbers: numbers => select(String(process.env.SUPABASE_ORDERS_TABLE || 'orders'), {
        select: '*', order_number: `in.(${numbers.join(',')})`, order: 'notion_created_time.desc,id.desc', limit: '201',
      }, { profileName: 'expenses.public-legacy-order-group' }),
    });
    const groups = reference.mode === 'group'
      ? groupExplicitSharedOrderRows(reference, rows, target)
      : groupSharedOrderRows(reference, rows, target);
    if (!groups) return unavailable();
    return new Response(renderPublicExpenseOrders(groups.map(rows => rows.map(serializeOperationsOrderDetail))), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch { return unavailable(); }
}

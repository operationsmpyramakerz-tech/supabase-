/** Pure, deliberately strict primitives for the legacy storage reference cutover. */
import crypto from 'node:crypto';
import { MIGRATION_SOURCES, safeStoragePath } from './legacy-storage-migration-policy.mjs';

export const REFERENCE_PLAN_FORMAT = 'pyramakerz-storage-reference-cutover';
export const REFERENCE_PLAN_VERSION = 1;
export const WORK_FILES_PREFIX = '__TM_WORK_FILES_JSON__:';
const FILE_FIELDS = new Set(['url', 'href', 'publicUrl', 'attachmentUrl', 'attachment_url']);

export function approvedField(table, field) {
  return MIGRATION_SOURCES.some(source => source.table === table && source.columns.includes(field) &&
    !['ticket_id', 'section_id', 'database_id', 'review_id'].includes(field));
}

export function approvedAssociation(item, association) {
  const source = MIGRATION_SOURCES.find(row => row.table === association?.table && row.scope === item?.scope);
  return !!(source && approvedField(association.table, association.field) &&
    item.sourcePath?.startsWith(`${source.prefix}/`) && safeStoragePath(item.sourcePath) &&
    typeof association.oldUrl === 'string' && association.oldUrl.length > 0 &&
    /^[A-Za-z0-9_-]{1,128}$/.test(String(association.recordId || '')));
}

export function validateProtectedUrl(item, secret, privateBucket) {
  const input = String(item?.proposedProtectedUrl || '');
  const url = new URL(input, 'https://erp.invalid');
  if (url.origin !== 'https://erp.invalid' || url.pathname !== '/next/api/storage/file-direct') throw new Error('Invalid internal protected file URL.');
  const reference = url.searchParams.get('reference') || '';
  const segments = reference.split('.');
  if (segments.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(segments[0]) || !/^[A-Za-z0-9_-]+$/.test(segments[1])) throw new Error('Invalid protected file signature.');
  const expected = crypto.createHmac('sha256', secret).update(segments[0]).digest('base64url');
  const signature = Buffer.from(segments[1]);
  if (signature.length !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(signature, Buffer.from(expected))) throw new Error('Protected reference signature is inconsistent with STORAGE_LINK_SECRET.');
  const payload = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'));
  if (payload.v !== 1 || payload.kind !== 'file' || payload.recordAuthRequired !== true ||
      payload.bucket !== privateBucket || payload.bucket !== item.destinationBucket ||
      payload.path !== item.destinationPath || payload.path !== item.sourcePath ||
      payload.scope !== item.scope) throw new Error('Protected reference does not match the verified storage object.');
  return input;
}

function rewriteJsonValue(value, oldUrl, newUrl) {
  let count = 0;
  const visit = (node, key = '') => {
    if (Array.isArray(node)) return node.map(item => visit(item));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, visit(v, k)]));
    if (typeof node === 'string' && FILE_FIELDS.has(key) && node === oldUrl) { count++; return newUrl; }
    return node;
  };
  const result = visit(value);
  return { value: result, count };
}

/** Update only exact URL-valued file properties, never arbitrary text fragments. */
export function rewriteFieldReference(table, field, value, oldUrl, newUrl) {
  if (!approvedField(table, field) || typeof oldUrl !== 'string' || !oldUrl || !newUrl) throw new Error('Unapproved migration field or URL.');
  if (field === 'attachment_url' || field === 'evidence_text') {
    return value === oldUrl ? { value: newUrl, count: 1 } : { value, count: 0 };
  }
  if (field === 'work_file_url') {
    if (value === oldUrl) return { value: newUrl, count: 1 };
    if (typeof value === 'string' && value.startsWith(WORK_FILES_PREFIX)) {
      let parsed;
      try { parsed = JSON.parse(value.slice(WORK_FILES_PREFIX.length)); } catch { throw new Error('Malformed work files JSON; manual review required.'); }
      const changed = rewriteJsonValue(parsed, oldUrl, newUrl);
      return { value: changed.count ? `${WORK_FILES_PREFIX}${JSON.stringify(changed.value)}` : value, count: changed.count };
    }
    return { value, count: 0 };
  }
  if (field === 'attachments' || field === 'data') {
    if (typeof value === 'string') {
      // Older columns may be textual JSON; preserve their type.
      let parsed;
      try { parsed = JSON.parse(value); } catch { throw new Error('Malformed attachment JSON; manual review required.'); }
      const changed = rewriteJsonValue(parsed, oldUrl, newUrl);
      return { value: changed.count ? JSON.stringify(changed.value) : value, count: changed.count };
    }
    return rewriteJsonValue(value, oldUrl, newUrl);
  }
  throw new Error('Field has no supported safe reference transform.');
}

export function rewriteAllAssociations(table, field, original, links) {
  let value = original;
  for (const link of links) {
    const changed = rewriteFieldReference(table, field, value, link.oldUrl, link.protectedUrl);
    if (changed.count < 1) throw new Error('Stale or unsupported reference; row requires manual review.');
    value = changed.value;
  }
  return value;
}

export function sameValue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

export function validateCutoverPlan(plan) {
  if (plan?.format !== REFERENCE_PLAN_FORMAT || plan.version !== REFERENCE_PLAN_VERSION ||
      plan.stage !== 'planned' || !Array.isArray(plan.operations) || !Array.isArray(plan.objects) ||
      !plan.sourceBucket || !plan.destinationBucket || plan.sourceBucket === plan.destinationBucket ||
      plan.operations.length > 50000 || plan.objects.length > 50000) throw new Error('Invalid cutover plan.');
  const expectedLinks = new Set();
  for (const item of plan.objects) {
    if (item.state !== 'verified-copy' || item.sourceBucket !== plan.sourceBucket ||
      item.destinationBucket !== plan.destinationBucket || item.sourcePath !== item.destinationPath ||
      !safeStoragePath(item.sourcePath) || !/^[0-9a-f]{64}$/.test(item.sha256 || '') ||
      typeof item.proposedProtectedUrl !== 'string' || !Array.isArray(item.associations) || !item.associations.length) {
      throw new Error('Unverified object in cutover plan.');
    }
    for (const assoc of item.associations) {
      if (!approvedAssociation(item, assoc)) throw new Error('Unapproved association in cutover plan.');
      expectedLinks.add(JSON.stringify([assoc.table, String(assoc.recordId), assoc.field, assoc.oldUrl, item.proposedProtectedUrl]));
    }
  }
  const seen = new Set();
  const actualLinks = new Set();
  for (const op of plan.operations) {
    if (!approvedField(op.table, op.field) || !/^[A-Za-z0-9_-]{1,128}$/.test(String(op.recordId || '')) ||
      !Array.isArray(op.links) || !op.links.length || sameValue(op.before, op.after)) throw new Error('Invalid cutover plan operation.');
    const key = `${op.table}\0${op.recordId}\0${op.field}`;
    if (seen.has(key)) throw new Error('Duplicate cutover operation.');
    seen.add(key);
    for (const link of op.links) {
      const linkKey = JSON.stringify([op.table, String(op.recordId), op.field, link.oldUrl, link.protectedUrl]);
      if (actualLinks.has(linkKey)) throw new Error('Duplicate reference link in cutover plan.');
      actualLinks.add(linkKey);
      if (!expectedLinks.has(linkKey)) throw new Error('Cutover reference does not match a copied object association.');
    }
  }
  if (actualLinks.size !== expectedLinks.size) throw new Error('Cutover plan does not include every copied object association.');
  return plan;
}

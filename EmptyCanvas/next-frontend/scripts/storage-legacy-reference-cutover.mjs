#!/usr/bin/env node
/**
 * Phase 2N6C: EXPLICIT reference cutover for previously verified private copies.
 * Nothing runs on import. No public objects are deleted or made private.
 *
 * plan     --manifest /secure/copied.json --out /secure/plan.json
 * apply    --plan /secure/plan.json --journal /secure/journal.json --execute
 * verify   --plan /secure/plan.json
 * rollback --plan /secure/plan.json --journal /secure/journal.json --execute
 *
 * Use --resume ONLY after investigating an interrupted apply/rollback.
 * Manifests, plans and journals are confidential: keep outside Git and backup.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATION_SOURCES, encodedStoragePath } from '../lib/legacy-storage-migration-policy.mjs';
import {
  REFERENCE_PLAN_FORMAT, REFERENCE_PLAN_VERSION, approvedAssociation,
  rewriteAllAssociations, sameValue, validateProtectedUrl, validateCutoverPlan,
} from '../lib/legacy-storage-reference-policy.mjs';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OBJECTS = 50000;
const usage = `ERP legacy file reference cutover (never deletes storage objects)
  plan     --manifest /secure/copied.json --out /secure/plan.json
  apply    --plan /secure/plan.json --journal /secure/journal.json --execute [--resume]
  verify   --plan /secure/plan.json
  rollback --plan /secure/plan.json --journal /secure/journal.json --execute [--resume]
Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET,
ERP_STORAGE_PRIVATE_BUCKET, STORAGE_LINK_SECRET (or deployed SESSION_SECRET).
Also install sql/ERP_Phase2N6C_Legacy_Reference_CAS.sql before apply.
Plan, journal, manifest and secrets must never be uploaded to Git or shared.
`;

function fail(message) { throw new Error(message); }
function parseOptions(argv) {
  const [action, ...rest] = argv;
  if (!action || ['help', '--help', '-h'].includes(action)) return { action: 'help' };
  if (!['plan', 'apply', 'verify', 'rollback'].includes(action)) fail('Unknown action.');
  const options = { action, execute: false, resume: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--execute' || flag === '--resume') { options[flag.slice(2)] = true; continue; }
    if (!['--manifest', '--plan', '--journal', '--out'].includes(flag)) fail(`Unsupported option: ${flag}`);
    if (!rest[i + 1] || rest[i + 1].startsWith('--')) fail(`Missing argument for ${flag}`);
    if (options[flag.slice(2)]) fail(`Repeated option: ${flag}`);
    options[flag.slice(2)] = path.resolve(rest[++i]);
  }
  if (action === 'plan' && (!options.manifest || !options.out)) fail('Plan requires --manifest and --out.');
  if (['apply', 'rollback'].includes(action) && (!options.plan || !options.journal || !options.execute)) fail(`${action} requires --plan, --journal and explicit --execute.`);
  if (action === 'verify' && !options.plan) fail('Verify requires --plan.');
  if (options.resume && !['apply', 'rollback'].includes(action)) fail('--resume is only for apply/rollback.');
  if (new Set([options.manifest, options.out, options.plan, options.journal].filter(Boolean)).size !==
    [options.manifest, options.out, options.plan, options.journal].filter(Boolean).length) fail('Input and output paths must be different.');
  return options;
}

function configFromEnv() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const source = String(process.env.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_BUCKET || 'operations-files').trim();
  const destination = String(process.env.ERP_STORAGE_PRIVATE_BUCKET || '').trim();
  const secret = String(process.env.STORAGE_LINK_SECRET || process.env.SESSION_SECRET || '').trim();
  if (!/^https:\/\/[^/]+$/.test(url) || !key) fail('Set server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  if (!/^[A-Za-z0-9._-]{3,100}$/.test(source) || !/^[A-Za-z0-9._-]{3,100}$/.test(destination) || source === destination) fail('Set separate, valid source/private Storage buckets.');
  if (!secret) fail('Set STORAGE_LINK_SECRET (matching your deployed app), or SESSION_SECRET. Never guess a signing secret.');
  return { url, key, source, destination, secret };
}

async function fetchSupabase(cfg, route, { method = 'GET', json, binary = false } = {}) {
  const response = await fetch(`${cfg.url}${route}`, {
    method, cache: 'no-store',
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, ...(json === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: json === undefined ? undefined : JSON.stringify(json),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) fail(`Supabase ${method} request failed (HTTP ${response.status}). No secret or response body printed.`);
  if (!binary) return response.json();
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_FILE_BYTES) fail('Object exceeds safe 20MiB verification limit.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) fail('Object exceeds safe 20MiB verification limit.');
  return bytes;
}

async function readJson(location) { return JSON.parse(await fs.readFile(location, 'utf8')); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function privateWrite(location, value, { initial = false } = {}) {
  const file = path.resolve(location);
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (initial) {
    try { await fs.access(file); fail('Refusing to overwrite existing output.'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, file);
    await fs.chmod(file, 0o600);
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}

async function readCopiedManifest(location, cfg) {
  const contents = await fs.readFile(location);
  const manifest = JSON.parse(contents.toString('utf8'));
  if (manifest?.format !== 'pyramakerz-storage-migration' || manifest.version !== 1 ||
    manifest.stage !== 'copied-unlinked' || !Array.isArray(manifest.objects) || !manifest.objects.length ||
    manifest.objects.length > MAX_OBJECTS || manifest.sourceBucket !== cfg.source ||
    manifest.destinationBucket !== cfg.destination) fail('Expected fully copied Phase 2N6B manifest for configured buckets.');
  for (const item of manifest.objects) {
    if (item.state !== 'verified-copy' || item.sourceBucket !== cfg.source || item.destinationBucket !== cfg.destination ||
      item.sourcePath !== item.destinationPath || !/^[0-9a-f]{64}$/.test(item.sha256 || '') ||
      !Array.isArray(item.associations) || !item.associations.length ||
      item.associations.some(link => !approvedAssociation(item, link, cfg.url)) ||
      !MIGRATION_SOURCES.some(src => src.scope === item.scope)) fail('Manifest contains an unverified object or an unknown record association.');
    validateProtectedUrl(item, cfg.secret, cfg.destination);
  }
  return { manifest, digest: hash(contents) };
}

async function readCurrent(cfg, table, rowId, field) {
  const query = new URLSearchParams({ select: `id,${field}`, id: `eq.${rowId}`, limit: '2' });
  const rows = await fetchSupabase(cfg, `/rest/v1/${encodeURIComponent(table)}?${query}`);
  if (!Array.isArray(rows) || rows.length !== 1) fail(`Record unavailable or ambiguous: ${table}, ${field}.`);
  return rows[0][field];
}

async function checkBucket(cfg) {
  const bucket = await fetchSupabase(cfg, `/storage/v1/bucket/${encodeURIComponent(cfg.destination)}`);
  if (bucket.public !== false) fail('Destination Storage bucket is not private.');
}
async function verifyObjects(cfg, objects) {
  await checkBucket(cfg);
  for (const [index, item] of objects.entries()) {
    if (item.state !== 'verified-copy' || item.sourceBucket !== cfg.source || item.destinationBucket !== cfg.destination ||
      item.sourcePath !== item.destinationPath || !/^[0-9a-f]{64}$/.test(item.sha256 || '')) fail('Plan includes an unverified object.');
    const route = `/storage/v1/object/authenticated/${encodeURIComponent(cfg.destination)}/${item.destinationPath.split('/').map(encodeURIComponent).join('/')}`;
    const bytes = await fetchSupabase(cfg, route, { binary: true });
    if (hash(bytes) !== item.sha256) fail(`Private file checksum mismatch at entry ${index + 1}.`);
  }
}

async function createPlan(cfg, options) {
  const { manifest, digest } = await readCopiedManifest(options.manifest, cfg);
  await checkBucket(cfg);
  const groups = new Map();
  for (const item of manifest.objects) {
    const protectedUrl = validateProtectedUrl(item, cfg.secret, cfg.destination);
    for (const link of item.associations) {
      const key = `${link.table}\0${link.recordId}\0${link.field}`;
      if (!groups.has(key)) groups.set(key, { table: link.table, recordId: link.recordId, field: link.field, links: [] });
      const group = groups.get(key);
      if (!group.links.some(other => other.oldUrl === link.oldUrl && other.protectedUrl === protectedUrl)) {
        group.links.push({ oldUrl: link.oldUrl, protectedUrl });
      }
    }
  }
  const operations = [];
  for (const group of groups.values()) {
    const before = await readCurrent(cfg, group.table, group.recordId, group.field);
    const after = rewriteAllAssociations(group.table, group.field, before, group.links);
    if (sameValue(before, after)) fail('Reference not found: verify the manifest has not become stale.');
    operations.push({ ...group, before, after });
  }
  if (!operations.length) fail('No reference updates to plan.');
  const plan = validateCutoverPlan({
    format: REFERENCE_PLAN_FORMAT, version: REFERENCE_PLAN_VERSION, stage: 'planned',
    createdAt: new Date().toISOString(), copiedManifestSha256: digest,
    sourceBucket: cfg.source, destinationBucket: cfg.destination,
    objects: manifest.objects.map(({ scope, sourceBucket, sourcePath, destinationBucket, destinationPath, sha256, state, associations, proposedProtectedUrl }) =>
      ({ scope, sourceBucket, sourcePath, destinationBucket, destinationPath, sha256, state, associations, proposedProtectedUrl })),
    operations,
    caution: 'PRIVATE/CONFIDENTIAL. No database rows changed. Apply only after independent review. No public objects are deleted.',
  }, cfg.url);
  await privateWrite(options.out, plan, { initial: true });
  console.log(`Prepared ${operations.length} compare-and-swap updates for ${manifest.objects.length} verified copies. No writes to database.`);
}

async function readPlan(cfg, location) {
  const bytes = await fs.readFile(location);
  const plan = validateCutoverPlan(JSON.parse(bytes.toString('utf8')), cfg.url);
  if (plan.sourceBucket !== cfg.source || plan.destinationBucket !== cfg.destination) fail('Plan buckets differ from environment.');
  for (const item of plan.objects) validateProtectedUrl(item, cfg.secret, cfg.destination);
  return { plan, digest: hash(bytes) };
}

async function compareAndSwap(cfg, op, expected, replacement) {
  const result = await fetchSupabase(cfg, '/rest/v1/rpc/erp_legacy_storage_reference_cas', {
    method: 'POST', json: { p_table: op.table, p_record_id: op.recordId, p_field: op.field, p_expected: expected, p_replacement: replacement },
  });
  if (result !== 'updated') fail(`Record changed or disappeared before update (${op.table}, ${op.field}). Stopped; review journal.`);
}

async function preflightRows(cfg, operations, allowedStatuses) {
  for (const [index, op] of operations.entries()) {
    const current = await readCurrent(cfg, op.table, op.recordId, op.field);
    const actual = sameValue(current, op.before) ? 'before' : sameValue(current, op.after) ? 'after' : 'changed';
    if (!allowedStatuses(index, actual)) fail(`Preflight rejected changed/stale record at operation ${index + 1}. No further updates.`);
  }
}

async function journalFor(options, digest, total, kind) {
  if (options.resume) {
    const data = await readJson(options.journal);
    if (data.format !== REFERENCE_PLAN_FORMAT || data.version !== REFERENCE_PLAN_VERSION ||
      data.planSha256 !== digest || !Array.isArray(data.states) || data.states.length !== total ||
      !data.states.every(value => ['pending', 'applied', 'rolled-back'].includes(value))) fail('Journal does not match plan.');
    if (kind === 'apply' && data.states.includes('rolled-back')) fail('Cannot apply a plan after rollback. Generate a fresh plan.');
    return data;
  }
  if (kind === 'rollback') {
    const data = await readJson(options.journal);
    if (data.format !== REFERENCE_PLAN_FORMAT || data.version !== REFERENCE_PLAN_VERSION || data.planSha256 !== digest ||
      !Array.isArray(data.states) || data.states.length !== total ||
      !data.states.every(value => ['pending', 'applied', 'rolled-back'].includes(value))) fail('Journal does not match plan.');
    return data;
  }
  const data = { format: REFERENCE_PLAN_FORMAT, version: REFERENCE_PLAN_VERSION, planSha256: digest,
    createdAt: new Date().toISOString(), states: Array(total).fill('pending') };
  await privateWrite(options.journal, data, { initial: true });
  return data;
}

async function applyPlan(cfg, options) {
  const { plan, digest } = await readPlan(cfg, options.plan);
  // Complete verification before *any* database mutation.
  await verifyObjects(cfg, plan.objects);
  const journal = await journalFor(options, digest, plan.operations.length, 'apply');
  await preflightRows(cfg, plan.operations, (index, state) => state === 'before' || state === 'after' && (options.resume || journal.states[index] === 'applied'));
  for (const [index, op] of plan.operations.entries()) {
    const current = await readCurrent(cfg, op.table, op.recordId, op.field);
    if (sameValue(current, op.after)) {
      if (!options.resume && journal.states[index] !== 'applied') fail('Previously applied operation found. Investigate before resuming.');
    } else if (sameValue(current, op.before)) {
      await compareAndSwap(cfg, op, op.before, op.after);
    } else fail('Record was changed concurrently. Stopping.');
    journal.states[index] = 'applied';
    await privateWrite(options.journal, journal);
  }
  console.log(`Applied ${journal.states.filter(s => s === 'applied').length} reference updates. Public originals still exist.`);
}

async function verifyPlan(cfg, options) {
  const { plan } = await readPlan(cfg, options.plan);
  await verifyObjects(cfg, plan.objects);
  await preflightRows(cfg, plan.operations, (_index, state) => state === 'after');
  console.log(`Verified ${plan.operations.length} live database references and ${plan.objects.length} private copies. Public originals unchanged.`);
}

async function rollbackPlan(cfg, options) {
  const { plan, digest } = await readPlan(cfg, options.plan);
  const journal = await journalFor(options, digest, plan.operations.length, 'rollback');
  await preflightRows(cfg, plan.operations, (index, state) =>
    state === 'before' ? journal.states[index] !== 'applied' || options.resume : state === 'after');
  for (let index = plan.operations.length - 1; index >= 0; index--) {
    const op = plan.operations[index];
    const current = await readCurrent(cfg, op.table, op.recordId, op.field);
    if (sameValue(current, op.after)) await compareAndSwap(cfg, op, op.after, op.before);
    else if (!sameValue(current, op.before)) fail('Record changed since cutover. Stopping rollback for manual review.');
    journal.states[index] = 'rolled-back';
    await privateWrite(options.journal, journal);
  }
  console.log(`Rolled back ${journal.states.length} references. Private copies and public originals retained.`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.action === 'help') { console.log(usage); return; }
  const config = configFromEnv();
  if (options.action === 'plan') await createPlan(config, options);
  if (options.action === 'apply') await applyPlan(config, options);
  if (options.action === 'verify') await verifyPlan(config, options);
  if (options.action === 'rollback') await rollbackPlan(config, options);
}

export { main as runReferenceCutover };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Reference cutover stopped: ${error.message}`); process.exitCode = 1; });
}

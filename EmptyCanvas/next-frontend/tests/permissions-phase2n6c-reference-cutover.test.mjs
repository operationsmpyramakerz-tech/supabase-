import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { signedPrivateReference } from '../lib/legacy-storage-migration-policy.mjs';
import {
  approvedAssociation, approvedField, rewriteFieldReference,
  rewriteAllAssociations, validateProtectedUrl, validateCutoverPlan,
  REFERENCE_PLAN_FORMAT, REFERENCE_PLAN_VERSION,
} from '../lib/legacy-storage-reference-policy.mjs';

const oldUrl = 'https://example.supabase.co/storage/v1/object/public/operations-files/task-management/attachments/x.pdf';
const protectedUrl = '/next/api/storage/file-direct?reference=protectedsignature&name=x.pdf';

test('reference rewrite is exact: never rewrite a similar ID, text or external URL', () => {
  assert.deepEqual(rewriteFieldReference('department_ticket_sections', 'attachment_url', oldUrl, oldUrl, protectedUrl), { value: protectedUrl, count: 1 });
  assert.deepEqual(rewriteFieldReference('department_ticket_sections', 'attachment_url', `${oldUrl}?another=true`, oldUrl, protectedUrl), { value: `${oldUrl}?another=true`, count: 0 });
  assert.deepEqual(rewriteFieldReference('kpi_employee_scores', 'evidence_text', `Evidence: ${oldUrl}`, oldUrl, protectedUrl), { value: `Evidence: ${oldUrl}`, count: 0 });
  assert.throws(() => rewriteAllAssociations('kpi_employee_scores', 'evidence_text', `Evidence: ${oldUrl}`, [{ oldUrl, protectedUrl }]), /Stale or unsupported/);
});

test('JSONB rewrites only actual file URL properties, preserving unrelated values and multiple files', () => {
  const value = { files: [{ name: oldUrl, url: oldUrl, publicUrl: oldUrl }, { url: `${oldUrl}?other=1` }], notes: oldUrl, nested: [{ href: oldUrl }] };
  const result = rewriteFieldReference('b2c_customers', 'data', value, oldUrl, protectedUrl);
  assert.equal(result.count, 3);
  assert.equal(result.value.files[0].name, oldUrl);
  assert.equal(result.value.files[0].url, protectedUrl);
  assert.equal(result.value.files[1].url, `${oldUrl}?other=1`);
  assert.equal(result.value.notes, oldUrl);
  assert.equal(result.value.nested[0].href, protectedUrl);
  assert.equal(value.files[0].url, oldUrl); // Pure / no mutation
});

test('task multi-work-file JSON prefix stays valid and preserves other files', () => {
  const initial = `__TM_WORK_FILES_JSON__:${JSON.stringify([{ url: oldUrl, name: 'a' }, { url: 'https://other' }])}`;
  const result = rewriteFieldReference('department_ticket_section_assignments', 'work_file_url', initial, oldUrl, protectedUrl);
  assert.equal(result.count, 1);
  assert.equal(JSON.parse(result.value.slice('__TM_WORK_FILES_JSON__:'.length))[0].url, protectedUrl);
  assert.throws(() => rewriteFieldReference('department_ticket_sections', 'work_file_url', '__TM_WORK_FILES_JSON__:{broken', oldUrl, protectedUrl), /Malformed/);
});

test('signed protected reference must match the verified private object and the deployed signing secret', () => {
  const item = { sourcePath: 'b2c/customer-files/x.png', destinationPath: 'b2c/customer-files/x.png', destinationBucket: 'erp-private-files', scope: 'b2c' };
  item.proposedProtectedUrl = signedPrivateReference({ bucket: item.destinationBucket, path: item.destinationPath, name: 'x.png', type: 'image/png', size: 14, scope: item.scope, secret: 'unit-test-secret' });
  assert.equal(validateProtectedUrl(item, 'unit-test-secret', item.destinationBucket), item.proposedProtectedUrl);
  assert.throws(() => validateProtectedUrl(item, 'wrong-secret', item.destinationBucket), /signature/);
  assert.throws(() => validateProtectedUrl({ ...item, sourcePath: 'b2c/customer-files/other.png' }, 'unit-test-secret', item.destinationBucket), /does not match/);
});

test('plan rejects unsafe fields, duplicate operations, missing checksums and unapproved associations', () => {
  const item = { scope: 'task-management', sourcePath: 'task-management/attachments/x', sourceBucket: 'operations-files' };
  assert.equal(approvedAssociation(item, { table: 'department_ticket_sections', field: 'attachment_url', recordId: 'abc-1', oldUrl }), true);
  assert.equal(approvedAssociation(item, { table: 'department_ticket_sections', field: 'ticket_id', recordId: 'abc-1', oldUrl }), false);
  assert.equal(approvedField('kpi_employee_scores', 'score'), false);
  const obj = { state: 'verified-copy', sourceBucket: 'operations-files', destinationBucket: 'erp-private-files', scope: 'kpi-evidence', sourcePath: 'kpi-evidence/one.pdf', destinationPath: 'kpi-evidence/one.pdf', sha256: crypto.createHash('sha256').update('file').digest('hex'), proposedProtectedUrl: protectedUrl, associations: [{ table: 'kpi_employee_scores', recordId: '12', field: 'evidence_text', oldUrl }] };
  const op = { table: 'kpi_employee_scores', recordId: '12', field: 'evidence_text', before: oldUrl, after: protectedUrl, links: [{ oldUrl, protectedUrl }] };
  const plan = { format: REFERENCE_PLAN_FORMAT, version: REFERENCE_PLAN_VERSION, stage: 'planned', sourceBucket: 'operations-files', destinationBucket: 'erp-private-files', objects: [obj], operations: [op] };
  assert.equal(validateCutoverPlan(plan), plan);
  assert.throws(() => validateCutoverPlan({ ...plan, operations: [op, op] }), /Duplicate/);
  assert.throws(() => validateCutoverPlan({ ...plan, objects: [{ ...obj, sha256: 'bad' }] }), /Unverified/);
  assert.throws(() => validateCutoverPlan({ ...plan, operations: [{ ...op, links: [{ oldUrl, protectedUrl: 'tampered' }] }] }), /does not match/);
});

test('CLI refuses apply without explicit execution and never deletes public files', () => {
  const script = new URL('../scripts/storage-legacy-reference-cutover.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname, 'apply', '--plan', '/tmp/plan', '--journal', '/tmp/log'], { encoding: 'utf8', env: {} });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit --execute/);
  const source = readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /method:\s*['"](?:DELETE|PATCH)['"]/);
  assert.match(source, /compareAndSwap/);
  assert.match(source, /verifyObjects\(cfg, plan.objects\)/);
});

test('mocked Supabase: plan, apply, verify, rollback with checksum verification and CAS', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { runReferenceCutover } = await import('../scripts/storage-legacy-reference-cutover.mjs');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'erp-cutover-test-'));
  const previousEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET', 'ERP_STORAGE_PRIVATE_BUCKET', 'STORAGE_LINK_SECRET'].map(k => [k, process.env[k]]));
  const previousFetch = globalThis.fetch;
  const previousArgs = process.argv;
  const secret = 'test-cutover-secret';
  const original = 'https://example.supabase.co/storage/v1/object/public/operations-files/kpi-evidence/one.pdf';
  const file = Buffer.from('%PDF-1.0 TEST');
  let row = original;
  let swaps = 0;
  const object = {
    scope: 'kpi-evidence', sourceBucket: 'operations-files', sourcePath: 'kpi-evidence/one.pdf',
    destinationBucket: 'erp-private-files', destinationPath: 'kpi-evidence/one.pdf', state: 'verified-copy',
    sha256: crypto.createHash('sha256').update(file).digest('hex'),
    associations: [{ table: 'kpi_employee_scores', recordId: '12', field: 'evidence_text', oldUrl: original }],
    proposedProtectedUrl: signedPrivateReference({ bucket: 'erp-private-files', path: 'kpi-evidence/one.pdf', name: 'one.pdf', type: 'application/pdf', size: file.length, scope: 'kpi-evidence', secret }),
  };
  const manifestFile = path.join(folder, 'copied.json');
  const planFile = path.join(folder, 'plan.json');
  const journalFile = path.join(folder, 'journal.json');
  await fs.writeFile(manifestFile, JSON.stringify({ format: 'pyramakerz-storage-migration', version: 1, stage: 'copied-unlinked', sourceBucket: 'operations-files', destinationBucket: 'erp-private-files', objects: [object] }));
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/storage/v1/bucket/erp-private-files') return reply({ public: false });
    if (parsed.pathname === '/storage/v1/object/authenticated/erp-private-files/kpi-evidence/one.pdf') return new Response(file, { status: 200 });
    if (parsed.pathname === '/rest/v1/kpi_employee_scores') return reply([{ id: '12', evidence_text: row }]);
    if (parsed.pathname === '/rest/v1/rpc/erp_legacy_storage_reference_cas' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      if (body.p_expected !== row) return reply('conflict');
      row = body.p_replacement;
      swaps++;
      return reply('updated');
    }
    throw new Error(`Unexpected fake Supabase route: ${parsed.pathname}`);
  };
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-only',
    SUPABASE_STORAGE_BUCKET: 'operations-files', ERP_STORAGE_PRIVATE_BUCKET: 'erp-private-files', STORAGE_LINK_SECRET: secret,
  });
  const execute = async (...args) => { process.argv = ['node', 'cutover', ...args]; await runReferenceCutover(); };
  try {
    await execute('plan', '--manifest', manifestFile, '--out', planFile);
    assert.equal(row, original, 'planning must not mutate database');
    row = 'changed-by-concurrent-editor';
    await assert.rejects(execute('apply', '--plan', planFile, '--journal', journalFile, '--execute'), /Preflight rejected/);
    assert.equal(swaps, 0, 'stale data must never be overwritten');
    row = original;
    await execute('apply', '--plan', planFile, '--journal', journalFile, '--execute', '--resume');
    assert.equal(swaps, 1);
    assert.equal(row, object.proposedProtectedUrl);
    await execute('verify', '--plan', planFile);
    await execute('rollback', '--plan', planFile, '--journal', journalFile, '--execute');
    assert.equal(row, original);
    assert.equal(swaps, 2);
    assert.deepEqual((await fs.readFile(journalFile, 'utf8').then(JSON.parse)).states, ['rolled-back']);
  } finally {
    globalThis.fetch = previousFetch;
    process.argv = previousArgs;
    for (const [key, value] of Object.entries(previousEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    await fs.rm(folder, { recursive: true, force: true });
  }
});

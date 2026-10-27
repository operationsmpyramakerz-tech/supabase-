import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { selectAuthorizedExpenseExportRows, authorizedExpenseExportIdentity } from '../lib/expense-export-input-policy.mjs';
import { trustedAppPublicOrigin } from '../lib/app-public-origin.mjs';

const authorized = [
  { id: 10, cashOut: 150, userId: 'EMP-1', teamMemberName: 'Employee One' },
  { id: 11, cashOut: 200, userId: 'EMP-1', teamMemberName: 'Employee One' },
];

test('2Q3E: selected expense rows always come from authorized server records', () => {
  const result = selectAuthorizedExpenseExportRows([{ id: '11', cashOut: 999999, teamMemberName: 'Attacker' }, { id: 10 }], authorized);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, [authorized[1], authorized[0]]);
  assert.equal(result.rows.reduce((sum, row) => sum + row.cashOut, 0), 350);
});

test('2Q3E: duplicate expense IDs cannot inflate the exported totals', () => {
  const result = selectAuthorizedExpenseExportRows([{ id: 10 }, { id: '10' }], authorized);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /duplicate/i);
});

test('2Q3E: unavailable or forged expense IDs are denied', () => {
  for (const id of [12, undefined, null, '', 0]) {
    const result = selectAuthorizedExpenseExportRows([{ id }], authorized);
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  }
});

test('2Q3E: expense export rejects oversized selections, never truncates them', () => {
  const result = selectAuthorizedExpenseExportRows(Array.from({ length: 5001 }, () => ({ id: '10' })), authorized);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('2Q3E: exported employee identity is based on trusted server rows', () => {
  const identity = authorizedExpenseExportIdentity(authorized, { account: { name: 'Requester' }, lookupId: 'EMP-1', usersExport: true });
  assert.deepEqual(identity, { userName: 'Expenses — Employee One', userId: 'EMP-1' });
  const own = authorizedExpenseExportIdentity([], { account: { name: 'Current User', teamMemberId: '1' }, usersExport: false });
  assert.deepEqual(own, { userName: 'Expenses — Current User', userId: '1' });
});

test('2Q3E: PWA links use only a configured, validated public origin', () => {
  assert.equal(trustedAppPublicOrigin('https://erp.example.org/'), 'https://erp.example.org');
  assert.equal(trustedAppPublicOrigin('http://localhost:3001'), 'http://localhost:3001');
  for (const value of ['', 'javascript:alert(1)', 'https://user:secret@host.test', 'https://host.test/path', 'https://host.test?a=1', 'https://host.test#hash', '//evil.test', 'https://host.test\\@evil.test']) {
    assert.equal(trustedAppPublicOrigin(value), '', value);
  }
});

test('2Q3E: API routes do not pass forged report labels or forwarded hosts', () => {
  const expenses = readFileSync(new URL('../app/api/expenses/export-direct/route.js', import.meta.url), 'utf8');
  const install = readFileSync(new URL('../app/api/system/app-download-links/route.js', import.meta.url), 'utf8');
  assert.ok(expenses.includes('selectAuthorizedExpenseExportRows(body?.items, authorized?.items)'));
  assert.ok(expenses.includes('...identity,'));
  assert.ok(!expenses.includes('userName: body?.userName'));
  assert.ok(!expenses.includes('userId: body?.userId,\n      items:'));
  assert.ok(install.includes('trustedAppPublicOrigin(process.env.ERP_PUBLIC_URL'));
  assert.ok(!install.includes('x-forwarded-host'));
  assert.ok(!install.includes('request.headers.get("host")'));
});

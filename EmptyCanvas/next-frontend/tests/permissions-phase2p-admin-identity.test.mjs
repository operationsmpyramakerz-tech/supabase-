import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isReservedAdminName, isTrustedLegacyAdmin } from '../lib/admin-identity-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = path => readFileSync(resolve(root, path), 'utf8');

test('editable position titles never elevate users to built-in global Admin', () => {
  for (const position of ['Admin Assistant', 'Administration Manager', 'Administrator', 'Admin', 'Super Admin']) {
    assert.equal(isTrustedLegacyAdmin({ id: 'ordinary-user', name: 'Example User', position }), false, position);
  }
  assert.equal(isTrustedLegacyAdmin({ id: 'ordinary-user', name: 'Admin', position: 'Engineer' }), true);
  assert.equal(isTrustedLegacyAdmin({ id: 'ordinary-user', name: 'a d m i n' }), true);
});

test('explicit immutable member allowlist supports trusted admins without relying on job titles', () => {
  const previous = process.env.ERP_TRUSTED_ADMIN_MEMBER_IDS;
  try {
    process.env.ERP_TRUSTED_ADMIN_MEMBER_IDS = 'verified-id, other-verified-id';
    assert.equal(isTrustedLegacyAdmin({ id: 'verified-id', name: 'Operations Head' }), true);
    assert.equal(isTrustedLegacyAdmin({ id: 'other-verified-id', name: 'Member' }), true);
    assert.equal(isTrustedLegacyAdmin({ id: 'verified-id-guess', name: 'Member' }), false);
  } finally {
    if (previous === undefined) delete process.env.ERP_TRUSTED_ADMIN_MEMBER_IDS;
    else process.env.ERP_TRUSTED_ADMIN_MEMBER_IDS = previous;
  }
});

test('reserved Admin account names are normalized before validation', () => {
  for (const name of ['ADMIN', ' Admin ', 'ad-min', 'ad_min', 'Ａｄｍｉｎ']) {
    assert.equal(isReservedAdminName(name), true, name);
  }
  assert.equal(isReservedAdminName({ name: 'Admin' }), true);
  assert.equal(isReservedAdminName({ value: 'Ａｄｍｉｎ' }), true);
  assert.equal(isReservedAdminName('Administration Specialist'), false);
});

test('all legacy Admin authorization gates share the central trusted identity policy', () => {
  const modules = [
    'lib/b2c-data.js', 'lib/home-overview-data.js', 'lib/stocktaking-data.js',
    'lib/backup-data.js', 'lib/kpis-data.js', 'lib/operations-orders-data.js',
    'lib/task-management-data.js', 'lib/events-data.js', 'lib/orders-review-data.js',
    'lib/direct-session-account.js', 'lib/order-action-auth.js',
  ];
  for (const module of modules) {
    const content = source(module);
    assert.match(content, /import\s*\{\s*isTrustedLegacyAdmin\s*\}/, module);
    assert.match(content, /isTrustedLegacyAdmin\(/, module);
    assert.doesNotMatch(content, /position\.includes\(["']admin["']\)/, module);
  }
});

test('own-profile updates and member creation cannot assign the reserved legacy Admin identity by accident', () => {
  const profile = source('lib/account-direct.js');
  const mutation = source('app/api/users-center/mutations-direct/route.js');
  const signup = source('lib/users-center-mutations.js');
  assert.match(profile, /isReservedAdminName\(body\.name\)/);
  assert.match(mutation, /Only access administrators may assign the reserved Admin identity/);
  assert.match(signup, /reserved Admin identity cannot be created through signup approval/);
});

test('shared Admin password lookups do not use arbitrary job-title substring matching', () => {
  for (const module of ['lib/order-action-auth.js', 'lib/operations-orders-data.js', 'lib/orders-review-data.js']) {
    const content = source(module);
    assert.match(content, /const adminRow = candidates\.find\(\(row\) => isTrustedLegacyAdmin\(/);
    assert.doesNotMatch(content, /\.includes\(["']admin["']\)/);
  }
});

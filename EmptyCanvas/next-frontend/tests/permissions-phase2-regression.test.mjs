// Phase 2 isolated permission evaluation + static route guard coverage.
// node --test tests/permissions-phase2-regression.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../lib/feature-permissions-registry.js', import.meta.url), 'utf8');
const { FEATURE_DEFINITIONS, featureAllowed, isKnownFeature } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function file(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
const account = grants => ({ featureAccess: { mode: 'enforced', grants } });

test('Registered feature keys are unique and namespaced (including newly added modules)', () => {
  assert.ok(FEATURE_DEFINITIONS.length >= 188);
  const keys = FEATURE_DEFINITIONS.map(item => item.key);
  assert.equal(new Set(keys).size, FEATURE_DEFINITIONS.length);
  assert.ok(keys.every(k => /^[a-z][a-z0-9_.]+$/.test(k)));
});

test('Legacy accounts continue using existing authorization model', () => {
  assert.equal(featureAllowed({}, 'products.delete'), true);
  assert.equal(featureAllowed({ featureAccess: { mode: 'legacy' } }, 'orders.operations.ship', { legacyAllowed: false }), false);
  assert.equal(featureAllowed({}, 'products.unknown'), false);
});

test('Enabled profiles deny ungranted actions; a grant is per operation', () => {
  const user = account({ 'products.view': { allowed: true, scope: 'all' }, 'products.edit': { allowed: true, scope: 'all' } });
  assert.equal(featureAllowed(user, 'products.view'), true);
  assert.equal(featureAllowed(user, 'products.edit'), true);
  assert.equal(featureAllowed(user, 'products.delete'), false);
  assert.equal(featureAllowed(user, 'products.create'), false);
});

test('Denied grants, bad scopes and unknown keys do not authorize actions', () => {
  assert.equal(featureAllowed(account({ 'products.delete': { allowed: false, scope: 'all' } }), 'products.delete'), false);
  assert.equal(featureAllowed(account({ 'products.delete': { allowed: true, scope: 'own' } }), 'products.delete'), false);
  assert.equal(featureAllowed(account({ 'products.view': { allowed: true, scope: 'all' }, 'products.delete': { allowed: true, scope: 'own' } }), 'products.delete', { scopes: ['own'] }), true);
  assert.equal(isKnownFeature('somewhere.unknown'), false);
  assert.equal(featureAllowed(account({ 'somewhere.unknown': { allowed: true } }), 'somewhere.unknown'), false);
});

test('Unmigrated modules remain in legacy mode to prevent manager lockout', () => {
  assert.equal(featureAllowed(account({}), 'users.feature_access_manage'), true);
  assert.equal(featureAllowed(account({}), 'users.feature_access_manage', { legacyAllowed: false }), false);
});

test('Server routes reject individual destructive operations before service writes', () => {
  const products = file('../app/api/products/route.js');
  for (const key of ['products.create', 'products.edit', 'products.delete', 'products.view']) {
    assert.ok(products.includes(`featureGate(await getDirectAccountGate`), 'missing feature gate');
    assert.ok(products.includes(`"${key}"`), `missing ${key}`);
  }
  const operations = file('../app/api/orders/operations/mutations-direct/route.js');
  for (const key of ['orders.operations.approve','orders.operations.ship','orders.operations.receive','orders.operations.withdrawal','orders.operations.delivery','orders.operations.edit']) {
    assert.ok(operations.includes(`"${key}"`), `missing ${key}`);
  }
  assert.ok(operations.indexOf('const permission = featureGate') < operations.indexOf('result = await updateOperationsApproval'));
});

test('UI hides pilot action menus and SQL defines transaction/versioned grants', () => {
  const products = file('../components/products/ProductsClient.jsx');
  assert.ok(products.includes('canDelete ? <button'));
  assert.ok(products.includes('(canEdit || canDelete) ? <div'));
  const sql = file('../../supabase_erp_advanced_feature_permissions_phase2.sql');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.erp_replace_member_feature_grants'));
  assert.ok(sql.includes('version = public.erp_member_feature_profiles.version + 1'));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { orderScopeFor, ownerInOrderScope, ORDER_SCOPE_MARKERS } from '../lib/order-data-scope.mjs';

const source = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const member = (withScope, view = 'team', edit = 'own') => ({
  teamMemberId: 'alice',
  featureAccess: { mode: 'enforced', grants: {
    'orders.my.__enforced': { allowed: true },
    ...(withScope ? { [ORDER_SCOPE_MARKERS['orders.my']]: { allowed: true } } : {}),
    'orders.my.view': { allowed: true, scope: view },
    'orders.my.edit': { allowed: true, scope: edit },
  } },
});

test('scope opt-in never widens a previously active My Orders profile automatically', () => {
  assert.equal(orderScopeFor(member(false), 'orders.my.view'), null);
  assert.equal(orderScopeFor(member(true), 'orders.my.view'), 'team');
  assert.equal(orderScopeFor({ featureAccess: { mode: 'legacy' } }, 'orders.my.view'), null);
});

test('My Orders View caps editing scope, including a mistakenly broader action grant', () => {
  assert.equal(orderScopeFor(member(true, 'own', 'all'), 'orders.my.edit'), 'own');
  assert.equal(orderScopeFor(member(true, 'team', 'own'), 'orders.my.edit'), 'own');
  assert.equal(orderScopeFor(member(true, 'all', 'team'), 'orders.my.edit'), 'team');
});

test('Operations grants are separate from My Orders and denied grants remain denied', () => {
  const account = { featureAccess: { mode: 'enforced', grants: {
    [ORDER_SCOPE_MARKERS['orders.operations']]: { allowed: true },
    'orders.operations.view': { allowed: true, scope: 'team' },
    'orders.operations.ship': { allowed: false, scope: 'all' },
  } } };
  assert.equal(orderScopeFor(account, 'orders.operations.ship'), 'none');
  assert.equal(orderScopeFor(account, 'orders.my.view'), null);
});

test('untrusted legacy names and null IDs cannot authorize Team or Own', () => {
  const team = ['alice', 'bob'];
  assert.equal(ownerInOrderScope({ team_member_id: 'bob' }, 'team', team), true);
  assert.equal(ownerInOrderScope({ team_member_id: 'eve', team_member_name: 'Alice' }, 'team', team), false);
  assert.equal(ownerInOrderScope({ team_member_name: 'Bob' }, 'team', team), false);
  assert.equal(ownerInOrderScope({ team_member_id: null }, 'own', ['alice']), false);
  assert.equal(ownerInOrderScope({ team_member_id: 'eve' }, 'all', []), true);
  assert.equal(ownerInOrderScope({ team_member_id: 'eve' }, 'none', ['eve']), false);
});

test('Operations read, details, mutation and export entry points share scope checks', () => {
  for (const file of [
    'app/api/orders/requested/paged-summary/route.js',
    'app/api/orders/requested/details-direct/route.js',
    'app/api/orders/operations/mutations-direct/route.js',
    'app/api/orders/export-direct/route.js',
  ]) assert.match(source(file), /(?:assertOrderIdsInScope|loadOperationsOrdersPage)/, file);
  assert.match(source('lib/operations-orders-data.js'), /scoped: !!resolved/);
  assert.match(source('lib/operations-orders-data.js'), /!scoped && !includeLocalSearchFields/);
});

test('My Orders direct actions, tracking and shopping-cart edit all use the scope boundary', () => {
  for (const file of [
    'lib/current-orders-data.js',
    'lib/shopping-cart-order-service.js',
    'lib/order-tracking-data.js',
  ]) assert.match(source(file), /resolveOrderScope/, file);
  assert.match(source('app/api/orders/tracking/route.js'), /featureGate/);
  assert.match(source('components/users-center/UsersCenterDialogs.jsx'), /Enable row-level Own \/ Team \/ All/);
});

test('scoped action buttons are hidden per card, not only per page', async () => {
  const { orderCardAllows } = await import('../lib/order-data-scope.mjs');
  const policy = { self: 'alice', visibleIds: ['alice', 'bob'], scopes: { edit: 'own', export: 'team', delete: 'none' } };
  const alice = { items: [{ createdById: 'alice' }] };
  const bob = { items: [{ createdById: 'bob' }] };
  const mixed = { items: [{ createdById: 'alice' }, { createdById: 'eve' }] };
  assert.equal(orderCardAllows(policy, 'edit', alice), true);
  assert.equal(orderCardAllows(policy, 'edit', bob), false);
  assert.equal(orderCardAllows(policy, 'export', bob), true);
  assert.equal(orderCardAllows(policy, 'export', mixed), false);
  assert.equal(orderCardAllows(policy, 'delete', alice), false);
  assert.equal(orderCardAllows(null, 'edit', bob), true);
});

test('Feature Gate accepts scoped grants ONLY after the explicit marker', async () => {
  const { featureAllowed } = await import('../lib/feature-permissions-registry.js');
  const account = member(false, 'own', 'own');
  assert.equal(featureAllowed(account, 'orders.my.view'), false);
  account.featureAccess.grants[ORDER_SCOPE_MARKERS['orders.my']] = { allowed: true };
  assert.equal(featureAllowed(account, 'orders.my.view'), true);
  assert.equal(featureAllowed(account, 'orders.my.delete'), false);
});

test('new-scoped order grant does not modify a pre-existing legacy profile', () => {
  const account = { featureAccess: { mode: 'legacy', grants: {
    [ORDER_SCOPE_MARKERS['orders.operations']]: { allowed: true },
  } } };
  assert.equal(orderScopeFor(account, 'orders.operations.view'), null);
});

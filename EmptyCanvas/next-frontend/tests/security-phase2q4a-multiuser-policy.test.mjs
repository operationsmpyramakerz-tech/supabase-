// Phase 2Q4A: regression matrix for multi-user permissions, without live
// credentials or destructive operations. Live Staging testing is still required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderScopeFor, ownerInOrderScope, orderCardAllows } from '../lib/order-data-scope.mjs';
import { taskScopeFor, taskOwnerAllowed, taskAssigneeAllowed } from '../lib/task-data-scope.mjs';
import { eventRequestScopeFor, eventRequestOwnerAllowed } from '../lib/event-request-scope.mjs';
import { buildSerializableFeatureGrants } from '../lib/feature-grants-transfer.mjs';

// The permission registry has no external imports; a data URL allows Node's
// built-in runner to exercise the SAME implementation used by Next.js.
const registry = readFileSync(new URL('../lib/feature-permissions-registry.js', import.meta.url), 'utf8');
const { featureAllowed, isKnownFeature, ACTIVE_PILOT_FEATURE_KEYS, FEATURE_DEFINITIONS } =
  await import(`data:text/javascript;base64,${Buffer.from(registry).toString('base64')}`);
const grant = (allowed, scope = 'all') => ({ allowed, scope });
const acct = (grants, mode = 'enforced') => ({ featureAccess: { mode, grants } });
const allowed = (grants, key, options) => featureAllowed(acct(grants), key, options);
const owner = id => ({ team_member_id: id, team_member_name: 'same display name' });

function orderGrants(module, { view = 'all', action = 'all', actionKey = 'delete', marker = true } = {}) {
  return {
    [`${module}.view`]: grant(true, view),
    [`${module}.${actionKey}`]: grant(true, action),
    ...(marker ? { [`${module}.__scoped`]: grant(true) } : {}),
    ...(module === 'orders.my' ? { 'orders.my.__enforced': grant(true) } : {}),
  };
}

test('2Q4A: all 188 catalog actions are unique and unknown feature keys deny access', () => {
  assert.equal(FEATURE_DEFINITIONS.length, 188);
  assert.equal(ACTIVE_PILOT_FEATURE_KEYS.length, 188);
  assert.equal(new Set(ACTIVE_PILOT_FEATURE_KEYS).size, ACTIVE_PILOT_FEATURE_KEYS.length);
  for (const key of ACTIVE_PILOT_FEATURE_KEYS) assert.ok(isKnownFeature(key), key);
  assert.equal(featureAllowed(acct({}), 'orders.operations.nonexistent'), false);
});

test('2Q4A: operations Delete requires its OWN explicit grant and an allowed View grant', () => {
  const base = { 'orders.operations.view': grant(true), 'orders.operations.edit': grant(true) };
  for (const candidate of [acct(base), acct(base, 'legacy'), acct({ ...base, 'orders.operations.delete': grant(false) })]) {
    assert.equal(featureAllowed(candidate, 'orders.operations.delete'), false);
  }
  assert.equal(allowed({ ...base, 'orders.operations.delete': grant(true) }, 'orders.operations.delete'), true);
  assert.equal(allowed({ ...base, 'orders.operations.view': grant(false), 'orders.operations.delete': grant(true) }, 'orders.operations.delete'), false);
  assert.equal(allowed({ ...base, 'orders.operations.__legacy': grant(true), 'orders.operations.delete': grant(true) }, 'orders.operations.delete'), true, 'explicit grant remains required even when the legacy opt-out marker is present');
});

test('2Q4A: Own scope never authorizes teammate or unrelated rows', () => {
  const user = acct(orderGrants('orders.operations', { view: 'own', action: 'all' }));
  const scope = orderScopeFor(user, 'orders.operations.delete');
  assert.equal(scope, 'own');
  assert.equal(ownerInOrderScope(owner('employee-1'), scope, ['employee-1']), true);
  assert.equal(ownerInOrderScope(owner('employee-2'), scope, ['employee-1']), false);
  assert.equal(ownerInOrderScope(owner('outsider'), scope, ['employee-1']), false);
});

test('2Q4A: Team scope allows only explicitly linked member IDs plus self', () => {
  const user = acct(orderGrants('orders.operations', { view: 'all', action: 'team' }));
  const scope = orderScopeFor(user, 'orders.operations.delete');
  assert.equal(scope, 'team');
  const visibleIds = ['employee-1', 'employee-2'];
  assert.equal(ownerInOrderScope(owner('employee-1'), scope, visibleIds), true);
  assert.equal(ownerInOrderScope(owner('employee-2'), scope, visibleIds), true);
  assert.equal(ownerInOrderScope(owner('employee-3'), scope, visibleIds), false);
});

test('2Q4A: View and action scopes intersect; narrower scope always wins', () => {
  const keys = [
    ['own', 'all', 'own'], ['team', 'all', 'team'], ['all', 'own', 'own'],
    ['team', 'own', 'own'], ['all', 'team', 'team'], ['all', 'all', 'all'],
  ];
  for (const [view, action, expected] of keys) {
    const g = orderGrants('orders.my', { view, action });
    assert.equal(orderScopeFor(acct(g), 'orders.my.delete'), expected, `${view} x ${action}`);
  }
});

test('2Q4A: missing owner ID is denied for Own/Team and never inferred from name', () => {
  const row = { team_member_name: 'employee-1', createdByName: 'employee-1' };
  assert.equal(ownerInOrderScope(row, 'own', ['employee-1']), false);
  assert.equal(ownerInOrderScope(row, 'team', ['employee-1']), false);
  assert.equal(ownerInOrderScope(row, 'all', []), true);
  assert.equal(ownerInOrderScope(row, 'none', ['employee-1']), false);
});

test('2Q4A: denial of View blocks nested My Orders actions, even if Delete is granted', () => {
  const g = orderGrants('orders.my');
  g['orders.my.view'] = grant(false);
  assert.equal(featureAllowed(acct(g), 'orders.my.delete'), false);
  assert.equal(orderScopeFor(acct(g), 'orders.my.delete'), 'none');
});

test('2Q4A: explicit denied order action must return none regardless of View All', () => {
  const g = orderGrants('orders.operations');
  g['orders.operations.delete'] = grant(false);
  assert.equal(featureAllowed(acct(g), 'orders.operations.delete'), false);
  assert.equal(orderScopeFor(acct(g), 'orders.operations.delete'), 'none');
});

test('2Q4A: opt-in data scope never silently changes existing non-scoped accounts', () => {
  const a = acct(orderGrants('orders.operations', { view: 'own', action: 'own', marker: false }));
  assert.equal(orderScopeFor(a, 'orders.operations.delete'), null);
  assert.equal(orderScopeFor(acct({}), 'orders.operations.delete'), null);
  assert.equal(orderScopeFor(acct({}, 'legacy'), 'orders.operations.delete'), null);
});

test('2Q4A: UI policy hides mixed-owner orders rather than allowing partial access', () => {
  const policy = { self: 'employee-1', visibleIds: ['employee-1', 'employee-2'], scopes: { delete: 'team' } };
  assert.equal(orderCardAllows(policy, 'delete', { items: [{ createdById: 'employee-1' }, { createdById: 'employee-2' }] }), true);
  assert.equal(orderCardAllows(policy, 'delete', { items: [{ createdById: 'employee-1' }, { createdById: 'outsider' }] }), false);
  assert.equal(orderCardAllows(policy, 'delete', { items: [{ createdById: 'employee-1' }, { createdByName: 'employee-2' }] }), false);
});

test('2Q4A: Task Management and Event Requests use explicit owner IDs for Team scope', () => {
  const g = { 'tasks.__scoped': grant(true), 'tasks.view': grant(true, 'team'), 'tasks.assignment_delete': grant(true, 'all') };
  assert.equal(taskScopeFor(acct(g), 'tasks.assignment_delete'), 'team');
  assert.equal(taskOwnerAllowed({ createdById: 'employee-2' }, 'team', ['employee-1', 'employee-2']), true);
  assert.equal(taskOwnerAllowed({ createdByName: 'employee-2' }, 'team', ['employee-1', 'employee-2']), false);
  assert.equal(taskAssigneeAllowed({ assigneeId: 'outsider' }, 'team', ['employee-1', 'employee-2']), false);
  const events = { 'events.requests.__scoped': grant(true), 'events.requests.view': grant(true, 'team'), 'events.requests.archive': grant(true, 'own') };
  assert.equal(eventRequestScopeFor(acct(events), 'events.requests.archive'), 'own');
  assert.equal(eventRequestOwnerAllowed({ createdByUserId: 'employee-2' }, 'own', ['employee-1']), false);
  assert.equal(eventRequestOwnerAllowed({ createdByUserId: 'employee-1' }, 'own', ['employee-1']), true);
});

test('2Q4A: account and notification View denials override independent action grants', () => {
  assert.equal(allowed({ 'account.view': grant(false), 'account.avatar': grant(true) }, 'account.avatar'), false);
  assert.equal(allowed({ 'account.view': grant(true), 'account.password': grant(false) }, 'account.password'), false);
  assert.equal(allowed({ 'notifications.view': grant(false), 'notifications.preferences': grant(true) }, 'notifications.preferences'), false);
});

test('2Q4A: grants serialization preserves explicit denies and does not admit unknown actions', () => {
  const serial = buildSerializableFeatureGrants([
    { permission_key: 'orders.operations.delete', is_allowed: false, data_scope: 'all' },
    { permission_key: 'orders.operations.view', is_allowed: true, data_scope: 'team' },
    { permission_key: 'not.real.permission', is_allowed: true, data_scope: 'all' },
  ], isKnownFeature);
  assert.deepEqual(serial['orders.operations.delete'], grant(false));
  assert.deepEqual(serial['orders.operations.view'], grant(true, 'team'));
  assert.equal(Object.hasOwn(serial, 'not.real.permission'), false);
});

test('2Q4A: route API permission checks precede data retrieval or mutations', () => {
  const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  for (const [path, perm, downstream] of [
    ['app/api/sv-orders/paged-summary/route.js', 'orders.review.view', 'await loadOrdersReviewPage'],
    ['app/api/sv-orders/details-direct/route.js', 'orders.review.view_details', 'await loadOrdersReviewDetails'],
    ['app/api/sv-orders/mutations-direct/route.js', '`orders.review.', 'await updateOrdersReviewApproval'],
  ]) {
    const code = source(path);
    assert.ok(code.includes(perm === '`orders.review.' ? perm : `"${perm}`), `${path}: permission gate missing`);
    assert.ok(code.indexOf('featureGate(') !== -1 && code.indexOf('featureGate(') < code.indexOf(downstream), `${path}: permission gate after data access`);
  }
});

test('2Q4A: Operations and My Orders direct mutations check the requested action before writing', () => {
  const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  const ops = source('app/api/orders/operations/mutations-direct/route.js');
  const mine = source('app/api/orders/current/mutations-direct/route.js');
  assert.ok(ops.includes('delete: "orders.operations.delete"'));
  assert.ok(ops.includes('const permission = featureGate(gate, actionPermission)'));
  assert.ok(ops.indexOf('const permission = featureGate(') < ops.indexOf('await assertOrderIdsInScope('));
  assert.ok(ops.indexOf('await assertOrderIdsInScope(') < ops.indexOf('await performOperationsProtectedAction('));
  assert.ok(mine.includes('delete: "orders.my.delete"'));
  assert.ok(mine.includes('const permission = featureGate(gate, requiredPermission)'));
  assert.ok(mine.indexOf('const permission = featureGate(') < mine.indexOf('await performCurrentOrdersProtectedAction('));
});

test('2Q4A: feature grants refresh the profile version on gated requests before trusting cache', () => {
  const server = readFileSync(new URL('../lib/feature-permissions-server.js', import.meta.url), 'utf8');
  assert.match(server, /export async function loadMemberFeatureAccess\(memberId\)/);
  assert.ok(server.indexOf('const profiles = await select(profilesTable') < server.indexOf('const cached = grantCache.get(cacheKey)'));
  assert.ok(server.includes('const cacheKey = `${id}:${version}`'));
  assert.ok(server.includes('if (key.startsWith(`${id}:`)) grantCache.delete(key)'));
  assert.ok(server.includes('requireServerCredential()'));
});

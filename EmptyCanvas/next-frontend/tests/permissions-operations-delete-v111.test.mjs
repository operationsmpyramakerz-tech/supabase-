import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('lib/feature-permissions-registry.js');
const catalog = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const permission = 'orders.operations.delete';
const grant = (allowed, scope = 'all') => ({ allowed, scope });
const member = (grants, mode = 'enforced') => ({ featureAccess: { mode, grants } });

const withView = (extra = {}) => ({ 'orders.operations.view': grant(true), ...extra });

test('v111 registers independently assignable Delete Operations Order feature in Users Center', () => {
  assert.equal(catalog.FEATURE_DEFINITIONS.length, 188);
  assert.equal(catalog.ACTIVE_PILOT_FEATURE_KEYS.length, 188);
  assert.equal(new Set(catalog.ACTIVE_PILOT_FEATURE_KEYS).size, 188);
  assert.equal(catalog.FEATURE_DEFINITIONS.find(item => item.key === permission)?.label, 'Delete operations order');
  assert.ok(catalog.ACTIVE_PILOT_FEATURE_KEYS.includes(permission));
  const dialog = read('components/users-center/UsersCenterDialogs.jsx');
  assert.ok(dialog.includes('shown.filter(item => item.module === module.key'));
  assert.ok(dialog.includes('ACTIVE_PILOT_FEATURE_KEYS.includes(item.key)'));
});

test('v111 destructive Delete is disabled by default and is not inherited from Edit/legacy', () => {
  assert.equal(catalog.featureAllowed({}, permission), false);
  assert.equal(catalog.featureAllowed(member({}, 'legacy'), permission), false);
  assert.equal(catalog.featureAllowed(member(withView({ 'orders.operations.edit': grant(true) })), permission), false);
  assert.equal(catalog.featureAllowed(member(withView({ [permission]: grant(false) })), permission), false);
  assert.equal(catalog.featureAllowed(member(withView({ [permission]: grant(true) })), permission), true);
  assert.equal(catalog.featureAllowed(member({ [permission]: grant(true) }), permission), false);
  assert.equal(catalog.featureAllowed(member(withView({ [permission]: grant(true), 'orders.operations.__legacy': grant(true) })), permission), true);
});

test('v111 data-scoped grants cannot expand Delete past View', () => {
  const scoped = { 'orders.operations.__scoped': grant(true) };
  assert.equal(catalog.featureAllowed(member({ ...scoped, 'orders.operations.view': grant(true, 'own'), [permission]: grant(true, 'team') }), permission), true);
  assert.equal(catalog.featureAllowed(member({ ...scoped, 'orders.operations.view': grant(true, 'own'), [permission]: grant(true, 'team') }), permission, { scopes: ['all'] }), true);
  assert.equal(catalog.featureAllowed(member({ ...scoped, 'orders.operations.view': grant(false, 'own'), [permission]: grant(true, 'all') }), permission), false);
  assert.equal(catalog.featureAllowed(member(withView({ [permission]: grant(true, 'own') })), permission), false);
});

test('v111 delete route verifies feature, legacy edit access, component scope and admin password', () => {
  const api = read('app/api/orders/operations/mutations-direct/route.js');
  const service = read('lib/operations-orders-data.js');
  assert.ok(api.includes('delete: "orders.operations.delete"'));
  assert.ok(api.includes('const permission = featureGate(gate, actionPermission)'));
  assert.ok(api.includes('assertOrderIdsInScope(gate.account, actionPermission'));
  assert.ok(api.indexOf('const permission = featureGate') < api.indexOf('result = await performOperationsProtectedAction('));
  assert.ok(api.indexOf('directPageMutationAccess(gate.account') < api.indexOf('result = await performOperationsProtectedAction('));
  assert.ok(service.includes('directOperationsAdminPasswordResult(account || {}, adminPassword)'));
  assert.ok(service.indexOf('directOperationsAdminPasswordResult(account || {}, adminPassword)') < service.indexOf('if (cleanAction === "delete")'));
});

test('v111/2Q3D server rejects partial order ID payloads before DB deletion', async () => {
  const service = read('lib/operations-orders-data.js');
  const guardAt = service.indexOf('validateWholeOperationsOrder(loaded.clean, loaded.rows, allRows)');
  const deleteAt = service.indexOf('await deleteByIds(tableName(), loaded.clean)');
  assert.ok(guardAt > 0 && guardAt < deleteAt);
  assert.ok(service.includes('order_number: `eq.${orderNumbers[0]}`'));
  assert.ok(service.includes('deleted.length !== loaded.clean.length'));
  const { validateWholeOperationsOrder } = await import('../lib/operations-whole-order-policy.mjs');
  const row = (id) => ({ id, order_number: 123 });
  assert.equal(validateWholeOperationsOrder(['1'], [row(1)], [row(1), row(2)]).ok, false);
  assert.equal(validateWholeOperationsOrder(['1', '2'], [row(1), row(2)], [row(1), row(2)]).ok, true);
});

test('v111 order modal shows Delete separately from Edit in active and archived orders', () => {
  const page = read('app/operations-orders/page.jsx');
  const modal = read('components/orders/OperationsOrdersHeavyModals.jsx');
  const client = read('components/orders/OperationsOrdersClient.jsx');
  assert.ok(page.includes('delete: "orders.operations.delete"'));
  assert.ok(page.includes('["delete", "orders.operations.delete"]'));
  assert.ok(modal.includes('permitted("edit") || permitted("delete")'));
  assert.ok(modal.includes('{permitted("delete") ? <button'));
  assert.ok(modal.includes('menuAction("delete")'));
  assert.ok(modal.includes('DeleteVerificationDialog'));
  assert.ok(modal.includes('DeleteConfirmDialog'));
  assert.ok(client.includes('permissions?.[permissionAction] === false'));
  assert.ok(client.includes('orderCardAllows(scopePolicy, "delete", group)'));
  assert.ok(client.includes('onConfirmDelete={confirmDeleteOrder}'));
  assert.ok(client.includes('action: "delete", orderIds: group.orderIds, adminPassword: password'));
});

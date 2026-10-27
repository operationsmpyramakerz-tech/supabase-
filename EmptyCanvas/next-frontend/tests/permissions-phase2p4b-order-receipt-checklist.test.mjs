// Phase 2P4B coverage. Runs without Supabase or a Next.js server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const registry = await import(`data:text/javascript;base64,${Buffer.from(read('lib/feature-permissions-registry.js')).toString('base64')}`);
const scopes = await import(`data:text/javascript;base64,${Buffer.from(read('lib/order-data-scope.mjs')).toString('base64')}`);
const account = grants => ({ featureAccess: { mode: 'enforced', grants } });
const grant = (allowed, scope = 'all') => ({ allowed, scope });
const allowed = (grants, key) => registry.featureAllowed(account(grants), key);

test('2P4B activates three separately configurable keys and exposes their original fallback action', () => {
  const expected = {
    'orders.my.update_received': 'orders.my.edit',
    'orders.operations.upload_receipt': 'orders.operations.receive',
    'orders.maintenance.checklist_view': 'orders.maintenance.view',
  };
  for (const [key, fallback] of Object.entries(expected)) {
    assert.ok(registry.ACTIVE_PILOT_FEATURE_KEYS.includes(key), key);
    assert.equal(registry.OPTIONAL_FEATURE_FALLBACKS[key], fallback);
  }
});

test('2P4B existing profiles inherit previous action grants and explicit deny takes precedence', () => {
  const my = { 'orders.my.__enforced': grant(true), 'orders.my.view': grant(true), 'orders.my.edit': grant(true) };
  assert.equal(allowed(my, 'orders.my.update_received'), true);
  assert.equal(allowed({ ...my, 'orders.my.update_received': grant(false) }, 'orders.my.update_received'), false);
  assert.equal(allowed({ ...my, 'orders.my.edit': grant(false) }, 'orders.my.update_received'), false);

  const ops = { 'orders.operations.view': grant(true), 'orders.operations.receive': grant(true) };
  assert.equal(allowed(ops, 'orders.operations.upload_receipt'), true);
  assert.equal(allowed({ ...ops, 'orders.operations.upload_receipt': grant(false) }, 'orders.operations.upload_receipt'), false);
  assert.equal(allowed({ ...ops, 'orders.operations.view': grant(false) }, 'orders.operations.upload_receipt'), false);

  const maintenance = { 'orders.maintenance.view': grant(true), 'orders.maintenance.log': grant(true) };
  assert.equal(allowed(maintenance, 'orders.maintenance.checklist_view'), true);
  assert.equal(allowed({ ...maintenance, 'orders.maintenance.checklist_view': grant(false) }, 'orders.maintenance.checklist_view'), false);
  assert.equal(allowed({}, 'orders.maintenance.checklist_view'), true);
});

test('2P4B scoped upload and receive writes cannot exceed the original module View scope', () => {
  const my = { 'orders.my.__enforced': grant(true), 'orders.my.__scoped': grant(true), 'orders.my.view': grant(true, 'team'), 'orders.my.edit': grant(true, 'all') };
  assert.equal(scopes.orderScopeFor(account(my), 'orders.my.update_received'), 'team');
  assert.equal(scopes.orderScopeFor(account({ ...my, 'orders.my.update_received': grant(true, 'own') }), 'orders.my.update_received'), 'own');
  assert.equal(scopes.orderScopeFor(account({ ...my, 'orders.my.update_received': grant(false) }), 'orders.my.update_received'), 'none');
  const ops = { 'orders.operations.__scoped': grant(true), 'orders.operations.view': grant(true, 'own'), 'orders.operations.receive': grant(true, 'all'), 'orders.operations.upload_receipt': grant(true, 'all') };
  assert.equal(scopes.orderScopeFor(account(ops), 'orders.operations.upload_receipt'), 'own');
});

test('2P4B receive status uses its own API permission and scoped data guard', () => {
  const api = read('app/api/orders/current/update-received-direct/route.js');
  const data = read('lib/current-orders-data.js');
  assert.ok(api.includes('featureGate(gate, "orders.my.update_received")'));
  assert.ok(data.includes('resolveOrderScope(account, "orders.my.update_received")'));
  assert.ok(api.indexOf('featureGate(gate, "orders.my.update_received")') < api.indexOf('markCurrentOrderReceivedDirect({'));
});

test('2P4B Operations delivery enforces receipt upload before any mutation or external file upload', () => {
  const api = read('app/api/orders/operations/mutations-direct/route.js');
  const page = read('app/operations-orders/page.jsx');
  const screen = read('components/orders/OperationsOrdersClient.jsx');
  const modal = read('components/orders/OperationsOrdersHeavyModals.jsx');
  assert.ok(api.includes('if (action === "mark-arrived")'));
  assert.ok(api.includes('featureGate(gate, "orders.operations.upload_receipt")'));
  assert.ok(api.includes('assertOrderIdsInScope(gate.account, "orders.operations.upload_receipt", body?.orderIds)'));
  assert.ok(api.indexOf('featureGate(gate, "orders.operations.upload_receipt")') < api.indexOf('result = await markOperationsArrived('));
  assert.ok(api.indexOf('assertOrderIdsInScope(gate.account, "orders.operations.upload_receipt"') < api.indexOf('result = await markOperationsArrived('));
  assert.ok(page.includes('upload_receipt: "orders.operations.upload_receipt"'));
  assert.ok(page.includes('["upload_receipt", "orders.operations.upload_receipt"]'));
  assert.ok(screen.includes('permissions?.upload_receipt === false'));
  assert.ok(screen.includes('orderCardAllows(scopePolicy, "upload_receipt", group)'));
  assert.ok(modal.includes('canDeliver && permitted("receive") && permitted("upload_receipt")'));
});

test('2P4B maintenance checklist GET, POST, PATCH and DELETE require reading permission', () => {
  const api = read('app/api/orders/maintenance-checklist/route.js');
  assert.ok(api.includes('featureGate(await accountGate(), "orders.maintenance.checklist_view")'));
  assert.equal((api.match(/featureGate\(gate, "orders\.maintenance\.checklist_view"\)/g) || []).length, 3);
  assert.ok(api.indexOf('featureGate(await accountGate(), "orders.maintenance.checklist_view")') < api.indexOf('await listMaintenanceChecklistItems()'));
  assert.equal((api.match(/featureGate\(await accountGate\(\), "orders\.maintenance\.checklist_manage"\)/g) || []).length, 3);
});

test('2P4B form options never fetch or return forbidden checklist; both selection dialogs hide', () => {
  const optionsApi = read('app/api/orders/maintenance/form-options/route.js');
  const loader = read('lib/maintenance-orders-data.js');
  const page = read('app/maintenance-orders/page.jsx');
  const dialogs = read('components/orders/MaintenanceHeavyModals.jsx');
  const client = read('components/orders/MaintenanceOrdersClient.jsx');
  assert.ok(optionsApi.includes('featureAllowed(gate.account, "orders.maintenance.checklist_view")'));
  assert.ok(optionsApi.includes('loadMaintenanceFormOptionsDirect({ includeChecklist })'));
  assert.ok(loader.includes('includeChecklist ? listMaintenanceChecklistItems().catch(() => []) : Promise.resolve([])'));
  assert.ok(page.includes('"checklist_view", "checklist_manage"'));
  assert.equal((dialogs.match(/canReadChecklist \? <div/g) || []).length, 2);
  assert.ok(dialogs.includes('checklist: canReadChecklist ? selectedChecklist : []'));
  assert.equal((client.match(/canReadChecklist=\{permissions\.checklist_view !== false\}/g) || []).length, 2);
});

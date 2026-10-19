// Phase 2C regression: no live Supabase required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../lib/feature-permissions-registry.js', import.meta.url), 'utf8');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS, isKnownFeature } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const user = grants => ({ featureAccess: { mode: 'enforced', grants } });

test('Maintenance and shopping module rollout is opt-in for established advanced profiles', () => {
  const alreadyMigrated = user({ 'products.view': { allowed: true, scope: 'all' } });
  assert.equal(featureAllowed(alreadyMigrated, 'orders.maintenance.delete'), true);
  assert.equal(featureAllowed(alreadyMigrated, 'orders.shopping.submit'), true);
});

test('An explicitly denied module View marks migration and denies all ungranted actions', () => {
  const account = user({ 'orders.maintenance.view': { allowed: false, scope: 'all' } });
  assert.equal(featureAllowed(account, 'orders.maintenance.view'), false);
  assert.equal(featureAllowed(account, 'orders.maintenance.delete'), false);
  assert.equal(featureAllowed(account, 'orders.maintenance.mark_arrived'), false);
  assert.equal(featureAllowed(account, 'products.delete'), false);
});

test('Partial grants are independent and only all scope is currently enforced', () => {
  const a = user({
    'orders.shopping.view': { allowed: true, scope: 'all' },
    'orders.shopping.submit': { allowed: true, scope: 'all' },
    'orders.shopping.undo': { allowed: false, scope: 'all' },
  });
  assert.equal(featureAllowed(a, 'orders.shopping.view'), true);
  assert.equal(featureAllowed(a, 'orders.shopping.submit'), true);
  assert.equal(featureAllowed(a, 'orders.shopping.edit_submit'), false);
  assert.equal(featureAllowed(a, 'orders.shopping.undo'), false);
  assert.equal(isKnownFeature('orders.maintenance.export'), true);
});

test('Maintenance writes and generic delivery are guarded before mutation', () => {
  const mutation = src('../app/api/orders/maintenance/mutations-direct/route.js');
  for (const key of ['orders.maintenance.delete','orders.maintenance.archive','orders.maintenance.log','orders.maintenance.mark_arrived','orders.maintenance.edit']) assert.ok(mutation.includes(key));
  assert.ok(mutation.indexOf('featureGate(await getDirectAccountGate') < mutation.indexOf('performMaintenanceOrdersProtectedAction('));
  const operations = src('../lib/operations-orders-data.js');
  assert.ok(operations.includes('maintenanceBatch && !featureAllowed(account, "orders.maintenance.mark_arrived")'));
  const checklist = src('../app/api/orders/maintenance-checklist/route.js');
  assert.equal(checklist.match(/featureGate\(await accountGate\(\), "orders.maintenance.checklist_manage"\)/g)?.length, 3);
});

test('Shopping Cart submit is split into submit/edit and undo is guarded', () => {
  const submit = src('../app/api/orders/shopping-cart/submit-direct/route.js');
  assert.ok(submit.includes('body?.editMode === true ? "orders.shopping.edit_submit" : "orders.shopping.submit"'));
  assert.ok(src('../app/api/orders/shopping-cart/undo-direct/route.js').includes('"orders.shopping.undo"'));
  assert.ok(src('../components/orders/ShoppingCartClient.jsx').includes('canSubmit ? <SlideToSubmit'));
  assert.ok(src('../components/orders/ShoppingCartDialogs.jsx').includes('typeof onUndo === "function" ? <button'));
});

test('Only implemented pilot permissions are exposed; all registry keys are valid', () => {
  assert.equal(ACTIVE_PILOT_FEATURE_KEYS.length, 34);
  assert.ok(ACTIVE_PILOT_FEATURE_KEYS.every(isKnownFeature));
  assert.ok(!ACTIVE_PILOT_FEATURE_KEYS.includes('orders.maintenance.checklist_view'));
});

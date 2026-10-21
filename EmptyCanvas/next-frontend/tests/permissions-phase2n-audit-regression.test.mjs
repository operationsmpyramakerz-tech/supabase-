import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { featureAllowed } from '../lib/feature-permissions-registry.js';

const read = relative => readFileSync(resolve(import.meta.dirname, '..', relative), 'utf8');
const grant = (allowed = true, scope = 'all') => ({ allowed, scope });
const account = grants => ({ featureAccess: { mode: 'enforced', grants } });

for (const [module, action] of [
  ['orders.shopping', 'submit'],
  ['tasks', 'project_delete'],
  ['events.requests', 'edit'],
  ['events.components', 'delete'],
  ['events.team', 'member_delete'],
]) {
  test(`Phase 2N: ${module} denies ${action} when View is explicitly revoked`, () => {
    const mutation = `${module}.${action}`;
    // In the same way as older clients, a pre-migration profile has no View
    // marker and must not change simply when the patch is deployed.
    assert.equal(featureAllowed(account({ [mutation]: grant() }), mutation), true);
    assert.equal(featureAllowed(account({ [`${module}.view`]: grant(false), [mutation]: grant() }), mutation), false);
  });
}

test('Phase 2N: View does not incorrectly inherit an action permission', () => {
  for (const module of ['orders.shopping', 'tasks', 'events.requests', 'events.components', 'events.team']) {
    assert.equal(featureAllowed(account({ [`${module}.view`]: grant(true), [`${module}.create`]: grant(false) }), `${module}.create`), false);
  }
});

test('Phase 2N: explicit saved instruction permissions are honoured without silently migrating users', () => {
  const key = 'orders.documents.manage_instructions';
  assert.equal(featureAllowed(account({}), key), true);
  assert.equal(featureAllowed(account({ [key]: grant(false) }), key), false);
  assert.equal(featureAllowed(account({ [key]: grant(true) }), key), true);
});

test('Phase 2N: only editors can mutate shared instruction templates, and both methods gate before writes', () => {
  const route = read('app/api/orders/download-instructions/route.js');
  const helper = read('lib/order-instructions-access.js');
  assert.match(helper, /directPageMutationAccess\(account, ORDER_PAGES\) === true/);
  assert.match(helper, /featureAllowed\(account, "orders\.documents\.manage_instructions"\)/);
  assert.match(route, /getLegacyAccountGate\(ORDER_PAGES\)/);
  assert.match(route, /canManage: canManageSharedOrderInstructions\(access\.account\)/);
  const post = route.split('export async function POST(request)')[1].split('export async function PATCH(request)')[0];
  const patch = route.split('export async function PATCH(request)')[1];
  assert.ok(post.indexOf('if (!canManageSharedOrderInstructions(access.account))') < post.indexOf('await createOrderDownloadInstruction'));
  assert.ok(patch.indexOf('if (!canManageSharedOrderInstructions(access.account))') < patch.indexOf('await updateOrderDownloadInstruction'));
});

test('Phase 2N: View-only UI hides instructions edit/create and skips background writes', () => {
  const ui = read('components/orders/OrderDownloadModal.jsx');
  assert.match(ui, /canManageInstructions \? <button/);
  assert.match(ui, /permissionResult\.canManage && legacyTemplates\.length/);
  assert.match(ui, /composerOpen && canManageInstructions/);
  assert.match(ui, /if \(!canManageInstructions\) throw new Error/);
});

test('Phase 2N: direct receipt API checks advanced view permissions before resolving files', () => {
  const route = read('app/api/orders/order-receipts/route.js');
  assert.match(route, /featureAllowed\(gate\.account, "expenses\.view"\)/);
  assert.match(route, /featureAllowed\(gate\.account, "expenses\.users\.view"\)/);
  assert.ok(route.indexOf('featureAllowed(gate.account') < route.indexOf('loadOrderReceiptViewerItems(ids'));
});

test('Phase 2N: original pilot and My Orders cannot mutate when View is denied', () => {
  for (const [view, action] of [
    ['products.view', 'products.delete'],
    ['orders.operations.view', 'orders.operations.approve'],
  ]) {
    assert.equal(featureAllowed(account({ [view]: grant(false), [action]: grant() }), action), false);
    assert.equal(featureAllowed(account({ [view]: grant(true), [action]: grant() }), action), true);
  }
  const grants = { 'orders.my.__enforced': grant(), 'orders.my.view': grant(false), 'orders.my.delete': grant() };
  assert.equal(featureAllowed(account(grants), 'orders.my.delete'), false);
  grants['orders.my.view'] = grant(true);
  assert.equal(featureAllowed(account(grants), 'orders.my.delete'), true);
});

test('Phase 2N: opt-out restores the old page behaviour without affecting other modules', () => {
  const products = account({ 'products.__legacy': grant(), 'products.view': grant(false), 'products.delete': grant() });
  assert.equal(featureAllowed(products, 'products.delete'), true);
  const operations = account({ 'orders.operations.__legacy': grant(), 'orders.operations.view': grant(false), 'orders.operations.ship': grant() });
  assert.equal(featureAllowed(operations, 'orders.operations.ship'), true);
});

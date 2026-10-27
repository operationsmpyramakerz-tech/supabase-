import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS } = await import(`data:text/javascript;base64,${Buffer.from(source('../lib/feature-permissions-registry.js')).toString('base64')}`);
const enabled = grants => ({ featureAccess: { mode: 'enforced', grants } });
const grant = allowed => ({ allowed, scope: 'all' });

test('Kits, Proposals, and Orders Review are individually opt-in with deny-by-default', () => {
  const before = enabled({ 'tasks.view': grant(true) });
  for (const module of ['kits', 'proposals', 'orders.review']) {
    assert.equal(featureAllowed(before, `${module}.delete` === 'orders.review.delete' ? 'orders.review.archive' : `${module}.delete`), true);
    const account = enabled({ [`${module}.view`]: grant(true), [`${module}.${module === 'orders.review' ? 'archive' : 'delete'}`]: grant(false) });
    assert.equal(featureAllowed(account, `${module}.view`), true);
    assert.equal(featureAllowed(account, `${module}.${module === 'orders.review' ? 'archive' : 'delete'}`), false);
    assert.equal(featureAllowed(enabled({ [`${module}.view`]: grant(false), [`${module}.${module === 'orders.review' ? 'archive' : 'create'}`]: grant(true) }), `${module}.${module === 'orders.review' ? 'archive' : 'create'}`), false);
  }
  assert.equal(featureAllowed({ featureAccess: { mode: 'legacy' } }, 'proposals.delete'), true);
});

test('All advertised Phase 2F permissions have definitions and appear in UI', () => {
  const wanted = {
    kits: ['view','create','edit','delete','copy','item_add','item_edit','item_delete','folder_create','folder_manage','send_stock'],
    proposals: ['view','create','edit','delete','copy','item_add','item_edit','item_delete','combine','make_order','send_stock','receipt_upload'],
    'orders.review': ['view','view_details','approve','bulk_approve','quantity','archive','unarchive','update_approval'],
  };
  for (const [module, actions] of Object.entries(wanted)) {
    for (const action of actions) assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(`${module}.${action}`), `missing ${module}.${action}`);
  }
  const ui = source('../components/users-center/UsersCenterDialogs.jsx');
  for(const module of Object.keys(wanted)) assert.ok(ui.includes(`{ key: "${module}",`));
  for(const module of Object.keys(wanted)) assert.ok(ui.includes(`"${module}": stored.some`) || ui.includes(`${module}: stored.some`));
});

test('Kits and folders use an action-specific API gate, not only page access', () => {
  const cases = [
    ['kits/route.js','kitGate("create")'],['kits/[id]/route.js','kitGate("edit")','kitGate("delete")'],
    ['kits/[id]/copy/route.js','kitGate("copy")'],
    ['kits/[id]/items/route.js','kitGate("item_add")'],
    ['kits/[id]/items/[itemId]/route.js','kitGate("item_edit")','kitGate("item_delete")'],
    ['kits/send-to-stock/route.js','kitGate("send_stock")'],
    ['kit-folders/route.js','kitGate("folder_create")'],
    ['kit-folders/[id]/route.js','kitGate("folder_manage")'],
  ];
  for(const [path,...needles] of cases) {
    const route=source(`../app/api/products/${path}`);
    for(const needle of needles) assert.ok(route.includes(needle),`${path} missing ${needle}`);
  }
  assert.ok(source('../lib/proposal-kit-api.js').includes('featureGate(await getDirectAccountGate'));
  assert.ok(source('../app/api/products/kits/membership/route.js').includes('kitReadGate()'));
});

test('All mutable Proposals endpoints use their own permissions', () => {
  const cases = [
    ['route.js','proposalGate("create")'],['[id]/route.js','proposalGate("edit")','proposalGate("delete")'],
    ['[id]/copy/route.js','proposalGate("copy")'],['[id]/items/route.js','proposalGate("item_add")'],
    ['[id]/items/[itemId]/route.js','proposalGate("item_edit")','proposalGate("item_delete")'],
    ['items-by-tag/route.js','proposalGate("item_add")'],['items-by-kit/route.js','proposalGate("item_add")'],
    ['combine/save/route.js','proposalGate("combine")'],
    ['make-order/route.js','proposalGate("make_order")'],
    ['send-to-stock/route.js','proposalGate("send_stock")'],
    ['remove-source-kit/route.js','proposalGate("item_delete")'],
  ];
  for(const [path,...needles] of cases) {
    const route=source(`../app/api/products/proposals/${path}`);
    for(const needle of needles) assert.ok(route.includes(needle),`${path} missing ${needle}`);
  }
  const receipts=source('../app/api/products/proposals/receipt-upload/route.js');
  assert.ok(receipts.includes('"proposals.receipt_upload"'));
  assert.ok(receipts.includes('"kits.send_stock"'), 'Kits send-to-stock needs its own receipt upload access');
});

test('Orders Review detail/list/mutation APIs gate before accessing data', () => {
  const summary=source('../app/api/sv-orders/paged-summary/route.js');
  const details=source('../app/api/sv-orders/details-direct/route.js');
  const mutations=source('../app/api/sv-orders/mutations-direct/route.js');
  assert.ok(summary.indexOf('featureGate(gate, "orders.review.view")') < summary.indexOf('loadOrdersReviewPage({'));
  assert.ok(details.indexOf('featureGate(gate, "orders.review.view_details")') < details.indexOf('loadOrdersReviewDetails({'));
  for(const action of ['approve','bulk_approve','quantity','archive','unarchive','update_approval']) assert.ok(mutations.includes(`"${action}"`));
  assert.ok(mutations.indexOf('featureGate(gate, `orders.review.${actionPermissions[action]}`)') < mutations.indexOf('updateOrdersReviewApproval({'));
});

test('Frontend hides Actions and Cards respect View Details', () => {
  const kits=source('../components/kits/KitsClient.jsx');
  const proposals=source('../components/proposals/ProposalsClient.jsx');
  const modal=source('../components/orders/OrdersReviewHeavyModals.jsx');
  const client=source('../components/orders/OrdersReviewClient.jsx');
  assert.ok(kits.includes('{can("delete") ? <button'));
  assert.ok(kits.includes('{can("folder_manage") ? <button'));
  assert.ok(proposals.includes('{can("delete") ? <button'));
  assert.ok(proposals.includes('{can("item_delete") ? <button'));
  assert.ok(modal.includes('permissions.bulk_approve'));
  assert.ok(modal.includes('permissions.quantity'));
  assert.ok(modal.includes('permissions.update_approval'));
  assert.ok(client.includes('canOpen={permissions.view_details}'));
});

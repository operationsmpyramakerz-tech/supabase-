import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = readFileSync(new URL('../lib/feature-permissions-registry.js', import.meta.url), 'utf8');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS, MY_ORDERS_ENFORCEMENT_MARKER } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const account = grants => ({ featureAccess: { mode: 'enforced', grants } });

test('My Orders individual actions are deny by default for enrolled users, legacy stays unchanged', () => {
  const accountWithEdit = account({ [MY_ORDERS_ENFORCEMENT_MARKER]: { allowed: true, scope: 'all' }, 'orders.my.view': { allowed: true, scope: 'all' }, 'orders.my.edit': { allowed: true, scope: 'all' } });
  assert.equal(featureAllowed(accountWithEdit, 'orders.my.view'), true);
  assert.equal(featureAllowed(accountWithEdit, 'orders.my.edit'), true);
  for (const key of ['orders.my.delete','orders.my.archive','orders.my.unarchive','orders.my.export']) {
    assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(key));
    assert.equal(featureAllowed(accountWithEdit,key),false);
    assert.equal(featureAllowed({},key),true);
  }
});

test('My Orders routes independently check operations before writes', () => {
  const mutation = file('../app/api/orders/current/mutations-direct/route.js');
  for(const [action,key] of Object.entries({archive:'orders.my.archive',unarchive:'orders.my.unarchive',delete:'orders.my.delete'})) {
    assert.ok(mutation.includes(`${action}: "${key}"`));
  }
  assert.ok(mutation.indexOf('const permission = orderActionGate') < mutation.indexOf('performCurrentOrdersProtectedAction({'));
  const init = file('../app/api/orders/current/edit-direct/route.js');
  assert.ok(init.includes('orderActionGate(gate, "orders.my.edit")'));
  assert.ok(init.indexOf('orderActionGate(gate') < init.indexOf('initializeCurrentOrderEditDirect({'));
  const submit = file('../app/api/orders/shopping-cart/submit-direct/route.js');
  assert.ok(submit.includes('if (body?.editMode === true)'));
  assert.ok(submit.includes('orderActionGate(gate, "orders.my.edit")'));
  const received = file('../app/api/orders/current/update-received-direct/route.js');
  assert.ok(received.includes('orderActionGate(gate, "orders.my.update_received")'));
});

test('My Orders client hides unauthorized destructive menu items and download', () => {
  const modal = file('../components/orders/CurrentOrdersHeavyModals.jsx');
  for(const action of ['edit','archive','unarchive','delete']) assert.ok(modal.includes(`canUseMenu("${action}")`));
  assert.ok(modal.includes('may("export")'));
  assert.ok(modal.includes('{hasMenuAction ? <div className="co-modal-more"'));
  assert.ok(file('../app/orders/page.jsx').includes('permissions={Object.fromEntries('));
});

test('Export scope cannot bypass Operations grant via arbitrary or maintenance scope', () => {
  const route = file('../app/api/orders/export-direct/route.js');
  assert.ok(route.includes('"Unsupported export scope."'));
  assert.ok(route.includes('if (key === "maintenance") return ["Maintenance Orders"]'));
  assert.ok(route.includes('await loadMaintenanceOrderDetails({ orderIds })'));
  assert.ok(route.includes('current: "orders.my.export"'));
  assert.ok(route.includes('featureGate(preliminaryGate, exportPermissions[scope])'));
  assert.ok(route.includes('operations: "orders.operations.export"'));
});

test('Server supplies separate, non-secret diagnostics for missing deployment settings', () => {
  const server = file('../lib/feature-permissions-server.js');
  const dialog = file('../components/users-center/UsersCenterDialogs.jsx');
  assert.ok(server.includes('server_flag_disabled'));
  assert.ok(server.includes('missing_service_credential'));
  assert.ok(dialog.includes('setupReason === "server_flag_disabled"'));
  // v414 replaces the standalone Advanced Permissions CTA with the per-page Preferences icon.
  assert.ok(dialog.includes('ua-page-preferences-btn'));
  assert.ok(dialog.includes('function FeatureAccessModal'));
  assert.ok(file('../public/css/user-access.css').includes('.ua-modal--page-preferences'));
});

test('Legacy Phase 2A enrolled profiles retain My Orders access until explicit 2B module opt-in', () => {
  assert.equal(featureAllowed(account({}), 'orders.my.view'), true);
  assert.equal(featureAllowed(account({}), 'orders.my.delete'), true);
  const enforced = account({ [MY_ORDERS_ENFORCEMENT_MARKER]: { allowed:true, scope:'all' } });
  assert.equal(featureAllowed(enforced, 'orders.my.view'), false);
  assert.equal(featureAllowed(enforced, 'orders.my.delete'), false);
  const dialog = file('../components/users-center/UsersCenterDialogs.jsx');
  assert.ok(dialog.includes('setEnabledModules'));
  assert.ok(dialog.includes('MY_ORDERS_ENFORCEMENT_MARKER'));
  assert.ok(dialog.includes('key: MY_ORDERS_ENFORCEMENT_MARKER'));
});

test('Existing Phase 2A profiles do not lose the My Orders navigation item', () => {
  const session = file('../lib/direct-session-account.js');
  assert.ok(session.includes('featureAccess.grants?.[MY_ORDERS_ENFORCEMENT_MARKER]?.allowed !== true) return true'));
});


test('My Orders read APIs also enforce view grants before fetching data', () => {
  for (const route of ['paged-summary', 'details-direct']) {
    const source = file(`../app/api/orders/current/${route}/route.js`);
    assert.ok(source.includes('featureGate(await getLegacyAccountGate(["Current Orders"]'), `${route}: requires feature gate`);
    assert.ok(source.includes('"orders.my.view"'), `${route}: requires explicit view permission`);
    const gateOffset = source.indexOf('featureGate(await getLegacyAccountGate');
    const dataOffset = source.indexOf(route === 'paged-summary' ? 'loadCurrentOrdersPage({' : 'loadCurrentOrderDetails({');
    assert.ok(gateOffset !== -1 && dataOffset > gateOffset);
  }
});

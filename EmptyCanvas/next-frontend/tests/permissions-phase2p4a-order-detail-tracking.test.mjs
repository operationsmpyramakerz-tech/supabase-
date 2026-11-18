import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const registrySource = read('lib/feature-permissions-registry.js');
const registry = await import(`data:text/javascript;base64,${Buffer.from(registrySource).toString('base64')}`);
const scopeSource = read('lib/order-data-scope.mjs');
const scopes = await import(`data:text/javascript;base64,${Buffer.from(scopeSource).toString('base64')}`);
const allowed = (grants, key) => registry.featureAllowed({ featureAccess: { mode: 'enforced', grants } }, key);
const grant = (allow, scope = 'all') => ({ allowed: allow, scope });

test('2P4A adds only keys with complete UI and endpoint protection', () => {
  for (const key of ['orders.my.view_details','orders.operations.details','orders.tracking.view']) {
    assert.ok(registry.ACTIVE_PILOT_FEATURE_KEYS.includes(key), key);
    assert.ok(registry.isKnownFeature(key));
  }
  assert.equal(registry.FEATURE_DEFINITIONS.find(item => item.key === 'orders.tracking.view')?.module, 'orders.my');
  assert.deepEqual(Object.fromEntries(Object.entries(registry.OPTIONAL_FEATURE_FALLBACKS).filter(([key]) => ['orders.my.view_details','orders.operations.details','orders.tracking.view'].includes(key))), {
    'orders.my.view_details': 'orders.my.view',
    'orders.operations.details': 'orders.operations.view',
    'orders.tracking.view': 'orders.my.view',
  });
});

test('2P4A previously granted view access survives until an explicit new permission is saved', () => {
  const my = { 'orders.my.__enforced': grant(true), 'orders.my.view': grant(true) };
  assert.equal(allowed(my, 'orders.my.view_details'), true);
  assert.equal(allowed(my, 'orders.tracking.view'), true);
  const ops = { 'orders.operations.view': grant(true) };
  assert.equal(allowed(ops, 'orders.operations.details'), true);
  assert.equal(allowed({ 'orders.my.view': grant(false), 'orders.my.__enforced': grant(true) }, 'orders.my.view_details'), false);
  assert.equal(allowed({ 'orders.operations.view': grant(false) }, 'orders.operations.details'), false);
});

test('2P4A explicit deny is respected even when parent View is allowed', () => {
  const my = { 'orders.my.__enforced': grant(true), 'orders.my.view': grant(true), 'orders.my.view_details': grant(false), 'orders.tracking.view': grant(false) };
  assert.equal(allowed(my, 'orders.my.view'), true);
  assert.equal(allowed(my, 'orders.my.view_details'), false);
  assert.equal(allowed(my, 'orders.tracking.view'), false);
  assert.equal(allowed({ 'orders.operations.view': grant(true), 'orders.operations.details': grant(false) }, 'orders.operations.details'), false);
});

test('2P4A per-action allow never bypasses its denied module View', () => {
  const grants = { 'orders.my.__enforced': grant(true), 'orders.my.view': grant(false), 'orders.my.view_details': grant(true), 'orders.tracking.view': grant(true) };
  assert.equal(allowed(grants, 'orders.my.view_details'), false);
  assert.equal(allowed(grants, 'orders.tracking.view'), false);
  assert.equal(allowed({ 'orders.operations.view': grant(false), 'orders.operations.details': grant(true) }, 'orders.operations.details'), false);
});

test('2P4A detail row scopes cannot be broader than module View, and honor new narrower grants', () => {
  const my = { 'orders.my.__scoped': grant(true), 'orders.my.view': grant(true, 'team') };
  assert.equal(scopes.orderScopeFor({ featureAccess: { mode: 'enforced', grants: my } }, 'orders.my.view_details'), 'team');
  const narrow = { ...my, 'orders.my.view_details': grant(true, 'own') };
  assert.equal(scopes.orderScopeFor({ featureAccess: { mode: 'enforced', grants: narrow } }, 'orders.my.view_details'), 'own');
  const deny = { ...my, 'orders.my.view_details': grant(false) };
  assert.equal(scopes.orderScopeFor({ featureAccess: { mode: 'enforced', grants: deny } }, 'orders.my.view_details'), 'none');
  const ops = { 'orders.operations.__scoped': grant(true), 'orders.operations.view': grant(true, 'own'), 'orders.operations.details': grant(true, 'all') };
  assert.equal(scopes.orderScopeFor({ featureAccess: { mode: 'enforced', grants: ops } }, 'orders.operations.details'), 'own');
});

test('2P4A both details APIs gate before reading and verify details row scope', () => {
  for (const [path,key] of [
    ['app/api/orders/current/details-direct/route.js','orders.my.view_details'],
    ['app/api/orders/requested/details-direct/route.js','orders.operations.details'],
  ]) {
    const code = read(path);
    assert.match(code, new RegExp(`featureGate\\(featureGate\\(.*"${key.replaceAll('.', '\\.')}"\\)`));
    assert.ok(code.includes(`assertOrderIdsInScope(gate.account, "${key}", orderIds)`));
    const loader = path.includes('/current/') ? 'await loadCurrentOrderDetails' : 'await loadOperationsOrderDetails';
    assert.ok(code.indexOf(`assertOrderIdsInScope(gate.account, "${key}", orderIds)`) < code.indexOf(loader));
  }
});

test('2P4A card summary remains readable without any forbidden details click or prefetch', () => {
  const my = read('components/orders/CurrentOrdersClient.jsx');
  const ops = read('components/orders/OperationsOrdersClient.jsx');
  for (const code of [my, ops]) {
    assert.ok(code.includes('canOpen ? "button" : undefined'));
    assert.ok(code.includes('tabIndex={canOpen ? 0 : undefined}'));
    assert.ok(code.includes('if (canOpen) onOpen(group)'));
    assert.ok(code.includes('if (canOpen &&'));
    assert.ok(code.includes('orderCardAllows(scopePolicy, "details", group)'));
  }
  assert.match(read('app/orders/page.jsx'), /\["view_details", "orders\.my\.view_details"\]/);
  assert.match(read('components/orders/OperationsOrdersPage.jsx'), /\["details", "orders\.operations\.details"\]/);
});

test('2P4A tracking API and SSR page check permission prior to reading private data', () => {
  const api = read('app/api/orders/tracking/route.js');
  const page = read('app/orders/tracking/page.jsx');
  assert.ok(api.includes('"orders.tracking.view"'));
  assert.ok(page.includes('"orders.tracking.view"'));
  assert.ok(page.indexOf('const gate = rawGate ? featureGate') < page.indexOf('const trackingResult = await loadOrderTracking'));
  assert.ok(page.indexOf('if (!gate.ok && gate.status === 403)') < page.indexOf('const trackingResult = await loadOrderTracking'));
  assert.ok(!page.includes('loadOrderTracking({ account: sessionGate.account'));
});

test('2P4A admin editor initializes new switches from saved predecessor grants without overwriting explicit deny', () => {
  const dialog = read('components/users-center/UsersCenterDialogs.jsx');
  assert.ok(dialog.includes('Object.entries(OPTIONAL_FEATURE_FALLBACKS)'));
  assert.ok(dialog.includes('!Object.hasOwn(savedGrants, key) && savedGrants[predecessor] === true'));
  assert.ok(dialog.includes('setGrants(savedGrants)'));
});

test('2P4A disabling a new toggle persists an explicit deny instead of silently restoring inherited access', () => {
  const dialog = read('components/users-center/UsersCenterDialogs.jsx');
  assert.ok(dialog.includes('(Object.hasOwn(OPTIONAL_FEATURE_FALLBACKS, item.key) || LEGACY_DEFAULT_FEATURE_KEYS.includes(item.key)) && grants[item.key] !== true'));
  assert.ok(dialog.includes('.map(item => ({ key: item.key, allowed: false, scope: "all" }))'));
  assert.ok(dialog.includes('!Object.hasOwn(savedScopes, key) && savedGrants[predecessor] === true'));
  // Opting a module out prevents saving any of its new or old action grants.
  assert.match(dialog, /const activeFeatures = shown\.filter\(item => enabledModules\[item\.module\]\)/);
});

test('2P4A tracking follows My Orders legacy opt-out and does not enforce a dormant deny', () => {
  assert.equal(allowed({ 'orders.my.__enforced': grant(false), 'orders.tracking.view': grant(false) }, 'orders.tracking.view'), true);
  assert.equal(allowed({ 'orders.my.__enforced': grant(true), 'orders.my.view': grant(true), 'orders.tracking.view': grant(false) }, 'orders.tracking.view'), false);
});

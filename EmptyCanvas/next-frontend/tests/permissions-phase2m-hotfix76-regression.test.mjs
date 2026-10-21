import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSerializableFeatureGrants } from '../lib/feature-grants-transfer.mjs';

const registrySource = readFileSync(new URL('../lib/feature-permissions-registry.js', import.meta.url), 'utf8');
const { featureAllowed, isKnownFeature, PHASE2A_LEGACY_MARKERS } = await import(`data:text/javascript;base64,${Buffer.from(registrySource).toString('base64')}`);
const account = (grants) => ({featureAccess: {mode: 'enforced', grants}});
const grant = (allowed = true) => ({allowed, scope: 'all'});

test('feature grant snapshots are plain objects suitable for React server-to-client transfer', () => {
  const grants = buildSerializableFeatureGrants([
    {permission_key:'expenses.users.view',is_allowed:true,data_scope:'team'},
    {permission_key:'home.view',is_allowed:false,data_scope:'all'},
    {permission_key:'__proto__',is_allowed:true,data_scope:'all'},
  ], isKnownFeature);
  assert.equal(Object.getPrototypeOf(grants), Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(grants)), grants);
  assert.deepEqual(structuredClone(grants), grants);
  assert.deepEqual(grants['expenses.users.view'], {allowed:true,scope:'team'});
  assert.equal(Object.hasOwn(grants, '__proto__'), false);
});

test('activating Expenses by Users alone retains legacy Products and Operations only when explicitly opted out', () => {
  const grants = {
    'expenses.users.view': {allowed:true,scope:'own'},
    [PHASE2A_LEGACY_MARKERS.products]: grant(),
    [PHASE2A_LEGACY_MARKERS['orders.operations']]: grant(),
  };
  const user = account(grants);
  for (const action of ['view', 'create', 'delete']) assert.equal(featureAllowed(user, `products.${action}`), true);
  for (const action of ['view', 'ship']) assert.equal(featureAllowed(user, `orders.operations.${action}`), true);
  assert.equal(featureAllowed(user, 'expenses.users.view'), true);
  assert.equal(featureAllowed(user, 'expenses.users.edit'), false);
  assert.equal(featureAllowed(user, 'products.view', {legacyAllowed:false}), false);
});

test('old restrictions remain denied until the admin opts a module out', () => {
  const restricted = account({'expenses.users.view':grant()});
  assert.equal(featureAllowed(restricted, 'products.view'), false);
  assert.equal(featureAllowed(restricted, 'orders.operations.view'), false);
  const partiallyEnforced = account({
    'products.view':grant(),
    'products.delete':grant(false),
    [PHASE2A_LEGACY_MARKERS['orders.operations']]:grant(),
  });
  assert.equal(featureAllowed(partiallyEnforced,'products.view'),true);
  assert.equal(featureAllowed(partiallyEnforced,'products.delete'),false);
  assert.equal(featureAllowed(partiallyEnforced,'orders.operations.view'),true);
  assert.equal(featureAllowed(account({[PHASE2A_LEGACY_MARKERS.products]:grant(false)}),'products.view'),false);
});

test('Users Center saves explicit pilot opt-outs without losing other grants', () => {
  const ui = readFileSync(new URL('../components/users-center/UsersCenterDialogs.jsx', import.meta.url), 'utf8');
  const loader = readFileSync(new URL('../lib/feature-permissions-server.js', import.meta.url), 'utf8');
  assert.match(ui, /Object\.entries\(PHASE2A_LEGACY_MARKERS\)/);
  assert.match(ui, /\{ key: "products", label: "Products", optIn: true \}/);
  assert.match(ui, /\{ key: "orders\.operations", label: "Operations Orders", optIn: true \}/);
  assert.match(ui, /setUnmanagedGrants\(stored\.filter/);
  assert.match(loader, /buildSerializableFeatureGrants\(rows, isKnownFeature\)/);
  assert.doesNotMatch(loader, /Object\.create\(null\)/);
});

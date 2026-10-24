import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { permissionDraft, permissionDraftChanges, modulePermissionStatus } from '../lib/feature-permissions-ui.mjs';

const modules = [{ key: 'orders.my', label: 'My Orders' }, { key: 'expenses.users', label: 'Expenses by Users' }];
const definitions = [
  { module: 'orders.my', key: 'orders.my.view', label: 'View orders' },
  { module: 'orders.my', key: 'orders.my.delete', label: 'Delete order' },
  { module: 'expenses.users', key: 'expenses.users.view', label: 'View expenses' },
];
const draft = props => permissionDraft({ active: true, modules, definitions, enabledModules: { 'orders.my': true }, grants: { 'orders.my.view': true }, scopedOrders: { 'orders.my': false }, ...props });
const ui = readFileSync(new URL('../components/users-center/UsersCenterDialogs.jsx', import.meta.url), 'utf8');

test('Legacy modules do not appear as effective grants even if old grants remain stored', () => {
  const data = draft({ grants: { 'orders.my.view': true, 'expenses.users.view': true } });
  assert.deepEqual(modulePermissionStatus('expenses.users', data, definitions), { mode: 'legacy', selected: 1, total: 1, effective: 0 });
});

test('Advanced module with View denied is blocked even when a child grant is allowed', () => {
  const data = draft({ grants: { 'orders.my.view': false, 'orders.my.delete': true } });
  assert.deepEqual(modulePermissionStatus('orders.my', data, definitions), { mode: 'blocked', selected: 1, total: 2, effective: 0 });
});

test('Allowed actions show as effective only in opted-in modules with View', () => {
  const data = draft({ grants: { 'orders.my.view': true, 'orders.my.delete': true } });
  assert.equal(modulePermissionStatus('orders.my', data, definitions).effective, 2);
  assert.equal(modulePermissionStatus('expenses.users', data, definitions).mode, 'legacy');
});

test('Review catches profile, module, grant and row-level scope changes', () => {
  const before = draft({});
  const after = draft({ active: false, enabledModules: { 'orders.my': false }, grants: { 'orders.my.view': false }, scopedOrders: { 'orders.my': true } });
  const changes = permissionDraftChanges(before, after, modules, definitions);
  assert.deepEqual(changes.map(c => c.type), ['profile', 'module', 'grant', 'row-scope']);
});

test('Dormant scope choices are normalized and do not cause noisy unsaved-change warnings', () => {
  const before = draft({ grantScopes: { 'orders.my.delete': 'invalid', 'orders.my.view': 'own' } });
  const after = draft({ grantScopes: { 'orders.my.delete': 'team', 'orders.my.view': 'own' } });
  assert.deepEqual(permissionDraftChanges(before, after, modules, definitions), []);
});

test('Review reports scope change for granted permission', () => {
  const before = draft({ grantScopes: { 'orders.my.view': 'own' } });
  const after = draft({ grantScopes: { 'orders.my.view': 'team' } });
  assert.match(permissionDraftChanges(before, after, modules, definitions)[0].label, /scope team/);
});

test('UI review, status filter and discard protection are connected to live draft state', () => {
  for (const marker of ['permissionDraftChanges(savedDraft, draft', 'hasUnsavedChanges', 'Review before saving', 'Discard edits', 'All statuses', 'Unsaved changes', 'closeEditor', 'Allowed actions in active modules', 'View blocked']) assert.ok(ui.includes(marker), marker);
  assert.match(ui, /disabled=\{busy \|\| loading \|\| !available \|\| !hasUnsavedChanges\}/);
  // Bulk actions must still touch visibleFeatures, never the entire registry.
  assert.match(ui, /visibleFeatures\.map\(item => \[item\.key, true\]\)/);
  assert.match(ui, /visibleFeatures\.map\(item => \[item\.key, false\]\)/);
});

test('Team picker can bulk-select only visible members and asks before discarding unsaved edits', () => {
  assert.match(ui, /const ids = new Set\(filtered\.map\(item => item\.id\)\)/);
  assert.match(ui, /Select visible/);
  assert.match(ui, /Remove visible/);
  assert.match(ui, /Discard \$\{addedIds\.length \+ removedIds\.length\} unsaved team change/);
  assert.match(ui, /onClose=\{closeTeamEditor\}/);
});

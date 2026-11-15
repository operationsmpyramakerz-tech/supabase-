import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { legacyFeaturePreview, legacyModulePreview, preparingLegacyCompatibility } from '../lib/users-center-legacy-permission-preview.mjs';
import { FEATURE_DEFINITIONS, ACTIVE_PILOT_FEATURE_KEYS, featureAllowed } from '../lib/feature-permissions-registry.js';
const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const jsx = fs.readFileSync(new URL('../components/users-center/UsersCenterDialogs.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/users-center/page.jsx', import.meta.url), 'utf8');
const shown = FEATURE_DEFINITIONS.filter(item => ACTIVE_PILOT_FEATURE_KEYS.includes(item.key));

test('page dialog contains no Base Access editor or opt-in toggles', () => {
  const basic = jsx.slice(jsx.indexOf('function PageAccessBasicPreferences('), jsx.indexOf('const EVENT_REQUEST_ROW_KEYS'));
  const direct = jsx.slice(jsx.indexOf('  if (pageRow) {\n    const module = pageModule;'), jsx.indexOf('  return <><Modal title="Advanced Permissions"'));
  for (const segment of [basic, direct]) {
    assert.doesNotMatch(segment, /Base access|PageAccessLevelChoices|View \/ Edit \/ Admin|Use detailed permissions|Legacy profile/);
    assert.match(segment, /Detailed permissions/);
    assert.match(segment, /ua-page-preferences-actions/);
  }
  assert.match(direct, /features\.map\(item =>/);
  assert.match(direct, /Save Preferences/);
  assert.doesNotMatch(direct, /onPageLevelChange|setEnabledModules\(/);
});

test('opening does not persist, opt in, or mutate existing grants', () => {
  const effect = jsx.slice(jsx.indexOf('  useEffect(() => {\n    let mounted = true;'), jsx.indexOf('  const shown = FEATURE_DEFINITIONS'));
  assert.match(effect, /setActive\(result.enabled === true\)/);
  assert.doesNotMatch(effect, /feature-access-save|setActive\(true\)/);
  const write = jsx.slice(jsx.indexOf('  function updatePagePermission('), jsx.indexOf('  const hasUnsavedChanges ='));
  assert.match(write, /if \(!active\) setActive\(true\)/);
  assert.match(write, /preparingLegacyCompatibility\(allPageRows, shown\)/);
  assert.match(write, /!item.optIn \|\| item.key === pageModule.key/);
  assert.match(jsx, /disabled=\{busy \|\| loading \|\| !available \|\| !needsFeatureSave\}/);
  assert.match(jsx, /protect\(\{ title: "Save detailed page permissions"/);
  assert.match(jsx, /const migratingLegacyPage = !!\(pageRow && savedDraft && !savedDraft.active\)/);
  assert.match(jsx, /const persistPageGrant = item => !migratingLegacyPage \|\| item.module === selectedPageModule \|\| item.module === "preparing"/);
  assert.equal((jsx.match(/\.filter\(persistPageGrant\)/g) || []).length, 2);
});

test('existing legacy view, edit, admin flags provide safe preview without granting new delete', () => {
  const disabled = { isEnabled: false, accessLevel: 'admin' };
  const view = { isEnabled: true, accessLevel: 'view' };
  const edit = { isEnabled: true, accessLevel: 'edit' };
  const admin = { isEnabled: true, accessLevel: 'admin' };
  assert.equal(legacyFeaturePreview(disabled, 'home.view'), false);
  assert.equal(legacyFeaturePreview(view, 'home.view'), true);
  assert.equal(legacyFeaturePreview(view, 'home.sla_manage'), false);
  assert.equal(legacyFeaturePreview(edit, 'home.sla_manage'), true);
  assert.equal(legacyFeaturePreview(admin, 'orders.operations.delete'), false);
  assert.equal(legacyFeaturePreview(admin, 'preparing.stages.__granular'), false);
  assert.equal(legacyFeaturePreview(admin, 'preparing.stage.testing'), false);
  assert.equal(legacyFeaturePreview(admin, 'preparing.tabs.__granular'), false);
  assert.equal(legacyFeaturePreview(admin, 'orders.shopping.sources.__granular'), false);
});

test('legacy to detailed save preserves unrelated modules and Preparing access', () => {
  const pages = [
    { pageKey: 'projects-preparing', isEnabled: true, accessLevel: 'admin' },
    { pageKey: 'home', isEnabled: true, accessLevel: 'view' },
    { pageKey: 'products', isEnabled: false, accessLevel: 'admin' },
  ];
  const prepared = preparingLegacyCompatibility(pages, shown);
  assert.equal(prepared['preparing.view'], true);
  assert.equal(prepared['preparing.stage_update'], true);
  assert.equal(prepared['preparing.warehouse_receive'], true);
  assert.equal(prepared['preparing.stages.__granular'], false);
  const migrated = { featureAccess: { mode: 'enforced', grants: Object.fromEntries(Object.entries(prepared).filter(([,allowed]) => allowed).map(([key]) => [key, { allowed: true, scope: 'all' }])) } };
  assert.equal(featureAllowed(migrated, 'preparing.view'), true);
  assert.equal(featureAllowed(migrated, 'preparing.stage_update'), true);
  assert.equal(featureAllowed(migrated, 'preparing.warehouse_receive'), true);
  // Neither advanced Products nor its new Delete capability is enabled by migrating Home.
  migrated.featureAccess.grants['products.__legacy'] = { allowed: true, scope: 'all' };
  assert.equal(featureAllowed(migrated, 'products.view', { legacyAllowed: false }), false);
  assert.equal(featureAllowed(migrated, 'products.view', { legacyAllowed: true }), true);
  assert.equal(legacyModulePreview(pages[1], shown, 'home')['home.sla_manage'], false);
  assert.equal(preparingLegacyCompatibility([{ pageKey: 'projects-preparing', isEnabled: false, accessLevel: 'admin' }], shown)['preparing.view'], false);
});

test('new users and administrators without Feature Access see non-editable actions only', () => {
  const basic = jsx.slice(jsx.indexOf('function PageAccessBasicPreferences('), jsx.indexOf('const EVENT_REQUEST_ROW_KEYS'));
  assert.match(basic, /checked=\{false\} disabled readOnly/);
  assert.match(basic, /Create the member first/);
  assert.match(basic, /Feature Access permission is required/);
  assert.doesNotMatch(basic, /onChange=\{/);
  assert.match(jsx, /\{ \.\.\.page, accessLevel: "view", isEnabled: false \}/);
});

test('JSX remains parseable and stylesheet cache refreshes', () => {
  const file = ts.createSourceFile('UsersCenterDialogs.jsx', jsx, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.equal(file.parseDiagnostics.length, 0);
  assert.match(page, /user-access\.css\?v=page-preferences-v415/);
});

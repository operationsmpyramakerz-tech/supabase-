import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { featureModuleForPage } from '../lib/users-center-page-feature-map.mjs';
const require = createRequire(import.meta.url);
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const jsx = fs.readFileSync(new URL('../components/users-center/UsersCenterDialogs.jsx',import.meta.url),'utf8');
const css = fs.readFileSync(new URL('../public/css/user-access.css',import.meta.url),'utf8');
const page = fs.readFileSync(new URL('../app/users-center/page.jsx',import.meta.url),'utf8');

test('maps supported Page Access rows to only their feature modules',()=>{
  const samples=[
    ['home','home'],['current-orders','orders.my'],['operations-orders','orders.operations'],
    ['maintenance-orders','orders.maintenance'],['shopping-cart','orders.shopping'],['orders-review','orders.review'],
    ['products','products'],['projects-preparing','preparing'],['stocktaking','stocktaking'],
    ['expenses-users','expenses.users'],['task-management-my-tasks','tasks'],['event-requests','events.requests'],
    ['event-calendar','events.calendar'],['event-team','events.team'],['b2c-customer-database','b2c.database'],
    ['customer-form','b2c.forms'],['users-center','users'],['database','backup']
  ];
  for(const [pageKey,module] of samples) assert.equal(featureModuleForPage({pageKey}),module,pageKey);
  assert.equal(featureModuleForPage({pageKey:'unknown-new-page',moduleName:'Orders'}),null);
  assert.equal(featureModuleForPage({pageKey:'',pageName:'Operations Orders'}),'orders.operations');
  assert.equal(featureModuleForPage({pageKey:'',routePath:'/next/projects-preparing'}),'preparing');
});
test('page rows use an icon-only Preferences control, not the old inline dropdown',()=>{
  const row=jsx.slice(jsx.indexOf('function PageAccessRow('), jsx.indexOf('function PageAccessLevelChoices('));
  assert.match(row,/onClick=\{onPreferences\}/);
  assert.match(row,/aria-label=\{`Preferences for \$\{row.pageName\}`\}/);
  assert.match(row,/<UAIcon name="preferences"\/>/);
  assert.doesNotMatch(row,/ModernSelect|onOpenFeatureAccess|View", "Edit", "Admin"/);
  assert.match(row,/isEnabled: event.target.checked/);
});
test('per-page preference modal supports base roles and only selected module features',()=>{
  assert.match(jsx,/role="radiogroup" aria-label="Base page access level"/);
  assert.match(jsx,/\["view", "edit", "admin"\]/);
  assert.match(jsx,/shown.filter\(item => item.module === selectedPageModule\)/);
  assert.match(jsx,/features.map\(item => <div className="ua-page-preferences-action"/);
  assert.match(jsx,/onChange=\{e => setGrantScopes/);
  assert.match(jsx,/onChange=\{e => setGrants/);
  assert.match(jsx,/onPageLevelChange\?\.\(\{ accessLevel: pageLevel \}\)/);
});
test('advanced grants remain protected, no unrelated module mutation endpoint added',()=>{
  assert.match(jsx,/protect\(\{ title: "Save advanced feature access"/);
  assert.match(jsx,/usersCenterMutation\("feature-access-save"/);
  assert.match(jsx,/\.\.\.unmanagedGrants/);
  assert.match(jsx,/Object.entries\(PHASE2A_LEGACY_MARKERS\)/);
  assert.match(jsx,/usersCenterMutation\("page-access-save"/);
  assert.match(jsx,/Save Access/);
});
test('standalone Advanced Feature Permissions entry removed from both page access and member form',()=>{
  const form=jsx.slice(jsx.indexOf('function MemberForm('),jsx.indexOf('function PageAccessRow('));
  const access=jsx.slice(jsx.indexOf('function PageAccessModal('),jsx.indexOf('function SvAccessModal('));
  assert.doesNotMatch(form,/Manage Features|onOpenFeatureAccess/);
  assert.doesNotMatch(access,/ua-advanced-access-cta|advancedOpen/);
  assert.match(access,/onPreferences=\{\(\) => setPreferencesIndex/);
  assert.match(access,/PageAccessBasicPreferences/);
  assert.match(access,/FeatureAccessModal/);
});
test('small dialog is responsive and CSS cache is bumped',()=>{
  assert.match(css,/\.ua-modal--page-preferences \{ width: min\(525px, 94vw\)/);
  assert.match(css,/ua-page-preferences-actions/);
  assert.match(css,/ua-page-access-row--page \.ua-page-preferences-btn \{ width: 46px/);
  assert.match(page,/user-access\.css\?v=page-preferences-v414/);
  for(const name of ['components/users-center/UsersCenterDialogs.jsx','app/users-center/page.jsx']) {
    const file=fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
    const sf=ts.createSourceFile(name,file,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
    assert.equal(sf.parseDiagnostics.length,0,`${name} should parse as JSX`);
  }
});

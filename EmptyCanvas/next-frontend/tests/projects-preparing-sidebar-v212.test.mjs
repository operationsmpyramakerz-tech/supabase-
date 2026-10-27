import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASSIC_MAIN_LINKS, MODULE_LINKS, canSeeNavigationLink } from '../lib/navigation-config.js';
import { featureAllowed } from '../lib/feature-permissions-registry.js';
import { modulePermissionStatus, permissionDraft } from '../lib/feature-permissions-ui.mjs';

const preparingRoute = '/next/projects-preparing';
const advanced = grants => ({ featureAccess: { mode: 'enforced', grants } });

test('Preparing is a distinct sidebar item near Operations Orders, without duplicated entries', () => {
  const links = CLASSIC_MAIN_LINKS.filter(item => item.href === preparingRoute);
  assert.equal(links.length, 1);
  assert.equal(links[0].icon, 'folder-check');
  const opsIndex = CLASSIC_MAIN_LINKS.findIndex(item => item.href === '/next/operations-orders');
  assert.equal(CLASSIC_MAIN_LINKS.indexOf(links[0]), opsIndex + 1);
  assert.equal(MODULE_LINKS.filter(item => item.href === preparingRoute).length, 1);
});

test('Sidebar requires both Page Access and feature View for an advanced user', () => {
  const link = CLASSIC_MAIN_LINKS.find(item => item.href === preparingRoute);
  assert.equal(canSeeNavigationLink(link, []), false);
  assert.equal(canSeeNavigationLink(link, ['Projects Preparing']), true);
  assert.equal(featureAllowed(advanced({}), 'preparing.view'), false);
  assert.equal(featureAllowed(advanced({ 'preparing.view': { allowed: false, scope: 'all' } }), 'preparing.view'), false);
  assert.equal(featureAllowed(advanced({ 'preparing.view': { allowed: true, scope: 'all' } }), 'preparing.view'), true);
});

test('A View grant alone does not authorize preparing writes', () => {
  const account = advanced({ 'preparing.view': { allowed: true, scope: 'all' } });
  for (const action of ['create', 'manage', 'stage_update']) {
    assert.equal(featureAllowed(account, `preparing.${action}`), false);
  }
});

test('Advanced editor models Preparing as strictly feature-gated, including when upgrading a legacy profile', () => {
  const source = readFileSync(new URL('../components/users-center/UsersCenterDialogs.jsx', import.meta.url), 'utf8');
  assert.match(source, /\{ key: "preparing", label: "Projects Preparing", optIn: false \}/);
  assert.match(source, /preparing: true,/);
  const definitions = [{ module: 'preparing', key: 'preparing.view' }];
  const modules = [{ key: 'preparing', label: 'Projects Preparing', optIn: false }];
  const draft = permissionDraft({ active: true, modules, definitions, enabledModules: { preparing: true }, grants: {} });
  assert.equal(modulePermissionStatus('preparing', draft, definitions).mode, 'blocked');
  const enabled = permissionDraft({ active: true, modules, definitions, enabledModules: { preparing: true }, grants: { 'preparing.view': true } });
  assert.equal(modulePermissionStatus('preparing', enabled, definitions).mode, 'advanced');
});

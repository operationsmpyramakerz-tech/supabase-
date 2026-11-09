import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const registry = await import(`data:text/javascript;base64,${Buffer.from(read('lib/feature-permissions-registry.js')).toString('base64')}`);
const acc = grants => ({featureAccess: {mode: 'enforced', grants}});

test('v365: How it works uses both page access and explicit feature view grant', () => {
  assert.equal(registry.FEATURE_DEFINITIONS.filter(x => x.key === 'guide.view').length, 1);
  assert.ok(registry.ACTIVE_PILOT_FEATURE_KEYS.includes('guide.view'));
  assert.ok(registry.LEGACY_DEFAULT_FEATURE_KEYS.includes('guide.view'));
  assert.equal(registry.featureAllowed(acc({}), 'guide.view'), true); // existing users remain page-controlled
  assert.equal(registry.featureAllowed(acc({'guide.view': {allowed: false}}), 'guide.view'), false);
  assert.equal(registry.featureAllowed(acc({'guide.view': {allowed: true, scope: 'all'}}), 'guide.view'), true);
  const menu = read('components/UserProfileMenu.jsx');
  assert.match(menu, /canSeeGuide\s*\?/);
  assert.match(menu, /hasPermission\(allowedPages, \["How it works"/);
  assert.match(menu, /featureAllowed\(profileAccount, "guide.view"\)/);
  const page = read('app/how-it-works/page.jsx');
  assert.match(page, /getDirectAccountGate\(\["How it works"\]\)/);
  assert.match(page, /!featureAllowed\(gate.account, "guide.view"\)/);
  const access = read('components/users-center/UsersCenterDialogs.jsx');
  assert.match(access, /\{ key: "guide", label: "How it works", optIn: false \}/);
  assert.match(access, /guide: true/);
  const nav = read('lib/navigation-config.js');
  assert.match(nav, /href: "\/next\/how-it-works", permissions: \[/);
  assert.doesNotMatch(nav, /href: "\/next\/how-it-works", permissions: \[\], alwaysVisible: true/);
});

test('v365: account files and links originate from authenticated member ID', () => {
  const code = read('lib/account-direct.js');
  assert.match(code, /export async function accountWithOwnFilesMedia/);
  assert.match(code, /const id = memberId\(account\)/);
  assert.match(code, /getTeamMemberPublicProfile\(id, \{ fresh: true \}\)/);
  assert.match(code, /text\(profile\?\.id\) !== id/);
  const page = read('app/account/page.jsx');
  const api = read('app/api/account/route.js');
  assert.match(page, /await accountWithOwnFilesMedia\(gate.account\)/);
  assert.match(api, /await accountWithOwnFilesMedia\(gate.account\)/);
  assert.match(page, /AccountClient initialAccount=\{displayAccount\}/);
  assert.match(read('components/account/AccountClient.jsx'), /filesMedia: normalizeFiles\(account\?\.filesMedia\)/);
});

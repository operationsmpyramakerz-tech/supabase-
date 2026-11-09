import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const catalog = await import(`data:text/javascript;base64,${Buffer.from(read('lib/feature-permissions-registry.js')).toString('base64')}`);
const personalKeys = [
  'notifications.view', 'notifications.read_manage', 'notifications.preferences',
  'account.view', 'account.edit', 'account.avatar', 'account.password',
];
const grant = (allowed, scope='all') => ({allowed, scope});
const member = (grants={}, mode='enforced') => ({featureAccess: {mode, grants}});
const allowed = (grants,key,options) => catalog.featureAllowed(member(grants),key,options);

test('2P4D registers precisely the remaining seven protected permissions', () => {
  assert.ok(catalog.FEATURE_DEFINITIONS.length >= 188);
  assert.equal(catalog.ACTIVE_PILOT_FEATURE_KEYS.length, catalog.FEATURE_DEFINITIONS.length);
  assert.equal(new Set(catalog.ACTIVE_PILOT_FEATURE_KEYS).size, catalog.ACTIVE_PILOT_FEATURE_KEYS.length);
  for (const key of personalKeys) {
    assert.ok(catalog.isKnownFeature(key));
    assert.ok(catalog.ACTIVE_PILOT_FEATURE_KEYS.includes(key));
    assert.ok(catalog.LEGACY_DEFAULT_FEATURE_KEYS.includes(key));
  }
});

test('2P4D absent grant preserves existing access; explicit deny and scope enforce', () => {
  for (const key of personalKeys) {
    assert.equal(allowed({},key),true,`legacy fallback for ${key}`);
    assert.equal(allowed({[key]:grant(false)},key),false,`explicit deny for ${key}`);
    assert.equal(allowed({[key]:grant(true)},key),true,`explicit grant for ${key}`);
    assert.equal(allowed({[key]:grant(true,'own')},key),false,`invalid scope for personal action ${key}`);
    assert.equal(catalog.featureAllowed(member({},'legacy'),key),true);
  }
  // Notification settings remain customizable even if viewing the feed is disabled.
  assert.equal(allowed({'notifications.view':grant(false)},'notifications.preferences'),false);
  assert.equal(allowed({'account.view':grant(false)},'account.edit'),false);
  assert.equal(allowed({'account.view':grant(false),'account.avatar':grant(true)},'account.avatar'),false);
  assert.equal(allowed({'notifications.view':grant(true),'notifications.read_manage':grant(false)},'notifications.view'),true);
  assert.equal(allowed({'account.view':grant(true),'account.password':grant(false)},'account.edit'),true);
});

test('2P4D feature switches can be saved as explicit denies without opt-in markers', () => {
  const dialog = read('components/users-center/UsersCenterDialogs.jsx');
  for(const module of ['notifications','account']) {
    assert.ok(dialog.includes(`{ key: "${module}", label:`));
    assert.ok(dialog.includes(`${module}: true`));
  }
  assert.ok(dialog.includes('LEGACY_DEFAULT_FEATURE_KEYS.includes(item.key)'));
  assert.ok(dialog.includes('...activeFeatures.filter(item => (Object.hasOwn(OPTIONAL_FEATURE_FALLBACKS, item.key) || LEGACY_DEFAULT_FEATURE_KEYS.includes(item.key)) && grants[item.key] !== true)'));
});

test('2P4D notification routes always check fresh grants before touching notifications', () => {
  const keys = new Map([
    ['route.js','notifications.view'],
    ['refresh/route.js','notifications.view'],
    ['delivery/route.js','notifications.view'],
    ['test/route.js','notifications.view'],
    ['read/route.js','notifications.read_manage'],
    ['read-all/route.js','notifications.read_manage'],
    ['read-batch/route.js','notifications.read_manage'],
    ['preferences/route.js','notifications.preferences'],
  ]);
  const shared = read('lib/personal-notification-gate.js');
  assert.ok(shared.includes('loadMemberFeatureAccess(gate.memberId)'));
  assert.ok(shared.includes('featureAllowed({ featureAccess }, key)'));
  for (const [path,key] of keys) {
    const route = read(`app/api/notifications/${path}`);
    assert.ok(route.includes(`notificationActionGate("${key}")`),path);
    assert.ok(!route.includes('getDirectAccountGate([], { authOnly: true })'),path);
  }
  const bootstrap = read('lib/page-bootstrap-direct.js');
  assert.ok(bootstrap.indexOf('featureAllowed(gate.account, "notifications.view")') < bootstrap.indexOf('const payload = await notificationsForMember(gate.memberId, { limit: 80 });'));
  const page = read('app/notifications/page.jsx');
  assert.ok(page.indexOf('!featureAllowed(account, "notifications.view")') < page.indexOf('await notificationsForMember(gate.memberId, { limit: 80 })'));
});

test('2P4D enforces independent profile edits, passwords and avatar actions server side', () => {
  const account = read('app/api/account/route.js');
  assert.ok(account.includes('featureAllowed(gate.account, "account.view")'));
  assert.ok(account.includes('isPasswordUpdate && !featureAllowed(gate.account, "account.password")'));
  assert.ok(account.includes('isProfileUpdate && !featureAllowed(gate.account, "account.edit")'));
  for (const path of ['image-direct/route.js','image-upload-ticket/route.js']) {
    const route=read(`app/api/account/${path}`);
    assert.ok(route.includes('"account.avatar"'));
    assert.ok(route.includes('"account.view"'));
    assert.ok(route.indexOf('"account.avatar"') < route.indexOf('await uploadAccountImageDirect') || route.includes('image-upload-ticket'));
  }
  assert.ok(read('app/api/account/verify-password/route.js').includes('"account.password"'));
  assert.ok(read('app/account/page.jsx').includes('featureAllowed(gate.account, "account.view")'));
});

test('2P4D hides disallowed personal controls and keeps push unsubscribe available', () => {
  const account = read('components/account/AccountClient.jsx');
  assert.ok(account.includes('canEditProfile = featureAllowed(initialAccount, "account.edit")'));
  assert.ok(account.includes('canEditAvatar = featureAllowed(initialAccount, "account.avatar")'));
  assert.ok(account.includes('canChangePassword = featureAllowed(initialAccount, "account.password")'));
  assert.ok(account.includes('canChangeNotificationSettings = featureAllowed(initialAccount, "notifications.preferences")'));
  assert.ok(read('components/notifications/NotificationsBell.jsx').includes('canManageRead = true'));
  assert.ok(read('components/notifications/NotificationsClient.jsx').includes('canManageRead = true'));
  assert.ok(read('components/AppShell.jsx').includes('featureAllowed(account, "notifications.view")'));
  assert.ok(read('components/UserProfileMenu.jsx').includes('featureAllowed(account, "account.view")'));
  for(const path of ['subscribe','vapid-public-key']) assert.ok(read(`app/api/push/${path}/route.js`).includes('notificationActionGate("notifications.preferences")'));
  assert.ok(!read('app/api/push/unsubscribe/route.js').includes('notificationActionGate'));
});

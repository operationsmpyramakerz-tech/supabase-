import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const registrySource = src('../lib/feature-permissions-registry.js');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS } = await import(`data:text/javascript;base64,${Buffer.from(registrySource).toString('base64')}`);
const account = grants => ({ featureAccess: { mode: 'enforced', grants } });
const grant = allowed => ({ allowed, scope: 'all' });
const modules = {
  users: ['view', 'member_create', 'member_edit', 'member_delete', 'member_move', 'department_create', 'department_edit', 'department_delete', 'page_access_manage', 'feature_access_manage', 'sv_access_manage', 'signup_approve', 'signup_reject', 'stock_column_create'],
  'b2c.database': ['view', 'create', 'edit', 'copy', 'delete', 'fields', 'record_edit', 'record_delete', 'export'],
  'b2c.forms': ['view', 'create', 'edit', 'builder', 'submit'],
};

test('Phase 2H exposes opt-in Users Center and B2C modules with all registry actions', () => {
  const dialogs = src('../components/users-center/UsersCenterDialogs.jsx');
  for (const [mod, actions] of Object.entries(modules)) {
    assert.ok(dialogs.includes(`{ key: "${mod}", label:`), mod);
    assert.ok(dialogs.includes(`"${mod}": stored.some`) || dialogs.includes(`${mod}: stored.some`), `${mod} opt-in restored`);
    for (const action of actions) assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(`${mod}.${action}`), `${mod}.${action}`);
  }
});

test('Legacy and earlier Advanced accounts keep existing access until the module opts in', () => {
  const olderAccount = account({ 'orders.operations.view': grant(true) });
  for (const [mod, actions] of Object.entries(modules)) {
    assert.equal(featureAllowed(olderAccount, `${mod}.${actions[1]}`), true, `${mod}: legacy`);
    assert.equal(featureAllowed(account({ [`${mod}.view`]: grant(false), [`${mod}.${actions[1]}`]: grant(true) }), `${mod}.${actions[1]}`), false, `${mod}: denied parent View`);
    assert.equal(featureAllowed(account({ [`${mod}.view`]: grant(true), [`${mod}.${actions[1]}`]: grant(false) }), `${mod}.${actions[1]}`), false, `${mod}: denied action`);
    assert.equal(featureAllowed(account({ [`${mod}.view`]: grant(true), [`${mod}.${actions[1]}`]: grant(true) }), `${mod}.${actions[1]}`), true, `${mod}: allowed action`);
  }
});

test('B2C mutations dispatch each known action to an independent enforced key', () => {
  const route = src('../app/api/b2c/mutations-direct/route.js');
  for (const action of Object.keys(modules).filter(m => m.startsWith('b2c')).flatMap(m => modules[m].map(a => `${m}.${a}`)).filter(key => !key.endsWith('.view') && key !== 'b2c.database.export')) {
    assert.ok(route.includes(`"${action}"`), action);
  }
  assert.ok(route.includes('featureGate(context, permissionKey)'));
  assert.ok(route.includes('if (!permissionKey) return json'));
});

test('B2C direct read/export routes gate View and Export independently', () => {
  for (const [file, key] of [
    ['databases/route.js','b2c.database.view'], ['databases/[id]/records/route.js','b2c.database.view'],
    ['forms/route.js','b2c.forms.view'], ['forms/[id]/route.js','b2c.forms.view'],
    ['export-direct/route.js','b2c.database.export'],
  ]) assert.ok(src(`../app/api/b2c/${file}`).includes(`feature: "${key}"`), file);
  assert.ok(src('../app/api/b2c/upload-ticket/route.js').includes('b2c.forms.submit'));
  assert.ok(src('../app/api/b2c/upload-ticket/route.js').includes('b2c.database.record_edit'));
});

test('Users Center mutations separate user creation from access management to avoid privilege escalation', () => {
  const route = src('../app/api/users-center/mutations-direct/route.js');
  assert.ok(route.includes('users.page_access_manage'));
  assert.ok(route.includes('users.sv_access_manage'));
  assert.ok(route.includes('if (requestedPages.length)'));
  assert.ok(route.includes('requestedSupervision.length'));
  assert.ok(route.includes('const gate = featureGate('));
  for (const file of ['page-access', 'pages', 'sv-access']) {
    assert.ok(src(`../app/api/users-center/${file}/route.js`).includes('featureGate(featureGate('));
  }
});

test('Buttons are conditionally hidden, including destructive actions and privilege management', () => {
  const db=src('../components/b2c/B2cDatabaseClient.jsx');
  assert.ok(db.includes('permissions.delete ? <button'));
  assert.ok(db.includes('permissions.create ? <button'));
  const table=src('../components/b2c/B2cTableWorkspaceClient.jsx');
  assert.ok(table.includes('canDeleteRecord ? <button'));
  assert.ok(table.includes('canExport ? <a'));
  const users=src('../components/users-center/UsersCenterClient.jsx');
  assert.ok(users.includes('access.memberDelete ? <button'));
  assert.ok(users.includes('access.departmentCreate ? <AddDepartmentFolder'));
  const dialogs=src('../components/users-center/UsersCenterDialogs.jsx');
  assert.ok(dialogs.includes('if (access.pageAccess) return <PageAccessManager'));
  assert.ok(dialogs.includes('allowAdvanced={access.featureAccess}'));
});

test('No B2C legacy bootstrap on unverified authorization failure', () => {
  for (const file of ['database/page.jsx','database/[id]/page.jsx','forms/page.jsx']) {
    const source=src(`../app/b2c/${file}`);
    assert.ok(source.includes('if (!pageData || pageData.status === 503)'),file);
    assert.ok(source.indexOf('if (!pageData || pageData.status === 503)') < source.indexOf('if (!pageData?.ok)'),file);
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const registrySource = src('../lib/feature-permissions-registry.js');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS } = await import(`data:text/javascript;base64,${Buffer.from(registrySource).toString('base64')}`);
const grant = allowed => ({ allowed, scope: 'all' });
const enforced = grants => ({ featureAccess: { mode: 'enforced', grants } });

const modules = {
  backup: ['view', 'row_read', 'row_create', 'row_edit', 'export', 'import', 'delete_table', 'delete_all'],
  history: ['view', 'clear'],
};

test('New high-risk modules expose only audited permission keys and are opt-in', () => {
  const dialog = src('../components/users-center/UsersCenterDialogs.jsx');
  for (const [module, actions] of Object.entries(modules)) {
    assert.ok(dialog.includes(`{ key: "${module}", label:`), module);
    assert.ok(dialog.includes(`${module}: stored.some(item => item.key === "${module}.view")`), module);
    for (const action of actions) assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(`${module}.${action}`));
  }
});

test('Legacy users and earlier Advanced accounts retain access; opted-in modules are deny-by-default', () => {
  for (const [module, actions] of Object.entries(modules)) {
    const action = actions[1];
    assert.equal(featureAllowed(enforced({}), `${module}.${action}`), true);
    assert.equal(featureAllowed(enforced({ [`${module}.view`]: grant(false), [`${module}.${action}`]: grant(true) }), `${module}.${action}`), false);
    assert.equal(featureAllowed(enforced({ [`${module}.view`]: grant(true), [`${module}.${action}`]: grant(false) }), `${module}.${action}`), false);
    assert.equal(featureAllowed(enforced({ [`${module}.view`]: grant(true), [`${module}.${action}`]: grant(true) }), `${module}.${action}`), true);
    assert.equal(featureAllowed(enforced({ [`${module}.view`]: grant(true), [`${module}.${action}`]: { allowed: true, scope: 'own' } }), `${module}.${action}`), false);
  }
});

test('Backup API uses a distinct permission before every read/write/export/import/delete action', () => {
  const checks = [
    ['backup/tables/route.js', ['backup.view']],
    ['backup/rows-direct/route.js', ['backup.row_read', 'backup.row_create', 'backup.row_edit']],
    ['backup/export-direct/route.js', ['backup.export']],
    ['backup/import-ticket/route.js', ['backup.import']],
    ['backup/mutations-direct/route.js', ['backup.import', 'backup.delete_table', 'backup.delete_all']],
  ];
  for (const [file, permissions] of checks) {
    const contents = src(`../app/api/${file}`);
    assert.ok(contents.includes('featureGate('), file);
    for (const key of permissions) assert.ok(contents.includes(`"${key}"`), `${file}: ${key}`);
    assert.ok(contents.includes('if (!permitted.ok)') || contents.includes('if (!ctx.ok)'), `${file} permission denial`);
  }
  const writes = src('../app/api/backup/mutations-direct/route.js');
  assert.ok(writes.indexOf('if (!permitted.ok)') < writes.indexOf('await deleteAllBackupData('));
  const legacyAlias = src('../app/api/backup/tables/[key]/rows/route.js');
  assert.ok(legacyAlias.includes('"backup.row_read"'));
  assert.ok(legacyAlias.includes('"backup.view"'));
  assert.ok(legacyAlias.includes('featureAllowed(gate.account, "backup.row_edit")'));
  assert.ok(legacyAlias.includes('if (gate.account?.featureAccess?.mode === "enforced")'));
  const row = src('../app/api/backup/rows-direct/route.js');
  assert.ok(row.indexOf('context("backup.row_create")') < row.indexOf('await createBackupRow('));
  assert.ok(row.indexOf('context("backup.row_edit")') < row.indexOf('await updateBackupRow('));
});

test('History list and individual detail require View; Clear requires separate grant before admin-password check', () => {
  const list = src('../app/api/history/route.js');
  const detail = src('../app/api/history/[id]/route.js');
  assert.ok(list.includes('"history.view"') && list.includes('"history.clear"'));
  assert.ok(list.indexOf('"history.clear"') < list.indexOf('const adminPassword'));
  assert.ok(detail.includes('getDirectAccountGate(["History"])'));
  assert.ok(detail.includes('featureGate(gate, "history.view")'));
  assert.ok(!detail.includes('getLegacyAccountGate'));
});

test('UI hides disallowed destructive functions; page and individual row routes check View', () => {
  const backup = src('../components/backup/BackupClient.jsx');
  for (const expected of ['canExport ? <a', 'canDeleteAll ? <button', 'canDeleteTable ? <button', 'canImport ? <button', 'if (canReadRows) router.push']) assert.ok(backup.includes(expected), expected);
  const table = src('../components/backup/BackupTableClient.jsx');
  assert.ok(table.includes('canCreate ? ('));
  assert.ok(table.includes('canEdit ? ('));
  const history = src('../components/history/HistoryClient.jsx');
  assert.ok(history.includes('canClear ? <button'));
  for (const file of ['../app/backup/page.jsx', '../app/backup/[key]/page.jsx', '../app/history/page.jsx']) {
    assert.ok(src(file).includes('featureGate('), file);
  }
});

test('Navigation filters Backup/History both in new shell and legacy page aliases', () => {
  const shell = src('../components/AppShell.jsx');
  const session = src('../lib/direct-session-account.js');
  for (const module of ['backup', 'history']) {
    assert.ok(shell.includes(`featureAllowed(account, "${module}.view")`));
    assert.ok(session.includes(`"${module}.view"`));
  }
});

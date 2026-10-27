import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const regSource = source('lib/feature-permissions-registry.js');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS, PILOT_FEATURE_MODULES } = await import(`data:text/javascript;base64,${Buffer.from(regSource).toString('base64')}`);
const g = allowed => ({ allowed, scope: 'all' });
const user = grants => ({ featureAccess: { mode: 'enforced', grants } });

test('KPIs and SLA have independent opt-in modules; View denial overrides action grant', () => {
  for (const [module, actions] of Object.entries({ kpis: ['standard_manage', 'review_create', 'scores_edit', 'evidence_upload', 'report'], sla: ['manage'] })) {
    assert.ok(PILOT_FEATURE_MODULES.includes(module));
    assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(`${module}.view`));
    for (const action of actions) {
      const key = `${module}.${action}`;
      assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(key), key);
      assert.equal(featureAllowed(user({}), key), true, 'old Advanced account remains legacy for unmigrated group');
      assert.equal(featureAllowed(user({ [`${module}.view`]: g(false), [key]: g(true) }), key), false);
      assert.equal(featureAllowed(user({ [`${module}.view`]: g(true), [key]: g(false) }), key), false);
      assert.equal(featureAllowed(user({ [`${module}.view`]: g(true), [key]: g(true) }), key), true);
      assert.equal(featureAllowed(user({ [`${module}.view`]: g(true), [key]: {allowed: true, scope: 'own'} }), key), false);
    }
  }
});

test('KPI direct routes authorize specific operations before mutation, ticket, PDF or password', () => {
  const expected = [
    ['app/api/kpis/mutations-direct/route.js', ['kpis.standard_manage','kpis.review_create','kpis.scores_edit']],
    ['app/api/kpis/evidence-upload/route.js', ['kpis.evidence_upload','kpis.scores_edit']],
    ['app/api/kpis/report-direct/route.js', ['kpis.report']],
    ['app/api/kpis/admin/verify/route.js', ['kpis.standard_manage','kpis.review_create']],
  ];
  for (const [path, keys] of expected) {
    const s = source(path);
    for (const key of keys) assert.ok(s.includes(key), `${path}: ${key}`);
    assert.ok(s.includes('403'), path);
  }
  assert.ok(source('lib/kpis-data.js').includes('featureGate(await getDirectAccountGate(["KPIs"]), "kpis.view")'));
  const mutation = source('lib/kpis-mutations.js');
  assert.ok(mutation.indexOf('The score does not belong') < mutation.indexOf('for (const row of inputScores)'));
  assert.ok(mutation.includes('review_id: `eq.${reviewId}`'));
});

test('KPI buttons, score editor, report and evidence ticket disappear without grants', () => {
  const ui = source('components/kpis/KpisClient.jsx');
  for (const expected of ['permissions.review_create ? <button', 'permissions.standard_manage ? <button', 'permissions.report ? <button', 'readOnly={modal.readOnly || !permissions.scores_edit}', 'canUploadEvidence={permissions.evidence_upload && permissions.scores_edit}']) assert.ok(ui.includes(expected), expected);
  const dialogs = source('components/kpis/KpisDialogs.jsx');
  assert.ok(dialogs.includes('canUploadEvidence ? <>'));
  assert.ok(dialogs.includes('password: clean, kind'));
});

test('SLA View is read-only and SLA Manage protects mutations and diagnostics', () => {
  const helper = source('lib/home-sla-settings.js');
  assert.ok(helper.includes("Object.hasOwn(account?.featureAccess?.grants || {}, 'sla.view')"));
  for (const endpoint of ['sla-settings','sla-escalations']) {
    const s=source(`app/api/home/${endpoint}/route.js`);
    assert.ok(s.includes("'manage'"), endpoint);
    assert.ok(s.includes('canManageSla'), endpoint);
  }
  assert.ok(source('app/api/home/sla-health/route.js').includes('canManageSla(gate.account)'));
  const view=source('components/home/SlaSettingsClient.jsx');
  assert.ok(view.includes('disabled={!canEdit}'));
  assert.ok(view.includes('{canEdit ? <EscalationRoutes /> : null}'));
  assert.ok(view.includes('{canEdit ? <SlaDiagnostics /> : null}'));
});

test('Users Center exposes opt-in groups and navigation respects KPI View', () => {
  const dialog=source('components/users-center/UsersCenterDialogs.jsx');
  for (const module of ['kpis','sla']) {
    assert.ok(dialog.includes(`{ key: "${module}", label:`));
    assert.ok(dialog.includes(`${module}: stored.some(item => item.key === "${module}.view")`));
  }
  assert.ok(source('components/AppShell.jsx').includes('featureAllowed(account, "kpis.view")'));
  assert.ok(source('lib/direct-session-account.js').includes('featureAllowed({ featureAccess }, "kpis.view")'));
});

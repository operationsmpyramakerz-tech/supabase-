import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v108: member, pages, page access, and feature grants are mandatory for an account gate', () => {
  const src = read('lib/direct-session-account.js');
  for (const stage of ['MEMBER', 'PAGES', 'PAGE_ACCESS', 'FEATURE_GRANTS']) {
    assert.ok(src.includes(`"${stage}"`), `missing stage ${stage}`);
  }
  assert.ok(src.includes('Promise.allSettled(reads.map('));
  assert.ok(src.includes('console.error("[erp-auth] Fresh account read failed"'));
  assert.ok(src.includes('diagnosticCode: `AUTH_${stage}_UNAVAILABLE`'));
  assert.ok(src.includes('ok: false, status: 503, account: null'));
  assert.ok(src.includes('diagnosticCode: "AUTH_MEMBER_NOT_FOUND"'));
  assert.ok(src.includes('diagnosticCode: "AUTH_GATE_FAILED"'));
  assert.ok(!src.includes('return await loadMemberFeatureAccess(memberId).catch(() => ({ mode: "legacy" }))'));
});

test('v108: Home checks current verified grants before loading any dashboard data', () => {
  const src = read('app/home/page.jsx');
  assert.ok(src.includes('const gate = await getDirectAccountGate([])'));
  assert.ok(!src.includes('authOnly: true'));
  assert.ok(!src.includes('getDirectAccountGateFromSessionContext('));
  assert.ok(src.indexOf('if (!gate.ok || !gate.account)') < src.indexOf('loadHomeOverviewDirect({ account'));
  assert.ok(src.indexOf('if (!featureAllowed(account, "home.view"))') < src.indexOf('loadHomeOverviewDirect({ account'));
  assert.ok(src.includes('if (Number(error?.status) === 403)'));
});

test('v108: Notifications gate checked before accessing personal notification rows', () => {
  const src = read('app/notifications/page.jsx');
  assert.ok(src.includes('const gate = await getDirectAccountGate([])'));
  assert.ok(!src.includes('authOnly: true'));
  assert.ok(src.indexOf('if (!featureAllowed(account, "notifications.view"))') < src.indexOf('await notificationsForMember(gate.memberId'));
  assert.ok(src.indexOf('if (gate.status === 403)') < src.indexOf('fetchDirectPageBootstrap('));
});

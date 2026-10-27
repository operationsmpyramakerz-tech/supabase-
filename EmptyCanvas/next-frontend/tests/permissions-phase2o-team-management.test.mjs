import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MAX_TEAM_LINKS, normalizeTeamLinks, safeMemberId } from '../lib/team-scope-management.mjs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');

test('team visibility validates exact IDs, removes duplicates and excludes manager', () => {
  const known = ['manager-id', 'alice', 'bob', '003'];
  assert.deepEqual(normalizeTeamLinks('manager-id', ['bob', 'alice', 'bob'], known), ['alice', 'bob']);
  assert.deepEqual(normalizeTeamLinks('manager-id', [], known), []);
  assert.equal(safeMemberId('003'), '003');
  assert.equal(safeMemberId('john@example.com'), '');
  assert.throws(() => normalizeTeamLinks('manager-id', ['manager-id'], known), /invalid/i);
  assert.throws(() => normalizeTeamLinks('manager-id', ['unauthorized'], known), /invalid/i);
  assert.throws(() => normalizeTeamLinks('manager-id', ['<sql>'], known), /invalid/i);
});

test('team link validation rejects malformed and oversized lists', () => {
  assert.throws(() => normalizeTeamLinks('manager-id', null), /at most/i);
  assert.throws(() => normalizeTeamLinks('', []), /manager/i);
  assert.throws(() => normalizeTeamLinks('manager-id', new Array(MAX_TEAM_LINKS + 1).fill('alice')), /at most/i);
});

test('team manager reads require users center permission and do not return credentials', () => {
  const route = source('app/api/users-center/team-scope/route.js');
  assert.match(route, /featureGate\(featureGate\(await getDirectAccountGate\(PAGES\), "users\.view"\), "users\.feature_access_manage"\)/);
  assert.match(route, /select\("erp_member_scope_team_links"/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /members: members\.filter\(row => row\.id !== id\)\.map\(row => \(\{ id: row\.id, name: row\.name/);
  assert.doesNotMatch(route, /password|authorizationToken/);
});

test('team mutation validates the same permissions and requires admin verification', () => {
  const route = source('app/api/users-center/mutations-direct/route.js');
  assert.match(route, /verifyUsersCenterAuthorizationToken\(body\?\.authorizationToken/);
  assert.match(route, /"team-scope-save": "users\.feature_access_manage"/);
  assert.match(route, /normalizeTeamLinks\(targetId, body\?\.visibleMemberIds\)/);
  assert.match(route, /normalizeTeamLinks\(targetId, body\?\.expectedVisibleIds\)/);
  assert.match(route, /rpc\("erp_replace_member_scope_team_links"/);
  assert.doesNotMatch(route, /team-scope-save[\s\S]*supabaseRequest\([^\n]*DELETE/);
});

test('SQL uses one atomic transaction, server-only grant and optimistic conflict rejection', () => {
  const sql = source('sql/ERP_Phase2O_Team_Scope_Management_v93.sql');
  assert.match(sql, /security definer/i);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /v_existing <> v_expected/);
  assert.match(sql, /errcode = '40001'/);
  assert.match(sql, /delete from public\.erp_member_scope_team_links/);
  assert.match(sql, /on conflict \(manager_member_id, visible_member_id\) do nothing/);
  assert.match(sql, /revoke all on function .* from public, anon, authenticated/);
  assert.match(sql, /grant execute on function .* to service_role/);
});

test('UI offers filtered bulk actions without modifying hidden permissions and allows team editing only by explicit save', () => {
  const ui = source('components/users-center/UsersCenterDialogs.jsx');
  assert.match(ui, /visibleFeatures\.map\(item => \[item\.key, true\]\)/);
  assert.match(ui, /visibleFeatures\.map\(item => \[item\.key, false\]\)/);
  assert.match(ui, /selected\.length} direct team member/);
  assert.match(ui, /expectedVisibleIds: initial/);
  assert.match(ui, /Manage Team Visibility/);
  assert.match(ui, /Search permissions/);
});

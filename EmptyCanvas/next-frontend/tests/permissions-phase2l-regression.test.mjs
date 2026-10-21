import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
const registryUrl = `data:text/javascript;base64,${Buffer.from(read("lib/feature-permissions-registry.js")).toString("base64")}`;
const policySource = read("lib/home-analysis-permissions.js").replace("./feature-permissions-registry", registryUrl);
const policy = await import(`data:text/javascript;base64,${Buffer.from(policySource).toString("base64")}`);
function account(scope = "own", active = true) {
  return {
    teamMemberId: "manager1",
    pageAccess: { pages: [] },
    featureAccess: { mode: "enforced", grants: {
      "home.view": { allowed: true, scope: "all" },
      "home.analysis": { allowed: active, scope },
      "home.financial_analysis": { allowed: true, scope: "all" },
    } },
  };
}

test("Home Own never authorizes another user's data even with supplied team IDs", () => {
  assert.equal(policy.homeAnalysisScope(account("own")), "own");
  assert.equal(policy.homeSelection(account("own"), "manager1").allowed, true);
  assert.equal(policy.homeSelection(account("own"), "target", { teamIds: ["target"] }).status, 403);
  assert.equal(policy.homeSelection(account("own"), "all").userId, "manager1");
});

test("Home Team defaults to self and only allows explicitly linked member IDs", () => {
  assert.equal(policy.homeAnalysisScope(account("team")), "team");
  assert.equal(policy.homeSelection(account("team"), "other").status, 403);
  assert.equal(policy.homeSelection(account("team"), "other", { teamIds: ["member2"] }).status, 403);
  assert.equal(policy.homeSelection(account("team"), "member2", { teamIds: ["member2"] }).userId, "member2");
  assert.deepEqual(policy.homeSelection(account("team"), "all", { teamIds: ["member2"] }), { allowed: true, userId: "manager1", canSelectUsers: true, analysisScope: "team" });
});

test("Home All allows existing all-team selector; denied View never expands access", () => {
  assert.equal(policy.homeSelection(account("all"), "all").userId, "all");
  assert.equal(policy.homeSelection(account("all"), "other").allowed, true);
  assert.equal(policy.homeAnalysisScope(account("all", false)), "own");
  const denied = account("all"); denied.featureAccess.grants["home.view"].allowed = false;
  assert.equal(policy.homeSelection(denied, "manager1").status, 403);
});

test("Existing Home legacy accounts retain original analysis behavior", () => {
  const legacy = { teamMemberId: "manager1" };
  assert.equal(policy.homeAnalysisScope(legacy), "all");
  assert.equal(policy.homeSelection(legacy, "other").allowed, true);
});

test("Home endpoints verify Team scope before returning member-level data", () => {
  for (const file of [
    "app/api/home/analysis-users/route.js", "app/api/home/stocktaking-users/route.js",
    "app/api/home/stocktaking-user/route.js", "app/api/home/analysis-user-expenses/route.js",
  ]) assert.match(read(file), /resolveHomeSelection/);
  assert.match(read("app/api/home/analysis-users/route.js"), /scopeHomeUsers/);
  assert.match(read("app/api/home/stocktaking-users/route.js"), /scopeHomeUsers/);
  assert.match(read("lib/home-overview-data.js"), /await resolveHomeSelection\(account, requestedUserId\)/);
  assert.match(read("lib/page-bootstrap-direct.js"), /await resolveHomeSelection\(gate.account, requestedUserId\)/);
  assert.match(read("lib/home-team-scopes.js"), /Home team scope is unavailable/);
});

test("Scope UI round-trips Home own/team/all grants instead of clearing them", () => {
  const component = read("components/users-center/UsersCenterDialogs.jsx");
  assert.match(component, /setGrantScopes\(Object.fromEntries/);
  assert.match(component, /item.allowed === true\]\)/);
  assert.match(component, /scope: grantScopes\[item.key\] \|\| "all"/);
  assert.match(component, /aria-label="Home analysis data scope"/);
  assert.match(component, /<option value="own">Own<\/option>/);
  assert.match(component, /<option value="team">Team<\/option>/);
  assert.match(component, /<option value="all">All<\/option>/);
});

test("Team scope requires explicit protected links, not department matching", () => {
  const ddl = read("ERP_Phase2L_Home_Team_Scope.sql");
  assert.match(ddl, /enable row level security/i);
  assert.match(ddl, /revoke all.*anon, authenticated/i);
  assert.match(ddl, /manager_member_id text not null/i);
  assert.match(read("lib/home-team-scopes.js"), /manager_member_id: `eq\.\$\{memberId\}`/);
  assert.doesNotMatch(read("lib/home-team-scopes.js"), /department\s*===/);
});

test("server resolution scopes team selectors and user lists to allowlisted IDs", async () => {
  const selectUrl = `data:text/javascript;base64,${Buffer.from(`export async function select(table, options){
    if(table !== 'erp_member_scope_team_links' || options.manager_member_id !== 'eq.manager1') throw Error('unexpected query');
    return [{visible_member_id:'member2'}, {visible_member_id:'member2'}];
  }`).toString('base64')}`;
  const policyUrl = `data:text/javascript;base64,${Buffer.from(policySource).toString('base64')}`;
  const serverSource = read("lib/home-team-scopes.js")
    .replace('import "server-only";', "")
    .replace('./supabase-rest', selectUrl)
    .replace('./home-analysis-permissions', policyUrl);
  const scopeApi = await import(`data:text/javascript;base64,${Buffer.from(serverSource).toString('base64')}`);
  assert.equal((await scopeApi.resolveHomeSelection(account('team'), 'member2')).allowed, true);
  assert.equal((await scopeApi.resolveHomeSelection(account('team'), 'outsider')).status, 403);
  assert.deepEqual((await scopeApi.scopeHomeUsers(account('team'), [
    {id:'manager1'}, {id:'member2'}, {id:'outsider'},
  ])).map(x=>x.id), ['manager1','member2']);
});

test("Team relationship lookup failure cannot elevate to All", async () => {
  const selectUrl = `data:text/javascript;base64,${Buffer.from(`export async function select(){throw new Error('missing table')}`).toString('base64')}`;
  const policyUrl = `data:text/javascript;base64,${Buffer.from(policySource).toString('base64')}`;
  const serverSource = read("lib/home-team-scopes.js")
    .replace('import "server-only";', "")
    .replace('./supabase-rest', selectUrl)
    .replace('./home-analysis-permissions', policyUrl);
  const scopeApi = await import(`data:text/javascript;base64,${Buffer.from(serverSource).toString('base64')}`);
  assert.equal((await scopeApi.resolveHomeSelection(account('team'), 'other')).status, 503);
  await assert.rejects(scopeApi.scopeHomeUsers(account('team'), [{id:'other'}]));
});

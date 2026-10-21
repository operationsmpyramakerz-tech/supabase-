import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(import.meta.dirname, "..", file), "utf8");
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const registry = await import(url(read("lib/feature-permissions-registry.js")));

function account(scope = "own", viewScope = "all", id = "manager") {
  return { teamMemberId: id, featureAccess: { mode: "enforced", grants: {
    "expenses.users.view": { allowed: true, scope: viewScope },
    "expenses.users.edit": { allowed: true, scope },
    "expenses.users.delete": { allowed: true, scope },
    "expenses.users.export": { allowed: true, scope },
  } } };
}

const fakeSupabase = url(`
  const directory = [
    {id:'manager',name:'Manager',employee_code:'M1'},
    {id:'alice',name:'Alice',employee_code:'A2'},
    {id:'bob',name:'Bob',employee_code:'B3'},
    {id:'duplicate',name:'Alice',employee_code:'C4'}
  ];
  export async function selectAll(table) { if(table==='team_members')return directory; throw Error('unexpected table'); }
  export async function select(table, params) {
    if(table !== 'erp_member_scope_team_links')throw Error('invalid relationship table');
    if(params.manager_member_id === 'eq.broken') throw Error('missing relationship table');
    return params.manager_member_id === 'eq.manager' ? [{visible_member_id:'alice'}] : [];
  }
  export async function selectById(table, id) {
    return {
      good: {id:'good',user_id:'M1',team_member_name:'Manager'},
      team: {id:'team',user_id:'A2',team_member_name:'Alice'},
      outside: {id:'outside',user_id:'B3',team_member_name:'Bob'},
      spoof: {id:'spoof',user_id:'B3',team_member_name:'Manager'},
    }[id] || null;
  }
`);
const serverSource = read("lib/expenses-users-scope.js")
  .replace('import "server-only";', "")
  .replace("./supabase-rest", fakeSupabase);
const scope = await import(url(serverSource));

test("scoped Expenses grants render controls but do not affect other unscoped module policies", () => {
  assert.equal(registry.featureAllowed(account("own"), "expenses.users.edit"), true);
  assert.equal(registry.featureAllowed(account("team"), "expenses.users.export"), true);
  assert.equal(registry.featureAllowed(account("own"), "orders.operations.ship"), false);
});

test("View cap intersects the scopes of each action", () => {
  assert.equal(scope.expensesUsersActionScope(account("all", "own"), "expenses.users.edit"), "own");
  assert.equal(scope.expensesUsersActionScope(account("all", "team"), "expenses.users.edit"), "team");
  assert.equal(scope.expensesUsersActionScope(account("own", "all"), "expenses.users.edit"), "own");
  assert.equal(scope.expensesUsersActionScope(account("team", "team"), "expenses.users.export"), "team");
  const denied = account(); denied.featureAccess.grants["expenses.users.view"].allowed = false;
  assert.equal(scope.expensesUsersActionScope(denied), "none");
  const disabled = account(); disabled.featureAccess.grants["expenses.users.export"].allowed = false;
  assert.equal(scope.expensesUsersActionScope(disabled, "expenses.users.export"), "none");
  assert.equal(scope.expensesUsersActionScope({ teamMemberId: "manager" }), "legacy");
});

test("Own list includes only the verified user's expense summary", async () => {
  const data = [{id:'M1'}, {id:'A2'}, {id:'B3'}, {id:'unknown'}];
  assert.deepEqual((await scope.scopeExpenseUsersSummary(account("own", "own"), data)).map(x => x.id), ["M1"]);
});

test("Team list and detail never include unlinked users or ambiguous employee names", async () => {
  const data = [{id:'M1'}, {id:'A2'}, {id:'B3'}, {id:'Alice'}];
  assert.deepEqual((await scope.scopeExpenseUsersSummary(account("team", "team"), data)).map(x => x.id), ["M1", "A2"]);
  assert.equal(await scope.resolveExpenseUserAccess(account("team", "team"), "expenses.users.view", "alice"), "A2");
  await assert.rejects(scope.resolveExpenseUserAccess(account("team", "team"), "expenses.users.view", "Bob"), {status:403});
  await assert.rejects(scope.resolveExpenseUserAccess(account("team", "team"), "expenses.users.view", "Alice"), {status:403});
  const detail = await scope.scopeExpenseDetail(account("team", "team"), "expenses.users.view", "A2", {
    items: [{userId:'A2'}, {userId:'B3'}, {userId:'M1'}], lastSettledDate:'2026-10-21'
  });
  assert.deepEqual(detail.items, [{userId:'A2'}]);
});

test("Record action matches authoritative employee code, never a forged name", async () => {
  await scope.assertExpenseRecordAccess(account("team", "team"), "expenses.users.edit", "team");
  await scope.assertExpenseRecordAccess(account("own", "own"), "expenses.users.delete", "good");
  await assert.rejects(scope.assertExpenseRecordAccess(account("team", "team"), "expenses.users.delete", "outside"), {status:403});
  await assert.rejects(scope.assertExpenseRecordAccess(account("team", "team"), "expenses.users.edit", "spoof"), {status:403});
});

test("Unknown scopes fail closed and legacy profiles keep their existing visibility", async () => {
  const invalid = account("assigned", "all");
  assert.equal(scope.expensesUsersActionScope(invalid,"expenses.users.edit"), "none");
  await assert.rejects(scope.resolveExpenseUserAccess(invalid,"expenses.users.edit","manager"), {status:403});
  const rows = [{id:'M1'}, {id:'B3'}];
  assert.deepEqual(await scope.scopeExpenseUsersSummary({teamMemberId:'manager'}, rows), rows);
});

test("All expense users entry points enforce server-side row scopes", () => {
  const checks = [
    ["app/expenses/users/page.jsx", "scopeExpenseUsersSummary"],
    ["app/api/expenses/users/route.js", "scopeExpenseUsersSummary"],
    ["app/api/expenses/user/[memberId]/route.js", "resolveExpenseUserAccess"],
    ["app/api/expenses/export-direct/route.js", "scopeExpenseDetail"],
    ["app/api/expenses/mutations-direct/route.js", "assertExpenseRecordAccess"],
    ["app/api/expenses/screenshot-direct/route.js", "assertExpenseRecordAccess"],
    ["app/api/home/analysis-user-expenses/route.js", "resolveExpenseUserAccess"],
  ];
  for (const [path, functionName] of checks) assert.ok(read(path).includes(functionName), path);
  assert.match(read("components/users-center/UsersCenterDialogs.jsx"), /item.key.startsWith\("expenses.users."\)/);
});

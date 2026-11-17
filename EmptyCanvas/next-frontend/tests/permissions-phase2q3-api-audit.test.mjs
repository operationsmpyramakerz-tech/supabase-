import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCompleteOrderSelection } from "../lib/order-action-selection.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = (...ids) => ids.map(id => ({ id, order_number: 117 }));

test("2Q3 order mutation guard only accepts every component in the saved order", () => {
  assert.equal(isCompleteOrderSelection(["1", "2"], rows("1", "2"), rows("1", "2")), true);
  assert.equal(isCompleteOrderSelection(["2", "1"], rows("2", "1"), rows("1", "2")), true);
  assert.equal(isCompleteOrderSelection(["1"], rows("1"), rows("1", "2")), false);
  assert.equal(isCompleteOrderSelection(["1", "2"], rows("1", "2"), rows("1")), false);
  assert.equal(isCompleteOrderSelection(["1", "2"], rows("1", "2"), rows("1", "3")), false);
  assert.equal(isCompleteOrderSelection(["1", "2"], rows("1", "2"), [{ id: "1", order_number: 117 }, { id: "2", order_number: 118 }]), false);
});

test("2Q3 order mutation guard fails closed on duplicates, malformed IDs and oversized batches", () => {
  assert.equal(isCompleteOrderSelection(["1", "1"], rows("1", "1"), rows("1", "2")), false);
  assert.equal(isCompleteOrderSelection(["1", "2"], rows("1", "2"), rows("1", "1")), false);
  assert.equal(isCompleteOrderSelection(["1", "2"], rows("1", "2"), rows("1", "2"), { maxRows: 1 }), false);
  assert.equal(isCompleteOrderSelection(["1", "2"], [{ id: "1", order_number: null }, { id: "2", order_number: null }], rows("1", "2")), false);
  assert.equal(isCompleteOrderSelection(["1", "2"], [{ id: "1", order_number: 117 }, { id: "2", order_number: 118 }], rows("1", "2")), false);
  assert.equal(isCompleteOrderSelection([], [], []), false);
});

test("2Q3 current orders archive, restore, delete check complete order and scopes BEFORE writes", () => {
  const code = read("lib/current-orders-data.js");
  const action = code.slice(code.indexOf("export async function performCurrentOrdersProtectedAction"));
  assert.ok(action.includes('await resolveOrderScope(account, `orders.my.${cleanAction}`)'));
  assert.ok(action.includes('await select(tableName(), {'));
  assert.ok(action.includes('order_number: `eq.${numbers[0]}`'));
  assert.ok(action.includes('isCompleteOrderSelection(ids, rows, savedRows)'));
  assert.ok(action.indexOf('isCompleteOrderSelection(ids, rows, savedRows)') < action.indexOf('await updateByIds(tableName(), ids'));
  assert.ok(action.indexOf('isCompleteOrderSelection(ids, rows, savedRows)') < action.indexOf('await deleteByIds(tableName(), ids'));
  assert.ok(action.indexOf('canViewMyOrderRow(row, account, actionScope)') >= 0);
  assert.ok(action.indexOf('canViewMyOrderRow(row, account, actionScope)') < action.indexOf('await updateByIds(tableName(), ids'));
  assert.ok(action.includes('deleted.length !== ids.length'));
  assert.doesNotMatch(action, /cleanCurrentActionIds\([^)]*\)\.slice/);
  assert.ok(code.includes('if (!ids.length || ids.length > 1000)'));
});

test("2Q3 operational delete still has independent feature and full order protection", () => {
  const route = read("app/api/orders/operations/mutations-direct/route.js");
  const data = read("lib/operations-orders-data.js");
  assert.ok(route.includes('delete: "orders.operations.delete"'));
  assert.ok(route.includes('await assertOrderIdsInScope(gate.account, actionPermission'));
  const destructive = data.slice(data.indexOf('export async function performOperationsProtectedAction'));
  assert.ok(destructive.includes('validateWholeOperationsOrder(loaded.clean, loaded.rows, allRows)'));
  assert.ok(destructive.indexOf('validateWholeOperationsOrder(loaded.clean, loaded.rows, allRows)') < destructive.indexOf('await deleteByIds(tableName(), loaded.clean)'));
  assert.ok(destructive.includes('deleted.length !== loaded.clean.length'));
});

test("2Q3 diagnostics endpoints do not disclose configuration without trusted admin", () => {
  for (const path of ["app/api/system/session-diagnostics/route.js", "app/api/storage/direct-diagnostics/route.js"]) {
    const code = read(path);
    assert.match(code, /isTrustedLegacyAdmin\(gate\.account\)/);
    assert.ok(code.indexOf('isTrustedLegacyAdmin(gate.account)') < code.indexOf('directSessionConfigured:') || !code.includes('directSessionConfigured:'));
    assert.ok(code.indexOf('isTrustedLegacyAdmin(gate.account)') < code.indexOf('storage: storageDiagnostics()') || !code.includes('storage: storageDiagnostics()'));
    assert.ok(code.includes('Diagnostics access denied.'));
    assert.ok(code.includes('private, no-store'));
  }
});

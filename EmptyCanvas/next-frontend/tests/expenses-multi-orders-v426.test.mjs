import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expenseOrderReferenceIds, verifiedExpenseOrderGroups } from "../lib/expense-order-access.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const rows = [{ id: "101", order_number: 147 }, { id: "102", order_number: 147 }, { id: "103", order_number: 139 }];

test("multiple order groups preserve user selection order", () => {
  assert.deepEqual(verifiedExpenseOrderGroups(rows, ["ord:139", "ord:147"]), ["ORD-139", "ORD-147"]);
  assert.deepEqual(verifiedExpenseOrderGroups(rows, ["ORD-147", "ORD-139"]), ["ORD-147", "ORD-139"]);
});
test("single-order legacy requests remain supported", () => {
  assert.deepEqual(verifiedExpenseOrderGroups(rows.slice(0, 2)), ["ORD-147"]);
  assert.deepEqual(verifiedExpenseOrderGroups(rows.slice(0, 2), ["ord:147"]), ["ORD-147"]);
});
test("missing, duplicate, mismatched, or untrusted selections are rejected", () => {
  for (const keys of [[], ["ord:147"], ["ord:147", "ord:147"], ["ord:139", "ord:1"], ["x:139", "ord:147"]]) {
    assert.throws(() => verifiedExpenseOrderGroups(rows, keys), (error) => error.status === 400);
  }
  assert.throws(() => verifiedExpenseOrderGroups([{ order_number: null }], ["ord:12"]), (error) => error.status === 400);
  assert.throws(() => verifiedExpenseOrderGroups(rows, "ord:147"), (error) => error.status === 400);
});
test("order row ID validation is still bounded and deduplicated", () => {
  assert.deepEqual(expenseOrderReferenceIds({ orderIds: ["101", "102", "103", "102"] }), ["101", "102", "103"]);
  assert.throws(() => expenseOrderReferenceIds({ orderIds: ["101;DROP"] }), (error) => error.status === 400);
});
test("cash out saves draft-selected order relations and uses server verified labels", () => {
  const dialogs = read("../components/expenses/ExpensesDialogs.jsx");
  const server = read("../lib/expense-order-access.js");
  const storage = read("../lib/expenses-data.js");
  assert.match(dialogs, /function ExpenseOrderMultiSelect/);
  assert.match(dialogs, /selectedOrderIds: isManual \? \[\] : selectedOrders\.flatMap/);
  assert.match(dialogs, /orderKeys: draft\.selectedOrderKeys/);
  assert.match(dialogs, /orderIds: draft\.selectedOrderIds/);
  assert.match(dialogs, /createdByName/);
  assert.match(server, /verifiedExpenseOrderGroups\(rows, requestedKeys\)/);
  assert.match(server, /if \(scopes !== null && !rowsAllowed\(group, scopes\)\)/);
  assert.match(server, /if \(expected\.size !== ids\.length/);
  assert.match(server, /enrichOrderNames/);
  assert.match(storage, /orders_names: verifiedOrder \? verifiedOrder\.orderLabel/);
});

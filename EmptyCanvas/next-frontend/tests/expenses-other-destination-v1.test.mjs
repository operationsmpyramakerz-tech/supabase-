import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const get = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const dialogs = get("components/expenses/ExpensesDialogs.jsx");
const edit = get("components/expenses/EditUserExpense.jsx");
const data = get("lib/expenses-data.js");
const css = get("public/css/expenses-other-destination-v1.css");
const layout = get("app/expenses/layout.jsx");
const SENTINEL = "__expense_other_destination__";

test("Cash Out Destination has an Other card plus required manual field, while user list remains searchable", () => {
  assert.match(dialogs, /const OTHER_DESTINATION_ID = "__expense_other_destination__"/);
  assert.match(dialogs, /function ExpenseDestinationSelect\(\{ value, onChange, options = \[\], allowManual = true \}\)/);
  assert.match(dialogs, /Other destination<\/strong>/);
  assert.match(dialogs, /Write destination manually/);
  assert.match(dialogs, /onClick=\{\(\) => choose\(OTHER_DESTINATION_ID\)\}/);
  assert.match(dialogs, /const isManualDestination = destinationUserId === OTHER_DESTINATION_ID/);
  assert.match(dialogs, /value=\{destinationManualName\}/);
  assert.match(dialogs, /destinationManualName: isManualDestination \? text\(destinationManualName\)/);
  assert.match(dialogs, /destinationManualName: draft\.destinationManualName/);
  assert.match(dialogs, /maxLength=\{160\}/);
  assert.match(css, /expense-destination-menu__card--other/);
  assert.match(layout, /expenses-other-destination-v1\.css/);
});

test("Edit Expense correctly restores manually entered destinations and allows switching back to user", () => {
  assert.match(edit, /originalManualDestination/);
  assert.match(edit, /originalManualDestination \? OTHER_DESTINATION_ID : clean\(item\.destinationUserId\)/);
  assert.match(edit, /allowManual=\{editableOrders\}/);
  assert.match(edit, /value=\{form\.destinationManualName\}/);
  assert.match(edit, /destinationManualName: clean\(form\.destinationManualName\)/);
  assert.match(edit, /!clean\(form\.destinationManualName\)/);
});

const src = data.slice(data.indexOf("export async function createExpenseCashOut("),
  data.indexOf("export async function settleExpenseAccount(")).replace("export async function", "async function");
function harness() {
  const rows = [], destinationOptions = [{ id: "member-1", name: "ACIC" }];
  const txt = value => String(value ?? "").trim();
  const ctx = {
    text: txt,
    expenseError: (message, status) => Object.assign(new Error(message), { status }),
    resolveExpenseMember: async () => ({ id: "owner", name: "Current User" }),
    expenseFundsTypeKey: value => txt(value).toLowerCase().replace(/[^a-z0-9]/g, ""),
    expenseDestinationOptions: async () => destinationOptions,
    ownCarCostForKilometers: () => 0,
    ownCarRatePerKm: () => 5.17,
    assertExpenseOrderReferences: async () => null,
    buildExpenseScreenshotText: async () => "",
    expenseBaseRowForMember: (_member, extra) => extra,
    expensesTable: () => "expenses",
    insert: async (_table, row) => { rows.push(row); return row; },
    invalidateExpenseDataCaches: () => {},
    serializeExpense: value => value,
  };
  const create = vm.runInNewContext(src + "\ncreateExpenseCashOut", ctx);
  const base = { date: "2026-11-25", fundsType: "Taxi", amount: 100, reason: "Field visit", destinationUserId: SENTINEL };
  return { create, rows, base };
}

test("manual Cash Out stores destination name in existing field and no fake team-member ID", async () => {
  const { create, rows, base } = harness();
  const result = await create({}, { ...base, destinationManualName: "  مدرسة النور  " });
  assert.equal(result.success, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].destination_user_id, null);
  assert.equal(rows[0].destination_user_name, "مدرسة النور");
  assert.equal(rows[0].cash_out, 100);
  assert.equal(rows[0].reason, "Field visit");
});

test("manual entry rejects empty or oversized names; normal selections still require real member", async () => {
  const { create, rows, base } = harness();
  await assert.rejects(() => create({}, base), { status: 400 });
  await assert.rejects(() => create({}, { ...base, destinationManualName: "x".repeat(161) }), { status: 400 });
  await assert.rejects(() => create({}, { ...base, destinationUserId: "unknown", destinationManualName: "Fake" }), { status: 400 });
  await assert.rejects(() => create({}, { ...base, destinationUserId: "" }), { status: 400 });
  assert.equal(rows.length, 0);
  await create({}, { ...base, destinationUserId: "member-1" });
  assert.equal(rows[0].destination_user_id, "member-1");
  assert.equal(rows[0].destination_user_name, "ACIC");
});

test("Admin Edit validates manual name, clears ID and restores a real user later", () => {
  assert.match(data, /nextId === "__expense_other_destination__"/);
  assert.match(data, /metadata\.destination_user_id = null/);
  assert.match(data, /metadata\.destination_user_name = name/);
  assert.match(data, /old\.cashIn > 0 \|\| settlement/);
});

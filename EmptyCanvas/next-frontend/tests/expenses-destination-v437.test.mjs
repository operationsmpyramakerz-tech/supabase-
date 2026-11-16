import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const dialogs = src("../components/expenses/ExpensesDialogs.jsx");
const client = src("../components/expenses/ExpensesClient.jsx");
const backend = src("../lib/expenses-data.js");
const route = src("../app/api/expenses/destinations/options/route.js");
const migration = src("../2026-11-16-expenses-destination-v437.sql");

// The new required field belongs in the first wizard step, immediately after Date.
test("Choose Order shows required Destination after Date with a single-select team-member dropdown", () => {
  const dateLabel = dialogs.indexOf('<ClassicFieldLabel icon="calendar">Date <span className="req-star">*</span></ClassicFieldLabel>', dialogs.indexOf('<ClassicModal title="Choose Order"'));
  const destinationLabel = dialogs.indexOf('<ClassicFieldLabel icon="user">Destination <span className="req-star">*</span></ClassicFieldLabel>', dateLabel);
  const nextButton = dialogs.indexOf('className="ex-btn ex-dark ex-btn--block ex-add-money"', dateLabel);
  assert.ok(dateLabel > 0 && destinationLabel > dateLabel && nextButton > destinationLabel);
  assert.match(dialogs, /value=\{destinationUserId\}[\s\S]*?onChange=\{setDestinationUserId\}[\s\S]*?options=\{destinationOptions\}/);
  assert.match(dialogs, /if \(!destinationUserId \|\| !destinationOptions\.some/);
});

test("destination options lazy-load from the authenticated API when cash-out opens", () => {
  assert.match(client, /ensureSupportOptions\("destinations"\)/);
  assert.match(client, /requestJson\("\/next\/api\/expenses\/destinations\/options"\)/);
  assert.match(client, /destinationPeople=\{destinationPeople\}/);
  assert.match(route, /getDirectAccountGate\(\["Expenses"\]\)/);
  assert.match(route, /"expenses\.cash_out"/);
  assert.match(backend, /export async function expenseDestinationOptions/);
  assert.match(backend, /await listTeamMembersLite\(\{ fresh \}\)/);
});

test("each drafted cash-out sends the chosen destination user id in the final mutation", () => {
  assert.match(dialogs, /expenseDate: date,\s*destinationUserId,/);
  assert.match(dialogs, /date: draft\.expenseDate,\s*destinationUserId: draft\.destinationUserId,/);
  assert.match(dialogs, /if \(!destinationOptions\.some\(\(option\) => option\.value === destinationUserId\)\)/);
});

test("backend rejects missing or forged destinations and stores trusted id + name", () => {
  const cashout = backend.split("export async function createExpenseCashOut")[1].split("export async function settleExpenseAccount")[0];
  assert.match(cashout, /if \(!destinationUserId\) throw expenseError\("Destination is required\."/);
  assert.match(cashout, /const destination = \(await expenseDestinationOptions\(\)\)\.find\(\(member\) => member\.id === destinationUserId\);/);
  assert.match(cashout, /if \(!destination\) throw expenseError\("Select a valid destination user\."/);
  assert.match(cashout, /destination_user_id: destination\.id,/);
  assert.match(cashout, /destination_user_name: destination\.name,/);
  assert.match(backend, /destinationUserId: text\(valueFor\(row, \["destination_user_id"\]\)\)/);
  assert.match(backend, /destinationUserName: text\(valueFor\(row, \["destination_user_name"\]\)\)/);
});

test("migration is additive so historical expense rows remain valid", () => {
  assert.match(migration, /ALTER TABLE public\.expenses/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS destination_user_id text/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS destination_user_name text/);
  assert.doesNotMatch(migration, /ADD COLUMN[^;]*\bNOT NULL\b|DROP TABLE|DELETE FROM|TRUNCATE/i);
});

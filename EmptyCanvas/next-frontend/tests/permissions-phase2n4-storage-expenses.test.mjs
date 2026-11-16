import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expenseOrderReferenceIds, verifiedExpenseOrderLabel } from "../lib/expense-order-access.mjs";
import { storageFeatureAllowed } from "../lib/storage-feature-policy.mjs";
import { featureAllowed } from "../lib/feature-permissions-registry.js";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("Phase 2N4: expense order references reject invalid or oversized client inputs", () => {
  assert.deepEqual(expenseOrderReferenceIds({ orderIds: ["abc", "abc", "def"] }), ["abc", "def"]);
  assert.throws(() => expenseOrderReferenceIds({ orderIds: "abc" }), error => error.status === 400);
  assert.throws(() => expenseOrderReferenceIds({ orderIds: ["x,other"] }), error => error.status === 400);
  assert.throws(() => expenseOrderReferenceIds({ orderIds: Array(201).fill("abc") }), error => error.status === 400);
});

test("Phase 2N4: order label is derived from the verified records, not from the browser", () => {
  assert.equal(verifiedExpenseOrderLabel([{ order_number: 21 }, { order_number: 21 }], "ord:21"), "ORD-21");
  assert.throws(() => verifiedExpenseOrderLabel([{ order_number: 21 }, { order_number: 22 }], "ord:21"), error => error.status === 400);
  assert.throws(() => verifiedExpenseOrderLabel([{ order_number: 21 }], "ord:22"), error => error.status === 400);
  assert.throws(() => verifiedExpenseOrderLabel([{ order_number: null }], "ord:21"), error => error.status === 400);
});

test("Phase 2N4: create Cash Out validates order relations before uploading any receipt", () => {
  const source = read("../lib/expenses-data.js");
  const cashOut = source.split("export async function createExpenseCashOut")[1].split("export async function settleExpenseAccount")[0];
  assert.ok(cashOut.indexOf("await assertExpenseOrderReferences(account, payload)") < cashOut.indexOf("await buildExpenseScreenshotText"));
  assert.match(cashOut, /orders_names: verifiedOrder \? verifiedOrder\.orderLabel/);
  const options = read("../app/api/expenses/orders/options/route.js");
  assert.match(options, /scopeExpenseOrderOptions\(gate\.account, await expenseOrderOptions\(\)\)/);
  assert.match(options, /private, no-store/);
});

test("Phase 2N4: scoped Expenses verify every order row using Member ID and never trust display names", () => {
  const source = read("../lib/expense-order-access.js");
  assert.match(source, /orderScopeFor\(account, key\)/);
  assert.match(source, /visibleOrderRow\(row, scope\)/);
  assert.match(source, /ids\.some\(id => !indexed\.has\(id\)\)/);
  assert.match(source, /if \(scopes === null\) return await enrichOrderNames\(options\)/);
  assert.match(source, /scopeExpenseOrderOptions/);
  assert.match(source, /candidateOptions\.filter/);
  assert.match(source, /Select all verified components of the order/);
  assert.match(source, /expenses\.verify-linked-order-group/);
});

test("Phase 2N4: storage direct upload, completion, and download all require feature grants", () => {
  const source = read("../lib/storage-direct.js");
  const storageGate = source.split("export function canUseStorage")[1].split("export function safeFileName")[0];
  assert.match(storageGate, /!hasStorageFeature\(account, policy, write\)/);
  assert.match(source, /storageFeatureAllowed\(policy\?\.prefix, write/);
  for (const route of ["file-direct", "upload-ticket", "upload-complete"]) {
    const code = read(`../app/api/storage/${route}/route.js`);
    assert.match(code, /canUseStorage\(|prepareUploadTicket\(|completeUpload\(/);
  }
});


test("Phase 2N4: storage feature checks honor independent upload/read grants", () => {
  const account = grants => ({ featureAccess: { mode: "enforced", grants } });
  const grant = allowed => ({ allowed, scope: "all" });
  const can = (scope, write, grants) => storageFeatureAllowed(scope, write,
    key => featureAllowed(account(grants), key));
  assert.equal(can("task-management/attachments", false, { "tasks.view": grant(false) }), false);
  assert.equal(can("task-management/attachments", true, {
    "tasks.view": grant(true), "tasks.attachment_upload": grant(false),
  }), false);
  assert.equal(can("task-management/attachments", true, {
    "tasks.view": grant(true), "tasks.attachment_upload": grant(true),
  }), true);
  assert.equal(can("b2c/customer-files", true, {
    "b2c.forms.view": grant(true), "b2c.forms.submit": grant(true),
  }), true);
  assert.equal(can("b2c/customer-files", true, {
    "b2c.forms.view": grant(true), "b2c.forms.submit": grant(false),
    "b2c.database.view": grant(false), "b2c.database.record_edit": grant(false),
  }), false);
  assert.equal(can("kpi-evidence", true, {
    "kpis.view": grant(true), "kpis.evidence_upload": grant(true), "kpis.scores_edit": grant(false),
  }), false);
  assert.equal(can("kpi-evidence", true, {
    "kpis.view": grant(true), "kpis.evidence_upload": grant(true), "kpis.scores_edit": grant(true),
  }), true);
  assert.equal(can("unrecognized-scope", false, {}), false);
});

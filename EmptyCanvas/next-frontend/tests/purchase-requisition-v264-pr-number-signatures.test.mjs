import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prInitialForm, prClearLegacyAutofilledNumber, normalizePrForm } from "../lib/purchase-requisition-data.mjs";

const source = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("new requisition number starts blank while the Operations Order reference remains", () => {
  const form = prInitialForm([{ orderIdNumber: 125, productName: "Book", quantityRequested: 52 }]);
  assert.equal(form.prNumber, "");
  assert.equal(form.workOrder, "ORD-125");
  assert.equal(form.items[0].quantity, "52");
});

test("legacy automatically populated PR-ORD numbers are cleared on reopen", () => {
  const saved = normalizePrForm({ prNumber: "PR-ORD-125", workOrder: "ORD-125", department: "Operations", notes: "Existing data", items: [{ description: "Book", quantity: 52 }] });
  const cleaned = prClearLegacyAutofilledNumber(saved, "ORD-125");
  assert.equal(cleaned.prNumber, "");
  assert.equal(cleaned.workOrder, "ORD-125");
  assert.equal(cleaned.department, "Operations");
  assert.equal(cleaned.notes, "Existing data");
  assert.equal(cleaned.items.length, 1);
});

test("custom/manual PR numbers survive reopening and normalized save", () => {
  for (const value of ["PR-2026-001", "PR-ORD-999"]) {
    const cleaned = prClearLegacyAutofilledNumber(normalizePrForm({ prNumber: value }), "ORD-125");
    assert.equal(cleaned.prNumber, value);
  }
  assert.equal(prClearLegacyAutofilledNumber({ prNumber: "PR-ORD-125" }, "ORD-126").prNumber, "PR-ORD-125");
});

test("PDF leaves blank number cell truly blank and labels both scripts near a hyphen", () => {
  const render = source("../lib/purchase-requisition-render.js");
  assert.match(render, /prNumberLabel\(xx,y,width,h\)/);
  assert.match(render, /const groupLeft=x\+\(w-groupWidth\)\/2/);
  assert.match(render, /write\("-",groupLeft\+englishWidth\+gap/);
  assert.match(render, /j===1 && labelRight==="رقم طلب الشراء - PR No\." \? String\(values\[j\]\?\?""\) : safeCellText/);
});

test("signature field labels and value baselines move right within their own cells", () => {
  const render = source("../lib/purchase-requisition-render.js");
  assert.match(render, /const labelWidth=39,valueLeft=xx\+13,valueWidth=width-labelWidth-18/);
  assert.match(render, /write\(label\+":",xx\+width-labelWidth-2/);
  assert.match(render, /rect\(valueLeft,rowY\+1,valueWidth,28\)\.clip/);
});

test("download names use the order reference if a PR number has not been assigned", () => {
  const render = source("../lib/purchase-requisition-render.js");
  const client = source("../components/orders/PurchaseRequisitionClient.jsx");
  assert.match(render, /form\.prNumber\|\|form\.workOrder\|\|"draft"/);
  assert.match(client, /form\.prNumber\|\|form\.workOrder\|\|"draft"/);
});

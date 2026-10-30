import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prOrderIdentity } from "../lib/purchase-requisition-storage-data.mjs";
const source = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");

test("PR document identity is based on order numbers rather than row selection", () => {
  assert.deepEqual(prOrderIdentity([{order_number:123,id:5},{order_number:123,id:8}]), {orderKey:"ORD-123",orderNumbers:[123]});
  assert.equal(prOrderIdentity([{order_number:123,id:8}]).orderKey,"ORD-123");
  assert.equal(prOrderIdentity([{orderIdNumber:123,id:5}]).orderKey,"ORD-123");
});
test("combined order identity is sorted, stable and de-duplicated", () => {
  assert.deepEqual(prOrderIdentity([{order_number:125},{order_number:123},{order_number:125}]), {orderKey:"ORD-123+ORD-125",orderNumbers:[123,125]});
});
test("missing or malformed order numbers fail closed", () => {
  for(const rows of [[],[{}],[{order_number:"ORD-123"}],[{order_number:-1}],[{order_number:2.5}]]) {
    assert.throws(()=>prOrderIdentity(rows));
  }
});
test("save route validates authorization and verifies all order row IDs before the write", () => {
  const code=source("../app/api/orders/purchase-requisition/save/route.js");
  assert.match(code,/orders\.operations\.export/);
  assert.ok(code.indexOf("assertOrderIdsInScope")<code.indexOf("savePurchaseRequisition(identity"));
  assert.match(code,/prStorageIdentityFromIds/);
});
test("save uses a single atomic upsert per order key with schema-level RLS", () => {
  const code=source("../lib/purchase-requisition-storage.js");
  const sql=source("../PURCHASE_REQUISITION_SAVE_v255.sql");
  assert.match(code,/on_conflict=order_key/);
  assert.match(code,/resolution=merge-duplicates/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL .*anon, authenticated/);
  assert.match(sql,/UNIQUE/);
});
test("existing saved form restores on page open, including unsaved changes indicator", () => {
  const page=source("../app/operations-orders/purchase-requisition/page.jsx");
  const ui=source("../components/orders/PurchaseRequisitionClient.jsx");
  assert.match(page,/readSavedPurchaseRequisition/);
  assert.match(page,/initialSavedAt=\{savedAt\}/);
  assert.match(ui,/Unsaved changes/);
  assert.match(ui,/saveForm/);
});
test("native Arabic PDFKit shaping is used, no manual character reversal", () => {
  const code=source("../lib/purchase-requisition-render.js");
  assert.match(code,/withNativeArabicPdfText\(doc, \(\) => doc\.text\(nativePrPdfRtlWordOrder\(normalizeArabicLabels\(str\)\)/);
  assert.match(code,/withNativeArabicPdfText\(doc, \(\) => doc\.text\(nativePrPdfRtlWordOrder\(normalizeArabicLabels\(value\)\)/);
  assert.match(code,/Purchase Requisition \(PR\)/);
});

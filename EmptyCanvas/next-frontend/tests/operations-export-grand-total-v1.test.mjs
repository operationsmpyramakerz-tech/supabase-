import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { grandTotalFromExportRows } = require("../lib/order-export-grand-total.cjs");
const file = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Grand Total sums exact exported line totals; handles empty/invalid rows", () => {
  assert.equal(grandTotalFromExportRows([]), 0);
  assert.equal(grandTotalFromExportRows(null), 0);
  assert.equal(grandTotalFromExportRows([{ total: 1400 }, { total: "17.35" }, { total: 3.2 }]), 1420.55);
  assert.equal(grandTotalFromExportRows([{ total: "n/a" }, { total: Infinity }, { total: 12.35 }]), 12.35);
  assert.equal(grandTotalFromExportRows([{ total: 0.1 }, { total: 0.2 }]), 0.3);
});

test("Grand Total follows selected rows, not unfiltered order grandTotal", () => {
  const full = [{ total: 900 }, { total: 120 }, { total: 80 }];
  const filtered = full.filter((row) => row.total < 900);
  assert.equal(grandTotalFromExportRows(filtered), 200);
});

test("Operations-only checkbox flows through client to PDF and Excel without changing other scopes", () => {
  const modal = file("../components/orders/OrderDownloadModal.jsx");
  const operations = file("../components/orders/OperationsOrdersHeavyModals.jsx");
  const client = file("../components/orders/OperationsOrdersClient.jsx");
  const api = file("../app/api/orders/export-direct/route.js");
  const service = file("../lib/order-export-service.js");
  const pdf = file("../lib/deliveryReceiptPdf.js");
  assert.match(modal, /checked=\{showGrandTotal\}/);
  assert.match(modal, /showGrandTotal: showGrandTotalOption && showGrandTotal/);
  assert.match(operations, /showGrandTotalOption=\{!maintenance\}/);
  assert.match(client, /showGrandTotal: options\?\.showGrandTotal === true/);
  assert.match(api, /showGrandTotal: body\?\.showGrandTotal === true && scope === "operations"/);
  assert.match(service, /showGrandTotal: showGrandTotal === true/);
  assert.match(service, /grandTotalFromExportRows\(payload\.rows\)/);
  assert.match(pdf, /grandTotalFromExportRows\(safeRows\)/);
  assert.match(pdf, /roundedRect\(tableX, barY, tableW, barHeight, 8\)/);
});

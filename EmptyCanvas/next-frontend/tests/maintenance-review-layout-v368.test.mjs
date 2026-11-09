import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => readFileSync(path.join(root, file), "utf8");

test("maintenance reason strip is suppressed in all three general orders detail dialogs", () => {
  for (const file of ["CurrentOrdersHeavyModals", "OperationsOrdersHeavyModals", "OrdersReviewHeavyModals"]) {
    const source = src(`components/orders/${file}.jsx`);
    assert.match(source, /\{!maintenance \? <div className="co-modal-meta co-modal-meta--after-actions">/);
    assert.match(source, /<div className="co-meta-row co-meta-row--reason"><span>Reason<\/span><strong>\{group\.reason\}<\/strong><\/div>/);
  }
});

test("Orders Review uses exactly the shared maintenance detail component, not the standard list", () => {
  const source = src("components/orders/OrdersReviewHeavyModals.jsx");
  assert.match(source, /import \{ MaintenanceComponentCards \} from "\.\/MaintenanceComponentCards"/);
  assert.match(source, /\{maintenance \? <div className="next-maintenance-parity next-maintenance-details-embed">/);
  assert.match(source, /<MaintenanceComponentCards items=\{group\.items\} query=\{componentSearch\}/);
  assert.match(source, /: <ProgressiveOrderGroups/);
  assert.match(source, /\{!maintenance \? <OrderSortButton/);
  assert.match(source, /\{canAct && !maintenance && permissions\.bulk_approve/);
  assert.match(source, /next-maintenance-review-modal/);
});

test("review-detail serializer maintains approval data and retains the same maintenance logs as Operations", () => {
  const data = src("lib/order-details-data.js");
  const start = data.indexOf("export function serializeReviewOrderDetail");
  const end = data.indexOf("function needsProposalSourceLookup", start);
  const review = data.slice(start, end);
  assert.match(review, /serializeOperationsOrderDetail\(row\)/);
  assert.match(review, /\.\.\.\(maintenance \? \{/);
  for (const field of ["issueDescription", "serialNumber", "maintenanceLogs", "maintenanceChecklist", "sparePartsNeededEntries", "sparePartsReplacedEntries"]) {
    assert.ok(review.includes(`${field}: maintenance.${field}`), `Retain ${field}`);
  }
  assert.match(review, /approval,/);
});

test("review endpoint enriches only maintenance rows, after reviewer visibility scope", () => {
  const data = src("lib/orders-review-data.js");
  const start = data.indexOf("export async function loadOrdersReviewDetails");
  const review = data.slice(start);
  assert.match(review, /visibleToReviewer\(row, visible\)/);
  assert.match(review, /const serialized = allowed\.map\(serializeReviewOrderDetail\)/);
  assert.match(review, /enrichMaintenanceDetailProducts\(maintenanceItems/);
  assert.match(review, /byId\.get\(text\(item\?\.id\)\) \|\| item/);
});

test("shared maintenance CSS is loaded with new cache version and review page styles", () => {
  const css = src("public/css/maintenance-orders.css");
  const shell = src("components/PersistentAppShell.jsx");
  assert.match(css, /body\.orders-review-page \.next-maintenance-parity/);
  assert.match(css, /next-review-order-modal\.next-maintenance-review-modal/);
  assert.match(shell, /maintenance-orders\.css\?v=maintenance-review-parity-v368/);
});

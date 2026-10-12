import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeCombinedOrderRows } from "../lib/combined-order-rows.mjs";
import { mapSelectedCombinedOrderItems } from "../lib/combined-order-groups.mjs";
import { loadVerifiedOrderBatches } from "../lib/verified-order-batches.mjs";

const motor = "DC Motor - Geared Dual Axis 3:12VDC 600 RPM (Yellow)";
const orderMeta = [{ label: "ORD-58" }, { label: "ORD-57" }];
function component(overrides = {}) {
  return {
    component: motor, idCode: "A100001", _productId: "product-58", _componentKey: "product:product-58",
    qty: 4, receivedQty: 0, remainingQty: 4, deliveredQty: 0, total: 160,
    unit: 40, kitTag: "Generic Arduino", kitFolderName: "Generic Kits",
    ...overrides,
  };
}
function combined(groups, meta = orderMeta) {
  return mergeCombinedOrderRows(groups.map((rows) => ({ rows })), meta);
}

test("ORD-58 and ORD-57 each retain four remaining DC motors despite different product IDs", () => {
  const rows = combined([
    [component()],
    [component({ _productId: "legacy-product-57", _componentKey: "product:legacy-product-57" })],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].combined__remainingQty__0, 4);
  assert.equal(rows[0].combined__remainingQty__1, 4);
  assert.equal(rows[0].combined__qty__0 + rows[0].combined__qty__1, 8);
});

test("matches a missing legacy product ID by exact component name", () => {
  const rows = combined([[component()], [component({ _productId: null, _componentKey: "name:old", idCode: "" })]]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].combined__remainingQty__1, 4);
});

test("repeats inside one order sum without leaking into another order", () => {
  const rows = combined([
    [component({ remainingQty: 2 }), component({ remainingQty: 3 })],
    [component({ _productId: "changed-id", remainingQty: 7 })],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].combined__remainingQty__0, 5);
  assert.equal(rows[0].combined__remainingQty__1, 7);
});

test("all five metrics are kept independently for every order", () => {
  const rows = combined([
    [component({ qty: 8, receivedQty: 4, remainingQty: 4, deliveredQty: 0, total: 320 })],
    [component({ qty: 9, receivedQty: 5, remainingQty: 4, deliveredQty: 5, total: 360 })],
  ]);
  assert.deepEqual(
    [rows[0].combined__qty__0, rows[0].combined__receivedQty__0, rows[0].combined__remainingQty__0, rows[0].combined__deliveredQty__0, rows[0].combined__total__0],
    [8, 4, 4, 0, 320],
  );
  assert.deepEqual(
    [rows[0].combined__qty__1, rows[0].combined__receivedQty__1, rows[0].combined__remainingQty__1, rows[0].combined__deliveredQty__1, rows[0].combined__total__1],
    [9, 5, 4, 5, 360],
  );
});

test("same code matches small name/format differences", () => {
  const rows = combined([
    [component()],
    [component({ component: "DC Motor – Geared Dual Axis 3:12VDC 600 RPM (Yellow)", _productId: "different" })],
  ]);
  assert.equal(rows.length, 1);
});

test("different product specs are NOT merged by aggressive punctuation stripping", () => {
  const rows = combined([
    [component({ component: "DC Motor 1.2V", idCode: "A11" })],
    [component({ component: "DC Motor 12V", idCode: "A12", _productId: "different" })],
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].combined__remainingQty__1 + rows[1].combined__remainingQty__1, 4);
});

test("same visible name but conflicting ID Codes fails safely", () => {
  assert.throws(() => combined([
    [component({ idCode: "A100001" })],
    [component({ idCode: "A100099", _productId: "different" })],
  ]), /different ID Codes/);
});

test("nonnumeric metrics fail rather than silently disappearing", () => {
  assert.throws(() => combined([[component()], [component({ remainingQty: "invalid", _productId: "different" })]]), /Invalid remainingQty/);
});

test("placeholder product labels with different identities stay separate", () => {
  const rows = combined([
    [component({ component: "Unknown Product", idCode: "", _productId: "unknown1" })],
    [component({ component: "Unknown Product", idCode: "", _productId: "unknown2" })],
  ]);
  assert.equal(rows.length, 2);
});

test("small decimal quantities are preserved for every order", () => {
  const rows = combined([
    [component({ remainingQty: 0.125 })],
    [component({ remainingQty: 0.375, _productId: "different" })],
  ]);
  assert.equal(rows[0].combined__remainingQty__0, 0.125);
  assert.equal(rows[0].combined__remainingQty__1, 0.375);
});

test("rejects a mismatch between selected orders and their payloads", () => {
  assert.throws(() => mergeCombinedOrderRows([{ rows: [component()] }], orderMeta), /do not match/);
});


test("unit prices belong to their own order, not the first selected order", () => {
  const rows = combined([
    [component({ unit: 40 })],
    [component({ unit: 45, _productId: "different" })],
  ]);
  assert.equal(rows[0].combined__unit__0, 40);
  assert.equal(rows[0].combined__unit__1, 45);
});

test("conflicting prices for a repeated component WITHIN the same order fail safely", () => {
  assert.throws(() => combined([
    [component({ unit: 40 }), component({ unit: 45 })],
    [component({ _productId: "different" })],
  ]), /conflicting unit costs/);
});


test("21-order export groups retrieve every selected component exactly once", () => {
  const groups = Array.from({ length: 21 }, (_, index) => ({
    orderIds: Array.from({ length: 35 }, (_, part) => String(index * 35 + part + 1)),
  }));
  const allItems = groups.flatMap((group) => group.orderIds.map((id) => ({ id, productName: "Motor", quantityRemaining: 4 })));
  const slices = mapSelectedCombinedOrderItems(groups, allItems);
  assert.equal(slices.length, 21);
  assert.equal(slices.flat().length, 735);
  const rows = mergeCombinedOrderRows(slices.map((items) => ({ rows: [component({ remainingQty: items.length * 4 })] })), groups.map((_, index) => ({ label: `ORD-${index + 1}` })));
  assert.equal(rows.length, 1);
  for (let index = 0; index < 21; index++) assert.equal(rows[0][`combined__remainingQty__${index}`], 140);
});

test("combined export refuses a missing source component", () => {
  assert.throws(() => mapSelectedCombinedOrderItems([{ orderIds: ["1", "2"] }], [{ id: "1" }]), /missing or duplicated/);
});

test("combined export refuses duplicated component records", () => {
  assert.throws(() => mapSelectedCombinedOrderItems([{ orderIds: ["1"] }], [{ id: "1" }, { id: "1" }]), /Duplicate or unidentified/);
});


test("735 Supabase detail records are fetched with bounded concurrency and no truncation", async () => {
  const ids = Array.from({ length: 735 }, (_, i) => String(i + 1));
  let active = 0, peak = 0, calls = 0;
  const rows = await loadVerifiedOrderBatches(ids, async (batch) => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return batch.map((id) => ({ id, quantity_remaining: 4 }));
  });
  assert.equal(rows.length, 735);
  assert.equal(new Set(rows.map((row) => row.id)).size, 735);
  assert.equal(calls, 10);
  assert.ok(peak <= 3 && peak >= 2);
});

test("missing, extra and duplicate Supabase records fail closed", async () => {
  await assert.rejects(() => loadVerifiedOrderBatches(["1", "2"], async () => [{ id: "1" }]), /fully retrieved/);
  await assert.rejects(() => loadVerifiedOrderBatches(["1", "2"], async () => [{ id: "1" }, { id: "1" }]), /changed during loading/);
  await assert.rejects(() => loadVerifiedOrderBatches(["1", "2"], async () => [{ id: "1" }, { id: "3" }]), /changed during loading/);
});

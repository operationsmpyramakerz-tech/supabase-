// Dashboard-only read model. School delivery/closing has its own nine-stage tracker.
// Project Components is the Master BOM and is NOT a preparation stage.
// Completion is the arithmetic mean of five physical preparation stages.
// Box Distribution tracks packed units, while Project Kit Cartons tracks sealed (ready) units.
const rows = value => Array.isArray(value) ? value : [];
const amount = value => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
};
const percentage = (value, denominator) => denominator > 0
  ? Math.min(100, Math.max(0, Math.round(amount(value) / denominator * 100))) : 0;

export function calculateProjectPreparationProgress({ testing, warehouse, production }) {
  const tested = rows(testing?.items);
  const productionItems = rows(production?.items);
  const required = tested.reduce((sum, row) => sum + amount(row.required), 0);
  const passed = tested.reduce((sum, row) => sum + amount(row.passed), 0);
  const received = rows(warehouse?.receiptLines).reduce((sum, row) => sum + (Number(row.accepted_delta) || 0), 0);
  const handedOff = productionItems.reduce((sum, row) => sum + amount(row.productionReceived), 0);
  const packed = productionItems.reduce((sum, row) => sum + amount(row.packedQty), 0);
  const readyCartonIds = new Set(rows(production?.cartons)
    .filter(carton => carton?.status === "ready").map(carton => String(carton.id)));
  const sealed = rows(production?.cartonLines).reduce((sum, line) =>
    sum + (readyCartonIds.has(String(line.carton_id)) ? amount(line.packed_qty) : 0), 0);
  const stages = [
    percentage(passed, required),
    percentage(received, required),
    percentage(handedOff, required),
    percentage(packed, required),
    percentage(sealed, required),
  ];
  return { stages, overall: Math.round(stages.reduce((sum, step) => sum + step, 0) / stages.length),
    completed: stages.filter(step => step === 100).length, required };
}

// Dashboard-only read model. School delivery/closing has its own nine-stage tracker.
// Project Components is the Master BOM and is NOT a preparation stage.
// Completion is the arithmetic mean of six preparation stages; formal sign-off overrides quantity progress.
// Box Distribution tracks physical packed units; Project Kit Cartons tracks Kits actually placed into school cartons (plus sealed legacy cartons).
const rows = value => Array.isArray(value) ? value : [];
const amount = value => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
};
const percentage = (value, denominator) => denominator > 0
  ? Math.min(100, Math.max(0, Math.round(amount(value) / denominator * 100))) : 0;

export function calculateProjectPreparationProgress({ testing, warehouse, production, closures = {} }) {
  const tested = rows(testing?.items);
  const productionItems = rows(production?.items);
  const required = tested.reduce((sum, row) => sum + amount(row.required), 0);
  const testedTotal = tested.reduce((sum, row) => sum + amount(row.tested), 0);
  const received = rows(warehouse?.receiptLines).reduce((sum, row) => sum + (Number(row.accepted_delta) || 0), 0);
  const handedOff = productionItems.reduce((sum, row) => sum + amount(row.productionReceived), 0);
  const packed = productionItems.reduce((sum, row) => sum + amount(row.packedQty), 0);
  // v397: a completed school Kit is NOT yet a carton. Count only Kit IDs
  // already assigned to immutable outer school cartons. Legacy project cartons
  // remain counted separately; missing v397 data falls back for old snapshots.
  const hasSchoolCartonLinks = Array.isArray(production?.schoolCartonKits);
  const assignedKitIds = new Set(rows(production?.schoolCartonKits).map(link => String(link.kit_box_id)));
  const readyCartonIds = new Set(rows(production?.cartons)
    .filter(carton => carton?.status === "ready" && (!hasSchoolCartonLinks ||
      !carton.generated_kit_label || assignedKitIds.has(String(carton.id))))
    .map(carton => String(carton.id)));
  const sealed = rows(production?.cartonLines).reduce((sum, line) =>
    sum + (readyCartonIds.has(String(line.carton_id)) ? amount(line.packed_qty) : 0), 0);
  const stageKeys = ["intake", "testing", "warehouse", "production", "boxes", "cartons"];
  const stages = [
    percentage(tested.reduce((sum,row)=>sum+amount(row.productionIntakeReceived),0), required),
    percentage(testedTotal, required),
    percentage(received, required),
    percentage(handedOff, required),
    percentage(packed, required),
    percentage(sealed, required),
  ].map((percent, index) => closures[stageKeys[index]] === true ? 100 : percent);
  return { stages, overall: Math.round(stages.reduce((sum, step) => sum + step, 0) / stages.length),
    completed: stages.filter(step => step === 100).length, required };
}

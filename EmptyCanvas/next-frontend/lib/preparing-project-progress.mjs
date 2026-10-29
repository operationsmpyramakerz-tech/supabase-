// Dashboard-only read model. School delivery/closing has its own nine-stage tracker.
// Project completion is the arithmetic mean of these five physical preparation stages.
const rows = value => Array.isArray(value) ? value : [];
const amount = value => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
};
const percentage = (value, denominator) => denominator > 0
  ? Math.min(100, Math.max(0, Math.round(amount(value) / denominator * 100))) : 0;

export function calculateProjectPreparationProgress({ sourceProposalId, testing, warehouse, production }) {
  const tested = rows(testing?.items);
  const bom = rows(warehouse?.items);
  const productionItems = rows(production?.items);
  const required = tested.reduce((sum, row) => sum + amount(row.required), 0);
  const passed = tested.reduce((sum, row) => sum + amount(row.passed), 0);
  const received = rows(warehouse?.receiptLines).reduce((sum, row) => sum + (Number(row.accepted_delta) || 0), 0);
  const handedOff = productionItems.reduce((sum, row) => sum + amount(row.productionReceived), 0);
  const packed = productionItems.reduce((sum, row) => sum + amount(row.packedQty), 0);
  const stages = [
    sourceProposalId && bom.length ? Math.round(100 * bom.filter(row => amount(row.required_qty) > 0).length / bom.length) : 0,
    percentage(passed, required),
    percentage(received, required),
    percentage(handedOff, required),
    percentage(packed, required),
  ];
  return { stages, overall: Math.round(stages.reduce((sum, step) => sum + step, 0) / 5),
    completed: stages.filter(step => step === 100).length, required };
}

// Shared pure workflow definition. No React/server imports so it can be tested directly.
export const PREPARING_STAGES = Object.freeze([
  { key: "receiving", title: "Warehouse Receiving", subtitle: "Receive components from the warehouse", team: "operations" },
  { key: "quality", title: "Inventory & QC", subtitle: "Count, inspect and record discrepancies", team: "operations" },
  { key: "preparing", title: "Sorting & Preparing", subtitle: "Sort per school and approved proposal", team: "operations" },
  { key: "packing", title: "Packing & Dispatch", subtitle: "Packing list, labels and shipment readiness", team: "operations" },
  { key: "delivery", title: "School Delivery", subtitle: "Transport and physical delivery", team: "operations" },
  { key: "delivery_closing", title: "Delivery Handover", subtitle: "Signed receipt and quantity reconciliation", team: "operations" },
  { key: "installation", title: "Installation Follow-up", subtitle: "Follow the technical installation team", team: "followup" },
  { key: "testing", title: "Testing & Commissioning", subtitle: "Follow operation and outstanding issues", team: "followup" },
  { key: "final_closing", title: "Final School Closing", subtitle: "Confirm technical sign-off and close school", team: "followup" },
]);
export const PREPARING_STATES = Object.freeze(["not_started", "in_progress", "blocked", "completed"]);
export function validStage(key) { return PREPARING_STAGES.some(stage => stage.key === key); }
export function schoolProgress(records = []) {
  const complete = new Set(records.filter(row => row.status === "completed").map(row => row.stage_key));
  return { completed: PREPARING_STAGES.filter(stage => complete.has(stage.key)).length, total: PREPARING_STAGES.length,
    delivered: complete.has("delivery_closing"), closed: complete.has("final_closing") };
}
export function canCompleteStage(stageKey, records = []) {
  const index = PREPARING_STAGES.findIndex(stage => stage.key === stageKey);
  if (index < 0) return false;
  const done = new Set(records.filter(row => row.status === "completed").map(row => row.stage_key));
  return PREPARING_STAGES.slice(0, index).every(stage => done.has(stage.key));
}

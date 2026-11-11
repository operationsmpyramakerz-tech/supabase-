import { testingReadyToTest } from "./preparing-project-testing-math.mjs";
// Shared, fixed registry for opt-in per-filter Edit grants in Projects Preparing.
// Tabs are filters of the same ledger, so the API validates the current record
// state instead of trusting the tab named by a client.
export const PREPARING_EDIT_TAB_LABELS = Object.freeze({
  intake: Object.freeze({'all': 'All Components', 'pending': 'Remaining to Receive', 'received': 'Received'}),
  testing: Object.freeze({'all': 'All Components', 'pending': 'Remaining to Test', 'done': 'Fully Tested'}),
  warehouse: Object.freeze({'all': 'Tested Components', 'available': 'Ready to Return', 'received': 'Returned'}),
  production: Object.freeze({'all': 'All Components', 'available': 'Available to Receive', 'not-received': 'Not Received', 'received': 'Received'}),
  boxes: Object.freeze({'all': 'All Components', 'available': 'Available to Pack', 'packed': 'Packed'}),
  cartons: Object.freeze({'all': 'All Cartons', 'draft': 'Draft', 'ready': 'Ready'}),
});
export const PREPARING_EDIT_TAB_MARKER = 'preparing.tabs.__granular';
export const preparingTabKey = (stage, tab) => `preparing.tab.${stage}.${tab.replaceAll("-", "_")}`;
export function preparingTabKnown(stage, tab) {
  return Object.hasOwn(PREPARING_EDIT_TAB_LABELS[stage] || {}, tab);
}
const num = value => Number(value) || 0;
export function preparingRowMatchesTab(stage, tab, row) {
  if (!preparingTabKnown(stage, tab) || !row) return false;
  if (tab === 'all') return stage !== 'warehouse' || num(row.tested) > 0 || num(row.accepted) > 0;
  if (stage === 'intake' || stage === 'testing') {
    const required = Math.max(0, num(row.projectTotalRequired ?? row.required));
    const received = Math.max(0, num(row.tested));
    if (tab === 'pending') return stage === 'testing' ? testingReadyToTest(row) > 0 : Math.max(0, required - received) > 0;
    if (tab === 'received') return received > 0;
    if (tab === 'done') return required > 0 && required <= received;
  }
  if (stage === 'warehouse') {
    if (tab === 'available') return Math.max(0, num(row.tested) - num(row.accepted)) > 0;
    if (tab === 'received') return num(row.accepted) > 0;
  }
  if (stage === 'production') {
    if (tab === 'available') return num(row.availableToProduction) > 0;
    if (tab === 'not-received') return num(row.productionReceived) === 0;
    if (tab === 'received') return num(row.productionReceived) > 0;
  }
  if (stage === 'boxes') {
    const unpacked = Math.max(0, num(row.unpacked));
    if (tab === 'available') return num(row.productionReceived) > 0 && unpacked > 0;
    if (tab === 'packed') return num(row.packedQty) > 0;
  }
  if (stage === 'cartons') return row.status === tab;
  return false;
}

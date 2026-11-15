import 'server-only';
import { preparingTabsGranular, preparingTabEditAllowed } from './preparing-stage-access.js';
import { preparingRowMatchesTab } from './preparing-tab-permissions.mjs';
import { projectTestingOverview, productionIntakeOverview } from './preparing-project-testing.js';
import { warehouseWorkspace } from './preparing-warehouse.js';
import { rpc } from './supabase-rest.js';
import { productionWorkspace } from './preparing-production.js';
import { projectCartonWorkspace } from './preparing-project-cartons.js';
import { warehouseTotals, warehouseReceivingBalances, projectRequired } from './preparing-warehouse-math.mjs';

const deny = (message='Edit is not permitted in this stage tab.') => {
  const error = new Error(message); error.status = 403; throw error;
};
const asId = value => String(value ?? '').toLowerCase().trim();

// Never accept a client-provided row status or list membership. Evaluate the
// requested component against a fresh server-side ledger instead. This is
// additionally protected by each stage's existing write gate.
export async function requirePreparingTabWrite(account, stage, body, { action = '' } = {}) {
  if (!preparingTabsGranular(account)) return;
  const tab = String(body?.editTab || '');
  if (!preparingTabEditAllowed(account, stage, tab)) deny();
  // Administrative non-component actions require Edit All Components.
  // Creation of a carton is also allowed in the Draft tab.
  if (stage === 'boxes' && (['create','generate_school_kits','rename','cancel'].includes(action) ||
    ['init_school_kit_plan','transfer_school_kit_target','complete_school_kit'].includes(action))) {
    if (tab !== 'all') deny('Managing box labels requires Edit All Components.');
    return;
  }
  if (stage === 'warehouse' && action !== 'receive') {
    if (tab !== 'all') deny('Warehouse management requires Edit All Components.');
    return;
  }
  if (stage === 'cartons' && ['create', 'pack_school_carton'].includes(action)) {
    if (tab !== 'all' && tab !== 'draft') deny('Packing a school carton requires Edit All Cartons or Draft.');
    return;
  }
  const ids = (Array.isArray(body?.lines) ? body.lines.map(r => r?.itemId) : [body?.itemId]).map(asId).filter(Boolean);
  if (stage === 'cartons') {
    const snapshot = await projectCartonWorkspace(body?.projectId);
    let cartonId = asId(body?.cartonId);
    if (!cartonId && body?.cartonLineId) cartonId = asId(snapshot.lines.find(row => asId(row.id) === asId(body.cartonLineId))?.carton_id);
    if (!cartonId && body?.allocationId) cartonId = asId(snapshot.allocations.find(row => asId(row.id) === asId(body.allocationId))?.carton_id);
    const carton = snapshot.cartons.find(row => asId(row.id) === cartonId);
    if (!preparingRowMatchesTab(stage, tab, carton)) deny('This carton does not belong to an editable tab.');
    return;
  }
  if (!ids.length || new Set(ids).size !== ids.length) deny('Choose a valid component in an editable tab.');
  // All Components applies to all rows, and the existing business transaction
  // still verifies project membership, optimistic updates and quantity limits.
  if (tab === 'all' && stage !== 'warehouse') return;
  let rows;
  if (stage === 'intake') rows = (await productionIntakeOverview(body?.projectId)).items;
  else if (stage === 'testing') rows = (await projectTestingOverview(body?.projectId)).items;
  else if (stage === 'warehouse') {
    const state = await warehouseWorkspace(body?.projectId);
    // Server-side membership check: never trust the client-supplied filter.
    const intake = tab === 'all'
      ? await rpc('erp_preparing_intake_snapshot_v388',{p_project_id:state.projectId},{profileName:'preparing.tab.warehouse.intake'})
      : null;
    rows = warehouseReceivingBalances(
      warehouseTotals(state.items.map(row => ({...row, required_qty: projectRequired(Number(row.required_qty || 0),state.schools.length)})),state.receiptLines,state.allocations),
      state.testingBalances,intake?.balances||[]
    );
  } else if (stage === 'production' || stage === 'boxes') {
    const state = await productionWorkspace(body?.projectId);
    rows = stage === 'boxes' ? state.items.map(row => ({...row, unpacked: Math.max(0, Number(row.productionReceived)-Number(row.packedQty))})) : state.items;
  } else deny();
  const byId = new Map(rows.map(row => [asId(row.id), row]));
  if (ids.some(id => !preparingRowMatchesTab(stage, tab, byId.get(id))))
    deny('One or more components are outside the editable tab. Refresh the stage and try again.');
}

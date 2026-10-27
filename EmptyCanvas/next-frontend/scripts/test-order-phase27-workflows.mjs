// Isolated regression tests for the actual Phase 27 server bulk workflow.
// No Supabase connection, seeded fake rows and mutation stubs only.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = readFileSync(new URL('../lib/orders-review-data.js', import.meta.url), 'utf8');
const start = source.indexOf('export async function updateOrdersReviewBulkApproval(');
const end = source.indexOf('export async function updateOrdersReviewQuantity(', start);
assert(start >= 0 && end > start, 'Phase 27 bulk workflow exists');
const fnSource = source.slice(start, end).replace(/^export /, '');
const state = {
  rows: [], writes: [], invalidations: 0, access: true, blocked: false,
};
const env = {
  text: (v) => String(v ?? '').trim(),
  norm: (v) => String(v ?? '').trim().toLowerCase(),
  ensureReviewMutationAccess: () => { if (!state.access) throw Object.assign(new Error('Edit required'), {status:403}); return true; },
  cleanReviewActionIds: (ids) => [...new Set(ids.map((v) => String(v ?? '').trim()).filter(Boolean))].slice(0, 500),
  directMutationError: (message, status) => Object.assign(new Error(message), { status }),
  allowedReviewRows: async (_, ids) => {
    if (state.blocked) throw Object.assign(new Error('Not allowed'), { status: 403 });
    const matched = ids.map((id) => state.rows.find((row) => row.id === id));
    if (matched.some((row) => !row)) throw Object.assign(new Error('Not found'), { status: 404 });
    return matched;
  },
  valueFor: (row, keys) => {
    const aliases = { 'Issue Description': 'issue_description', 'S.V Approval':'sv_approval', 'SV Approval':'sv_approval', 'Status':'status', 'ID':'id' };
    for (const name of keys) if (Object.hasOwn(row, name)) return row[name]; else if (Object.hasOwn(row, aliases[name])) return row[aliases[name]];
    return null;
  },
  tableName: () => 'orders',
  updateByIds: async (_, ids, patch) => {
    state.writes.push({ ids, patch });
    for (const row of state.rows) if (ids.includes(row.id)) Object.assign(row, patch);
    return state.rows.filter((row) => ids.includes(row.id));
  },
  invalidateLegacyReviewCaches: async () => { state.invalidations++; },
};
const testContext = vm.createContext(env);
vm.runInContext(`${fnSource}\nthis.bulk = updateOrdersReviewBulkApproval;`, testContext);
const bulk = testContext.bulk;
const reset = (rows) => { state.rows = structuredClone(rows); state.writes = []; state.invalidations = 0; state.access = true; state.blocked = false; };

// 160 components must be ONE write, never 160 HTTP mutations.
reset(Array.from({ length: 160 }, (_, i) => ({ id: String(i+1), sv_approval: 'Not Started', status:'Under Supervision', issue_description:'' })));
const result = await bulk({ account: {}, orderIds: state.rows.map((row) => row.id), decision: 'Approved' });
assert.equal(state.writes.length, 1);
assert.equal(state.writes[0].ids.length, 160);
assert.equal(result.changed, 160);
assert(state.rows.every((row) => row.sv_approval === 'Approved' && row.status === 'In progress'));
assert.equal(state.invalidations, 1);

// Already-approved, shipped rows must not regress in status.
reset([{ id:'1', sv_approval:'Approved', status:'Shipped' }, { id:'2', sv_approval:'Not Started', status:'Under Supervision' }]);
const approved = await bulk({ orderIds:['1','2'], decision:'Approved' });
assert.equal(approved.changed, 1);
assert.equal(state.rows[0].status, 'Shipped');
assert.equal(state.rows[1].status, 'In progress');

// A rejection reason is required BEFORE any write.
reset([{id:'1',status:'In progress'}]);
await assert.rejects(bulk({orderIds:['1'],decision:'Rejected'}), {status:400});
assert.equal(state.writes.length,0);
await bulk({orderIds:['1'],decision:'Rejected',rejectedReason:'Wrong product'});
assert.equal(state.writes.length,1);
assert.equal(state.rows[0].rejected_reason,'Wrong product');

// Reject cross-workflow / unauthorized / archived requests without touching DB.
for (const row of [
  {id:'1',issue_description:'Created from proposal: older order'},
  {id:'1',status:'Archive'},
]) {
  reset([row]);
  await assert.rejects(bulk({orderIds:['1'],decision:'Approved'}));
  assert.equal(state.writes.length,0);
}
reset([{id:'1'}]);state.blocked=true;
await assert.rejects(bulk({orderIds:['1'],decision:'Approved'}), {status:403});
assert.equal(state.writes.length,0);
reset([{id:'1'}]);state.access=false;
await assert.rejects(bulk({orderIds:['1'],decision:'Approved'}), {status:403});
assert.equal(state.writes.length,0);

// Validate input IDs; an invalid number must not silently get omitted.
reset([{id:'1'}]);
await assert.rejects(bulk({orderIds:['1','wrong-id'],decision:'Approved'}), {status:400});
assert.equal(state.writes.length,0);
console.log('Phase 27: 7 workflow scenarios passed');

// Supervisor quantity editing: never create negative remaining quantities or
// accept an accidental negative quantity on product requests.
const quantityStart = source.indexOf('export async function updateOrdersReviewQuantity(');
const quantityEnd = source.indexOf('\nfunction reviewAccessToken(', quantityStart);
assert(quantityStart >= 0 && quantityEnd > quantityStart);
const quantitySource = source.slice(quantityStart, quantityEnd).replace(/^export /, '');
const quantityState = {row: null, updates:[]};
const quantityContext = vm.createContext({
  ...env,
  allowedReviewRow: async () => quantityState.row,
  num: (v) => v === null || v === undefined ? null : Number(v),
  roundOrderQty: (v) => Math.round(Number(v) * 1e6) / 1e6,
  orderTypeKey: (v) => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),
  updateById: async (_, id, patch) => { quantityState.updates.push({id,patch}); },
});
vm.runInContext(`${quantitySource}\nthis.saveQuantity = updateOrdersReviewQuantity;`, quantityContext);
const saveQuantity = quantityContext.saveQuantity;
quantityState.row = {id:'1',order_type:'Request Products',quantity_requested:8,quantity_received_by_operations:5};
await assert.rejects(saveQuantity({id:'1',value:4}), {status:409});
await assert.rejects(saveQuantity({id:'1',value:-4}), {status:400});
await assert.rejects(saveQuantity({id:'1',value:''}), {status:400});
assert.equal(quantityState.updates.length,0);
await saveQuantity({id:'1',value:6});
assert.equal(quantityState.updates[0].patch.quantity_remaining,1);
quantityState.row = {id:'2',order_type:'Withdraw Products',quantity_requested:-8,quantity_received_by_operations:-3};
await saveQuantity({id:'2',value:6});
assert.equal(quantityState.updates[1].patch.quantity_remaining,-3);
console.log('Phase 27: quantity validation scenarios passed');

// Receiving components: malformed or partial quantity maps must fail BEFORE
// the first Supabase PATCH (the old behavior could mark omitted rows fully received).
const opsSource = readFileSync(new URL('../lib/operations-orders-data.js', import.meta.url), 'utf8');
const opsStart = opsSource.indexOf('export async function markOperationsShipped(');
const opsEnd = opsSource.indexOf('\nfunction operationsProductKey(', opsStart);
assert(opsStart >= 0 && opsEnd > opsStart);
const writes = [];
const operationsContext = vm.createContext({
  text: (v) => String(v ?? '').trim(),
  ensureOperationsMutationAccess: () => true,
  loadOperationRowsByIds: async () => ({ clean:['1','2'], byId:new Map([['1',{id:'1',quantity_requested:4}],['2',{id:'2',quantity_requested:2}]]) }),
  directOperationsMutationError: (message,status) => Object.assign(new Error(message), {status}),
  mergeReceiptNumbers: (a,b) => String(b ?? ''),
  orderBaseQuantity: (row) => row.quantity_requested,
  rawReceivedQuantity: () => 0,
  rawRemainingQuantity: () => null,
  effectiveReceivedForMutation: () => 0,
  clampQuantityToBase: (base,value) => Math.min(Math.max(value,0),base),
  roundQty: (value) => Math.round(Number(value)*1e6)/1e6,
  supabaseRequest: async () => { writes.push(1); },
  tableName: () => 'orders',
  mapWithConcurrency: async () => [],
  invalidateLegacyOperationsCaches: async () => {},
});
vm.runInContext(`${opsSource.slice(opsStart,opsEnd).replace(/^export /,'')}\nthis.markShipped = markOperationsShipped;`, operationsContext);
const ship = operationsContext.markShipped;
await assert.rejects(ship({orderIds:['1','2'],quantities:{'1':1}}),{status:400});
await assert.rejects(ship({orderIds:['1','2'],quantities:{'1':'not-a-number','2':1}}),{status:400});
await assert.rejects(ship({orderIds:['1','2'],quantities:{'1':99,'2':1}}),{status:400});
assert.equal(writes.length,0);
console.log('Phase 27: receive-quantity input guards passed');

// Current Orders: read-only page permission can no longer reach a status PATCH.
const currentSource = readFileSync(new URL('../lib/current-orders-data.js', import.meta.url), 'utf8');
const currentStart = currentSource.indexOf('export async function markCurrentOrderReceivedDirect(');
const currentEnd = currentSource.indexOf('\nfunction directCurrentMutationError(', currentStart);
assert(currentStart >= 0 && currentEnd > currentStart);
let canEdit = false;
let currentWrites = 0;
const currentContext = vm.createContext({
  directPageMutationAccess: () => canEdit,
  directCurrentMutationError: (message,status) => Object.assign(new Error(message), {status}),
  isSupabaseConfigured: () => true,
  text: (v) => String(v ?? '').trim(),
  loadRawOrderRowsByIds: async () => [{id:'1'}],
  updateById: async () => {currentWrites++;},
  tableName: () => 'orders',
  invalidateLegacyOperationsCaches: async () => {},
});
vm.runInContext(`${currentSource.slice(currentStart,currentEnd).replace(/^export /,'')}\nthis.markReceived = markCurrentOrderReceivedDirect;`, currentContext);
await assert.rejects(currentContext.markReceived({orderPageId:'1'}),{status:403});
assert.equal(currentWrites,0);
canEdit=true;
assert.equal((await currentContext.markReceived({orderPageId:'1'})).status,'Received');
assert.equal(currentWrites,1);
console.log('Phase 27: read-only mutation access guard passed');

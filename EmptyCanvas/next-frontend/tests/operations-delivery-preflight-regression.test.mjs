import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../lib/operations-orders-data.js', import.meta.url), 'utf8');
function excerpt(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing test code: ${start}`);
  return source.slice(from, to).replace(/^export /, '');
}
const text = value => String(value ?? '').trim();
const key = value => text(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const findKey = (keys, aliases) => keys.find(item => aliases.map(key).includes(key(item))) || '';
const directOperationsMutationError = (message, status = 500) => Object.assign(new Error(message), {status, code:'DIRECT_OPERATIONS_MUTATION_FAILED'});

function makeStockContext({stockRows, members, openApi} = {}) {
  const sandbox = {
    text,
    directOperationsMutationError,
    opsStockCanonical: key,
    opsStockTableName: () => 'stocktaking',
    opsSelectAllPaged: async () => stockRows ?? [],
    listTeamMembersLite: async () => members ?? [],
    supabaseRequest: async () => openApi ?? {},
    opsStockFindKey: findKey,
    opsStockQuantityColumn: (keys, school) => findKey(keys, [school, `${school}_done`]),
    serializeOperationsOrderDetail: row => ({orderType: row.order_type, status: row.status}),
    opsFinalStatus: value => /arrived|delivered/i.test(value),
    opsSupportedStockOrderType: value => value === 'Request Products',
    operationsValueFor: (row, aliases) => aliases.map(alias => row[alias]).find(Boolean) ?? null,
    operationsAccessToken: key,
    operationsProductMaps: () => ({}),
  };
  vm.runInNewContext(
    excerpt('function opsResolveOwnerMember(', '\nasync function opsStockInsertSafe(') + '\nthis.run = opsPrepareStockContext;',
    sandbox,
  );
  return sandbox.run;
}
const order = {id:1, status:'Arrived', order_type:'Request Products', team_member_id:'7', team_member_name:'School A'};
const member = {id:'7', name:'School A', stocktakingColumn:'school_a'};

test('missing source_order_id yields actionable response before any delivery', async () => {
  const run = makeStockContext({stockRows:[{id:1,school_a:12}], members:[member]});
  await assert.rejects(run([order],[]), err => err.status === 409 && /supabase_operations_delivery_stocktaking\.sql/.test(err.message));
});

test('Stocktaking member/school assignment is checked before delivery', async () => {
  const run = makeStockContext({stockRows:[{id:1,source_order_id:null,school_a:12}], members:[{id:'7',name:'School A',stocktakingColumn:''}]});
  await assert.rejects(run([order],[]), err => err.status === 409 && /Users Center/.test(err.message));
});

test('Stocktaking data may be empty when schema is available in OpenAPI', async () => {
  const run = makeStockContext({
    stockRows:[], members:[member],
    openApi: {definitions:{stocktaking:{properties:{id:{},source_order_id:{},school_a:{}}}}},
  });
  const result = await run([order],[]);
  assert.equal(result.needed,true);
  assert.equal(result.sourceOrderColumn,'source_order_id');
  assert.equal(result.quantityColumnBySchool.get('school_a'),'school_a');
});

test('School quantity cannot silently fall back to a different generic quantity column', () => {
  const sandbox = {
    text,
    opsStockColumnKey: value => text(value).toLowerCase().replace(/[^a-z0-9]+/g,'_'),
    opsStockFindKey:findKey,
  };
  vm.runInNewContext(excerpt('function opsStockQuantityColumn(', '\nfunction opsStockTableName(') + '\nthis.run=opsStockQuantityColumn;', sandbox);
  assert.equal(sandbox.run(['id','source_order_id','total_quantity'], 'school_a'), '');
});

test('delivery fails before upload and update when Stocktaking validation fails', async () => {
  const calls = {uploads:0, updates:0};
  const sandbox = {
    text, directOperationsMutationError, calls,
    directPageMutationAccess: () => true,
    ensureOperationsMutationAccess: () => true,
    loadOperationRowsByIds: async ids => ({clean: ids, rows:[{...order,status:'Shipped',order_receipt:null}],byId:new Map([['1',{...order,status:'Shipped',order_receipt:null}]])}),
    serializeOperationsOrderDetail: row => ({status:row.status,orderType:row.order_type,maintenanceLogs:[]}),
    statusIndex: value => value === 'Shipped' ? 3 : value === 'Arrived' ? 4 : 2,
    featureAllowed: () => true,
    splitReceiptNumbers: () => [], mergeReceiptNumbers: () => '',
    opsReceiptUploadInput: () => [{buffer:Buffer.from('test'),cleanName:'receipt.jpg',safeExt:'jpg',contentType:'image/jpeg'}],
    opsHasColumn: (row,aliases) => aliases.some(alias => Object.hasOwn(row,alias)),
    opsSupportedStockOrderType: type => type === 'Request Products',
    getProductsCatalog: async () => ({products:[]}),
    opsPrepareStockContext: async () => { throw directOperationsMutationError('Stocktaking needs source_order_id',409); },
    uploadStorageObject: async () => {calls.uploads += 1;},
    updateById: async () => {calls.updates += 1;},
    getSupabaseConfig: () => ({storageBucket:'operations-files'}),
  };
  vm.runInNewContext(excerpt('export async function markOperationsArrived(', '\nexport async function saveOperationsEditDetails(') + '\nthis.run=markOperationsArrived;', sandbox);
  await assert.rejects(sandbox.run({orderIds:['1']}), {status:409});
  assert.deepEqual(calls, {uploads:0,updates:0});
});

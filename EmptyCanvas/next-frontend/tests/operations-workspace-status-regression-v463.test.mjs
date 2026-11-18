import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as status from '../lib/operations-remaining-status.mjs';
import * as filters from '../lib/operations-status-filter.mjs';
import { operationsWorkspaceType } from '../lib/operations-order-pages.mjs';
import { ownerInOrderScope } from '../lib/order-data-scope.mjs';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const data = read('lib/operations-orders-data.js');
const logic = read('lib/order-search-hotpath.js').replace(/^import .*;\s*$/gm,'').replace(/\bexport /g,'');
const paging = read('lib/order-pagination.js').replace(/^import .*;\s*$/gm,'').replace(/\bexport /g,'');
const server = data.slice(data.indexOf('const PAGE_LIMIT'),data.indexOf('export async function loadOperationsOrdersInitialPage')).replace(/\bexport /g,'');
const client = read('components/orders/OperationsOrdersClient.jsx');
const ui = vm.runInNewContext(`${client.slice(client.indexOf('function text('),client.indexOf('function splitOrderDisplayQuantity'))}\n({buildGroups, groupsForTab})`, {...status});
const row=(n,id,type='Request Products',state='Under Supervision',approval=null,extra={})=>({id:String(id),order_number:n,order_type:type,status:state,sv_approval:approval,quantity_requested:1,quantity_progress:1,quantity_received_by_operations:0,quantity_remaining:1,team_member_id:'owner',team_member_name:'School',notion_created_time:'2026-11-17T10:00:00Z',...extra});
const sample = [
  row(151,1510,'Request Maintenance'),
  row(150,1500),
  // Edited order with one old removed component and 19 live components.
  row(149,1490,'Request Products','Archive','Approved'),
  ...Array.from({length:19},(_,i)=>row(149,1491+i,i===0?'': 'Request  Products')),
  row(148,1480,'Request Maintenance','In progress','Approved'),
  row(147,1470,'Request Products','Archive'),
  row(106,1060,'Withdraw Products','Under Supervision','Approved',{quantity_requested:-3,quantity_progress:-3,quantity_remaining:-3}),
  row(105,1050,'Withdraw Products','Shipped','Approved',{quantity_received_by_operations:-1,quantity_remaining:-2}),
  row(104,1040,'Withdraw Products','Pending','Rejected'),
  row(103,1030,'Withdraw Products','Pending','Approved',{rejected_reason:'Rejected by reviewer'}),
  row(102,1020,'Withdraw Products','Pending'),
  row(101,1010,'Withdraw Products','Arrived','Approved',{quantity_received_by_operations:-1,quantity_remaining:0}),
];

// Execute the actual paged server function, candidate scanner and grouping
// code against in-memory Supabase responses. Both candidate/summary RPC and
// normal REST paths are covered, without calling a live database.
function harness(rows=sample,{rpc=true, scope={scope:'all',visibleIds:[]}}={}) {
  const calls=[];
  function candidates(cursor, wanted, type='') {
    const sorted=[...new Set(rows.filter(r=>(cursor==null||r.order_number<cursor)&&(!type||String(r.order_type).toLowerCase().includes(type.toLowerCase()))).map(r=>r.order_number))].sort((a,b)=>b-a);
    return {numbers:sorted.slice(0,wanted),hasMore:sorted.length>wanted};
  }
  const select = async (_table,params) => {
    calls.push(params);
    let found=rows.slice();
    if(params.order_number?.startsWith('eq.')) found=found.filter(r=>r.order_number===Number(params.order_number.slice(3)));
    if(params.order_number?.startsWith('lt.')) found=found.filter(r=>r.order_number<Number(params.order_number.slice(3)));
    if(params.order_number?.startsWith('in.(')) {const nums=params.order_number.slice(4,-1).split(',').map(Number);found=found.filter(r=>nums.includes(r.order_number));}
    if(params.order_type) found=found.filter(r=>String(r.order_type).toLowerCase().includes(params.order_type.replace(/^ilike\.\*|\*$/g,'').toLowerCase()));
    if(params.or?.includes('status.ilike')) {const tokens=[...params.or.matchAll(/status\.ilike\.\*([^*]+)\*/g)].map(m=>m[1]);found=found.filter(r=>tokens.some(t=>r.status.toLowerCase().includes(t)));}
    return found.sort((a,b)=>b.order_number-a.order_number).slice(Number(params.offset)||0,(Number(params.offset)||0)+(Number(params.limit)||1000));
  };
  const env={...status,...filters,operationsWorkspaceType,performance:{now:()=>0},recordPerformanceSample:()=>{},process:{env:{}},select,
    isSupabaseConfigured:()=>true,resolveOrderScope:async()=>scope,visibleOrderRow:(r,s)=>ownerInOrderScope(r,s.scope,s.visibleIds),
    canUseOrderCandidateRpc:()=>rpc,loadOrderCandidateNumbersRpc:async opts=>{calls.push(opts);return candidates(opts.cursor,opts.wanted,opts.orderType);},noteOrderCandidateRpcError:()=>{},
    canUseOrderSummaryRpc:()=>rpc,loadOrderSummaryRowsRpc:async ({numbers})=>rows.filter(r=>numbers.includes(r.order_number)),noteOrderSummaryRpcError:()=>{},
    canUseOrderCardSummaryRpc:()=>true,loadOrderCardSummariesRpc:async()=>{throw new Error('Lossy card summary must not be used');},noteOrderCardSummaryRpcError:()=>{throw new Error('Lossy card summary was used');},
  };
  vm.createContext(env);
  // Separate scopes prevent collisions between the modules' local helpers.
  vm.runInContext(`(()=>{${logic}\nObject.assign(globalThis,{createOrderSearchPlan,applyOrderSearchPlan,canUseOrderSearchText,noteOrderSearchTextError});})()`,env);
  vm.runInContext(`(()=>{${paging}\nObject.assign(globalThis,{scanOrderNumberCandidates,loadOrderRowsByNumbers,consumeOrderSummaryWindows});})()`,env);
  vm.runInContext(`${server}\nglobalThis.load=loadOperationsOrdersPage;`,env);
  return {load:options=>env.load({type:'withdrawproducts',...options}),calls};
}
for(const rpc of [true,false]) {
  test(`ORD-106: All, Approved tab, status filter and detail group agree (${rpc?'RPC':'REST'})`,async()=>{
    const {load}=harness(sample,{rpc});
    const all=await load({});
    assert.equal(ui.buildGroups(all.items).find(g=>g.orderIdLabel==='ORD-106').state,'approved');
    for(const options of [{tab:'approved'},{statuses:['approved']},{tab:'approved',query:'ORD-106'}]) {
      const result=await load(options);
      assert.deepEqual(plain(result.items.map(r=>r.orderIdNumber)),[106]);
      assert.equal(result.items[0].quantity,-3);
      assert.equal(result.items[0].status,'Under Supervision');
      const groups=ui.groupsForTab(ui.buildGroups(result.items),result.items,'approved');
      assert.equal(groups.length,1);
      assert.equal(groups[0].stage,2);
      assert.equal(groups[0].orderIdLabel,'ORD-106');
    }
  });
  test(`ORD-149: archived edit row cannot hide the 19 live components (${rpc?'RPC':'REST'})`,async()=>{
    const {load}=harness(sample,{rpc});
    for(const options of [{},{query:'ORD-149'},{statuses:['under-supervision']}]) {
      const result=await load({type:'requestproducts',...options});
      const items=result.items.filter(r=>r.orderIdNumber===149);
      assert.equal(items.length,19);
      assert.ok(items.every(r=>r.status!=='Archive'&&r.orderType==='Request Products'));
      assert.equal(ui.buildGroups(items)[0].orderIds.length,19);
      assert.equal(ui.buildGroups(items)[0].state,'under-supervision');
    }
    const archive=await load({type:'requestproducts',tab:'archive'});
    assert.deepEqual(plain(archive.items.map(r=>r.orderIdNumber)),[147]);
    const withdrawal=await load({query:'ORD-149'});
    assert.equal(withdrawal.items.length,0);
  });
}
test('rejected decisions, shipping and delivered orders do not leak into Approved',async()=>{
  const {load}=harness();
  const result=await load({tab:'rejected'});
  assert.deepEqual(plain(result.items.map(r=>r.orderIdNumber)),[104,103]);
  assert.equal(status.operationsApprovalRowMatches(3,'approved','approved'),false);
  assert.equal(status.operationsApprovalRowMatches(4,'approved','approved'),false);
  assert.equal(status.operationsApprovalRowMatches(5,'approved','approved'),false);
});
test('scope still checks every saved row, including archived rows; no access bypass',async()=>{
  const foreign=sample.map(r=>r.id==='1490'?{...r,team_member_id:'another-owner'}:r);
  const {load}=harness(foreign,{scope:{scope:'own',visibleIds:['owner']}});
  const result=await load({type:'requestproducts',query:'ORD-149'});
  assert.equal(result.items.length,0);
});
test('valid type is resolved across rows but conflicting or completely missing types are not guessed',()=>{
  assert.equal(operationsWorkspaceType([{orderType:null},{orderType:'Request-Products'}]).type,'requestproducts');
  assert.equal(operationsWorkspaceType([{orderType:'Request Products'},{orderType:'Withdraw Products'}]),null);
  assert.equal(operationsWorkspaceType([{orderType:null}]),null);
});
test('type/status filtering occurs before pagination and Load More does not omit or repeat orders',async()=>{
  const rows=Array.from({length:45},(_,i)=>row(300-i,300-i,i%2?'Request Products':'Withdraw Products','Pending','Approved'));
  const {load}=harness(rows);
  let cursor=null, all=[];
  do {const page=await load({tab:'approved',limit:10,cursor});all.push(...page.items.map(r=>r.orderIdNumber));cursor=page.pageInfo.nextCursor;} while(cursor!==null);
  assert.deepEqual(all,rows.filter(r=>r.order_type==='Withdraw Products').map(r=>r.order_number));
});

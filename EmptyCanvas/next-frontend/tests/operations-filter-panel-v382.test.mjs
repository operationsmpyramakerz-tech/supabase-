import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectOperationsFilterGroups, summarizeOperationsFacets, OPERATIONS_SHORTCUTS, FILTER_STATUS_ORDER, toggleOperationsShortcut} from '../lib/operations-filter-preferences.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const groups=[{key:'1',stage:2,hasApproved:true,hasRejected:true,orderType:'Request Products'},{key:'2',stage:3,hasReceived:true,orderType:'Request Maintenance'},{key:'3',stage:4,hasRemaining:true,hasReceived:true,orderType:'Request Products'},{key:'4',stage:4,orderType:'Request Products'},{key:'5',stage:5,orderType:'Withdraw Products'}];
test('Reference status order and group shortcut toggles are deterministic',()=>{
  assert.deepEqual(FILTER_STATUS_ORDER,['approved','rejected','remaining','received','delivered','partial-delivered','under-supervision','archive']);
  const progress=OPERATIONS_SHORTCUTS[0];
  const active=toggleOperationsShortcut(['delivered'],progress);
  assert.deepEqual(active,['under-supervision','approved','received','delivered']);
  assert.deepEqual(toggleOperationsShortcut(active,progress),['delivered']);
});
test('Facets count each group once per shortcut, include archive and respect type',()=>{
  const total=summarizeOperationsFacets(groups);
  assert.equal(total.statuses.approved,1);assert.equal(total.statuses.rejected,1);assert.equal(total.statuses.archive,1);assert.equal(total.statuses['partial-delivered'],1);
  assert.deepEqual(total.shortcuts,{progress:2,completed:1,exception:2});
  const type=summarizeOperationsFacets(groups,'requestmaintenance');assert.equal(type.statuses.received,1);assert.equal(type.shortcuts.progress,1);assert.equal(type.shortcuts.exception,0);
});
test('Counts are collected beyond Load More without double counting an order',async()=>{
  const seen=[];const result=await collectOperationsFilterGroups(async cursor=>{seen.push(cursor);return cursor===null?{items:groups.slice(0,3),pageInfo:{hasMore:true,nextCursor:3}}:{items:groups.slice(2),pageInfo:{hasMore:false}};},rows=>rows);
  assert.deepEqual(seen,[null,3]);assert.equal(result.length,5);assert.equal(summarizeOperationsFacets(result).statuses.archive,1);
});
test('Incomplete count scans fail rather than show incorrect totals',async()=>{
  await assert.rejects(collectOperationsFilterGroups(async()=>({items:[],pageInfo:{hasMore:true,nextCursor:2}}),rows=>rows),/did not advance/);
  await assert.rejects(collectOperationsFilterGroups(async()=>null,rows=>rows),/Incomplete/);
});
test('Draft state is initialized on open, applies only through the footer and omits removed summary',()=>{
  const ui=read('components/orders/OperationsFilterControl.jsx');assert.match(ui,/setDraftStatuses\(\[\.\.\.statusValues\]\)/);assert.match(ui,/onApply\(\{statuses:draftStatuses,sort:draftSort,reset:resetRequested\}\)/);assert.match(ui,/onClick=\{apply\}/);assert.match(ui,/onClick=\{reset\}/);assert.doesNotMatch(ui,/filters selected|Clear all/);assert.match(ui,/Smart shortcuts/);
  const client=read('components/orders/OperationsOrdersClient.jsx');assert.match(client,/loadGroups=\{loadFilterGroups\}/);assert.match(client,/statuses: OPERATIONS_STATUS_OPTIONS.map/);assert.match(client,/onApply=\{applyFilters\}/);
  assert.match(read('components/orders/OrdersPreferencesControl.jsx'),/if \(props.loadGroups && props.statusOptions\?\.length\) return <OperationsFilterControl/);
});

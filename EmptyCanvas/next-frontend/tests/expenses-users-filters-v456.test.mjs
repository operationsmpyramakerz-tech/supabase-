import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildExpenseDestinationFilters, expenseFundsTypeOptions, expenseFilterCount, EMPTY_EXPENSE_FILTERS, isOtherExpenseReason, matchesExpenseUserFilters } from '../lib/expense-users-filters.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const directory = [{id:'a',name:'ACIC'}, {id:'b',name:'Liberty'}, {id:'c',name:'Unused'}, {id:'d',name:'Same'}, {id:'e',name:'Same'}];
const row = (id, fields = {}) => ({id,date:'2026-11-18',fundsType:'Train',cashOut:10,reason:'Trip',destinationUserId:'a',destinationUserName:'ACIC',...fields});
const dateKey = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0,10) : '';
test('destination options require existing directory identity and actual authorized expense rows', () => {
  const rows = [row('1'), row('2',{destinationUserId:'gone',destinationUserName:'Liberty'}), row('3',{destinationUserId:'',destinationUserName:' liberty '}), row('4',{destinationUserId:'',destinationUserName:'Same'}), row('5',{destinationUserId:'a',destinationUserName:'Old ACIC'})];
  const result = buildExpenseDestinationFilters(rows,directory);
  assert.deepEqual(result.destinationOptions,[{id:'a',name:'ACIC'},{id:'b',name:'Liberty'}]);
  assert.deepEqual(result.items.map(r=>r.destinationFilterId),['a','','b','','a']);
  assert.equal(result.items[1].destinationUserName,'Liberty');
  assert.equal(rows[0].destinationFilterId,undefined);
  assert.equal(result.items.length,rows.length);
});
test('deleted IDs never bind to same-name replacement and missing directory never leaks names',()=>{
  const rows=[row('1',{destinationUserId:'removed',destinationUserName:'ACIC'})];
  assert.deepEqual(buildExpenseDestinationFilters(rows,directory).destinationOptions,[]);
  const noDirectory=buildExpenseDestinationFilters(rows,[]);
  assert.deepEqual(noDirectory.destinationOptions,[]);
  assert.equal(noDirectory.items[0].destinationFilterId,'');
});
test('funds options deduplicate capitalization and include real cash-in funds types',()=>{
  const types=expenseFundsTypeOptions([row('1'),row('2',{fundsType:' train '}),row('3',{fundsType:'Online Transfer',cashIn:100}),row('4',{fundsType:'',cashIn:10}),row('5',{fundsType:''})]);
  assert.deepEqual(types.map(x=>x.value),['cash in','cash out','online transfer','train']);
});
test('Other reason handles legacy fake orders, actual manual expenses, and excludes linked orders and settlements',()=>{
  assert.equal(isOtherExpenseReason(row('1',{orders:[{label:'Other reason',orderId:'Other reason'}]})),true);
  assert.equal(isOtherExpenseReason(row('2',{reason:'عودة للاسكندرية',orders:[],ordersRaw:'[]'})),true);
  assert.equal(isOtherExpenseReason(row('3',{orders:[{orderId:'ORD-129',label:'ORD-129'}]})),false);
  assert.equal(isOtherExpenseReason(row('4',{orders:[{label:'Other reason'},{label:'ORD-129'}]})),false);
  assert.equal(isOtherExpenseReason(row('5',{cashIn:100})),false);
  assert.equal(isOtherExpenseReason(row('6',{fundsType:'Settled my account'})),false);
  assert.equal(isOtherExpenseReason(row('7',{ordersRaw:'real-id'})),false);
});
test('date, funds, destination and Other reason combine by AND with inclusive dates',()=>{
  const rows=buildExpenseDestinationFilters([row('1'),row('2',{date:'2026-11-17'}),row('3',{fundsType:'Uber'}),row('4',{destinationUserId:'b',destinationUserName:'Liberty'}),row('5',{orders:[{label:'ORD-129'}]}),row('6',{date:'',createdTime:'2026-11-18T01:00:00Z',cashOut:20})],directory).items;
  const filters={...EMPTY_EXPENSE_FILTERS,from:'2026-11-18',to:'2026-11-18',fundsType:'train',destination:'a',otherReason:true};
  const matches=rows.filter(item=>matchesExpenseUserFilters(item,filters,dateKey));
  assert.deepEqual(matches.map(x=>x.id),['1','6']);
  assert.equal(matches.reduce((sum,x)=>sum+x.cashOut,0),30);
  assert.equal(expenseFilterCount(filters),4);
  assert.equal(expenseFilterCount(EMPTY_EXPENSE_FILTERS),0);
  assert.equal(rows.filter(item=>matchesExpenseUserFilters(item,EMPTY_EXPENSE_FILTERS,dateKey)).length,6);
});
const jsx=read('../components/expenses/ExpensesUsersDialogs.jsx');
test('actual dialog filtering/sorting integrates with settlement split and signed ticket totals',()=>{
  const funcs=jsx.slice(jsx.indexOf('const SETTLEMENT_KEY'),jsx.indexOf('function groupTotal('));
  const {splitBySettlement,filterAndSort,groupUserExpenses}=runInNewContext(funcs+'\n({splitBySettlement,filterAndSort,groupUserExpenses});',{Date,matchesExpenseUserFilters});
  const rows=buildExpenseDestinationFilters([row('recent',{createdTime:'2026-11-18T15:00:00Z',cashOut:50}),row('past',{date:'2026-11-17',createdTime:'2026-11-17T15:00:00Z'}),row('cash',{createdTime:'2026-11-18T09:00:00Z',fundsType:'Online Transfer',cashIn:90,cashOut:0})],directory).items;
  const split=splitBySettlement(rows,'2026-11-18T00:00:00Z','2026-11-18');
  const recent=filterAndSort(split.recent,{fundsType:'train',sortType:'newest'});
  const past=filterAndSort(split.past,{fundsType:'train',sortType:'newest'});
  assert.deepEqual(Array.from(recent,r=>r.id),['recent']);
  const combined=filterAndSort([...recent,...past],{sortType:'oldest'});
  assert.deepEqual(Array.from(combined,r=>r.id),['past','recent']);
  assert.equal(groupUserExpenses(combined,'oldest').reduce((sum,g)=>sum+g.totalCashIn-g.totalCashOut,0),-60);
  assert.match(jsx,/const totalItems = filterActive \? combinedFiltered : filteredRecent/);
  assert.match(jsx,/const exportItems = totalItems/);
});
test('server computes destination options after permission scoping and export retains authorized row checks',()=>{
  const route=read('../app/api/expenses/user/[memberId]/route.js');
  assert.match(route,/const scoped = await scopeExpenseDetail[\s\S]*?buildExpenseDestinationFilters\(scoped.items \|\| \[\], directory\)/);
  assert.match(route,/expenseDestinationOptions\(\{ fresh: true \}\)/);
  assert.doesNotMatch(route,/NextResponse\.json\([^\n]*directory/);
  assert.match(read('../app/api/expenses/export-direct/route.js'),/selectAuthorizedExpenseExportRows\(body\?\.items, authorized\?\.items\)/);
});
test('receipt portal clears actual sheet stacking level and sheet uses icon-only controls',()=>{
  const css=read('../components/expenses/ExpensesUsersSheet.module.css');
  const perf=read('../public/css/expenses-performance.css');
  const viewer=jsx.slice(jsx.indexOf('function ReceiptViewer('),jsx.indexOf('function ExpenseActionModal('));
  assert.match(viewer,/return createPortal\([\s\S]*document\.body/);
  assert.match(perf,/z-index: 100220 !important/);
  assert.match(css,/\.receiptOverlay\s*\{\s*z-index: 100280 !important/);
  assert.match(css,/transform: translate\(-50%, -50%\)/);
  assert.match(jsx,/aria-label="Sort expenses"[^>]*[\s\S]*?<UserClassicIcon name="sort" size=\{21\}\/>/);
  assert.match(jsx,/aria-label=\{`Filter expenses/);
  assert.match(jsx,/disabled=\{invalidDates\}/);
  assert.match(jsx,/inert=\{receiptItem \? true : undefined\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const source = read('../components/expenses/ExpensesClient.jsx');
const css = read('../public/css/expenses-classic-inline.css');
const sheet = source.slice(source.indexOf('function AllExpensesSheet('), source.indexOf('export default function ExpensesClient('));
const groupFunction = source.slice(source.indexOf('function groupTransactions('), source.indexOf('function expenseAmount('));
const helpers = ['text', 'lower', 'number', 'transactionTime', 'displayReason'].map((name) => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\nfunction ', start + 1));
}).join('\n');
const groupTransactions = runInNewContext(`${helpers}\n${groupFunction}\ngroupTransactions`);
const entry = (id, destinationUserId, destinationUserName, cashOut, extra = {}) => ({ id, date: '2026-11-17', createdTime: '2026-11-17T10:00:00Z', reason: 'Delivery', cashOut, destinationUserId, destinationUserName, ...extra });
test('same date and reason split by destination identity only in All Expenses; totals and order links survive', () => {
  const rows = [entry('1','a','ACIC',10,{orders:[{key:'ord-1'}]}), entry('2','a','ACIC',20,{orders:[{key:'ord-1'}]}), entry('3','b','Liberty',30), entry('4','','',40)];
  const groups = groupTransactions(rows, { byDestination: true });
  assert.equal(groups.length, 3);
  assert.equal(groups.find(g => g.destinationName === 'ACIC').total, -30);
  assert.equal(groups.find(g => g.destinationName === 'ACIC').orders.length, 1);
  assert.equal(groups.find(g => g.destinationName === 'Liberty').total, -30);
  assert.equal(groups.find(g => !g.destinationName).total, -40);
  assert.equal(groups.reduce((sum,g) => sum + g.total, 0), -100);
  assert.equal(groupTransactions(rows).length, 1);
});
test('distinct IDs with same name stay separate; renamed destination keeps most recent recorded name', () => {
  const groups = groupTransactions([entry('1','a','Old name',10), entry('2','a','New name',20,{createdTime:'2026-11-17T11:00:00Z'}), entry('3','b','New name',30)], {byDestination:true});
  assert.equal(groups.length,2);
  assert.equal(groups.find(g=>g.items.length===2).destinationName,'New name');
});
test('history and current groups use destination grouping, and existing export and close actions remain',()=> {
  assert.match(sheet,/groupTransactions\(recentItems, \{ byDestination: true \}\)/);
  assert.match(sheet,/groupTransactions\(pastItems, \{ byDestination: true \}\)/);
  assert.equal((sheet.match(/compact showDestination/g)||[]).length,2);
  assert.match(sheet,/onClick=\{onExport\}/);
  assert.match(sheet,/onClick=\{onClose\}/);
  assert.match(sheet,/setShowPast/);
});
test('header adds a destination on the left, date on right, divider before unchanged reason area',()=> {
  assert.match(source,/expense-ticket__destination-date[\s\S]*?expense-ticket__destination-copy[\s\S]*?group\.destinationName \|\| "—"[\s\S]*?expense-ticket__date[\s\S]*?expense-ticket__destination-divider[\s\S]*?expense-ticket__header-side/);
  assert.match(css,/\.expense-ticket__destination-date \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css,/\.expense-ticket__destination-divider \{[^}]*dashed/);
});
test('bottom sheet overrides old dock constraints and keeps floating badge outside list scroll',()=> {
  assert.match(sheet,/all-expenses-sheet__badge[\s\S]*?allExpensesList[\s\S]*?all-expenses-sheet__footer/);
  assert.match(css,/\.all-expenses-bottom-sheet \{[^}]*align-items: flex-end !important/);
  assert.match(css,/\.all-expenses-sheet__badge \{[^}]*top: -28px;[^}]*left: 50%;[^}]*transform: translateX\(-50%\);[^}]*animation: none !important/);
  assert.match(css,/\.all-expenses-sheet \{[^}]*overflow: visible !important/);
  assert.match(css,/#allExpenses #allExpensesList \{[^}]*overflow-y: auto !important/);
});
test('V446 sheet is attached to body and sized against its viewport-constrained overlay', () => {
  assert.match(sheet,/return createPortal\(<div id="allExpenses"[\s\S]*?<\/div>, document\.body\);/);
  assert.match(css,/\.all-expenses-bottom-sheet \{[^}]*height: 100dvh;[^}]*max-height: 100%;/);
  assert.match(css,/\.all-expenses-sheet \{[^}]*max-height: 100% !important;/);
  assert.match(css,/\.all-expenses-sheet__footer \{[^}]*flex: 0 0 auto;[^}]*padding: 8px 20px max\(32px, calc\(env\(safe-area-inset-bottom, 0px\) \+ 16px\)\);/);
  assert.match(css,/\.next-all-expenses-close \{[^}]*min-height: 44px;/);
});
test('V446 black outer ticket preserves white expense rows and legible signed totals', () => {
  assert.match(css,/#allExpenses \.expense-ticket \{[^}]*background: #111111;/);
  assert.match(css,/#allExpenses \.expense-ticket__route-frame \{[^}]*background: #ffffff;/);
  assert.match(css,/#allExpenses \.expense-ticket__footer-value\.is-negative \{ color: #f87171; \}/);
  assert.match(css,/#allExpenses \.expense-ticket__footer-value\.is-positive \{ color: #4ade80; \}/);
});

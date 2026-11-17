import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialogs = source('../components/expenses/ExpensesDialogs.jsx');
const styles = source('../public/css/expenses-classic-inline.css');
const page = source('../app/expenses/page.jsx');

test('the Cash Out modal remains the only ClassicModal using the bottom sheet variant', () => {
  assert.match(dialogs, /function ClassicModal\(\{ title, onClose, children, compact = false, bottomSheet = false, flushBottom = false, badgeIcon = "money-add-badge", badgeTone = "expense" \}\)/);
  assert.match(dialogs, /<ClassicModal title="Cash Out" onClose=\{onClose\} compact bottomSheet>/);
  assert.equal((dialogs.match(/\scompact bottomSheet>/g) || []).length, 1);
  assert.match(styles, /@media \(max-width: 768px\) \{\s*body\.expenses-page \.ex-modal--bottom-sheet/);
  assert.match(styles, /body\.expenses-page \.ex-modal--bottom-sheet \{\s*padding: 12px 0 0/);
  assert.match(styles, /\.ex-modal-sheet-handle/);
});

test('the helper text and duplicate selected order summary are gone, keeping removable chips', () => {
  assert.doesNotMatch(dialogs, /Select one or more orders and a date, then add expenses before confirming\./);
  assert.doesNotMatch(dialogs, /selected\.map\(\(item\) => item\.label\)\.join\(", "\)/);
  assert.match(dialogs, /selected\.length === 1 \? "selection" : "selections"/);
  assert.match(dialogs, /expense-orders-picker__chips/);
  assert.match(dialogs, /expense-orders-picker__chip-remove/);
  assert.match(dialogs, /onChange\(selectedIds\.filter\(\(id\) => id !== option\.value\)\)/);
});

test('the Add Expense action shows an add-money icon and confirmation uses green, cancel stays red', () => {
  assert.match(dialogs, /"money-add":/);
  assert.match(dialogs, /className="ex-btn ex-dark ex-btn--block ex-add-money"/);
  assert.match(dialogs, /<ClassicExpenseIcon name="money-add" size=\{23\}\/>/);
  assert.match(dialogs, /className="ex-btn ex-confirm" onClick=\{confirm\}/);
  assert.match(dialogs, /className="ex-btn ex-danger" onClick=\{onClose\} disabled=\{busy\}>Cancel<\/button>/);
  assert.match(styles, /\.ex-modal-box--bottom-sheet \.ex-confirm \{\s*background: #12ad49/);
  assert.match(page, /expenses-classic-inline\.css\?v=v443-unified-expense-forms/);
});

test('multi-order selection and expense drafting remain intact', () => {
  assert.match(dialogs, /function ExpenseOrderMultiSelect/);
  assert.match(dialogs, /selectedOrderIds: isManual \? \[\] : selectedOrders\.flatMap/);
  assert.match(dialogs, /orderKeys: draft\.selectedOrderKeys/);
  assert.match(dialogs, /orderIds: draft\.selectedOrderIds/);
  assert.match(dialogs, /disabled=\{busy \|\| !drafts\.length\}/);
});

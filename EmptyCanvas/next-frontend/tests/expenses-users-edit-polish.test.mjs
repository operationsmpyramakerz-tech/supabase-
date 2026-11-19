import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { expenseDestinationMenuPosition } from '../lib/expense-destination-menu-position.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const editor = read('components/expenses/EditUserExpense.jsx');
const dialogs = read('components/expenses/ExpensesDialogs.jsx');
const css = read('public/css/expenses-users-edit.css');
test('expense selection is a custom portaled list, preserving dirty confirmation and row identity', () => {
  assert.doesNotMatch(editor, /<select[^>]*aria-label="Expense to edit"/);
  assert.match(editor, /<ExpenseToEditSelect rows=\{rows\} value=\{item.id\} disabled=\{busy\}/);
  assert.match(editor, /if \(!dirty \|\| window.confirm\([^)]*\)\) setSelected\(id\)/);
  assert.match(editor, /row.id !== value\) onChange\(row.id\)/);
  assert.match(editor, /createPortal\(<div[^>]*role="listbox"/);
  assert.match(editor, /<button type="button" role="option" aria-selected=\{row.id === value\}/);
  assert.match(editor, /<Editor key=\{item.id\}/);
});
test('picker positioning stays inside narrow visual viewport and opens above if needed', () => {
  const viewport = {left:0, top:0, width:320, height:560};
  for (const top of [60, 420]) {
    const rect = {left:24, width:272, top, bottom:top+60};
    const p = expenseDestinationMenuPosition(rect, viewport, 8);
    assert.ok(p.left >= 10 && p.left+p.width <= 310);
    assert.ok(p.top >= 10 && p.top+p.height <= 550);
    assert.equal(top===60 ? p.top : p.top+p.height, top===60 ? rect.bottom : rect.top);
  }
});
test('funds visuals use existing bundled local images, eager requests and SVG fallback', () => {
  const files = [...dialogs.matchAll(/from "\.\.\/\.\.\/(public\/expense-fund-icons\/[^"\n]+\.png)"/g)].map(m=>m[1]);
  assert.equal(files.length,9);
  for (const file of files) assert.ok(existsSync(new URL(`../${file}`,import.meta.url)), file);
  assert.match(dialogs,/loading="eager" onError=\{\(\) => setFailedAsset\(asset\)\}/);
  assert.match(dialogs,/showAsset \? <img[\s\S]*?: <ClassicExpenseIcon name=\{fundsTypeIcon\(value\)\}/);
  assert.match(editor,/compactFundsCards showSelectedVisual/);
  assert.match(css,/\.funds-select__card-icon > img\s*\{[^}]*display: block !important/);
});
test('only group outline has a dedicated black light-theme border with a contrasting dark-theme border', () => {
  assert.match(css,/--edit-group-line: #151515/);
  assert.match(css,/expense-user-edit-group \{[^}]*border: 1px solid var\(--edit-group-line\)/);
  assert.match(css,/data-theme="dark"[^\n]*--edit-group-line: #e5e7eb/);
  assert.match(css,/\.expense-user-edit \.ex-input \{[^}]*border: 1px solid var\(--edit-line\)/);
  assert.match(read('app/expenses/users/page.jsx'),/expenses-users-edit\.css\?v=2-picker-icons/);
});

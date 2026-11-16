import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialogs = read('../components/expenses/ExpensesDialogs.jsx');
const css = read('../public/css/expenses-classic-inline.css');
const page = read('../app/expenses/page.jsx');

test('the order picker does not automatically summon the Android keyboard on open', () => {
  // Only this picker is under test; autofocus in other dialogs is unrelated.
  const searchRow = dialogs.match(/<div className="expense-orders-menu__search">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(searchRow, 'the search row exists');
  assert.doesNotMatch(searchRow, /\bautoFocus\b/);
  assert.match(searchRow, /type="search"/);
  assert.match(searchRow, /autoComplete="off"/);
  assert.match(searchRow, /autoCorrect="off"/);
  assert.match(searchRow, /autoCapitalize="none"/);
  assert.match(searchRow, /spellCheck=\{false\}/);
  assert.match(searchRow, /enterKeyHint="search"/);
  assert.match(searchRow, /data-1p-ignore="true"/);
  assert.match(searchRow, /data-lpignore="true"/);
  assert.match(searchRow, /value=\{query\}/);
  assert.match(searchRow, /onChange=\{\(event\) => setQuery\(event.target.value\)\}/);
});

test('the input has no orange default focus rectangle or native search adornments', () => {
  assert.match(css, /\.expense-orders-menu__search input:focus-visible\s*\{[^}]*outline: none !important;/);
  assert.match(css, /\.expense-orders-menu__search input:focus-visible\s*\{[^}]*box-shadow: none !important;/);
  assert.match(css, /\.expense-orders-menu__search:focus-within\s*\{[^}]*border-color: #cbd5e1;/);
  assert.match(css, /input::-webkit-search-cancel-button/);
});

test('manual reason and order options use equal-size icons and aligned copy', () => {
  assert.match(dialogs, /className="expense-orders-menu__manual-icon"[^>]*><ClassicExpenseIcon name="edit-3" size=\{19\}\/><\/span>/);
  assert.match(dialogs, /className="expense-orders-menu__manual-copy"/);
  assert.match(dialogs, /className=\{`expense-orders-menu__icon expense-orders-menu__icon--/);
  assert.match(dialogs, /<ExpensePickerTypeIcon name=\{option.icon \|\| "shopping-cart"\} size=\{19\}\/>/);
  assert.match(css, /\.expense-orders-menu__manual-icon\s*\{[^}]*width: 37px;[^}]*height: 37px;/);
  assert.match(css, /\.expense-orders-menu__manual-copy small \{ font-size: 12px;/);
});

test('multi-select and upward opening remain intact and stylesheet cache is updated', () => {
  assert.match(dialogs, /const filtered = options.filter/);
  assert.match(dialogs, /onChange\(existing.includes\(id\)/);
  assert.match(dialogs, /expenseOrderMenuPosition\(rect, viewport, \{ preferAbove \}\)/);
  assert.match(page, /expenses-classic-inline\.css\?v=v439-destination-button-spacing/);
});

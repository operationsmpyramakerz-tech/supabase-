import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../public/css/expenses-classic-inline.css');
const page = read('../app/expenses/page.jsx');
const dialogs = read('../components/expenses/ExpensesDialogs.jsx');

test('Destination and Add Expense have a dedicated 16px vertical gap', () => {
  assert.match(css, /body\.expenses-page \.ex-modal-box--bottom-sheet \.expense-destination-picker \+ \.ex-add-money\s*\{\s*margin-top:\s*16px;/);
  assert.match(dialogs, /<ExpenseDestinationSelect[\s\S]*?\/>\s*<button type="button" className="ex-btn ex-dark ex-btn--block ex-add-money"/);
});

test('The changed CSS URL is cache-busted for the latest spacing', () => {
  assert.match(page, /expenses-classic-inline\.css\?v=v444-expense-ticket-cards/);
});

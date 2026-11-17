import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialogs = read('../components/expenses/ExpensesDialogs.jsx');
const css = read('../public/css/expenses-classic-inline.css');
const page = read('../app/expenses/page.jsx');

const cashIn = dialogs.slice(dialogs.indexOf('function CashInModal('), dialogs.indexOf('function CashOutModal('));
const cashOut = dialogs.slice(dialogs.indexOf('function CashOutModal('), dialogs.indexOf('function SettleModal('));
const settle = dialogs.slice(dialogs.indexOf('function SettleModal('), dialogs.indexOf('function ExportModal('));
const orderPicker = dialogs.slice(dialogs.indexOf('function ExpenseOrderMultiSelect('), dialogs.indexOf('function ClassicFileField('));

// Tests target the actual JSX/CSS wiring; they are not screenshots or live server tests.
test('Cash Out is renamed and both Cash Out steps keep floating centered badges', () => {
  assert.match(cashOut, /<ClassicModal title="Cash Out"[^>]*compact bottomSheet>/);
  assert.match(cashOut, /<ClassicModal title="Add Expense"[^\n]*flushBottom>/);
  assert.match(css, /\.ex-modal-box--bottom-sheet \.ex-modal-sheet-scroll,\s*body\.expenses-page \.ex-modal-box--flush-bottom \.ex-modal-expense-scroll\s*\{\s*padding-top: 50px;/);
  assert.match(css, /\.ex-modal-box--bottom-sheet \.ex-modal-sheet-icon--cash-out\s*\{[\s\S]*?transform: translateX\(-50%\)/);
});

test('Orders/Other reason dropdown has no Done action and still closes normally', () => {
  assert.doesNotMatch(orderPicker, /\bDone<\/button>/);
  assert.doesNotMatch(orderPicker, /expense-orders-menu__footer/);
  assert.match(orderPicker, /onClick=\{\(\) => setOpen\(\(current\) => !current\)\}/);
  assert.match(orderPicker, /if \(event\.key === "Escape"\) setOpen\(false\)/);
  assert.match(orderPicker, /onChange\(existing\.includes\(id\)/);
});

test('Cash Out money input displays EGP as a visual suffix only, preserving numeric payloads', () => {
  assert.match(dialogs, /function ExpenseCurrencyInput\(\{ value, onChange, label \}\)/);
  assert.match(dialogs, /<span className="expense-currency-field__unit" aria-hidden="true">EGP<\/span>/);
  assert.match(cashOut, /<ExpenseCurrencyInput value=\{form\.amount\} onChange=\{update\("amount"\)\}/);
  assert.match(cashOut, /amount: number\(form\.amount\)/);
  assert.match(cashOut, /destinationUserId: draft\.destinationUserId/);
});

test('Screenshots appear as per-image preview cards and can be deleted before saving', () => {
  assert.match(dialogs, /URL\.createObjectURL\(file\)/);
  assert.match(dialogs, /URL\.revokeObjectURL\(item\.url\)/);
  assert.match(dialogs, /className="expense-upload-previews"/);
  assert.match(dialogs, /className="expense-upload-preview__image"/);
  assert.match(dialogs, /className="expense-upload-preview__remove"/);
  assert.match(dialogs, /onClick=\{\(\) => onChange\(files\.filter\(\(_, i\) => i !== index\)\)\}/);
  assert.match(dialogs, /<ClassicFileField\s*files=\{files\}/);
  assert.match(dialogs, /async function filesPayload\(files\)/);
});

test('Added expense cards mirror All Expenses with route, amount and remove, never order numbers', () => {
  const draftView = cashOut.slice(cashOut.indexOf('expense-drafts__list'), cashOut.indexOf('  </ClassicModal>', cashOut.indexOf('expense-drafts__list')));
  assert.match(draftView, /expense-ticket__route-frame expense-draft-card--ticket/);
  assert.match(draftView, /expense-ticket__route-endpoint--from/);
  assert.match(draftView, /expense-ticket__route-endpoint--to/);
  assert.match(draftView, /expense-ticket__route-amount is-negative/);
  assert.match(draftView, /money\(-cost\)/);
  assert.match(draftView, /expense-draft-card__remove/);
  assert.doesNotMatch(draftView, /draft\.reason|draft\.selectedOrderLabel|draft\.fundsType\}<\/div>/);
  assert.match(cashOut, /selectedOrderKeys: isManual \? \[\] : selectedOrders\.map/);
  assert.match(cashOut, /orderKeys: draft\.selectedOrderKeys/);
});

test('Cash In and Settle My Account use the unified bottom sheet with distinctive icons', () => {
  assert.match(cashIn, /title="Add Cash In"[^>]*flushBottom badgeIcon="arrow-down-left" badgeTone="cash-in"/);
  assert.match(settle, /title="Settle my account"[^>]*flushBottom badgeIcon="check-circle" badgeTone="settlement"/);
  assert.match(cashIn, /compactFundsCards/);
  assert.match(settle, /compactFundsCards/);
  assert.match(cashIn, /className="ex-btn ex-dark" onClick=\{submit\}/);
  assert.match(settle, /className="ex-btn ex-dark" onClick=\{submit\}/);
  assert.match(cashIn, /<ClassicFileField files=\{files\} onChange=\{setFiles\} required/);
  assert.match(settle, /<ClassicFileField files=\{files\} onChange=\{setFiles\} required/);
  assert.match(cashIn, /isCash && !text\(form\.receiptNumber\)/);
  assert.match(settle, /isCash && !text\(form\.receiptNumber\)/);
  assert.match(settle, /await requestExpenseMutation\("settle"/);
  assert.match(cashIn, /await requestExpenseMutation\("cash-in"/);
});

test('Only frontend assets change; CSS is updated and cache-busted', () => {
  assert.match(page, /expenses-classic-inline\.css\?v=v444-expense-ticket-cards/);
  assert.match(css, /V443 — Unified expenses bottom sheets/);
  assert.match(css, /\.ex-modal-expense-icon--cash-in\s*\{ background: #16a34a/);
  assert.match(css, /\.ex-modal-expense-icon--settlement\s*\{ background: #111827/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const dialogs = read('../components/expenses/ExpensesDialogs.jsx');
const css = read('../public/css/expenses-classic-inline.css');
const page = read('../app/expenses/page.jsx');

test('both Cash Out sheet titles are centered below their existing floating icons', () => {
  assert.match(dialogs, /<ClassicModal title="Cash Out"[^>]*bottomSheet>/);
  assert.match(dialogs, /<ClassicModal title="Add Expense"[^\n]*flushBottom>/);
  assert.match(css, /\.ex-modal-box--bottom-sheet \.ex-modal-title,\s*body\.expenses-page \.ex-modal-box--flush-bottom \.ex-modal-title\s*\{[^}]*text-align:\s*center;/s);
  assert.match(css, /\.ex-modal-box--bottom-sheet \.ex-modal-sheet-icon--cash-out\s*\{[^}]*top:\s*-28px;/s);
  assert.match(css, /\.ex-modal-box--flush-bottom \.ex-modal-expense-icon\s*\{[^}]*top:\s*-28px;/s);
});

test('compact Funds Type options use one horizontal card row with actual brand icons and a radio', () => {
  assert.match(dialogs, /className=\{`order-select__dropdown funds-select__menu/);
  assert.match(dialogs, /compactFundsCards \? "funds-select__card funds-select__card--compact"/);
  assert.match(dialogs, /<FundsCardVisual value=\{option.value\}\/>/);
  assert.match(dialogs, /funds-select__radio/);
  assert.match(css, /\.funds-select__menu--compact \.funds-select__card--compact\s*\{[^}]*flex-direction:\s*row !important;/s);
  assert.match(css, /\.funds-select__menu--compact \.funds-select__cards\s*\{[^}]*overflow-y:\s*auto;/s);
});

test('the menu opens near its trigger with measured list height, not an oversized empty popup', () => {
  assert.match(dialogs, /Math\.min\(418, 72 \+ normalized\.length/);
  assert.match(dialogs, /rect\.bottom \+ gap/);
  assert.match(dialogs, /rect\.top - gap - maxHeight/);
});

test('existing receipt conditions and selectable values remain unchanged', () => {
  assert.match(dialogs, /const SCREENSHOT_REQUIRED_KEYS = new Set/);
  assert.match(dialogs, /const screenshotRequired = SCREENSHOT_REQUIRED_KEYS\.has\(typeKey\(form\.fundsType\)\)/);
  assert.match(dialogs, /onChange\(option\.value\); setOpen\(false\);/);
  assert.match(page, /expenses-classic-inline\.css\?v=v445-all-expenses-destination/);
});

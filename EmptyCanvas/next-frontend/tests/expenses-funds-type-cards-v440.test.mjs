import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const dialogs = read('../components/expenses/ExpensesDialogs.jsx');
const css = read('../public/css/expenses-classic-inline.css');
const page = read('../app/expenses/page.jsx');

test('both Cash Out sheet titles are centered below their existing floating icons', () => {
  assert.match(dialogs, /<ClassicModal title="Choose Order"[^>]*bottomSheet>/);
  assert.match(dialogs, /<ClassicModal title="Add Expense"[^\n]*flushBottom>/);
  assert.match(css, /\.ex-modal-box--bottom-sheet \.ex-modal-title,\s*body\.expenses-page \.ex-modal-box--flush-bottom \.ex-modal-title\s*\{[^}]*text-align:\s*center;/s);
  assert.match(css, /\.ex-modal-box--bottom-sheet \.ex-modal-sheet-icon--cash-out\s*\{[^}]*top:\s*-28px;/s);
  assert.match(css, /\.ex-modal-box--flush-bottom \.ex-modal-expense-icon\s*\{[^}]*top:\s*-28px;/s);
});

test('Funds Type options are independent cards with icons, text and screenshot status', () => {
  assert.match(dialogs, /className="order-select__dropdown funds-select__menu"/);
  assert.match(dialogs, /className="order-select__options funds-select__cards"/);
  assert.match(dialogs, /className=\{`order-select__option funds-select__card/);
  assert.match(dialogs, /className="funds-select__card-icon"/);
  assert.match(dialogs, /name=\{fundsTypeIcon\(option\.value\)\}/);
  assert.match(dialogs, /className=\{`funds-select__badge funds-select__badge--/);
  assert.match(css, /\.funds-select__card\s*\{[^}]*border:\s*1px solid/);
  assert.match(css, /\.funds-select__cards\s*\{[^}]*overflow-y:\s*auto;/s);
});

test('the menu opens near its trigger with measured list height, not an oversized empty popup', () => {
  assert.match(dialogs, /const idealHeight = Math\.min\(344, normalized\.length/);
  assert.match(dialogs, /rect\.bottom \+ gap/);
  assert.match(dialogs, /rect\.top - gap - maxHeight/);
});

test('existing receipt conditions and selectable values remain unchanged', () => {
  assert.match(dialogs, /const SCREENSHOT_REQUIRED_KEYS = new Set/);
  assert.match(dialogs, /const screenshotRequired = SCREENSHOT_REQUIRED_KEYS\.has\(typeKey\(form\.fundsType\)\)/);
  assert.match(dialogs, /onChange\(option\.value\); setOpen\(false\);/);
  assert.match(page, /expenses-classic-inline\.css\?v=v440-titles-funds-cards/);
});

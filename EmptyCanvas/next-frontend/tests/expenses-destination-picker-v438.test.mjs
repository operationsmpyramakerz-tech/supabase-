import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expenseDestinationMenuPosition } from '../lib/expense-destination-menu-position.mjs';

const get = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const dialogs = get('../components/expenses/ExpensesDialogs.jsx');
const css = get('../public/css/expenses-classic-inline.css');
const page = get('../app/expenses/page.jsx');

const picker = dialogs.slice(dialogs.indexOf('function ExpenseDestinationSelect('), dialogs.indexOf('// Multi-order picker is intentionally'));

test('Destination uses its own searchable card picker, not generic ClassicSelect', () => {
  const start = dialogs.indexOf('<ClassicFieldLabel icon="user">Destination');
  const end = dialogs.indexOf('      <button type="button" className="ex-btn ex-dark ex-btn--block ex-add-money"', start);
  const segment = dialogs.slice(start, end);
  assert.ok(start > -1);
  assert.match(segment, /<ExpenseDestinationSelect\s+value=\{destinationUserId\}\s+onChange=\{setDestinationUserId\}\s+options=\{destinationOptions\}/);
  assert.doesNotMatch(segment, /<ClassicSelect/);
  assert.match(dialogs, /destinationUserId: draft\.destinationUserId/);
});

test('search stays at top, filters name and department, and avoids keyboard autofocus', () => {
  assert.match(picker, /className="expense-destination-menu__search"/);
  assert.match(picker, /type="search"/);
  assert.match(picker, /placeholder="Search by name or department\.\.\."/);
  assert.match(picker, /\[option\.label, option\.note\]/);
  assert.doesNotMatch(picker, /\bautoFocus\b/);
  assert.match(picker, /className="expense-destination-menu__list"/);
  assert.ok(picker.indexOf('expense-destination-menu__search') < picker.indexOf('expense-destination-menu__list'));
  assert.match(picker, /className="expense-destination-menu__person"[^>]*><ClassicExpenseIcon name="user" size=\{19\}/);
  assert.match(picker, /className="expense-destination-menu__copy"/);
  assert.match(picker, /onClick=\{\(\) => choose\(option\.value\)\}/);
  assert.match(picker, /document\.body/);
  assert.match(css, /\.expense-destination-menu__card/);
  assert.match(css, /\.expense-destination-menu__person/);
  assert.match(page, /expenses-classic-inline\.css\?v=v445-all-expenses-destination/);
});

test('menu opens directly against the field upper edge when phone has little room below', () => {
  const rect = { left: 32, top: 1010, bottom: 1080, width: 350 };
  const vp = { top: 0, left: 0, width: 414, height: 1120 };
  const result = expenseDestinationMenuPosition(rect, vp, 30);
  assert.equal(result.position, 'fixed');
  assert.equal(result.top + result.height, rect.top);
  assert.equal(result.width, rect.width);
  assert.ok(result.top >= 10);
});

test('menu opens directly against field lower edge when room below is sufficient', () => {
  const rect = { left: 40, top: 100, bottom: 164, width: 320 };
  const vp = { top: 0, left: 0, width: 400, height: 850 };
  const result = expenseDestinationMenuPosition(rect, vp, 50);
  assert.equal(result.top, rect.bottom);
  assert.ok(result.height <= 410);
  assert.ok(result.left >= 10);
  assert.ok(result.left + result.width <= 390);
});

test('menu keeps within the available visual viewport and reacts to keyboard resizing', () => {
  const rect = { left: 5, top: 385, bottom: 443, width: 345 };
  const vp = { left: 0, top: 20, width: 320, height: 470 };
  const result = expenseDestinationMenuPosition(rect, vp, 12);
  assert.ok(result.left >= 10);
  assert.ok(result.left + result.width <= 310);
  assert.ok(result.top >= 30);
  assert.ok(result.top + result.height <= 490);
  assert.match(picker, /window\.visualViewport\?\.addEventListener\("resize", position\)/);
  assert.match(picker, /window\.addEventListener\("scroll", position, true\)/);
});

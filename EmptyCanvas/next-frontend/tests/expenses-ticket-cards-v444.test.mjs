import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const dialogs = read('../components/expenses/ExpensesDialogs.jsx');
const client = read('../components/expenses/ExpensesClient.jsx');
const css = read('../public/css/expenses-classic-inline.css');
const draft = dialogs.slice(dialogs.indexOf('className="expense-drafts__list"'), dialogs.indexOf('function SettleModal('));
const upload = dialogs.slice(dialogs.indexOf('function ClassicFileField('), dialogs.indexOf('function ExpenseCurrencyInput('));
const rules = css.slice(css.indexOf('/* V444'));

test('drafts reuse the All Expenses card classes, preserving type, route and signed cost', () => {
  for (const name of ['route-frame','route-shot','shot-btn','route-body','route-top','route-title','route-amount','route-sub','route-endpoint--from','route-endpoint--to','route-arrow']) {
    assert.ok(client.includes(`expense-ticket__${name}`));
    assert.ok(draft.includes(`expense-ticket__${name}`));
  }
  assert.match(draft, /ownCarCostForKilometers\(draft\.kilometer, ownCarRate\)/);
  assert.match(draft, /money\(-cost\)/);
  assert.doesNotMatch(draft, /draft\.reason|draft\.selectedOrderLabel|draft\.selectedOrderKeys/);
});

test('draft screenshot button opens existing viewer and is disabled without photos; X removes only that draft', () => {
  assert.match(draft, /const shots = screenshotsFor\(draft\)/);
  assert.match(draft, /disabled=\{busy \|\| !shots\.length\}/);
  assert.match(draft, /setDraftScreenshotId\(draft\.id\)/);
  assert.match(draft, /<ScreenshotModal transaction=\{draftScreenshot\}/);
  assert.match(draft, /current\.filter\(\(item\) => item\.id !== draft\.id\)/);
});

test('both remove buttons are square, padding-free, centered and have a non-shrinking visible X', () => {
  assert.match(upload, /className="expense-upload-preview__remove"[^\n]*name="x" size=\{16\}/);
  assert.match(draft, /className="expense-draft-card__remove"[^\n]*name="x" size=\{16\}/);
  assert.match(rules, /\.expense-upload-preview > button\.expense-upload-preview__remove,\s*body\.expenses-page \.expense-draft-card--ticket > button\.expense-draft-card__remove \{[^}]*align-items: center;[^}]*justify-content: center;[^}]*width: 30px;[^}]*height: 30px;[^}]*padding: 0;/);
  assert.match(rules, /\.expense-draft-card__remove > svg \{[^}]*width: 16px;[^}]*height: 16px;[^}]*flex: 0 0 16px;[^}]*stroke: currentColor;/);
  assert.match(rules, /grid-template-columns: auto minmax\(0, 1fr\) 30px;/);
  assert.match(upload, /onChange\(files\.filter\(\(_, i\) => i !== index\)\)/);
});

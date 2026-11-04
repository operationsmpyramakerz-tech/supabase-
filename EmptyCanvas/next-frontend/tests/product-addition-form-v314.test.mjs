import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { validateProductAddition } from '../lib/product-addition-request-payload.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const form = read('../components/orders/ProductAdditionForm.jsx');
const css = read('../public/css/product-additions.css');

test('Other is an action in both catalog dropdowns and stores a typed value, not the label', () => {
  assert.match(form, /AdditionSelect label="Unit of Measurement"/);
  assert.match(form, /AdditionSelect label="Tag"/);
  assert.match(form, /const showOther = "other"\.includes/);
  assert.match(form, /const selectOther = \(\) => \{ setCustomMode\(true\); onChange\(""\);/);
  assert.match(form, /addition-select__custom/);
  assert.match(form, /onChange=\{event => onChange\(event\.target\.value\)\}/);
  const product = { name: 'New part', idCode: '', unitPrice: 20, quantity: 1,
    unit: 'Tray of 10', tag: 'Special test materials',
    url: 'https://example.com/part', imageUrl: 'https://example.com/part.jpg' };
  const saved = validateProductAddition(product);
  assert.equal(saved.unit, 'Tray of 10');
  assert.equal(saved.tag, 'Special test materials');
});

test('generic Unit entry is excluded from units while real units remain selectable', () => {
  assert.match(form, /normalized !== "other"/);
  assert.match(form, /name === "unit" && normalized === "unit"/);
  assert.match(form, /selectCatalogOption\(option\)/);
});

test('mobile footer leaves safe space from browser navigation bar and scrolls content separately', () => {
  assert.match(css, /\.addition-dialog-overlay\{padding:38px 10px calc\(34px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
  assert.match(css, /max-height:calc\(100dvh - 86px/);
  assert.match(css, /\.addition-dialog__body\{[\s\S]*?overflow-y:auto/);
});

test('black raised icon has no external light border and price has no inner focus ring', () => {
  assert.match(css, /\/\* v314/);
  const overrides = css.split('/* v314')[1];
  assert.match(overrides, /\.addition-dialog__icon\{\s*border:0;/);
  assert.match(overrides, /inset 0 -5px 8px/);
  assert.match(overrides, /\.addition-field__price input:focus/);
  assert.match(overrides, /box-shadow:none !important/);
});

test('new CSS version used consistently by cart and review pages', () => {
  assert.match(read('../components/orders/ShoppingCartPageServer.jsx'), /product-additions\.css\?v=v314/);
  assert.match(read('../app/products/addition-requests/page.jsx'), /product-additions\.css\?v=v314/);
});

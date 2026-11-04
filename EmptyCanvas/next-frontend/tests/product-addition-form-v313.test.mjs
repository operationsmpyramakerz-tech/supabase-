import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { validateProductAddition } from '../lib/product-addition-request-payload.mjs';

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const valid = {
  name: 'Custom adapter', idCode: '', unitPrice: 0, quantity: 2,
  unit: 'Piece', tag: '1/ Electric components',
  url: 'https://example.org/adapter', imageUrl: 'https://example.org/adapter.webp',
};

test('all new product request fields are mandatory except ID Code', () => {
  assert.equal(validateProductAddition(valid).idCode, '');
  assert.equal(validateProductAddition(valid).unitPrice, 0);
  for (const [field, pattern] of [
    ['name', /Product Name/], ['unitPrice', /Unit Price/],
    ['unit', /Unit of Measurement/], ['tag', /Tag/],
    ['url', /Product URL/], ['imageUrl', /Product Image/],
    ['quantity', /Qty/],
  ]) {
    const invalid = { ...valid, [field]: '' };
    assert.throws(() => validateProductAddition(invalid), pattern, `${field} must not be optional`);
  }
});

test('validates new product request URLs and price and quantity ranges', () => {
  assert.throws(() => validateProductAddition({ ...valid, unitPrice: -1 }), /Unit Price/);
  assert.throws(() => validateProductAddition({ ...valid, quantity: -1 }), /Qty/);
  assert.throws(() => validateProductAddition({ ...valid, url: 'ftp://site.com/file' }), /HTTP/);
  assert.throws(() => validateProductAddition({ ...valid, imageUrl: 'http://example.org/a.jpg' }), /HTTPS/);
});

test('Add New dialog mirrors Select Component, and catalog options do not use free text', () => {
  const form = read('../components/orders/ProductAdditionForm.jsx');
  const style = read('../public/css/product-additions.css');
  const cart = read('../components/orders/ShoppingCartClient.jsx');
  const server = read('../lib/shopping-cart-data.js');
  const page = read('../components/orders/ShoppingCartPageServer.jsx');
  assert.match(form, /addition-dialog__icon[\s\S]*?name="plus"/);
  assert.match(form, /addition-dialog__footer/);
  assert.match(form, /AdditionSelect label="Tag"/);
  assert.match(form, /AdditionSelect label="Unit of Measurement"/);
  assert.doesNotMatch(form, /<datalist/);
  assert.match(form, /uploadPreparedProductImage/);
  assert.match(form, /addition-image-upload__preview/);
  assert.match(style, /\.addition-select__search/);
  assert.match(style, /\.addition-image-upload\.is-dragging/);
  assert.match(server, /getProductsCatalog\(/);
  assert.match(server, /tagsCatalog: catalog\.tagsCatalog/);
  assert.match(page, /initialTags=\{initial\.tagsCatalog\}/);
  assert.match(page, /initialUnits=\{initial\.unitsCatalog\}/);
  assert.match(cart, /units=\{units\}/);
  assert.match(cart, /tags=\{tags\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const cart = read('components/orders/ShoppingCartClient.jsx');
const controls = read('components/orders/ShoppingCartMetaControls.jsx');
const css = read('public/css/product-additions.css');

test('Select Component label is shown for both empty and populated carts', () => {
  assert.match(cart, /<strong>Select Component<\/strong>/);
  assert.match(cart, /<span>Select Component<\/span>/);
  assert.match(cart, /className="classic-cart-add-new-copy"/);
  assert.match(cart, /<strong>Add New<\/strong>/);
});

test('empty cart container sizes to its buttons without impacting filled carts', () => {
  assert.match(cart, /classic-cart-grid\$\{!cart\.length && !loadingDraft \? " is-empty" : ""\}/);
  assert.match(css, /\.classic-cart-grid\.is-empty \.classic-cart-card\{[\s\S]*?width:fit-content;[\s\S]*?min-height:0;/);
  assert.match(css, /\.classic-cart-grid\.is-empty \.classic-cart-empty\{[\s\S]*?min-height:0;/);
  assert.match(css, /\.classic-cart-grid\.is-empty \.classic-cart-empty-actions/);
});

test('priority selection uses custom dropdown, not native select', () => {
  assert.match(cart, /<ShoppingCartPrioritySelect value=\{priorityLevel\} onChange=\{updatePriority\}\/>/);
  assert.match(controls, /aria-haspopup="listbox"/);
  assert.match(controls, /role="option" aria-selected/);
  assert.match(controls, /onChange\?\.\(priority\)/);
  assert.doesNotMatch(cart, /<select value=\{priorityLevel\}/);
});

test('date picker supports valid ISO dates, month navigation, today, clear, and close', () => {
  assert.match(cart, /<ShoppingCartDeliveryDate value=\{requestedDeliveryDate\} onChange=\{updateDeliveryDate\}\/>/);
  assert.match(controls, /aria-haspopup="dialog"/);
  assert.match(controls, /shiftMonth\(-1\)/);
  assert.match(controls, /shiftMonth\(1\)/);
  assert.match(controls, /choose\(null\)/);
  assert.match(controls, /choose\(new Date\(\)\)/);
  assert.match(controls, /onChange\?\.\(date \? isoDate\(date\) : ""\)/);
  assert.match(controls, /event\.key === "Escape"/);
  assert.doesNotMatch(cart, /<input type="date"/);
});

test('CSS version bump ensures modern controls load on the order page', () => {
  const page = read('components/orders/ShoppingCartPageServer.jsx');
  assert.match(page, /product-additions\.css\?v=v310/);
  assert.match(css, /\.classic-cart-meta-popover\{/);
  assert.match(css, /\.classic-cart-date-grid\{/);
});

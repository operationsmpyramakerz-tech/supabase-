import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { isCustomCartItem, validateProductAddition } from '../lib/product-addition-request-payload.mjs';
import { assertShoppingCartSources } from '../lib/shopping-cart-source-policy.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const custom = { id: 'new:123e4567-e89b-42d3-a456-426614174000', customProduct: { name: 'Demo sensor', quantity: 2 } };

test('validates new component fields, pricing, qty, links and identifier', () => {
  assert.equal(isCustomCartItem(custom), true);
  assert.equal(isCustomCartItem({ ...custom, id: '1' }), false);
  const required = { name: ' Demo sensor ', unitPrice: '25.50', quantity: '1.005', unit: 'Piece', url: 'https://example.org/item', tag: 'Electronic components', imageUrl: 'https://example.org/product.webp' };
  const result = validateProductAddition(required);
  assert.equal(result.name, 'Demo sensor');
  assert.equal(result.unitPrice, 25.5);
  assert.equal(result.quantity, 1.005);
  for (const [data, pattern] of [
    [{ ...required, quantity: 0 }, /Qty/],
    [{ ...required, quantity: -2 }, /Qty/],
    [{ ...required, name: '' }, /Name/],
    [{ ...required, url: 'javascript:alert(1)' }, /HTTP/],
    [{ ...required, imageUrl: 'data:image/png;base64,test' }, /HTTPS/],
    [{ ...required, unitPrice: -1 }, /Unit Price/],
  ]) assert.throws(() => validateProductAddition(data), pattern);
});

test('shopping source permission forbids new items for kit-only users and other order types', async () => {
  const p = [{ ...custom, kitSourceIds: [] }];
  await assert.rejects(assertShoppingCartSources({ orderType: 'Request Products', products: p, allowComponents: false, allowKits: true }), { status: 403 });
  await assert.rejects(assertShoppingCartSources({ orderType: 'Withdraw Products', products: p, allowComponents: true, allowKits: true }), { status: 403 });
  await assertShoppingCartSources({ orderType: 'Request Products', products: p, allowComponents: true, allowKits: false });
});

test('request items are added to an order, but Products creation is reserved for review', () => {
  const checkout = read('../lib/shopping-cart-order-service.js');
  const requestService = read('../lib/product-addition-requests-service.js');
  const cart = read('../components/orders/ShoppingCartClient.jsx');
  const ui = read('../components/products/ProductAdditionReviewClient.jsx');
  const api = read('../app/api/products/addition-requests/route.js');
  const sql = read('../sql/2026-11-04-product-addition-requests-v308.sql');
  assert.match(cart, /<strong>Select Component<\/strong>/);
  assert.match(cart, /<strong>Add New<\/strong>/);
  assert.match(cart, /customProduct: item\.customProduct/);
  assert.match(checkout, /await ensureProductAdditionRequestsTable\(\)/);
  assert.match(checkout, /await createProductAdditionRequests\(cleanProducts, created, account, orderNumber\)/);
  assert.ok(checkout.indexOf('created = await insertMany(orderTable(), rows)') < checkout.indexOf('await createProductAdditionRequests(cleanProducts, created, account, orderNumber)'));
  assert.match(requestService, /product = await createProduct\(/);
  assert.match(requestService, /status: "approved"/);
  assert.match(requestService, /status: "processing"/);
  assert.match(requestService, /async function patchPending/);
  assert.match(api, /"products.create"/);
  assert.match(ui, /Add to Products/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});

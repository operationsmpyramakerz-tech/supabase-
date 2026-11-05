import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cartProductResource } from '../lib/shopping-cart-product-resource.mjs';

const cart = fs.readFileSync(new URL('../components/orders/ShoppingCartClient.jsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/api/products/files-download/route.js', import.meta.url), 'utf8');
const file = (name) => ({ name, url: `https://files.example.test/${name}`, size: 1024 });

test('Shopping Cart preserves all product attachments from Supabase catalog', () => {
  assert.match(cart, /attachments: Array\.isArray\(product\?\.attachments\)/);
  assert.match(cart, /import \{ cartProductResource \} from/);
  assert.match(cart, /<CartProductResourceLink product=\{product\}\/>/g);
  assert.equal((cart.match(/<CartProductResourceLink product=\{product\}\/>/g) || []).length, 2);
});

test('multi-file product uses the same archive endpoint as Kits, with encoded product id', () => {
  assert.deepEqual(cartProductResource({ id: 'Ninja OTTO /#', url: 'https://shop.example.test/', attachments: [file('leg.stl'), file('arm.lbrn2')] }), {
    href: '/next/api/products/files-download?id=Ninja%20OTTO%20%2F%23', isZip: true, fileCount: 2,
  });
});

test('one file opens its file, and an external URL still opens without uploaded files', () => {
  assert.deepEqual(cartProductResource({ id: 'p1', url: 'https://store.example.test', attachments: [file('body.stl')] }), {
    href: file('body.stl').url, isZip: false, fileCount: 1,
  });
  assert.deepEqual(cartProductResource({ id: 'p1', url: 'https://store.example.test', attachments: [] }), {
    href: 'https://store.example.test', isZip: false, fileCount: 0,
  });
  assert.equal(cartProductResource({ id: 'p1' }).href, '');
});

test('the button displays a download icon and a descriptive ZIP title only for multi-file products', () => {
  assert.match(cart, /resource\.isZip \? "download" : "external-link"/);
  assert.match(cart, /Download ZIP \(\$\{resource\.fileCount\} files\)/);
  assert.match(cart, /target=\{resource\.isZip \? undefined : "_blank"\}/);
});

test('Kits and component-enabled Shopping Cart both have a server-side permission gate', () => {
  assert.match(route, /getDirectAccountGate\(\["Kits", "Proposals", "Products"\]\)/);
  assert.match(route, /getDirectAccountGate\(\["Create New Order"\]\)/);
  assert.match(route, /featureAllowed\(kitsGate\.account, "kits\.view"\)/);
  assert.match(route, /featureAllowed\(shoppingGate\.account, "orders\.shopping\.view"\)/);
  assert.match(route, /shoppingSourceAllowed\(shoppingGate\.account, "components"\)/);
  assert.match(route, /getProduct\(productId\)/);
});

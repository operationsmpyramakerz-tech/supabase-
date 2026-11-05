import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cartProductResource } from '../lib/shopping-cart-product-resource.mjs';

const proposals = fs.readFileSync(new URL('../components/proposals/ProposalsClient.jsx', import.meta.url), 'utf8');
const kits = fs.readFileSync(new URL('../components/kits/KitsClient.jsx', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../app/api/products/files-download/route.js', import.meta.url), 'utf8');
const file = (name) => ({ name, url: `https://storage.example.test/${name}`, size: 1234 });

test('Proposals retains all catalog attachments (not the old first URL) for each card', () => {
  assert.match(proposals, /attachments: Array\.isArray\(product\?\.attachments\)/);
  assert.match(proposals, /product\.attachments\.filter\(/);
  assert.match(proposals, /const product = productMap\.get\(item\.productId\)/);
  assert.match(proposals, /const resource = cartProductResource\(row\.product\)/);
  assert.match(proposals, /\{resource\.isZip \? `Download ZIP \(\$\{resource\.fileCount\} files\)` : "Open link"\}/);
  assert.match(kits, /\/next\/api\/products\/files-download\?id=/);
});

test('two or more uploaded files download as a single ZIP through the existing Kits endpoint', () => {
  assert.deepEqual(cartProductResource({ id: 'Robot / 21', attachments: [file('body.stl'), file('config.lbrn2')] }), {
    href: '/next/api/products/files-download?id=Robot%20%2F%2021',
    isZip: true,
    fileCount: 2,
  });
  assert.match(proposals, /target=\{resource\.isZip \? undefined : "_blank"\}/);
  assert.match(proposals, /<ProposalIcon name=\{resource\.isZip \? "download" : "externalLink"\}/);
});

test('single uploaded file or legacy URL keeps normal Open link behavior', () => {
  assert.deepEqual(cartProductResource({ id: 'a', url: 'https://shop.example.test', attachments: [file('one.pdf')] }), {
    href: file('one.pdf').url, isZip: false, fileCount: 1,
  });
  assert.deepEqual(cartProductResource({ id: 'a', url: 'https://shop.example.test', attachments: [] }), {
    href: 'https://shop.example.test', isZip: false, fileCount: 0,
  });
  assert.equal(cartProductResource({ id: 'a' }).href, '');
});

test('ZIP endpoint checks proposals.view on the server as well as kits.view and shopping permissions', () => {
  assert.match(route, /featureAllowed\(kitsGate\.account, "kits\.view"\)/);
  assert.match(route, /featureAllowed\(kitsGate\.account, "proposals\.view"\)/);
  assert.match(route, /featureAllowed\(shoppingGate\.account, "orders\.shopping\.view"\)/);
  assert.match(route, /shoppingSourceAllowed\(shoppingGate\.account, "components"\)/);
  assert.match(route, /getProduct\(productId\)/);
});

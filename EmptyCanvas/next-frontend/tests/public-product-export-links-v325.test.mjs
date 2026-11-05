import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProductFileShareToken, verifyProductFileShareToken } from '../lib/product-file-public-share.mjs';
import { exportProductResourceUrl } from '../lib/export-product-resource.mjs';

const secret = 'this-is-a-test-only-long-random-seeming-secret-2026';
const origin = 'https://operation.propyramakerz.com';
const attachment = (name, suffix, size = 42) => ({
  name, size, url: `https://storage.example.test/storage/v1/object/public/Data/products/files/${suffix}`,
});
const product = {
  id: 'Ninja/OTTO 9',
  name: 'Ninja OTTO',
  url: 'https://supplier.example.test/manual',
  attachments: [attachment('piece 1.stl', '1.stl'), attachment('piece 2.lbrn2', '2.lbrn2')],
};
const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('exported multi-file ZIP links are absolute and usable anonymously with the correct signed capability', () => {
  const url = new URL(exportProductResourceUrl(product, { origin, shareSecret: secret }));
  assert.equal(url.origin, origin);
  assert.equal(url.pathname, '/next/api/products/files-download');
  assert.equal(url.searchParams.get('id'), product.id);
  assert.equal(verifyProductFileShareToken(product, url.searchParams.get('share'), { secret }), true);
  assert.equal(url.searchParams.get('share'), createProductFileShareToken(product, { secret }));
  assert.equal(exportProductResourceUrl(product, { origin, shareSecret: secret }), url.toString());
});

test('a share link cannot be retargeted to another product or changed attachments', () => {
  const token = createProductFileShareToken(product, { secret });
  assert.equal(verifyProductFileShareToken({ ...product, id: 'someone-else' }, token, { secret }), false);
  assert.equal(verifyProductFileShareToken({ ...product, attachments: [...product.attachments, attachment('another.stl', '3.stl')] }, token, { secret }), false);
  assert.equal(verifyProductFileShareToken({ ...product, attachments: [product.attachments[0], { ...product.attachments[1], size: 43 }] }, token, { secret }), false);
  assert.equal(verifyProductFileShareToken({ ...product, attachments: [product.attachments[0], { ...product.attachments[1], url: 'https://else.example.test' }] }, token, { secret }), false);
  assert.equal(verifyProductFileShareToken({ ...product, attachments: [product.attachments[0]] }, token, { secret }), false);
  assert.equal(verifyProductFileShareToken(product, token.slice(0, -1) + (token.at(-1) === 'X' ? 'Y' : 'X'), { secret }), false);
  assert.equal(verifyProductFileShareToken(product, 'invalid', { secret }), false);
  assert.equal(verifyProductFileShareToken(product, token, { secret: 'different-test-only-long-secret-987654' }), false);
});

test('never sign publicly shareable links with missing or short secrets', () => {
  assert.throws(() => createProductFileShareToken(product, { secret: '1234' }), /at least 32 characters/);
  assert.throws(() => createProductFileShareToken(product, { secret: '' }), /at least 32 characters/);
});

test('legacy one-file and external URLs stay direct; shared ZIP is for multiple files only', () => {
  const one = { ...product, attachments: [product.attachments[0]] };
  assert.equal(exportProductResourceUrl(one, { origin, shareSecret: secret }), product.attachments[0].url);
  const external = { ...product, attachments: [] };
  assert.equal(exportProductResourceUrl(external, { origin, shareSecret: secret }), product.url);
});

test('download endpoint permits anonymous requests only with a verified signature; legacy UI downloads still check permissions', () => {
  const route = source('../app/api/products/files-download/route.js');
  assert.match(route, /const hasPublicShare = params\.has\("share"\)/);
  assert.match(route, /if \(!hasPublicShare\) \{/);
  assert.match(route, /getDirectAccountGate\(\["Kits", "Proposals", "Products"\]\)/);
  assert.match(route, /verifyProductFileShareToken\(product, shareToken\)/);
  assert.match(route, /status: 403/);
  assert.match(route, /archiveEntries\(product\.attachments/);
  assert.doesNotMatch(route, /if \(hasPublicShare\)\s*return.*download/i);
});

test('all Excel/PDF exports reuse the shared signed link helper', () => {
  const proposal = source('../lib/proposal-kit-export-service.js');
  const order = source('../lib/order-export-service.js');
  const shared = source('../lib/export-product-resource.mjs');
  assert.match(proposal, /exportProductResourceUrl\(product/);
  assert.match(order, /exportProductResourceUrl\(product/);
  assert.match(shared, /url\.searchParams\.set\("share", createProductFileShareToken\(product/);
});

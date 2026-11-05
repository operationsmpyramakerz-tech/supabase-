import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exportDocumentOrigin, exportProductResourceUrl } from '../lib/export-product-resource.mjs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const file = (name) => ({ name, url: `https://supabase.example.test/storage/v1/object/public/Data/products/files/${name}`, size: 1024 });
const origin = 'https://operation.propyramakerz.com';

test('multiple uploaded attachments use an absolute authenticated ZIP link suitable for Excel/PDF', () => {
  const product = { id: 'Robot 42/ش', name: 'Robot', url: file('first.stl').url, attachments: [file('first.stl'), file('second.lbrn2')] };
  assert.equal(exportProductResourceUrl(product, { origin }), `${origin}/next/api/products/files-download?id=Robot%2042%2F%D8%B4`);
});

test('one uploaded attachment keeps its original file URL; no files keeps legacy link', () => {
  const direct = file('manual.pdf').url;
  assert.equal(exportProductResourceUrl({ id: 'a', url: 'https://shop.example.test', attachments: [file('manual.pdf')] }, { origin }), direct);
  assert.equal(exportProductResourceUrl({ id: 'a', url: 'https://shop.example.test' }, { origin }), 'https://shop.example.test');
  assert.equal(exportProductResourceUrl(null, { origin, fallbackUrl: 'https://legacy.example.test' }), 'https://legacy.example.test');
});

test('a broken or missing public origin is rejected for a ZIP link, not exported as a broken relative URL', () => {
  const product = { id: '99', attachments: [file('x.zip'), file('y.stl')] };
  assert.throws(() => exportProductResourceUrl(product, { origin: '' }), /public ERP URL/);
  assert.throws(() => exportDocumentOrigin({ url: 'javascript:alert(1)' }), /public ERP URL/);
  assert.equal(exportDocumentOrigin({ url: `${origin}/next/api/products/export-direct?kind=excel` }), origin);
  assert.equal(exportDocumentOrigin({ url: 'http://localhost:3001/next/api/foo' }, origin), origin);
});

test('Kits, Proposals and combined Proposals render both PDF and Excel hyperlinks from the same resolved row URL', () => {
  const exporter = source('../lib/proposal-kit-export-service.js');
  assert.match(exporter, /url: exportProductResourceUrl\(product,/);
  assert.match(exporter, /rowFromItem\(item, products\.get\(text\(item\?\.productId\)\) \|\| \{\}, \{ kitScope:/);
  assert.match(exporter, /const base = rowFromItem\(item, product, \{ publicOrigin \}\)/);
  assert.match(exporter, /opts\.link = link/);  // PDF clickable component
  assert.match(exporter, /hyperlink: normalizeUrlForPdf\(item\.url\)/); // Excel clickable component
  assert.match(source('../app/api/products/export-direct/route.js'), /publicOrigin: exportDocumentOrigin\(request,/);
});

test('Order exports from Shopping Cart resolve product ZIP links in PDF/Excel; links remain permission-checked', () => {
  const exporter = source('../lib/order-export-service.js');
  assert.match(exporter, /link: exportProductResourceUrl\(product, \{ origin: publicOrigin/);
  assert.match(exporter, /const product = productMaps\.byId\.get\(text\(item\?\.productId\)\)/);
  assert.match(exporter, /publicOrigin = "",/);
  assert.match(exporter, /hyperlink: text\(item\.link\)/); // Excel
  assert.match(source('../lib/deliveryReceiptPdf.js'), /opts\.link = componentLink/); // PDF
  assert.match(source('../app/api/orders/export-direct/route.js'), /publicOrigin: exportDocumentOrigin\(request,/);
  const zipRoute = source('../app/api/products/files-download/route.js');
  assert.match(zipRoute, /featureAllowed\(kitsGate\.account, "kits\.view"\)/);
  assert.match(zipRoute, /featureAllowed\(kitsGate\.account, "proposals\.view"\)/);
  assert.match(zipRoute, /featureAllowed\(shoppingGate\.account, "orders\.shopping\.view"\)/);
  assert.match(zipRoute, /featureAllowed\(ordersGate\.account, "orders\.my\.export"\)/);
  assert.match(zipRoute, /featureAllowed\(ordersGate\.account, "orders\.operations\.export"\)/);
  assert.match(zipRoute, /archiveEntries\(product\.attachments,/);
});

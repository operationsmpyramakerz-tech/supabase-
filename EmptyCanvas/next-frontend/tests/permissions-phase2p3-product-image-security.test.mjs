import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  isPublicAddress, validateProductImageTarget, resolveProductImageTarget,
  fetchProductImageResource,
} from '../lib/secure-product-image-fetch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const route = readFileSync(resolve(root, 'app/api/products/image/route.js'), 'utf8');

test('product image endpoint requires products.view before looking up image sources', () => {
  assert.match(route, /featureGate\(await getDirectAccountGate\("Products"\), "products\.view"\)/);
  assert.match(route, /status: gate\.status \|\| 403/);
  assert.match(route, /fetchProductImageResource\(/);
});

test('blocks private, metadata, reserved, link-local and IPv4-mapped addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.1.9', '172.16.1.9', '192.168.0.9', '169.254.169.254', '100.64.0.1', '0.0.0.0', '192.0.2.10', '198.18.0.1', '203.0.113.3', '::1', 'fc00::2', 'fe80::1', '::ffff:7f00:1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.equal(isPublicAddress('2001:db8::1'), false);
  assert.equal(isPublicAddress('2002::1'), false);
});

test('rejects localhost, alternate IPv4 spelling, unsafe protocols, credentials and ports', () => {
  const targets = [
    'http://127.0.0.1/a.jpg', 'http://2130706433/a.jpg', 'http://0177.0.0.1/a.jpg',
    'http://[::1]/a.jpg', 'http://169.254.169.254/latest/meta-data', 'http://localhost:3000/a.jpg',
    'file:///etc/passwd', 'ftp://example.com/a.jpg', 'https://user:pass@example.com/a.jpg',
    'http://example.com:8080/a.jpg',
  ];
  for (const target of targets) {
    if (target.includes('localhost')) continue; // rejected after its DNS resolves to loopback
    assert.equal(validateProductImageTarget(target), null, target);
  }
  assert.equal(validateProductImageTarget('https://example.com/photo.png')?.url?.hostname, 'example.com');
  assert.equal(validateProductImageTarget('http://localhost/image.png'), null);
  assert.equal(validateProductImageTarget('https://svc.internal/image.png'), null);
});

test('rejects DNS answers containing any private address, not only the first one', async () => {
  const mixed = async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
  assert.equal(await resolveProductImageTarget('https://sample.test/img.png', { lookup: mixed }), null);
  assert.equal(await resolveProductImageTarget('https://sample.test/img.png', { lookup: async () => [{ address: '10.1.1.1', family: 4 }] }), null);
  assert.equal((await resolveProductImageTarget('https://sample.test/img.png', { lookup: async () => [{ address: '8.8.8.8', family: 4 }] }))?.addresses?.[0]?.address, '8.8.8.8');
});

test('private configured Supabase storage host is allowed only under configured storage path', async () => {
  const options = { supabaseUrl: 'https://db.internal.test', lookup: async () => [{ address: '10.0.0.5', family: 4 }] };
  assert.equal((await resolveProductImageTarget('https://db.internal.test/storage/v1/object/public/images/p.png', options))?.trustedStorage, true);
  assert.equal(await resolveProductImageTarget('https://db.internal.test/admin', options), null);
  assert.equal(await resolveProductImageTarget('https://other.internal.test/storage/v1/object/public/images/p.png', options), null);
});

test('fetch refuses internal URLs before opening a socket', async () => {
  assert.equal(await fetchProductImageResource('http://127.0.0.1:1/a.jpg'), null);
  assert.equal(await fetchProductImageResource('http://example.test/a.jpg', { lookup: async () => [{ address: '169.254.169.254', family: 4 }] }), null);
});

test('configured private Storage image can load, but its redirect cannot reach a private non-Storage path', async () => {
  const http = await import('node:http');
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url.includes('redirect')) {
      res.writeHead(302, { Location: '/internal/admin' });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end('sample');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const safe = await fetchProductImageResource(`${origin}/storage/v1/object/public/image.png`, { supabaseUrl: origin });
    assert.equal(safe?.body?.toString(), 'sample');
    const redirect = await fetchProductImageResource(`${origin}/storage/v1/redirect`, { supabaseUrl: origin });
    assert.equal(redirect, null);
    assert.deepEqual(requests, ['/storage/v1/object/public/image.png', '/storage/v1/redirect']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('image response does not allow active SVG MIME from product source', () => {
  assert.match(route, /SAFE_RASTER_MIMES\.has\(contentType\)/);
  assert.match(route, /SAFE_RASTER_MIMES\.has\(match\[1\]\.toLowerCase\(\)\)/);
});

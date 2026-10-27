import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStrictImageDataUrl } from '../lib/strict-upload-image.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');
const encode = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const WEBP = Buffer.from('5249464614000000574542505650382008000000', 'hex');

function isolate(sourceFile, start, end, args) {
  const text = source(sourceFile);
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Could not isolate ${start}`);
  return new Function(...Object.keys(args), `${text.slice(from, to)}; return ${start.split('(')[0].replace(/^(?:async )?function /, '')};`)(...Object.values(args));
}

test('receipt parser accepts standard raster image types and rejects SVG/fake/mismatched content', () => {
  for (const [mime, bytes] of [['image/png', PNG], ['image/jpeg', JPEG], ['image/webp', WEBP]]) {
    const result = parseStrictImageDataUrl(encode(mime, bytes), { label: 'Receipt image' });
    assert.equal(result.mime, mime);
    assert.deepEqual(result.buffer, bytes);
  }
  assert.throws(() => parseStrictImageDataUrl(encode('image/svg+xml', '<svg onload="alert(1)"/>')), /Invalid image data/i);
  assert.throws(() => parseStrictImageDataUrl(encode('image/jpeg', '<html>not a photo</html>')), /not a valid/i);
  assert.throws(() => parseStrictImageDataUrl(encode('image/png', JPEG)), /not a valid/i);
  assert.throws(() => parseStrictImageDataUrl(encode('image/png', PNG) + '!!!'), /Invalid image data/i);
  assert.throws(() => parseStrictImageDataUrl('data:image/png;base64,' + 'A'.repeat(15_000_000), { maxBytes: 8 * 1024 * 1024 }), /8 MB or less/i);
});

test('Proposals receipt route validates image content before storage and derives extension from MIME', () => {
  const route = source('app/api/products/proposals/receipt-upload/route.js');
  const parserCall = route.indexOf('parseStrictImageDataUrl(body.dataUrl');
  const uploadCall = route.indexOf('await uploadStorageObject(');
  assert.ok(parserCall > 0 && parserCall < uploadCall);
  assert.match(route, /const extension = mime === "image\/png" \? "png" : mime === "image\/webp" \? "webp" : "jpg"/);
  assert.doesNotMatch(route, /mime\.startsWith\("image\/"\)/);
  assert.match(route, /upsert: false/);
  assert.match(route, /"proposals\.receipt_upload"/);
  assert.match(route, /"kits\.send_stock"/);
});

test('Operations Orders reject fake receipt content and derive object extension from validated bytes', () => {
  const fn = isolate('lib/operations-orders-data.js', 'function opsReceiptUploadInput(', 'function opsReceiptStoragePath(', {
    text: (value) => String(value || '').trim(),
    parseStrictImageDataUrl,
    directOperationsMutationError: (message, status) => Object.assign(new Error(message), { status }),
  });
  assert.throws(() => fn([encode('image/svg+xml', '<svg/>')], ['unsafe.svg']), /Invalid image data/i);
  assert.throws(() => fn([encode('image/png', JPEG)], ['receipt.png']), /not a valid/i);
  const valid = fn([encode('image/jpeg', JPEG)], ['malicious.svg']);
  assert.equal(valid[0].contentType, 'image/jpeg');
  assert.equal(valid[0].safeExt, 'jpg');
  assert.deepEqual(valid[0].buffer, JPEG);
});

test('Expenses receipts validate bytes, use safe extension, and refuse overwrites', async () => {
  const uploads = [];
  const fn = isolate('lib/expenses-data.js', 'async function uploadExpenseDataUrl(', 'async function buildExpenseScreenshotText(', {
    parseStrictImageDataUrl,
    cleanStorageObjectPath: (value) => String(value),
    uploadStorageObject: async (path, bytes, options) => { uploads.push({ path, bytes, options }); return { publicUrl: 'https://example.test/receipt' }; },
    expenseError: (message, status) => Object.assign(new Error(message), { status }),
  });
  await assert.rejects(fn(encode('image/png', '<html/>'), 'trick.png'), /not a valid/i);
  assert.equal(uploads.length, 0);
  await fn(encode('image/webp', WEBP), 'bad.svg');
  assert.equal(uploads.length, 1);
  assert.ok(uploads[0].path.endsWith('.webp'));
  assert.equal(uploads[0].options.contentType, 'image/webp');
  assert.equal(uploads[0].options.upsert, false);
});

test('Legacy product inline images and new direct upload tickets enforce raster formats', () => {
  const file = source('lib/products-service.js');
  assert.match(file, /parseStrictImageDataUrl\(dataUrl/);
  assert.match(file, /label: "Product image", maxBytes: 10 \* 1024 \* 1024/);
  assert.match(file, /storageObjectName\(`\$\{basename\}\.\$\{extension\}`\)/);
  assert.match(file, /const ticket = await createSignedUploadUrl\(storageObjectName\(`\$\{basename\}\.\$\{extension\}`\)/);
  assert.match(file, /\/\^image\\\/\(png\|jpe\?g\|webp\)\$\/i/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const dialog = read('components/products/ProductsDialogs.jsx');
const css = read('public/css/products.css');
const service = read('lib/products-service.js');
const productsPage = read('app/products/page.jsx');

// Run the actual file ticket validation in isolation, without hitting Production.
const snippet = service.slice(
  service.indexOf('const MAX_PRODUCT_FILE_BYTES ='),
  service.indexOf('export function serializeProduct('),
).replace('export async function createProductFileUploadTicket', 'async function createProductFileUploadTicket');
const context = {
  text: v => String(v ?? '').trim(),
  getSupabaseConfig: () => ({ url: 'https://erp.example' }),
  getProductsStorageBucket: () => 'Data',
  createSignedUploadUrl: async (path) => ({ signedUrl: 'https://erp.example/signed', publicUrl: `https://erp.example/storage/v1/object/public/Data/${path}` }),
  crypto,
  URL,
};
const { createProductFileUploadTicket, normalizedProductAttachments } = vm.runInNewContext(
  `${snippet}\n({createProductFileUploadTicket,normalizedProductAttachments})`, context,
);

test('Upload API accepts arbitrary extensions, including .lbrn2 and unknown formats', async () => {
  for (const filename of ['laser.rc.lbrn2', 'model.blend', 'drawing.dwg', 'component.unknownxyz', 'noextension', 'webpage.html', 'archive.7z']) {
    const upload = await createProductFileUploadTicket({ filename, mime: 'application/octet-stream', size: 1234 });
    assert.match(upload.publicUrl, /\/products\/files\//);
    const attachments = normalizedProductAttachments([{ name: filename, size: 1234, type: 'application/octet-stream', url: upload.publicUrl }], { strict: true });
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].name, filename);
  }
});

test('Upload API retains file limits, checks name and does not relax URL origin', async () => {
  await assert.rejects(createProductFileUploadTicket({ filename: 'oversize.anything', size: 10 * 1024 * 1024 + 1 }), /10 MB/);
  await assert.rejects(createProductFileUploadTicket({ filename: 'bad.anything', size: 0 }), /10 MB/);
  await assert.rejects(createProductFileUploadTicket({ filename: '..', size: 1 }), /filename/);
  assert.throws(() => normalizedProductAttachments([{ name: 'bad.exe', size: 10, url: 'https://external.example/file.exe' }], { strict: true }), /invalid/);
  assert.throws(() => normalizedProductAttachments(new Array(11).fill({ name: 'file.xyz', size: 1, url: 'https://erp.example/storage/v1/object/public/Data/products/files/file' }), { strict: true }), /up to 10/);
});

test('Client no longer filters extensions, retains size/count guard and stores downloads as octet-stream', () => {
  assert.doesNotMatch(dialog, /allowedResourceExt|Unsupported file type/);
  assert.match(dialog, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(dialog, /attachments\.length \+ pendingFiles\.length \+ selected\.length > 10/);
  assert.match(dialog, /application\/octet-stream/);
  assert.match(dialog, /new File\(\[file\]/);
  assert.match(dialog, /type="file" multiple/);
});

test('File actions have symmetric aligned layout and cached stylesheet version changes', () => {
  assert.equal((dialog.match(/className="products-resource-file__actions"/g) || []).length, 2);
  assert.match(css, /\.products-resource-file__actions\{display:flex;align-items:center/);
  assert.match(css, /\.products-resource-file__actions>button svg\{display:block/);
  assert.match(css, /\.products-resource-file__actions>button\{[^}]*justify-content:center/);
  assert.match(productsPage, /products-files-v320/);
});

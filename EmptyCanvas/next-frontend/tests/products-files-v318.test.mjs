import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const dialog = read('components/products/ProductsDialogs.jsx');
const client = read('components/products/ProductsClient.jsx');
const service = read('lib/products-service.js');
const upload = read('app/api/products/file-upload/route.js');
const css = read('public/css/products.css');
const migration = read('sql/2026-11-05-products-attachments-v318.sql');

test('Product dialog offers either a URL or multiple uploaded files', () => {
  assert.match(dialog, /Product URL \/ Files/);
  assert.match(dialog, /sourceMode === "url"/);
  assert.match(dialog, /sourceMode === "files"/);
  assert.match(dialog, /type="file" multiple/);
  assert.match(dialog, /onDragOver=\{/);
  assert.match(dialog, /onDrop=\{/);
});

test('Upload list matches reference with upload area, file rows and actions', () => {
  assert.match(dialog, /Drag &amp; Drop or click to choose files/);
  assert.match(dialog, /products-resource-dropzone__plus/);
  assert.match(dialog, /products-resource-file__details/);
  assert.match(dialog, /name="download"/);
  assert.match(dialog, /name="trash"/);
  assert.match(dialog, /Remove all uploaded files/);
});

test('File uploads use signed storage URLs and preserve attachment metadata', () => {
  assert.match(dialog, /\/next\/api\/products\/file-upload/);
  assert.match(dialog, /upload\.signedUrl/);
  assert.match(dialog, /savedAttachments\.push\(uploaded\)/);
  assert.match(dialog, /attachments: sourceMode === "files" \? savedAttachments : \[\]/);
  assert.match(dialog, /url: sourceMode === "url"/);
  assert.match(service, /const PRODUCT_LIST_SELECT = .*attachments/);
  assert.match(service, /out\.attachments = normalizedProductAttachments\(body\.attachments, \{ strict: true \}\)/);
});

test('Attachment upload route enforces Products create/edit feature access', () => {
  assert.match(upload, /getDirectAccountGate\("Products"\)/);
  assert.match(upload, /featureGate\(gate, "products\.create"\)/);
  assert.match(upload, /featureGate\(gate, "products\.edit"\)/);
  assert.match(upload, /createProductFileUploadTicket/);
});

test('Server validates file size, count and storage origin without a file-extension whitelist', () => {
  assert.match(service, /MAX_PRODUCT_FILE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(service, /MAX_PRODUCT_FILES = 10/);
  assert.doesNotMatch(service, /PRODUCT_FILE_EXTENSIONS/);
  assert.match(service, /A valid product filename is required/);
  assert.match(service, /parsed\.origin !== origin\.origin/);
  assert.match(service, /products\/files\//);
  assert.match(service, /crypto\.randomBytes\(12\)/);
});

test('Files are available again from catalog and product cards without replacing old URLs', () => {
  assert.match(client, /attachments: Array\.isArray\(product\?\.attachments\)/);
  assert.match(client, /<ProductFilesViewer product=/);
  assert.match(client, /onFiles=\{\(item\)/);
  assert.match(service, /\|\| attachments\[0\]\?\.url/);
});

test('Product image upload icon is white and unchanged product-image upload flow remains', () => {
  assert.match(css, /\.products-field \.products-upload-field__icon\{color:#fff!important\}/);
  assert.match(css, /\.products-field \.products-upload-field__icon svg\{color:#fff!important;stroke:#fff!important/);
  assert.match(dialog, /uploadPreparedProductImage/);
});

test('Migration adds dedicated JSONB attachments while keeping URL intact', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.doesNotMatch(migration, /\bUPDATE\s+products\b/i);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN)\b/i);
  assert.match(css, /\.products-resource-uploader/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDirectAttachmentDataUrl } from '../lib/direct-attachment-upload-policy.mjs';
import { escapeBackupCsvCell } from '../lib/backup-csv-security.mjs';
import { fetchProductImageResource } from '../lib/secure-product-image-fetch.mjs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Phase 2Q3C: Task Management upload decoder enforces real size before decoding', () => {
  const good = Buffer.from('hello world');
  const result = parseDirectAttachmentDataUrl(`data:text/plain;base64,${good.toString('base64')}`, { maxBytes: 11 });
  assert.deepEqual(result.bytes, good);
  assert.equal(result.contentType, 'text/plain');
  assert.throws(() => parseDirectAttachmentDataUrl(`data:application/pdf;base64,${good.toString('base64')}`, { maxBytes: 10 }), { status: 413 });
  assert.throws(() => parseDirectAttachmentDataUrl('data:application/pdf;base64,' + 'A'.repeat(400), { maxBytes: 10 }), { status: 413 });
  assert.throws(() => parseDirectAttachmentDataUrl('data:application/pdf;base64,', { maxBytes: 100 }), { status: 400 });
  assert.throws(() => parseDirectAttachmentDataUrl('data:application/pdf;base64,YWJj??==', { maxBytes: 100 }), { status: 400 });
  assert.throws(() => parseDirectAttachmentDataUrl('data:application/pdf;base64,YWJj\n', { maxBytes: 100 }), { status: 400 });
  assert.throws(() => parseDirectAttachmentDataUrl('data:image/png;base64,YWJj', { maxBytes: 100, mimeHint: 'image/png\r\nx-evil: yes' }), { status: 400 });
  assert.throws(() => parseDirectAttachmentDataUrl('data:text/html,abc', { maxBytes: 100 }), { status: 400 });
});

test('Phase 2Q3C: exact file boundary is accepted and decoded length matches', () => {
  const buf = Buffer.from('0123456789');
  const url = `data:application/octet-stream;base64,${buf.toString('base64')}`;
  assert.deepEqual(parseDirectAttachmentDataUrl(url, { maxBytes: 10 }).bytes, buf);
  assert.throws(() => parseDirectAttachmentDataUrl(url, { maxBytes: 9 }), { status: 413 });
});

test('Phase 2Q3C: Task route performs the guarded parser before calling Storage', () => {
  const route = source('../app/api/task-management/upload-direct/route.js');
  assert.match(route, /parseDirectAttachmentDataUrl\(dataUrl,/);
  assert.ok(route.indexOf('parseDirectAttachmentDataUrl(dataUrl') < route.indexOf('await uploadStorageObject('));
  assert.doesNotMatch(route, /Buffer\.from\(match\[2\], "base64"\)/);
});

test('Phase 2Q3C: Backup CSV escapes formulas even after whitespace and control characters', () => {
  for (const value of ['=cmd()', ' +1+1', '\t=HYPERLINK("https://evil")', '\r\n@SUM(A1)', '\uFEFF-1']) {
    const escaped = escapeBackupCsvCell(value);
    assert.ok(escaped.startsWith("'") || escaped.startsWith("\"'"), JSON.stringify(value));
  }
  assert.equal(escapeBackupCsvCell('ordinary'), 'ordinary');
  assert.equal(escapeBackupCsvCell('two,"fields'), '"two,""fields"');
  assert.equal(escapeBackupCsvCell({ a: '=1' }), '"{""a"":""=1""}"');
  assert.equal(escapeBackupCsvCell(null), '');
  const backend = source('../lib/backup-direct.js');
  assert.match(backend, /escapeBackupCsvCell\(value\)/);
  assert.match(backend, /columns\.map\(csvCell\)/);
});

test('Phase 2Q3C: Product image requests never forward server credentials, including on trusted Storage origin', async () => {
  const http = await import('node:http');
  const headers = [];
  const server = http.createServer((req, res) => {
    headers.push(req.headers);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end('image');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const result = await fetchProductImageResource(`${origin}/storage/v1/object/public/img.png`, {
      supabaseUrl: origin,
      headers: { Authorization: 'Bearer SERVICE_ROLE', apikey: 'SERVICE_ROLE', Cookie: 'secret=1', 'X-Test': 'public-image' },
    });
    assert.equal(result?.status, 200);
    assert.equal(headers.length, 1);
    assert.equal(headers[0].authorization, undefined);
    assert.equal(headers[0].apikey, undefined);
    assert.equal(headers[0].cookie, undefined);
    assert.equal(headers[0]['x-test'], 'public-image');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  const route = source('../app/api/products/image/route.js');
  assert.doesNotMatch(route, /Authorization: `Bearer \$\{key\}`|apikey: key/);
});

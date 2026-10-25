import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { issueAccountImageTicket, verifyAccountImageTicket, rasterExtension, validateRasterBytes } from '../lib/account-image-ticket.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = path => readFileSync(resolve(root, path), 'utf8');
const image = { memberId: 'member-17', kind: 'profile', path: 'team-members/profile-pictures/member-17/abc.webp', mime: 'image/webp', size: 284 };

function withSecret(fn) {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-only-unguessable-server-signing-key';
  try { return fn(); } finally { if (previous === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previous; }
}

test('profile upload ticket binds owner, kind, object path, type, size and expires', () => withSecret(() => {
  const now = 1_800_000_000_000;
  const ticket = issueAccountImageTicket(image, now);
  assert.equal(verifyAccountImageTicket(ticket, image, now + 50_000).mime, 'image/webp');
  for (const change of [{ memberId: 'member-18' }, { path: image.path + 'extra' }, { kind: 'cover' }])
    assert.throws(() => verifyAccountImageTicket(ticket, { ...image, ...change }, now + 100), /not valid/i);
  assert.throws(() => verifyAccountImageTicket(ticket, image, now + 601_000), /expired/i);
  const tampered = `${ticket.slice(0, 10)}x${ticket.slice(11)}`;
  assert.throws(() => verifyAccountImageTicket(tampered, image, now + 100), /signature/i);
  assert.throws(() => verifyAccountImageTicket('arbitrary.path', image), /signature/i);
}));

test('profile upload ticket refuses SVG, oversized and forged issue requests', () => withSecret(() => {
  for (const patch of [{ mime: 'image/svg+xml' }, { size: 15 * 1024 * 1024 }, { size: -1 }, { path: 'team-members/profile-pictures/member-18/abc.webp' }])
    assert.throws(() => issueAccountImageTicket({ ...image, ...patch }), /Invalid image upload details/i);
  assert.equal(rasterExtension('image/png'), 'png');
  assert.equal(rasterExtension('image/jpeg'), 'jpg');
  assert.equal(rasterExtension('image/svg+xml'), '');
}));

test('profile image raster signatures reject HTML and wrong MIME', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const jpg = Buffer.from('ffd8ffe00010', 'hex');
  const webp = Buffer.from('524946460000000057454250', 'hex');
  assert.equal(validateRasterBytes(png, 'image/png'), true);
  assert.equal(validateRasterBytes(jpg, 'image/jpeg'), true);
  assert.equal(validateRasterBytes(webp, 'image/webp'), true);
  assert.throws(() => validateRasterBytes(Buffer.from('<html>hi</html>'), 'image/png'), /not a valid/i);
  assert.throws(() => validateRasterBytes(jpg, 'image/png'), /not a valid/i);
});

test('profile image finalization verifies signed ticket and the actual uploaded bytes before writing member row', () => {
  const backend = source('lib/account-direct.js');
  const frontend = source('components/account/AccountDialogs.jsx');
  const route = source('app/api/account/image-direct/route.js');
  assert.match(frontend, /uploadRef:\s*ticket\.uploadRef/);
  assert.match(backend, /issueAccountImageTicket\(/);
  assert.match(backend, /verifyAccountImageTicket\(input\?\.uploadRef/);
  assert.match(backend, /await verifyUploadedAccountRaster\(path, ticket\)/);
  assert.ok(backend.indexOf('await verifyUploadedAccountRaster(path, ticket)') < backend.indexOf('const updated = await updateById(teamMembersTable(), id, { [key]: publicUrl })'));
  assert.match(backend, /Range:\s*"bytes=0-63"/);
  assert.match(backend, /validateRasterBytes\(prefix, payload\.mime\)/);
  assert.match(route, /finalizeAccountImage\(accountGate\.account, body\)/);
});

test('Users Center admin tokens require server secret, use immutable member ID and never use a public fallback', () => {
  const auth = source('lib/users-center-action-auth.js');
  assert.doesNotMatch(auth, /dev-fallback-secret/);
  assert.match(auth, /return accountMemberId\(account\)/);
  assert.match(auth, /Admin authorization signing is not configured/);
});

test('Users Center direct upload tickets only allow supported kinds, limit profile picture MIME', () => {
  const route = source('app/api/users-center/upload-ticket/route.js');
  assert.match(route, /\["profile-picture", "files-media"\]\.includes\(kind\)/);
  assert.match(route, /"image\/jpeg", "image\/png", "image\/webp"/);
  assert.match(route, /"Content-Type": mime/);
});


test('account finalize validates bytes and exact object size using the storage read URL', async () => {
  const backend = source('lib/account-direct.js');
  const start = backend.indexOf('async function verifyUploadedAccountRaster(');
  const end = backend.indexOf('export async function finalizeAccountImage(', start);
  assert.ok(start >= 0 && end > start);
  const build = new Function('createSignedDownloadUrl', 'fetch', 'httpError', 'validateRasterBytes', 'Buffer',
    `${backend.slice(start, end)}; return verifyUploadedAccountRaster;`);
  const picture = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');
  const payload = { mime: 'image/png', size: picture.length };
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(picture, { status: 206, headers: { 'content-range': `bytes 0-${picture.length - 1}/${picture.length}`, 'content-type': 'image/png' } });
  };
  const run = build(async () => ({ signedUrl: 'https://storage.example/approved-download' }), fakeFetch, (message, status) => Object.assign(new Error(message), {status}), validateRasterBytes, Buffer);
  await run('team-members/profile-pictures/owner/file.png', payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Range, 'bytes=0-63');
  await assert.rejects(run('some/path.png', { ...payload, size: 200 }), /size does not match/i);
  const fakeHtml = async () => new Response(Buffer.from('<html>evil</html>'), { status: 206, headers: { 'content-range': `bytes 0-16/${payload.size}`, 'content-type': 'image/png' } });
  const bad = build(async () => ({ signedUrl: 'https://storage.example/approved-download' }), fakeHtml, (message, status) => Object.assign(new Error(message), {status}), validateRasterBytes, Buffer);
  await assert.rejects(bad('some/path.png', payload), /not a valid/i);
});

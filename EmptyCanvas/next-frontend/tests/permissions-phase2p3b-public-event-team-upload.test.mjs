import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEventTeamIdImage, publicTeamUploadIsWithinLimit, PUBLIC_TEAM_MAX_BODY_BYTES } from '../lib/event-team-public-image-policy.mjs';
import { parseStrictImageDataUrl } from '../lib/strict-upload-image.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');
const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
const webp = Buffer.from('5249464614000000574542505650382008000000', 'hex');

test('legitimate PNG, JPG and WEBP photos pass MIME/magic-byte checks', () => {
  for (const [mime, image] of [['image/png', png], ['image/jpeg', jpeg], ['image/webp', webp]]) {
    const parsed = parseEventTeamIdImage(dataUrl(mime, image));
    assert.equal(parsed.mime, mime);
    assert.deepEqual(parsed.buffer, image);
  }
});

test('rejects unsupported SVG, fake image bytes and MIME/content mismatch', () => {
  assert.throws(() => parseEventTeamIdImage(dataUrl('image/svg+xml', '<svg></svg>')), /invalid image data/i);
  assert.throws(() => parseEventTeamIdImage(dataUrl('image/png', '<html>not image</html>')), /not a valid/i);
  assert.throws(() => parseEventTeamIdImage(dataUrl('image/jpeg', png)), /not a valid/i);
});

test('rejects noncanonical base64 payload and oversized encoded bodies', () => {
  assert.throws(() => parseEventTeamIdImage('data:image/png;base64,!?!!!!'), /invalid image data/i);
  assert.throws(() => parseEventTeamIdImage('data:image/png;base64,' + 'a'.repeat(11_300_001)), /8 MB or less/);
  assert.equal(publicTeamUploadIsWithinLimit('x'.repeat(4_100_000)), true);
  assert.equal(publicTeamUploadIsWithinLimit('x'.repeat(4_100_001)), false);
  assert.ok(PUBLIC_TEAM_MAX_BODY_BYTES > 4_100_000);
});

test('public Event Team API cannot upload images without a registration', () => {
  const route = source('app/api/events/team/public/route.js');
  assert.doesNotMatch(route, /if\s*\(action\s*===\s*["']upload-id["']\)/);
  assert.match(route, /registerPublicEventTeamMember\(/);
  assert.match(route, /readBoundedJson\(request\)/);
  assert.match(route, /reader\.cancel\(\)/);
  assert.match(route, /PUBLIC_TEAM_MAX_BODY_BYTES/);
});

test('signup verifies credentials and duplicate ID before uploading a stored ID photo', () => {
  const auth = source('lib/event-team-public-auth.js');
  const validation = auth.indexOf('const encodedPassword = passwordHash(body?.password)');
  const existing = auth.indexOf('const existing = await accountByNationalId(nationalId)', validation);
  const upload = auth.indexOf('uploaded = await uploadEventTeamIdPhoto(', validation);
  const create = auth.indexOf('member = await createEventTeamMember(', validation);
  assert.ok(validation >= 0 && validation < existing && existing < upload && upload < create);
  assert.match(auth, /PHOTO_URL_NOT_ALLOWED/);
  assert.match(auth, /idPhotoUrl: uploaded\?\.url \|\| ""/);
  assert.match(auth, /deleteStorageObjects\(\[uploaded\.objectPath\]\)/);
});

test('public signup UI prepares photo locally and submits it only with registration', () => {
  const ui = source('components/events/EventTeamPublicPortal.jsx');
  const uploadFunc = ui.slice(ui.indexOf('async function uploadIdPhoto'), ui.indexOf('async function submitSignup'));
  assert.doesNotMatch(uploadFunc, /requestJson\(/);
  assert.match(uploadFunc, /idPhotoDataUrl: prepared\.dataUrl/);
  assert.match(ui, /idPhotoFileName: prepared\.fileName/);
  assert.doesNotMatch(ui, /action: "upload-id"/);
});

test('private Event Team upload still checks feature permissions and returns only a URL', () => {
  const route = source('app/api/events/team/route.js');
  assert.match(route, /"upload-id": "events\.team\.photo_upload"/);
  assert.match(route, /const viewGate = featureGate\(gate, "events\.team\.view"\)/);
  assert.match(route, /url: uploaded\.url/);
  assert.doesNotMatch(route, /\.\.\.uploaded, source: "supabase-next"/);
});

test('Stocktaking receipts reject active SVG and fake image/* content before upload', () => {
  assert.throws(() => parseStrictImageDataUrl(dataUrl('image/svg+xml', '<svg onload=alert(1)>'), { label: 'Receipt image' }), /Invalid image data/);
  assert.throws(() => parseStrictImageDataUrl(dataUrl('image/png', '<html>not a receipt</html>'), { label: 'Receipt image' }), /not a valid/);
  assert.equal(parseStrictImageDataUrl(dataUrl('image/jpeg', jpeg), { label: 'Receipt image' }).mime, 'image/jpeg');
  const route = source('app/api/stock/receipt-upload/route.js');
  assert.match(route, /parseStrictImageDataUrl\(body\.dataUrl/);
});

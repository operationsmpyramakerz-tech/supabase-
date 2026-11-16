import test from 'node:test';
import assert from 'node:assert/strict';
import { redactHistoryPayload } from '../../../lib/history-redaction.mjs';

test('audit detail scrubs credentials in old nested request payloads without corrupting metadata', () => {
  const data = { action: 'update', user: { name: 'Abdullah', password: 'not-for-display', auth: { access_token: 'hidden', refreshToken: 'hidden' } }, cookie: 'secret', request: { Authorization: 'Bearer abcabcabcabcabcabc', orderId: 120 } };
  const out = redactHistoryPayload(data);
  assert.equal(out.action, 'update');
  assert.equal(out.user.name, 'Abdullah');
  assert.equal(out.user.password, '[REDACTED]');
  assert.equal(out.user.auth.access_token, '[REDACTED]');
  assert.equal(out.user.auth.refreshToken, '[REDACTED]');
  assert.equal(out.cookie, '[REDACTED]');
  assert.equal(out.request.Authorization, '[REDACTED]');
  assert.equal(out.request.orderId, 120);
});

test('audit detail masks bearer and JWT-like values nested inside visible strings', () => {
  const result = redactHistoryPayload({ note: 'Auth: Bearer abcdefghijklmnopqr', jwt: 'eyJabcdefghijabcdefghijk.abcabcdef.abcdefghiabc' });
  assert.equal(result.note, 'Auth: Bearer [REDACTED]');
  assert.equal(result.jwt, '[REDACTED JWT]');
});

test('audit detail handles circular objects and caps bulk arrays and fields', () => {
  const circular = { title: 'ok', list: Array.from({ length: 31 }, (_, i) => i) };
  circular.self = circular;
  const result = redactHistoryPayload(circular);
  assert.equal(result.title, 'ok');
  assert.equal(result.list.length, 31);
  assert.equal(result.self, '[CIRCULAR]');
});

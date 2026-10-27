import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionSigningSecret, sessionSigningStatus } from '../lib/session-signing-secret.mjs';
import { deploymentSecurityPreflight } from '../scripts/security-preflight.mjs';

const source = filename => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
const good = { NODE_ENV: 'production', SESSION_SECRET: 'test-only-proper-random-session-secret-123456789',
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
  ERP_ADVANCED_PERMISSIONS_ENABLED: '1', FORCE_SECURE_COOKIE: 'true', STORAGE_LINK_SECRET: 'test-storage-secret' };

test('Phase 2Q1 production never falls back to a globally known session signing secret', () => {
  const missing = sessionSigningStatus({ NODE_ENV: 'production' });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'SESSION_SECRET_MISSING');
  assert.throws(() => sessionSigningSecret({ NODE_ENV: 'production' }), error => error.status === 503 && error.code === 'SESSION_SECRET_MISSING');
  for (const value of ['dev-fallback-secret', 'secret', 'change-me']) {
    assert.equal(sessionSigningStatus({ NODE_ENV: 'production', SESSION_SECRET: value }).ok, false);
    assert.throws(() => sessionSigningSecret({ NODE_ENV: 'production', SESSION_SECRET: value }), /Replace the publicly known/);
  }
  assert.equal(sessionSigningSecret(good), good.SESSION_SECRET);
});

test('Phase 2Q1 local developer fallback is unpredictable but stable per process', () => {
  const env = { NODE_ENV: 'development' };
  assert.equal(sessionSigningStatus(env).ephemeral, true);
  const first = sessionSigningSecret(env);
  assert.ok(first.length >= 32);
  assert.equal(first, sessionSigningSecret(env));
  assert.notEqual(first, 'dev-fallback-secret');
});

test('Phase 2Q1 all four session/action signing paths use the same safe secret', () => {
  for (const filename of ['lib/core-auth.js','lib/direct-session-account.js','lib/events-action-auth.js','lib/shopping-cart-order-service.js']) {
    const code = source(filename);
    assert.match(code, /import\s*\{\s*sessionSigningSecret\s*\}/);
    assert.match(code, /sessionSigningSecret\(\)/);
    assert.doesNotMatch(code, /"dev-fallback-secret"/);
    assert.doesNotMatch(code, /SESSION_SECRET\s*\|\|\s*['"]/);
  }
  const startup = source('server.js');
  assert.ok(startup.indexOf('sessionSigningSecret();') < startup.indexOf('await nextApp.prepare()'));
});

test('Phase 2Q1 preflight fails with unsafe deploy env, never exposes any secret values', () => {
  assert.equal(deploymentSecurityPreflight(good).ok, true);
  const invalid = deploymentSecurityPreflight({ ...good, SESSION_SECRET: '', ERP_STORAGE_TASK_PRIVATE_UPLOADS_ENABLED: '1', ERP_STORAGE_TASK_RECORD_AUTH_ENABLED: '0' });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some(item => item.includes('SESSION_SECRET')));
  assert.ok(invalid.errors.some(item => item.includes('TASK_RECORD_AUTH_ENABLED')));
  assert.ok(!JSON.stringify(invalid).includes(good.UPSTASH_REDIS_REST_TOKEN));
  assert.equal(deploymentSecurityPreflight({ ...good, UPSTASH_REDIS_REST_TOKEN: '' }).ok, false);
  assert.equal(deploymentSecurityPreflight({ ...good, ERP_ADVANCED_PERMISSIONS_ENABLED: '1', SUPABASE_SERVICE_ROLE_KEY: '' }).ok, false);
});

test('Phase 2Q1 protected storage requires a different bucket and record authorization', () => {
  const secure = { ...good, ERP_STORAGE_PRIVATE_BUCKET: 'erp-private-files', ERP_STORAGE_TASK_PRIVATE_UPLOADS_ENABLED: '1', ERP_STORAGE_TASK_RECORD_AUTH_ENABLED: '1' };
  assert.equal(deploymentSecurityPreflight(secure).ok, true);
  assert.equal(deploymentSecurityPreflight({ ...secure, ERP_STORAGE_PRIVATE_BUCKET: 'operations-files' }).ok, false);
  assert.equal(deploymentSecurityPreflight({ ...secure, ERP_STORAGE_PRIVATE_BUCKET: '' }).ok, false);
});

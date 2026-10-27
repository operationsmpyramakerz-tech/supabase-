import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { canClearPerformanceTelemetry } from '../lib/performance-diagnostics-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = path => readFileSync(resolve(root, path), 'utf8');

test('destructive telemetry cleanup requires trusted identity or explicit advanced permission', () => {
  const ordinary = { id: 'u-one', name: 'Reader', featureAccess: { mode: 'enforced' } };
  const allowedKeys = new Set();
  const featureAllowed = (_account, key, options) => allowedKeys.has(key) && options?.legacyAllowed === false;
  assert.equal(canClearPerformanceTelemetry(ordinary, featureAllowed), false);
  allowedKeys.add('backup.delete_all');
  assert.equal(canClearPerformanceTelemetry(ordinary, featureAllowed), true);
  allowedKeys.clear();
  allowedKeys.add('users.feature_access_manage');
  assert.equal(canClearPerformanceTelemetry(ordinary, featureAllowed), true);
  assert.equal(canClearPerformanceTelemetry({ id: 'verified', name: 'Admin' }, () => false), true);
  assert.equal(canClearPerformanceTelemetry(null, featureAllowed), false);
  assert.equal(canClearPerformanceTelemetry(ordinary, null), false);
});

test('performance GET remains accessible to authorized readers but DELETE uses additional guard', () => {
  const src = source('app/api/performance/profile/route.js');
  assert.match(src, /export async function GET\(request\)/);
  assert.match(src, /if \(!canClearPerformanceTelemetry\(gate\.account, featureAllowed\)\)/);
  assert.match(src, /status: 403/);
});

test('unauthenticated liveness APIs do not read or reveal diagnostic configuration', () => {
  const health = source('app/api/health/route.js');
  const retirement = source('app/api/system/retirement-status/route.js');
  assert.match(health, /if \(!details\)/);
  assert.match(health, /getDirectAccountGate\(\[\]\)/);
  assert.match(health, /isTrustedLegacyAdmin\(gate\.account/);
  assert.match(retirement, /searchParams\.get\("details"\) !== "1"/);
  assert.match(retirement, /getDirectAccountGate\(\[\]\)/);
});

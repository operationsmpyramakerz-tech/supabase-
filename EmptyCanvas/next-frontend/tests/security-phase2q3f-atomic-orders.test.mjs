import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildAtomicOrderActionRequest } from '../lib/order-atomic-policy.mjs';
import { deploymentSecurityPreflight } from '../scripts/security-preflight.mjs';

const row = (id, number = 117) => ({
  id, order_number: number, status: 'Shipped', team_member_id: '7',
  quantity_requested: 8, quantity_received_by_operations: 2, quantity_remaining: 6,
});
const file = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('2Q3F: build immutable status, owner, and quantity snapshot for one complete order', () => {
  const request = buildAtomicOrderActionRequest({
    action: 'archive', ids: ['1', '2'], rows: [row(2), row(1)], orderNumber: 117,
  });
  assert.equal(request.p_action, 'archive');
  assert.deepEqual(request.p_ids, ['1', '2']);
  assert.equal(request.p_expected['1'].status, 'Shipped');
  assert.equal(request.p_expected['2'].quantity_remaining, 6);
  assert.equal(request.p_expected['1'].team_member_id, '7');
  assert.equal(Object.keys(request.p_expected).length, 2);
});

test('2Q3F: reject mismatched orders, duplicates, invalid IDs, incomplete snapshots and 1000+ rows', () => {
  const valid = { action: 'delete', ids: ['1', '2'], rows: [row(1), row(2)], orderNumber: 117 };
  const invalid = [
    { ...valid, action: 'edit' },
    { ...valid, ids: ['1', '1'] },
    { ...valid, ids: ['1', 'nope'] },
    { ...valid, ids: ['1'] },
    { ...valid, rows: [row(1), row(3)] },
    { ...valid, rows: [row(1), row(2, 118)] },
    { ...valid, orderNumber: '117;delete' },
    { ...valid, ids: Array.from({ length: 1000 }, (_, i) => String(i + 1)) },
  ];
  for (const value of invalid) assert.throws(() => buildAtomicOrderActionRequest(value));
});

test('2Q3F: DB performs all checks and mutations in the SAME transaction, under a write-conflicting lock', () => {
  const sql = file('../sql/ERP_Phase2Q3F_Atomic_Order_Actions.sql');
  assert.match(sql, /LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp/i);
  assert.match(sql, /LOCK TABLE public\.orders IN SHARE ROW EXCLUSIVE MODE/i);
  assert.match(sql, /v_locked_snapshot IS DISTINCT FROM p_expected/i);
  assert.match(sql, /v_count <> v_requested/i);
  assert.match(sql, /v_affected <> v_requested/i);
  assert.match(sql, /RAISE EXCEPTION/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.erp_atomic_order_action\(text,text\[\],text,jsonb\) FROM PUBLIC/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.erp_atomic_order_action\(text,text\[\],text,jsonb\) FROM anon, authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.erp_atomic_order_action\(text,text\[\],text,jsonb\) TO service_role/i);
  assert.ok(sql.indexOf('LOCK TABLE') < sql.indexOf('SELECT count(*)') && sql.indexOf('SELECT count(*)') < sql.indexOf("IF p_action = 'delete'"));
});

test('2Q3F: shipped verification SQL is read-only and confirms function privileges', () => {
  const sql = file('../sql/ERP_Phase2Q3F_Verify_Installation.sql');
  assert.match(sql, /to_regprocedure\(/i);
  assert.match(sql, /AS secure_search_path/i);
  assert.match(sql, /search_path=pg_catalog,pg_temp/i);
  assert.match(sql, /has_function_privilege\('service_role'/i);
  assert.match(sql, /has_function_privilege\('anon'/i);
  assert.match(sql, /has_function_privilege\('authenticated'/i);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|CREATE)\s+(?:INTO|FROM|TABLE|FUNCTION|ON|ROLE|OR|SCHEMA)\b/i);
});

test('2Q3F: both order APIs use opt-in atomic path and never fall back when it fails', () => {
  for (const modulePath of ['../lib/current-orders-data.js', '../lib/operations-orders-data.js']) {
    const source = file(modulePath);
    assert.match(source, /if \(useAtomicOrderActions\(\)\)/);
    assert.match(source, /await performAtomicOrderAction\(/);
    assert.match(source, /throw direct(?:Current|Operations)MutationError\(error\?\.message/);
  }
  const runner = file('../lib/order-atomic-actions.js');
  assert.match(runner, /ERP_ATOMIC_ORDER_MUTATIONS/);
  assert.match(runner, /String\(tableName \|\| ''\) !== 'orders'/);
  assert.match(runner, /rpc\('erp_atomic_order_action'/);
});

test('2Q3F: security preflight refuses an unsafe or mistyped atomic rollout', () => {
  const env = {
    SESSION_SECRET: 'a-unique-very-long-and-secure-session-signing-value-for-tests',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-credential',
    REDIS_URL: 'redis://127.0.0.1:6379',
    ERP_ATOMIC_ORDER_MUTATIONS: 'enabled',
  };
  const good = deploymentSecurityPreflight(env);
  assert.ok(!good.errors.some(err => /atomic order/i.test(err)));
  const wrongTable = deploymentSecurityPreflight({ ...env, SUPABASE_ORDERS_TABLE: 'my_orders' });
  assert.ok(wrongTable.errors.some(err => /Atomic order/i.test(err)));
  const wrongKey = deploymentSecurityPreflight({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' });
  assert.ok(wrongKey.errors.some(err => /Atomic order/i.test(err)));
  const wrongFlag = deploymentSecurityPreflight({ ...env, ERP_ATOMIC_ORDER_MUTATIONS: 'enable' });
  assert.ok(wrongFlag.errors.some(err => /ERP_ATOMIC_ORDER_MUTATIONS/i.test(err)));
});

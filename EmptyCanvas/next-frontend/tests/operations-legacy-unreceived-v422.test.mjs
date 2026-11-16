import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../2026-11-16-operations-legacy-unreceived-v422.sql', import.meta.url), 'utf8');
const old = readFileSync(new URL('../2026-11-16-operations-remaining-receipts-v421.sql', import.meta.url), 'utf8');

test('V422 replaces the existing server-only V421 RPC instead of creating an incompatible endpoint', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.operations_receive_remaining_v421\(/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.operations_receive_remaining_v421\(jsonb, text, text, text\) FROM PUBLIC/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.operations_receive_remaining_v421\(jsonb, text, text, text\) TO service_role/);
  assert.match(sql, /FOR UPDATE/);
});

test('V422 handles delivered-but-entirely-outstanding legacy lines in place, without creating a second batch', () => {
  assert.match(old, /Previously delivered component % has no received quantity/);
  assert.doesNotMatch(sql, /Previously delivered component % has no received quantity/);
  assert.match(sql, /IF v_received <= 0 THEN[\s\S]*?abs\(v_remaining - v_base\) > 0\.000001/);
  assert.match(sql, /IF v_stock_linked THEN[\s\S]*?RAISE EXCEPTION/);
  assert.match(sql, /UPDATE public\.orders\s+SET status = 'Shipped',[\s\S]*?quantity_received_by_operations = v_now,[\s\S]*?quantity_remaining = v_remaining - v_now,[\s\S]*?WHERE id = v_id;\s*v_count := v_count \+ 1;\s*CONTINUE;/);
  assert.match(sql, /order_receipt = NULL,[\s\S]*?maintenance_receipt = NULL/);
});

test('V422 refuses to re-receive already linked stock, including a zeroed stock row', () => {
  assert.match(sql, /to_regclass\('public\.stocktaking'\)/);
  assert.match(sql, /attname = 'source_order_id'/);
  assert.match(sql, /SELECT EXISTS\s*\(\s*SELECT 1 FROM public\.stocktaking\s+WHERE source_order_id::text = v_id::text\s*\) INTO v_stock_linked/);
  assert.match(sql, /IF v_stock_linked THEN\s*RAISE EXCEPTION/);
  assert.doesNotMatch(sql, /DELETE FROM public\.stocktaking|UPDATE public\.stocktaking|INSERT INTO public\.stocktaking/);
});

test('the normal delivered partial-batch flow remains unchanged', () => {
  for (const expected of [
    "'status', 'Shipped'", "'quantity_received_by_operations', v_now", 'v_new_ids := v_new_ids',
    'quantity_received_by_operations = v_received', 'quantity_remaining = 0',
    "IF v_status IN ('arrived', 'delivered', 'received') THEN",
  ]) assert.ok(sql.includes(expected), `Missing existing flow: ${expected}`);
});

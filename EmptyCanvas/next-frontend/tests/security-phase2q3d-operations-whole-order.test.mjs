import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateWholeOperationsOrder } from '../lib/operations-whole-order-policy.mjs';

const rows = (order, ids) => ids.map(id => ({ id, order_number: order }));
const check = (ids, selected, saved) => validateWholeOperationsOrder(ids, selected, saved);

test('2Q3D: valid complete order is accepted for archive, restore, and delete', () => {
  assert.deepEqual(check(['10', '11'], rows(15, [10, 11]), rows(15, [10, 11])), { ok: true });
});

test('2Q3D: reject incomplete, stale, mixed-order and duplicated selections', () => {
  const good = rows(15, [10, 11]);
  assert.equal(check(['10'], good.slice(0, 1), good).ok, false);
  assert.equal(check(['10', '12'], good, good).ok, false);
  assert.equal(check(['10', '11'], [{ id: 10, order_number: 15 }, { id: 11, order_number: 16 }], good).ok, false);
  assert.equal(check(['10', '10'], good, good).ok, false);
  assert.equal(check(['10', '11'], good, [good[0], good[0]]).ok, false);
  assert.equal(check(['10', '11'], good, rows(16, [10, 11])).ok, false);
  assert.equal(check(['10', '11'], good.slice(0, 1), good).ok, false);
  assert.equal(check([], [], []).ok, false);
});

test('2Q3D: reject results on the PostgREST 1,000-row limit', () => {
  const many = Array.from({ length: 1000 }, (_, i) => String(i+1));
  assert.equal(check(many, rows(15, many), rows(15, many)).ok, false);
  assert.equal(check(['10', '11'], rows(15, [10, 11]), rows(15, many)).ok, false);
});

test('2Q3D: Operations route performs complete-order check before ALL three mutations', () => {
  const source = readFileSync(new URL('../lib/operations-orders-data.js', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('export async function performOperationsProtectedAction'), source.indexOf('function directOperationsCommittedError'));
  const guarded = method.indexOf('validateWholeOperationsOrder(loaded.clean, loaded.rows, allRows)');
  assert.ok(guarded > 0);
  for (const mutation of ['await deleteByIds(tableName(), loaded.clean)', 'await updateByIds(tableName(), loaded.clean, { status: nextStatus })']) {
    assert.ok(method.indexOf(mutation) > guarded, mutation);
  }
  assert.ok(method.includes('["archive", "unarchive", "delete"].includes(cleanAction)'));
  assert.ok(source.includes('if (clean.length > 1000) throw directOperationsMutationError'));
  assert.ok(method.includes('changed.length !== loaded.clean.length'));
  assert.ok(method.includes('deleted.length !== loaded.clean.length'));
});

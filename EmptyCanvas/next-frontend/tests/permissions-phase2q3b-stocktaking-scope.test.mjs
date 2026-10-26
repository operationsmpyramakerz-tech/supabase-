import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertSessionColumnOwner, assertWritableSessionColumn, sessionColumnBelongsToOwner } from '../lib/stocktaking-session-access.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('2Q3B permits the inventory and defected sessions generated for the requested folder owner', () => {
  assert.equal(sessionColumnBelongsToOwner('abdullah_el_sayed_inventory_2026_10_26', 'Abdullah El-Sayed', 'inventory'), true);
  assert.equal(sessionColumnBelongsToOwner('abdullah_el_sayed_defected_2026_10_26', 'Abdullah El-Sayed', 'defected'), true);
  assert.equal(sessionColumnBelongsToOwner('abdullah_el_sayed_defecated_2026_10_26', 'Abdullah El-Sayed', 'defected'), true);
  assert.doesNotThrow(() => assertSessionColumnOwner({ ownerName: 'Abdullah El-Sayed', inventoryColumn: 'abdullah_el_sayed_inventory_2026_10_26', defectedColumn: 'abdullah_el_sayed_defected_2026_10_26' }));
  assert.doesNotThrow(() => assertSessionColumnOwner({ ownerName: 'Abdullah El-Sayed' }));
});

test('2Q3B rejects reading / exporting another school or member session even with valid folder access', () => {
  for (const inventoryColumn of ['other_member_inventory_2026_10_26', 'abdullah_el_sayed_defected_2026_10_26', 'abdullah_el_sayed_inventory_2026_02_30', 'abdullah_el_sayed_inventory_2026_10_26_extra']) {
    assert.throws(() => assertSessionColumnOwner({ ownerName: 'Abdullah El-Sayed', inventoryColumn }), { status: 403 });
  }
  assert.throws(() => assertSessionColumnOwner({ ownerName: '', inventoryColumn: 'abdullah_el_sayed_inventory_2026_10_26' }), { status: 403 });
});

test('2Q3B does not permit inventory write to a forged different owner session', () => {
  assert.doesNotThrow(() => assertWritableSessionColumn({ ownerName: 'Ahmed', sessionColumn: 'ahmed_inventory_2026_10_26' }));
  assert.throws(() => assertWritableSessionColumn({ ownerName: 'Ahmed', sessionColumn: 'mona_inventory_2026_10_26' }), { status: 403 });
  assert.throws(() => assertWritableSessionColumn({ ownerName: 'Ahmed', sessionColumn: 'ahmed_done' }), { status: 403 });
});

test('2Q3B validates session ownership before any stock data is projected, and before writes', () => {
  const data = read('lib/stocktaking-data.js');
  const reader = data.slice(data.indexOf('export async function stocktakingForColumn('), data.indexOf('export async function resolveStocktakingQuantityColumnForLabel('));
  assert.ok(reader.indexOf('assertSessionColumnOwner(') < reader.indexOf('  try {'));
  const writer = data.slice(data.indexOf('export async function updateStocktakingInventoryValue('), data.indexOf('function stocktakingPageRow('));
  assert.ok(writer.indexOf('assertWritableSessionColumn(') < writer.indexOf('await updateById('));
  assert.match(read('app/api/stock/export-direct/route.js'), /stocktaking\.export/);
  assert.match(read('app/api/stock/route.js'), /canAccessStocktakingColumn/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { planStocktakingFolderRowDeletion, stocktakingFolderDeletePath } from '../lib/stocktaking-folder-delete.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = (path) => readFileSync(resolve(here, '..', path), 'utf8');

// Real schema: one stock column per order line, with source_order_id storing
// the idempotency link for Send to Stock.
const target = 'sun_of_glory_stock';
const others = ['acic_stock', 'qis_stock', 'liberty_ig_stock'];

test('deletion includes zeroed legacy rows and removes the order marker with the physical row', () => {
  const data = [
    {id: 1140, source_order_id: 6295, [target]: 0, acic_stock: null, qis_stock: null, liberty_ig_stock: null},
    {id: 1141, source_order_id: 6294, [target]: 0, acic_stock: null, qis_stock: null, liberty_ig_stock: null},
    {id: 1150, source_order_id: 7000, [target]: 5, acic_stock: null, qis_stock: null, liberty_ig_stock: null},
    {id: 1200, source_order_id: 8000, [target]: null, acic_stock: 8, qis_stock: null, liberty_ig_stock: null},
  ];
  const result = planStocktakingFolderRowDeletion(data, target, others);
  assert.deepEqual(result, { ids: ['1140','1141','1150'], sharedIds: [] });
});

test('row shared with other schools is not eligible for physical removal', () => {
  const result = planStocktakingFolderRowDeletion([
    { id: '1', [target]: 9, acic_stock: 1, qis_stock: null },
    { id: '2', [target]: 1, acic_stock: null, qis_stock: 0 },
    { id: '3', [target]: 0, acic_stock: null, qis_stock: null },
  ], target, ['acic_stock','qis_stock']);
  assert.deepEqual(result.sharedIds, ['1', '2']);
  assert.deepEqual(result.ids, ['3']);
});

test('DELETE path guards ownership with every other stock column at database time', () => {
  const path = stocktakingFolderDeletePath('stocktaking', [1140, 1141], target, others);
  assert.match(path, /^\/stocktaking\?select=id&id=in\.\(1140%2C1141\)/);
  assert.ok(path.includes('sun_of_glory_stock=not.is.null'));
  assert.ok(path.includes('acic_stock=is.null'));
  assert.ok(path.includes('qis_stock=is.null'));
  assert.ok(path.includes('liberty_ig_stock=is.null'));
});

test('invalid IDs and empty batches are rejected before DELETE', () => {
  assert.throws(() => planStocktakingFolderRowDeletion([{id:null, [target]:0}], target, others));
  assert.throws(() => stocktakingFolderDeletePath('stocktaking', [], target, others));
});

test('production handler performs true DELETE and not a zero-quantity PATCH', () => {
  const impl = source('lib/stocktaking-data.js');
  const handler = impl.slice(impl.indexOf('export async function deleteStocktakingFolder('), impl.indexOf('export async function addStocktakingRow('));
  assert.match(handler, /method: "DELETE"/);
  assert.doesNotMatch(handler, /method: "PATCH"/);
  assert.match(handler, /not\.is\.null/);
  assert.match(handler, /stocktakingOtherOwnerColumns/);
  assert.match(impl, /const ownSessionPrefixes/);
  assert.match(impl, /Removing the row also removes the obsolete source-order marker/);
  assert.match(handler, /stocktakingAccessLevel\(account\) !== "admin"/);
});

test('deletion modal accurately warns users that source order links will be deleted', () => {
  const view = source('components/stocktaking/StocktakingClient.jsx');
  assert.ok(view.includes('including zero-quantity entries and linked order IDs'));
  assert.ok(view.includes('This action cannot be undone'));
});

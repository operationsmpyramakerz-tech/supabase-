import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAllStocktakingPages, STOCKTAKING_PAGE_SIZE } from '../lib/stocktaking-pagination.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function mockPostgrest(rows) {
  const requests = [];
  const fetchPage = async ({ offset, limit }) => {
    requests.push({ offset, limit });
    return rows.slice(offset, offset + Math.min(limit, 1000));
  };
  return { fetchPage, requests };
}

test('Stocktaking reads all 1,350 rows even when PostgREST caps one response at 1,000', async () => {
  const source = Array.from({ length: 1350 }, (_, i) => ({ id: `stock-${i + 1}` }));
  const { fetchPage, requests } = mockPostgrest(source);
  const rows = await readAllStocktakingPages(fetchPage);
  assert.deepEqual(rows, source);
  assert.deepEqual(requests.map((query) => query.offset), [0, 500, 1000]);
  assert.ok(requests.every((query) => query.limit === STOCKTAKING_PAGE_SIZE));
});

test('Stocktaking does not stop at a full-page boundary', async () => {
  const source = Array.from({ length: 1000 }, (_, i) => ({ id: String(i + 1) }));
  const { fetchPage, requests } = mockPostgrest(source);
  assert.deepEqual(await readAllStocktakingPages(fetchPage), source);
  assert.deepEqual(requests.map((query) => query.offset), [0, 500, 1000]);
});

test('167 ACIC stock rows are all returned even if only 56 are in the first 1,000 table rows', async () => {
  const source = Array.from({ length: 1600 }, (_, i) => ({
    id: `stock-${i + 1}`,
    acic_stock: i < 1000 ? (i < 56 ? 1 : 0) : (i < 1111 ? 2 : 0),
  }));
  const { fetchPage } = mockPostgrest(source);
  const rows = await readAllStocktakingPages(fetchPage);
  assert.equal(rows.slice(0, 1000).filter((row) => row.acic_stock !== 0).length, 56);
  assert.equal(rows.filter((row) => row.acic_stock !== 0).length, 167);
});

test('Stocktaking fails rather than silently exporting partial rows if a later page fails', async () => {
  await assert.rejects(readAllStocktakingPages(async ({ offset }) => {
    if (offset) throw new Error('Supabase temporarily unavailable');
    return Array.from({ length: STOCKTAKING_PAGE_SIZE }, (_, i) => ({ id: i }));
  }), /temporarily unavailable/);
  await assert.rejects(readAllStocktakingPages(() => undefined), /invalid pagination response/);
});

test('Stocktaking folder and account projections use non-zero DB filtering with page-aware caching', () => {
  const data = read('lib/stocktaking-data.js');
  assert.match(data, /const stockFilter = uniqueKeys\.includes\(quantityColumn\)/);
  assert.match(data, /\[stockFilter\]: "neq\.0"/);
  assert.match(data, /readAllStocktakingPages\(/);
  assert.match(data, /cacheKey = `\$\{stockProjectionKey\(uniqueKeys\)\}\\u001e\$\{stockFilter\}`/);
  assert.match(data, /loadStockProjection\(projectionKeys, \{ fresh, quantityColumn \}\)/);
  assert.match(data, /loadStockProjection\(stockDetailProjectionKeys\(schemaKeys, \[quantityColumn\]\), \{ fresh, quantityColumn \}\)/);
  // Exports use exactly the same complete source as the table.
  assert.match(read('lib/stocktaking-export-service.js'), /stocktakingForColumn\(column, \{ inventoryColumn, defectedColumn, fresh \}\)/);
});

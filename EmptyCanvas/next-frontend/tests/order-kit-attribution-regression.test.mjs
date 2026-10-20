import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  resolveOrderKitAttribution,
  withSingleOrderSourceAttribution,
  combinedOrderKitAttribution,
} from '../lib/order-kit-attribution.mjs';
import { mergeCombinedOrderRows, combinedMetricColumnKey } from '../lib/combined-order-rows.mjs';

// Regression: a DHT11 sourced from Theme two / G5 was displayed under Theme
// one because the first product membership happened to be in Theme one.
const themeOneG3 = { kitId: 'kit-theme-one-g3', kitName: 'G3', folderId: 'f1', folderName: 'Theme one' };
const themeTwoG5 = { kitId: 'kit-theme-two-g5', kitName: 'G5', folderId: 'f2', folderName: 'Theme two' };
const kitById = new Map([
  ['kit-theme-one-g3', { id: 'kit-theme-one-g3', name: 'G3', folderId: 'f1' }],
  ['kit-theme-two-g5', { id: 'kit-theme-two-g5', name: 'G5', folderId: 'f2' }],
]);
const folderNameById = new Map([['f1', 'Theme one'], ['f2', 'Theme two']]);

const locate = (changes = {}) => resolveOrderKitAttribution({
  sources: [{ kitId: 'kit-theme-two-g5', kitName: 'G5', quantity: 7, order: 0 }],
  memberships: [themeOneG3, themeTwoG5],
  kitById,
  folderNameById,
  storedKitTag: 'G5',
  storedFolderName: 'Theme one', // formerly saved/stale or first-membership label
  ...changes,
});

test('DHT11 / G5 keeps Theme two from its source kit ID, not the first membership or stored theme', () => {
  const result = locate();
  assert.equal(result.kitTag, 'G5');
  assert.equal(result.kitFolderName, 'Theme two');
  assert.equal(result.sourceBreakdown[0].kitFolderName, 'Theme two');
  assert.equal(result.sourceBreakdown[0].quantity, 7);
});

test('a source kit ID is valid even if the targeted product memberships are incomplete', () => {
  const result = locate({ memberships: [themeOneG3] });
  assert.equal(result.kitFolderName, 'Theme two');
});

test('identically named G5 kits in two Themes are distinguished by source ID', () => {
  const memberships = [
    { kitId: 'other-g5', kitName: 'G5', folderName: 'Theme one', folderId: 'f1' },
    themeTwoG5,
  ];
  assert.equal(locate({ memberships }).kitFolderName, 'Theme two');
  const uncertain = locate({ sources: [{ kitName: 'G5', quantity: 7 }], memberships });
  assert.equal(uncertain.kitFolderName, 'Unfiled Kits');
});

test('legacy orders with only G5 may use a unique match but never arbitrarily choose another kit', () => {
  const exact = locate({ sources: [], storedFolderName: '', memberships: [themeOneG3, themeTwoG5] });
  assert.equal(exact.kitFolderName, 'Theme two');
  const ambiguous = locate({ sources: [], storedFolderName: '', memberships: [
    { kitId: 'other-g5', kitName: 'G5', folderName: 'Theme one' }, themeTwoG5,
  ] });
  assert.equal(ambiguous.kitFolderName, 'Unfiled Kits');
});

test('one-source order display uses its source theme even when the item metadata is stale', () => {
  const item = withSingleOrderSourceAttribution({
    productName: 'Sensor - DHT11', kitTag: 'G5', kitFolderName: 'Theme one',
    sourceBreakdown: locate().sourceBreakdown, quantity: 7,
  });
  assert.equal(item.kitFolderName, 'Theme two');
  assert.equal(item.quantity, 7);
});

test('multi-kit rows retain every true source kit name rather than a generic placeholder', () => {
  const sources = [
    { kitId: 'kit-theme-two-g5', kitTag: 'G5', kitFolderName: 'Theme two', quantity: 7 },
    { kitId: 'kit-theme-one-g3', kitTag: 'G3', kitFolderName: 'Theme one', quantity: 3 },
  ];
  const result = combinedOrderKitAttribution(sources);
  assert.equal(result.kitTag, 'G3 - G5');
  assert.equal(result.kitFolderName, 'Multiple Folders');
  assert.equal(sources.reduce((sum, source) => sum + source.quantity, 0), 10);
});

test('combined export preserves quantities, displays real kit names and marks different order source folders as mixed', () => {
  const make = (qty, kitTag, kitFolderName) => ({ rows: [{
    component: 'Sensor - DHT11', idCode: 'A100024', qty, receivedQty: 0,
    remainingQty: qty, deliveredQty: 0, total: qty * 45, unit: 45,
    kitTag, kitFolderName,
  }] });
  const result = mergeCombinedOrderRows([
    make(7, 'G5', 'Theme two'), make(3, 'G3', 'Theme one'),
  ], [{ label: 'ORD-35' }, { label: 'ORD-40' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kitTag, 'G3 - G5');
  assert.equal(result[0].kitFolderName, 'Multiple Folders');
  assert.equal(result[0][combinedMetricColumnKey('qty', 0)], 7);
  assert.equal(result[0][combinedMetricColumnKey('qty', 1)], 3);
  assert.equal(result[0][combinedMetricColumnKey('remainingQty', 0)], 7);
  assert.equal(result[0][combinedMetricColumnKey('remainingQty', 1)], 3);
});

test('server order details actually obtain labels from source attribution rather than first membership', async () => {
  const source = fs.readFileSync(new URL('../lib/order-details-data.js', import.meta.url), 'utf8');
  const begin = source.indexOf('export async function enrichOrderDetailGrouping(');
  const end = source.indexOf('\nexport const __orderDetailsDataTest', begin);
  assert.ok(begin >= 0 && end > begin);
  const script = source.slice(begin, end).replace(/^export /, '');
  const sandbox = {
    text: (x) => String(x ?? '').trim(),
    normKey: (x) => String(x ?? '').trim().toLowerCase(),
    resolveOrderKitAttribution,
    scaleSourceBreakdown: (sources) => sources,
    getProductsForOrderDetails: async () => [{ id: 'dht', name: 'Sensor - DHT11', tags: [] }],
    resolveDirectProposalSources: async (rows) => rows,
    getKitGroupingReferences: async () => ({
      memberships: [{ productId: 'dht', kits: [
        { id: 'kit-theme-one-g3', name: 'G3' }, { id: 'kit-theme-two-g5', name: 'G5' },
      ] }],
      kits: [
        { id: 'kit-theme-one-g3', name: 'G3', folderId: 'f1' },
        { id: 'kit-theme-two-g5', name: 'G5', folderId: 'f2' },
      ],
    }),
    listKitFolders: async () => [{ id: 'f1', name: 'Theme one' }, { id: 'f2', name: 'Theme two' }],
    performance: { now: () => 0 },
  };
  vm.runInNewContext(`${script}\nthis.execute=enrichOrderDetailGrouping;`, sandbox);
  const actual = await sandbox.execute([{
    id: 'order-dht', productId: 'dht', productName: 'Sensor - DHT11',
    kitTag: 'G5', kitFolderName: 'Theme one', quantityRequested: 7,
    sourceKits: [{ kitId: 'kit-theme-two-g5', kitName: 'G5', quantity: 7, order: 0 }],
  }]);
  assert.equal(actual[0].kitFolderName, 'Theme two');
  assert.equal(actual[0].sourceBreakdown[0].kitFolderName, 'Theme two');
});

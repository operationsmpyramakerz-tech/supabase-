import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeCombinedOrderRows } from '../lib/combined-order-rows.mjs';
import { combinedOrderKitAttribution } from '../lib/order-kit-attribution.mjs';

const row = (name, kitTag, qty, productId, other = {}) => ({
  component: name, idCode: 'A100177', _productId: productId,
  qty, remainingQty: qty, receivedQty: 0, deliveredQty: 0,
  unit: 2, total: 2 * qty, kitTag, kitFolderName: 'Theme one',
  ...other,
});

test('ORD-115: both different propellers with the same ID Code remain in the combined export', () => {
  const result = mergeCombinedOrderRows([
    { rows: [
      row('Plastic Propeller 4 Blades 56mm', 'G1', 7, 'legacy-propeller'),
      row('Plastic Propeller 75mm 2 Blades', 'G2', 7, 'legacy-propeller'),
    ] },
    { rows: [
      row('Plastic Propeller 4 Blades 56mm', 'G2', 4, 'legacy-propeller'),
      row('Plastic Propeller 75mm 2 Blades', 'G3', 6, 'legacy-propeller'),
    ] },
  ], [{ label: 'ORD-115' }, { label: 'ORD-116' }]);
  assert.equal(result.length, 2);
  const four = result.find((r) => r.component === 'Plastic Propeller 4 Blades 56mm');
  const two = result.find((r) => r.component === 'Plastic Propeller 75mm 2 Blades');
  assert.equal(four.combined__qty__0, 7);
  assert.equal(four.combined__qty__1, 4);
  assert.equal(two.combined__qty__0, 7);
  assert.equal(two.combined__qty__1, 6);
  assert.equal(four.kitTag, 'G1 - G2');
  assert.equal(two.kitTag, 'G2 - G3');
});

test('a multi-kit source is joined, deduplicated, and merged with other order kit names', () => {
  const attributed = combinedOrderKitAttribution([
    { kitId: 'g2', kitTag: 'G2', kitFolderName: 'Theme one', quantity: 2 },
    { kitId: 'g3', kitTag: 'G3', kitFolderName: 'Theme one', quantity: 3 },
  ]);
  assert.equal(attributed.kitTag, 'G2 - G3');
  const result = mergeCombinedOrderRows([
    { rows: [row('Plastic Propeller 4 Blades 56mm', attributed.kitTag, 5, 'p')] },
    { rows: [row('Plastic Propeller 4 Blades 56mm', 'G3', 3, 'another-p')] },
  ], [{ label: 'ORD-115' }, { label: 'ORD-116' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].kitTag, 'G2 - G3');
  assert.equal(result[0].combined__qty__0, 5);
  assert.equal(result[0].combined__qty__1, 3);
});

test('missing component name uses a unique matching ID and does not merge two ambiguous candidates', () => {
  assert.throws(() => mergeCombinedOrderRows([
    { rows: [row('Propeller 4 blades', 'G1', 1, 'shared'), row('Propeller 2 blades', 'G2', 1, 'shared')] },
    { rows: [row('Unknown Product', 'G3', 1, 'shared')] },
  ], [{ label: 'ORD-115' }, { label: 'ORD-116' }]), /Conflicting product identities/);
  // Deliberately stop rather than merge an unidentified product with a random candidate.
});

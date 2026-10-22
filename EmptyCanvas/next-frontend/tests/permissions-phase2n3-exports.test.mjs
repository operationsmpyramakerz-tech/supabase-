import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { productExportPolicy, validateProductExportParams } from '../lib/export-access-policy.mjs';

const source = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const params = values => new URLSearchParams(values);
const expectStatus400 = fn => assert.throws(fn, error => error?.status === 400);

test('product exports require the view permission for the requested source module', () => {
  assert.deepEqual(productExportPolicy('kit').permissions, ['kits.view']);
  assert.deepEqual(productExportPolicy('proposal').permissions, ['proposals.view']);
  assert.deepEqual(productExportPolicy('combined').permissions, ['proposals.view', 'proposals.combine']);
  assert.equal(productExportPolicy('unknown'), null);
  const route = source('../app/api/products/export-direct/route.js');
  assert.ok(route.includes('validateProductExportParams(url.searchParams)'));
  assert.ok(route.includes('gate = featureGate(gate, permission)'));
  assert.ok(route.indexOf('gate = featureGate(gate, permission)') < route.indexOf('renderProposalKitExport({'));
});

test('product export query rejects scope swapping, invalid format and unbounded combined exports', () => {
  expectStatus400(() => validateProductExportParams(params({ scope: 'other', id: '12' })));
  expectStatus400(() => validateProductExportParams(params({ scope: 'kit', id: '12', kind: 'html' })));
  expectStatus400(() => validateProductExportParams(params({ scope: 'proposal' })));
  expectStatus400(() => validateProductExportParams(params({ scope: 'combined', ids: '12' })));
  expectStatus400(() => validateProductExportParams(params({ scope: 'combined', ids: '12,12' })));
  expectStatus400(() => validateProductExportParams(params({ scope: 'combined', ids: Array.from({ length: 201 }, (_, i) => i + 1).join(',') })));
  assert.equal(validateProductExportParams(params({ scope: 'kit', id: '12', kind: 'excel' })).scope, 'kit');
  assert.equal(validateProductExportParams(params({ scope: 'combined', ids: '12,13' })).scope, 'combined');
});

test('Orders Review export needs the same view_details grant as its direct details API', () => {
  const exportRoute = source('../app/api/orders/export-direct/route.js');
  const detailRoute = source('../app/api/sv-orders/details-direct/route.js');
  assert.ok(detailRoute.includes('featureGate(gate, "orders.review.view_details")'));
  assert.ok(exportRoute.includes('review: "orders.review.view_details"'));
  assert.ok(exportRoute.indexOf('featureGate(preliminaryGate, exportPermissions[scope])') < exportRoute.indexOf('renderOrderExport({'));
  assert.ok(exportRoute.includes('await loadOrdersReviewDetails({ account, orderIds })'));
});

// Phase 2P4C regression tests. Pure tests run without a Next.js server/Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderProductCatalogCsv } from '../lib/products-catalog-export.mjs';
import { hideOrderReceiptFiles } from '../lib/order-receipt-visibility.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const registry = await import(`data:text/javascript;base64,${Buffer.from(read('lib/feature-permissions-registry.js')).toString('base64')}`);
const account = (grants, mode = 'enforced') => ({ featureAccess: { mode, grants } });
const grant = allowed => ({ allowed, scope: 'all' });
const allow = (grants, key) => registry.featureAllowed(account(grants), key);
const keys = [
  'home.sla_view', 'home.sla_manage',
  'orders.documents.view_receipts', 'orders.documents.download_instructions', 'orders.documents.manage_instructions',
  'products.export',
];

test('2P4C registers all six new active controls (187 total known)', () => {
  assert.equal(registry.FEATURE_DEFINITIONS.length, 187);
  for (const key of keys) {
    assert.ok(registry.isKnownFeature(key), key);
    assert.ok(registry.ACTIVE_PILOT_FEATURE_KEYS.includes(key), key);
  }
  assert.equal(registry.ACTIVE_PILOT_FEATURE_KEYS.length, 187); // Updated by Phase 2P4D.
});

test('2P4C missing grants preserve previous functionality, explicit deny is authoritative', () => {
  for (const key of keys) {
    // Products is an already-enforced module, so export also needs Products View.
    const previousGrants = key === 'products.export' ? { 'products.view': grant(true) } : {};
    assert.equal(allow(previousGrants, key), true, `prior legacy access to ${key}`);
    assert.equal(allow({ ...previousGrants, [key]: grant(false) }, key), false, `explicit denied ${key}`);
    assert.equal(registry.featureAllowed(account({}, 'legacy'), key), true, `legacy profile ${key}`);
  }
  assert.equal(allow({ 'products.view': grant(true) }, 'products.export'), true);
  assert.equal(allow({ 'products.view': grant(false), 'products.export': grant(true) }, 'products.export'), false);
  assert.equal(allow({ 'home.view': grant(false), 'home.sla_view': grant(true) }, 'home.sla_view'), false);
  assert.equal(allow({ 'home.view': grant(true), 'home.sla_view': grant(false) }, 'home.sla_view'), false);
});

test('2P4C independent order document toggles do not bypass an explicit deny', () => {
  const grants = Object.fromEntries(keys.filter(k => k.startsWith('orders.documents.')).map(key => [key, grant(true)]));
  for (const key of Object.keys(grants)) {
    assert.equal(allow({ ...grants, [key]: grant(false) }, key), false);
    assert.equal(allow(grants, key), true);
  }
  const dialog = read('components/users-center/UsersCenterDialogs.jsx');
  assert.match(dialog, /LEGACY_DEFAULT_FEATURE_KEYS\.includes\(item\.key\)/);
  assert.match(dialog, /"orders\.documents": true/);
  assert.match(dialog, /if \(!Object\.hasOwn\(savedGrants, key\)\) savedGrants\[key\] = true/);
});

test('2P4C download instructions and saved template mutations are protected server-side', () => {
  const access = read('lib/order-instructions-access.js');
  const route = read('app/api/orders/download-instructions/route.js');
  const exportRoute = read('app/api/orders/export-direct/route.js');
  const modal = read('components/orders/OrderDownloadModal.jsx');
  assert.ok(access.includes('"orders.documents.download_instructions"'));
  assert.ok(access.includes('"orders.documents.manage_instructions"'));
  assert.ok(route.indexOf('if (!canDownloadSharedOrderInstructions(access.account))') < route.indexOf('await listOrderDownloadInstructions()'));
  assert.equal((route.match(/if \(!canManageSharedOrderInstructions\(access\.account\)\)/g) || []).length, 2);
  assert.ok(exportRoute.includes('!canDownloadSharedOrderInstructions(gate.account)'));
  assert.ok(exportRoute.indexOf('!canDownloadSharedOrderInstructions(gate.account)') < exportRoute.indexOf('renderOrderExport({'));
  assert.ok(modal.includes('canDownloadInstructions ? <div className="order-download-section order-download-instructions">'));
  assert.ok(modal.includes('loadError?.status !== 403'));
});

test('2P4C order receipts route and SSR viewer deny before reading data; all detail endpoints redact', () => {
  const api = read('app/api/orders/order-receipts/route.js');
  const page = read('app/orders/receipt-viewer/page.jsx');
  assert.ok(api.includes('"orders.documents.view_receipts"'));
  assert.ok(api.indexOf('"orders.documents.view_receipts"') < api.indexOf('await loadOrderReceiptViewerItems('));
  assert.ok(page.indexOf('"orders.documents.view_receipts"') < page.indexOf('await loadOrderReceiptViewerItems('));
  for (const path of ['app/api/orders/current/details-direct/route.js','app/api/orders/requested/details-direct/route.js','app/api/sv-orders/details-direct/route.js','app/api/orders/maintenance/details-direct/route.js']) {
    assert.ok(read(path).includes('hideOrderReceiptFiles(items, featureAllowed(gate.account, "orders.documents.view_receipts"))'), path);
  }
  for (const path of ['app/api/orders/tracking/route.js','app/orders/tracking/page.jsx']) {
    assert.ok(read(path).includes('hideOrderReceiptFiles(tracking.items, featureAllowed(gate.account, "orders.documents.view_receipts"))'), path);
  }
});

test('2P4C receipt redaction keeps order fields and removes file URLs/names', () => {
  const row = { id: 'one', receiptNumber: '123', orderReceiptUrl: '/secret', orderReceiptEntries: [{ url: '/secret' }], maintenanceReceiptUrls: ['/private'], productName: 'Motor' };
  assert.deepEqual(hideOrderReceiptFiles([row], true), [row]);
  const masked = hideOrderReceiptFiles([row], false)[0];
  assert.equal(masked.receiptNumber, '123');
  assert.equal(masked.productName, 'Motor');
  assert.equal(masked.orderReceiptUrl, undefined);
  assert.equal(masked.orderReceiptEntries, undefined);
  assert.equal(masked.maintenanceReceiptUrls, undefined);
  assert.equal(row.orderReceiptUrl, '/secret');
});

test('2P4C catalog export guarded by Products View and Export, and safely escaped CSV', () => {
  const route = read('app/api/products/catalog-export/route.js');
  const page = read('app/products/page.jsx');
  const client = read('components/products/ProductsClient.jsx');
  assert.ok(route.includes('featureGate(featureGate(await getDirectAccountGate("Products"), "products.view"), "products.export")'));
  assert.ok(route.indexOf('"products.export"') < route.indexOf('await getProductsCatalog('));
  assert.ok(page.includes('export: featureAllowed(gate.account, "products.export")'));
  assert.ok(client.includes('permitted.export ? <a'));
  const csv = renderProductCatalogCsv([{ displayId: '=HYPERLINK("bad")', name: 'A"B, C', unitPrice: 5.17, unit: 'Piece', tags: ['G2','G3'], url: 'https://example.org' }]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"A""B, C"'));
  assert.ok(csv.includes('"G2 | G3"'));
  assert.ok(csv.includes('"5.17"'));
});

test('2P4C Home removes denied SLA data before serialization and protects SLA management', () => {
  const lifecycle = read('lib/home-lifecycle-data.js');
  const overview = read('lib/home-overview-data.js');
  const page = read('app/home/page.jsx');
  const client = read('components/home/HomeOverviewClient.jsx');
  const sla = read('lib/home-sla-settings.js');
  assert.ok(lifecycle.includes('includeSla ? loadHomeSlaPolicies() : Promise.resolve(null)'));
  assert.ok(lifecycle.includes('...(includeSla ? { sla } : {})'));
  assert.ok(overview.includes('includeSla: featureAllowed(account, "home.sla_view")'));
  const expenses = read('components/expenses/ExpensesClient.jsx');
  assert.ok(expenses.includes('<ExpenseOrderActions orders={group.orders} reasonLabel={group.reason} canViewOrderReceipts={canViewOrderReceipts}/>'));
  assert.ok(expenses.includes('const receiptHref = canViewOrderReceipts ? modernReceiptViewerHref(order) : "";'));
  assert.ok(page.includes('canViewSlaMetrics={featureAllowed(account, "home.sla_view")}'));
  assert.ok(client.includes('canViewSlaMetrics ? <SlaMonitoring'));
  assert.ok(sla.includes('previousAccess && featureAllowed(account, \'home.sla_manage\')'));
  for (const path of ['app/api/home/sla-settings/route.js','app/api/home/sla-escalations/route.js','app/api/home/sla-health/route.js']) {
    assert.ok(read(path).includes('canManageSla('), path);
  }
});

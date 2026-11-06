import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');

const orders = ['CurrentOrdersClient', 'OperationsOrdersClient', 'OrdersReviewClient', 'MaintenanceOrdersClient'];

test('Orders title is removed and Filter plus Sort share one Preferences control across four pages', () => {
  const shared = read('components/orders/OrdersEmptyState.jsx');
  assert.ok(!shared.includes('orders-workspace-list-head__title">Orders</span>'));
  for (const name of orders) {
    const source = read(`components/orders/${name}.jsx`);
    assert.ok(source.includes('<OrdersPreferencesControl sortMode={sortMode}'), `${name} renders a combined Preferences control`);
    assert.ok(source.includes('onFilterChange={setType}'), `${name} preserves type filtering`);
    assert.ok(source.includes('onSortChange={setSortMode}'), `${name} preserves sorting`);
    assert.ok(!source.includes('<OrdersListHeader '), `${name} has no second Sort control`);
  }
});

test('Removed duplicated inner breadcrumb controls without removing functional header breadcrumbs', () => {
  const users = read('components/users-center/UsersCenterClient.jsx');
  const stock = read('components/stocktaking/StocktakingClient.jsx');
  const kits = read('components/kits/KitsClient.jsx');
  assert.ok(users.includes('HeaderFolderBreadcrumb'));
  assert.ok(users.includes('ua-section-head--members-actions-only'));
  assert.ok(!users.includes('selectedDepartment.name} Members</h3>'));
  assert.ok(!users.includes('className="ua-back-btn"'));
  assert.ok(stock.includes('HeaderFolderBreadcrumb'));
  assert.ok(!stock.includes('className="stocktaking-folder-back"'));
  assert.ok(kits.includes('HeaderFolderBreadcrumb'));
  assert.ok(!kits.includes('<div className="kit-folder-context">'));
});

test('Products has a single aligned action bar with the tag filter and permitted links', () => {
  const source = read('components/products/ProductsClient.jsx');
  const panel = source.slice(source.indexOf('<section className="products-filter-panel"'), source.indexOf('<section className="products-results"'));
  assert.ok(panel.includes('className="products-tag-filter-wrap"'));
  assert.ok(panel.includes('className="products-filter-actions"'));
  assert.equal((panel.match(/href="\/next\/products\/addition-requests"/g) || []).length, 1);
  assert.equal((panel.match(/catalog-export/g) || []).length, 1);
  assert.ok(panel.indexOf('products-tag-filter-wrap') < panel.indexOf('products-filter-actions'));
  assert.ok(read('public/css/products.css').includes('ERP v334: One consistent product filter/action toolbar'));
});

test('Three secondary flyouts are positioned above the clicked dock icon and preserve phone fallback', () => {
  for (const name of ['components/task-management/TaskManagementSidebarFlyout.jsx','components/events/EventsSidebarFlyout.jsx','components/orders/ShoppingCartSidebarFlyout.jsx']) {
    const source = read(name);
    assert.ok(source.includes('rect.top - panelHeight - gap'), name);
    assert.ok(source.includes('(rect.left + rect.right - panelWidth) / 2'), name);
    assert.ok(source.includes('if (isMobileDock)'), name);
    assert.ok(!source.includes('sidebarRect.right - 18'), name);
  }
  const css = read('public/css/classic-parity.css');
  assert.ok(css.includes('ERP v334: Desktop secondary flyouts anchor'));
  assert.ok(css.includes('z-index: 260 !important'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPERATIONS_ORDER_PAGES, operationsPageForType, operationsPageForPath, operationsLegacyDestination } from '../lib/operations-order-pages.mjs';
import { summarizeOperationsFacets, collectOperationsFilterGroups } from '../lib/operations-filter-preferences.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('three canonical routes share a single protected server page and loading design', () => {
  assert.equal(OPERATIONS_ORDER_PAGES.length, 3);
  assert.equal(new Set(OPERATIONS_ORDER_PAGES.map(page => page.type)).size, 3);
  for (const page of OPERATIONS_ORDER_PAGES) {
    assert.equal(operationsPageForType(page.label), page);
    assert.equal(operationsPageForPath(page.route), page);
    assert.equal(operationsPageForPath(page.route.slice(5)), page);
    assert.match(read(`app/operations-orders/${page.key}/page.jsx`), new RegExp(`operationsPageForType\\("${page.type}"\\)`));
    assert.match(read(`app/operations-orders/${page.key}/loading.jsx`), /bodyClass="operations-orders-page"/);
  }
  const shared = read('components/orders/OperationsOrdersPage.jsx');
  assert.match(shared, /featureGate\(await getLegacyAccountGate\(\["Requested Orders", "Operations Orders"\]\), "orders.operations.view"\)/);
  assert.match(shared, /loadOperationsOrdersInitialPage\(\{ account: gate.account, type \}\)/);
  assert.match(shared, /key=\{type\}\s+orderType=\{type\}/);
  assert.match(shared, /orderUiScopePolicy\(gate.account/);
  assert.equal(operationsPageForPath('/next/operations-orders/purchase-requisition'), null);
});

test('legacy typed bookmarks keep their search and status, without mutable type query', () => {
  assert.equal(operationsLegacyDestination(), '/operations-orders/request-products');
  assert.equal(operationsLegacyDestination({type:'Request Maintenance', q:'ORD-151', tab:'approved'}), '/operations-orders/request-maintenance?q=ORD-151&tab=approved');
  assert.equal(operationsLegacyDestination({filterType:'withdrawproducts', tab:'received'}), '/operations-orders/withdraw-products?tab=received');
  assert.equal(operationsLegacyDestination({type:'all'}), '/operations-orders/request-products');
  assert.equal(operationsLegacyDestination({type:'https://evil.invalid'}), '/operations-orders/request-products');
});

test('type stays fixed during initial load, search, status change, pagination and reset', () => {
  const ui = read('components/orders/OperationsOrdersClient.jsx');
  assert.match(ui,/const type = orderType;/);
  assert.match(ui,/filterType: type, limit: "80"/);
  assert.match(ui,/filterType: type,\s+limit: String/);
  assert.match(ui,/params.set\("cursor", String\(pageInfo.nextCursor\)\)/);
  assert.match(ui,/orders.filter\(item => orderTypeKey\(item\?\.orderType\) === type\)/);
  assert.match(ui,/groupsForTab\(groups, workspaceOrders, tab\)/);
  assert.doesNotMatch(ui,/\bsetType\b|function TypeFilter/);
  const data = read('lib/operations-orders-data.js');
  assert.match(data,/loadOperationsOrdersInitialPage\(\{ account = \{\}, type = "all"/);
  assert.match(data,/loadOperationsOrdersPage\(\{ account, tab: "all", type, query: "", cursor: null, limit \}\)/);
  assert.ok(data.indexOf('orderTypeKey(items[0]?.orderType || "") !== cleanType') < data.indexOf('outputGroups.push({ orderNumber, items: rowsForTab'));
});

test('status facets are scoped even when source has mixed types and multiple pages', async () => {
  const groups = OPERATIONS_ORDER_PAGES.map((page,index)=>({key:String(index),orderType:page.label,stage:2,hasApproved:true}));
  const fetched = await collectOperationsFilterGroups(async cursor=>cursor===null?{items:groups.slice(0,1),pageInfo:{hasMore:true,nextCursor:1}}:{items:groups.slice(1),pageInfo:{hasMore:false}}, items=>items);
  for(const page of OPERATIONS_ORDER_PAGES) assert.equal(summarizeOperationsFacets(fetched,page.type).statuses.approved,1);
  assert.equal(summarizeOperationsFacets(fetched).statuses.approved,3);
});

test('Operations-specific menu removes type selectors but preserves statuses, shortcuts and sorting', () => {
  const control=read('components/orders/OperationsFilterControl.jsx');
  assert.doesNotMatch(control,/Order Type|draftType|setDraftType|typeExpanded/);
  assert.match(control,/summarizeOperationsFacets\(groups,filterValue\)/);
  assert.match(control,/Smart shortcuts/);
  assert.match(control,/Sort by/);
  assert.match(control,/Apply Filters/);
  assert.match(read('components/orders/OrdersPreferencesControl.jsx'),/filterOptions/);
});

test('operations parent uses Shopping Cart flyout geometry with independent ID, active route and shared gate', () => {
  const shell=read('components/AppShell.jsx');
  assert.match(shell, /<ShoppingCartSidebarFlyout module="operations" account=\{account\}/);
  assert.match(shell, /link.href === "\/next\/operations-orders"\) return featureAllowed\(account, "orders.operations.view"\)/);
  const flyout=read('components/orders/ShoppingCartSidebarFlyout.jsx');
  assert.match(flyout,/operations-orders-secondary-sidebar-next/);
  assert.match(flyout,/featureAllowed\(account, "orders.operations.view"\) \? OPERATIONS_ORDER_PAGES : \[\]/);
  assert.match(flyout,/event.preventDefault\(\);\s+event.stopPropagation\(\);/);
  assert.match(flyout,/panel.style.setProperty\("--secondary-page-count", String\(pages.length\)\)/);
  const persistent=read('components/PersistentAppShell.jsx');
  assert.match(persistent,/operationsPageForPath\(localPath\)/);
  assert.match(persistent,/operationsWorkspace.route, bodyClass: "order-modal-fit-screen operations-orders-page"/);
});

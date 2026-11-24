import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REVIEW_ORDER_PAGES, reviewPageForType, reviewPageForPath, reviewLegacyDestination } from "../lib/review-order-pages.mjs";

const source = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("all three Orders Review routes have a unique canonical type", () => {
  assert.equal(REVIEW_ORDER_PAGES.length, 3);
  assert.deepEqual(REVIEW_ORDER_PAGES.map(page => page.type), [
    "requestproducts", "withdrawproducts", "requestmaintenance",
  ]);
  assert.equal(new Set(REVIEW_ORDER_PAGES.map(page => page.route)).size, 3);
  for (const page of REVIEW_ORDER_PAGES) {
    assert.equal(reviewPageForType(page.type), page);
    assert.equal(reviewPageForType(page.label), page);
    assert.equal(reviewPageForPath(page.route), page);
    assert.equal(reviewPageForPath(page.route.slice(5)), page);
    const slug = page.route.split("/").at(-1);
    assert.match(source(`../app/orders-review/${slug}/page.jsx`), /reviewPageForType/);
    assert.match(source(`../app/orders-review/${slug}/loading.jsx`),
      /from ["']\.\.\/\.\.\/\.\.\/components\/orders\/ClassicOrdersLoading["']/,
      "Nested loading routes must import the shared skeleton from the correct depth");
    assert.doesNotMatch(source(`../app/orders-review/${slug}/loading.jsx`),
      /from ["']\.\.\/\.\.\/components\/orders\/ClassicOrdersLoading["']/);
  }
  assert.equal(reviewPageForType("unrecognized"), null);
});

test("old bookmarks preserve tab/search while type is routed", () => {
  assert.equal(reviewLegacyDestination({}), "/orders-review/request-products");
  assert.equal(reviewLegacyDestination({ type: "Withdraw Products", tab: "approved", q: "ORD-166" }),
    "/orders-review/withdraw-products?tab=approved&q=ORD-166");
  assert.equal(reviewLegacyDestination({ orderTypeKey: "Request Maintenance" }),
    "/orders-review/request-maintenance");
  assert.equal(reviewLegacyDestination({ filterType: "requestproducts", tab: "rejected" }),
    "/orders-review/request-products?tab=rejected");
});

test("untyped notification deep links remain in old all-types fallback", () => {
  const page = source("../app/orders-review/page.jsx");
  assert.match(page, /!\/\^ORD-\\d\+\$\/i\.test\(rawOrder\)/);
  assert.match(page, /reviewLegacyDestination\(params\)/);
  assert.match(page, /loadOrdersReviewInitialPage\(\{ account: sessionGate\.account \}\)/);
});

test("server filters first page, paging follows immutable type, existing permissions remain", () => {
  const wrapper = source("../components/orders/OrdersReviewPage.jsx");
  const data = source("../lib/orders-review-data.js");
  const ui = source("../components/orders/OrdersReviewClient.jsx");
  const dock = source("../components/orders/ShoppingCartSidebarFlyout.jsx");
  const appShell = source("../components/AppShell.jsx");
  const persistent = source("../components/PersistentAppShell.jsx");

  assert.match(wrapper, /loadOrdersReviewInitialPage\(\{ account: sessionGate\.account, type \}\)/);
  assert.match(wrapper, /featureGate\(gate, "orders\.review\.view"\)/);
  assert.match(data, /loadOrdersReviewInitialPage\(\{ account, limit = PAGE_LIMIT, type = "all" \}/);
  assert.match(data, /loadOrdersReviewPage\(\{ account, tab: "all", type, query: ""/);
  assert.match(ui, /useState\(workspaceType \|\| "all"\)/);
  assert.match(ui, /filterType: type/);
  assert.match(ui, /sortOnly=\{!!workspaceType\}/);
  assert.match(ui, /<OrdersReviewHeavyModals/);
  assert.match(dock, /REVIEW_ORDER_PAGES/);
  assert.match(dock, /module === "review"/);
  assert.match(appShell, /<ShoppingCartSidebarFlyout module="review"/);
  assert.match(persistent, /reviewPageForPath\(localPath\)/);
});

test("sort-only preferences do not allow changing fixed workspace type", () => {
  const prefs = source("../components/orders/OrdersPreferencesControl.jsx");
  const ui = source("../components/orders/OrdersReviewClient.jsx");
  assert.match(prefs, /sortOnly = false/);
  assert.match(prefs, /!sortOnly && section === "filter"/);
  assert.match(ui, /if \(!workspaceType && requestedType\) setType/);
  assert.match(ui, /onFilterChange=\{workspaceType \? undefined : setType\}/);
});

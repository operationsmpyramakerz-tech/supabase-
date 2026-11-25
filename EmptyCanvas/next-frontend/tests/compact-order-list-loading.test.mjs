// ERP_COMPACT_ORDER_LIST_LOADING_V1
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderLoadingIcon } from "../components/orders/order-loading-icon.mjs";
const read = file => readFileSync(new URL(`../components/orders/${file}`, import.meta.url), "utf8");
for (const [name, prop] of [["CurrentOrdersClient.jsx","{workspaceType}"],["OperationsOrdersClient.jsx","{orderType}"],["OrdersReviewClient.jsx","{type}"],["MaintenanceOrdersClient.jsx",'"requestmaintenance"']]) {
  test(`${name}: uses correct type in existing loading branch`, () => {
    const src = read(name);
    assert.ok(src.includes('import OrdersListLoading from "./OrdersListLoading";'));
    assert.ok(src.includes(`<OrdersListLoading orderType=${prop} />`));
    assert.match(src, /listLoading\s*\?\s*(?:\(\s*)?<OrdersListLoading/);
    assert.doesNotMatch(src, /ops-no-data-state__text">Loading (?:maintenance )?orders/);
    assert.ok(src.includes("<ConnectedOrderStatusTabs"));
    assert.ok(src.includes("Load more orders"));
  });
}
test("icon mapping handles normalized and human-readable types", () => {
  assert.equal(orderLoadingIcon("Request Products"), "shopping-cart");
  assert.equal(orderLoadingIcon("requestproducts"), "shopping-cart");
  assert.equal(orderLoadingIcon("Withdraw Products"), "log-out");
  assert.equal(orderLoadingIcon("withdrawproducts"), "log-out");
  assert.equal(orderLoadingIcon("Request Maintenance"), "tool");
  assert.equal(orderLoadingIcon("requestmaintenance"), "tool");
  assert.equal(orderLoadingIcon("all"), "layers");
});
test("compact accessible spinner and 3 skeletons with dark/reduced-motion support", () => {
  const src = read("OrdersListLoading.jsx");
  const css = read("OrdersListLoading.module.css");
  assert.ok(src.includes('role="status"'));
  assert.ok(src.includes('[0, 1, 2].map'));
  assert.ok(src.includes('name={icon}'));
  assert.doesNotMatch(src, /setTimeout|setInterval|fetch\(/);
  assert.match(css, /grid-column: 1 \/ -1/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /ops-theme-dark/);
  assert.match(css, /ordersSpin .9s linear infinite/);
});

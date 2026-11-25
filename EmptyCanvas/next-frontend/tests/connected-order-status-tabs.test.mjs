// ORDER_CONNECTED_STATUS_TABS_V1
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const component = read("components/orders/ConnectedOrderStatusTabs.jsx");
const css = read("components/orders/ConnectedOrderStatusTabs.module.css");
for (const [name, tabs, handler] of [["Current", "STATUS_TABS", "setTab"], ["Operations", "STATUS_TABS", "changeTab"], ["OrdersReview", "REVIEW_TABS", "setTab"], ["Maintenance", "STATUS_TABS", "setTab"]]) {
  const filename = name === "OrdersReview" ? "OrdersReviewClient.jsx" : `${name}OrdersClient.jsx`;
  test(`${filename} uses shared bar, preserves status handler and default ordering`, () => {
    const src = read(`components/orders/${filename}`);
    assert.ok(src.includes(`<ConnectedOrderStatusTabs tabs={${tabs}} active={tab} onChange={${handler}}`));
    assert.doesNotMatch(src, /<OrdersPreferencesControl|setSortMode/);
    assert.match(src, /const sortMode = "latest"/);
  });
}
test("only active label is rendered, all tabs accessible and rail scrollable", () => {
  assert.ok(component.includes("{isActive ? <span className={styles.label}>{item.label}</span> : null}"));
  assert.match(component, /aria-label=\{item.label\}/);
  assert.match(component, /tabs.slice\(0, selectedIndex\)/);
  assert.match(component, /tabs.slice\(selectedIndex \+ 1\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /\.group \+ \.group::before/);
  assert.doesNotMatch(css, /#(?:f45b17|ff6600|f97316)/i);
});

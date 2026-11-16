import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expenseOrderMenuPosition } from "../lib/expense-order-menu-position.mjs";

const code = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const viewport = { top: 0, left: 0, width: 390, height: 840 };
const trigger = { top: 530, bottom: 592, left: 18, width: 354 };

test("mobile multi-order menu opens upward, inside the viewport", () => {
  const menu = expenseOrderMenuPosition(trigger, viewport, { preferAbove: true });
  assert.ok(menu.top + menu.maxHeight < trigger.top);
  assert.ok(menu.top >= 12);
  assert.ok(menu.maxHeight > 300);
  assert.equal(menu.left, 18);
});

test("desktop keeps its adaptive placement when there's room beneath", () => {
  const rect = { top: 80, bottom: 140, left: 30, width: 340 };
  const menu = expenseOrderMenuPosition(rect, viewport);
  assert.equal(menu.top, rect.bottom + 8);
});

test("landscape/tiny visual viewport and keyboard offset stay in bounds", () => {
  const visible = { top: 200, left: 0, width: 320, height: 340 };
  const rect = { top: 435, bottom: 490, left: 3, width: 400 };
  const menu = expenseOrderMenuPosition(rect, visible, { preferAbove: true });
  assert.ok(menu.left >= 12 && menu.left + menu.width <= 308);
  assert.ok(menu.top >= visible.top + 12);
  assert.ok(menu.top + menu.maxHeight <= rect.top - 8);
});

test("manual reason action has no arrow and uses softer dark background", () => {
  const jsx = code("../components/expenses/ExpensesDialogs.jsx");
  const css = code("../public/css/expenses-classic-inline.css");
  const page = code("../app/expenses/page.jsx");
  assert.match(jsx, /const preferAbove = window.matchMedia\("\(max-width: 768px\)"\).matches/);
  assert.match(jsx, /window.visualViewport\?\.addEventListener\("resize", position\)/);
  assert.doesNotMatch(jsx, /<ClassicExpenseIcon name="arrow-right" size=\{16\}\/>/);
  assert.match(css, /\.expense-orders-menu__manual\{[^}]+background:#28354a;color:#fff/);
  assert.match(page, /expenses-classic-inline\.css\?v=v439-destination-button-spacing/);
});

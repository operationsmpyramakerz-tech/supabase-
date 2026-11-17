import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expenseOrderMenuPosition } from "../lib/expense-order-menu-position.mjs";

const code = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const viewport = { top: 0, left: 0, width: 390, height: 840 };
const trigger = { top: 530, bottom: 592, left: 18, width: 354 };

test("mobile Orders/Other reason menu opens below the field and scrolls within the viewport", () => {
  const menu = expenseOrderMenuPosition(trigger, viewport, { preferBelow: true });
  assert.equal(menu.top, trigger.bottom + 8);
  assert.equal(menu.maxHeight, 228);
  assert.ok(menu.top + menu.maxHeight <= viewport.height - 12);
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
  const menu = expenseOrderMenuPosition(rect, visible, { preferBelow: true });
  assert.ok(menu.left >= 12 && menu.left + menu.width <= 308);
  assert.equal(menu.top, rect.bottom + 8);
  assert.ok(menu.maxHeight >= 0);
  assert.ok(menu.top + menu.maxHeight <= visible.top + visible.height - 12);
});

test("manual reason action has no arrow and uses softer dark background", () => {
  const jsx = code("../components/expenses/ExpensesDialogs.jsx");
  const css = code("../public/css/expenses-classic-inline.css");
  const page = code("../app/expenses/page.jsx");
  assert.match(jsx, /expenseOrderMenuPosition\(rect, viewport, \{ preferBelow: true \}\)/);
  assert.match(jsx, /window.visualViewport\?\.addEventListener\("resize", position\)/);
  const picker = jsx.slice(jsx.indexOf("function ExpenseOrderMultiSelect("), jsx.indexOf("function ClassicFileField("));
  assert.doesNotMatch(picker, /<ClassicExpenseIcon name="arrow-right" size=\{16\}\/>/);
  assert.match(css, /\.expense-orders-menu__manual\{[^}]+background:#28354a;color:#fff/);
  assert.match(page, /expenses-classic-inline\.css\?v=v445-all-expenses-destination/);
});

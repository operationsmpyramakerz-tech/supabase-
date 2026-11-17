import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCartQuantityInput, stepCartQuantityInput } from "../lib/shopping-cart-quantity-input.mjs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const cart = read("../components/orders/ShoppingCartClient.jsx");
const cartStyle = read("../public/css/shopping-cart.css");
const sheet = read("../public/css/product-additions.css");

test("typed positive quantity accepts integers, decimals and numeric keyboard commas", () => {
  assert.equal(parseCartQuantityInput("15", 1), 15);
  assert.equal(parseCartQuantityInput("2.5", 1), 2.5);
  assert.equal(parseCartQuantityInput("1,25", 1), 1.25);
  assert.equal(parseCartQuantityInput("0.001", 1), 0.01);
});

test("blank, zero, malformed and non-finite quantities leave the saved value unchanged", () => {
  for (const raw of ["", "0", "0.000", "bad", "-2", "1e1000", "1.2345"]) {
    assert.equal(parseCartQuantityInput(raw, 8), 8, String(raw));
  }
});

test("quantity step buttons can work from a manually edited amount", () => {
  assert.equal(stepCartQuantityInput("7", 1, 1), 8);
  assert.equal(stepCartQuantityInput("7", 1, -1), 6);
  assert.equal(stepCartQuantityInput("", 3, 1), 4);
  assert.equal(stepCartQuantityInput("1", 1, -1), 0.01);
});

test("cart quantity is directly editable and commits on blur, preserving buttons and draft persistence", () => {
  assert.match(cart, /function CartQuantityEditor/);
  assert.match(cart, /input type="text" inputMode="decimal"/);
  assert.match(cart, /onChange=\{onInput\} onBlur=\{commit\}/);
  assert.match(cart, /if \(next !== qty\) onQuantityChange\(draftItemKey\(item\), next\)/);
  assert.match(cart, /onPointerDown=.*stepping\.current = true/);
  assert.match(cart, /function updateQuantity|const updateQuantity/);
  assert.match(cart, /persistDraft\(next\)/);
  assert.match(cartStyle, /classic-cart-qty-editable input/);
});

test("Add New Product mobile sheet has continuous white bottom without cut-out corners", () => {
  const styles = sheet.split("/* v316")[1];
  assert.ok(styles);
  assert.match(styles, /\.addition-dialog-overlay::after\{[\s\S]*?background:#fff/);
  assert.match(styles, /border-radius:24px 24px 0 0/);
  assert.match(styles, /\.addition-dialog__footer\{border-radius:0;background:#fff\}/);
  const cartPage = read("../components/orders/ShoppingCartPageServer.jsx");
  const reviewPage = read("../app/products/addition-requests/page.jsx");
  assert.match(cartPage, /product-additions\.css\?v=v338-required-fields/);
  assert.match(reviewPage, /product-additions\.css\?v=v316/);
});

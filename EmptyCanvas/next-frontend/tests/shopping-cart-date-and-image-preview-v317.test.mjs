import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const cart = source("components/orders/ShoppingCartClient.jsx");
const dialogs = source("components/orders/ShoppingCartDialogs.jsx");
const css = source("public/css/shopping-cart.css");
const shell = source("components/PersistentAppShell.jsx");

test("Delivery Date retains the native picker while displaying the same chevron as Priority", () => {
  assert.match(cart, /className="classic-cart-delivery-date-control"/);
  assert.match(cart, /<input type="date" value=\{requestedDeliveryDate\}/);
  assert.match(cart, /className="classic-cart-delivery-date-chevron" aria-hidden="true"><CartSvgIcon name="chevron-down" size=\{16\}/);
  assert.match(css, /classic-cart-delivery-date-control input\[type="date"\]::\-webkit-calendar-picker-indicator/);
  assert.match(css, /opacity:0;cursor:pointer;z-index:2/);
});

test("Component search no longer gets an orange focus outline", () => {
  assert.match(css, /classic-cart-combobox-search:focus-within\{[\s\S]*?box-shadow:none!important;outline:none!important/);
  assert.match(css, /classic-cart-combobox-search input:focus-visible\{[\s\S]*?outline:0!important;box-shadow:none!important/);
});

test("Clicking a product thumbnail opens preview but does not select the product", () => {
  assert.match(dialogs, /className="classic-cart-combobox-option-media classic-cart-combobox-option-media--preview"/);
  assert.match(dialogs, /event\.stopPropagation\(\); \/\/ Preview must never select the component/);
  assert.match(dialogs, /setImagePreview\(\{ imageUrl: product\.imageUrl, name: product\.name \}\)/);
  assert.match(dialogs, /onClick=\{\(\) => \{ onChange\(product\.id\); setOpen\(false\); setQuery\(""\); \}\}/);
  assert.match(dialogs, /onKeyDown=\{\(event\) => \{[\s\S]*?onChange\(product\.id\); setOpen\(false\);/);
});

test("Preview is a modal and can be dismissed with close, Escape, and background click", () => {
  assert.match(dialogs, /createPortal\(\s*<div className="classic-cart-product-preview-overlay"/);
  assert.match(dialogs, /role="dialog" aria-modal="true" aria-label=\{`Product image:/);
  assert.match(dialogs, /aria-label="Close image preview" onClick=\{\(\) => setImagePreview\(null\)\}/);
  assert.match(dialogs, /if \(event\.target === event\.currentTarget\) setImagePreview\(null\)/);
  assert.match(dialogs, /if \(imagePreviewRef\.current\) \{\s*event\.preventDefault\(\);\s*setImagePreview\(null\)/);
  assert.match(css, /classic-cart-product-preview-overlay\{[\s\S]*?z-index:30000/);
});

test("Shopping Cart CSS revision is cache-busted", () => {
  assert.match(shell, /shopping-cart\.css\?v=v338-required-fields/);
});

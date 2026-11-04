import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
const form = read("../components/orders/ProductAdditionForm.jsx");
const style = read("../public/css/product-additions.css");

test("new product request omits description without removing review instructions", () => {
  assert.doesNotMatch(form, /This item will be sent for review\. It will not appear in Products automatically\./);
  assert.match(form, /Add New Product Request/);
  assert.match(form, /review \? <p>Review the details before adding this item to Products\.<\/p> : null/);
});

test("new request has same edge-to-edge mobile width as Select Component", () => {
  const mobileOverrides = style.split("/* v314")[1];
  assert.ok(mobileOverrides, "latest responsive overrides must remain available");
  assert.match(mobileOverrides, /\.addition-dialog-overlay\{padding:38px 0 calc\(34px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
  assert.match(mobileOverrides, /\.addition-dialog\{\s*width:100%;\s*max-width:none;/);
  assert.match(mobileOverrides, /max-height:calc\(100dvh - 86px/);
  assert.match(style, /\.addition-dialog__body\{[\s\S]*?overflow-y:auto/);
  assert.match(style, /\.addition-dialog__footer\{display:grid/);
});

test("updated style revision is loaded by both cart and review", () => {
  assert.match(read("../components/orders/ShoppingCartPageServer.jsx"), /product-additions\.css\?v=v315/);
  assert.match(read("../app/products/addition-requests/page.jsx"), /product-additions\.css\?v=v315/);
});

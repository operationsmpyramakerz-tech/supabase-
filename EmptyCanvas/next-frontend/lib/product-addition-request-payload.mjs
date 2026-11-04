// Shared validation for an item that is requested before it exists in Products.
// Never turn a submitted custom item into a Products record automatically.
const clean = value => String(value ?? "").trim();
const allowedImage = value => {
  const url = clean(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error();
    return url;
  } catch { throw new Error("Use a valid HTTPS image URL."); }
};
const optionalUrl = value => {
  const url = clean(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error();
    return url;
  } catch { throw new Error("Use a valid HTTP or HTTPS product URL."); }
};
export const isCustomCartItem = item => /^new:[a-f0-9-]{16,80}$/i.test(clean(item?.id)) && !!item?.customProduct;
export function validateProductAddition(value = {}, quantityOverride) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const bounded = (key, limit) => {
    const result = clean(body[key]);
    if (result.length > limit) throw new Error(`${key} exceeds ${limit} characters.`);
    return result;
  };
  const name = bounded("name", 250);
  if (!name) throw new Error("Product Name is required.");
  const rawQty = quantityOverride ?? body.quantity;
  const quantity = Number(rawQty);
  if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > 100000 || Math.abs(Math.round(quantity * 1000) - quantity * 1000) > 1e-6) {
    throw new Error("Qty must be at least 0.01 and at most 100,000 (up to three decimal places).");
  }
  const rawPrice = body.unitPrice;
  if (rawPrice === null || rawPrice === undefined || clean(rawPrice) === "") {
    throw new Error("Unit Price is required.");
  }
  const unitPrice = Number(rawPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000) {
    throw new Error("Unit Price must be zero or a positive amount.");
  }
  const unit = bounded("unit", 80);
  if (!unit) throw new Error("Unit of Measurement is required.");
  const tag = bounded("tag", 120);
  if (!tag) throw new Error("Tag is required.");
  const url = optionalUrl(body.url);
  if (!url) throw new Error("Product URL is required.");
  const imageUrl = allowedImage(body.imageUrl);
  if (!imageUrl) throw new Error("Product Image is required.");
  return {
    name,
    idCode: bounded("idCode", 80),
    unitPrice,
    unit,
    tag,
    url,
    imageUrl,
    quantity,
  };
}

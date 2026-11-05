/**
 * Absolute download links for PDF/Excel files opened outside the ERP.
 * Reuse the exact resource selection used by Kits, Proposals and Shopping Cart:
 * multiple attachments -> public capability ZIP; one -> file; none -> legacy URL.
 */
import { cartProductResource } from "./shopping-cart-product-resource.mjs";
import { createProductFileShareToken } from "./product-file-public-share.mjs";

export function exportDocumentOrigin(request, configuredOrigin = "") {
  const value = String(configuredOrigin || request?.url || "").trim();
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("The public ERP URL is not available for exported file links."); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("The public ERP URL is not valid for exported file links.");
  }
  return parsed.origin;
}

export function exportProductResourceUrl(product, { origin, fallbackUrl = "", shareSecret } = {}) {
  const resource = cartProductResource(product);
  if (resource.isZip) {
    // Exported files may be opened from Excel or a PDF reader, where a relative
    // /next/api URL would not resolve against the ERP site.
    const base = exportDocumentOrigin({ url: origin });
    // A random-looking signature is embedded in the exported PDF/Excel link.
    // Recipients can download without an ERP session, but cannot enumerate
    // products by changing `id` or obtain other bundles with this signature.
    const url = new URL(resource.href, base);
    url.searchParams.set("share", createProductFileShareToken(product, { secret: shareSecret }));
    return url.toString();
  }
  return String(resource.href || fallbackUrl || "").trim();
}

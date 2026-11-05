/**
 * The same per-product ZIP endpoint as Kits, with legacy external links kept
 * for single-file and URL-only products.  No request is made until the user
 * explicitly clicks the product action.
 */
export function cartProductResource(product) {
  const files = Array.isArray(product?.attachments)
    ? product.attachments.filter((file) => typeof file?.url === "string" && file.url)
    : [];
  const multiFile = files.length > 1 && Boolean(String(product?.id ?? "").trim());
  return {
    href: multiFile
      ? `/next/api/products/files-download?id=${encodeURIComponent(String(product.id).trim())}`
      : (files[0]?.url || product?.url || ""),
    isZip: multiFile,
    fileCount: files.length,
  };
}

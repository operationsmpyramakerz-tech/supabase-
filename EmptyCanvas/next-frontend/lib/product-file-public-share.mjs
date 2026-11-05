/**
 * A document-export capability link for one product's current attachment bundle.
 * Only server code may sign or validate these links. This is NOT an authorization
 * token for any other ERP endpoint: it grants download of this exact ZIP only.
 *
 * Existing production Supabase server secrets provide a stable fallback so that
 * a dedicated ERP_PRODUCT_FILE_SHARE_SECRET does not have to be provisioned
 * during rollout. Prefer a separately generated >=32-character secret when able.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function signingSecret(explicit) {
  const options = explicit !== undefined ? [explicit] : [
    process.env.ERP_PRODUCT_FILE_SHARE_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SESSION_SECRET,
  ];
  const secret = options.map((value) => String(value || "").trim()).find((value) => value.length >= 32);
  if (!secret) {
    const error = new Error("Public product download signing requires a server-side secret of at least 32 characters.");
    error.status = 503;
    throw error;
  }
  return secret;
}

function bundlePayload(product) {
  const id = String(product?.id ?? "").trim();
  const files = product?.attachments;
  if (!id || !Array.isArray(files) || files.length < 2 || files.length > 10) {
    throw new Error("A product with multiple uploaded files is required.");
  }
  // Binding the signature to the stored metadata invalidates old share links
  // when a file is removed, replaced, or edited. Never sign user-supplied URLs.
  return JSON.stringify(["erp-product-attachment-zip-v1", id, files.map((file) => [
    String(file?.name || ""),
    String(file?.url || ""),
    Number(file?.size),
  ])]);
}

export function createProductFileShareToken(product, { secret } = {}) {
  return createHmac("sha256", signingSecret(secret))
    .update(bundlePayload(product), "utf8")
    .digest("base64url");
}

export function verifyProductFileShareToken(product, suppliedToken, { secret } = {}) {
  if (typeof suppliedToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(suppliedToken)) return false;
  let expected;
  try { expected = createProductFileShareToken(product, { secret }); }
  catch { return false; }
  const actualBuffer = Buffer.from(suppliedToken, "ascii");
  const expectedBuffer = Buffer.from(expected, "ascii");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

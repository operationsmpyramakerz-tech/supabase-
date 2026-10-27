/**
 * Decode a browser FileReader attachment with a strict, size-bounded Base64
 * parser. This avoids allocating an unbounded decoded Buffer and avoids Node's
 * permissive decoder silently accepting non-Base64 characters.
 */
function reject(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.code = status === 413 ? "ATTACHMENT_TOO_LARGE" : "ATTACHMENT_INVALID";
  throw error;
}

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

export function parseDirectAttachmentDataUrl(dataUrl, { maxBytes = 10 * 1024 * 1024, mimeHint = "" } = {}) {
  if (typeof dataUrl !== "string" || dataUrl.slice(0, 5).toLowerCase() !== "data:") {
    reject("Choose a valid Base64 attachment first.");
  }
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || separator > 200) reject("Choose a valid Base64 attachment first.");
  const header = dataUrl.slice(0, separator);
  const match = /^data:([^;,]+)?;base64$/i.exec(header);
  if (!match) reject("Choose a valid Base64 attachment first.");
  const declaredMime = String(match[1] || "").toLowerCase();
  const hint = String(mimeHint || "").trim().toLowerCase();
  if ((declaredMime && !MIME_PATTERN.test(declaredMime)) || (hint && !MIME_PATTERN.test(hint))) {
    reject("Invalid attachment content type.");
  }
  const encoded = dataUrl.slice(separator + 1);
  if (!encoded.length) reject("The selected attachment is empty.");
  const limit = Math.floor(Number(maxBytes));
  if (!Number.isSafeInteger(limit) || limit < 1) reject("Attachment upload size is not configured.", 503);
  const maximumEncodedLength = 4 * Math.ceil(limit / 3);
  if (encoded.length > maximumEncodedLength) reject("The attachment must be 10 MB or less.", 413);
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    reject("Invalid Base64 attachment data.");
  }
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decodedLength = encoded.length / 4 * 3 - padding;
  if (decodedLength <= 0) reject("The selected attachment is empty.");
  if (decodedLength > limit) reject("The attachment must be 10 MB or less.", 413);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== decodedLength) reject("Invalid Base64 attachment data.");
  return { bytes, contentType: hint || declaredMime || "application/octet-stream" };
}

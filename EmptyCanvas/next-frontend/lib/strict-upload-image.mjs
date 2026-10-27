// Shared content validation for image uploads: do not trust client MIME alone.
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;


function imageError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function parseStrictImageDataUrl(dataUrl, { label = "Image", maxBytes = DEFAULT_MAX_IMAGE_BYTES } = {}) {
  const maxEncodedLength = Math.ceil(maxBytes * 4 / 3) + 100;
  const raw = typeof dataUrl === "string" ? dataUrl : "";
  if (raw.length > maxEncodedLength) throw imageError(`${label} must be ${Math.ceil(maxBytes / (1024 * 1024))} MB or less.`, 413);
  const match = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw imageError("Invalid image data.");
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxBytes) {
    throw imageError(buffer.length > maxBytes ? `${label} must be ${Math.ceil(maxBytes / (1024 * 1024))} MB or less.` : "Invalid image data.", buffer.length > maxBytes ? 413 : 400);
  }
  if (buffer.toString("base64").replace(/=+$/, "") !== match[2].replace(/=+$/, "")) {
    throw imageError("Invalid image data.");
  }
  const png = mime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const jpeg = mime === "image/jpeg" && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = mime === "image/webp" && buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw imageError("The uploaded file is not a valid PNG, JPG, or WEBP image.");
  return { mime, buffer };
}


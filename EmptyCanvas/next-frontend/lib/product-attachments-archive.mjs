/**
 * Downloadable product resources. File URLs are already validated when a product
 * is serialized; recheck the host/path here before fetching on the server.
 * This module has no Next/JSZip imports so it can be tested without services.
 */
export const PRODUCT_ARCHIVE_MAX_FILES = 10;
export const PRODUCT_ARCHIVE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PRODUCT_ARCHIVE_MAX_TOTAL_BYTES = PRODUCT_ARCHIVE_MAX_FILES * PRODUCT_ARCHIVE_MAX_FILE_BYTES;

function error(message, status = 400) {
  const result = new Error(message);
  result.status = status;
  return result;
}

export function safeArchiveFileName(value) {
  const cleaned = String(value ?? "")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "attachment";
}

export function archiveEntries(attachments, { supabaseUrl, bucket } = {}) {
  if (!Array.isArray(attachments) || attachments.length < 2 || attachments.length > PRODUCT_ARCHIVE_MAX_FILES) {
    throw error("Select a product with multiple uploaded files.");
  }
  let origin;
  try { origin = new URL(supabaseUrl); } catch { throw error("File storage is not configured.", 503); }
  const prefix = `/storage/v1/object/public/${bucket}/products/files/`;
  const names = new Set();
  let plannedBytes = 0;
  return attachments.map((item) => {
    let target;
    try { target = new URL(item?.url); } catch { throw error("Invalid product file reference."); }
    let path;
    try { path = decodeURIComponent(target.pathname); } catch { throw error("Invalid product file reference."); }
    if (!/^https?:$/.test(target.protocol) || target.origin !== origin.origin ||
        !path.startsWith(prefix) || path.includes("..") || target.search || target.hash) {
      throw error("Invalid product file reference.");
    }
    const bytes = Number(item?.size);
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > PRODUCT_ARCHIVE_MAX_FILE_BYTES) {
      throw error("Invalid product file size.");
    }
    plannedBytes += bytes;
    if (plannedBytes > PRODUCT_ARCHIVE_MAX_TOTAL_BYTES) throw error("Product files exceed the archive limit.", 413);

    const originalName = safeArchiveFileName(item?.name);
    const extOffset = originalName.lastIndexOf(".");
    const root = extOffset > 0 ? originalName.slice(0, extOffset) : originalName;
    const extension = extOffset > 0 ? originalName.slice(extOffset) : "";
    let name = originalName;
    for (let suffix = 2; names.has(name.toLocaleLowerCase()); suffix += 1) {
      name = `${root} (${suffix})${extension}`;
    }
    names.add(name.toLocaleLowerCase());
    return { name, url: target.toString(), declaredSize: bytes };
  });
}

export async function fetchArchiveEntries(entries, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const downloaded = [];
  let total = 0;
  // Fetch sequentially to minimize RAM and load on the production Storage server.
  for (const entry of entries) {
    let response;
    try {
      response = await fetchImpl(entry.url, {
        method: "GET", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw error(`Could not download ${entry.name} from storage.`, 502); }
    if (!response.ok || !response.body) throw error(`Could not download ${entry.name} from storage.`, 502);
    const statedSize = Number(response.headers?.get?.("content-length"));
    if (statedSize > PRODUCT_ARCHIVE_MAX_FILE_BYTES) {
      await response.body.cancel?.().catch(() => {});
      throw error(`${entry.name} is too large to include.`, 413);
    }
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > PRODUCT_ARCHIVE_MAX_FILE_BYTES || total + bytes > PRODUCT_ARCHIVE_MAX_TOTAL_BYTES) {
          throw error(`${entry.name} exceeds the file size limit.`, 413);
        }
        chunks.push(chunk);
      }
    } catch (cause) {
      if (cause?.status === 413) throw cause;
      throw error(`Could not read ${entry.name} from storage.`, 502);
    }
    if (!bytes) throw error(`${entry.name} is empty.`, 502);
    const content = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes);
    downloaded.push({ name: entry.name, content });
    total += bytes;
  }
  return downloaded;
}

export function productArchiveName(value) {
  const base = safeArchiveFileName(value)
    .replace(/[";:\\]/g, "-")
    .slice(0, 90)
    .trim() || "product";
  return `${base}-files.zip`;
}

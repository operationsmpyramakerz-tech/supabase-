import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { fetchProductImageResource } from "../../../../lib/secure-product-image-fetch.mjs";
import { getProductImageSources } from "../../../../lib/products-service";
import { getSupabaseConfig } from "../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const SAFE_RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

function text(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    const clean = text(value).replace(/&amp;/g, "&");
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }
  return output;
}

function absoluteUrl(value, baseUrl) {
  const raw = text(value).replace(/&amp;/g, "&");
  if (!raw) return "";
  try {
    if (/^data:image\//i.test(raw)) return raw;
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return "";
  }
}

function imageCandidatesFromHtml(html, pageUrl) {
  const source = String(html || "").slice(0, 1_500_000);
  const found = [];
  const add = (value) => {
    const url = absoluteUrl(value, pageUrl);
    if (url && /^https?:\/\//i.test(url)) found.push(url);
  };

  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/ig,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/ig,
    /<link[^>]+rel=["'][^"']*image_src[^"']*["'][^>]+href=["']([^"']+)["']/ig,
    /<img[^>]+(?:data-src|data-original|data-lazy-src|src)=["']([^"']+)["']/ig,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) && found.length < 24) add(match[1]);
  }

  // A lot of commerce sites expose the product image only in JSON-LD or in a
  // serialized hydration object. Pull likely image values from those blobs too.
  const jsonImagePatterns = [
    /["']image["']\s*:\s*["']([^"']+)["']/ig,
    /["']image(?:Url|URL|_url)["']\s*:\s*["']([^"']+)["']/ig,
    /["']thumbnail(?:Url|URL|_url)?["']\s*:\s*["']([^"']+)["']/ig,
  ];
  for (const pattern of jsonImagePatterns) {
    let match;
    while ((match = pattern.exec(source)) && found.length < 36) add(match[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/"));
  }

  return unique(found);
}

function sniffImageType(buffer, fallbackUrl = "") {
  if (!buffer?.length) return "";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp" && ["avif", "avis"].includes(buffer.toString("ascii", 8, 12))) return "image/avif";
  if (buffer.length >= 6) {
    const signature = buffer.toString("ascii", 0, 6);
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  const extension = text(fallbackUrl).split(/[?#]/)[0].toLowerCase();
  if (extension.endsWith(".webp")) return "image/webp";
  if (extension.endsWith(".avif")) return "image/avif";
  if (/\.(jpe?g)$/i.test(extension)) return "image/jpeg";
  if (extension.endsWith(".png")) return "image/png";
  if (extension.endsWith(".gif")) return "image/gif";
  return "";
}

async function fetchImage(url, { referer = "" } = {}) {
  if (/^data:image\//i.test(url)) {
    const match = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) return null;
    const body = Buffer.from(match[2], "base64");
    if (!body.length || body.length > MAX_IMAGE_BYTES || !SAFE_RASTER_MIMES.has(match[1].toLowerCase())) return null;
    return { body, contentType: match[1].toLowerCase() };
  }
  const { url: supabaseUrl } = getSupabaseConfig();
  const response = await fetchProductImageResource(url, {
    supabaseUrl,
    maxBytes: MAX_IMAGE_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*;q=0.8",
      ...(referer ? { Referer: referer } : {}),
    },
  });
  if (!response?.body?.length) return null;
  const responseType = text(response.headers["content-type"]).split(";")[0].toLowerCase();
  const contentType = responseType.startsWith("image/") ? responseType : sniffImageType(response.body, response.url || url);
  // Never proxy active SVG documents under the app origin.
  if (!SAFE_RASTER_MIMES.has(contentType)) return null;
  return { body: response.body, contentType };
}

async function fetchPageImageCandidates(pageUrl) {
  const { url: supabaseUrl } = getSupabaseConfig();
  const response = await fetchProductImageResource(pageUrl, {
    supabaseUrl, maxBytes: 1_500_000, timeoutMs: FETCH_TIMEOUT_MS,
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response) return [];
  const contentType = text(response.headers["content-type"]).toLowerCase();
  if (contentType.startsWith("image/")) return [response.url || pageUrl];
  return imageCandidatesFromHtml(response.body.toString("utf8"), response.url || pageUrl);
}

function noImage() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Product-Image": "not-found" },
  });
}

export async function GET(request) {
  const gate = featureGate(await getDirectAccountGate("Products"), "products.view");
  if (!gate.ok) return new NextResponse(null, { status: gate.status || 403, headers: { "Cache-Control": "private, no-store" } });

  try {
    const id = text(new URL(request.url).searchParams.get("id"));
    if (!id) return noImage();
    const source = await getProductImageSources(id);
    if (!source) return noImage();

    const directCandidates = unique(source.imageUrls || []);
    for (const candidate of directCandidates) {
      const image = await fetchImage(candidate, { referer: source.pageUrl || "" });
      if (image) {
        return new NextResponse(image.body, {
          status: 200,
          headers: {
            "Content-Type": image.contentType,
            "Content-Length": String(image.body.length),
            "Cache-Control": "private, max-age=1800",
            "X-Content-Type-Options": "nosniff",
            "X-Product-Image": "stored",
          },
        });
      }
    }

    const pageCandidates = await fetchPageImageCandidates(source.pageUrl);
    for (const candidate of pageCandidates) {
      const image = await fetchImage(candidate, { referer: source.pageUrl || "" });
      if (image) {
        return new NextResponse(image.body, {
          status: 200,
          headers: {
            "Content-Type": image.contentType,
            "Content-Length": String(image.body.length),
            "Cache-Control": "private, max-age=1800",
            "X-Content-Type-Options": "nosniff",
            "X-Product-Image": "page-preview",
          },
        });
      }
    }

    return noImage();
  } catch (error) {
    console.error("GET /next/api/products/image error:", error?.details || error);
    return noImage();
  }
}

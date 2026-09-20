import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { getProductImageSources } from "../../../../lib/products-service";
import { getSupabaseConfig } from "../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;

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

function supabaseAuthHeaders(url) {
  const { url: supabaseUrl, key } = getSupabaseConfig();
  if (!supabaseUrl || !key || !text(url).startsWith(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/`)) return {};
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal, cache: "no-store", redirect: "follow" });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchImage(url, { referer = "" } = {}) {
  if (/^data:image\//i.test(url)) {
    const match = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) return null;
    const body = Buffer.from(match[2], "base64");
    if (!body.length || body.length > MAX_IMAGE_BYTES) return null;
    return { body, contentType: match[1] };
  }
  if (!/^https?:\/\//i.test(url)) return null;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    ...(referer ? { Referer: referer } : {}),
    ...supabaseAuthHeaders(url),
  };
  let response;
  try {
    response = await fetchWithTimeout(url, { headers });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const contentType = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
  if (!contentType.startsWith("image/")) return null;
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return { body: buffer, contentType };
}

async function fetchPageImageCandidates(pageUrl) {
  if (!/^https?:\/\//i.test(text(pageUrl))) return [];
  let response;
  try {
    response = await fetchWithTimeout(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];

  const contentType = text(response.headers.get("content-type")).toLowerCase();
  if (contentType.startsWith("image/")) return [response.url || pageUrl];
  const html = await response.text().catch(() => "");
  return imageCandidatesFromHtml(html, response.url || pageUrl);
}

function noImage() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Product-Image": "not-found" },
  });
}

export async function GET(request) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return noImage();

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

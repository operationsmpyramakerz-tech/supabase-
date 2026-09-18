import "server-only";

import { performance } from "node:perf_hooks";
import { recordPerformanceSample } from "./performance-profiler";

function cleanBaseUrl(raw) {
  return String(raw || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1\/?$/i, "");
}

export function getSupabaseConfig() {
  const url = cleanBaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "",
  ).trim();

  return {
    url,
    key,
    productsTable: String(process.env.SUPABASE_PRODUCTS_TABLE || "products").trim() || "products",
    productTagsTable: String(process.env.SUPABASE_PRODUCT_TAGS_TABLE || process.env.SUPABASE_PRODUCTS_TAGS_TABLE || "product_tags").trim() || "product_tags",
    productUnitsTable: String(process.env.SUPABASE_PRODUCT_UNITS_TABLE || process.env.SUPABASE_PRODUCTS_UNITS_TABLE || "product_units").trim() || "product_units",
    storageBucket: String(process.env.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_BUCKET || "operations-files").trim() || "operations-files",
  };
}

export function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig();
  return /^https:\/\//i.test(url) && !!key;
}

function ensureConfigured() {
  if (isSupabaseConfigured()) return getSupabaseConfig();
  const error = new Error("Supabase is not configured for the Next.js frontend.");
  error.code = "SUPABASE_NOT_CONFIGURED";
  error.status = 500;
  throw error;
}

function encodeTableName(value) {
  return encodeURIComponent(String(value || "").trim());
}

function encodeFilterValue(value) {
  return encodeURIComponent(String(value ?? ""));
}

function encodeStoragePath(value) {
  return String(value || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || typeof value === "undefined" || value === "") continue;
    query.set(key, String(value));
  }
  const raw = query.toString();
  return raw ? `?${raw}` : "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableStatus(status) {
  const value = Number(status) || 0;
  return !value || value === 408 || value === 425 || value === 429 || value >= 500;
}

export async function supabaseRequest(pathname, options = {}) {
  const { url, key } = ensureConfigured();
  const method = String(options.method || "GET").toUpperCase();
  const metricStartedAt = performance.now();
  let metricStatus = 0;
  let metricOk = false;
  let metricAttempts = 0;
  let metricRows = null;
  const metricTable = (() => {
    const first = String(pathname || "").replace(/^\/+/, "").split(/[?\/]/)[0] || "unknown";
    try { return decodeURIComponent(first); } catch { return first; }
  })();
  const metricName = String(options.profileName || `${method} ${metricTable}`).trim().slice(0, 120) || `${method} ${metricTable}`;
  const timeoutMs = Math.max(
    1000,
    Math.min(120000, Number(options.timeoutMs || process.env.SUPABASE_REQUEST_TIMEOUT_MS || 15000) || 15000),
  );
  // Treat timeoutMs as a total request budget, not a fresh timeout for every
  // retry. The old behavior could turn a 15s read into ~45s during a transient
  // Supabase/network issue, which was especially visible during page navigation.
  const requestedAttempts = Number(options.attempts || process.env.SUPABASE_READ_ATTEMPTS || 2) || 2;
  const maxAttempts = method === "GET" ? Math.max(1, Math.min(2, requestedAttempts)) : 1;
  let lastError = null;
  const startedAt = Date.now();

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      metricAttempts = attempt;
      const elapsed = Date.now() - startedAt;
      const remainingMs = timeoutMs - elapsed;
      if (remainingMs <= 0) break;

      const controller = new AbortController();
      const externalSignal = options.signal || null;
      const abortFromCaller = () => controller.abort(externalSignal?.reason);
      if (externalSignal?.aborted) abortFromCaller();
      else externalSignal?.addEventListener?.("abort", abortFromCaller, { once: true });
      const timeout = setTimeout(() => controller.abort(), remainingMs);

      try {
        const headers = {
          apikey: key,
          Authorization: `Bearer ${key}`,
          ...(options.headers || {}),
        };
        if (options.body !== undefined && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

        const response = await fetch(`${url}/rest/v1${pathname}`, {
          method,
          cache: "no-store",
          signal: controller.signal,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });

        const raw = await response.text();
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

        metricStatus = response.status;
        if (!response.ok) {
          const message = data && typeof data === "object"
            ? (data.message || data.details || data.hint || JSON.stringify(data))
            : (raw || `Supabase request failed with status ${response.status}`);
          const error = new Error(message);
          error.status = response.status;
          error.details = data;
          throw error;
        }
        metricOk = true;
        metricRows = Array.isArray(data) ? data.length : null;
        return data;
      } catch (error) {
        let current = error;
        if (error?.name === "AbortError") {
          if (externalSignal?.aborted) {
            current = new Error("Supabase request was cancelled by the caller.");
            current.name = "AbortError";
            current.code = "REQUEST_ABORTED";
            current.status = 499;
          } else {
            current = new Error(`Supabase request timed out after ${timeoutMs} ms.`);
            current.code = "SUPABASE_TIMEOUT";
            current.status = 504;
          }
        }
        metricStatus = Number(current?.status) || metricStatus || 0;
        lastError = current;
        const budgetLeft = timeoutMs - (Date.now() - startedAt);
        const canRetry = method === "GET" && attempt < maxAttempts && retryableStatus(current?.status) && budgetLeft > 220;
        if (!canRetry) throw current;
        await wait(Math.min(140, Math.max(0, budgetLeft - 80)));
      } finally {
        clearTimeout(timeout);
        externalSignal?.removeEventListener?.("abort", abortFromCaller);
      }
    }

    if (lastError) throw lastError;
    const timeoutError = new Error(`Supabase request timed out after ${timeoutMs} ms.`);
    timeoutError.code = "SUPABASE_TIMEOUT";
    timeoutError.status = 504;
    metricStatus = 504;
    throw timeoutError;
  } finally {
    recordPerformanceSample({
      category: "supabase",
      name: metricName,
      durationMs: performance.now() - metricStartedAt,
      ok: metricOk,
      status: metricStatus,
      meta: {
        attempts: metricAttempts || 1,
        ...(metricRows === null ? {} : { rows: metricRows }),
      },
    });
  }
}

export async function select(table, params = {}, options = {}) {
  return await supabaseRequest(`/${encodeTableName(table)}${queryString(params)}`, options);
}

export async function rpc(functionName, args = {}, options = {}) {
  const cleanName = String(functionName || "").trim();
  if (!cleanName) {
    const error = new Error("Supabase RPC function name is required.");
    error.status = 400;
    throw error;
  }
  return await supabaseRequest(`/rpc/${encodeTableName(cleanName)}`, {
    ...options,
    method: "POST",
    body: args && typeof args === "object" ? args : {},
  });
}

export async function selectAll(table, { limit = 1000, order = "", select: selectExpr = "*", profileName = "" } = {}) {
  const params = {
    select: selectExpr,
    limit: String(Math.max(1, Math.min(5000, Number(limit) || 1000))),
  };
  if (order) params.order = order;
  const rows = await select(table, params, profileName ? { profileName } : {});
  return Array.isArray(rows) ? rows : [];
}

export async function selectById(table, id, options = {}) {
  const rows = await supabaseRequest(
    `/${encodeTableName(table)}?select=*&id=eq.${encodeFilterValue(id)}&limit=1`,
    options,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function insert(table, row) {
  const rows = await supabaseRequest(`/${encodeTableName(table)}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function updateById(table, id, row) {
  const rows = await supabaseRequest(
    `/${encodeTableName(table)}?id=eq.${encodeFilterValue(id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: row,
    },
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function updateByIds(table, ids = [], row = {}) {
  const clean = [...new Set((ids || []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!clean.length) return [];
  const inList = clean.map((id) => (/^-?\d+(?:\.\d+)?$/.test(id) ? id : `"${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",");
  const rows = await supabaseRequest(`/${encodeTableName(table)}?id=in.(${encodeURIComponent(inList)})`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(rows) ? rows : [];
}

export async function deleteById(table, id) {
  const rows = await supabaseRequest(
    `/${encodeTableName(table)}?id=eq.${encodeFilterValue(id)}`,
    {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export function storagePublicUrl(objectPath, bucketName = null) {
  const { url, storageBucket } = getSupabaseConfig();
  const bucket = String(bucketName || storageBucket || "").trim();
  const key = String(objectPath || "").replace(/^\/+/, "");
  if (!/^https:\/\//i.test(url) || !bucket || !key) return "";
  return `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(key)}`;
}

export async function createSignedUploadUrl(objectPath, { bucketName = null } = {}) {
  const { url, key, storageBucket } = ensureConfigured();
  const bucket = String(bucketName || storageBucket || "").trim();
  const cleanPath = String(objectPath || "").replace(/^\/+/, "");
  if (!bucket || !cleanPath) {
    const error = new Error("Supabase Storage bucket and object path are required.");
    error.status = 500;
    throw error;
  }

  const response = await fetch(
    `${url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const error = new Error(
      data && typeof data === "object"
        ? (data.message || data.error || JSON.stringify(data))
        : (raw || `Failed to create signed upload URL with status ${response.status}`),
    );
    error.status = response.status;
    error.details = data;
    throw error;
  }

  const token = String(data?.token || "").trim();
  let signedUrl = String(data?.signedUrl || data?.signedURL || data?.url || "").trim();
  const endpoint = `${url}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`;
  if (!signedUrl && token) signedUrl = `${endpoint}?token=${encodeURIComponent(token)}`;
  else if (signedUrl.startsWith("/storage/v1/")) signedUrl = `${url}${signedUrl}`;
  else if (signedUrl.startsWith("/object/")) signedUrl = `${url}/storage/v1${signedUrl}`;
  else if (signedUrl && !/^https?:\/\//i.test(signedUrl)) signedUrl = `${url}/storage/v1/${signedUrl.replace(/^\/+/, "")}`;
  if (token && signedUrl && !/[?&]token=/.test(signedUrl)) {
    signedUrl += `${signedUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  }
  if (!signedUrl) {
    const error = new Error("Supabase Storage did not return a signed upload URL.");
    error.status = 502;
    throw error;
  }

  return {
    bucket,
    path: cleanPath,
    signedUrl,
    publicUrl: storagePublicUrl(cleanPath, bucket),
  };
}

export async function uploadStorageObject(objectPath, buffer, {
  contentType = "application/octet-stream",
  bucketName = null,
  upsert = true,
} = {}) {
  const { url, key, storageBucket } = ensureConfigured();
  const bucket = String(bucketName || storageBucket || "").trim();
  const cleanPath = String(objectPath || "").replace(/^\/+/, "");
  if (!bucket || !cleanPath) {
    const error = new Error("Supabase Storage bucket and object path are required.");
    error.status = 500;
    throw error;
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(
    1000,
    Math.min(120000, Number(process.env.SUPABASE_STORAGE_TIMEOUT_MS || process.env.SUPABASE_REQUEST_TIMEOUT_MS || 20000) || 20000),
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(cleanPath)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": contentType,
          ...(upsert ? { "x-upsert": "true" } : {}),
        },
        body: buffer,
      },
    );
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }

    if (!response.ok) {
      const error = new Error(
        data && typeof data === "object"
          ? (data.message || data.error || JSON.stringify(data))
          : (raw || `Supabase Storage upload failed with status ${response.status}`),
      );
      error.status = response.status;
      error.details = data;
      throw error;
    }

    return {
      path: cleanPath,
      bucket,
      data,
      publicUrl: storagePublicUrl(cleanPath, bucket),
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Supabase Storage upload timed out after ${timeoutMs} ms.`);
      timeoutError.status = 504;
      timeoutError.code = "SUPABASE_STORAGE_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

import "server-only";

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
  const timeoutMs = Math.max(
    1000,
    Math.min(120000, Number(options.timeoutMs || process.env.SUPABASE_REQUEST_TIMEOUT_MS || 15000) || 15000),
  );
  const requestedAttempts = Number(options.attempts || process.env.SUPABASE_READ_ATTEMPTS || 3) || 3;
  const maxAttempts = method === "GET" ? Math.max(1, Math.min(3, requestedAttempts)) : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

      if (!response.ok) {
        const message = data && typeof data === "object"
          ? (data.message || data.details || data.hint || JSON.stringify(data))
          : (raw || `Supabase request failed with status ${response.status}`);
        const error = new Error(message);
        error.status = response.status;
        error.details = data;
        throw error;
      }
      return data;
    } catch (error) {
      let current = error;
      if (error?.name === "AbortError") {
        current = new Error(`Supabase request timed out after ${timeoutMs} ms.`);
        current.code = "SUPABASE_TIMEOUT";
        current.status = 504;
      }
      lastError = current;
      const canRetry = method === "GET" && attempt < maxAttempts && retryableStatus(current?.status);
      if (!canRetry) throw current;
      await wait(attempt === 1 ? 180 : 420);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Supabase request failed.");
}

export async function select(table, params = {}) {
  return await supabaseRequest(`/${encodeTableName(table)}${queryString(params)}`);
}

export async function selectAll(table, { limit = 1000, order = "", select: selectExpr = "*" } = {}) {
  const params = {
    select: selectExpr,
    limit: String(Math.max(1, Math.min(5000, Number(limit) || 1000))),
  };
  if (order) params.order = order;
  const rows = await select(table, params);
  return Array.isArray(rows) ? rows : [];
}

export async function selectById(table, id) {
  const rows = await supabaseRequest(
    `/${encodeTableName(table)}?select=*&id=eq.${encodeFilterValue(id)}&limit=1`,
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
          "x-upsert": upsert ? "true" : "false",
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

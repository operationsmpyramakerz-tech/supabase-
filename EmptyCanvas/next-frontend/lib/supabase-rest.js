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
  };
}

export function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig();
  return /^https:\/\//i.test(url) && !!key;
}

function encodeTableName(value) {
  return encodeURIComponent(String(value || "").trim());
}

async function supabaseRequest(pathname, options = {}) {
  const { url, key } = getSupabaseConfig();
  if (!isSupabaseConfigured()) {
    const error = new Error("Supabase is not configured for the Next.js frontend.");
    error.code = "SUPABASE_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(120000, Number(options.timeoutMs || process.env.SUPABASE_REQUEST_TIMEOUT_MS || 15000) || 15000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/rest/v1${pathname}`, {
      method: options.method || "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(options.headers || {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!response.ok) {
      const message = data && typeof data === "object"
        ? (data.message || data.details || data.hint || JSON.stringify(data))
        : (text || `Supabase request failed with status ${response.status}`);
      const error = new Error(message);
      error.status = response.status;
      error.details = data;
      throw error;
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Supabase request timed out after ${timeoutMs} ms.`);
      timeoutError.code = "SUPABASE_TIMEOUT";
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function selectAll(table, { limit = 1000, order = "" } = {}) {
  const params = new URLSearchParams({ select: "*", limit: String(Math.max(1, Math.min(5000, Number(limit) || 1000))) });
  if (order) params.set("order", order);
  const rows = await supabaseRequest(`/${encodeTableName(table)}?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

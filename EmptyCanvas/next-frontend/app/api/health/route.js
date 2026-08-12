import { getSupabaseConfig, isSupabaseConfigured } from "../../../lib/supabase-rest";

export const dynamic = "force-dynamic";

async function getStorageBucketDiagnostics(config) {
  const result = {
    name: String(config.storageBucket || ""),
    reachable: false,
    exists: false,
    public: null,
    fileSizeLimit: null,
    allowedMimeTypes: null,
    status: null,
    error: "",
  };
  if (!isSupabaseConfigured() || !result.name) return result;
  try {
    const response = await fetch(`${config.url}/storage/v1/bucket/${encodeURIComponent(result.name)}`, {
      method: "GET",
      cache: "no-store",
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
    result.reachable = true;
    result.status = response.status;
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!response.ok) {
      result.error = data?.message || data?.error || `Storage bucket lookup failed with status ${response.status}`;
      return result;
    }
    result.exists = true;
    result.public = typeof data?.public === "boolean" ? data.public : null;
    result.fileSizeLimit = data?.file_size_limit ?? data?.fileSizeLimit ?? null;
    result.allowedMimeTypes = Array.isArray(data?.allowed_mime_types) ? data.allowed_mime_types : null;
    return result;
  } catch (error) {
    result.error = error?.message || String(error || "Storage bucket lookup failed");
    return result;
  }
}

async function tableColumns(config, table) {
  try {
    const response = await fetch(`${config.url}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, {
      method: "GET",
      cache: "no-store",
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!response.ok) return { ok: false, status: response.status, columns: [] };
    const row = Array.isArray(data) ? data[0] : null;
    return { ok: true, status: response.status, columns: row && typeof row === "object" ? Object.keys(row) : [] };
  } catch (error) {
    return { ok: false, status: null, columns: [], error: error?.message || String(error) };
  }
}

export async function GET() {
  const config = getSupabaseConfig();
  const [storage, proposals, proposalItems, kits, kitItems] = await Promise.all([
    getStorageBucketDiagnostics(config),
    tableColumns(config, "product_proposals"),
    tableColumns(config, "product_proposal_items"),
    tableColumns(config, "product_kits"),
    tableColumns(config, "product_kit_items"),
  ]);
  return Response.json({
    ok: true,
    service: "operations-hub-next-frontend",
    status: "ready",
    supabase: {
      configured: isSupabaseConfigured(),
      urlConfigured: /^https:\/\//i.test(String(config.url || "")),
      keyConfigured: !!String(config.key || "").trim(),
      storage,
      proposalKitColumns: {
        product_proposals: proposals,
        product_proposal_items: proposalItems,
        product_kits: kits,
        product_kit_items: kitItems,
      },
    },
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

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
    const response = await fetch(
      `${config.url}/storage/v1/bucket/${encodeURIComponent(result.name)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
      },
    );

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
    result.allowedMimeTypes = Array.isArray(data?.allowed_mime_types)
      ? data.allowed_mime_types
      : (Array.isArray(data?.allowedMimeTypes) ? data.allowedMimeTypes : null);
    return result;
  } catch (error) {
    result.error = error?.message || String(error || "Storage bucket lookup failed");
    return result;
  }
}

async function logProposalKitSchema(config) {
  if (!isSupabaseConfigured()) return;
  try {
    const response = await fetch(`${config.url}/rest/v1/`, {
      method: "GET",
      cache: "no-store",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: "application/openapi+json, application/json",
      },
    });
    if (!response.ok) {
      console.warn(`[schema-probe] PostgREST OpenAPI failed with ${response.status}`);
      return;
    }
    const doc = await response.json();
    const definitions = doc?.definitions || doc?.components?.schemas || {};
    const candidates = {};
    for (const [name, definition] of Object.entries(definitions)) {
      if (!/(proposal|kit)/i.test(name)) continue;
      candidates[name] = Object.keys(definition?.properties || {});
    }
    const paths = Object.keys(doc?.paths || {}).filter((path) => /(proposal|kit)/i.test(path));
    console.info(`[schema-probe] ${JSON.stringify({ candidates, paths })}`);
  } catch (error) {
    console.warn(`[schema-probe] ${error?.message || String(error)}`);
  }
}

export async function GET() {
  const config = getSupabaseConfig();
  const [storage] = await Promise.all([
    getStorageBucketDiagnostics(config),
    logProposalKitSchema(config),
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
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

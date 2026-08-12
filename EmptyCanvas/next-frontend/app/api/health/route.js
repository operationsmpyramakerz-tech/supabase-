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

async function getProposalKitSchema(config) {
  const empty = { candidates: {}, paths: [], status: null, error: "" };
  if (!isSupabaseConfigured()) return empty;
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
    empty.status = response.status;
    if (!response.ok) {
      empty.error = `PostgREST OpenAPI failed with ${response.status}`;
      return empty;
    }
    const doc = await response.json();
    const definitions = doc?.definitions || doc?.components?.schemas || {};
    for (const [name, definition] of Object.entries(definitions)) {
      if (!/(proposal|kit)/i.test(name)) continue;
      empty.candidates[name] = Object.keys(definition?.properties || {});
    }
    empty.paths = Object.keys(doc?.paths || {}).filter((path) => /(proposal|kit)/i.test(path));
    return empty;
  } catch (error) {
    empty.error = error?.message || String(error);
    return empty;
  }
}

export async function GET() {
  const config = getSupabaseConfig();
  const [storage, schemaProbe] = await Promise.all([
    getStorageBucketDiagnostics(config),
    getProposalKitSchema(config),
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
      schemaProbe,
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

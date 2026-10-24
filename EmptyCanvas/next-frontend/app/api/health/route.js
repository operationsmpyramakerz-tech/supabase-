import { getSupabaseConfig, isSupabaseConfigured } from "../../../lib/supabase-rest";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { isTrustedLegacyAdmin } from "../../../lib/admin-identity-policy.mjs";

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

export async function GET(request) {
  // Liveness probes are public, but must not disclose infrastructure settings,
  // private bucket names, PostgREST errors or configured service features.
  const details = new URL(request.url).searchParams.get("details") === "1";
  if (!details) {
    return Response.json({ ok: true, status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  }
  const gate = await getDirectAccountGate([]);
  if (!gate?.ok || !isTrustedLegacyAdmin(gate.account || {})) {
    return Response.json({ ok: false, error: "Diagnostics access denied." }, {
      status: gate?.ok ? 403 : (gate?.status === 401 ? 401 : 403),
      headers: { "Cache-Control": "no-store" },
    });
  }
  const config = getSupabaseConfig();
  const storage = await getStorageBucketDiagnostics(config);
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
  }, { headers: { "Cache-Control": "no-store" } });
}

import { getSupabaseConfig, isSupabaseConfigured } from "../../../lib/supabase-rest";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getSupabaseConfig();
  return Response.json({
    ok: true,
    service: "operations-hub-next-frontend",
    status: "ready",
    supabase: {
      configured: isSupabaseConfigured(),
      urlConfigured: /^https:\/\//i.test(String(config.url || "")),
      keyConfigured: !!String(config.key || "").trim(),
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

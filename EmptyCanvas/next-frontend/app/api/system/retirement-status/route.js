import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const directSessionConfigured = Boolean(
    String(process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || "").trim() ||
      (String(process.env.UPSTASH_REDIS_REST_URL || "").trim() &&
        String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()),
  );
  const sessionSecretConfigured = Boolean(String(process.env.SESSION_SECRET || "").trim());

  return NextResponse.json(
    {
      ok: true,
      phase: 46,
      source: "next-direct",
      legacyBusinessApiDependency: false,
      legacyNetworkFallbackEnabled: false,
      supabaseConfigured: isSupabaseConfigured(),
      directSessionConfigured,
      sessionSecretConfigured,
      pwaAssetsOwnedByNext: true,
      notificationCronOwnedByNext: true,
      retirementReady:
        isSupabaseConfigured() && directSessionConfigured && sessionSecretConfigured,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

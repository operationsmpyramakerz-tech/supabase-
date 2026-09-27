import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function configured(...names) {
  return names.some((name) => Boolean(String(process.env[name] || "").trim()));
}

export async function GET() {
  const directSessionConfigured = Boolean(
    configured("UPSTASH_REDIS_URL", "REDIS_URL") ||
      (configured("UPSTASH_REDIS_REST_URL") && configured("UPSTASH_REDIS_REST_TOKEN")),
  );
  const sessionSecretConfigured = configured("SESSION_SECRET");
  const supabaseConfigured = isSupabaseConfigured();
  const pushConfigured = configured("VAPID_PUBLIC_KEY") && configured("VAPID_PRIVATE_KEY");
  const cronProtected = configured("CRON_SECRET");
  const legacyOriginStillConfigured = configured(
    "LEGACY_BACKEND_ORIGIN",
    "NEXT_FRONTEND_ORIGIN",
    "NEXT_FRONTEND_PUBLIC_ORIGIN",
  );

  return NextResponse.json(
    {
      ok: true,
      phase: 48,
      source: "next-only",
      deploymentMode: "next-primary",
      legacyBackendRequired: false,
      legacyBusinessApiDependency: false,
      legacyNetworkFallbackEnabled: false,
      legacyCompatibilityAdapterNetworkAccess: false,
      gitSyncSafeDynamicCompatibilityCallers: 4,
      legacyCompatibilityApiRoutesOwnedByNext: true,
      legacyPageRedirectsOwnedByNext: true,
      legacyVercelRuntimeRequired: false,
      supabaseConfigured,
      directSessionConfigured,
      sessionSecretConfigured,
      pushConfigured,
      cronProtected,
      pwaAssetsOwnedByNext: true,
      notificationCronOwnedByNext: true,
      legacyOriginStillConfigured,
      retirementReady: supabaseConfigured && directSessionConfigured && sessionSecretConfigured,
      cleanup: {
        canRemoveLegacyBackendOriginFromNext: true,
        canDetachLegacyBackendDomainAfterCutover: true,
        canDeleteLegacyVercelProjectAfterRollbackWindow: true,
        nextRuntimeIsolatedFromExpress: true,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

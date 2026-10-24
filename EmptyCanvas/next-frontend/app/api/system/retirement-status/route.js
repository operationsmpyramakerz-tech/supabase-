import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "../../../../lib/supabase-rest";
import { validateVapidSettings } from "../../../../lib/push-vapid-config";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { isTrustedLegacyAdmin } from "../../../../lib/admin-identity-policy.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function configured(...names) {
  return names.some((name) => Boolean(String(process.env[name] || "").trim()));
}

export async function GET(request) {
  if (new URL(request.url).searchParams.get("details") !== "1") {
    return NextResponse.json({ ok: true, source: "next-only" }, { headers: { "Cache-Control": "no-store" } });
  }
  const gate = await getDirectAccountGate([]);
  if (!gate?.ok || !isTrustedLegacyAdmin(gate.account || {})) {
    return NextResponse.json({ ok: false, error: "Diagnostics access denied." }, {
      status: gate?.ok ? 403 : (gate?.status === 401 ? 401 : 403),
      headers: { "Cache-Control": "no-store" },
    });
  }
  const directSessionConfigured = Boolean(
    configured("UPSTASH_REDIS_URL", "REDIS_URL") ||
      (configured("UPSTASH_REDIS_REST_URL") && configured("UPSTASH_REDIS_REST_TOKEN")),
  );
  const sessionSecretConfigured = configured("SESSION_SECRET");
  const supabaseConfigured = isSupabaseConfigured();
  const pushConfigured = validateVapidSettings().enabled;
  const cronProtected = configured("CRON_SECRET");
  return NextResponse.json(
    {
      ok: true,
      phase: 49,
      source: "next-only",
      repositoryMode: "next-supabase-only",
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
      retirementReady: supabaseConfigured && directSessionConfigured && sessionSecretConfigured,
      cleanup: {
        legacySourceTreeRequired: false,
        parentForwardingConfigRequired: false,
        expressDependenciesRequired: false,
        nextRuntimeIsolatedFromExpress: true,
        repositoryCleanupComplete: true,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

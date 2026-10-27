import { NextResponse } from "next/server";
import { clearDirectSessionAccountCaches } from "../../../../lib/direct-session-account";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { clearUsersCenterReadCaches } from "../../../../lib/users-center-data";
import { invalidateTeamMembersLiteCache, invalidateTeamMemberPublicProfileCache } from "../../../../lib/team-members-service";
import { clearKpisCache } from "../../../../lib/kpis-data";
import { invalidateB2cCache } from "../../../../lib/b2c-data";
import { invalidateStocktakingReadCaches } from "../../../../lib/stocktaking-data";
import { invalidateReviewerVisibility } from "../../../../lib/reviewer-visibility-service";
import { invalidateLegacyOperationsCaches } from "../../../../lib/operations-orders-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate?.ok) return NextResponse.json({ error: gate?.error || "Authentication required." }, { status: gate?.status || 401, headers: { "Cache-Control": "no-store" } });
  clearDirectSessionAccountCaches();
  clearUsersCenterReadCaches();
  invalidateTeamMembersLiteCache();
  invalidateTeamMemberPublicProfileCache();
  clearKpisCache();
  invalidateB2cCache();
  invalidateStocktakingReadCaches();
  invalidateReviewerVisibility();
  await Promise.allSettled([invalidateLegacyOperationsCaches(gate.account || {})]);
  return NextResponse.json({
    success: true,
    freshToken: Date.now(),
    cache: {
      clearedNextMemory: true,
      operationsCacheInvalidationRequested: true,
      source: "next-direct",
    },
  }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

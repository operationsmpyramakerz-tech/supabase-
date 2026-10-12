import { NextResponse } from "next/server";
import { performance } from "node:perf_hooks";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { loadCurrentOrderDetails } from "../../../../../lib/current-orders-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

function cleanIds(body = {}) {
  return [...new Set((Array.isArray(body?.orderIds) ? body.orderIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .slice(0, 500);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const orderIds = cleanIds(body);
  if (!orderIds.length) return noStore({ error: "orderIds required" }, { status: 400 });

  const authStartedAt = performance.now();
  const authStages = {};
  const gate = await getLegacyAccountGate(["Current Orders"], { timings: authStages });
  const authMs = performance.now() - authStartedAt;
  // Expose stage timings to browser DevTools without sending order payloads
  // into logs or affecting private/no-store response semantics.
  const timing = (detailsMs = 0, stages = {}) => {
    const parts = [`auth;dur=${authMs.toFixed(1)}`, `details;dur=${detailsMs.toFixed(1)}`];
    for (const name of ["authStore", "authRevocation", "authSession", "authMember", "authPages", "authAccess", "authPermissions", "authWait"]) {
      if (Number.isFinite(authStages[name])) parts.push(`${name};dur=${authStages[name].toFixed(1)}`);
    }
    // Opt-in breakdown in DevTools; timings contain durations only, never data.
    for (const name of ["db", "bundle", "fastPath", "bundleInvalid", "bundleError", "bundleErrorStatus", "bundleProductMiss", "bundleKitOrphans", "bundleProposalRecovery", "proposalUnresolved", "proposalRecovered", "proposalFallbackTags", "kitHeaders", "kitItems", "kitFullSnapshot", "kitTargetFailed", "kitTargetStatus", "visibility", "prepare", "enrich"]) {
      if (Number.isFinite(stages[name])) parts.push(`${name};dur=${stages[name].toFixed(1)}`);
    }
    return { "Server-Timing": parts.join(", ") };
  };
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503, headers: timing() });

  const detailsStartedAt = performance.now();
  const stages = {};
  try {
    const items = await loadCurrentOrderDetails({ account: gate.account, orderIds, timings: stages });
    if (Array.isArray(items)) return noStore(items, { headers: timing(performance.now() - detailsStartedAt, stages) });
    return noStore({ error: "Current Orders direct Supabase data is unavailable." }, { status: 503, headers: timing(performance.now() - detailsStartedAt, stages) });
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load order details from Supabase." },
      { status: Number(error?.status) || 502, headers: timing(performance.now() - detailsStartedAt, stages) },
    );
  }
}

import { NextResponse } from "next/server";
import {
  eventsDataError,
  hasEventRequestsAdminAccess,
  listGovernorateRates,
} from "../../../../lib/events-data";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, { ...init, headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) } });
}

export async function GET(request) {
  const gate = await getDirectAccountGate(["Event Requests"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  const viewGate = featureGate(gate, "events.requests.view");
  if (!viewGate.ok) return json({ ok: false, error: viewGate.error }, { status: viewGate.status || 403 });
  const url = new URL(request.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";
  try {
    const rates = await listGovernorateRates({ includeInactive, force });
    return json({
      ok: true,
      rates,
      canEdit: hasEventRequestsAdminAccess(gate.account || {}) && featureAllowed(gate.account, "events.requests.governorate_rates"),
      source: "supabase-next",
    });
  } catch (error) {
    console.error("[events] direct governorate rates failed:", error?.details || error?.message || error);
    return json({ ok: false, rates: [], error: eventsDataError(error) }, { status: error?.status || 502 });
  }
}

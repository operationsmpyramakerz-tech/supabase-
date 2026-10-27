import { NextResponse } from "next/server";
import { listEventTypes, eventsDataError } from "../../../../lib/events-data";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { getDirectAccountGate } from "../../../../lib/products-auth";

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
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";
  try {
    return json({ ok: true, types: await listEventTypes({ force }), source: "supabase-next" });
  } catch (error) {
    console.error("[events] direct types failed:", error?.details || error?.message || error);
    return json({ ok: false, types: [], error: eventsDataError(error) }, { status: error?.status || 502 });
  }
}

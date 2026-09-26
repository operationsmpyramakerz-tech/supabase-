import { NextResponse } from "next/server";
import { listEventComponentCategories, eventsDataError } from "../../../../lib/events-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, { ...init, headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) } });
}

export async function GET(request) {
  const gate = await getDirectAccountGate(["Event Requests", "Event Components"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  const url = new URL(request.url);
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";
  try {
    return json({ ok: true, categories: await listEventComponentCategories({ force }), source: "supabase-next" });
  } catch (error) {
    console.error("[events] direct component categories failed:", error?.details || error?.message || error);
    return json({ ok: false, categories: [], error: eventsDataError(error) }, { status: error?.status || 502 });
  }
}

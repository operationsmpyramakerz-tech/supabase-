import { NextResponse } from "next/server";
import { listEvents, eventsDataError } from "../../../lib/events-data";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { measurePerformance } from "../../../lib/performance-profiler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

async function GETImpl(request) {
  const gate = await getDirectAccountGate(["Event Calendar", "Event Requests"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const force = url.searchParams.has("_ts") || url.searchParams.get("_fresh") === "1";

  try {
    const events = await listEvents({ includeArchived, status, search, force });
    return json({ ok: true, events, source: "supabase-next" });
  } catch (error) {
    console.error("[events] direct list failed:", error?.details || error?.message || error);
    return json({ ok: false, events: [], error: eventsDataError(error) }, { status: error?.status || 502 });
  }
}

export async function GET(request) {
  return await measurePerformance("route", "events.list", async () => await GETImpl(request), { method: "GET" });
}

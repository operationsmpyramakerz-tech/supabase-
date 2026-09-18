import { NextResponse } from "next/server";
import { listEventTypes, eventsDataError } from "../../../../lib/events-data";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, { ...init, headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) } });
}

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Event Requests"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  const force = new URL(request.url).searchParams.has("_ts");
  try {
    return json({ ok: true, types: await listEventTypes({ force }), source: "supabase-next" });
  } catch (error) {
    const legacy = await fetchLegacyJson("/api/events/types", { timeoutMs: 20_000, fresh: force });
    if (legacy.ok && legacy.data) return json({ ...legacy.data, source: legacy.data?.source || "legacy" }, { status: legacy.status || 200 });
    return json({ ok: false, types: [], error: legacy.error || legacy.data?.error || eventsDataError(error) }, { status: legacy.status || error?.status || 502 });
  }
}

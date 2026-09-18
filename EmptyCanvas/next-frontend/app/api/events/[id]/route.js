import { NextResponse } from "next/server";
import { getEvent, eventsDataError } from "../../../../lib/events-data";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(_request, { params }) {
  const gate = await getLegacyAccountGate(["Event Calendar", "Event Requests"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const resolved = await params;
  const id = String(resolved?.id || "").trim();
  try {
    const event = await getEvent(id);
    if (!event) return json({ ok: false, error: "Event request was not found." }, { status: 404 });
    return json({ ok: true, event, source: "supabase-next" });
  } catch (error) {
    const legacy = await fetchLegacyJson(`/api/events/${encodeURIComponent(id)}`, { timeoutMs: 20_000, fresh: true });
    if (legacy.ok && legacy.data) return json({ ...legacy.data, source: legacy.data?.source || "legacy" }, { status: legacy.status || 200 });
    return json({ ok: false, error: legacy.error || legacy.data?.error || eventsDataError(error) }, { status: legacy.status || error?.status || 502 });
  }
}

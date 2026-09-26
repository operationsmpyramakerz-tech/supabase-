import { NextResponse } from "next/server";
import { getEvent, eventsDataError } from "../../../../lib/events-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(_request, { params }) {
  const gate = await getDirectAccountGate(["Event Calendar", "Event Requests"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const resolved = await params;
  const id = String(resolved?.id || "").trim();
  try {
    const event = await getEvent(id);
    if (!event) return json({ ok: false, error: "Event request was not found." }, { status: 404 });
    return json({ ok: true, event, source: "supabase-next" });
  } catch (error) {
    console.error("[events] direct detail failed:", error?.details || error?.message || error);
    return json({ ok: false, error: eventsDataError(error) }, { status: error?.status || 502 });
  }
}

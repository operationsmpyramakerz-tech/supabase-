import { NextResponse } from "next/server";
import { getEvent, eventsDataError, listEventComponents } from "../../../../lib/events-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";
import { eventCalendarSummary } from "../../../../lib/events-read-policy";
import { attachProjectResources } from "../../../../lib/event-project-cards.mjs";
import { assertEventRequestScope } from "../../../../lib/event-request-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(request, { params }) {
  const calendar = new URL(request.url).searchParams.get("view") === "calendar";
  const requiredPage = calendar ? "Event Calendar" : "Event Requests";
  const permissionKey = calendar ? "events.calendar.view" : "events.requests.view";
  const gate = await getDirectAccountGate([requiredPage]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  if (!featureAllowed(gate.account, permissionKey))
    return json({ ok: false, error: `Permission ${permissionKey} is not allowed.` }, { status: 403 });

  const resolved = await params;
  const id = String(resolved?.id || "").trim();
  try {
    const event = await getEvent(id);
    if (!event) return json({ ok: false, error: "Event request was not found." }, { status: 404 });
    if (!calendar) await assertEventRequestScope(gate.account, "events.requests.view", event);
    if (!calendar && new URL(request.url).searchParams.get("projectCards") === "1" && event.projects?.length) {
      try {
        event.projects = attachProjectResources(event.projects, await listEventComponents());
      } catch { /* The event remains readable even if the component catalogue is unavailable. */ }
    }
    return json({ ok: true, event: calendar ? eventCalendarSummary(event) : event, source: "supabase-next" });
  } catch (error) {
    console.error("[events] direct detail failed:", error?.details || error?.message || error);
    return json({ ok: false, error: eventsDataError(error) }, { status: error?.status || 502 });
  }
}

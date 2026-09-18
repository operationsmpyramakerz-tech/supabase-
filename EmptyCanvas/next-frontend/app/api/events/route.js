import { NextResponse } from "next/server";
import { listEvents, eventsDataError } from "../../../lib/events-data";
import { fetchLegacyJson } from "../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Event Calendar", "Event Requests"]);
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
    console.warn("[events] direct list failed; using Legacy fallback:", error?.message || error);
    const query = new URLSearchParams();
    if (includeArchived) query.set("includeArchived", "1");
    if (status && status !== "all") query.set("status", status);
    if (search) query.set("search", search);
    const legacy = await fetchLegacyJson(`/api/events${query.toString() ? `?${query.toString()}` : ""}`, { timeoutMs: 25_000, fresh: force });
    if (legacy.ok && legacy.data) return json({ ...legacy.data, source: legacy.data?.source || "legacy" }, { status: legacy.status || 200 });
    return json({ ok: false, events: [], error: legacy.error || legacy.data?.error || eventsDataError(error) }, { status: legacy.status || error?.status || 502 });
  }
}

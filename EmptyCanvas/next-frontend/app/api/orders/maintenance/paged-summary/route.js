import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { loadMaintenanceOrdersPage } from "../../../../../lib/maintenance-orders-data";
import { measurePerformance } from "../../../../../lib/performance-profiler";

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

async function GETImpl(request) {
  const url = new URL(request.url);
  const gate = await getLegacyAccountGate(["Maintenance Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const payload = await loadMaintenanceOrdersPage({
      tab: url.searchParams.get("tab") || "all",
      query: url.searchParams.get("q") || url.searchParams.get("search") || "",
      cursor: url.searchParams.get("cursor"),
      limit: url.searchParams.get("limit"),
      signal: request.signal,
    });
    if (payload) return noStore(payload);
    return noStore({ error: "Maintenance Orders direct Supabase data is unavailable." }, { status: 503 });
  } catch (error) {
    if (request.signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
    return noStore(
      { error: error?.message || "Failed to load Maintenance Orders from Supabase." },
      { status: Number(error?.status) || 502 },
    );
  }
}

export async function GET(request) {
  return await measurePerformance("route", "orders.maintenance.summary", async () => await GETImpl(request), { method: "GET" });
}

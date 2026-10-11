import { NextResponse } from "next/server";
import { performance } from "node:perf_hooks";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { loadMaintenanceOrderDetails } from "../../../../../lib/maintenance-orders-data";

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

function cleanIds(body = {}) {
  return [...new Set((Array.isArray(body?.orderIds) ? body.orderIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .slice(0, 500);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const orderIds = cleanIds(body);
  if (!orderIds.length) return noStore({ error: "orderIds required" }, { status: 400 });

  const authStartedAt = performance.now();
  const gate = await getLegacyAccountGate(["Maintenance Orders"]);
  const authMs = performance.now() - authStartedAt;
  // Expose stage timings to browser DevTools without sending order payloads
  // into logs or affecting private/no-store response semantics.
  const timing = (detailsMs = 0) => ({
    "Server-Timing": `auth;dur=${authMs.toFixed(1)}, details;dur=${detailsMs.toFixed(1)}`,
  });
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503, headers: timing() });

  const detailsStartedAt = performance.now();
  try {
    const items = await loadMaintenanceOrderDetails({ orderIds });
    if (Array.isArray(items)) return noStore(items, { headers: timing(performance.now() - detailsStartedAt) });
    return noStore({ error: "Maintenance Orders direct Supabase data is unavailable." }, { status: 503, headers: timing(performance.now() - detailsStartedAt) });
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load maintenance order details from Supabase." },
      { status: Number(error?.status) || 502, headers: timing(performance.now() - detailsStartedAt) },
    );
  }
}

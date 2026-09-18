import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
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

  const gate = await getLegacyAccountGate(["Maintenance Orders"]);
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  try {
    const items = await loadMaintenanceOrderDetails({ orderIds });
    if (Array.isArray(items)) return noStore(items);
  } catch (error) {
    if (Number(error?.status) === 404) return noStore({ error: error?.message || "Maintenance order not found." }, { status: 404 });
    console.warn("[maintenance-orders] direct details failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson("/api/orders/requested/maintenance-details", {
    method: "POST",
    body: { orderIds },
    timeoutMs: 20_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Failed to load maintenance order details." },
    { status: legacy.status || 502 },
  );
}

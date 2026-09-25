import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { loadMaintenanceFormOptionsDirect } from "../../../../../lib/maintenance-orders-data";

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

async function legacyFallback() {
  const legacy = await fetchLegacyJson("/api/orders/requested/maintenance-form-options", {
    timeoutMs: 20_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Failed to load maintenance form options." },
    { status: legacy.status || 502 },
  );
}

export async function GET() {
  const gate = await getLegacyAccountGate(["Maintenance Orders", "Operations Orders", "Requested Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const result = await loadMaintenanceFormOptionsDirect();
    if (result) return noStore(result);
  } catch (error) {
    console.warn("[maintenance-orders] direct form options failed; using Legacy fallback:", error?.message || error);
  }

  return await legacyFallback();
}

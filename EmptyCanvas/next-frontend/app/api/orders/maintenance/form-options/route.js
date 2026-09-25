import { NextResponse } from "next/server";
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

export async function GET() {
  const gate = await getLegacyAccountGate(["Maintenance Orders", "Operations Orders", "Requested Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const result = await loadMaintenanceFormOptionsDirect();
    if (result) return noStore(result);
    return noStore({ error: "Maintenance form options direct Supabase data is unavailable." }, { status: 503 });
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load maintenance form options from Supabase." },
      { status: Number(error?.status) || 502 },
    );
  }
}

import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { featureAllowed } from "../../../../../lib/feature-permissions-registry";
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
  // Both log and edit workflows need form options, even if Details was denied.
  const permission = gate.ok && ["details", "log", "edit"].some(action =>
    featureAllowed(gate.account, `orders.maintenance.${action}`));
  if (gate.ok && !permission) return noStore({ error: "Maintenance form options access denied." }, { status: 403 });
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const includeChecklist = featureAllowed(gate.account, "orders.maintenance.checklist_view");
    const result = await loadMaintenanceFormOptionsDirect({ includeChecklist });
    if (result) return noStore(result);
    return noStore({ error: "Maintenance form options direct Supabase data is unavailable." }, { status: 503 });
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load maintenance form options from Supabase." },
      { status: Number(error?.status) || 502 },
    );
  }
}

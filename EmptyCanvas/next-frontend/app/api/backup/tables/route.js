import { NextResponse } from "next/server";

import { backupCatalog } from "../../../../lib/backup-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET() {
  const gate = await getDirectAccountGate(["Backup"]);
  if (!gate.ok) {
    return noStore({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const permitted = featureGate(gate, "backup.view");
  if (!permitted.ok) return noStore({ ok: false, error: permitted.error }, { status: permitted.status });
  try {
    return noStore({ ok: true, source: "supabase-next", tables: backupCatalog() });
  } catch (error) {
    console.error("GET /next/api/backup/tables error:", error?.details || error);
    return noStore({ ok: false, error: error?.message || "Failed to load database tables." }, { status: Number(error?.status) || 500 });
  }
}

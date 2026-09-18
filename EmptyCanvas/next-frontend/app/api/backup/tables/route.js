import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
import { backupCatalog } from "../../../../lib/backup-data";
import { getLegacyAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET() {
  const gate = await getLegacyAccountGate(["Backup"]);
  if (!gate.ok) {
    return noStore({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    return noStore({ ok: true, source: "next", tables: backupCatalog() });
  } catch (error) {
    console.warn("[backup] direct catalog failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson("/api/backup/tables", { timeoutMs: 10_000, fresh: true });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { ok: false, error: legacy.error || legacy.data?.error || "Failed to load database tables." },
    { status: legacy.status || 502 },
  );
}

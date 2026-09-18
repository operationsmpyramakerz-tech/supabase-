import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../../lib/legacy-api";
import { loadBackupTableRows } from "../../../../../../lib/backup-data";
import { getLegacyAccountGate } from "../../../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(request, { params }) {
  const resolvedParams = await Promise.resolve(params);
  const tableKey = String(resolvedParams?.key || "").trim();
  if (!tableKey) return noStore({ ok: false, error: "Backup table was not found." }, { status: 404 });

  const gate = await getLegacyAccountGate(["Backup"]);
  if (!gate.ok) {
    return noStore({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const limit = request.nextUrl.searchParams.get("limit") || "50";
  const offset = request.nextUrl.searchParams.get("offset") || "0";
  try {
    return noStore(await loadBackupTableRows(tableKey, { limit, offset, account: gate.account }));
  } catch (error) {
    if (Number(error?.status) === 404) return noStore({ ok: false, error: error?.message || "Backup table was not found." }, { status: 404 });
    console.warn("[backup] direct table rows failed; using Legacy fallback:", error?.message || error);
  }

  const legacyPath = `/api/backup/tables/${encodeURIComponent(tableKey)}/rows?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;
  const legacy = await fetchLegacyJson(legacyPath, { timeoutMs: 15_000, fresh: true });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { ok: false, error: legacy.error || legacy.data?.error || "Failed to load table rows." },
    { status: legacy.status || 502 },
  );
}

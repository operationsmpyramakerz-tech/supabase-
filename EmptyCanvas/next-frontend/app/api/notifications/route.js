import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../lib/legacy-api";
import { notificationsForMember } from "../../../lib/notifications-data";
import { getLegacyAccountGate } from "../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(request) {
  const gate = await getLegacyAccountGate([]);
  if (!gate.ok) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const limit = Math.max(1, Math.min(80, Number(request.nextUrl.searchParams.get("limit")) || 25));
  const fresh = request.nextUrl.searchParams.get("fresh") === "1" || request.nextUrl.searchParams.get("_") !== null;

  if (gate.memberId) {
    try {
      return noStore(await notificationsForMember(gate.memberId, { limit, fresh }));
    } catch (error) {
      console.warn("[notifications] direct list failed; using Legacy fallback:", error?.message || error);
    }
  }

  const legacy = await fetchLegacyJson(`/api/notifications?limit=${limit}`, { timeoutMs: 8_000, fresh: true });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { success: false, error: legacy.error || legacy.data?.error || "Failed to load notifications." },
    { status: legacy.status || 502 },
  );
}

import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
import { markAllNotificationsReadForMember } from "../../../../lib/notifications-data";
import { getLegacyAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function POST() {
  const gate = await getLegacyAccountGate([]);
  if (!gate.ok) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  if (gate.memberId) {
    try {
      return noStore(await markAllNotificationsReadForMember(gate.memberId));
    } catch (error) {
      console.warn("[notifications] direct mark-all failed; using Legacy fallback:", error?.message || error);
    }
  }

  const legacy = await fetchLegacyJson("/api/notifications/read-all", { method: "POST", body: {}, timeoutMs: 8_000 });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { success: false, error: legacy.error || legacy.data?.error || "Failed to mark notifications as read." },
    { status: legacy.status || 502 },
  );
}

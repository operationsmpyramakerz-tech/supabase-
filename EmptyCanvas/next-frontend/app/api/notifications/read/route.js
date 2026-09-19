import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
import { markNotificationReadForMember } from "../../../../lib/notifications-data";
import { getLegacyAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function POST(request) {
  const gate = await getLegacyAccountGate([], { authOnly: true });
  if (!gate.ok) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return noStore({ success: false, error: "Missing id" }, { status: 400 });

  if (gate.memberId) {
    try {
      return noStore(await markNotificationReadForMember(gate.memberId, id));
    } catch (error) {
      console.warn("[notifications] direct mark-read failed; using Legacy fallback:", error?.message || error);
    }
  }

  const legacy = await fetchLegacyJson("/api/notifications/read", { method: "POST", body: { id }, timeoutMs: 8_000 });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { success: false, error: legacy.error || legacy.data?.error || "Failed to mark notification as read." },
    { status: legacy.status || 502 },
  );
}

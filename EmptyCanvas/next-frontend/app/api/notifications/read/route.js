import { NextResponse } from "next/server";
import { markNotificationReadForMember } from "../../../../lib/notifications-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function POST(request) {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return noStore({ success: false, error: "Missing id" }, { status: 400 });

  try {
    return noStore(await markNotificationReadForMember(gate.memberId, id));
  } catch (error) {
    console.error("POST /next/api/notifications/read error:", error?.details || error);
    return noStore(
      { success: false, error: error?.message || "Failed to mark notification as read." },
      { status: Number(error?.status) || 500 },
    );
  }
}

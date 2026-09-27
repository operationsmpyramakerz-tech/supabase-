import { NextResponse } from "next/server";
import { markAllNotificationsReadForMember } from "../../../../lib/notifications-data";
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

export async function POST() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    return noStore(await markAllNotificationsReadForMember(gate.memberId));
  } catch (error) {
    console.error("POST /next/api/notifications/read-all error:", error?.details || error);
    return noStore(
      { success: false, error: error?.message || "Failed to mark notifications as read." },
      { status: Number(error?.status) || 500 },
    );
  }
}

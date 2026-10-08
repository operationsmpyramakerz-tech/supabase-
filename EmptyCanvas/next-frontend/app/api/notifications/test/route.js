import { NextResponse } from "next/server";
import { addTestNotificationForMember } from "../../../../lib/notifications-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function noStore(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, gate.status || 503);
  }

  try {
    return noStore(await addTestNotificationForMember(gate.memberId));
  } catch (error) {
    console.error("GET /next/api/notifications/test error:", error?.details || error);
    return noStore({ success: false, error: error?.message || "Notification test failed." }, Number(error?.status) || 500);
  }
}

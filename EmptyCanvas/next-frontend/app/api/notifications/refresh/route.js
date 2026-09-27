import { NextResponse } from "next/server";
import { notificationsForMember, runNotificationsScan } from "../../../../lib/notifications-data";
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

export async function GET(request) {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, gate.status || 503);
  }

  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const limit = Math.max(1, Math.min(80, Number(request.nextUrl.searchParams.get("limit")) || 25));
    const scan = await runNotificationsScan({ force });
    const list = await notificationsForMember(gate.memberId, { limit, fresh: true });
    return noStore({ ...list, scan });
  } catch (error) {
    console.error("GET /next/api/notifications/refresh error:", error?.details || error);
    return noStore({ success: false, error: error?.message || "Failed to refresh notifications." }, Number(error?.status) || 500);
  }
}

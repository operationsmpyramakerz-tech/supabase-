import { NextResponse } from "next/server";
import { notificationsForMember, runNotificationsScan } from "../../../../lib/notifications-data";
import { dispatchQueuedNotifications } from "../../../../lib/notification-event-worker";
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
    // This endpoint is accessible to every logged-in member. Never let a
    // query parameter bypass the global scan throttle for expensive scans;
    // only the authenticated CRON_SECRET job can explicitly force a scan.
    const limit = Math.max(1, Math.min(80, Number(request.nextUrl.searchParams.get("limit")) || 25));
    // Keep the existing refresh path working if the Phase-2 SQL isn't installed.
    const queue = await dispatchQueuedNotifications({ limit: 4 }).catch((error) => ({
      ok: false, error: error?.message || "Notification queue temporarily unavailable",
    }));
    const scan = await runNotificationsScan({ force: false });
    const list = await notificationsForMember(gate.memberId, { limit, fresh: true });
    return noStore({ ...list, scan, queue });
  } catch (error) {
    console.error("GET /next/api/notifications/refresh error:", error?.details || error);
    return noStore({ success: false, error: error?.message || "Failed to refresh notifications." }, Number(error?.status) || 500);
  }
}

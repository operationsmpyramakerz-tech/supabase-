import { NextResponse } from "next/server";
import { runNotificationsScan } from "../../../../lib/notifications-data";
import { dispatchQueuedNotifications } from "../../../../lib/notification-event-worker";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 60;

function noStore(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false; // Never expose a public cron mutation endpoint.
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!process.env.CRON_SECRET?.trim()) return noStore({ ok: false, error: "CRON_SECRET is not configured." }, 503);
  if (!authorized(request)) return noStore({ ok: false, error: "Unauthorized" }, 401);
  try {
    const queue = await dispatchQueuedNotifications({ limit: 12 });
    const scan = await runNotificationsScan({ force: true });
    return noStore({ ...scan, queue });
  } catch (error) {
    console.error("GET /next/api/cron/notifications error:", error?.details || error);
    return noStore({ ok: false, error: error?.message || "Notification scan failed." }, Number(error?.status) || 500);
  }
}

import { NextResponse } from "next/server";
import { runNotificationsScan } from "../../../../lib/notifications-data";
import { supabaseRequest } from "../../../../lib/supabase-rest";
import { dispatchQueuedNotifications } from "../../../../lib/notification-event-worker";
import { dispatchNotificationDigests } from "../../../../lib/notification-digest";

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
    // Phase-3 reminders enqueue once per Cairo calendar date. If Phase-3 SQL
    // is not installed yet, keep the existing cron working unchanged.
    let reminders = { installed: false, created: 0 };
    try {
      const created = await supabaseRequest("/rpc/enqueue_erp_task_deadline_reminders", {
        method: "POST", body: {}, profileName: "notifications.deadline.enqueue",
      });
      reminders = { installed: true, created: Number(created) || 0 };
    } catch (error) {
      if (Number(error?.status) !== 404 && !/PGRST202|schema cache|enqueue_erp_task_deadline_reminders/i.test(String(error?.message || ""))) {
        console.warn("[notifications] Deadline enqueue deferred:", error?.message);
        reminders = { installed: true, error: "Reminder enqueue temporarily unavailable" };
      }
    }
    const queue = await dispatchQueuedNotifications({ limit: 20 });
    // Digest failures are isolated: Orders/Tasks and Push must continue working.
    let digest;
    try { digest = await dispatchNotificationDigests(); }
    catch (error) {
      console.warn("[notifications] Digest worker deferred:", error?.message);
      digest = { installed: true, error: "Digest temporarily unavailable" };
    }
    const scan = await runNotificationsScan({ force: true });
    return noStore({ ...scan, queue, reminders, digest });
  } catch (error) {
    console.error("GET /next/api/cron/notifications error:", error?.details || error);
    return noStore({ ok: false, error: error?.message || "Notification scan failed." }, Number(error?.status) || 500);
  }
}

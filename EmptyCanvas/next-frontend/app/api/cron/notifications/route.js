import { NextResponse } from "next/server";
import { runNotificationsScan } from "../../../../lib/notifications-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 60;

function noStore(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const authHeader = String(request.headers.get("authorization") || "").trim();
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : authHeader;
  const legacy = String(request.headers.get("x-cron-secret") || "").trim();
  const query = String(request.nextUrl.searchParams.get("secret") || "").trim();
  return bearer === secret || legacy === secret || query === secret;
}

export async function GET(request) {
  if (!authorized(request)) return noStore({ ok: false, error: "Unauthorized" }, 401);
  try {
    return noStore(await runNotificationsScan({ force: true }));
  } catch (error) {
    console.error("GET /next/api/cron/notifications error:", error?.details || error);
    return noStore({ ok: false, error: error?.message || "Notification scan failed." }, Number(error?.status) || 500);
  }
}

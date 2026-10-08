import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import {
  defaultNotificationPreferences,
  getNotificationPreferences,
  saveNotificationPreferences,
  NOTIFICATION_CATEGORIES,
} from "../../../../lib/notification-preferences";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function reply(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function session() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) throw Object.assign(new Error(gate.error || "Authentication required."), { status: gate.status || 401 });
  return gate.memberId;
}

export async function GET() {
  try {
    const memberId = await session();
    const data = await getNotificationPreferences(memberId);
    return reply({ success: true, ...data, categories: NOTIFICATION_CATEGORIES });
  } catch (error) {
    console.error("GET notification preferences:", error?.message || error);
    return reply({ success: false, error: error?.status === 401 ? error.message : "Notification preferences are unavailable. Run the Supabase migration if necessary.", defaults: defaultNotificationPreferences() }, Number(error?.status) || 503);
  }
}

export async function PUT(request) {
  try {
    const memberId = await session();
    const raw = await request.text();
    if (raw.length > 12000) return reply({ success: false, error: "Settings payload is too large." }, 413);
    let data;
    try { data = JSON.parse(raw); } catch { return reply({ success: false, error: "Invalid JSON." }, 400); }
    const saved = await saveNotificationPreferences(memberId, data?.settings);
    return reply({ success: true, ...saved });
  } catch (error) {
    console.error("PUT notification preferences:", error?.message || error);
    return reply({ success: false, error: Number(error?.status) === 401 ? error.message : "Could not save preferences. Check the Supabase migration and permissions." }, Number(error?.status) || 503);
  }
}

import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { markNotificationsReadForMember } from "../../../../lib/notifications-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function reply(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) return reply({ success: false, error: "Authentication required" }, 401);
  const body = await request.json().catch(() => ({}));
  try {
    return reply(await markNotificationsReadForMember(gate.memberId, body?.ids));
  } catch (error) {
    // Never return database internals or another member's records.
    const status = error?.status === 400 ? 400 : 503;
    return reply({ success: false, error: status === 400 ? error.message : "Could not update these notifications. Try again." }, status);
  }
}

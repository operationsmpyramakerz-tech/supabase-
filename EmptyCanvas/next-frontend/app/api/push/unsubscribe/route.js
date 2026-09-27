import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { removePushSubscription } from "../../../../lib/push-notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function noStore(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, gate.status || 503);
  }
  try {
    const body = await request.json().catch(() => ({}));
    return noStore(await removePushSubscription(gate.memberId, body?.endpoint));
  } catch (error) {
    console.error("POST /next/api/push/unsubscribe error:", error?.details || error);
    return noStore({ success: false, error: error?.message || "Failed to remove push subscription." }, Number(error?.status) || 500);
  }
}

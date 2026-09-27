import { NextResponse } from "next/server";
import { notificationsForMember } from "../../../lib/notifications-data";
import { getDirectAccountGate } from "../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

export async function GET(request) {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const limit = Math.max(1, Math.min(80, Number(request.nextUrl.searchParams.get("limit")) || 25));
  const fresh = request.nextUrl.searchParams.get("fresh") === "1" || request.nextUrl.searchParams.get("_") !== null;

  try {
    return noStore(await notificationsForMember(gate.memberId, { limit, fresh }));
  } catch (error) {
    console.error("GET /next/api/notifications error:", error?.details || error);
    return noStore(
      { success: false, error: error?.message || "Failed to load notifications." },
      { status: Number(error?.status) || 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { getMemberDeliveryHistory } from "../../../../lib/notification-delivery-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, {
      status: 401, headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    const result = await getMemberDeliveryHistory(gate.memberId);
    return NextResponse.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.warn("[notifications-delivery] History temporarily unavailable", error?.status || "unknown");
    return NextResponse.json({ ok: false, error: "Delivery history is temporarily unavailable." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}

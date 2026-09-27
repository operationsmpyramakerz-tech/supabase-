import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { markCurrentOrderReceivedDirect } from "../../../../../lib/current-orders-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  const gate = await getDirectAccountGate(["Current Orders"]);
  if (!gate.ok) {
    return NextResponse.json({ success: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const result = await markCurrentOrderReceivedDirect({ account: gate.account, orderPageId: body?.orderPageId });
    if (!result) return NextResponse.json({ success: false, error: "This order is not available through the direct Supabase path." }, { status: 503 });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to update status" }, { status: Number(error?.status) || 500 });
  }
}

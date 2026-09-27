import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { pushConfiguration } from "../../../../lib/push-notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function noStore(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) {
    return noStore({ success: false, error: gate.error || "Authentication required." }, gate.status || 503);
  }
  return noStore(pushConfiguration());
}

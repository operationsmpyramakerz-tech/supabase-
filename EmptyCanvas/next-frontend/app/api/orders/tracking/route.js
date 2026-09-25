import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { loadOrderTracking } from "../../../../lib/order-tracking-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

export async function GET(request) {
  const groupId = String(new URL(request.url).searchParams.get("groupId") || "").trim();
  if (!groupId) return noStore({ error: "Missing or invalid groupId." }, { status: 400 });

  const gate = await getLegacyAccountGate(["Current Orders"]);
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  try {
    const tracking = await loadOrderTracking({ account: gate.account, groupId });
    if (tracking) return noStore(tracking);
    return noStore({ error: "Order tracking direct Supabase data is unavailable." }, { status: 503 });
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load order tracking from Supabase." },
      { status: Number(error?.status) || 502 },
    );
  }
}

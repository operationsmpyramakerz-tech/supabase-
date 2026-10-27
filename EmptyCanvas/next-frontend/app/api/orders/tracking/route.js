import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";
import { hideOrderReceiptFiles } from "../../../../lib/order-receipt-visibility.mjs";
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

  const gate = featureGate(featureGate(await getLegacyAccountGate(["Current Orders"]), "orders.my.view"), "orders.tracking.view");
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  try {
    const tracking = await loadOrderTracking({ account: gate.account, groupId });
    if (tracking) return noStore({ ...tracking, items: hideOrderReceiptFiles(tracking.items, featureAllowed(gate.account, "orders.documents.view_receipts")) });
    return noStore({ error: "Order tracking direct Supabase data is unavailable." }, { status: 503 });
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load order tracking from Supabase." },
      { status: Number(error?.status) || 502 },
    );
  }
}

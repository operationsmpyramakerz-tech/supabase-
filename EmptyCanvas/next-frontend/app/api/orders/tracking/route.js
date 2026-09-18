import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
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
  } catch (error) {
    console.warn("[order-tracking] direct read failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/orders/tracking?groupId=${encodeURIComponent(groupId)}`, {
    timeoutMs: 20_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Failed to load order tracking." },
    { status: legacy.status || 502 },
  );
}

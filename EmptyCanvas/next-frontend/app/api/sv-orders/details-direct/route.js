import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { loadOrdersReviewDetails } from "../../../../lib/orders-review-data";

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

function cleanIds(body = {}) {
  return [...new Set((Array.isArray(body?.orderIds) ? body.orderIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))]
    .slice(0, 500);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const orderIds = cleanIds(body);
  if (!orderIds.length) return noStore({ error: "orderIds required" }, { status: 400 });

  const gate = await getLegacyAccountGate(["Orders Review"]);
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  try {
    const items = await loadOrdersReviewDetails({ account: gate.account, orderIds });
    if (Array.isArray(items)) return noStore(items);
    return noStore({ error: "Orders Review direct Supabase data is unavailable." }, { status: 503 });
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load order review details from Supabase." },
      { status: Number(error?.status) || 502 },
    );
  }
}

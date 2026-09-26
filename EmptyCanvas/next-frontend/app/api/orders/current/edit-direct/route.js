import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { initializeCurrentOrderEditDirect } from "../../../../../lib/shopping-cart-order-service";

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

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const gate = await getDirectAccountGate(["Current Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const result = await initializeCurrentOrderEditDirect({
      account: gate.account,
      orderIds: body?.orderIds,
      adminPassword: body?.adminPassword,
    });
    if (result) return noStore(result);
    return noStore(
      { error: "This order cannot be edited through the direct Supabase path." },
      { status: 503 },
    );
  } catch (error) {
    if (error?.code === "DIRECT_SHOPPING_CART_ORDER_FAILED") {
      return noStore({ error: error?.message || "Failed to init edit" }, { status: Number(error?.status) || 500 });
    }
    console.error("[current-orders] direct edit init failed:", error?.message || error);
    return noStore({ error: error?.message || "Failed to init edit" }, { status: Number(error?.status) || 500 });
  }
}

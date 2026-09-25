import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { submitShoppingCartOrderDirect } from "../../../../../lib/shopping-cart-order-service";

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
  const gate = await getLegacyAccountGate(["Create New Order"]);
  if (!gate.ok) {
    return noStore({ success: false, message: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const result = await submitShoppingCartOrderDirect({
      account: gate.account,
      products: body?.products,
      orderType: body?.orderType,
      editMode: body?.editMode === true,
      editToken: body?.editToken,
    });
    if (result) return noStore(result);
    return noStore(
      { success: false, message: "Direct Supabase order submission is unavailable." },
      { status: 503 },
    );
  } catch (error) {
    return noStore(
      { success: false, message: error?.message || "The order could not be submitted." },
      { status: Number(error?.status) || 500 },
    );
  }
}

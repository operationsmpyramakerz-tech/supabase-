import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { undoShoppingCartOrderDirect } from "../../../../../lib/shopping-cart-order-service";

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
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const result = await undoShoppingCartOrderDirect({
      account: gate.account,
      undoToken: body?.undoToken,
    });
    if (result) return noStore(result);
    return noStore({ error: "A valid direct undo token is required." }, { status: 400 });
  } catch (error) {
    return noStore(
      { error: error?.message || "The order could not be removed." },
      { status: Number(error?.status) || 500 },
    );
  }
}

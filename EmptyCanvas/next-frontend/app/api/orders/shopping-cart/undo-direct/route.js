import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
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

async function legacyFallback(body = {}) {
  const legacy = await fetchLegacyJson("/api/orders/current/undo-submit", {
    method: "POST",
    body: {
      orderId: body?.orderId,
      orderPageIds: body?.orderPageIds,
    },
    timeoutMs: 20_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "The order could not be removed." },
    { status: legacy.status || 502 },
  );
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
  } catch (error) {
    if (error?.code === "DIRECT_SHOPPING_CART_ORDER_FAILED") {
      return noStore({ error: error?.message || "The order could not be removed." }, { status: Number(error?.status) || 500 });
    }
    if (String(body?.undoToken || "").trim()) {
      return noStore({ error: error?.message || "The order could not be removed." }, { status: Number(error?.status) || 502 });
    }
    console.warn("[shopping-cart] direct undo unavailable; using Legacy fallback:", error?.message || error);
  }

  return await legacyFallback(body);
}

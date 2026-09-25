import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
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

async function legacyFallback(body = {}) {
  const legacy = await fetchLegacyJson("/api/submit-order", {
    method: "POST",
    body: {
      products: body?.products,
      orderType: body?.orderType,
    },
    timeoutMs: 35_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { success: false, message: legacy.error || legacy.data?.message || legacy.data?.error || "The order could not be submitted." },
    { status: legacy.status || 502 },
  );
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
  } catch (error) {
    if (error?.code === "DIRECT_SHOPPING_CART_ORDER_FAILED") {
      return noStore(
        { success: false, message: error?.message || "The order could not be submitted." },
        { status: Number(error?.status) || 500 },
      );
    }

    // A direct edit token intentionally has no Express edit session behind it,
    // so it must never fall through to Legacy after the direct init succeeded.
    if (body?.editMode === true && String(body?.editToken || "").trim()) {
      return noStore(
        { success: false, message: error?.message || "The order could not be updated." },
        { status: Number(error?.status) || 502 },
      );
    }
    console.warn("[shopping-cart] direct submit unavailable; using Legacy fallback:", error?.message || error);
  }

  return await legacyFallback(body);
}

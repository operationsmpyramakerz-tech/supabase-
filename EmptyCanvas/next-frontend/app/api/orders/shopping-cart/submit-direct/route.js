import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { orderActionGate } from "../../../../../lib/current-shopping-action-permissions.mjs";
import { shoppingSourceAllowed } from "../../../../../lib/feature-permissions-registry";
import { assertShoppingCartSources } from "../../../../../lib/shopping-cart-source-policy.mjs";
import { getKit } from "../../../../../lib/proposal-kit-service";
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
  const key = body?.editMode === true ? "orders.shopping.edit_submit" : "orders.shopping.submit";
  const gate = orderActionGate(await getLegacyAccountGate(["Create New Order"]), key);
  if (!gate.ok) {
    return noStore({ success: false, message: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }
  if (body?.editMode === true) {
    const editPermission = orderActionGate(gate, "orders.my.edit");
    if (!editPermission.ok) return noStore({ success: false, message: editPermission.error }, { status: editPermission.status || 403 });
  }

  try {
    await assertShoppingCartSources({
      orderType: body?.orderType,
      products: body?.products,
      allowComponents: shoppingSourceAllowed(gate.account, "components"),
      allowKits: shoppingSourceAllowed(gate.account, "kits"),
      getKit: id => getKit(id, gate.account),
    });
    const result = await submitShoppingCartOrderDirect({
      account: gate.account,
      products: body?.products,
      orderType: body?.orderType,
      priorityLevel: body?.priorityLevel,
      requestedDeliveryDate: body?.requestedDeliveryDate,
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

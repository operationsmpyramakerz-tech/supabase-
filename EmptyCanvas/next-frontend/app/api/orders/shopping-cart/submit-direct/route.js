import { NextResponse, after } from "next/server";
import { dispatchQueuedNotifications } from "../../../../../lib/notification-event-worker";
import { rpc } from "../../../../../lib/supabase-rest";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { orderActionGate } from "../../../../../lib/current-shopping-action-permissions.mjs";
import { shoppingSourceAllowed } from "../../../../../lib/feature-permissions-registry";
import { assertShoppingCartSources } from "../../../../../lib/shopping-cart-source-policy.mjs";
import { getKit } from "../../../../../lib/proposal-kit-service";
import { submitShoppingCartOrderDirect } from "../../../../../lib/shopping-cart-order-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

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
      removedOrderRowIds: body?.removedOrderRowIds,
    });
    if (result) {
      // The database queued notices with the new order. Deliver only after
      // the completed submission (including any custom catalog requests).
      if (result.success && body?.editMode !== true) {
        const ownerId = String(gate.account.teamMemberId || gate.account.userSupabaseId || gate.account.userId || gate.account.id || "");
        const rowIds = (result.orderItems || []).map(item => String(item.orderPageId || "")).filter(Boolean);
        after(async () => {
          try {
            await rpc("erp_release_order_supervision_notifications_v464", {
              p_order_number: String(result.orderNumber), p_owner_id: ownerId, p_row_ids: rowIds,
            }, { profileName: "notifications.order-supervision.release" });
          } catch (error) {
            console.warn("[notifications] New order approval release deferred:", error?.message);
          }
          await dispatchQueuedNotifications({ limit: 10, supervisionOnly: true }).catch((error) =>
            console.warn("[notifications] New order approval delivery deferred:", error?.message));
        });
      }
      return noStore(result);
    }
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

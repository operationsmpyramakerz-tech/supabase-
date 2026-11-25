import { NextResponse, after } from "next/server";
import { dispatchQueuedNotifications } from "../../../../../lib/notification-event-worker";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { directPageMutationAccess } from "../../../../../lib/order-action-auth";
import { featureGate } from "../../../../../lib/feature-permissions-server";
import { assertOrderIdsInScope } from "../../../../../lib/order-data-scope";
import {
  createOperationsRepeatOrder,
  markOperationsArrived,
  markOperationsShipped,
  receiveOperationsRemainingBatch,
  performOperationsProtectedAction,
  saveOperationsEditDetails,
  sendOperationsDeliveredToStock,
  updateOperationsApproval,
} from "../../../../../lib/operations-orders-data";

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

function text(value) {
  return String(value ?? "").trim();
}

function actionKey(value) {
  return text(value).toLowerCase().replace(/[_\s]+/g, "-");
}

function directErrorResponse(error) {
  if (error?.code !== "DIRECT_OPERATIONS_MUTATION_FAILED") return null;
  return noStore(
    { error: error?.message || "Operations Orders action failed." },
    { status: Number(error?.status) || 500 },
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["approval", "mark-shipped", "receive-remaining", "mark-arrived", "archive", "unarchive", "delete", "edit-init", "edit-save", "create-withdrawal", "create-delivery", "send-to-stock"].includes(action)) {
    return noStore({ error: "Unsupported Operations Orders action." }, { status: 400 });
  }

  const gate = await getDirectAccountGate(["Requested Orders", "Operations Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const actionPermission = {
    approval: "orders.operations.approve",
    "mark-shipped": "orders.operations.ship",
    "receive-remaining": "orders.operations.ship",
    "mark-arrived": "orders.operations.receive",
    "send-to-stock": "orders.operations.send_to_stock",
    "create-withdrawal": "orders.operations.withdrawal",
    "create-delivery": "orders.operations.delivery",
    "edit-init": "orders.operations.edit",
    "edit-save": "orders.operations.edit",
    delete: "orders.operations.delete",
    archive: "orders.operations.edit",
    unarchive: "orders.operations.edit",
  }[action];
  // Keep the existing page Edit check and all business-specific protections.
  // Advanced permission grants are an additional requirement, not a bypass.
  const permission = featureGate(gate, actionPermission);
  if (!permission.ok) {
    return noStore({ error: permission.error }, { status: permission.status || 403 });
  }
  // mark-arrived uploads receipt images as part of the same mutation. A
  // separate Upload Receipt denial must not be bypassed by Receive access.
  if (action === "mark-arrived") {
    const receiptPermission = featureGate(gate, "orders.operations.upload_receipt");
    if (!receiptPermission.ok) {
      return noStore({ error: receiptPermission.error }, { status: receiptPermission.status || 403 });
    }
  }

  const mutationAccess = directPageMutationAccess(gate.account, ["Requested Orders", "Operations Orders"]);
  if (mutationAccess === false) {
    return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  }
  if (mutationAccess === null) {
    return noStore({ error: "The direct page permission context is unavailable." }, { status: 503 });
  }

  try {
    // Require EVERY requested component to be in scope, including edit-init,
    // repeat-order creation and archive actions.
    await assertOrderIdsInScope(gate.account, actionPermission, body?.ids ?? body?.orderIds);
    if (action === "mark-arrived") {
      await assertOrderIdsInScope(gate.account, "orders.operations.upload_receipt", body?.orderIds);
    }
    let result = null;
    if (action === "approval") {
      result = await updateOperationsApproval({
        account: gate.account,
        ids: body?.ids ?? body?.orderIds,
        decision: body?.decision,
        rejectedReason: body?.rejectedReason,
      });
    } else if (action === "mark-shipped") {
      result = await markOperationsShipped({
        account: gate.account,
        orderIds: body?.orderIds,
        receiptNumber: body?.receiptNumber,
        quantities: body?.quantities,
        issueDescription: body?.issueDescription,
        perItemIssues: body?.perItemIssues,
      });
    } else if (action === "receive-remaining") {
      result = await receiveOperationsRemainingBatch({
        account: gate.account,
        orderIds: body?.orderIds,
        quantities: body?.quantities,
        receiptNumber: body?.receiptNumber,
        issueDescription: body?.issueDescription,
        legacyLinkConfirmed: body?.legacyLinkConfirmed === true,
      });
    } else if (action === "mark-arrived") {
      result = await markOperationsArrived({
        account: gate.account,
        orderIds: body?.orderIds,
        orderReceiptDataUrls: body?.orderReceiptDataUrls,
        orderReceiptFilenames: body?.orderReceiptFilenames,
        receiptNumbers: body?.receiptNumbers ?? body?.receiptNumber,
      });
    } else if (action === "send-to-stock") {
      result = await sendOperationsDeliveredToStock({
        account: gate.account,
        orderIds: body?.orderIds,
        restoreZeroedRows: body?.restoreZeroedRows === true,
      });
    } else if (action === "create-withdrawal" || action === "create-delivery") {
      result = await createOperationsRepeatOrder({
        account: gate.account,
        orderIds: body?.orderIds,
        action,
      });
    } else if (action === "edit-save") {
      const unsupportedReceiptEdit = [
        "receiptNumber", "receiptNumbers", "orderReceiptReplace", "orderReceiptKeepEntries",
        "orderReceiptRemovedKeys", "orderReceiptRemovedUrls", "orderReceiptDataUrls", "orderReceiptFilenames",
      ].some((key) => Object.prototype.hasOwnProperty.call(body || {}, key));
      if (unsupportedReceiptEdit) {
        return noStore(
          { error: "Receipt changes are not supported by the direct Operations edit flow." },
          { status: 422 },
        );
      }
      result = await saveOperationsEditDetails({
        account: gate.account,
        orderIds: body?.orderIds,
        adminPassword: body?.adminPassword,
        itemUpdates: body?.itemUpdates,
        itemAdds: body?.itemAdds,
        itemDeletes: body?.itemDeletes,
        quantities: body?.quantities,
        newCreatorId: body?.newCreatorId,
        expectedCreatorId: body?.expectedCreatorId,
        expectedCreatorName: body?.expectedCreatorName,
        unsupportedReceiptEdit: false,
      });
    } else {
      result = await performOperationsProtectedAction({
        account: gate.account,
        action,
        orderIds: body?.orderIds,
        adminPassword: body?.adminPassword,
      });
    }

    if (result) {
      if (["approval", "mark-shipped", "receive-remaining", "mark-arrived"].includes(action) && result?.ok !== false && result?.success !== false) {
        after(() => dispatchQueuedNotifications({ limit: 6 }).catch((error) =>
          console.warn("[notifications] Order event delivery deferred:", error?.message)));
      }
      return noStore(result);
    }
    return noStore(
      { error: "This Operations Orders action is not available through the direct Supabase path." },
      { status: 503 },
    );
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.error(`[operations-orders] direct ${action} failed:`, error?.message || error);
    return noStore(
      { error: error?.message || "Operations Orders action failed." },
      { status: Number(error?.status) || 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { directPageMutationAccess } from "../../../../../lib/order-action-auth";
import {
  createOperationsRepeatOrder,
  markOperationsArrived,
  markOperationsShipped,
  performOperationsProtectedAction,
  saveOperationsEditDetails,
  updateOperationsApproval,
} from "../../../../../lib/operations-orders-data";

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
  if (!["approval", "mark-shipped", "mark-arrived", "archive", "unarchive", "edit-init", "edit-save", "create-withdrawal", "create-delivery"].includes(action)) {
    return noStore({ error: "Unsupported Operations Orders action." }, { status: 400 });
  }

  const gate = await getDirectAccountGate(["Requested Orders", "Operations Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const mutationAccess = directPageMutationAccess(gate.account, ["Requested Orders", "Operations Orders"]);
  if (mutationAccess === false) {
    return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  }
  if (mutationAccess === null) {
    return noStore({ error: "The direct page permission context is unavailable." }, { status: 503 });
  }

  try {
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
    } else if (action === "mark-arrived") {
      result = await markOperationsArrived({
        account: gate.account,
        orderIds: body?.orderIds,
        orderReceiptDataUrls: body?.orderReceiptDataUrls,
        orderReceiptFilenames: body?.orderReceiptFilenames,
        receiptNumbers: body?.receiptNumbers ?? body?.receiptNumber,
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
        quantities: body?.quantities,
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

    if (result) return noStore(result);
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

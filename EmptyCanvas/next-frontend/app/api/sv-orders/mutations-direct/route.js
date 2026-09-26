import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { directPageMutationAccess } from "../../../../lib/order-action-auth";
import {
  performOrdersReviewProtectedAction,
  updateOrdersReviewApproval,
  updateOrdersReviewQuantity,
} from "../../../../lib/orders-review-data";

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
  if (error?.code !== "DIRECT_REVIEW_MUTATION_FAILED") return null;
  return noStore(
    { error: error?.message || "Orders Review action failed." },
    { status: Number(error?.status) || 500 },
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["approval", "quantity", "archive", "unarchive", "verify-edit", "update-approval"].includes(action)) {
    return noStore({ error: "Unsupported Orders Review action." }, { status: 400 });
  }

  const gate = await getDirectAccountGate(["Orders Review"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const mutationAccess = directPageMutationAccess(gate.account, "Orders Review");
  if (mutationAccess === false) {
    return noStore({ error: "Edit access is required for this action." }, { status: 403 });
  }
  if (mutationAccess === null) {
    return noStore({ error: "The direct page permission context is unavailable." }, { status: 503 });
  }

  try {
    let result = null;
    if (action === "approval") {
      result = await updateOrdersReviewApproval({
        account: gate.account,
        id: body?.id,
        decision: body?.decision,
        rejectedReason: body?.rejectedReason,
      });
    } else if (action === "quantity") {
      result = await updateOrdersReviewQuantity({
        account: gate.account,
        id: body?.id,
        value: body?.value,
      });
    } else {
      result = await performOrdersReviewProtectedAction({
        account: gate.account,
        action,
        orderIds: body?.orderIds,
        adminPassword: body?.adminPassword,
        approvals: body?.approvals,
        approvalStatus: body?.approvalStatus ?? body?.approval,
      });
    }

    if (result) return noStore(result);
    return noStore(
      { error: "This Orders Review action is not available through the direct Supabase path." },
      { status: 503 },
    );
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.error(`[orders-review] direct ${action} failed:`, error?.message || error);
    return noStore(
      { error: error?.message || "Orders Review action failed." },
      { status: Number(error?.status) || 500 },
    );
  }
}

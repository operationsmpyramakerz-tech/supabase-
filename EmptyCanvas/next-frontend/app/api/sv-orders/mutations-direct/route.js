import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
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
  const status = Number(error?.status) || 500;
  return noStore({ error: error?.message || "Orders Review action failed." }, { status });
}

async function legacyFallback(action, body) {
  let path = "";
  let legacyBody = body;

  if (action === "approval") {
    const id = text(body?.id);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });
    path = `/api/sv-orders/${encodeURIComponent(id)}/approval`;
    legacyBody = { decision: body?.decision, rejectedReason: body?.rejectedReason };
  } else if (action === "quantity") {
    const id = text(body?.id);
    if (!id) return noStore({ error: "Missing id" }, { status: 400 });
    path = `/api/sv-orders/${encodeURIComponent(id)}/quantity`;
    legacyBody = { value: body?.value };
  } else if (["archive", "unarchive", "verify-edit", "update-approval"].includes(action)) {
    path = `/api/sv-orders/actions/${action}`;
    legacyBody = {
      orderIds: body?.orderIds,
      adminPassword: body?.adminPassword,
      ...(action === "update-approval" ? {
        approvals: body?.approvals,
        approvalStatus: body?.approvalStatus,
        approval: body?.approval,
      } : {}),
    };
  } else {
    return noStore({ error: "Unsupported Orders Review action." }, { status: 400 });
  }

  const legacy = await fetchLegacyJson(path, {
    method: "POST",
    body: legacyBody,
    timeoutMs: 25_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Orders Review action failed." },
    { status: legacy.status || 502 },
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["approval", "quantity", "archive", "unarchive", "verify-edit", "update-approval"].includes(action)) {
    return noStore({ error: "Unsupported Orders Review action." }, { status: 400 });
  }

  const gate = await getLegacyAccountGate(["Orders Review"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    if (action === "approval") {
      const result = await updateOrdersReviewApproval({
        account: gate.account,
        id: body?.id,
        decision: body?.decision,
        rejectedReason: body?.rejectedReason,
      });
      if (result) return noStore(result);
    } else if (action === "quantity") {
      const result = await updateOrdersReviewQuantity({
        account: gate.account,
        id: body?.id,
        value: body?.value,
      });
      if (result) return noStore(result);
    } else if (gate.source === "direct-session") {
      // Protected actions need page-level Admin semantics in addition to the
      // shared password. The direct-session gate carries the fresh access level;
      // if the account came from the Legacy bridge, keep using Legacy for exact
      // compatibility instead of guessing that privilege.
      const result = await performOrdersReviewProtectedAction({
        account: gate.account,
        action,
        orderIds: body?.orderIds,
        adminPassword: body?.adminPassword,
        approvals: body?.approvals,
        approvalStatus: body?.approvalStatus ?? body?.approval,
      });
      if (result) return noStore(result);
    }
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.warn(`[orders-review] direct ${action} failed; using Legacy fallback:`, error?.message || error);
  }

  return await legacyFallback(action, body);
}

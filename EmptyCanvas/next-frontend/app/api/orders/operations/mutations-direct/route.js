import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import {
  markOperationsShipped,
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
  const status = Number(error?.status) || 500;
  // Validation/auth/not-found errors must stay fail-closed. Compatibility or
  // infrastructure failures use the Legacy fallback below instead.
  if ([400, 401, 403, 404, 409, 422].includes(status)) {
    return noStore({ error: error?.message || "Operations Orders action failed." }, { status });
  }
  return null;
}

async function legacyFallback(action, body) {
  let path = "";
  let legacyBody = body;

  if (action === "approval") {
    path = "/api/orders/operations/approval";
    legacyBody = {
      ids: body?.ids ?? body?.orderIds,
      decision: body?.decision,
      rejectedReason: body?.rejectedReason,
    };
  } else if (action === "mark-shipped") {
    path = "/api/orders/requested/mark-shipped";
    legacyBody = {
      orderIds: body?.orderIds,
      receiptNumber: body?.receiptNumber,
      quantities: body?.quantities,
      issueDescription: body?.issueDescription,
      perItemIssues: body?.perItemIssues,
    };
  } else {
    return noStore({ error: "Unsupported Operations Orders action." }, { status: 400 });
  }

  const legacy = await fetchLegacyJson(path, {
    method: "POST",
    body: legacyBody,
    timeoutMs: 30_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Operations Orders action failed." },
    { status: legacy.status || 502 },
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["approval", "mark-shipped"].includes(action)) {
    return noStore({ error: "Unsupported Operations Orders action." }, { status: 400 });
  }

  const gate = await getLegacyAccountGate(["Requested Orders", "Operations Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    if (action === "approval") {
      const result = await updateOperationsApproval({
        account: gate.account,
        ids: body?.ids ?? body?.orderIds,
        decision: body?.decision,
        rejectedReason: body?.rejectedReason,
      });
      if (result) return noStore(result);
    } else {
      const result = await markOperationsShipped({
        account: gate.account,
        orderIds: body?.orderIds,
        receiptNumber: body?.receiptNumber,
        quantities: body?.quantities,
        issueDescription: body?.issueDescription,
        perItemIssues: body?.perItemIssues,
      });
      if (result) return noStore(result);
    }
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.warn(`[operations-orders] direct ${action} failed; using Legacy fallback:`, error?.message || error);
  }

  return await legacyFallback(action, body);
}

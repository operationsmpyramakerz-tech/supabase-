import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import {
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
  const status = Number(error?.status) || 500;
  if (error?.noFallback) {
    return noStore({ error: error?.message || "Operations Orders action failed." }, { status });
  }
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
  } else if (action === "archive") {
    path = "/api/orders/requested/archive";
    legacyBody = { orderIds: body?.orderIds, adminPassword: body?.adminPassword };
  } else if (action === "unarchive") {
    path = "/api/orders/requested/unarchive";
    legacyBody = { orderIds: body?.orderIds };
  } else if (action === "edit-init") {
    path = "/api/orders/operations/edit/init";
    legacyBody = { orderIds: body?.orderIds, adminPassword: body?.adminPassword };
  } else if (action === "edit-save") {
    path = "/api/orders/operations/details-edit";
    legacyBody = {
      orderIds: body?.orderIds,
      adminPassword: body?.adminPassword,
      itemUpdates: body?.itemUpdates,
      quantities: body?.quantities,
      receiptNumber: body?.receiptNumber,
      receiptNumbers: body?.receiptNumbers,
      orderReceiptReplace: body?.orderReceiptReplace,
      orderReceiptKeepEntries: body?.orderReceiptKeepEntries,
      orderReceiptRemovedKeys: body?.orderReceiptRemovedKeys,
      orderReceiptRemovedUrls: body?.orderReceiptRemovedUrls,
      orderReceiptDataUrls: body?.orderReceiptDataUrls,
      orderReceiptFilenames: body?.orderReceiptFilenames,
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
  if (!["approval", "mark-shipped", "archive", "unarchive", "edit-init", "edit-save"].includes(action)) {
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
    } else if (action === "mark-shipped") {
      const result = await markOperationsShipped({
        account: gate.account,
        orderIds: body?.orderIds,
        receiptNumber: body?.receiptNumber,
        quantities: body?.quantities,
        issueDescription: body?.issueDescription,
        perItemIssues: body?.perItemIssues,
      });
      if (result) return noStore(result);
    } else if (action === "edit-save" && gate.source === "direct-session") {
      const unsupportedReceiptEdit = [
        "receiptNumber", "receiptNumbers", "orderReceiptReplace", "orderReceiptKeepEntries",
        "orderReceiptRemovedKeys", "orderReceiptRemovedUrls", "orderReceiptDataUrls", "orderReceiptFilenames",
      ].some((key) => Object.prototype.hasOwnProperty.call(body || {}, key));
      const result = await saveOperationsEditDetails({
        account: gate.account,
        orderIds: body?.orderIds,
        adminPassword: body?.adminPassword,
        itemUpdates: body?.itemUpdates,
        quantities: body?.quantities,
        unsupportedReceiptEdit,
      });
      if (result) return noStore(result);
    } else if (action === "unarchive" || gate.source === "direct-session") {
      // Admin-password actions rely on the fresh page access carried by the
      // direct-session gate. If this request had to use the Legacy account
      // bridge, preserve exact compatibility by using the Legacy endpoint.
      const result = await performOperationsProtectedAction({
        account: gate.account,
        action,
        orderIds: body?.orderIds,
        adminPassword: body?.adminPassword,
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

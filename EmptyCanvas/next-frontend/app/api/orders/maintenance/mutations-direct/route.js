import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import {
  logMaintenanceDirect,
  markMaintenanceArrivedDirect,
  performMaintenanceOrdersProtectedAction,
} from "../../../../../lib/maintenance-orders-data";

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
  if (error?.code !== "DIRECT_MAINTENANCE_ORDERS_MUTATION_FAILED") return null;
  return noStore(
    { error: error?.message || "Maintenance Orders action failed." },
    { status: Number(error?.status) || 500 },
  );
}

async function legacyFallback(action, body) {
  const routes = {
    archive: "/api/orders/maintenance/archive",
    delete: "/api/orders/maintenance/delete",
    "edit-init": "/api/orders/maintenance/edit/init",
    "log-maintenance": "/api/orders/requested/log-maintenance",
    "mark-arrived": "/api/orders/requested/mark-arrived",
  };
  const path = routes[action];
  if (!path) return noStore({ error: "Unsupported Maintenance Orders action." }, { status: 400 });

  let legacyBody = {
    orderIds: body?.orderIds,
    adminPassword: body?.adminPassword,
  };
  if (action === "log-maintenance") {
    legacyBody = {
      orderIds: body?.orderIds,
      resolutionMethod: body?.resolutionMethod,
      serialNumber: body?.serialNumber,
      actualIssueDescription: body?.actualIssueDescription,
      repairAction: body?.repairAction,
      sparePartId: body?.sparePartId,
      sparePartIds: body?.sparePartIds,
      sparePartNames: body?.sparePartNames,
      perItemLogs: body?.perItemLogs,
      moveToArrived: body?.moveToArrived,
      moveToShipping: body?.moveToShipping,
      replaceExisting: body?.replaceExisting,
    };
  } else if (action === "mark-arrived") {
    legacyBody = {
      orderIds: body?.orderIds,
      orderReceiptDataUrls: body?.orderReceiptDataUrls,
      orderReceiptFilenames: body?.orderReceiptFilenames,
      receiptNumbers: body?.receiptNumbers ?? body?.receiptNumber,
    };
  }

  const legacy = await fetchLegacyJson(path, {
    method: "POST",
    body: legacyBody,
    timeoutMs: 30_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Maintenance Orders action failed." },
    { status: legacy.status || 502 },
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["archive", "delete", "edit-init", "log-maintenance", "mark-arrived"].includes(action)) {
    return noStore({ error: "Unsupported Maintenance Orders action." }, { status: 400 });
  }

  const gate = await getLegacyAccountGate(["Maintenance Orders", "Operations Orders", "Requested Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    let result = null;
    if (["archive", "delete", "edit-init"].includes(action)) {
      result = await performMaintenanceOrdersProtectedAction({
        account: gate.account,
        action,
        orderIds: body?.orderIds,
        adminPassword: body?.adminPassword,
      });
    } else if (action === "log-maintenance") {
      result = await logMaintenanceDirect({
        account: gate.account,
        orderIds: body?.orderIds,
        resolutionMethod: body?.resolutionMethod,
        serialNumber: body?.serialNumber,
        actualIssueDescription: body?.actualIssueDescription,
        repairAction: body?.repairAction,
        sparePartId: body?.sparePartId,
        sparePartIds: body?.sparePartIds,
        sparePartNames: body?.sparePartNames,
        perItemLogs: body?.perItemLogs,
        moveToArrived: body?.moveToArrived,
        moveToShipping: body?.moveToShipping,
        replaceExisting: body?.replaceExisting,
      });
    } else if (action === "mark-arrived") {
      result = await markMaintenanceArrivedDirect({
        account: gate.account,
        orderIds: body?.orderIds,
        orderReceiptDataUrls: body?.orderReceiptDataUrls,
        orderReceiptFilenames: body?.orderReceiptFilenames,
        receiptNumbers: body?.receiptNumbers ?? body?.receiptNumber,
      });
    }
    if (result) return noStore(result);
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.warn(`[maintenance-orders] direct ${action} failed; using Legacy fallback:`, error?.message || error);
  }

  return await legacyFallback(action, body);
}

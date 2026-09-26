import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
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

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["archive", "delete", "edit-init", "log-maintenance", "mark-arrived"].includes(action)) {
    return noStore({ error: "Unsupported Maintenance Orders action." }, { status: 400 });
  }

  const gate = await getDirectAccountGate(["Maintenance Orders", "Operations Orders", "Requested Orders"]);
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
    return noStore(
      { error: "This Maintenance Orders action is not available through the direct Supabase path." },
      { status: 503 },
    );
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.error(`[maintenance-orders] direct ${action} failed:`, error?.message || error);
    return noStore(
      { error: error?.message || "Maintenance Orders action failed." },
      { status: Number(error?.status) || 500 },
    );
  }
}

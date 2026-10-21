import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { renderOrderExport } from "../../../../lib/order-export-service";
import { loadCurrentOrderDetails } from "../../../../lib/current-orders-data";
import { loadOrdersReviewDetails } from "../../../../lib/orders-review-data";
import { loadMaintenanceOrderDetails } from "../../../../lib/maintenance-orders-data";
import { assertOrderIdsInScope } from "../../../../lib/order-data-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
}

function requiredPages(scope = "") {
  const key = text(scope).toLowerCase();
  if (key === "current") return ["Current Orders"];
  if (key === "review") return ["Orders Review"];
  if (key === "maintenance") return ["Maintenance Orders"];
  return ["Requested Orders", "Operations Orders"];
}

function jsonError(message, status = 500) {
  return NextResponse.json(
    { error: message || "Order export failed." },
    { status: Number(status) || 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

function safeDownloadName(value, fallback = "order-export") {
  const name = text(value || fallback).replace(/[\r\n"]/g, "");
  return name || fallback;
}

async function verifyScopedOrderAccess(scope, account, orderIds) {
  if (scope === "current") {
    await loadCurrentOrderDetails({ account, orderIds });
    return;
  }
  if (scope === "review") {
    await loadOrdersReviewDetails({ account, orderIds });
    return;
  }
  if (scope === "maintenance") await loadMaintenanceOrderDetails({ orderIds });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const scope = text(body?.scope || "operations").toLowerCase();
  if (!["current", "review", "maintenance", "operations"].includes(scope)) {
    return jsonError("Unsupported export scope.", 400);
  }
  const preliminaryGate = await getLegacyAccountGate(requiredPages(scope));
  const exportPermissions = { operations: "orders.operations.export", maintenance: "orders.maintenance.export", current: "orders.my.export" };
  const gate = exportPermissions[scope] ? featureGate(preliminaryGate, exportPermissions[scope]) : preliminaryGate;
  if (!gate.ok) return jsonError(gate.error || "Authentication required.", gate.status || 503);

  try {
    if (scope === "current" || scope === "operations") {
      await assertOrderIdsInScope(gate.account, scope === "current" ? "orders.my.export" : "orders.operations.export", body?.orderIds);
    }
    await verifyScopedOrderAccess(scope, gate.account || {}, body?.orderIds);
    const result = await renderOrderExport({
      account: gate.account || {},
      orderIds: body?.orderIds,
      kind: body?.kind,
      tab: body?.tab,
      columns: body?.columns,
      instruction: body?.instruction,
      sortMode: body?.sortMode,
      signatureLabels: body?.signatureLabels,
      repeatedComponentMode: body?.repeatedComponentMode,
      combinedOrders: body?.combinedOrders,
      template: body?.template,
      sparePartColumns: body?.sparePartColumns,
      checklist: body?.checklist,
    });

    const fileName = safeDownloadName(result?.fileName, body?.kind === "excel" ? "order.xlsx" : "order.pdf");
    const buffer = Buffer.isBuffer(result?.buffer) ? result.buffer : Buffer.from(result?.buffer || []);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": result?.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(buffer.length),
        "X-ERP-Export-Mode": "next-direct",
      },
    });
  } catch (error) {
    return jsonError(error?.message || "Order export failed.", Number(error?.status) || 500);
  }
}

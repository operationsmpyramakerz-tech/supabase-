import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { featureGate } from "../../../../../lib/feature-permissions-server";
import { assertOrderIdsInScope } from "../../../../../lib/order-data-scope";
import { prStorageIdentityFromIds, savePurchaseRequisition } from "../../../../../lib/purchase-requisition-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error, fallback = "Purchase Requisition save failed") {
  const status = Number(error?.status) || 500;
  return NextResponse.json({ error: status >= 500 ? (error?.message || fallback) : (error?.message || fallback) }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const gate = featureGate(await getLegacyAccountGate(["Requested Orders", "Operations Orders"]), "orders.operations.export");
  if (!gate.ok) return errorResponse({ status: gate.status || 403, message: gate.error || "Access denied" });
  const body = await request.json().catch(() => null);
  if (!body || JSON.stringify(body).length > 600_000) return errorResponse({ status: 413, message: "Purchase Requisition is too large or invalid." });
  const ids = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String).filter(id => /^\d+$/.test(id)))];
  if (!ids.length || ids.length > 1000) return errorResponse({ status: 400, message: "Invalid order selection." });
  if (!body.form || typeof body.form !== "object" || Array.isArray(body.form)) return errorResponse({ status: 400, message: "Invalid Purchase Requisition form." });
  try {
    await assertOrderIdsInScope(gate.account, "orders.operations.export", ids);
    const identity = await prStorageIdentityFromIds(ids);
    const saved = await savePurchaseRequisition(identity, body.form, gate.account);
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from "next/server";
import { loadOrderReceiptViewerItems } from "../../../../lib/order-receipts-data";
import { getLegacyAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Expenses", "Expenses Users"]);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }
  const url = new URL(request.url);
  const ids = String(url.searchParams.get("ids") || "").trim();
  const fresh = url.searchParams.get("_fresh") === "1";
  try {
    const payload = await loadOrderReceiptViewerItems(ids, { fresh });
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load order receipts." }, { status: Number(error?.status) || 500 });
  }
}

import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../lib/legacy-api";
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
    // Compatibility for old Notion-style ids during the migration window.
    if (error?.code === "LEGACY_RECEIPT_REFERENCE") {
      const legacy = await fetchLegacyJson(`/api/orders/order-receipts?ids=${encodeURIComponent(ids)}`, { timeoutMs: 20_000 });
      if (legacy.ok && legacy.data) return NextResponse.json(legacy.data, { headers: { "Cache-Control": "private, no-store" } });
      return NextResponse.json({ ok: false, error: legacy.error || legacy.data?.error || error.message }, { status: legacy.status || 502 });
    }
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load order receipts." }, { status: Number(error?.status) || 500 });
  }
}

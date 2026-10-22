import { NextResponse } from "next/server";
import { loadOrderReceiptViewerItems } from "../../../../lib/order-receipts-data";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Expenses", "Expenses Users"]);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }
  // Page access alone must not bypass an explicitly disabled advanced View.
  if (!featureAllowed(gate.account, "expenses.view") && !featureAllowed(gate.account, "expenses.users.view")) {
    return NextResponse.json({ ok: false, error: "Expense receipt access denied." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  const url = new URL(request.url);
  const ids = String(url.searchParams.get("ids") || "").trim();
  try {
    const payload = await loadOrderReceiptViewerItems(ids, { account: gate.account });
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to load order receipts." }, { status: Number(error?.status) || 500, headers: { "Cache-Control": "private, no-store" } });
  }
}

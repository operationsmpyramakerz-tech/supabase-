import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { featureGate } from "../../../../../lib/feature-permissions-server";
import { expenseDestinationOptions } from "../../../../../lib/expenses-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = featureGate(await getDirectAccountGate(["Expenses"]), "expenses.cash_out");
  if (!gate.ok) {
    return NextResponse.json({ success: false, error: gate.error || "Access denied." },
      { status: gate.status || 503, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    return NextResponse.json({ success: true, options: await expenseDestinationOptions() },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[expenses] destination options failed:", error?.message || error);
    return NextResponse.json({ success: false, error: "Failed to load destination users." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}

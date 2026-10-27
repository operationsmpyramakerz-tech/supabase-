import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { expenseTypeOptions } from "../../../../lib/expenses-data";
import { ownCarRatePerKm } from "../../../../lib/own-car-expense.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = featureGate(await getDirectAccountGate(["Expenses"]), "expenses.view");
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }
  try {
    return NextResponse.json({ success: true, options: await expenseTypeOptions(), ownCarRate: ownCarRatePerKm(), source: "supabase" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[next expense types]", error?.details || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load expense types." },
      { status: Number(error?.status) || 500 },
    );
  }
}

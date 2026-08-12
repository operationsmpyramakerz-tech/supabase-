import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { expenseTypeOptions } from "../../../../lib/expenses-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await getLegacyAccountGate(["Expenses"]);
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }
  try {
    return NextResponse.json({ success: true, options: await expenseTypeOptions(), source: "supabase" });
  } catch (error) {
    console.error("[next expense types]", error?.details || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load expense types." },
      { status: Number(error?.status) || 500 },
    );
  }
}

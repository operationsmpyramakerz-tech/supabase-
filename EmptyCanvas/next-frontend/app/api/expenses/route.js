import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { expensesForAccount } from "../../../lib/expenses-data";

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
    return NextResponse.json(await expensesForAccount(gate.account || {}), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[next expenses]", error?.details || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load expenses." },
      { status: Number(error?.status) || 500 },
    );
  }
}

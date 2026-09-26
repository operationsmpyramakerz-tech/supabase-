import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { expensesForAccount } from "../../../lib/expenses-data";
import { measurePerformance } from "../../../lib/performance-profiler";

export const dynamic = "force-dynamic";

async function GETImpl() {
  const gate = await getDirectAccountGate(["Expenses"]);
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

export async function GET(request) {
  return await measurePerformance("route", "expenses.list", async () => await GETImpl(request), { method: "GET" });
}

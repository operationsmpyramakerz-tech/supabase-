import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { cashInFromOptions } from "../../../../../lib/expenses-data";

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
    return NextResponse.json({ success: true, options: await cashInFromOptions(), source: "supabase" });
  } catch (error) {
    console.error("[next expense cash-in options]", error?.details || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load cash-in options." },
      { status: Number(error?.status) || 500 },
    );
  }
}

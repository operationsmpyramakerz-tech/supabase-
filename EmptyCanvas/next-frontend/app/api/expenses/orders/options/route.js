import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { expenseOrderOptions } from "../../../../../lib/expenses-data";

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
    return NextResponse.json({
      success: true,
      source: "supabase-next",
      options: await expenseOrderOptions(),
    }, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch (error) {
    console.error("[next expense order options]", error?.details || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load expense order options." },
      { status: Number(error?.status) || 500 },
    );
  }
}

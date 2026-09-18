import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { expenseUsersSummary } from "../../../../lib/expenses-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Expenses Users"]);
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    return NextResponse.json(
      { success: true, users: await expenseUsersSummary({ fresh }), source: "supabase-next" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /next/api/expenses/users error:", error?.details || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load expense users." },
      { status: Number(error?.status) || 500 },
    );
  }
}

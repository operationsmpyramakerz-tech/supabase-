import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { expensesForMemberId } from "../../../../../lib/expenses-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request, { params }) {
  const gate = await getDirectAccountGate(["Expenses Users"]);
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  try {
    const { memberId } = await params;
    return NextResponse.json(await expensesForMemberId(memberId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/expenses/user/:memberId error:", error?.details || error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load this user's expenses." },
      { status: Number(error?.status) || 500 },
    );
  }
}

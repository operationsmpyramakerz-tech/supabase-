import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { featureGate } from "../../../../../lib/feature-permissions-server";
import { resolveExpenseUserAccess, scopeExpenseDetail } from "../../../../../lib/expenses-users-scope";
import { expensesForMemberId } from "../../../../../lib/expenses-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request, { params }) {
  const gate = featureGate(await getDirectAccountGate(["Expenses Users"]), "expenses.users.view");
  if (!gate.ok) {
    return NextResponse.json(
      { success: false, error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  try {
    const { memberId } = await params;
    const lookupId = await resolveExpenseUserAccess(gate.account, "expenses.users.view", memberId);
    const payload = await expensesForMemberId(lookupId);
    return NextResponse.json(await scopeExpenseDetail(gate.account, "expenses.users.view", memberId, payload), {
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

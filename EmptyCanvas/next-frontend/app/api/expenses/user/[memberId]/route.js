import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { featureAllowed } from "../../../../../lib/feature-permissions-registry";
import { featureGate } from "../../../../../lib/feature-permissions-server";
import { resolveExpenseUserAccess, scopeExpenseDetail } from "../../../../../lib/expenses-users-scope";
import { expenseDestinationOptions, expensesForMemberId } from "../../../../../lib/expenses-data";

import { buildExpenseDestinationFilters } from "../../../../../lib/expense-users-filters.mjs";

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
    const scoped = await scopeExpenseDetail(gate.account, "expenses.users.view", memberId, payload);
    // Never expose the full directory or derive options from unscoped expenses.
    let directory = [];
    let destinationOptionsUnavailable = false;
    try { directory = await expenseDestinationOptions({ fresh: true }); }
    catch (error) {
      destinationOptionsUnavailable = true;
      console.warn("[expenses/users] destination filter directory unavailable:", error?.message || error);
    }
    const destinationFilters = buildExpenseDestinationFilters(scoped.items || [], directory);
    let canEdit = false;
    if (featureAllowed(gate.account, "expenses.users.edit", { legacyAllowed: false })) {
      try { await resolveExpenseUserAccess(gate.account, "expenses.users.edit", memberId); canEdit = true; }
      catch { /* fail closed for user-specific edit scope */ }
    }
    return NextResponse.json({ ...scoped, ...destinationFilters, destinationOptionsUnavailable, canEdit }, {
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

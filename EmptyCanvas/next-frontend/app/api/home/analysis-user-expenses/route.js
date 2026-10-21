import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";
import { homeSelection, homeTeamAnalysisAllowed, homeFinanceAllowed, canHomeAccessOtherExpenses } from "../../../../lib/home-analysis-permissions";
import { expensesForMemberId } from "../../../../lib/expenses-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Expenses"]);
  if (!gate.ok) {
    return noStore(
      { items: [], error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  if (!homeSelection(gate.account).allowed || !homeFinanceAllowed(gate.account) || !featureAllowed(gate.account, "expenses.view")) {
    return noStore({ items: [], error: "Financial analysis access denied." }, { status: 403 });
  }
  const userId = String(new URL(request.url).searchParams.get("userId") || "").trim();
  if (!userId) return noStore({ items: [], error: "Missing user id." }, { status: 400 });
  // A user may view their own expenses. Viewing another member requires
  // the detailed Expenses by Users permission when that module is opted in.
  if (userId !== String(gate.memberId || "") && (!homeTeamAnalysisAllowed(gate.account) || !canHomeAccessOtherExpenses(gate.account))) {
    return noStore({ items: [], error: "User expenses access denied." }, { status: 403 });
  }

  try {
    const payload = await expensesForMemberId(userId);
    return noStore({ ...payload, source: "supabase-next" });
  } catch (error) {
    return noStore(
      { items: [], error: error?.message || "Failed to load user expenses." },
      { status: error?.status || 500 },
    );
  }
}

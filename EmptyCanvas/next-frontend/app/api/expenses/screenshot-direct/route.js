import { NextResponse } from "next/server";
import { assertExpenseRecordAccess } from "../../../../lib/expenses-users-scope";
import { expenseScreenshotForId } from "../../../../lib/expenses-data";
import { expensesForAccount } from "../../../../lib/expenses-data";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const url = new URL(request.url);
  const expenseId = String(url.searchParams.get("expenseId") || "").trim();
  const index = url.searchParams.get("index") || "0";

  // A receipt lookup by arbitrary ID must never be publicly accessible.
  // Expenses users may only download a receipt from their own ledger;
  // administrators with Expenses Users View may inspect team receipts.
  const ownGate = featureGate(await getDirectAccountGate(["Expenses"]), "expenses.screenshot");
  const teamGate = featureGate(await getDirectAccountGate(["Expenses Users"]), "expenses.users.view");
  if (!teamGate.ok) {
    if (!ownGate.ok) return new Response("Access denied.", { status: ownGate.status === 401 ? 401 : 403 });
    const ledger = await expensesForAccount(ownGate.account).catch(() => null);
    if (!ledger) return new Response("Expense access temporarily unavailable.", { status: 503 });
    if (!(ledger.items || []).some(item => String(item.id || "") === expenseId)) {
      return new Response("Expense receipt not found.", { status: 404 });
    }
  }

  try {
    if (teamGate.ok) await assertExpenseRecordAccess(teamGate.account, "expenses.users.view", expenseId);
    const screenshot = await expenseScreenshotForId(expenseId, index);
    const response = NextResponse.redirect(screenshot.url, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return new Response(error?.message || "Failed to open screenshot.", {
      status: Number(error?.status) || 500,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

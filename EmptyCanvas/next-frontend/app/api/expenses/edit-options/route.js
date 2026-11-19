import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { assertExpenseRecordAccess } from "../../../../lib/expenses-users-scope";
import { expenseTypeOptions, expenseDestinationOptions, expenseOrderOptions } from "../../../../lib/expenses-data";
import { scopeExpenseOrderOptions } from "../../../../lib/expense-order-access";

export const dynamic = "force-dynamic";
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request) {
  const gate = featureGate(await getDirectAccountGate(["Expenses Users"]), "expenses.users.edit", { legacyAllowed: false });
  if (!gate.ok) return reply({ success: false, error: gate.error || "Access denied." }, gate.status || 503);
  try {
    await assertExpenseRecordAccess(gate.account, "expenses.users.edit", new URL(request.url).searchParams.get("expenseId"));
    const [fundsTypes, destinationPeople, orderOptions] = await Promise.all([
      expenseTypeOptions(), expenseDestinationOptions(), expenseOrderOptions().then(options => scopeExpenseOrderOptions(gate.account, options)),
    ]);
    return reply({ success: true, fundsTypes, destinationPeople, orderOptions });
  } catch (error) {
    return reply({ success: false, error: error?.message || "Failed to load edit options." }, Number(error?.status) || 500);
  }
}

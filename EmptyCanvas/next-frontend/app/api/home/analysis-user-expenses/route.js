import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
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

  const userId = String(new URL(request.url).searchParams.get("userId") || "").trim();
  if (!userId) return noStore({ items: [], error: "Missing user id." }, { status: 400 });

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

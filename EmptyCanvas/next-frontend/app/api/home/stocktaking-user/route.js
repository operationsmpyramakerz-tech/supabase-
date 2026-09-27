import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { listHomeAnalysisUsers } from "../../../../lib/home-overview-data";
import {
  resolveStocktakingQuantityColumnForLabel,
  stocktakingForAccount,
} from "../../../../lib/stocktaking-data";

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
  const gate = await getLegacyAccountGate(["Stocktaking"]);
  if (!gate.ok) {
    return noStore(
      { user: null, items: [], error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  const userId = String(new URL(request.url).searchParams.get("userId") || "").trim();
  if (!userId) return noStore({ user: null, items: [], error: "Missing user id." }, { status: 400 });

  try {
    const users = await listHomeAnalysisUsers();
    const member = users.find((user) => String(user.id) === userId) || null;
    if (!member) return noStore({ user: null, items: [], error: "User not found." }, { status: 404 });

    const stocktakingColumn = String(member.stocktakingColumn || "").trim();
    const resolvedColumn = stocktakingColumn
      ? await resolveStocktakingQuantityColumnForLabel(stocktakingColumn)
      : "";
    const user = {
      id: String(member.id),
      name: member.name || member.username || String(member.id),
      stocktakingColumn: stocktakingColumn || null,
      hasStocktakingColumn: Boolean(resolvedColumn),
    };

    if (!resolvedColumn) return noStore({ user, items: [], source: "supabase-next" });

    const items = await stocktakingForAccount({
      id: String(member.id),
      teamMemberId: String(member.id),
      name: member.name,
      username: member.username || member.name,
    });

    return noStore({
      user,
      items: (Array.isArray(items) ? items : []).map((item) => ({ ...item, userName: user.name })),
      source: "supabase-next",
    });
  } catch (error) {
    return noStore(
      { user: null, items: [], error: error?.message || "Failed to load the selected user's Stocktaking analysis." },
      { status: error?.status || 500 },
    );
  }
}

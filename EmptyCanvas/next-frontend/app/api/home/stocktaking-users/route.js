import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { listHomeAnalysisUsers } from "../../../../lib/home-overview-data";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";
import { homeTeamAnalysisAllowed } from "../../../../lib/home-analysis-permissions";
import { resolveHomeSelection, scopeHomeUsers } from "../../../../lib/home-team-scopes";
import { resolveStocktakingQuantityColumnForLabel } from "../../../../lib/stocktaking-data";

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

export async function GET() {
  const gate = await getLegacyAccountGate(["Stocktaking"]);
  if (!gate.ok) {
    return noStore(
      { users: [], error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  const selection = await resolveHomeSelection(gate.account);
  if (!selection.allowed || !homeTeamAnalysisAllowed(gate.account) || !featureAllowed(gate.account, "stocktaking.view")) {
    return noStore({ error: "Home stocktaking access denied." }, { status: 403 });
  }

  try {
    const baseUsers = await scopeHomeUsers(gate.account, await listHomeAnalysisUsers());
    const users = await Promise.all(baseUsers.map(async (user) => {
      const stocktakingColumn = String(user?.stocktakingColumn || "").trim();
      const resolvedColumn = stocktakingColumn
        ? await resolveStocktakingQuantityColumnForLabel(stocktakingColumn)
        : "";
      return {
        id: String(user.id),
        name: user.name || user.username || String(user.id),
        stocktakingColumn: stocktakingColumn || null,
        hasStocktakingColumn: Boolean(resolvedColumn),
      };
    }));

    return noStore({ users, source: "supabase-next" });
  } catch (error) {
    return noStore(
      { users: [], error: error?.message || "Failed to load Stocktaking users." },
      { status: error?.status || 500 },
    );
  }
}

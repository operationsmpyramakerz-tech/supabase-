import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { stocktakingForAccount, stocktakingForColumn } from "../../../lib/stocktaking-data";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Stocktaking"]);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  try {
    const url = new URL(request.url);
    const column = String(url.searchParams.get("column") || "").trim();
    const inventoryColumn = String(url.searchParams.get("inventoryColumn") || url.searchParams.get("inventory_column") || "").trim();
    const defectedColumn = String(url.searchParams.get("defectedColumn") || url.searchParams.get("defected_column") || "").trim();
    const fresh = url.searchParams.get("_fresh") === "1";
    const items = column
      ? await stocktakingForColumn(column, { inventoryColumn, defectedColumn, fresh })
      : await stocktakingForAccount(gate.account || {}, { fresh });
    return NextResponse.json(items, {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[next stocktaking]", error?.details || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load stock data." },
      { status: Number(error?.status) || 500 },
    );
  }
}

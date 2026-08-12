import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { stocktakingForAccount } from "../../../lib/stocktaking-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await getLegacyAccountGate(["Stocktaking"]);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.error || "Access denied." },
      { status: gate.status || 503 },
    );
  }

  try {
    const items = await stocktakingForAccount(gate.account || {});
    return NextResponse.json(items, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[next stocktaking]", error?.details || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load stock data." },
      { status: Number(error?.status) || 500 },
    );
  }
}

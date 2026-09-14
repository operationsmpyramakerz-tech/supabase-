import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { listStocktakingFolders } from "../../../../lib/stocktaking-data";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Stocktaking"]);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, columns: [], error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }
  try {
    const url = new URL(request.url);
    const fresh = url.searchParams.get("_fresh") === "1";
    const columns = await listStocktakingFolders({ fresh });
    return NextResponse.json({ ok: true, source: "supabase-next", columns });
  } catch (error) {
    return NextResponse.json(
      { ok: false, columns: [], error: error?.message || "Failed to load Stocktaking columns." },
      { status: Number(error?.status) || 500 },
    );
  }
}

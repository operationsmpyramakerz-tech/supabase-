import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { listStocktakingProducts } from "../../../../lib/stocktaking-data";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gate = await getDirectAccountGate(["Stocktaking"]);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, products: [], error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }
  try {
    const url = new URL(request.url);
    const fresh = url.searchParams.get("_fresh") === "1";
    const products = await listStocktakingProducts({ fresh });
    return NextResponse.json({ ok: true, source: "supabase-next", products });
  } catch (error) {
    return NextResponse.json(
      { ok: false, products: [], error: error?.message || "Failed to load Products for Stocktaking." },
      { status: Number(error?.status) || 500 },
    );
  }
}

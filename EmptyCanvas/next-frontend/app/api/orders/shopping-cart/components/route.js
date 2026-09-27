import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { listCreateOrderComponents } from "../../../../../lib/shopping-cart-support";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const gate = await getDirectAccountGate(["Create New Order"]);
  if (!gate.ok) return NextResponse.json({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  try {
    const url = new URL(request.url);
    const items = await listCreateOrderComponents({ fresh: url.searchParams.get("_fresh") === "1" });
    return NextResponse.json(Array.isArray(items) ? items : [], { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed to fetch products." }, { status: Number(error?.status) || 500 });
  }
}

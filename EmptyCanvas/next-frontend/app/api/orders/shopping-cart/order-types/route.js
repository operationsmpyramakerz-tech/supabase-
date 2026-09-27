import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { createOrderTypesPayload } from "../../../../../lib/shopping-cart-support";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gate = await getDirectAccountGate(["Create New Order"]);
  if (!gate.ok) return NextResponse.json({ options: [], error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  return NextResponse.json(createOrderTypesPayload(), { headers: { "Cache-Control": "private, no-store" } });
}

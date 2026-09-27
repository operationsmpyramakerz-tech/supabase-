import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { listCreateOrderSchools } from "../../../../../lib/shopping-cart-support";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gate = await getDirectAccountGate(["Create New Order"]);
  if (!gate.ok) return NextResponse.json({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  try {
    return NextResponse.json(await listCreateOrderSchools(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Failed to fetch schools." }, { status: Number(error?.status) || 500 });
  }
}

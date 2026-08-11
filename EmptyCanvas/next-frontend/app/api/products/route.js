import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { createProduct, getProductsCatalog } from "../../../lib/products-service";

export const dynamic = "force-dynamic";

function gateResponse(gate) {
  return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status || 503 });
}

function errorResponse(error, fallback) {
  return NextResponse.json(
    { ok: false, error: error?.message || fallback },
    { status: Number(error?.status) || 500 },
  );
}

export async function GET() {
  const gate = await getLegacyAccountGate(["Products", "Proposals"]);
  if (!gate.ok) return gateResponse(gate);

  try {
    return NextResponse.json(await getProductsCatalog(), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/products error:", error?.details || error);
    return errorResponse(error, "Failed to load products from Supabase.");
  }
}

export async function POST(request) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);

  try {
    const body = await request.json().catch(() => ({}));
    const product = await createProduct(body);
    return NextResponse.json({ ok: true, source: "supabase-next", product }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("POST /next/api/products error:", error?.details || error);
    return errorResponse(error, "Failed to create product.");
  }
}

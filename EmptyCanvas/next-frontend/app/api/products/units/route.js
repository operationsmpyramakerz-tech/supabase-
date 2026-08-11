import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { createProductUnit, listProductUnits } from "../../../../lib/products-service";

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
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);
  try {
    return NextResponse.json({ ok: true, source: "supabase-next", units: await listProductUnits() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Failed to load product units.");
  }
}

export async function POST(request) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await request.json().catch(() => ({}));
    const unit = await createProductUnit(body?.name || body?.unit || body?.newUnit);
    return NextResponse.json({ ok: true, source: "supabase-next", unit: unit.name, alreadyExists: !!unit.alreadyExists }, {
      status: unit.alreadyExists ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Failed to add product unit.");
  }
}

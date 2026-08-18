import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { createProductImageUploadTicket } from "../../../../lib/products-service";

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

export async function POST(request) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);

  try {
    const body = await request.json().catch(() => ({}));
    const upload = await createProductImageUploadTicket({
      filename: body?.filename || body?.name,
      mime: body?.mime || body?.type,
      size: body?.size,
    });
    return NextResponse.json({ ok: true, upload }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("POST /next/api/products/image-upload error:", error?.details || error);
    return errorResponse(error, "Failed to prepare the product image upload.");
  }
}

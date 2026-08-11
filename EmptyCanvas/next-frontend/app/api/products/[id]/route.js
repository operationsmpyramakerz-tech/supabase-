import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { deleteProduct, updateProduct } from "../../../../lib/products-service";

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

export async function PATCH(request, { params }) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const product = await updateProduct(id, body);
    return NextResponse.json({ ok: true, source: "supabase-next", product }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("PATCH /next/api/products/:id error:", error?.details || error);
    return errorResponse(error, "Failed to update product.");
  }
}

export async function DELETE(_request, { params }) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);

  try {
    const { id } = await params;
    await deleteProduct(id);
    return NextResponse.json({ ok: true, source: "supabase-next", deletedId: String(id || "") }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("DELETE /next/api/products/:id error:", error?.details || error);
    return errorResponse(error, "Failed to delete product.");
  }
}

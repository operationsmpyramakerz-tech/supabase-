import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { featureGate } from "../../../../../lib/feature-permissions-server";
import { shoppingSourceAllowed } from "../../../../../lib/feature-permissions-registry";
import { createProductImageUploadTicket } from "../../../../../lib/products-service";

export const dynamic = "force-dynamic";
export async function POST(request) {
  const gate = featureGate(await getLegacyAccountGate(["Create New Order"]), "orders.shopping.submit");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status || 403 });
  if (!shoppingSourceAllowed(gate.account, "components")) {
    return NextResponse.json({ ok: false, error: "Components permission is required to request a new product." }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const upload = await createProductImageUploadTicket({ filename: body?.filename, mime: body?.mime, size: body?.size });
    return NextResponse.json({ ok: true, upload }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Image upload failed." }, { status: Number(error?.status) || 500 });
  }
}

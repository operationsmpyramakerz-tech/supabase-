import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { orderActionGate } from "../../../../../lib/current-shopping-action-permissions.mjs";
import { shoppingSourceAllowed } from "../../../../../lib/feature-permissions-registry";
import { createProductImageUploadTicket } from "../../../../../lib/products-service";

export const dynamic = "force-dynamic";
export async function POST(request) {
  const editMode = new URL(request.url).searchParams.get("edit") === "1";
  const sessionGate = await getLegacyAccountGate(["Create New Order"]);
  let gate = orderActionGate(sessionGate, editMode ? "orders.shopping.edit_submit" : "orders.shopping.submit");
  if (editMode) gate = orderActionGate(gate, "orders.my.edit");
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

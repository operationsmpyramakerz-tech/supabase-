import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { createProductFileUploadTicket } from "../../../../lib/products-service";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const gate = await getDirectAccountGate("Products");
  const create = featureGate(gate, "products.create");
  const edit = featureGate(gate, "products.edit");
  if (!create.ok && !edit.ok) return NextResponse.json({ ok: false, error: create.error || edit.error }, { status: create.status || 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const upload = await createProductFileUploadTicket({ filename: body.filename, mime: body.mime, size: body.size });
    return NextResponse.json({ ok: true, upload }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "File upload failed." }, { status: error?.status || 500 });
  }
}

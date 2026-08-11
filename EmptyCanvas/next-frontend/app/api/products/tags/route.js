import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import {
  createProductTag,
  deleteProductTag,
  listProductTags,
  renameProductTag,
} from "../../../../lib/products-service";

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
    return NextResponse.json({ ok: true, source: "supabase-next", tags: await listProductTags() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Failed to load product tags.");
  }
}

export async function POST(request) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await request.json().catch(() => ({}));
    const tag = await createProductTag(body?.name || body?.tag || body?.newTag);
    return NextResponse.json({ ok: true, source: "supabase-next", tag: tag.name, alreadyExists: !!tag.alreadyExists }, {
      status: tag.alreadyExists ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Failed to add product tag.");
  }
}

export async function PATCH(request) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await request.json().catch(() => ({}));
    const result = await renameProductTag(body?.oldTag, body?.newTag);
    return NextResponse.json({ ok: true, source: "supabase-next", ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Failed to update products tag.");
  }
}

export async function DELETE(request) {
  const gate = await getLegacyAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await request.json().catch(() => ({}));
    const result = await deleteProductTag(body?.tag || body?.name);
    return NextResponse.json({ ok: true, source: "supabase-next", ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Failed to delete product tag.");
  }
}

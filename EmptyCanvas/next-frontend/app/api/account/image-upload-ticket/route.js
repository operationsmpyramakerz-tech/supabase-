import { NextResponse } from "next/server";

import { prepareAccountImageUpload } from "../../../../lib/account-direct";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request) {
  const gate = await getDirectAccountGate([]);
  if (!gate.ok || !gate.account) {
    return json({ ok: false, error: gate.error || "Authentication required." }, gate.status || 503);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await prepareAccountImageUpload(gate.account, body);
    return json(result);
  } catch (error) {
    console.error("POST /next/api/account/image-upload-ticket error:", error?.details || error);
    const message = /bucket|storage/i.test(String(error?.message || ""))
      ? "Supabase Storage is not configured. Add SUPABASE_STORAGE_BUCKET in Vercel."
      : (error?.message || "Failed to prepare image upload.");
    return json({ ok: false, error: message }, Number(error?.status) || 500);
  }
}

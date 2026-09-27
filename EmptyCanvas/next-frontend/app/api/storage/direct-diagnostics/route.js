import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../../lib/products-auth";
import { storageDiagnostics } from "../../../../lib/storage-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.account) {
    return NextResponse.json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503, headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ ok: true, storage: storageDiagnostics(), source: "supabase-next" }, { headers: { "Cache-Control": "private, no-store" } });
}

import { NextResponse } from "next/server";

import { verifyAccountPassword } from "../../../../lib/account-direct";
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
    await verifyAccountPassword(gate.account, body?.currentPassword);
    return json({ ok: true, source: "supabase-next" });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Failed to verify password." }, Number(error?.status) || 500);
  }
}

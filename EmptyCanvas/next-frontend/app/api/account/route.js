import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../lib/products-auth";
import { normalizeAccountPayload, updateAccountDirect } from "../../../lib/account-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function accountGate() {
  return await getDirectAccountGate([]);
}

export async function GET() {
  const gate = await accountGate();
  if (!gate.ok || !gate.account) {
    return json({ error: gate.error || "Authentication required." }, gate.status || 503);
  }
  return json(normalizeAccountPayload(gate.account));
}

export async function PATCH(request) {
  const gate = await accountGate();
  if (!gate.ok || !gate.account) {
    return json({ success: false, error: gate.error || "Authentication required." }, gate.status || 503);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await updateAccountDirect(gate.account, body);
    return json(result);
  } catch (error) {
    console.error("PATCH /next/api/account error:", error?.details || error);
    return json(
      { success: false, error: error?.message || "Failed to update account." },
      Number(error?.status) || 500,
    );
  }
}

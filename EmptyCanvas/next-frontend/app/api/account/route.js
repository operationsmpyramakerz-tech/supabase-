import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

export async function GET() {
  const gate = await getLegacyAccountGate([]);
  if (!gate.ok || !gate.account) {
    return noStore(
      { error: gate.error || "Authentication required." },
      { status: gate.status || 503 },
    );
  }
  return noStore(gate.account);
}

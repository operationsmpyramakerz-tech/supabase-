import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { listHomeAnalysisUsers } from "../../../../lib/home-overview-data";

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
  if (!gate.ok) {
    return noStore(
      { users: [], error: gate.error || "Authentication required." },
      { status: gate.status || 503 },
    );
  }

  try {
    const users = await listHomeAnalysisUsers();
    return noStore({ users, source: "supabase-next" });
  } catch (error) {
    return noStore(
      { users: [], error: error?.message || "Failed to load analysis users." },
      { status: error?.status || 500 },
    );
  }
}

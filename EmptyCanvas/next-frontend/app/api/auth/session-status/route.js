import { NextResponse } from "next/server";
import { getDirectSessionAccountGate } from "../../../../lib/direct-session-account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gate = await getDirectSessionAccountGate([], { authOnly: true }).catch(() => null);
  if (!gate?.ok || !gate?.account) {
    return NextResponse.json({ ok: false, authenticated: false, redirect: "/login" }, { status: gate?.status === 401 ? 401 : 503, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  }
  const memberId = String(gate.memberId || gate.account?.userSupabaseId || gate.account?.teamMemberId || gate.account?.id || "").trim();
  return NextResponse.json({
    ok: true,
    authenticated: true,
    memberId: memberId || null,
    userSupabaseId: memberId || null,
    username: String(gate.account?.username || gate.account?.name || "").trim(),
    account: gate.account,
    source: "supabase-next",
  }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

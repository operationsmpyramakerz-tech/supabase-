import { NextResponse } from "next/server";
import { getDirectSessionAccountGate } from "../../../../lib/direct-session-account";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const directConfigured = Boolean(String(process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || "").trim() || (String(process.env.UPSTASH_REDIS_REST_URL || "").trim() && String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()));
  const gate = await getDirectSessionAccountGate([], { authOnly: true }).catch(() => null);
  return NextResponse.json({
    ok: true,
    directSessionConfigured: directConfigured,
    cookieName: String(process.env.SESSION_COOKIE_NAME || "op.sid"),
    authenticated: Boolean(gate?.ok),
    sessionBackend: gate?.sessionBackend || "",
    source: "next-direct",
  }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { getDirectSessionAccountGate } from "../../../../lib/direct-session-account";
import { isTrustedLegacyAdmin } from "../../../../lib/admin-identity-policy.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gate = await getDirectSessionAccountGate([], { authOnly: true }).catch(() => null);
  if (!gate?.ok || !gate?.account || !isTrustedLegacyAdmin(gate.account)) {
    return NextResponse.json({ ok: false, error: "Diagnostics access denied." }, {
      status: gate?.ok ? 403 : (gate?.status === 401 ? 401 : 403),
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const directConfigured = Boolean(String(process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || "").trim() || (String(process.env.UPSTASH_REDIS_REST_URL || "").trim() && String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()));
  return NextResponse.json({
    ok: true,
    directSessionConfigured: directConfigured,
    cookieName: String(process.env.SESSION_COOKIE_NAME || "op.sid"),
    authenticated: Boolean(gate?.ok),
    sessionBackend: gate?.sessionBackend || "",
    source: "next-direct",
  }, { headers: { "Cache-Control": "private, no-store" } });
}

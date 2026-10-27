import { NextResponse } from "next/server";
import { clearSessionCookie, logoutDirect, sessionCookieName } from "../../../../lib/core-auth";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { removePushSubscription } from "../../../../lib/push-notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  try {
    // A Web Push subscription belongs to the browser installation. Revoking
    // this device's endpoint before destroying the session prevents the phone
    // receiving confidential ERP notifications after the member signs out.
    // A missing/invalid endpoint must not prevent logout.
    const body = await request.json().catch(() => ({}));
    const endpoint = typeof body?.pushEndpoint === "string" ? body.pushEndpoint.trim() : "";
    if (endpoint && endpoint.length <= 4096 && /^https:\/\//i.test(endpoint)) {
      try {
        const gate = await getDirectAccountGate([], { authOnly: true });
        if (gate.ok && gate.memberId) {
          await removePushSubscription(gate.memberId, endpoint);
        }
      } catch (error) {
        // Do not block logout when Supabase is temporarily unavailable.
        console.warn("[auth-logout] Push device unlink deferred:", Number(error?.status) || "unavailable");
      }
    }
    await logoutDirect(request.cookies.get(sessionCookieName())?.value || "");
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Could not log out." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

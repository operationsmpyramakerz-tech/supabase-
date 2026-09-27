import { NextResponse } from "next/server";
import { clearSessionCookie, logoutDirect, sessionCookieName } from "../../../../lib/core-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  try {
    await logoutDirect(request.cookies.get(sessionCookieName())?.value || "");
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    clearSessionCookie(response, request);
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Could not log out." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

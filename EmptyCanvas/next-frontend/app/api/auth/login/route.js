import { NextResponse } from "next/server";
import { loginDirect, setSessionCookie } from "../../../../lib/core-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await loginDirect(body);
    const response = NextResponse.json(result.response, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(response, request, result.session);
    return response;
  } catch (error) {
    const status = Number(error?.status) || 500;
    return NextResponse.json({ success: false, error: error?.message || "Login failed." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

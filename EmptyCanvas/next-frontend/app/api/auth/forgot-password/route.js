import { NextResponse } from "next/server";
import { recoverPasswordDirect } from "../../../../lib/core-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = await recoverPasswordDirect(body?.email);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to send password recovery email." }, { status: Number(error?.status) || 500, headers: { "Cache-Control": "no-store" } });
  }
}

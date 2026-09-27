import { NextResponse } from "next/server";
import { createSignupRequestDirect } from "../../../../lib/core-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request) {
  try {
    const payload = await createSignupRequestDirect(await request.json().catch(() => ({})));
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Failed to submit sign up request." }, { status: Number(error?.status) || 500, headers: { "Cache-Control": "no-store" } });
  }
}

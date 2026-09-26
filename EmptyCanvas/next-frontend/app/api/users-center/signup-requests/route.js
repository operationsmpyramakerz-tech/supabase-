import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { usersCenterSignupRequests } from "../../../../lib/users-center-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

export async function GET(request) {
  const gate = await getDirectAccountGate(ACCESS_PAGES);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, requests: [], error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }

  try {
    const status = request.nextUrl.searchParams.get("status") || "pending";
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    return NextResponse.json(await usersCenterSignupRequests({ status, fresh }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/users-center/signup-requests error:", error?.details || error);
    return NextResponse.json(
      { ok: false, requests: [], error: error?.message || "Failed to load sign up requests." },
      { status: Number(error?.status) || 500 },
    );
  }
}

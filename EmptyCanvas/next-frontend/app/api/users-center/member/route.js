import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { usersCenterMemberEditorBundle } from "../../../../lib/users-center-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

export async function GET(request) {
  const gate = await getDirectAccountGate(ACCESS_PAGES);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }

  try {
    const id = String(request.nextUrl.searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "Missing team member ID." }, { status: 400 });
    return NextResponse.json(await usersCenterMemberEditorBundle(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/users-center/member error:", error?.details || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load team member details." },
      { status: Number(error?.status) || 500 },
    );
  }
}

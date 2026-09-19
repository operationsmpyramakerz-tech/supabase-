import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { usersCenterMemberDetails } from "../../../../../lib/users-center-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

export async function GET(_request, { params }) {
  const gate = await getLegacyAccountGate(ACCESS_PAGES);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }

  try {
    const { id } = await params;
    return NextResponse.json(await usersCenterMemberDetails(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/users-center/team-members/:id error:", error?.details || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load team member details." },
      { status: Number(error?.status) || 500 },
    );
  }
}

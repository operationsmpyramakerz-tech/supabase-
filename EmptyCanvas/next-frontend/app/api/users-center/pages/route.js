import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { usersCenterPages } from "../../../../lib/users-center-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

export async function GET() {
  const gate = featureGate(featureGate(await getDirectAccountGate(ACCESS_PAGES), "users.view"), "users.page_access_manage");
  if (!gate.ok) {
    return NextResponse.json({ ok: false, pages: [], error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }

  try {
    return NextResponse.json(await usersCenterPages(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/users-center/pages error:", error?.details || error);
    return NextResponse.json(
      { ok: false, pages: [], error: error?.message || "Failed to load Users Center pages." },
      { status: Number(error?.status) || 500 },
    );
  }
}

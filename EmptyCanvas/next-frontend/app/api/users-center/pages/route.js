import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { usersCenterPages } from "../../../../lib/users-center-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

export async function GET() {
  const gate = await getLegacyAccountGate(ACCESS_PAGES);
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

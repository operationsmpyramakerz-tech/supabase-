import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate, getMemberFeatureAccessForAdmin } from "../../../../lib/feature-permissions-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

export async function GET(request) {
  const gate = featureGate(await getDirectAccountGate(PAGES), "users.feature_access_manage");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status || 503 });
  const id = String(new URL(request.url).searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing member ID." }, { status: 400 });
  try {
    const state = await getMemberFeatureAccessForAdmin(id);
    return NextResponse.json({ ok: true, ...state }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Cannot load feature grants." }, { status: Number(error?.status) || 500 });
  }
}

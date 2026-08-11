import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../lib/legacy-api";
import { getProductsCatalog } from "../../../lib/products-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await fetchLegacyJson("/api/page-bootstrap?scope=products", { timeoutMs: 15000 });

  if (gate.status === 401) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (gate.status === 403) {
    return NextResponse.json({ ok: false, error: "Products access is not allowed for this account." }, { status: 403 });
  }
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error || gate.data?.error || "The authentication service is unavailable." }, { status: gate.status || 503 });
  }

  try {
    return NextResponse.json(await getProductsCatalog(), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/products error:", error?.details || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load products from Supabase." },
      { status: Number(error?.status) || 500 },
    );
  }
}

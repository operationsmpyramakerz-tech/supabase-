import { NextResponse } from "next/server";
import { fetchDirectPageBootstrap } from "../../../../lib/page-bootstrap-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const url = new URL(request.url);
  const result = await fetchDirectPageBootstrap(`/api/page-bootstrap${url.search || ""}`);
  return NextResponse.json(result.data || { ok: false, error: result.error || "Unable to prepare page data." }, {
    status: result.status || 500,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}

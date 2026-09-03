import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../../lib/legacy-api";

export const dynamic = "force-dynamic";

function jsonFromLegacy(response, fallbackMessage) {
  const status = Number(response?.status || 0) || 502;
  const data = response?.data && typeof response.data === "object"
    ? response.data
    : { ok: false, error: response?.error || fallbackMessage };
  return NextResponse.json(data, { status });
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const response = await fetchLegacyJson(`/api/products/proposals/${encodeURIComponent(id)}/make-order`, {
      method: "POST",
      body,
      timeoutMs: 120000,
    });
    return jsonFromLegacy(response, "Failed to create order from proposal.");
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to create order from proposal." },
      { status: 500 },
    );
  }
}

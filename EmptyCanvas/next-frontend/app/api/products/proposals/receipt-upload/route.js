import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";

export const dynamic = "force-dynamic";

function jsonFromLegacy(response, fallbackMessage) {
  const status = Number(response?.status || 0) || 502;
  const data = response?.data && typeof response.data === "object"
    ? response.data
    : { ok: false, error: response?.error || fallbackMessage };
  return NextResponse.json(data, { status });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const response = await fetchLegacyJson("/api/products/proposals/receipt-upload", {
      method: "POST",
      body,
      timeoutMs: 45000,
    });
    return jsonFromLegacy(response, "Failed to upload receipt image.");
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to upload receipt image." },
      { status: 500 },
    );
  }
}

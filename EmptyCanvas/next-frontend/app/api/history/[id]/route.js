import { NextResponse } from "next/server";
import { historyDetail } from "../../../../lib/history-data";
import { getLegacyAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function response(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

export async function GET(_request, { params }) {
  const gate = await getLegacyAccountGate(["History"]);
  if (!gate.ok) return response({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  try {
    const resolved = await params;
    const payload = await historyDetail(resolved?.id);
    if (!payload) return response({ ok: false, error: "History data is not available." }, { status: 503 });
    return response(payload);
  } catch (error) {
    return response(
      { ok: false, error: error?.message || "History record could not be loaded." },
      { status: error?.status || 500 },
    );
  }
}

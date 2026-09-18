import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../lib/legacy-api";
import { historyList } from "../../../lib/history-data";
import { getLegacyAccountGate } from "../../../lib/products-auth";

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

export async function GET(request) {
  const gate = await getLegacyAccountGate(["History"]);
  if (!gate.ok) return response({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") || "1000";
  const fresh = url.searchParams.get("_fresh") === "1";

  try {
    const payload = await historyList({ limit, fresh });
    if (payload) return response(payload);
  } catch (error) {
    console.warn("[history] direct list failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/history?limit=${encodeURIComponent(limit)}`, {
    timeoutMs: 20_000,
    fresh,
  });
  if (legacy.ok && legacy.data) return response({ ...legacy.data, source: legacy.data?.source || "legacy" }, { status: legacy.status || 200 });
  return response(
    { ok: false, rows: [], error: legacy.error || legacy.data?.error || "Failed to load system history." },
    { status: legacy.status || 502 },
  );
}

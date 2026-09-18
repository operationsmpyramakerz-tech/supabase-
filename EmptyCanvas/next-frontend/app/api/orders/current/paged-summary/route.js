import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { loadCurrentOrdersPage } from "../../../../../lib/current-orders-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const gate = await getLegacyAccountGate(["Current Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const payload = await loadCurrentOrdersPage({
      account: gate.account,
      tab: url.searchParams.get("tab") || "all",
      type: url.searchParams.get("filterType") || url.searchParams.get("orderTypeKey") || url.searchParams.get("type") || "all",
      query: url.searchParams.get("q") || url.searchParams.get("search") || "",
      cursor: url.searchParams.get("cursor"),
      limit: url.searchParams.get("limit"),
      signal: request.signal,
    });
    if (payload) return noStore(payload);
  } catch (error) {
    if (request.signal?.aborted || error?.code === "REQUEST_ABORTED" || error?.name === "AbortError") throw error;
    console.warn("[current-orders] direct paged summary failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson("/api/orders?mode=summary", {
    timeoutMs: 20_000,
    fresh: url.searchParams.get("_fresh") === "1",
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Failed to load Current Orders." },
    { status: legacy.status || 502 },
  );
}

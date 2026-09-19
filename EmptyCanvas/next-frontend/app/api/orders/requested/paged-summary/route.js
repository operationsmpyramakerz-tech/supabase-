import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { loadOperationsOrdersPage } from "../../../../../lib/operations-orders-data";
import { measurePerformance } from "../../../../../lib/performance-profiler";

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

function legacyQuery(searchParams) {
  const params = new URLSearchParams(searchParams);
  params.set("scope", "all-system");
  params.set("mode", "summary");
  params.set("paged", "1");
  return params.toString();
}

async function GETImpl(request) {
  const url = new URL(request.url);
  const gate = await getLegacyAccountGate(["Requested Orders", "Operations Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const payload = await loadOperationsOrdersPage({
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
    console.warn("[operations-orders] direct paged summary failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/orders/requested?${legacyQuery(url.searchParams)}`, {
    timeoutMs: 25_000,
    fresh: url.searchParams.get("_fresh") === "1",
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Failed to load Operations Orders." },
    { status: legacy.status || 502 },
  );
}

export async function GET(request) {
  return await measurePerformance("route", "orders.operations.summary", async () => await GETImpl(request), { method: "GET" });
}

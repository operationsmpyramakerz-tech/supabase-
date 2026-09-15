import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { updateOrdersReviewQuantity } from "../../../../../lib/orders-review-data";

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

export async function POST(request, context) {
  const { id = "" } = await context.params;
  const body = await request.json().catch(() => ({}));
  const gate = await getLegacyAccountGate(["Orders Review"]);
  if (!gate.ok) return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  try {
    const payload = await updateOrdersReviewQuantity({ account: gate.account, id, value: body?.value });
    if (payload) return noStore(payload);
  } catch (error) {
    const status = Number(error?.status) || 0;
    if ([400, 403, 404].includes(status)) {
      return noStore({ error: error?.message || "Failed to update quantity." }, { status });
    }
    console.warn("[orders-review] direct quantity update failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/sv-orders/${encodeURIComponent(String(id || ""))}/quantity`, {
    method: "POST",
    body: { value: body?.value },
    timeoutMs: 20_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Failed to update quantity." },
    { status: legacy.status || 502 },
  );
}

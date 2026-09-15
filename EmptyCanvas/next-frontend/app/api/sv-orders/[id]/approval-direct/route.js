import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { updateOrdersReviewApproval } from "../../../../../lib/orders-review-data";

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
    const payload = await updateOrdersReviewApproval({
      account: gate.account,
      id,
      decision: body?.decision,
      rejectedReason: body?.rejectedReason ?? body?.reason ?? "",
    });
    if (payload) return noStore(payload);
  } catch (error) {
    const status = Number(error?.status) || 0;
    if ([400, 403, 404].includes(status)) {
      return noStore({ ok: false, error: error?.message || "Failed to update S.V Approval" }, { status });
    }
    console.warn("[orders-review] direct approval failed; using Legacy fallback:", error?.message || error);
  }

  const legacy = await fetchLegacyJson(`/api/sv-orders/${encodeURIComponent(String(id || ""))}/approval`, {
    method: "POST",
    body: {
      decision: body?.decision,
      rejectedReason: body?.rejectedReason ?? body?.reason ?? "",
    },
    timeoutMs: 20_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { ok: false, error: legacy.error || legacy.data?.error || "Failed to update S.V Approval" },
    { status: legacy.status || 502 },
  );
}

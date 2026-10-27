import { NextResponse } from "next/server";

import { verifyPageAdminPasswordDirect } from "../../../../../lib/order-action-auth";
import { getDirectAccountGate } from "../../../../../lib/products-auth";

export const dynamic = "force-dynamic";

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request) {
  const gate = await getDirectAccountGate(["Proposals", "Kits", "Products"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    const password = String(body?.adminPassword || body?.password || "").trim();
    if (!password) return json({ ok: false, error: "Admin password is required." }, 400);

    const verified = await verifyPageAdminPasswordDirect(
      gate.account || {},
      password,
      ["Proposals", "Kits", "Products"],
    );
    if (verified === null) {
      return json({ ok: false, error: "The direct Admin password context is unavailable." }, 503);
    }
    if (!verified) return json({ ok: false, error: "Invalid Admin password." }, 401);
    return json({ ok: true, source: "supabase-next" });
  } catch (error) {
    console.error("POST /next/api/products/admin/verify error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to verify Admin password." }, Number(error?.status) || 500);
  }
}

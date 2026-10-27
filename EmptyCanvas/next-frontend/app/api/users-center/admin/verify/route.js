import { NextResponse } from "next/server";

import { directPageAccessLevel, verifyPageAdminPasswordDirect } from "../../../../../lib/order-action-auth";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { issueUsersCenterAuthorizationToken } from "../../../../../lib/users-center-action-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const gate = await getDirectAccountGate(ACCESS_PAGES);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    const level = directPageAccessLevel(gate.account || {}, ACCESS_PAGES);
    const bypassed = level === "admin";

    if (!bypassed) {
      const password = String(body?.password || body?.adminPassword || "").trim();
      if (!password) return json({ ok: false, error: "Admin password is required." }, 400);
      const verified = await verifyPageAdminPasswordDirect(gate.account || {}, password, ACCESS_PAGES);
      if (verified === null) return json({ ok: false, error: "The direct Admin password context is unavailable." }, 503);
      if (!verified) return json({ ok: false, error: "Invalid Admin password." }, 403);
    }

    const authorization = issueUsersCenterAuthorizationToken(gate.account || {});
    return json({
      ok: true,
      bypassed,
      authorizationToken: authorization.token,
      expiresAt: authorization.expiresAt,
      expiresInSeconds: authorization.expiresInSeconds,
      source: "supabase-next",
    });
  } catch (error) {
    console.error("POST /next/api/users-center/admin/verify error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Failed to verify Admin password." }, Number(error?.status) || 500);
  }
}

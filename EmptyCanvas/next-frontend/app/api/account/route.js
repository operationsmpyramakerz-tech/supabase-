import { NextResponse } from "next/server";

import { featureAllowed } from "../../../lib/feature-permissions-registry";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { normalizeAccountPayload, updateAccountDirect } from "../../../lib/account-direct";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function accountGate() {
  return await getDirectAccountGate([]);
}

export async function GET() {
  const gate = await accountGate();
  if (!gate.ok || !gate.account) {
    return json({ error: gate.error || "Authentication required." }, gate.status || 503);
  }
  if (!featureAllowed(gate.account, "account.view")) return json({ error: "Permission account.view is not allowed." }, 403);
  return json(normalizeAccountPayload(gate.account));
}

export async function PATCH(request) {
  const gate = await accountGate();
  if (!gate.ok || !gate.account) {
    return json({ success: false, error: gate.error || "Authentication required." }, gate.status || 503);
  }

  try {
    const body = await request.json().catch(() => ({}));
    // Reject mixed password/profile payloads unless *both* grants allow it.
    const isPasswordUpdate = Object.hasOwn(body || {}, "password");
    const isProfileUpdate = ["name", "phone", "email", "department", "position", "employeeCode"]
      .some((field) => Object.hasOwn(body || {}, field));
    if (!featureAllowed(gate.account, "account.view")
        || (isPasswordUpdate && !featureAllowed(gate.account, "account.password"))
        || (isProfileUpdate && !featureAllowed(gate.account, "account.edit"))) {
      return json({ success: false, error: "You do not have permission to update these account fields." }, 403);
    }
    const result = await updateAccountDirect(gate.account, body);
    return json(result);
  } catch (error) {
    console.error("PATCH /next/api/account error:", error?.details || error);
    return json(
      { success: false, error: error?.message || "Failed to update account." },
      Number(error?.status) || 500,
    );
  }
}

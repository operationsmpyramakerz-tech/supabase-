import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { directPageAccessLevel } from "../../../../lib/order-action-auth";
import { recordHistoryForAccount } from "../../../../lib/history-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Explicit, admin-only probe: writes an actual audit row, so schema or DB
 * privilege problems are visible instead of silently swallowing the error.
 * This does NOT turn on audit collection for other ERP modules.
 */
export async function POST() {
  const gate = await getDirectAccountGate(["History"]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, gate.status || 503);
  const view = featureGate(gate, "history.view");
  if (!view.ok) return json({ ok: false, error: view.error }, view.status);
  const permission = featureGate(gate, "history.clear");
  if (!permission.ok || directPageAccessLevel(gate.account || {}, ["History"]) !== "admin") {
    return json({ ok: false, error: "History administrator access is required to test audit writes." }, 403);
  }

  try {
    const record = await recordHistoryForAccount({
      account: gate.account,
      memberId: gate.memberId,
      pageName: "History",
      pageKey: "history",
      actionLabel: "Verified history audit write",
      actionKey: "history.diagnostic.verified",
      entityType: "audit_test",
      entityLabel: "History write diagnostic",
      method: "POST",
      path: "/next/api/history/diagnostics",
      statusCode: 200,
    });
    if (!record || !record.id) {
      throw new Error("Supabase returned no persisted row ID; audit write could not be verified.");
    }
    return json({ ok: true, rowId: String(record.id), createdAt: record.created_at || null });
  } catch (error) {
    // Do not disclose connection details in logs or to unauthorized users.
    console.error("HISTORY_AUDIT_DIAGNOSTIC_FAILED", error?.code || "WRITE_FAILED", error?.message || "Unknown error");
    return json({
      ok: false,
      error: String(error?.message || "The database rejected the history audit test.").slice(0, 260),
      code: String(error?.code || "AUDIT_WRITE_FAILED").slice(0, 64),
    }, 503);
  }
}

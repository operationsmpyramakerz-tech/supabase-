import { NextResponse } from "next/server";
import { historyList } from "../../../lib/history-data";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { featureGate } from "../../../lib/feature-permissions-server";
import { directPageAccessLevel, verifyPageAdminPasswordDirect } from "../../../lib/order-action-auth";
import { supabaseRequest, updateById } from "../../../lib/supabase-rest";
import { recordHistoryForAccount } from "../../../lib/history-audit";

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
  const gate = await getDirectAccountGate(["History"]);
  if (!gate.ok) return response({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  const permitted = featureGate(gate, "history.view");
  if (!permitted.ok) return response({ ok: false, error: permitted.error }, { status: permitted.status });

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") || "250";
  const offset = url.searchParams.get("offset") || "0";
  const fresh = url.searchParams.get("_fresh") === "1";

  try {
    const payload = await historyList({ limit, offset, fresh });
    if (payload) return response(payload);
    return response({ ok: false, rows: [], error: "History data is not available." }, { status: 503 });
  } catch (error) {
    return response({ ok: false, rows: [], error: error?.message || "Failed to load system history." }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(request) {
  const gate = await getDirectAccountGate(["History"]);
  if (!gate.ok) return response({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  const permitted = featureGate(gate, "history.clear");
  if (!permitted.ok) return response({ ok: false, error: permitted.error }, { status: permitted.status });

  try {
    const body = await request.json().catch(() => ({}));
    const adminPassword = String(body?.adminPassword || body?.password || "").trim();
    if (!adminPassword) return response({ ok: false, error: "Admin password is required." }, { status: 400 });
    const level = directPageAccessLevel(gate.account || {}, ["History"]);
    if (level !== "admin") {
      const verified = await verifyPageAdminPasswordDirect(gate.account || {}, adminPassword, ["History"]);
      if (verified === null) return response({ ok: false, error: "The direct Admin password context is unavailable." }, { status: 503 });
      if (!verified) return response({ ok: false, error: "Invalid admin password." }, { status: 401 });
    }
    // Never silently erase the last proof that an administrator cleared the audit log.
    // First persist the deletion audit marker; refuse to clear if that write fails.
    // The marker is excluded from the DELETE, so the audit trail cannot become empty.
    const marker = await recordHistoryForAccount({
      account: gate.account,
      memberId: gate.memberId,
      pageName: "History",
      pageKey: "history",
      actionLabel: "Started history clear",
      actionKey: "history.clear_started",
      entityType: "history",
      entityLabel: "History log clear",
      method: "DELETE",
      path: "/next/api/history",
      statusCode: 200,
    });
    const protectedId = String(marker?.id ?? "").trim();
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(protectedId)) {
      throw new Error("History clear was stopped because the audit marker ID could not be verified.");
    }
    const table = String(process.env.SUPABASE_HISTORY_TABLE || "operation_history").trim() || "operation_history";
    await supabaseRequest(`/${encodeURIComponent(table)}?id=neq.${encodeURIComponent(protectedId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    // Finalize the retained marker only after Supabase confirms the deletion.
    // If finalization is denied, keep the truthful "Started" event and report
    // the successful deletion rather than suggesting the clear can be retried.
    let auditFinalized = true;
    try {
      const updated = await updateById(table, protectedId, {
        action_label: "Cleared history records",
        action_key: "history.cleared",
        status_code: 200,
      });
      if (!updated?.id) throw new Error("Supabase did not confirm audit-marker finalization.");
    } catch (finalizeError) {
      auditFinalized = false;
      console.error("HISTORY_CLEAR_AUDIT_FINALIZE_FAILED", finalizeError?.code || "UPDATE_FAILED", finalizeError?.message || "Audit marker could not be finalized");
    }
    return response({ ok: true, source: "supabase-next", retainedAuditId: protectedId, auditFinalized });
  } catch (error) {
    return response({ ok: false, error: error?.message || "Failed to clear history." }, { status: Number(error?.status) || 500 });
  }
}

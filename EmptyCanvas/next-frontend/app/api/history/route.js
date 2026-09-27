import { NextResponse } from "next/server";
import { historyList } from "../../../lib/history-data";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { directPageAccessLevel, verifyPageAdminPasswordDirect } from "../../../lib/order-action-auth";
import { supabaseRequest } from "../../../lib/supabase-rest";

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

  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") || "1000";
  const fresh = url.searchParams.get("_fresh") === "1";

  try {
    const payload = await historyList({ limit, fresh });
    if (payload) return response(payload);
    return response({ ok: false, rows: [], error: "History data is not available." }, { status: 503 });
  } catch (error) {
    return response({ ok: false, rows: [], error: error?.message || "Failed to load system history." }, { status: Number(error?.status) || 500 });
  }
}

export async function DELETE(request) {
  const gate = await getDirectAccountGate(["History"]);
  if (!gate.ok) return response({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

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
    const table = String(process.env.SUPABASE_HISTORY_TABLE || "operation_history").trim() || "operation_history";
    await supabaseRequest(`/${encodeURIComponent(table)}?id=not.is.null`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    return response({ ok: true, source: "supabase-next" });
  } catch (error) {
    return response({ ok: false, error: error?.message || "Failed to clear history." }, { status: Number(error?.status) || 500 });
  }
}

import "server-only";
import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "./products-auth";
import {
  areSupabaseCurrentOrderIds,
  archiveCurrentOrders,
  deleteCurrentOrders,
  legacyCurrentOrdersActionFallback,
  normalizeCurrentOrderIds,
  unarchiveCurrentOrders,
  verifyCurrentOrdersActionPassword,
  warmLegacyCurrentOrdersCache,
} from "./orders-actions";

function json(body, status = 200, source = "") {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  if (source) response.headers.set("X-ERP-Data-Source", source);
  return response;
}

const ACTIONS = {
  archive: archiveCurrentOrders,
  unarchive: unarchiveCurrentOrders,
  delete: deleteCurrentOrders,
};

export async function handleCurrentOrdersAction(request, action) {
  const actionKey = String(action || "").trim().toLowerCase();
  const directAction = ACTIONS[actionKey];
  if (!directAction) return json({ error: "Unsupported Current Orders action." }, 400);

  const gate = await getLegacyAccountGate(["Current Orders"]);
  if (!gate.ok) {
    return json({ error: gate.error || "Current Orders access is unavailable." }, gate.status || 503);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ids = normalizeCurrentOrderIds(body?.orderIds);
  if (!ids.length) return json({ error: "orderIds required" }, 400);

  try {
    await verifyCurrentOrdersActionPassword(gate.account, body?.adminPassword);

    // Keep a rollback path for any pre-migration Notion IDs that may still be
    // present in an older browser/session. Current Supabase orders use numeric IDs.
    if (!areSupabaseCurrentOrderIds(ids)) {
      const legacy = await legacyCurrentOrdersActionFallback(actionKey, {
        ...body,
        orderIds: ids,
      });
      return json(legacy, 200, legacy?.source || "legacy");
    }

    const result = await directAction(ids);
    // The Next page reads Supabase directly, so this is not required for the
    // migrated UI. It only refreshes the legacy cache as a best-effort rollback aid.
    warmLegacyCurrentOrdersCache().catch(() => {});
    return json(result, 200, "supabase");
  } catch (error) {
    const status = Number(error?.status) || 500;
    console.error(`POST /next/api/orders/current/${actionKey} error:`, error?.details || error);
    return json({ error: error?.message || `Failed to ${actionKey} order.` }, status);
  }
}

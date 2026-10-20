import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import {
  addStocktakingRow,
  authorizeStocktakingEdit,
  startStocktakingInventory,
  updateStocktakingInventoryValue,
  updateStocktakingRows,
} from "../../../../lib/stocktaking-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function text(value) {
  return String(value ?? "").trim();
}

function actionKey(value) {
  return text(value).toLowerCase().replace(/[_\s]+/g, "-");
}

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

export async function POST(request) {
  const gate = featureGate(await getDirectAccountGate(["Stocktaking"]), "stocktaking.view");
  if (!gate.ok) {
    return noStore({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["edit-access", "add-row", "update-rows", "inventory-start", "inventory-value"].includes(action)) {
    return noStore({ ok: false, error: "Unsupported Stocktaking action." }, { status: 400 });
  }

  const permissionByAction = {
    "edit-access": "stocktaking.authorize_column",
    "add-row": "stocktaking.add_row",
    "update-rows": "stocktaking.edit_rows",
    "inventory-start": "stocktaking.start_inventory",
    "inventory-value": "stocktaking.update_inventory",
  };
  const actionGate = featureGate(gate, permissionByAction[action]);
  if (!actionGate.ok) return noStore({ ok: false, error: actionGate.error || "Permission denied." }, { status: actionGate.status || 403 });
  if (["add-row", "update-rows"].includes(action)) {
    const columnGate = featureGate(gate, "stocktaking.authorize_column");
    if (!columnGate.ok) return noStore({ ok: false, error: columnGate.error || "Permission denied." }, { status: columnGate.status || 403 });
  }

  try {
    let result;
    let status = 200;
    if (action === "edit-access") {
      const auth = await authorizeStocktakingEdit(
        gate.account || {},
        body?.column || body?.stockColumn,
        body?.adminPassword || body?.password,
        { fresh: true },
      );
      result = { ok: true, source: "supabase-next", column: auth.quantityColumn, owner: auth.owner || null };
    } else if (action === "add-row") {
      result = await addStocktakingRow(gate.account || {}, body?.payload || body);
      status = 201;
    } else if (action === "update-rows") {
      result = await updateStocktakingRows(gate.account || {}, body?.payload || body);
    } else if (action === "inventory-start") {
      result = await startStocktakingInventory(gate.account || {}, body?.payload || body);
    } else {
      result = await updateStocktakingInventoryValue(gate.account || {}, body?.payload || body);
    }
    return noStore(result || { ok: true, source: "supabase-next" }, { status });
  } catch (error) {
    console.error(`[stocktaking] direct ${action} failed:`, error?.details || error?.message || error);
    return noStore(
      {
        ok: false,
        error: error?.message || "Stocktaking action failed.",
        ...(error?.requiresPassword === true ? { requiresPassword: true } : {}),
      },
      { status: Number(error?.status) || 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../../lib/products-auth";
import { performCurrentOrdersProtectedAction } from "../../../../../lib/current-orders-data";

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

function text(value) {
  return String(value ?? "").trim();
}

function actionKey(value) {
  return text(value).toLowerCase().replace(/[_\s]+/g, "-");
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["archive", "unarchive", "delete"].includes(action)) {
    return noStore({ error: "Unsupported Current Orders action." }, { status: 400 });
  }

  const gate = await getDirectAccountGate(["Current Orders"]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  try {
    const result = await performCurrentOrdersProtectedAction({
      account: gate.account,
      action,
      orderIds: body?.orderIds,
      adminPassword: body?.adminPassword,
    });
    if (result) return noStore(result);
    return noStore(
      { error: "This Current Orders action is not available through the direct Supabase path." },
      { status: 503 },
    );
  } catch (error) {
    if (error?.code === "DIRECT_CURRENT_ORDERS_MUTATION_FAILED") {
      return noStore(
        { error: error?.message || "Current Orders action failed." },
        { status: Number(error?.status) || 500 },
      );
    }
    console.error(`[current-orders] direct ${action} failed:`, error?.message || error);
    return noStore(
      { error: error?.message || "Current Orders action failed." },
      { status: Number(error?.status) || 500 },
    );
  }
}

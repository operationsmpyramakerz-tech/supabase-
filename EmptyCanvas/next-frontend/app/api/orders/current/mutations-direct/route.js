import { NextResponse } from "next/server";
import { fetchLegacyJson } from "../../../../../lib/legacy-api";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
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

function directErrorResponse(error) {
  if (error?.code !== "DIRECT_CURRENT_ORDERS_MUTATION_FAILED") return null;
  return noStore(
    { error: error?.message || "Current Orders action failed." },
    { status: Number(error?.status) || 500 },
  );
}

async function legacyFallback(action, body) {
  const routes = {
    archive: "/api/orders/current/archive",
    unarchive: "/api/orders/current/unarchive",
    delete: "/api/orders/current/delete",
  };
  const path = routes[action];
  if (!path) return noStore({ error: "Unsupported Current Orders action." }, { status: 400 });

  const legacy = await fetchLegacyJson(path, {
    method: "POST",
    body: {
      orderIds: body?.orderIds,
      adminPassword: body?.adminPassword,
    },
    timeoutMs: 25_000,
  });
  if (legacy.ok && legacy.data) return noStore(legacy.data, { status: legacy.status || 200 });
  return noStore(
    { error: legacy.error || legacy.data?.error || "Current Orders action failed." },
    { status: legacy.status || 502 },
  );
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = actionKey(body?.action);
  if (!["archive", "unarchive", "delete"].includes(action)) {
    return noStore({ error: "Unsupported Current Orders action." }, { status: 400 });
  }

  const gate = await getLegacyAccountGate(["Current Orders"]);
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
  } catch (error) {
    const response = directErrorResponse(error);
    if (response) return response;
    console.warn(`[current-orders] direct ${action} failed; using Legacy fallback:`, error?.message || error);
  }

  return await legacyFallback(action, body);
}

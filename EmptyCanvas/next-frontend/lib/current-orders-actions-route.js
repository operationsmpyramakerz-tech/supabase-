import "server-only";
import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "./products-auth";
import { executeCurrentOrderAction } from "./orders-actions";

function json(body, status = 200, source = "") {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  if (source) response.headers.set("X-ERP-Data-Source", source);
  return response;
}

export async function handleCurrentOrderAction(request, action) {
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

  try {
    const result = await executeCurrentOrderAction(action, {
      orderIds: body?.orderIds,
      adminPassword: body?.adminPassword,
      account: gate.account,
    });
    return json(result, 200, "supabase");
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
      console.error(`POST /next/api/orders/current/${action} error:`, error?.details || error?.message || error);
    }
    return json(
      { error: error?.message || `Failed to ${action} order.` },
      status,
    );
  }
}

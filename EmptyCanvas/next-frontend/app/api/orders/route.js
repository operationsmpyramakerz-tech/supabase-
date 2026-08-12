import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { currentOrdersForAccount } from "../../../lib/orders-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body, status = 200, source = "") {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  if (source) response.headers.set("X-ERP-Data-Source", source);
  return response;
}

export async function GET() {
  const gate = await getLegacyAccountGate(["Current Orders"]);

  if (!gate.ok) {
    return json({ error: gate.error || "Current Orders access is unavailable." }, gate.status || 503);
  }

  try {
    const orders = await currentOrdersForAccount(gate.account);
    return json(orders, 200, "supabase");
  } catch (error) {
    console.error("GET /next/api/orders error:", error?.details || error);
    return json(
      { error: error?.message || "Failed to load Current Orders from Supabase." },
      Number(error?.status) || 500,
    );
  }
}

import "server-only";
import { NextResponse } from "next/server";
import { getDirectAccountGate } from "./products-auth";

export async function proposalGate() {
  return await getDirectAccountGate(["Proposals", "Products"]);
}

export async function kitGate() {
  return await getDirectAccountGate(["Kits", "Proposals", "Products"]);
}

// Read-only kit access is also required by Shopping Cart. A user should be able
// to browse and expand kits while creating an order even when the standalone
// Kits/Proposals/Products pages are not part of their sidebar permissions.
// Write operations continue to use kitGate() above.
export async function kitReadGate() {
  return await getDirectAccountGate(["Kits", "Proposals", "Products", "Create New Order", "Shopping Cart"]);
}

export function gateResponse(gate) {
  return NextResponse.json({ ok: false, error: gate?.error || "Access denied." }, { status: gate?.status || 503 });
}

export function errorResponse(error, fallback) {
  console.error("[next proposal-kit]", error?.details || error);
  return NextResponse.json(
    { ok: false, error: error?.message || fallback },
    { status: Number(error?.status) || 500 },
  );
}

export async function requestBody(request) {
  return await request.json().catch(() => ({}));
}

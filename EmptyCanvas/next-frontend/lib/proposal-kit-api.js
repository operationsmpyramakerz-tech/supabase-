import "server-only";
import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "./products-auth";

export async function proposalGate() {
  return await getLegacyAccountGate(["Proposals", "Products"]);
}

export async function kitGate() {
  return await getLegacyAccountGate(["Kits", "Proposals", "Products"]);
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

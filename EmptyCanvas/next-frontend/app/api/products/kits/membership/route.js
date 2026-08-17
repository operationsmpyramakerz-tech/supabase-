import { NextResponse } from "next/server";
import { listKitMembership } from "../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, kitGate } from "../../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await kitGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    return NextResponse.json(
      { ok: true, source: "supabase-next", membership: await listKitMembership() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Failed to load kit membership.");
  }
}

import { NextResponse } from "next/server";
import { removeProposalSourceKit } from "../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const gate = await proposalGate("item_delete");
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await requestBody(request);
    const result = await removeProposalSourceKit(body, gate.account);
    return NextResponse.json({ ok: true, source: "supabase-next", ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Failed to remove the source kit.");
  }
}

import { NextResponse } from "next/server";
import { saveCombinedProposal } from "../../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const gate = await proposalGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    const result = await saveCombinedProposal(await requestBody(request), gate.account);
    return NextResponse.json({ ok: true, source: "supabase-next", ...result }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to save combined proposal.");
  }
}

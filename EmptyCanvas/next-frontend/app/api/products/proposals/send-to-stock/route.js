import { NextResponse } from "next/server";
import { sendProposalToStock } from "../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const gate = await proposalGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "Proposal id is required." }, { status: 400 });
    }
    const result = await sendProposalToStock(id, await requestBody(request), gate.account);
    return NextResponse.json({ ok: true, source: "supabase-next", ...result }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to send proposal to Stocktaking.");
  }
}

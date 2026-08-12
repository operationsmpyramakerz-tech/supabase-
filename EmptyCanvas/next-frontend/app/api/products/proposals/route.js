import { NextResponse } from "next/server";
import { createProposal, listProposals } from "../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await proposalGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    return NextResponse.json({ ok: true, source: "supabase-next", proposals: await listProposals(gate.account) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error, "Failed to load proposals."); }
}

export async function POST(request) {
  const gate = await proposalGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await requestBody(request);
    const proposal = await createProposal(body?.name, gate.account);
    return NextResponse.json({ ok: true, source: "supabase-next", proposal }, { status: 201 });
  } catch (error) { return errorResponse(error, "Failed to create proposal."); }
}

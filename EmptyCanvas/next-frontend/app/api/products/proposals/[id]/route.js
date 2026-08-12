import { NextResponse } from "next/server";
import { deleteProposal, getProposal, updateProposal } from "../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const gate = await proposalGate(); if (!gate.ok) return gateResponse(gate);
  try { const { id } = await params; return NextResponse.json({ ok: true, source: "supabase-next", ...(await getProposal(id, gate.account)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error, "Failed to load proposal."); }
}
export async function PATCH(request, { params }) {
  const gate = await proposalGate(); if (!gate.ok) return gateResponse(gate);
  try { const { id } = await params; const proposal = await updateProposal(id, await requestBody(request), gate.account); return NextResponse.json({ ok: true, source: "supabase-next", proposal }); }
  catch (error) { return errorResponse(error, "Failed to update proposal."); }
}
export async function DELETE(request, { params }) {
  const gate = await proposalGate(); if (!gate.ok) return gateResponse(gate);
  try { const { id } = await params; await deleteProposal(id, await requestBody(request), gate.account); return NextResponse.json({ ok: true, source: "supabase-next", deletedId: String(id || "") }); }
  catch (error) { return errorResponse(error, "Failed to delete proposal."); }
}

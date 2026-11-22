import { NextResponse } from "next/server";
import { updateProposalFolder, deleteProposalFolder } from "../../../../../lib/proposal-kit-service";
import { proposalGate, errorResponse, gateResponse, requestBody } from "../../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const gate = await proposalGate("edit");
  if (!gate.ok) return gateResponse(gate);
  try {
    const { id } = await params;
    return NextResponse.json({
      ok: true,
      folder: await updateProposalFolder(id, await requestBody(request), gate.account),
    });
  } catch (error) { return errorResponse(error, "Unable to rename proposal folder."); }
}

export async function DELETE(request, { params }) {
  const gate = await proposalGate("edit");
  if (!gate.ok) return gateResponse(gate);
  try {
    const { id } = await params;
    await deleteProposalFolder(id, await requestBody(request), gate.account);
    return NextResponse.json({ ok: true, deletedId: String(id) });
  } catch (error) { return errorResponse(error, "Unable to delete proposal folder."); }
}

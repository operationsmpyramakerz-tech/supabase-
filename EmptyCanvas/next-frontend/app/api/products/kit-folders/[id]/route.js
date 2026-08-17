import { NextResponse } from "next/server";
import { deleteKitFolder, updateKitFolder } from "../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, kitGate, requestBody } from "../../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const gate = await kitGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    const { id } = await params;
    const folder = await updateKitFolder(id, await requestBody(request), gate.account);
    return NextResponse.json({ ok: true, source: "supabase-next", folder });
  } catch (error) {
    return errorResponse(error, "Failed to update kit folder.");
  }
}

export async function DELETE(request, { params }) {
  const gate = await kitGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    const { id } = await params;
    await deleteKitFolder(id, await requestBody(request), gate.account);
    return NextResponse.json({ ok: true, source: "supabase-next", deletedId: String(id || "") });
  } catch (error) {
    return errorResponse(error, "Failed to delete kit folder.");
  }
}

import { NextResponse } from "next/server";
import { listProposalFolders, createProposalFolder } from "../../../../lib/proposal-kit-service";
import { proposalGate, errorResponse, gateResponse, requestBody } from "../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gate = await proposalGate("view");
  if (!gate.ok) return gateResponse(gate);
  try {
    const fresh = new URL(request.url).searchParams.get("_fresh") === "1";
    return NextResponse.json(
      { ok: true, folders: await listProposalFolders(gate.account, { fresh }) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) { return errorResponse(error, "Unable to list proposal folders."); }
}

export async function POST(request) {
  const gate = await proposalGate("create");
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await requestBody(request);
    const folder = await createProposalFolder(body?.name, gate.account, body?.parentFolderId);
    return NextResponse.json({ ok: true, folder }, { status: 201 });
  } catch (error) { return errorResponse(error, "Unable to create proposal folder."); }
}

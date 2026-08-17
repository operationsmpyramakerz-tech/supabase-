import { NextResponse } from "next/server";
import { createKitFolder, listKitFolders } from "../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, kitGate, requestBody } from "../../../../lib/proposal-kit-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await kitGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    return NextResponse.json(
      { ok: true, source: "supabase-next", folders: await listKitFolders(gate.account) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Failed to load kit folders.");
  }
}

export async function POST(request) {
  const gate = await kitGate();
  if (!gate.ok) return gateResponse(gate);
  try {
    const body = await requestBody(request);
    return NextResponse.json(
      { ok: true, source: "supabase-next", folder: await createKitFolder(body?.name, gate.account) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "Failed to create kit folder.");
  }
}

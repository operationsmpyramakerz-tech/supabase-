import { NextResponse } from "next/server";
import { verifyPageAdminPasswordDirect } from "../../../../../lib/order-action-auth";
import { getProposal } from "../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../../lib/proposal-kit-api";
import { createOrderFromProposalDirect } from "../../../../../lib/shopping-cart-order-service";

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
    const body = await requestBody(request);
    const password = String(body?.adminPassword || body?.password || "").trim();
    if (!password) return NextResponse.json({ ok: false, error: "Admin password is required." }, { status: 400 });
    const verified = await verifyPageAdminPasswordDirect(gate.account || {}, password, ["Proposals", "Kits", "Products"]);
    if (verified === null) return NextResponse.json({ ok: false, error: "The direct Admin password context is unavailable." }, { status: 503 });
    if (!verified) return NextResponse.json({ ok: false, error: "Invalid Admin password." }, { status: 401 });

    const detail = await getProposal(id, gate.account);
    const result = await createOrderFromProposalDirect({
      account: gate.account,
      proposal: detail?.proposal || {},
      items: detail?.items || [],
      teamMemberId: body?.teamMemberId || body?.team_member_id,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to create order from proposal.");
  }
}

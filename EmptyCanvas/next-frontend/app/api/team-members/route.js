import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../lib/products-auth";
import { listTeamMembersLite } from "../../../lib/team-members-service";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const gate = await getLegacyAccountGate(["Proposals", "Kits", "Products"]);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, members: [], error: gate.error || "Access is not available." },
      { status: gate.status || 503 },
    );
  }

  try {
    const url = new URL(request.url);
    const fresh = url.searchParams.get("_fresh") === "1";
    const members = await listTeamMembersLite({ fresh });
    return NextResponse.json({ ok: true, source: "supabase-next", members });
  } catch (error) {
    return NextResponse.json(
      { ok: false, members: [], error: error?.message || "Team members could not be loaded." },
      { status: error?.status || 500 },
    );
  }
}

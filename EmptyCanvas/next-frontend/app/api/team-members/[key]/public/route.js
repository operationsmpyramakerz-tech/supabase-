import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../../lib/products-auth";
import { getTeamMemberPublicProfile } from "../../../../../lib/team-members-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

export async function GET(request, context) {
  const gate = await getLegacyAccountGate([]);
  if (!gate.ok) {
    return noStore({ error: gate.error || "Authentication required." }, { status: gate.status || 503 });
  }

  const params = await Promise.resolve(context?.params);
  const key = String(params?.key || "").trim();
  if (!key) return noStore({ error: "Team member ID is required." }, { status: 400 });

  const fresh = new URL(request.url).searchParams.has("_ts");
  try {
    const profile = await getTeamMemberPublicProfile(key, { fresh });
    return noStore(profile);
  } catch (error) {
    return noStore(
      { error: error?.message || "Failed to load team member profile." },
      { status: Number(error?.status) || 500 },
    );
  }
}

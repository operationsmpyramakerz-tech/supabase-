import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { select, selectById } from "../../../../lib/supabase-rest";
import { listTeamMembersLite } from "../../../../lib/team-members-service";
import { safeMemberId } from "../../../../lib/team-scope-management.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];
const respond = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request) {
  const gate = featureGate(featureGate(await getDirectAccountGate(PAGES), "users.view"), "users.feature_access_manage");
  if (!gate.ok) return respond({ ok: false, error: gate.error || "Access denied." }, gate.status || 403);
  const id = safeMemberId(new URL(request.url).searchParams.get("id"));
  if (!id) return respond({ ok: false, error: "Invalid team member ID." }, 400);
  try {
    const manager = await selectById(String(process.env.SUPABASE_TEAM_MEMBERS_TABLE || "team_members"), id, { select: "id" });
    if (!manager) return respond({ ok: false, error: "Team member not found." }, 404);
    // Failure to read links must not be interpreted as an empty team.
    const [members, links] = await Promise.all([
      listTeamMembersLite({ fresh: true }),
      select("erp_member_scope_team_links", { select: "visible_member_id", manager_member_id: `eq.${id}`, limit: "501" }),
    ]);
    if (!Array.isArray(links) || links.length > 500 || members.length >= 5000) return respond({ ok: false, error: "Team directory is too large to edit safely." }, 409);
    const visibleIds = links.map(row => String(row?.visible_member_id || "").trim()).filter(Boolean);
    const directoryIds = new Set(members.map(member => member.id));
    // Unknown historical links must never silently disappear when the list is saved.
    if (visibleIds.some(linkId => !directoryIds.has(linkId))) return respond({ ok: false, error: "Existing team links reference missing members. Repair them in Supabase before editing." }, 409);
    return respond({ ok: true, managerId: id, members: members.filter(row => row.id !== id).map(row => ({ id: row.id, name: row.name, department: row.department, position: row.position })), visibleIds, limit: 500 });
  } catch (error) {
    console.error("GET /next/api/users-center/team-scope failed:", error?.details || error);
    return respond({ ok: false, error: error?.message || "Could not load team scope." }, Number(error?.status) || 503);
  }
}

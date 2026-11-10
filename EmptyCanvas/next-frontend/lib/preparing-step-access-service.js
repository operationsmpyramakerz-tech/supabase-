import "server-only";
import { select, selectAll } from "./supabase-rest";
import { getFeaturePermissionSetupStatus } from "./feature-permissions-server";
import { listTeamMembersLite, getTeamMemberPublicProfile } from "./team-members-service";
import { membersWithPreparingStageAccess } from "./preparing-step-access.mjs";

// Supabase's per-request row cap can be smaller than the requested `limit`.
// Paginate permission tables so a partial first response never hides editors.
async function readRows(table, selectExpr, order, filter = {}) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const batch = await select(table, {
      select: selectExpr, order, limit: pageSize, offset, ...filter,
    }, { profileName: `preparing.step-users.${table}` });
    if (!Array.isArray(batch)) throw new Error(`Unexpected ${table} response.`);
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error(`Cannot safely enumerate all ${table} rows.`);
}

export async function listPreparingStepAccessUsers() {
  // Never use the `members` array returned by preparingCatalog(): those rows
  // represent school beneficiaries, not permission holders for a stage.
  const advanced = getFeaturePermissionSetupStatus().available;
  const [members, pages, pageAccess, legacyPages, profiles, grants] = await Promise.all([
    listTeamMembersLite(),
    selectAll("app_pages", { select: "id,page_key,page_name,route_path", limit: 1000, profileName: "preparing.step-users.pages" }),
    readRows("team_member_page_access", "team_member_id,page_id,is_enabled", "team_member_id.asc,page_id.asc"),
    readRows(process.env.SUPABASE_TEAM_MEMBERS_TABLE || "team_members", "id,allowed_pages", "id.asc").catch(() => []),
    advanced ? readRows("erp_member_feature_profiles", "team_member_id,enabled", "team_member_id.asc") : [],
    advanced ? readRows("erp_member_feature_grants", "team_member_id,permission_key,is_allowed,data_scope", "team_member_id.asc,permission_key.asc", {
      permission_key: "in.(preparing.view,preparing.manage,preparing.stage_update,preparing.warehouse_receive,preparing.stages.__granular,preparing.stage.intake,preparing.stage.testing,preparing.stage.warehouse,preparing.stage.production,preparing.stage.boxes,preparing.stage.cartons)",
    }) : [],
  ]);
  const trustedAdminIds = String(process.env.ERP_TRUSTED_ADMIN_MEMBER_IDS || "").split(",").map(v => v.trim()).filter(Boolean);
  const lists = membersWithPreparingStageAccess({
    members, pages, pageAccess, legacyPages, profiles, grants,
    trustedAdminIds: [ ...trustedAdminIds, ...members.filter(member => String(member.name).trim().toLowerCase() === "admin").map(member => member.id) ],
  });
  // Fetch images for just the visible members, not all team photos or private
  // Users Center fields. The endpoint returns names and verified public photos.
  const shown = [...new Set(Object.values(lists).flatMap(list => list.slice(0, 3).map(user => user.id)))];
  const photos = new Map(await Promise.all(shown.map(async id => {
    const profile = await getTeamMemberPublicProfile(id).catch(() => null);
    const url = String(profile?.photoUrl || "").trim();
    return [id, /^https?:\/\//i.test(url) ? url : ""];
  })));
  return Object.fromEntries(Object.entries(lists).map(([key, list]) => [key,
    { count: list.length, users: list.slice(0, 3).map(user => ({...user, photoUrl: photos.get(user.id) || ""})) },
  ]));
}

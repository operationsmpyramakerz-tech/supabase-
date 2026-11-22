import { NextResponse } from "next/server";
import { isReservedAdminName } from "../../../../lib/admin-identity-policy.mjs";
import { featureAllowed } from "../../../../lib/feature-permissions-registry";
import { directPageAccessLevel } from "../../../../lib/order-action-auth";

import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate, replaceMemberFeatureAccess, getMemberFeatureAccessForAdmin } from "../../../../lib/feature-permissions-server";
import { ACTIVE_PILOT_FEATURE_KEYS, isKnownFeature } from "../../../../lib/feature-permissions-registry";
import { rpc, select, selectById } from "../../../../lib/supabase-rest";
import { normalizeTeamLinks } from "../../../../lib/team-scope-management.mjs";
import { replaceMemberStocktakingFolderKeys } from "../../../../lib/stocktaking-folder-access";
import { listStocktakingFolders } from "../../../../lib/stocktaking-data";
import { verifyUsersCenterAuthorizationToken } from "../../../../lib/users-center-action-auth";
import {
  approveSignupRequest,
  createDepartment,
  createMember,
  createStocktakingSchoolColumn,
  deleteDepartment,
  deleteMember,
  moveMember,
  rejectSignupRequest,
  renameDepartment,
  savePageAccess,
  saveSvAccess,
  updateMember,
  setMemberArchived,
  inviteMemberByEmail,
  bulkUpdatePageAccess,
} from "../../../../lib/users-center-mutations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

function text(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) { return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request) {
  const gate = featureGate(await getDirectAccountGate(ACCESS_PAGES), "users.view");
  if (!gate.ok) return json({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    verifyUsersCenterAuthorizationToken(body?.authorizationToken, gate.account || {});
    const action = text(body?.action).toLowerCase();
    const reviewedBy = text(gate.account?.username || gate.account?.name) || "Admin";
    const actionPermissions = {
      "department-create": "users.department_create",
      "department-update": "users.department_edit",
      "department-delete": "users.department_delete",
      "member-move": "users.member_move",
      "member-create": "users.member_create",
      "member-update": "users.member_edit",
      "member-delete": "users.member_delete",
      "member-archive": "users.member_edit",
      "member-invite": "users.member_edit",
      "page-access-bulk": "users.page_access_manage",
      "feature-access-bulk": "users.feature_access_manage",
      "page-access-save": "users.page_access_manage",
      "feature-access-save": "users.feature_access_manage",
      "team-scope-save": "users.feature_access_manage",
      "stocktaking-folders-save": "users.feature_access_manage",
      "sv-access-save": "users.sv_access_manage",
      "signup-approve": "users.signup_approve",
      "signup-reject": "users.signup_reject",
      "stocktaking-column-create": "users.stock_column_create",
    };
    if (actionPermissions[action]) {
      const actionGate = featureGate(gate, actionPermissions[action]);
      if (!actionGate.ok) return json({ ok: false, error: actionGate.error }, actionGate.status || 403);
    }

    if (action === "stocktaking-folders-save") {
      const memberId = text(body?.memberId);
      if (!memberId) return json({ ok: false, error: "Missing member ID." }, 400);
      const member = await selectById(text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members", memberId, { select: "id" });
      if (!member) return json({ ok: false, error: "Team member was not found." }, 404);
      const selected = body?.folderKeys;
      const expected = body?.expectedFolderKeys;
      if (!Array.isArray(selected) || !Array.isArray(expected) ||
          selected.length > 500 || expected.length > 500 ||
          [...selected, ...expected].some(key => typeof key !== "string" || !key.trim() || key.length > 255))
        return json({ ok: false, error: "Invalid Stocktaking folder selection." }, 400);
      const all = await listStocktakingFolders({ fresh: true });
      const valid = new Set(all.map(folder => folder.key));
      if (selected.some(key => !valid.has(key)))
        return json({ ok: false, error: "One of the selected stock folders no longer exists." }, 409);
      const saved = await replaceMemberStocktakingFolderKeys(memberId, selected, expected);
      return json({ ok: true, selectedKeys: saved, message: "Stocktaking folder access updated." });
    }

    if (action === "team-scope-save") {
      const targetId = text(body?.memberId);
      // Ensure the target is still present. The RPC checks every selected
      // member atomically and rejects stale or unauthorized identifiers.
      const selectedIds = normalizeTeamLinks(targetId, body?.visibleMemberIds);
      const expectedIds = normalizeTeamLinks(targetId, body?.expectedVisibleIds);
      const target = await selectById(text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members", targetId, { select: "id" });
      if (!target) return json({ ok: false, error: "Team member was not found." }, 404);
      const result = await rpc("erp_replace_member_scope_team_links", {
        p_manager_member_id: targetId,
        p_visible_member_ids: selectedIds,
        p_expected_visible_member_ids: expectedIds,
      }, { profileName: "users-center.team-scope-save" });
      return json({ ok: true, visibleIds: Array.isArray(result) ? result : selectedIds, message: "Team visibility updated." });
    }

    if (action === "feature-access-save") {
      const targetId = text(body?.memberId);
      if (!targetId) return json({ ok: false, error: "Missing member ID." }, 400);
      const target = await selectById(text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members", targetId);
      if (!target) return json({ ok: false, error: "Team member was not found." }, 404);
      const result = await replaceMemberFeatureAccess(targetId, body?.grants, { enabled: body?.enabled === true });
      return json({ ok: true, ...result, source: "supabase-next" });
    }

    if (action === "department-create") {
      const department = await createDepartment(body?.name);
      return json({ ok: true, department, departmentId: department.id, message: `${department.name} created.`, source: "supabase-next" });
    }
    if (action === "department-update") {
      const department = await renameDepartment(body?.departmentId, body?.name);
      return json({ ok: true, department, departmentId: department.id, message: `${department.name} updated.`, source: "supabase-next" });
    }
    if (action === "department-delete") {
      const result = await deleteDepartment(body?.departmentId);
      return json({ ok: true, result, message: "Department deleted.", source: "supabase-next" });
    }
    if (action === "member-move") {
      const result = await moveMember(body?.memberId, body?.departmentId || body?.department);
      return json({ ok: true, member: result.member, message: `${result.member?.name || "Team member"} moved to ${result.departmentName}.`, source: "supabase-next" });
    }
    // Built-in Admin identity is privileged on legacy routes. Granting the
    // reserved name must require explicit access-management authority; ordinary
    // member Create/Edit permissions alone do not suffice.
    const reservedAdminRequested = ["member-create", "member-update"].includes(action)
      ? Object.entries(body?.fields && typeof body.fields === "object" ? body.fields : {})
          .some(([key, value]) => ["name", "fullname", "username"].includes(String(key).replace(/[^a-z0-9]/gi, "").toLowerCase()) && isReservedAdminName(value))
      : false;
    if (reservedAdminRequested) {
      const accessManager = directPageAccessLevel(gate.account, ["Users Center"]) === "admin"
        || featureAllowed(gate.account, "users.feature_access_manage", { legacyAllowed: false });
      if (!accessManager) return json({ ok: false, error: "Only access administrators may assign the reserved Admin identity." }, 403);
    }

    if (action === "member-create") {
      // Creating an account must never implicitly grant Page Access or
      // Orders Supervision privileges the creator does not possess.
      if ((body?.pageAccess != null && !Array.isArray(body.pageAccess)) || (body?.svAccess != null && !Array.isArray(body.svAccess)))
        return json({ ok: false, error: "Invalid member access settings." }, 400);
      const requestedPages = Array.isArray(body?.pageAccess) ? body.pageAccess : [];
      const requestedSupervision = Array.isArray(body?.svAccess) ? body.svAccess : [];
      if (requestedPages.length) {
        const pageGate = featureGate(gate, "users.page_access_manage");
        if (!pageGate.ok) return json({ ok: false, error: pageGate.error }, pageGate.status || 403);
      }
      if (requestedSupervision.length) {
        const svGate = featureGate(gate, "users.sv_access_manage");
        if (!svGate.ok) return json({ ok: false, error: svGate.error }, svGate.status || 403);
      }
      const member = await createMember({ fields: body?.fields || {}, pageAccess: requestedPages, svAccess: requestedSupervision, grantedBy: reviewedBy });
      return json({ ok: true, member, source: "supabase-next" });
    }
    if (action === "member-update") {
      const member = await updateMember(body?.memberId, body?.fields || {});
      return json({ ok: true, member, source: "supabase-next" });
    }
    if (action === "member-invite") {
      const result = await inviteMemberByEmail(body?.memberId);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "member-archive") {
      const memberId = text(body?.memberId);
      if (!memberId || typeof body?.archived !== "boolean") return json({ ok: false, error: "Invalid account status request." }, 400);
      if (body.archived && memberId === text(gate.account?.teamMemberId || gate.account?.userSupabaseId || gate.account?.id))
        return json({ ok: false, error: "You cannot archive your own account." }, 403);
      const result = await setMemberArchived(memberId, body.archived);
      return json({ ok: true, result, message: result.archived ? "User archived." : "User restored.", source: "supabase-next" });
    }
    if (action === "page-access-bulk") {
      const result = await bulkUpdatePageAccess(body?.memberIds, body?.changes, { grantedBy: reviewedBy });
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "feature-access-bulk") {
      const memberIds = Array.isArray(body?.memberIds) ? body.memberIds.map(text) : [];
      const changes = Array.isArray(body?.changes) ? body.changes : [];
      if (!memberIds.length || memberIds.length > 100 || memberIds.some((id) => !id) || new Set(memberIds).size !== memberIds.length)
        return json({ ok: false, error: "Select 1–100 distinct accounts." }, 400);
      if (!changes.length || changes.length > 250 || changes.some((change) => !ACTIVE_PILOT_FEATURE_KEYS.includes(text(change?.key)) || typeof change?.allowed !== "boolean") || new Set(changes.map((change) => text(change.key))).size !== changes.length)
        return json({ ok: false, error: "Invalid advanced feature changes." }, 400);
      const successes = [], failures = [];
      for (const id of memberIds) {
        try {
          const target = await selectById(text(process.env.SUPABASE_TEAM_MEMBERS_TABLE) || "team_members", id, { select: "id" });
          if (!target) throw new Error("User no longer exists.");
          const profile = await getMemberFeatureAccessForAdmin(id);
          if (!profile.available) throw new Error("Advanced Permissions are not configured on this server.");
          if (!profile.enabled) throw new Error("Advanced Permissions are disabled for this account. Enable them individually before using bulk feature changes.");
          // Avoid dropping legacy or future grant keys that the current editor cannot represent.
          const originalKeys = await select("erp_member_feature_grants", { select: "permission_key", team_member_id: `eq.${id}`, limit: "1000" });
          if ((originalKeys || []).some((entry) => !isKnownFeature(entry.permission_key))) throw new Error("This account has unrecognized legacy grants; review them individually before bulk editing.");
          const grants = new Map((profile.grants || []).map((entry) => [entry.key, entry]));
          for (const change of changes) {
            const key = text(change.key);
            const previous = grants.get(key);
            grants.set(key, { key, allowed: change.allowed, scope: previous?.scope || "all" });
          }
          await replaceMemberFeatureAccess(id, [...grants.values()], { enabled: true });
          successes.push(id);
        } catch (error) { failures.push({ id, error: text(error?.message || "Could not save feature access.") }); }
      }
      return json({ ok: true, successes, failures, changedFeatures: changes.length, source: "supabase-next" });
    }
    if (action === "member-delete") {
      const result = await deleteMember(body?.memberId);
      return json({ ok: true, result, message: `${result.name || "Team member"} deleted.`, source: "supabase-next" });
    }
    if (action === "page-access-save") {
      const result = await savePageAccess(body?.memberId, body?.pages || [], { grantedBy: reviewedBy });
      return json({ ...result, ok: true, source: "supabase-next" });
    }
    if (action === "sv-access-save") {
      const result = await saveSvAccess(body?.memberId, body?.members || []);
      return json({ ...result, ok: true, source: "supabase-next" });
    }
    if (action === "signup-approve") {
      const result = await approveSignupRequest(body?.requestId, { department: body?.department, position: body?.position, reviewedBy });
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "signup-reject") {
      const result = await rejectSignupRequest(body?.requestId, { reviewedBy });
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "stocktaking-column-create") {
      const created = await createStocktakingSchoolColumn(body?.name || body?.column);
      return json({ ok: true, ...created, source: "supabase-next" });
    }

    return json({ ok: false, error: "Unknown Users Center action." }, 400);
  } catch (error) {
    console.error("POST /next/api/users-center/mutations-direct error:", error?.details || error);
    return json({ ok: false, error: error?.message || "Users Center action failed." }, Number(error?.status) || 500);
  }
}

import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../../lib/products-auth";
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
} from "../../../../lib/users-center-mutations";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

function text(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) { return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request) {
  const gate = await getDirectAccountGate(ACCESS_PAGES);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    verifyUsersCenterAuthorizationToken(body?.authorizationToken, gate.account || {});
    const action = text(body?.action).toLowerCase();
    const reviewedBy = text(gate.account?.username || gate.account?.name) || "Admin";

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
    if (action === "member-create") {
      const member = await createMember({ fields: body?.fields || {}, pageAccess: body?.pageAccess || [], svAccess: body?.svAccess || [], grantedBy: reviewedBy });
      return json({ ok: true, member, source: "supabase-next" });
    }
    if (action === "member-update") {
      const member = await updateMember(body?.memberId, body?.fields || {});
      return json({ ok: true, member, source: "supabase-next" });
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

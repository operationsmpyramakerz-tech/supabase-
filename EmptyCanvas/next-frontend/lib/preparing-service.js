import "server-only";
import { select, selectAll, selectById, insert, updateById, supabaseRequest, rpc } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";
import { listProposals } from "./proposal-kit-service";
import { PREPARING_STAGES, PREPARING_STATES, canCompleteStage, validStage } from "./preparing-workflow";

const PROJECTS = "erp_preparing_projects";
const SCHOOLS = "erp_preparing_schools";
const STAGES = "erp_preparing_stage_progress";
const clean = value => String(value ?? "").trim();
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function serviceOnly() {
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY))
    fail("Preparing requires the server-side Supabase service key. No anon fallback is allowed.", 503);
}
function accountId(account) { return clean(account?.id || account?.memberId || account?.teamMemberId); }
function identity(account) { const id = accountId(account); if (!id) fail("A verified member is required.", 401); return id; }
function uuid(id) { if (!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(clean(id))) fail("Invalid ID."); return clean(id); }
async function requireProject(id) { const row = await selectById(PROJECTS, uuid(id)); if (!row) fail("Project not found.", 404); return row; }
async function requireSchool(id) { const row = await selectById(SCHOOLS, uuid(id)); if (!row) fail("School not found.", 404); return row; }

export async function preparingCatalog() {
  serviceOnly();
  const [members, proposals] = await Promise.all([listTeamMembersLite(), listProposals({})]);
  return { members: members.map(({ id, name, stocktakingColumn }) => ({ id, name, school: stocktakingColumn || "" })),
    proposals: proposals.map(({ id, name, itemsCount }) => ({ id, name, itemsCount: Number(itemsCount || 0) })) };
}
export async function preparingWorkspace() {
  serviceOnly();
  const projects = await selectAll(PROJECTS, { limit: 500, order: "created_at.desc", profileName: "preparing.projects" });
  // Small bounded project workspace. All records are protected by the module-level page/feature gate.
  const [schools, stages] = await Promise.all([
    selectAll(SCHOOLS, { limit: 5000, order: "created_at.asc", profileName: "preparing.schools" }),
    selectAll(STAGES, { limit: 5000, order: "updated_at.asc", profileName: "preparing.stages" }),
  ]);
  return { projects, schools, stages };
}
export async function createPreparingProject(body, account) {
  serviceOnly(); const id = identity(account); const name = clean(body?.name);
  if (name.length < 2 || name.length > 160) fail("Project name must be between 2 and 160 characters.");
  if (clean(body?.description).length > 1000) fail("Description must be under 1000 characters.");
  return insert(PROJECTS, { name, description: clean(body?.description), created_by_id: id,
    created_by_name: clean(account?.name || account?.username) });
}
export async function updatePreparingProject(id, body) {
  serviceOnly(); await requireProject(id);
  const name = clean(body?.name);
  if (name.length < 2 || name.length > 160) fail("Invalid project name.");
  if (clean(body?.description).length > 1000) fail("Description is too long.");
  return updateById(PROJECTS, uuid(id), { name, description: clean(body?.description), updated_at: new Date().toISOString() });
}
export async function addPreparingSchools(projectId, body, account) {
  serviceOnly(); const creator = identity(account); await requireProject(projectId);
  const ids = [...new Set((Array.isArray(body?.beneficiaryIds) ? body.beneficiaryIds : []).map(clean).filter(Boolean))];
  if (!ids.length || ids.length > 100) fail("Select between 1 and 100 beneficiaries.");
  const proposalId = clean(body?.proposalId);
  if (!proposalId) fail("Select a proposal.");
  const [{ members, proposals }, existing] = await Promise.all([
    preparingCatalog(), select(SCHOOLS, { select: "beneficiary_id", project_id: `eq.${uuid(projectId)}`, limit: "5000" }),
  ]);
  const memberMap = new Map(members.map(member => [member.id, member]));
  const proposal = proposals.find(row => row.id === proposalId);
  if (!proposal) fail("The selected proposal no longer exists.", 404);
  if (ids.some(id => !memberMap.has(id))) fail("One or more beneficiaries do not exist.");
  const already = new Set((existing || []).map(row => clean(row.beneficiary_id)));
  const duplicates = ids.filter(id => already.has(id));
  if (duplicates.length) fail("One or more beneficiaries are already in this project.", 409);
  // Insert as a single PostgREST request; unique constraints prevent concurrent duplicates.
  const rows = ids.map(id => ({ project_id: uuid(projectId), beneficiary_id: id,
    beneficiary_name: memberMap.get(id).name, school_label: memberMap.get(id).school,
    proposal_id: proposal.id, proposal_name: proposal.name, created_by_id: creator }));
  return supabaseRequest(`/${SCHOOLS}`, { method: "POST", headers: { Prefer: "return=representation" }, body: rows });
}
export async function updatePreparingStage(schoolId, body, account) {
  serviceOnly(); const memberId = identity(account); await requireSchool(schoolId);
  const stageKey = clean(body?.stageKey); const status = clean(body?.status); const notes = clean(body?.notes);
  if (!validStage(stageKey) || !PREPARING_STATES.includes(status)) fail("Unknown stage or status.");
  if (notes.length > 2000) fail("Notes must be under 2000 characters.");
  const stages = await select(STAGES, { select: "stage_key,status", school_id: `eq.${uuid(schoolId)}`, limit: "30" });
  if (status === "completed" && !canCompleteStage(stageKey, stages)) fail("Complete the preceding stages first.", 409);
  const currentIndex = PREPARING_STAGES.findIndex(row => row.key === stageKey);
  const completedAfter = (stages || []).some(row => row.status === "completed" && PREPARING_STAGES.findIndex(stage => stage.key === row.stage_key) > currentIndex);
  if (status !== "completed" && completedAfter) fail("Cannot reopen a stage until subsequent completed stages are reopened.", 409);
  // Database RPC re-checks prerequisites with a row lock in a single transaction.
  // The JS check above gives a friendly 409; RPC prevents concurrent progression races.
  return await rpc("erp_preparing_save_stage", {
    p_school_id: uuid(schoolId), p_stage_key: stageKey, p_status: status,
    p_notes: notes, p_member_id: memberId,
  }, { profileName: "preparing.stage-transition" });
}

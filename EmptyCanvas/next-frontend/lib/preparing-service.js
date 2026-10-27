import "server-only";
import { select, selectAll, selectById, insert, updateById, supabaseRequest, rpc } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";
import { listProposals, getProposal } from "./proposal-kit-service";
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


// Phase 2: a school-specific, immutable proposal baseline. The source proposal is never mutated.
const MANIFESTS = "erp_preparing_manifests";
const COMPONENTS = "erp_preparing_components";
const QTY_LIMIT = 1000000;
function units(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > QTY_LIMIT) fail(`${label} must be a whole number between 0 and ${QTY_LIMIT}.`);
  return value;
}
export async function preparingComponents(schoolId) {
  serviceOnly(); const school = await requireSchool(schoolId);
  const [manifests, items] = await Promise.all([
    select(MANIFESTS, { select:"*", school_id:`eq.${uuid(schoolId)}`, limit:"1" }, { profileName:"preparing.manifest" }),
    select(COMPONENTS, { select:"*", school_id:`eq.${uuid(schoolId)}`, order:"item_order.asc", limit:"1000" }, { profileName:"preparing.components" }),
  ]);
  return { schoolId: school.id, proposalId: school.proposal_id, manifest: manifests?.[0] || null, items: Array.isArray(items) ? items : [] };
}
export async function initializePreparingComponents(schoolId, account) {
  serviceOnly(); const memberId = identity(account); const school = await requireSchool(schoolId);
  // Read the existing proposal with its original item identities and kit/grade source labels.
  const source = await getProposal(school.proposal_id);
  if (!source?.items?.length) fail("The selected proposal has no items. Cannot create an empty preparing manifest.", 409);
  if (source.items.length > 1000) fail("The proposal exceeds the 1000-item limit.", 409);
  const items = source.items.map((row, index) => ({
    itemId: clean(row.id), productId: clean(row.productId),
    productName: clean(row.productName).slice(0, 500),
    planned: units(Number(row.quantity), "Planned quantity"),
    sourceKits: Array.isArray(row.sourceKits) ? row.sourceKits : [], order: index,
  }));
  if (items.some(row => !row.itemId || !row.productName || !row.planned) || new Set(items.map(row => row.itemId)).size !== items.length)
    fail("Source proposal has invalid, zero-quantity, or duplicate item rows. Resolve this in Proposals before preparing.", 409);
  // One atomic DB transaction; concurrent initialization cannot duplicate items.
  return rpc("erp_preparing_initialize_manifest", {
    p_school_id: uuid(schoolId), p_proposal_id: school.proposal_id,
    p_proposal_name: clean(source.proposal?.name || school.proposal_name),
    p_proposal_updated_at: source.proposal?.updatedAt || null,
    p_items: items, p_member_id: memberId,
  }, { profileName: "preparing.snapshot" });
}
export async function updatePreparingComponent(schoolId, body, account) {
  serviceOnly(); const memberId = identity(account); await requireSchool(schoolId);
  const componentId = uuid(body?.componentId);
  const received = units(body?.received, "Received quantity");
  const damaged = units(body?.damaged, "Damaged quantity");
  const prepared = units(body?.prepared, "Prepared quantity");
  const notes = clean(body?.notes);
  if (notes.length > 1000) fail("Notes must be under 1000 characters.");
  if (damaged > received || prepared > received - damaged)
    fail("Damaged cannot exceed received, and prepared cannot exceed usable received.");
  if (typeof body?.expectedUpdatedAt !== "string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt)))
    fail("A valid row version is required. Refresh and retry.", 409);
  return rpc("erp_preparing_update_component", {
    p_school_id: uuid(schoolId), p_component_id: componentId,
    p_received: received, p_damaged: damaged, p_prepared: prepared,
    p_notes: notes, p_expected_updated_at: body.expectedUpdatedAt, p_member_id: memberId,
  }, { profileName: "preparing.component-update" });
}

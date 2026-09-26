import "server-only";

import { verifyPageAdminPasswordDirect } from "./order-action-auth";
import { clearKpisCache, kpisReviewDetail } from "./kpis-data";
import { listTeamMembersLite } from "./team-members-service";
import { insert, select, supabaseRequest, updateById } from "./supabase-rest";

const KPI_STANDARD_TABLE = "kpi_standards";
const KPI_STANDARD_ITEMS_TABLE = "kpi_standard_items";
const KPI_STANDARD_SECTIONS_TABLE = "kpi_standard_sections";
const KPI_STANDARD_EVALUATIONS_TABLE = "kpi_standard_evaluations";
const KPI_REVIEWS_TABLE = "kpi_employee_reviews";
const KPI_SCORES_TABLE = "kpi_employee_scores";
const KPI_SCORE_DETAILS_VIEW = "kpi_employee_score_details_view";
const KPI_REVIEW_SUMMARY_VIEW = "kpi_employee_review_summary_view";

function text(value) { return String(value ?? "").replace(/\u00a0/g, " ").trim(); }
function longText(value) { return String(value ?? "").replace(/\r\n/g, "\n").trim(); }
function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/%/g, "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}
function bool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  return ["true", "1", "yes", "on", "enabled"].includes(raw);
}
function rank(value) { return ({ view: 1, edit: 2, admin: 3 })[text(value).toLowerCase()] || 0; }
function monthStart(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-01`;
  const date = raw ? new Date(raw) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getUTCFullYear()}-${String(safe.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function creator(context = {}) {
  const account = context.account || {};
  return {
    id: text(context.memberId || account.teamMemberId || account.userSupabaseId || account.userId || account.id),
    name: text(account.name || account.username),
    department: text(account.department),
    position: text(account.position),
  };
}
function summary(row = {}) {
  return {
    reviewId: text(row.review_id || row.id),
    teamMemberId: text(row.team_member_id),
    teamMemberName: text(row.team_member_name),
    reviewMonth: text(row.review_month),
    monthLabel: text(row.month_label),
    status: text(row.status || "draft"),
    standardId: text(row.standard_id),
    standardTitle: text(row.standard_title),
    department: text(row.department),
    rolePosition: text(row.role_position),
    academicYear: text(row.academic_year),
    finalPercentage: number(row.final_percentage, 0),
    totalWeightPercent: number(row.total_weight_percent, 0),
    itemCount: Number(row.item_count || 0),
    completedItemCount: Number(row.completed_item_count || 0),
    performanceRating: text(row.performance_rating),
    createdByTeamMemberId: text(row.created_by_team_member_id),
    createdByName: text(row.created_by_name),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}
function score(row = {}) {
  return {
    reviewId: text(row.review_id),
    scoreId: text(row.score_id || row.id),
    itemId: text(row.item_id),
    sectionOrder: Number(row.section_order || 0),
    section: text(row.section),
    sectionDescription: text(row.section_description),
    subsectionOrder: Number(row.subsection_order || 0),
    subsection: text(row.subsection),
    subsectionDescription: text(row.subsection_description),
    weightPercent: number(row.weight_percent, 0),
    targetPercent: number(row.target_percent, 0),
    actualPercent: row.actual_percent === null || typeof row.actual_percent === "undefined" ? null : number(row.actual_percent, 0),
    scorePercent: number(row.score_percent, 0),
    evidenceText: text(row.evidence_text),
    managerNotes: text(row.manager_notes),
  };
}
function standard(row = {}) {
  return {
    id: text(row.id), title: text(row.title), department: text(row.department), rolePosition: text(row.role_position),
    academicYear: text(row.academic_year), yearStart: Number(row.year_start || 0), yearEnd: Number(row.year_end || 0),
    description: text(row.description), isActive: bool(row.is_active, true), createdByTeamMemberId: text(row.created_by_team_member_id),
    createdByName: text(row.created_by_name), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
  };
}
function item(row = {}) {
  return {
    id: text(row.id || row.item_id), standardId: text(row.standard_id), sectionId: text(row.section_id),
    sectionOrder: Number(row.section_order || 0), section: text(row.section), sectionDescription: text(row.section_description),
    subsectionOrder: Number(row.subsection_order || 0), subsection: text(row.subsection), subsectionDescription: text(row.subsection_description),
    weightPercent: number(row.weight_percent, 0), targetPercent: number(row.target_percent, 0), isActive: bool(row.is_active, true),
  };
}
function evaluation(row = {}) {
  return {
    id: text(row.id), standardId: text(row.standard_id), evaluationOrder: Number(row.evaluation_order || 0),
    scorePercentage: number(row.score_percentage, 0), scoreFromPercentage: number(row.score_from_percentage ?? row.score_percentage, 0),
    scoreToPercentage: number(row.score_to_percentage, 100), grade: text(row.grade), isActive: bool(row.is_active, true),
  };
}
function sections(items = []) {
  const map = new Map();
  for (const row of items) {
    const key = `${row.sectionOrder}:${row.section}`;
    if (!map.has(key)) map.set(key, { sectionOrder: row.sectionOrder, section: row.section, sectionDescription: row.sectionDescription, weightPercent: 0, items: [] });
    const group = map.get(key); group.weightPercent += Number(row.weightPercent || 0); group.items.push(row);
  }
  return [...map.values()].sort((a, b) => a.sectionOrder - b.sectionOrder);
}

async function requirePasswordOrLevel(context, password, minimumLevel) {
  if (rank(context?.accessLevel) >= rank(minimumLevel)) return true;
  const clean = text(password);
  if (!clean) {
    const error = new Error("Admin password is required."); error.status = 403; throw error;
  }
  const verified = await verifyPageAdminPasswordDirect(context?.account || {}, clean, ["KPIs"]);
  if (verified === null) { const error = new Error("The direct Admin password context is unavailable."); error.status = 503; throw error; }
  if (!verified) { const error = new Error("Invalid admin password."); error.status = 401; throw error; }
  return true;
}

function canSeeReview(context, row = {}) {
  if (rank(context?.accessLevel) >= rank("admin")) return true;
  const user = creator(context);
  const own = (user.id && row.teamMemberId && user.id === row.teamMemberId)
    || (user.name && row.teamMemberName && user.name.toLowerCase() === row.teamMemberName.toLowerCase());
  if (rank(context?.accessLevel) === rank("view")) return own;
  if (rank(context?.accessLevel) === rank("edit")) {
    return Boolean(user.department && row.department && user.department.toLowerCase() === row.department.toLowerCase());
  }
  return false;
}

async function rawReview(reviewId) {
  const id = text(reviewId);
  const rows = await select(KPI_REVIEW_SUMMARY_VIEW, { select: "*", review_id: `eq.${id}`, limit: "1" });
  const row = summary(Array.isArray(rows) ? rows[0] || {} : {});
  if (!row.reviewId) { const error = new Error("KPI review not found."); error.status = 404; throw error; }
  return row;
}
async function rawDetails(reviewId) {
  const rows = await select(KPI_SCORE_DETAILS_VIEW, { select: "*", review_id: `eq.${text(reviewId)}`, order: "sort_order.asc", limit: "1000" });
  return (Array.isArray(rows) ? rows : []).map(score);
}

export async function verifyKpisAdminPassword(context, password = "") {
  await requirePasswordOrLevel(context, password, "admin");
  return { ok: true };
}

export async function saveKpiStandard(context, body = {}) {
  await requirePasswordOrLevel(context, body.adminPassword || body.password, "admin");
  const department = text(body.department);
  const rolePosition = text(body.rolePosition || body.position);
  const academicYear = text(body.academicYear || body.academic_year);
  const yearMatch = academicYear.match(/(\d{4})\D+(\d{4})/);
  const yearStart = yearMatch ? Math.max(2000, Math.min(2100, Math.round(number(body.yearStart, Number(yearMatch[1]))))) : null;
  const yearEnd = yearMatch ? Math.max(yearStart || 2000, Math.min(2101, Math.round(number(body.yearEnd, Number(yearMatch[2]))))) : null;
  const normalizedAcademicYear = yearMatch ? `${yearStart}-${yearEnd}` : null;
  const title = text(body.title) || `${department} ${rolePosition} KPIs`;
  const itemsInput = Array.isArray(body.items) ? body.items : [];
  const evaluationsInput = Array.isArray(body.evaluations) ? body.evaluations : [];
  if (!department || !rolePosition) { const error = new Error("Department and role/position are required."); error.status = 400; throw error; }
  if (!itemsInput.length) { const error = new Error("Add at least one KPI subsection inside a section."); error.status = 400; throw error; }

  const existing = await select(KPI_STANDARD_TABLE, { select: "id", department: `eq.${department}`, role_position: `eq.${rolePosition}`, limit: "1" }).catch(() => []);
  const duplicateFound = Array.isArray(existing) && existing.some((row) => row?.id);
  const who = creator(context);
  const savedStandard = await insert(KPI_STANDARD_TABLE, {
    title, department, role_position: rolePosition, academic_year: normalizedAcademicYear, year_start: yearStart, year_end: yearEnd,
    description: longText(body.description) || null, is_active: body.isActive === undefined ? true : bool(body.isActive, true),
    created_by_team_member_id: who.id || null, created_by_name: who.name || null,
  });
  const standardId = text(savedStandard?.id);
  if (!standardId) throw new Error("KPI standard could not be created.");

  const sectionByOrder = new Map();
  for (const raw of itemsInput) {
    const sectionOrder = Math.max(1, Math.round(number(raw.sectionOrder, sectionByOrder.size + 1)));
    const key = String(sectionOrder);
    if (sectionByOrder.has(key)) continue;
    const saved = await insert(KPI_STANDARD_SECTIONS_TABLE, {
      standard_id: standardId, section_order: sectionOrder, title: text(raw.section) || `Section ${sectionOrder}`,
      description: longText(raw.sectionDescription) || null, is_active: true,
    });
    if (saved?.id) sectionByOrder.set(key, saved.id);
  }

  const savedItems = [];
  for (let index = 0; index < itemsInput.length; index += 1) {
    const raw = itemsInput[index];
    const sectionOrder = Math.max(1, Math.round(number(raw.sectionOrder, index + 1)));
    const sectionId = sectionByOrder.get(String(sectionOrder));
    if (!sectionId) continue;
    const saved = await insert(KPI_STANDARD_ITEMS_TABLE, {
      standard_id: standardId, section_id: sectionId, section_order: sectionOrder,
      section: text(raw.section) || `Section ${sectionOrder}`, section_description: longText(raw.sectionDescription) || null,
      subsection_order: Math.max(1, Math.round(number(raw.subsectionOrder, index + 1))),
      subsection: text(raw.subsection) || `KPI ${index + 1}`, subsection_description: longText(raw.subsectionDescription) || null,
      weight_percent: Math.max(0, number(raw.weightPercent, 0)), target_percent: 100, is_active: true,
    });
    if (saved?.id) savedItems.push(item(saved));
  }

  const savedEvaluations = [];
  for (let index = 0; index < evaluationsInput.length; index += 1) {
    const raw = evaluationsInput[index];
    const from = Math.max(0, Math.min(100, number(raw.scoreFromPercentage ?? raw.score_from_percentage ?? raw.scorePercentage ?? raw.score_percentage, 0)));
    const to = Math.max(0, Math.min(100, number(raw.scoreToPercentage ?? raw.score_to_percentage, 100)));
    const grade = text(raw.grade) || `Grade ${index + 1}`;
    if (!grade) continue;
    const saved = await insert(KPI_STANDARD_EVALUATIONS_TABLE, {
      standard_id: standardId, evaluation_order: Math.max(1, Math.round(number(raw.evaluationOrder || raw.evaluation_order, index + 1))),
      score_percentage: Math.min(from, to), score_from_percentage: Math.min(from, to), score_to_percentage: Math.max(from, to), grade, is_active: true,
    });
    if (saved?.id) savedEvaluations.push(evaluation(saved));
  }
  clearKpisCache();
  return { ok: true, duplicateFound, standard: standard(savedStandard), items: savedItems, sections: sections(savedItems), evaluations: savedEvaluations };
}

async function ensureScores(reviewId, standardId) {
  const items = await select(KPI_STANDARD_ITEMS_TABLE, { select: "id", standard_id: `eq.${standardId}`, is_active: "eq.true", limit: "1000" });
  const rows = (Array.isArray(items) ? items : []).map((row) => ({ review_id: reviewId, standard_item_id: row.id })).filter((row) => row.standard_item_id);
  if (!rows.length) return [];
  try {
    return await supabaseRequest(`/${encodeURIComponent(KPI_SCORES_TABLE)}?on_conflict=review_id%2Cstandard_item_id`, {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: rows,
    });
  } catch (error) {
    if (/duplicate key|23505/i.test(String(error?.message || ""))) return [];
    throw error;
  }
}

export async function createKpiReview(context, body = {}) {
  await requirePasswordOrLevel(context, body.adminPassword || body.password, "edit");
  const standardId = text(body.standardId || body.standard_id);
  let teamMemberId = text(body.teamMemberId || body.team_member_id);
  let teamMemberName = text(body.teamMemberName || body.team_member_name);
  if (!standardId) { const error = new Error("KPI standard is required."); error.status = 400; throw error; }
  if (!teamMemberId && !teamMemberName) { const error = new Error("Employee is required."); error.status = 400; throw error; }
  const members = await listTeamMembersLite().catch(() => []);
  if (!teamMemberName && teamMemberId) teamMemberName = text((members || []).find((row) => String(row.id) === teamMemberId)?.name);
  if (!teamMemberId && teamMemberName) teamMemberId = text((members || []).find((row) => text(row.name).toLowerCase() === teamMemberName.toLowerCase())?.id) || teamMemberName;
  if (!teamMemberName) teamMemberName = teamMemberId;
  const reviewMonth = monthStart(body.reviewMonth || body.review_month);
  const existing = await select(KPI_REVIEWS_TABLE, { select: "*", standard_id: `eq.${standardId}`, team_member_id: `eq.${teamMemberId}`, review_month: `eq.${reviewMonth}`, limit: "1" });
  let review = Array.isArray(existing) ? existing[0] || null : null;
  if (review?.id) review = await updateById(KPI_REVIEWS_TABLE, review.id, { team_member_name: teamMemberName });
  else {
    const who = creator(context);
    review = await insert(KPI_REVIEWS_TABLE, {
      standard_id: standardId, team_member_id: teamMemberId, team_member_name: teamMemberName, review_month: reviewMonth,
      created_by_team_member_id: who.id || null, created_by_name: who.name || null,
    });
  }
  await ensureScores(review.id, standardId);
  clearKpisCache();
  return { ok: true, reviewId: review.id, review, details: await rawDetails(review.id) };
}

export async function getKpiReviewDetailAuthorized(context, reviewId, adminPassword = "") {
  try {
    return await kpisReviewDetail(context, reviewId, { force: true });
  } catch (error) {
    if (Number(error?.status) !== 403) throw error;
    await requirePasswordOrLevel(context, adminPassword, "admin");
    return { ok: true, summary: await rawReview(reviewId), details: await rawDetails(reviewId) };
  }
}

export async function updateKpiReviewScores(context, body = {}) {
  const reviewId = text(body.reviewId || body.review_id || body.id);
  if (!reviewId) { const error = new Error("KPI review id is required."); error.status = 400; throw error; }
  const current = await rawReview(reviewId);
  if (!canSeeReview(context, current)) await requirePasswordOrLevel(context, body.adminPassword || body.password, "admin");
  for (const row of (Array.isArray(body.scores) ? body.scores : [])) {
    const scoreId = text(row.scoreId || row.score_id);
    if (!scoreId) continue;
    const value = row.score ?? row.actualPercent ?? row.actual_percent;
    await updateById(KPI_SCORES_TABLE, scoreId, {
      actual_percent: value === "" || value === null || typeof value === "undefined" ? null : Math.max(0, number(value, 0)),
      evidence_text: longText(row.evidenceText || row.evidence_text) || null,
      manager_notes: longText(row.managerNotes || row.manager_notes) || null,
    });
  }
  const status = text(body.status).toLowerCase();
  if (["draft", "submitted", "approved", "archived"].includes(status)) {
    const who = creator(context); const patch = { status };
    if (status === "submitted") Object.assign(patch, { submitted_at: new Date().toISOString(), submitted_by_team_member_id: who.id || null, submitted_by_name: who.name || null });
    if (status === "approved") Object.assign(patch, { approved_at: new Date().toISOString(), approved_by_team_member_id: who.id || null, approved_by_name: who.name || null });
    await updateById(KPI_REVIEWS_TABLE, reviewId, patch);
  }
  clearKpisCache();
  return { ok: true, summary: await rawReview(reviewId), details: await rawDetails(reviewId) };
}

export function kpiMutationError(error, fallback = "Failed to process KPI request.") {
  const raw = String(error?.message || error?.details?.message || error?.details || "");
  if (/kpi_|schema cache|Could not find the table|relation .* does not exist|42P01|PGRST205/i.test(raw)) return "KPI tables are not installed yet. Run the KPI SQL file in Supabase first.";
  if (/unauthorized|permission denied|42501|row-level security|rls/i.test(raw)) return "KPI database permissions rejected this action. Run the KPI standard SQL update file in Supabase, then deploy again.";
  return raw || fallback;
}

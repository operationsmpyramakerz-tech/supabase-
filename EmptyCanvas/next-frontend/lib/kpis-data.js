import "server-only";

import { getDirectSessionAccountGate } from "./direct-session-account";
import { select, selectAll } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";

const KPI_STANDARD_TABLE = "kpi_standards";
const KPI_STANDARD_ITEMS_TABLE = "kpi_standard_items";
const KPI_STANDARD_EVALUATIONS_TABLE = "kpi_standard_evaluations";
const KPI_SCORE_DETAILS_VIEW = "kpi_employee_score_details_view";
const KPI_STANDARD_ITEMS_VIEW = "kpi_standard_items_view";
const KPI_REVIEW_SUMMARY_VIEW = "kpi_employee_review_summary_view";
const KPI_MONTHLY_GRAPH_VIEW = "kpi_employee_monthly_graph_view";

const META_CACHE_TTL_MS = 10_000;
const LIST_CACHE_TTL_MS = 1_500;
const DETAIL_CACHE_TTL_MS = 4_000;
const EVALUATIONS_CACHE_TTL_MS = 10_000;

const cache = new Map();
const inflight = new Map();

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function normalize(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/%/g, "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = text(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "t", "yes", "y", "1", "on", "enabled"].includes(raw)) return true;
  if (["false", "f", "no", "n", "0", "off", "disabled"].includes(raw)) return false;
  return fallback;
}

function monthStart(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-01`;
  const date = raw ? new Date(raw) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getUTCFullYear()}-${String(safe.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function performanceRating(value) {
  const score = Math.max(0, Math.min(100, number(value, 0)));
  if (score >= 90) return "Excellent";
  if (score >= 78) return "V.good";
  if (score >= 66) return "Good";
  return "Weak";
}

function missingSchema(error) {
  const message = String(error?.message || error?.details?.message || error?.details || "");
  return /kpi_|schema cache|Could not find the table|relation .* does not exist|42P01|PGRST205/i.test(message);
}

export function kpiErrorMessage(error) {
  if (missingSchema(error)) return "KPI tables are not installed yet. Run the KPI SQL file in Supabase first.";
  const message = String(error?.message || error?.details?.message || error?.details || "");
  if (/unauthorized|permission denied|42501|row-level security|rls/i.test(message)) {
    return "KPI database permissions rejected this action. Run the KPI standard SQL update file in Supabase, then deploy again.";
  }
  return error?.message || "Failed to process KPI request.";
}

function standard(row = {}) {
  return {
    id: String(row.id || ""),
    title: String(row.title || ""),
    department: String(row.department || ""),
    rolePosition: String(row.role_position || row.rolePosition || ""),
    academicYear: String(row.academic_year || row.academicYear || ""),
    yearStart: Number(row.year_start || row.yearStart || 0),
    yearEnd: Number(row.year_end || row.yearEnd || 0),
    description: String(row.description || ""),
    isActive: bool(row.is_active ?? row.isActive, true),
    createdByTeamMemberId: String(row.created_by_team_member_id || row.createdByTeamMemberId || ""),
    createdByName: String(row.created_by_name || row.createdByName || ""),
    createdAt: String(row.created_at || row.createdAt || ""),
    updatedAt: String(row.updated_at || row.updatedAt || ""),
  };
}

function item(row = {}) {
  return {
    id: String(row.id || row.item_id || ""),
    standardId: String(row.standard_id || row.standardId || ""),
    sectionId: String(row.section_id || row.sectionId || ""),
    sectionOrder: Number(row.section_order || 0),
    section: String(row.section || ""),
    sectionDescription: String(row.section_description || ""),
    subsectionOrder: Number(row.subsection_order || 0),
    subsection: String(row.subsection || ""),
    subsectionDescription: String(row.subsection_description || ""),
    weightPercent: number(row.weight_percent, 0),
    targetPercent: number(row.target_percent, 0),
    isActive: bool(row.is_active ?? row.item_is_active, true),
  };
}

function summary(row = {}) {
  return {
    reviewId: String(row.review_id || row.id || ""),
    teamMemberId: String(row.team_member_id || ""),
    teamMemberName: String(row.team_member_name || ""),
    reviewMonth: String(row.review_month || ""),
    monthLabel: String(row.month_label || ""),
    status: String(row.status || "draft"),
    standardId: String(row.standard_id || ""),
    standardTitle: String(row.standard_title || ""),
    department: String(row.department || ""),
    rolePosition: String(row.role_position || ""),
    academicYear: String(row.academic_year || ""),
    finalPercentage: number(row.final_percentage, 0),
    totalWeightPercent: number(row.total_weight_percent, 0),
    itemCount: Number(row.item_count || 0),
    completedItemCount: Number(row.completed_item_count || 0),
    performanceRating: text(row.performance_rating || row.performanceRating) || performanceRating(row.final_percentage),
    sectionOrder: Number(row.section_order || row.sectionOrder || 0),
    section: String(row.section || ""),
    createdByTeamMemberId: String(row.created_by_team_member_id || row.createdByTeamMemberId || ""),
    createdByName: String(row.created_by_name || row.createdByName || ""),
    createdAt: String(row.created_at || row.createdAt || ""),
    updatedAt: String(row.updated_at || row.updatedAt || ""),
  };
}

function score(row = {}) {
  return {
    reviewId: String(row.review_id || ""),
    scoreId: String(row.score_id || row.id || ""),
    itemId: String(row.item_id || ""),
    sectionOrder: Number(row.section_order || 0),
    section: String(row.section || ""),
    sectionDescription: String(row.section_description || ""),
    subsectionOrder: Number(row.subsection_order || 0),
    subsection: String(row.subsection || ""),
    subsectionDescription: String(row.subsection_description || ""),
    weightPercent: number(row.weight_percent, 0),
    targetPercent: number(row.target_percent, 0),
    actualPercent: row.actual_percent === null || typeof row.actual_percent === "undefined" ? null : number(row.actual_percent, 0),
    scorePercent: number(row.score_percent, 0),
    evidenceText: String(row.evidence_text || ""),
    managerNotes: String(row.manager_notes || ""),
  };
}

function evaluation(row = {}) {
  const legacyScore = number(row.score_percentage ?? row.scorePercentage, 0);
  const fromRaw = row.score_from_percentage ?? row.scoreFromPercentage;
  const toRaw = row.score_to_percentage ?? row.scoreToPercentage;
  const from = fromRaw === null || typeof fromRaw === "undefined" ? legacyScore : number(fromRaw, legacyScore);
  const to = toRaw === null || typeof toRaw === "undefined" ? 100 : number(toRaw, 100);
  return {
    id: String(row.id || ""),
    standardId: String(row.standard_id || row.standardId || ""),
    evaluationOrder: Number(row.evaluation_order || row.evaluationOrder || 0),
    scorePercentage: legacyScore,
    scoreFromPercentage: Math.max(0, Math.min(100, from)),
    scoreToPercentage: Math.max(0, Math.min(100, to)),
    grade: String(row.grade || ""),
    isActive: bool(row.is_active ?? row.isActive, true),
  };
}

function sections(items = []) {
  const map = new Map();
  for (const row of items) {
    const key = `${row.sectionOrder}:${row.section}`;
    if (!map.has(key)) map.set(key, { sectionOrder: row.sectionOrder, section: row.section, sectionDescription: row.sectionDescription, weightPercent: 0, items: [] });
    const section = map.get(key);
    section.weightPercent += Number(row.weightPercent || 0);
    section.items.push(row);
  }
  return Array.from(map.values()).sort((a, b) => a.sectionOrder - b.sectionOrder);
}

function builtInAdmin(account = {}) {
  return normalize(account.name || account.username) === "admin" || normalize(account.position).includes("admin");
}

function accessLevel(account = {}) {
  if (builtInAdmin(account)) return "admin";
  const rows = Array.isArray(account?.pageAccess?.pages) ? account.pageAccess.pages : [];
  const matches = rows.filter((row) => {
    if (row?.isEnabled === false) return false;
    const values = [row.pageName, row.pageKey, row.routePath, ...(Array.isArray(row.aliases) ? row.aliases : [])].map(normalize);
    return values.includes("kpis") || values.includes("kpi");
  });
  let best = "view";
  for (const row of matches) {
    const raw = text(row.accessLevel || row.access_level).toLowerCase();
    if (raw === "admin") return "admin";
    if (raw === "edit") best = "edit";
  }
  return best;
}

function currentUser(context = {}) {
  const account = context.account || {};
  return {
    id: String(context.memberId || account.id || ""),
    name: text(account.name || account.username),
    department: text(account.department),
    position: text(account.position),
    photoUrl: text(account.photoUrl || account.profilePicture || account.profile_picture),
    email: text(account.email),
    accessLevel: context.accessLevel || "view",
  };
}

function sameMember(leftId, leftName, rightId, rightName) {
  const aId = text(leftId);
  const bId = text(rightId);
  if (aId && bId && aId === bId) return true;
  const aName = text(leftName).toLowerCase();
  const bName = text(rightName).toLowerCase();
  return Boolean(aName && bName && aName === bName);
}

function reviewVisible(context = {}, row = {}) {
  if (context.accessLevel === "admin") return true;
  const user = currentUser(context);
  if (context.accessLevel === "view") return sameMember(user.id, user.name, row.teamMemberId, row.teamMemberName);
  if (context.accessLevel === "edit") {
    return Boolean(user.department && row.department && user.department.toLowerCase() === row.department.toLowerCase());
  }
  return false;
}

function standardVisible(context = {}, row = {}) {
  if (context.accessLevel === "admin") return true;
  const user = currentUser(context);
  if (!user.department || !row.department || user.department.toLowerCase() !== row.department.toLowerCase()) return false;
  if (context.accessLevel === "edit") return true;
  return Boolean(user.position && row.rolePosition && user.position.toLowerCase() === row.rolePosition.toLowerCase());
}

function gradeFromEvaluations(value, rows = []) {
  const gradeRows = (Array.isArray(rows) ? rows : [])
    .map(evaluation)
    .filter((row) => row.grade)
    .map((row) => ({
      ...row,
      from: Math.min(row.scoreFromPercentage, row.scoreToPercentage),
      to: Math.max(row.scoreFromPercentage, row.scoreToPercentage),
    }))
    .sort((a, b) => b.from - a.from || b.to - a.to || a.evaluationOrder - b.evaluationOrder);
  const valueNumber = Math.max(0, Math.min(100, number(value, 0)));
  const ranged = gradeRows.find((row) => valueNumber >= row.from && valueNumber <= row.to);
  if (ranged?.grade) return ranged.grade;
  const threshold = gradeRows.find((row) => valueNumber >= Math.max(0, Math.min(100, number(row.scorePercentage, row.from))));
  return threshold?.grade || gradeRows.slice().sort((a, b) => a.from - b.from || a.evaluationOrder - b.evaluationOrder)[0]?.grade || performanceRating(valueNumber);
}

async function cached(key, ttlMs, loader, { force = false } = {}) {
  const now = Date.now();
  if (!force && cache.get(key)?.expiresAt > now) return cache.get(key).value;
  if (!force && inflight.has(key)) return await inflight.get(key);
  const pending = Promise.resolve().then(loader);
  if (!force) inflight.set(key, pending);
  try {
    const value = await pending;
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

async function allEvaluations({ force = false } = {}) {
  return await cached("evaluations:all", EVALUATIONS_CACHE_TTL_MS, async () => {
    let rows;
    try {
      rows = await select(KPI_STANDARD_EVALUATIONS_TABLE, {
        select: "*",
        is_active: "eq.true",
        order: "standard_id.asc,score_from_percentage.desc,evaluation_order.asc",
        limit: "5000",
      });
    } catch (error) {
      if (missingSchema(error)) return [];
      if (/score_from_percentage|score_to_percentage|column/i.test(String(error?.message || error?.details || ""))) {
        rows = await select(KPI_STANDARD_EVALUATIONS_TABLE, {
          select: "*",
          is_active: "eq.true",
          order: "standard_id.asc,score_percentage.desc,evaluation_order.asc",
          limit: "5000",
        }).catch((fallbackError) => {
          if (missingSchema(fallbackError)) return [];
          throw fallbackError;
        });
      } else {
        throw error;
      }
    }
    return (Array.isArray(rows) ? rows : []).map(evaluation).filter((row) => row.grade);
  }, { force });
}

async function applyGrades(rows = []) {
  if (!rows.length) return [];
  const evaluations = await allEvaluations();
  const grouped = new Map();
  for (const row of evaluations) {
    if (!grouped.has(row.standardId)) grouped.set(row.standardId, []);
    grouped.get(row.standardId).push(row);
  }
  return rows.map((row) => ({ ...row, performanceRating: gradeFromEvaluations(row.finalPercentage, grouped.get(row.standardId) || []) }));
}

async function standardItems(standardId) {
  const id = text(standardId);
  if (!id) return [];
  try {
    const rows = await select(KPI_STANDARD_ITEMS_VIEW, {
      select: "*",
      standard_id: `eq.${id}`,
      item_is_active: "eq.true",
      order: "sort_order.asc",
      limit: "1000",
    });
    if (Array.isArray(rows)) return rows.map(item);
  } catch {}
  const rows = await select(KPI_STANDARD_ITEMS_TABLE, {
    select: "*",
    standard_id: `eq.${id}`,
    is_active: "eq.true",
    order: "section_order.asc,subsection_order.asc",
    limit: "1000",
  });
  return (Array.isArray(rows) ? rows : []).map(item);
}

async function evaluationsForStandard(standardId) {
  const id = text(standardId);
  if (!id) return [];
  const rows = await allEvaluations();
  return rows.filter((row) => row.standardId === id);
}

function contextKey(context = {}) {
  return [context.memberId || "", context.accessLevel || "view", text(context.account?.department), text(context.account?.position)].join(":");
}

export async function directKpisContext() {
  const gate = await getDirectSessionAccountGate(["KPIs"]);
  if (!gate) return null;
  if (!gate.ok) return { ok: false, status: gate.status, error: gate.error, account: gate.account || null, source: "direct-session" };
  return {
    ok: true,
    status: 200,
    account: gate.account,
    memberId: gate.memberId || "",
    accessLevel: accessLevel(gate.account),
    source: "direct-session",
  };
}

export async function kpisMeta(context, { force = false } = {}) {
  const key = `meta:${contextKey(context)}`;
  return await cached(key, META_CACHE_TTL_MS, async () => {
    const [members, departmentRows, standardRows] = await Promise.all([
      listTeamMembersLite({ fresh: force }).catch(() => []),
      selectAll(text(process.env.SUPABASE_TEAM_MEMBER_DEPARTMENTS_TABLE) || "team_member_departments", { limit: 1000, order: "name.asc" }).catch(() => []),
      select(KPI_STANDARD_TABLE, { select: "*", order: "department.asc,role_position.asc,title.asc", limit: "1000" }).catch((error) => {
        if (missingSchema(error)) return [];
        throw error;
      }),
    ]);
    const users = (Array.isArray(members) ? members : []).map((member) => ({
      id: member.id,
      name: member.name,
      department: member.department,
      position: member.position,
      photoUrl: "",
      email: "",
    })).filter((member) => member.id || member.name);
    const user = currentUser(context);
    const standards = (Array.isArray(standardRows) ? standardRows : []).map(standard).filter((row) => standardVisible(context, row));
    const departmentNames = (Array.isArray(departmentRows) ? departmentRows : []).map((row) => text(row.name || row.department || row.department_name)).filter(Boolean);
    const departments = [...new Set([...departmentNames, ...users.map((row) => row.department), ...standards.map((row) => row.department)].map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const positions = [...new Set([...users.map((row) => row.position), ...standards.map((row) => row.rolePosition)].map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const byDepartment = new Map();
    const addPosition = (department, position, fallback = false) => {
      const dep = text(department);
      const pos = text(position);
      if (!dep || !pos) return;
      const depKey = dep.toLowerCase();
      if (fallback && byDepartment.has(depKey) && byDepartment.get(depKey).size) return;
      if (!byDepartment.has(depKey)) byDepartment.set(depKey, new Set());
      byDepartment.get(depKey).add(pos);
    };
    users.forEach((row) => addPosition(row.department, row.position));
    standards.forEach((row) => addPosition(row.department, row.rolePosition, true));
    const positionsByDepartment = Object.fromEntries(Array.from(byDepartment.entries()).map(([dep, set]) => [dep, Array.from(set).sort((a, b) => a.localeCompare(b))]));
    return { ok: true, users, standards, departments, positions, positionsByDepartment, currentUser: user, accessLevel: context.accessLevel };
  }, { force });
}

function listParams(query = {}) {
  const params = { select: "*", order: "review_month.desc,team_member_name.asc", limit: "1000" };
  const teamMemberId = text(query.teamMemberId || query.team_member_id);
  const department = text(query.department);
  const rolePosition = text(query.rolePosition || query.position);
  const standardId = text(query.standardId || query.standard_id);
  const createdByTeamMemberId = text(query.createdByTeamMemberId || query.created_by_team_member_id);
  const rawStatus = text(query.status).toLowerCase();
  if (teamMemberId) params.team_member_id = `eq.${teamMemberId}`;
  if (department) params.department = `eq.${department}`;
  if (rolePosition) params.role_position = `eq.${rolePosition}`;
  if (standardId) params.standard_id = `eq.${standardId}`;
  if (createdByTeamMemberId) params.created_by_team_member_id = `eq.${createdByTeamMemberId}`;
  if (["draft", "submitted", "approved", "archived"].includes(rawStatus)) params.status = `eq.${rawStatus}`;
  if (query.from) params.review_month = `gte.${monthStart(query.from)}`;
  if (query.to) params.review_month = params.review_month ? undefined : `lte.${monthStart(query.to)}`;
  return params;
}

async function rawReviews(query = {}) {
  // PostgREST cannot carry two operators under the same object key. Build the
  // range in one expression through an `and` filter when both ends are present.
  const params = listParams(query);
  const from = text(query.from);
  const to = text(query.to);
  delete params.review_month;
  if (from && to) params.and = `(review_month.gte.${monthStart(from)},review_month.lte.${monthStart(to)})`;
  else if (from) params.review_month = `gte.${monthStart(from)}`;
  else if (to) params.review_month = `lte.${monthStart(to)}`;
  const rows = await select(KPI_REVIEW_SUMMARY_VIEW, params);
  return (Array.isArray(rows) ? rows : []).map(summary);
}

async function applySectionFilter(rows = [], query = {}) {
  const sectionOrder = Number(query.sectionOrder || query.section_order || 0);
  const sectionName = text(query.section);
  if ((!Number.isFinite(sectionOrder) || sectionOrder <= 0) && !sectionName) return rows;
  if (!rows.length) return [];

  const ids = rows.map((row) => row.reviewId).filter(Boolean);
  if (!ids.length) return [];
  const inValue = `in.(${ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(",")})`;
  const params = { select: "*", review_id: inValue, order: "review_id.asc,sort_order.asc", limit: "5000" };
  if (sectionOrder > 0) params.section_order = `eq.${sectionOrder}`;
  if (sectionName) params.section = `eq.${sectionName}`;
  const detailRows = await select(KPI_SCORE_DETAILS_VIEW, params);
  const byReview = new Map();
  for (const row of (Array.isArray(detailRows) ? detailRows : []).map(score)) {
    if (!byReview.has(row.reviewId)) byReview.set(row.reviewId, []);
    byReview.get(row.reviewId).push(row);
  }
  const evaluations = await allEvaluations();
  const evalByStandard = new Map();
  for (const row of evaluations) {
    if (!evalByStandard.has(row.standardId)) evalByStandard.set(row.standardId, []);
    evalByStandard.get(row.standardId).push(row);
  }

  return rows.flatMap((row) => {
    const details = byReview.get(row.reviewId) || [];
    if (!details.length) return [];
    const totalWeight = details.reduce((sum, detail) => sum + Math.max(0, number(detail.weightPercent, 0)), 0);
    const completed = details.filter((detail) => detail.actualPercent !== null && typeof detail.actualPercent !== "undefined");
    if (!completed.length) return [];
    const actual = completed.reduce((sum, detail) => {
      const weight = Math.max(0, number(detail.weightPercent, 0));
      return sum + Math.min(Math.max(number(detail.actualPercent, 0), 0), weight);
    }, 0);
    const finalPercentage = totalWeight > 0 ? Number(((actual / totalWeight) * 100).toFixed(2)) : 0;
    return [{
      ...row,
      finalPercentage,
      totalWeightPercent: totalWeight,
      itemCount: details.length,
      completedItemCount: completed.length,
      performanceRating: gradeFromEvaluations(finalPercentage, evalByStandard.get(row.standardId) || []),
      sectionOrder: details[0]?.sectionOrder || sectionOrder || 0,
      section: details[0]?.section || sectionName || "",
    }];
  });
}

export async function kpisReviews(context, query = {}, { force = false } = {}) {
  const queryKey = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== null && typeof value !== "undefined" && value !== "").map(([key, value]) => [key, String(value)])).toString();
  const key = `reviews:${contextKey(context)}:${queryKey}`;
  return await cached(key, LIST_CACHE_TTL_MS, async () => {
    let reviews = (await rawReviews(query)).filter((row) => reviewVisible(context, row));
    reviews = await applySectionFilter(reviews, query);
    reviews = await applyGrades(reviews);
    return { ok: true, reviews, accessLevel: context.accessLevel };
  }, { force });
}

export async function kpisGraph(context, query = {}, { force = false } = {}) {
  let teamMemberId = text(query.teamMemberId || query.team_member_id) || currentUser(context).id;
  const academicYear = text(query.academicYear || query.academic_year);
  const key = `graph:${contextKey(context)}:${teamMemberId}:${academicYear}`;
  return await cached(key, LIST_CACHE_TTL_MS, async () => {
    if (context.accessLevel !== "admin" && teamMemberId && teamMemberId !== currentUser(context).id) {
      const meta = await kpisMeta(context);
      const requested = (meta.users || []).find((row) => String(row.id) === String(teamMemberId));
      if (!requested || (context.accessLevel === "view") || (context.accessLevel === "edit" && text(requested.department).toLowerCase() !== text(currentUser(context).department).toLowerCase())) {
        return { ok: true, points: [] };
      }
    }
    const params = { select: "*", order: "review_month.asc", limit: "1000" };
    if (teamMemberId) params.team_member_id = `eq.${teamMemberId}`;
    if (academicYear) params.academic_year = `eq.${academicYear}`;
    const rows = await select(KPI_MONTHLY_GRAPH_VIEW, params);
    let points = (Array.isArray(rows) ? rows : []).map(summary).filter((row) => reviewVisible(context, row));
    points = await applyGrades(points);
    return { ok: true, points };
  }, { force });
}

export async function kpisStandards(context, query = {}, { force = false } = {}) {
  const id = text(query.id);
  const department = text(query.department);
  const rolePosition = text(query.rolePosition || query.position);
  const key = `standards:${contextKey(context)}:${id}:${department}:${rolePosition}`;
  return await cached(key, DETAIL_CACHE_TTL_MS, async () => {
    const params = { select: "*", order: "department.asc,role_position.asc,title.asc", limit: "1000" };
    if (id) params.id = `eq.${id}`;
    if (department) params.department = `eq.${department}`;
    if (rolePosition) params.role_position = `eq.${rolePosition}`;
    const rows = await select(KPI_STANDARD_TABLE, params);
    const standards = (Array.isArray(rows) ? rows : []).map(standard).filter((row) => standardVisible(context, row));
    const selectedStandardId = id && standards.some((row) => row.id === id) ? id : (standards[0]?.id || "");
    const [items, evaluations] = selectedStandardId
      ? await Promise.all([standardItems(selectedStandardId), evaluationsForStandard(selectedStandardId)])
      : [[], []];
    return { ok: true, standards, selectedStandardId, items, sections: sections(items), evaluations };
  }, { force });
}

export async function kpisReviewDetail(context, reviewId, { force = false } = {}) {
  const id = text(reviewId);
  if (!id) {
    const error = new Error("KPI review id is required.");
    error.status = 400;
    throw error;
  }
  const key = `review-detail:${contextKey(context)}:${id}`;
  return await cached(key, DETAIL_CACHE_TTL_MS, async () => {
    const rows = await select(KPI_REVIEW_SUMMARY_VIEW, { select: "*", review_id: `eq.${id}`, limit: "1" });
    let reviewSummary = summary((Array.isArray(rows) ? rows[0] : null) || {});
    if (!reviewSummary.reviewId) {
      const error = new Error("KPI review not found.");
      error.status = 404;
      throw error;
    }
    if (!reviewVisible(context, reviewSummary)) {
      const error = new Error("This KPI review is not available for your account.");
      error.status = 403;
      throw error;
    }
    [reviewSummary] = await applyGrades([reviewSummary]);
    const detailRows = await select(KPI_SCORE_DETAILS_VIEW, { select: "*", review_id: `eq.${id}`, order: "sort_order.asc", limit: "1000" });
    return { ok: true, summary: reviewSummary, details: (Array.isArray(detailRows) ? detailRows : []).map(score) };
  }, { force });
}

export async function loadDirectKpisPageData() {
  const context = await directKpisContext();
  if (!context) return null;
  if (!context.ok) return context;
  try {
    const userId = currentUser(context).id;
    const [meta, reviews, graph] = await Promise.all([
      kpisMeta(context),
      kpisReviews(context),
      kpisGraph(context, userId ? { teamMemberId: userId } : {}),
    ]);
    return {
      ok: true,
      status: 200,
      account: context.account,
      meta,
      reviews,
      graph,
      warnings: [],
      source: "supabase-next",
    };
  } catch {
    return null;
  }
}

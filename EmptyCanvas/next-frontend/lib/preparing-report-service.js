import "server-only";
import { select, selectById } from "./supabase-rest";
import { buildPreparingProjectReport, cairoDate } from "./preparing-reports";

const validId = value => /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(String(value || ""));
function error(message, status = 400) { const result = new Error(message); result.status = status; throw result; }
function serviceOnly() {
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY))
    error("Preparing reports require the server-side Supabase service key.", 503);
}
async function fetchAll(table, fields, filter, { max = 30000, label = table, order = "school_id.asc" } = {}) {
  // PostgREST may cap each response to 1,000 rows. Never show silently truncated totals.
  const results = [];
  for (let offset = 0; offset <= max; offset += 400) {
    const batch = await select(table, { select: fields, ...filter, order, limit: "400", offset: String(offset) }, { profileName: `preparing.report.${label}` });
    if (!Array.isArray(batch)) error(`Unexpected response while reading ${label}.`, 502);
    results.push(...batch);
    if (results.length > max) error(`Project ${label} records exceed reporting limits; no partial results were returned.`, 409);
    if (batch.length < 400) return results;
  }
  error(`Project ${label} records exceed reporting limits; no partial results were returned.`, 409);
}
export async function preparingProjectReport(projectId) {
  serviceOnly();
  if (!validId(projectId)) error("Invalid project ID.");
  const project = await selectById("erp_preparing_projects", projectId);
  if (!project) error("Project not found.", 404);
  const schools = await select("erp_preparing_schools", {
    select: "id,project_id,beneficiary_name,school_label,proposal_name",
    project_id: `eq.${projectId}`, order: "created_at.asc", limit: "401"
  }, { profileName: "preparing.report.schools" });
  if (!Array.isArray(schools)) error("Unable to read project beneficiaries.", 502);
  if (schools.length > 400) error("The report supports up to 400 schools per project; no partial results were returned.", 409);
  if (!schools.length) return buildPreparingProjectReport({ project, schools: [], today: cairoDate() });
  const ids = schools.map(row => row.id);
  const chunks = [];
  for (let index = 0; index < ids.length; index += 25) chunks.push(ids.slice(index, index + 25));
  const datasets = [
    ["progress", "erp_preparing_stage_progress", "school_id,stage_key,status", "school_id.asc,stage_key.asc"],
    ["components", "erp_preparing_components", "school_id,planned_qty,received_qty,damaged_qty,prepared_qty", "school_id.asc,id.asc"],
    ["shipments", "erp_preparing_shipments", "id,school_id,status,delivered_at,receipt_reference", "school_id.asc,id.asc"],
    ["shipmentLines", "erp_preparing_shipment_lines", "school_id,shipment_id,packed_qty,received_qty", "school_id.asc,shipment_id.asc,component_id.asc"],
    ["issues", "erp_preparing_technical_issues", "school_id,status,due_date", "school_id.asc,id.asc"],
    ["checkpoints", "erp_preparing_technical_checklist", "school_id,milestone_key,status", "school_id.asc,milestone_key.asc"],
    ["acceptances", "erp_preparing_technical_acceptance", "school_id,confirmation_reference", "school_id.asc"],
    ["closingChecks", "erp_preparing_closing_checks", "school_id,check_key,status", "school_id.asc,check_key.asc"],
    ["approvals", "erp_preparing_closing_approval", "school_id,status", "school_id.asc"],
  ];
  const output = Object.fromEntries(datasets.map(([key]) => [key, []]));
  // Independent READ queries (no writes). Keep request fan-out bounded for large projects.
  for (const chunk of chunks) {
    const filter = { school_id: `in.(${chunk.join(",")})` };
    const pages = await Promise.all(datasets.map(async ([key, table, fields, order]) =>
      [key, await fetchAll(table, fields, filter, { label: key, order, max: key === "shipmentLines" ? 30000 : 15000 })]));
    for (const [key, rows] of pages) output[key].push(...rows);
  }
  return buildPreparingProjectReport({ project, schools, ...output, today: cairoDate() });
}

import "server-only";

import { directB2cContext } from "./b2c-data";
import { directKpisContext, kpisReviewDetail } from "./kpis-data";
import { rpc, selectById } from "./supabase-rest";
import { b2cRecordHasReference, kpiEvidenceHasReference } from "./storage-record-file-policy.mjs";

const MAX_LINKS = 50;
function deny(message, status = 403) {
  const error = new Error(message);
  error.code = "STORAGE_RECORD_ACCESS_DENIED";
  error.status = status;
  throw error;
}

async function linkedRecords(fn, reference) {
  if (!reference || reference.length > 6000) deny("Invalid attachment reference.", 400);
  let rows;
  try {
    rows = await rpc(fn, { p_reference: reference }, { profileName: `storage.${fn}` });
  } catch {
    deny("File record verification is temporarily unavailable.", 503);
  }
  if (!Array.isArray(rows) || rows.length >= MAX_LINKS) deny("File record verification is incomplete.", 503);
  if (!rows.length) deny("This file is not attached to a permitted record.");
  return rows;
}

export async function assertB2cStorageRecordAccess(reference) {
  const links = await linkedRecords("erp_storage_b2c_file_links", reference);
  const context = await directB2cContext(["Customer Database", "B2C"], { feature: "b2c.database.view" }).catch(() => null);
  if (!context?.ok) deny("Customer record access denied.", context?.status === 503 ? 503 : 403);
  for (const link of links) {
    if (!link.record_id || !link.database_id) continue;
    let row;
    try {
      row = await selectById(process.env.SUPABASE_B2C_CUSTOMERS_TABLE || "b2c_customers", link.record_id, { select: "id,database_id,data" });
    } catch { deny("Customer file authorization is temporarily unavailable.", 503); }
    if (row && String(row.database_id) === String(link.database_id) && b2cRecordHasReference(row.data, reference)) return;
  }
  deny("Customer file is outside your permitted records.");
}

export async function assertKpiStorageRecordAccess(reference) {
  const links = await linkedRecords("erp_storage_kpi_file_links", reference);
  const context = await directKpisContext().catch(() => null);
  if (!context?.ok) deny("KPI record access denied.", context?.status === 503 ? 503 : 403);
  for (const link of links) {
    if (!link.review_id || !link.score_id) continue;
    let detail;
    try {
      // The current KPI review rules check employee / department membership.
      // No admin-password bypass is applied to a downloadable link.
      detail = await kpisReviewDetail(context, link.review_id, { force: true });
    } catch (error) {
      if ([403, 404].includes(Number(error?.status))) continue;
      deny("KPI file authorization is temporarily unavailable.", 503);
    }
    // Read-only users must match the employee's real Team Member ID; never
    // rely on the name fallback used by older KPI UI visibility rules.
    if (context.accessLevel === "view") {
      const viewerId = String(context.memberId || context.account?.teamMemberId || "");
      const reviewedId = String(detail?.summary?.teamMemberId || "");
      if (!viewerId || !reviewedId || viewerId !== reviewedId) continue;
    }
    if ((detail?.details || []).some(score =>
      String(score.scoreId) === String(link.score_id) && kpiEvidenceHasReference(score.evidenceText, reference)
    )) return;
  }
  deny("KPI file is outside your permitted reviews.");
}

import "server-only";
import { select, supabaseRequest } from "./supabase-rest";
import { loadRawOrderRowsByIds } from "./order-details-data";
import { normalizePrForm } from "./purchase-requisition-data.mjs";
import { prOrderIdentity } from "./purchase-requisition-storage-data.mjs";

const TABLE = "erp_purchase_requisitions";

export function prStorageIdentityFromRows(rows) {
  return prOrderIdentity(rows);
}

export async function prStorageIdentityFromIds(ids) {
  const rows = await loadRawOrderRowsByIds(ids);
  if (rows.length !== new Set(ids.map(String)).size) {
    const error = new Error("Some order components are no longer available.");
    error.status = 404;
    throw error;
  }
  return prOrderIdentity(rows);
}

export async function readSavedPurchaseRequisition(identity) {
  const records = await select(TABLE, {
    select: "form_data,updated_at,updated_by",
    order_key: `eq.${identity.orderKey}`,
    limit: "1",
  }, { profileName: "purchase-requisition.read" });
  const record = Array.isArray(records) ? records[0] : null;
  return record ? {
    form: normalizePrForm(record.form_data || {}),
    updatedAt: record.updated_at || null,
    updatedBy: record.updated_by || "",
  } : null;
}

export async function savePurchaseRequisition(identity, form, account = {}) {
  const cleaned = normalizePrForm(form);
  const author = String(account.teamMemberId || account.userSupabaseId || account.username || "").slice(0,150);
  const rows = await supabaseRequest(`/${TABLE}?on_conflict=order_key`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: {
      order_key: identity.orderKey,
      order_numbers: identity.orderNumbers,
      form_data: cleaned,
      updated_by: author,
      created_by: author,
    },
  });
  const result = Array.isArray(rows) ? rows[0] : null;
  if (!result) throw new Error("Save was not confirmed by the database.");
  return {
    form: normalizePrForm(result.form_data || cleaned),
    updatedAt: result.updated_at || null,
    updatedBy: result.updated_by || author,
  };
}

import "server-only";

import { createProduct, deleteProduct } from "./products-service";
import { deleteByIds, insertMany, select, supabaseRequest, updateById } from "./supabase-rest";
import { validateProductAddition } from "./product-addition-request-payload.mjs";

const table = () => String(process.env.SUPABASE_PRODUCT_ADDITION_REQUESTS_TABLE || "product_addition_requests").trim();
const clean = value => String(value ?? "").trim();
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; return error; };
const fields = value => {
  const item = validateProductAddition(value, value?.quantity);
  return {
    name: item.name,
    id_code: item.idCode || null,
    unit_price: item.unitPrice,
    unit: item.unit || null,
    tag: item.tag || null,
    url: item.url || null,
    image_url: item.imageUrl || null,
    quantity: item.quantity,
  };
};

export async function ensureProductAdditionRequestsTable() {
  try {
    await select(table(), { select: "id", limit: "1" });
  } catch (error) {
    if (/PGRST205|42P01|schema cache|relation .* does not exist|could not find the table/i.test(`${error?.message} ${JSON.stringify(error?.details || {})}`)) {
      throw fail("Product addition requests require the supplied SQL migration before first use.", 503);
    }
    throw error;
  }
}

export async function createProductAdditionRequests(items = [], createdRows = [], account = {}, orderNumber) {
  const rows = items.flatMap((item, index) => {
    if (!item?.customProduct) return [];
    const orderRowId = clean(createdRows[index]?.id);
    if (!orderRowId) throw fail("Could not link the new component request to its order.", 500);
    return [{
      ...fields({ ...item.customProduct, quantity: item.quantity }),
      order_row_id: orderRowId,
      order_number: orderNumber,
      requested_by_id: clean(account?.teamMemberId || account?.userSupabaseId || account?.userId || account?.id) || null,
      requested_by_name: clean(account?.username || account?.name) || null,
      status: "pending",
    }];
  });
  if (rows.length) await insertMany(table(), rows);
  return rows.length;
}

export async function listProductAdditionRequests() {
  await ensureProductAdditionRequestsTable();
  const rows = await select(table(), { select: "*", order: "created_at.desc", limit: "5000" });
  return Array.isArray(rows) ? rows : [];
}

async function getRequest(id) {
  const found = await select(table(), { select: "*", id: `eq.${id}`, limit: "1" });
  const record = found?.[0];
  if (!record) throw fail("Product addition request not found.", 404);
  return record;
}

// Conditional write is important: two reviewers must not both approve the same request.
async function patchPending(id, patch, fromStatus = "pending") {
  const result = await supabaseRequest(`/${encodeURIComponent(table())}?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(fromStatus)}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: patch,
  });
  const row = Array.isArray(result) ? result[0] : result;
  if (!row) throw fail("The request was already changed by another reviewer. Refresh the list.", 409);
  return row;
}

export async function saveProductAdditionRequest(id, body, { canUploadImage = false } = {}) {
  const record = await getRequest(id);
  if (record.status !== "pending") throw fail("Only pending requests can be edited.", 409);
  const next = fields(body);
  if (!canUploadImage && clean(next.image_url) !== clean(record.image_url)) {
    throw fail("Product image editing permission is required to change the image.", 403);
  }
  // Qty belongs to the original order as well. Change it only while the order
  // is still awaiting supervision; never silently rewrite an active shipment.
  if (Number(record.quantity) !== Number(next.quantity)) {
    const orderTable = clean(process.env.SUPABASE_ORDERS_TABLE) || "orders";
    const rows = await select(orderTable, { select: "id,status,quantity_received_by_operations", id: `eq.${record.order_row_id}`, limit: "1" });
    const order = rows?.[0];
    if (!order || order.status !== "Under Supervision" || Number(order.quantity_received_by_operations) > 0) {
      throw fail("Qty can be changed only while the original order is Under Supervision and nothing has been received.", 409);
    }
    const updated = await patchPending(id, { ...next, updated_at: new Date().toISOString() });
    try {
      await updateById(orderTable, record.order_row_id, {
        quantity_requested: next.quantity, quantity_progress: next.quantity, quantity_remaining: next.quantity,
      });
    } catch (error) {
      await updateById(table(), id, { quantity: record.quantity }).catch(rollback => console.error("Could not restore request qty:", rollback));
      throw error;
    }
    return updated;
  }
  return await patchPending(id, { ...next, updated_at: new Date().toISOString() });
}

export async function approveProductAdditionRequest(id, account = {}) {
  const record = await getRequest(id);
  if (record.status !== "pending") throw fail("Only pending requests can be added to Products.", 409);
  const reserved = await patchPending(id, { status: "processing", updated_at: new Date().toISOString() });
  let product = null;
  try {
    product = await createProduct({
      name: reserved.name, idCode: reserved.id_code, unitPrice: reserved.unit_price,
      unit: reserved.unit, tags: reserved.tag, url: reserved.url, imageUrl: reserved.image_url,
    });
    const approved = await updateById(table(), id, {
      status: "approved", approved_product_id: clean(product.id),
      reviewed_by_name: clean(account?.username || account?.name) || null,
      reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    if (!approved) throw fail("Could not record the product approval.", 500);
    let orderLinked = false;
    try {
      if (reserved.order_row_id) {
        const orderTable = clean(process.env.SUPABASE_ORDERS_TABLE) || "orders";
        const linkedOrder = await updateById(orderTable, reserved.order_row_id, {
          product_id: Number.isSafeInteger(Number(product.id)) ? Number(product.id) : null,
          product_name: product.name, product_url: product.url || null,
          unit_price: product.unitPrice ?? null,
          product_tag: product.tags?.[0] || null,
        });
        orderLinked = !!linkedOrder;
      }
    } catch (error) {
      console.error("Product approved but linking the older order row failed:", error);
    }
    return { request: approved, product, orderLinked };
  } catch (error) {
    // If creating Products succeeded but finishing approval failed, undo that new product.
    if (product?.id) await deleteProduct(product.id).catch(err => console.error("Product approval compensation failed:", err));
    await patchPending(id, { status: "pending", updated_at: new Date().toISOString() }, "processing")
      .catch(err => console.error("Failed to reset incomplete product approval:", err));
    throw error;
  }
}

export async function cancelProductAdditionRequestsForOrderRows(orderRowIds = []) {
  const ids = orderRowIds.map(clean).filter(Boolean);
  if (!ids.length) return;
  for (const orderRowId of ids) {
    const found = await select(table(), { select: "id,status", order_row_id: `eq.${orderRowId}`, limit: "100" });
    const pending = (found || []).filter(row => row.status === "pending");
    if (pending.length) await deleteByIds(table(), pending.map(row => row.id));
  }
}

import "server-only";

import { isSupabaseConfigured, select, selectById } from "./supabase-rest";
import { serializeOperationsOrderDetail } from "./order-details-data";
import { getProductsList } from "./products-service";
import { resolveOrderScope } from "./order-data-scope";
import { canViewMyOrderRow, legacyMyOrderOwnerMatches } from "./my-orders-owner-visibility.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

function normKey(value) {
  return norm(value).replace(/[^a-z0-9]+/g, "");
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}


const TRACKING_ROW_SELECT = [
  "id",
  "order_number",
  "quantity_progress",
  "quantity_requested",
  "quantity_edited_by_supervisor",
  "quantity_received_by_operations",
  "quantity_remaining",
  "status",
  "order_type",
  "sv_approval",
  "team_member_name",
  "team_member_id",
  "person_received_by_operations",
  "spare_parts_replaced",
  "order_receipt",
  "maintenance_receipt",
  "source_proposal_id",
  "source_proposal_name",
  "source_kits",
  "issue_description",
  "reason",
  "product_id",
  "product_name",
  "product_url",
  "unit_price",
  "serial_number",
  "actual_issue_description",
  "repair_action",
  "resolution_method",
  "operations_approval",
  "rejected_reason",
  "receipt_number",
  "notion_created_time",
  "created_at",
  "updated_at",
  "supervisor",
  "product_tag",
  "customize_id",
  "kit_tag",
  "kit_folder",
].join(",");

let trackingProjectionSupported = true;

function accountUsername(account = {}) {
  return text(account?.username || account?.name);
}

async function rowsByOrderNumber(orderNumber, account, resolved = null) {
  const params = {
    order_number: `eq.${Number(orderNumber)}`,
    order: "notion_created_time.desc,id.desc",
    limit: "500",
  };
  let rows = null;
  if (trackingProjectionSupported) {
    try {
      rows = await select(ordersTable(), {
        ...params,
        select: TRACKING_ROW_SELECT,
      }, { profileName: "orders.tracking.rows-compact" });
    } catch {
      trackingProjectionSupported = false;
    }
  }
  if (!Array.isArray(rows)) {
    rows = await select(ordersTable(), {
      ...params,
      select: "*",
    }, { profileName: "orders.tracking.rows-fallback" });
  }
  // The resolver returns {scope: null} for legacy profiles, not `null`.
  // Always enforce ownership, including on a shared/copyable tracking link.
  if (rows.some(row => !canViewMyOrderRow(row, account, resolved))) {
    const error = new Error("Order is outside your permitted tracking scope.");
    error.status = 403;
    throw error;
  }
  return rows;
}

async function rowById(reference) {
  if (trackingProjectionSupported) {
    try {
      return await selectById(ordersTable(), reference, {
        select: TRACKING_ROW_SELECT,
        profileName: "orders.tracking.row-compact",
      });
    } catch {
      trackingProjectionSupported = false;
    }
  }
  return await selectById(ordersTable(), reference, { profileName: "orders.tracking.row-fallback" });
}

async function enrichProducts(items = []) {
  let products = [];
  try {
    products = await getProductsList();
  } catch {
    products = [];
  }

  const byName = new Map();
  const byUrl = new Map();
  for (const product of products) {
    const nameKey = normKey(product?.name);
    const urlKey = norm(product?.url);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, product);
    if (urlKey && !byUrl.has(urlKey)) byUrl.set(urlKey, product);
  }

  return (Array.isArray(items) ? items : []).map((item) => {
    const product = byName.get(normKey(item?.productName)) || byUrl.get(norm(item?.productUrl)) || null;
    return {
      ...item,
      productImage: text(item?.productImage) || text(product?.imageUrl) || null,
      productUrl: text(item?.productUrl) || text(product?.url) || null,
      unitPrice: Number.isFinite(Number(item?.unitPrice))
        ? Number(item.unitPrice)
        : (Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null),
    };
  });
}

export async function loadOrderTracking({ account = {}, groupId = "" } = {}) {
  if (!isSupabaseConfigured()) return null;
  const resolved = await resolveOrderScope(account, "orders.my.view");

  const cleanRef = text(groupId);
  if (!cleanRef) {
    const error = new Error("An order tracking reference is required.");
    error.status = 400;
    throw error;
  }

  const explicitOrder = cleanRef.match(/^ord(?:er)?[:\-]?(\d+)$/i);
  const bareNumber = /^\d+$/.test(cleanRef) ? Number(cleanRef) : null;
  let targetOrderNumber = explicitOrder ? Number(explicitOrder[1]) : null;
  let baseRow = null;
  let groupRows = [];

  // Existing copied links can contain the physical row id. Resolve that first,
  // then use its order_number to fetch the complete order group.
  if (!Number.isFinite(targetOrderNumber)) {
    try {
      const row = await rowById(cleanRef);
      if (row && canViewMyOrderRow(row, account, resolved)) {
        baseRow = row;
        const item = serializeOperationsOrderDetail(row);
        if (Number.isFinite(Number(item?.orderIdNumber))) targetOrderNumber = Number(item.orderIdNumber);
      }
    } catch (error) {
      // A customized schema may reject the id lookup. A numeric reference can
      // still be interpreted as an order number below.
      if (!Number.isFinite(bareNumber)) throw error;
    }
  }

  if (!baseRow && !Number.isFinite(targetOrderNumber) && Number.isFinite(bareNumber)) {
    targetOrderNumber = bareNumber;
  }

  if (Number.isFinite(targetOrderNumber)) {
    groupRows = await rowsByOrderNumber(targetOrderNumber, account, resolved);
    if (!baseRow) baseRow = groupRows[0] || null;
  }

  // A non-numeric id with no matching Supabase row can be an old legacy link.
  // Signal a 404 so the caller can use the established legacy endpoint as a
  // compatibility fallback without scanning the whole orders table here.
  if (!baseRow) {
    const error = new Error("Order not found.");
    error.status = 404;
    throw error;
  }

  if (!groupRows.length) groupRows = [baseRow];
  const serialized = groupRows.map(serializeOperationsOrderDetail);
  const items = await enrichProducts(serialized);
  const base = serializeOperationsOrderDetail(baseRow);

  const allArrived = items.length > 0 && items.every((item) => /(arrived|delivered|received)/i.test(text(item?.status)));
  const stage = allArrived ? 3 : 2;
  const totalQty = items.reduce((sum, item) => sum + finite(item?.quantity), 0);
  const estimateTotal = items.reduce((sum, item) => sum + finite(item?.quantity) * finite(item?.unitPrice), 0);
  const orderNumber = Number.isFinite(Number(targetOrderNumber))
    ? Number(targetOrderNumber)
    : (Number.isFinite(Number(base?.orderIdNumber)) ? Number(base.orderIdNumber) : null);

  return {
    groupId: text(baseRow?.id) || cleanRef,
    requestedGroupId: cleanRef,
    orderId: text(base?.orderId) || (Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : null),
    orderNumber,
    orderType: text(base?.orderType) || null,
    createdByName: text(base?.createdByName) || null,
    reason: text(base?.reason) || "No Reason",
    createdTime: base?.createdTime || null,
    stage,
    headerTitle: stage === 3 ? "Delivered" : "On the way",
    headerSubtitle: stage === 3 ? "Your cargo has arrived." : "Your cargo is on delivery.",
    eta: null,
    totals: { itemsCount: items.length, totalQty, estimateTotal },
    items,
    source: "supabase-next",
  };
}

export const __orderTrackingDataTest = {
  // Keep the previous test-helper shape while removing partial-name matching.
  memberMatches: (createdByName, username) => legacyMyOrderOwnerMatches(
    { team_member_name: createdByName }, { username }),
  normKey,
};

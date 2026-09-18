import "server-only";

import { isSupabaseConfigured, select, selectById } from "./supabase-rest";
import { serializeOperationsOrderDetail } from "./order-details-data";
import { getProductsList } from "./products-service";

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

function accountUsername(account = {}) {
  return text(account?.username || account?.name);
}

function memberMatches(createdByName, username) {
  const user = norm(username);
  const by = norm(createdByName);
  if (!user || !by) return true;
  return by.includes(user) || user.includes(by);
}

function visibleRow(row = {}, account = {}) {
  const item = serializeOperationsOrderDetail(row);
  return memberMatches(item?.createdByName, accountUsername(account));
}

async function rowsByOrderNumber(orderNumber, account) {
  const rows = await select(ordersTable(), {
    select: "*",
    order_number: `eq.${Number(orderNumber)}`,
    order: "notion_created_time.desc,id.desc",
    limit: "500",
  });
  return (Array.isArray(rows) ? rows : []).filter((row) => visibleRow(row, account));
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
      const row = await selectById(ordersTable(), cleanRef);
      if (row && visibleRow(row, account)) {
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
    groupRows = await rowsByOrderNumber(targetOrderNumber, account);
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
  memberMatches,
  normKey,
};

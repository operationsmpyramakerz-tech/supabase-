import "server-only";

import crypto from "node:crypto";
import { sessionSigningSecret } from "./session-signing-secret.mjs";

import {
  deleteByIds,
  insert,
  insertMany,
  isSupabaseConfigured,
  select,
  supabaseRequest,
  updateById,
} from "./supabase-rest";
import { getProductsList } from "./products-service";
import { isCustomCartItem, validateProductAddition } from "./product-addition-request-payload.mjs";
import { requireOrderRequestMetadata } from "./order-request-metadata.mjs";
import { ensureProductAdditionRequestsTable, createProductAdditionRequests, cancelProductAdditionRequestsForOrderRows, findProductAdditionRequestsForOrderRows } from "./product-addition-requests-service";
import { listTeamMembersLite } from "./team-members-service";
import { loadRawOrderRowsByIds } from "./order-details-data";
import { orderActionAllowed } from "./current-shopping-action-permissions.mjs";
import { invalidateLegacyOperationsCaches } from "./operations-orders-data";
import { resolveOrderScope } from "./order-data-scope";
import { canViewMyOrderRow, legacyMyOrderOwnerMatches } from "./my-orders-owner-visibility.mjs";
import { isCompleteOrderSelection } from "./order-action-selection.mjs";

// An edit is a working draft, not a short-lived undo operation. Each submit
// still requires current authentication, action permissions and exact row scope.
const EDIT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const UNDO_TOKEN_TTL_MS = 30 * 1000;

function text(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(text).find(Boolean) || "";
  if (typeof value === "object") return text(value.name || value.value || value.label || value.title || value.email || value.url);
  return String(value).replace(/\u00a0/g, " ").trim();
}

function token(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function numberOrNull(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueFor(row = {}, aliases = []) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row || {}, alias)) return row[alias];
  }
  const wanted = new Set(aliases.map(token).filter(Boolean));
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.has(token(key))) return value;
  }
  return null;
}

function orderTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function orderTypeKey(value) {
  return token(value);
}

function canonicalOrderType(value) {
  const key = orderTypeKey(value);
  if (key === "requestproducts") return "Request Products";
  if (key === "withdrawproducts") return "Withdraw Products";
  if (key === "requestmaintenance") return "Request Maintenance";
  return text(value);
}

function accountMemberId(account = {}) {
  return text(account?.teamMemberId || account?.userSupabaseId || account?.userId || account?.id);
}

function accountUsername(account = {}) {
  return text(account?.username || account?.name);
}

function rowOwnedByAccount(row = {}, account = {}) {
  return legacyMyOrderOwnerMatches(row, account);
}

function cleanIds(value = []) {
  const source = Array.isArray(value) ? value : [value];
  return [...new Set(source.map((id) => text(id)).filter(Boolean))];
}

function directError(message, status = 500, mutationStarted = false) {
  const error = new Error(message || "Shopping Cart order action failed.");
  error.code = "DIRECT_SHOPPING_CART_ORDER_FAILED";
  error.status = Number(status) || 500;
  error.mutationStarted = Boolean(mutationStarted);
  return error;
}

function signingSecret() {
  return sessionSigningSecret();
}

function base64urlJson(payload = {}) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function signPayload(payload = {}) {
  const encoded = base64urlJson(payload);
  const signature = crypto.createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySignedPayload(signedValue = "", expectedScope = "", account = {}) {
  const raw = text(signedValue);
  const splitAt = raw.lastIndexOf(".");
  if (splitAt <= 0) throw directError("The order edit session is invalid. Please reopen the order.", 400);

  const encoded = raw.slice(0, splitAt);
  const signature = raw.slice(splitAt + 1);
  const expected = crypto.createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (!left.length || left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw directError("The order edit session is invalid. Please reopen the order.", 400);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw directError("The order edit session is invalid. Please reopen the order.", 400);
  }

  if (text(payload?.scope) !== expectedScope) throw directError("The order edit session is invalid. Please reopen the order.", 400);
  if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < Date.now()) {
    const message = expectedScope === "undo-order" ? "The undo window for this order has expired." : "Edit session expired. Please reopen the order and try again.";
    throw directError(message, expectedScope === "undo-order" ? 409 : 400);
  }

  const identity = text(payload?.uid);
  const currentIdentity = accountMemberId(account);
  if (!identity || !currentIdentity || identity !== currentIdentity) {
    throw directError("This order action does not belong to the current account.", 403);
  }
  return payload;
}

// Names (including Arabic) are more reliable than shared supplier links on legacy order rows.
function productNameKey(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}
function productMaps(products = []) {
  const byId = new Map();
  const byUrl = new Map();
  const byName = new Map();
  const add = (map, key, product) => {
    if (!key) return;
    const entries = map.get(key) || [];
    if (!entries.some(entry => text(entry.id) === text(product.id))) entries.push(product);
    map.set(key, entries);
  };
  for (const product of Array.isArray(products) ? products : []) {
    const id = text(product?.id);
    if (!id) continue;
    byId.set(id, product);
    add(byUrl, text(product?.url), product);
    add(byName, productNameKey(product?.name), product);
  }
  return { byId, byUrl, byName };
}

function resolveRowProduct(row = {}, maps = {}) {
  const directId = text(valueFor(row, ["product_id", "productId", "product_page_id", "productPageId"]));
  if (directId) return maps.byId?.get(directId) || null;
  const productUrl = text(valueFor(row, ["product_url", "Product URL", "url", "URL"]));
  const nameKey = productNameKey(valueFor(row, ["product_name", "Product Name", "product", "Product"]));
  const names = maps.byName?.get(nameKey) || [];
  if (names.length === 1) return names[0];
  const links = maps.byUrl?.get(productUrl) || [];
  if (names.length > 1) {
    const matches = names.filter(product => links.some(link => text(link.id) === text(product.id)));
    return matches.length === 1 ? matches[0] : null;
  }
  // A named but unmatched row must not silently become a different product.
  return !nameKey && links.length === 1 ? links[0] : null;
}

// Pending catalog requests deliberately have no product_id. Do not match
// them to catalog entries by name or shared supplier URL.
async function pendingRequestsForRows(rows) {
  const ids = rows.filter(row => !text(valueFor(row, ["product_id", "productId", "product_page_id", "productPageId"]))).map(row => text(row.id));
  return ids.length ? await findProductAdditionRequestsForOrderRows(ids) : new Map();
}

function pendingCartItem(row, request) {
  if (request.status !== "pending") throw directError("Catalog review is in progress or the product has not been linked yet. Reopen the order after review.", 409);
  const quantity = Math.abs(rawRequestedQty(row));
  const id = `new:${text(request.id)}`;
  let customProduct;
  try {
    customProduct = validateProductAddition({
      name: request.name, idCode: request.id_code, unitPrice: request.unit_price,
      unit: request.unit, tag: request.tag, url: request.url, imageUrl: request.image_url,
    }, quantity);
  } catch (error) { throw directError(error.message, 409); }
  return { id, customProduct, quantity };
}

// A signed hash of the original database rows prevents a long-lived edit from
// silently replacing another user's already-saved changes. Stable key/row order
// makes the digest independent of PostgREST's JSON serialization order.
function orderEditSnapshot(rows = []) {
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    }
    return value;
  }
  const ordered = [...rows].sort((a, b) => text(a?.id).localeCompare(text(b?.id)));
  return crypto.createHash("sha256").update(JSON.stringify(stable(ordered))).digest("hex");
}

function assertEditSnapshot(signed, rows) {
  // Previously issued 30-minute tokens have no snapshot; keep their original
  // short validity only. All newly issued tokens carry the signed baseline.
  if (signed.snapshot !== undefined && signed.snapshot !== orderEditSnapshot(rows)) {
    throw directError("This order has changed since you opened it. Your draft is still saved. Review the latest order before submitting again.", 409);
  }
}

// Every original order row must be retained or explicitly removed; a missing
// row from an incomplete/stale browser transfer is NEVER an implicit deletion.
function validateEditRowSelection(ids, products, removedOrderRowIds) {
  const expected = new Set(ids);
  const seen = new Set();
  if (!Array.isArray(removedOrderRowIds)) throw directError("Reopen the order before editing. The edit session is incomplete.", 409);
  for (const id of [...products.map(item => text(item?.orderRowId)).filter(Boolean), ...removedOrderRowIds.map(text)]) {
    if (!id || !expected.has(id) || seen.has(id)) throw directError("Invalid or duplicate order component. Reopen the order.", 409);
    seen.add(id);
  }
  if (seen.size !== expected.size) throw directError("Some original order components are missing. Reopen the order before saving.", 409);
}

function rawOrderNumber(row = {}) {
  return numberOrNull(valueFor(row, ["order_number", "Order - ID", "Order ID", "order id"]));
}

function rawOrderType(row = {}) {
  return canonicalOrderType(valueFor(row, ["order_type", "Order Type"]));
}

function rawRequestedQty(row = {}) {
  const requested = numberOrNull(valueFor(row, ["quantity_requested", "Quantity Requested", "requested_quantity", "Requested Quantity"]));
  if (requested !== null) return requested;
  return numberOrNull(valueFor(row, ["quantity_progress", "Quantity Progress", "quantity", "Quantity", "qty", "Qty"])) || 0;
}

function rawCreatedTime(row = {}) {
  return text(valueFor(row, ["notion_created_time", "created_time", "created_at", "Created time"])) || new Date().toISOString();
}

function cleanSubmittedProducts(products = [], orderType = "") {
  const maintenance = orderTypeKey(orderType) === "requestmaintenance";
  const withdraw = orderTypeKey(orderType) === "withdrawproducts";
  const source = Array.isArray(products) ? products : [];
  const clean = source.map((item) => ({
    id: text(item?.id),
    orderRowId: text(item?.orderRowId),
    quantity: maintenance ? 1 : Number(item?.quantity),
    reason: text(item?.reason),
    issueDescription: text(item?.issueDescription),
    schoolId: text(item?.schoolId),
    customProduct: item?.customProduct || null,
  })).filter((item) => item.id && (maintenance || (Number.isFinite(item.quantity) && item.quantity > 0)));

  if (!clean.length) throw directError("Missing products.", 400);
  if (source.length > 150 || clean.length !== source.length) throw directError("Invalid order items or too many products.", 400);
  for (const item of clean) {
    if (item.customProduct) {
      if (maintenance || withdraw || orderTypeKey(orderType) !== "requestproducts" || !isCustomCartItem(item)) {
        throw directError("New components are allowed only in Request Products.", 400);
      }
      try { item.customProduct = validateProductAddition(item.customProduct, item.quantity); }
      catch (error) { throw directError(error.message, 400); }
    } else if (/^new:/i.test(item.id)) {
      throw directError("A new component is missing its details.", 400);
    }
  }
  if (maintenance && clean.length > 1) throw directError("Request Maintenance supports one component only.", 400);
  if (maintenance && clean.some((item) => !item.issueDescription)) {
    throw directError("Each product must include an Issue Description.", 400);
  }
  if (!maintenance && clean.some((item) => !item.reason)) {
    throw directError("Each product must include a reason.", 400);
  }

  return clean.map((item) => {
    const reason = maintenance
      ? (item.reason || item.issueDescription.slice(0, 80) || "Request Maintenance")
      : item.reason;
    const magnitude = maintenance ? 1 : Number(item.quantity);
    return {
      ...item,
      reason,
      quantity: withdraw ? -Math.abs(magnitude) : Math.abs(magnitude),
    };
  });
}

async function nextOrderNumber() {
  const rows = await select(orderTable(), {
    select: "order_number",
    order: "order_number.desc",
    limit: "1",
  }, { profileName: "orders.shopping-cart.next-number" });
  const current = Array.isArray(rows) && rows[0] ? numberOrNull(rows[0]?.order_number) : null;
  return Number.isFinite(current) ? current + 1 : 1;
}

function rowResponse(row = {}, productId = "") {
  const orderNumber = rawOrderNumber(row);
  const id = text(valueFor(row, ["id", "ID"]));
  const type = rawOrderType(row);
  return {
    id,
    reason: text(valueFor(row, ["reason", "Reason"])) || "No Reason",
    productName: text(valueFor(row, ["product_name", "Product Name"])) || "Unknown Product",
    productPageId: text(productId || valueFor(row, ["product_id", "productId"])) || null,
    quantity: rawRequestedQty(row),
    status: text(valueFor(row, ["status", "Status"])) || "Under Supervision",
    createdTime: rawCreatedTime(row),
    orderId: Number.isFinite(orderNumber) ? `ORD-${orderNumber}` : (id ? `ORD-${id}` : null),
    orderIdPrefix: Number.isFinite(orderNumber) ? "ORD" : null,
    orderIdNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    orderType: type || null,
  };
}

async function verifyOwnedRows(ids = [], account = {}, { undo = false } = {}) {
  const rows = await loadRawOrderRowsByIds(ids);
  if (!Array.isArray(rows) || rows.length !== ids.length) throw directError("Orders not found.", 404);
  const byId = new Map(rows.map((row) => [text(row?.id), row]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  if (ordered.length !== ids.length) throw directError("Orders not found.", 404);
  const scoped = undo ? null : await resolveOrderScope(account, "orders.my.edit");
  if (ordered.some(row => undo ? !rowOwnedByAccount(row, account) : !canViewMyOrderRow(row, account, scoped))) {
    throw directError("Order is outside your permitted edit scope.", 403);
  }
  if (!undo) {
    const numbers = [...new Set(ordered.map(row => text(row?.order_number)))];
    if (numbers.length !== 1 || !/^\d+$/.test(numbers[0])) throw directError("Select one complete order.", 409);
    const allRows = await select(orderTable(), { select: "id,order_number", order_number: `eq.${numbers[0]}`, limit: "501" });
    if (!isCompleteOrderSelection(ids, ordered, allRows, { maxRows: 501 })) throw directError("Order components have changed. Refresh and select the complete order.", 409);
  }
  return ordered;
}

export async function initializeCurrentOrderEditDirect({
  account = {},
  orderIds = [],
} = {}) {
  if (!isSupabaseConfigured()) return null;
  if (!orderActionAllowed(account, "orders.my.edit")) throw directError("Permission orders.my.edit is not allowed.", 403);

  const ids = cleanIds(orderIds);
  if (!ids.length || ids.length > 500) throw directError("Invalid order component count.", 400);
  if (!ids.every((id) => /^\d+$/.test(id))) return null;

  const [rows, products] = await Promise.all([
    verifyOwnedRows(ids, account),
    getProductsList({ fresh: true }),
  ]);
  const maps = productMaps(products);
  const pending = await pendingRequestsForRows(rows);
  const draft = [];
  let orderType = "";
  let orderNumber = null;

  for (const row of rows) {
    const pendingRequest = pending.get(text(row.id));
    const pendingItem = pendingRequest ? pendingCartItem(row, pendingRequest) : null;
    const product = pendingItem || resolveRowProduct(row, maps);
    if (!product?.id) continue;
    if (!orderType) orderType = rawOrderType(row);
    if (!Number.isFinite(orderNumber)) orderNumber = rawOrderNumber(row);
    draft.push({
      id: text(product.id),
      orderRowId: text(row.id),
      quantity: Math.abs(rawRequestedQty(row)) || 1,
      ...(pendingItem ? { customProduct: pendingItem.customProduct } : {}),
      reason: text(valueFor(row, ["reason", "Reason"])),
      issueDescription: text(valueFor(row, ["issue_description", "Issue Description"])),
      schoolId: "",
      expectedSparePartId: "",
    });
  }

  if (rows.length !== draft.length) throw directError("Some order components could not be uniquely matched to Products. Check their Product ID or name before editing. No components were changed.", 409);
  if (!draft.length) throw directError("No editable products found for this order.", 400);
  if (!orderType) {
    if (draft.some((item) => item.issueDescription)) orderType = "Request Maintenance";
    else if (rows.some((row) => rawRequestedQty(row) < 0)) orderType = "Withdraw Products";
    else orderType = "Request Products";
  }

  const reason = text(draft.find((item) => item.reason)?.reason);
  const priorityLevel = text(valueFor(rows[0], ["priority_level", "Priority Level"])) || "Normal";
  const requestedDeliveryDate = text(valueFor(rows[0], ["requested_delivery_date", "Requested Delivery Date"])).slice(0, 10);
  const uid = accountMemberId(account);
  const editToken = signPayload({
    scope: "edit-order",
    uid,
    ids,
    orderNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    orderType: canonicalOrderType(orderType),
    snapshot: orderEditSnapshot(rows),
    exp: Date.now() + EDIT_TOKEN_TTL_MS,
  });

  return {
    ok: true,
    source: "supabase-direct",
    count: draft.length,
    orderType: canonicalOrderType(orderType),
    reason,
    priorityLevel,
    requestedDeliveryDate,
    products: draft,
    editToken,
  };
}

async function createNewOrderDirect({ account = {}, products = [], orderType = "", priorityLevel = "", requestedDeliveryDate = null } = {}) {
  const finalType = canonicalOrderType(orderType);
  let requestMetadata = { priorityLevel: null, requestedDeliveryDate: null };
  if (orderTypeKey(finalType) !== "requestmaintenance") {
    try { requestMetadata = requireOrderRequestMetadata({ priorityLevel, requestedDeliveryDate }); }
    catch (error) { throw directError(error.message, 400); }
  }
  const cleanProducts = cleanSubmittedProducts(products, finalType);
  const catalog = await getProductsList({ fresh: true });
  const maps = productMaps(catalog);
  const unknown = cleanProducts.find((item) => !item.customProduct && !maps.byId.has(item.id));
  if (unknown) throw directError("One or more selected products no longer exist.", 400);
  if (cleanProducts.some((item) => item.customProduct)) await ensureProductAdditionRequestsTable();

  const orderNumber = await nextOrderNumber();
  const now = new Date().toISOString();
  const creatorName = accountUsername(account) || null;
  const rows = cleanProducts.map((item) => {
    const product = item.customProduct
      ? { name: item.customProduct.name, unitPrice: item.customProduct.unitPrice,
          url: item.customProduct.url, tags: item.customProduct.tag ? [item.customProduct.tag] : [] }
      : (maps.byId.get(item.id) || {});
    return {
      reason: item.reason || null,
      ...(orderTypeKey(finalType) !== "requestmaintenance" ? {
        priority_level: requestMetadata.priorityLevel,
        requested_delivery_date: requestMetadata.requestedDeliveryDate,
      } : {}),
      order_number: orderNumber,
      order_type: finalType || null,
      notion_created_time: now,
      product_id: item.customProduct ? null : item.id,
      product_name: text(product?.name) || item.id,
      product_url: text(product?.url) || null,
      unit_price: product?.unitPrice === null || product?.unitPrice === undefined ? null : (Number.isFinite(Number(product.unitPrice)) ? Number(product.unitPrice) : null),
      quantity_requested: item.quantity,
      quantity_progress: item.quantity,
      quantity_received_by_operations: 0,
      quantity_remaining: item.quantity,
      status: "Under Supervision",
      sv_approval: null,
      product_tag: Array.isArray(product?.tags) ? (product.tags.map(text).find(Boolean) || null) : null,
      kit_tag: null,
      // Bind new orders to the verified account, not a mutable display name.
      team_member_id: accountMemberId(account) || null,
      team_member_name: creatorName,
      issue_description: item.issueDescription || null,
      supervisor: null,
      person_received_by_operations: null,
    };
  });

  let created;
  let mutationStarted = false;
  try {
    mutationStarted = true;
    created = await insertMany(orderTable(), rows);
    if (cleanProducts.some((item) => item.customProduct)) {
      try {
        await createProductAdditionRequests(cleanProducts, created, account, orderNumber);
      } catch (requestError) {
        const createdIds = (Array.isArray(created) ? created : []).map((row) => text(row?.id)).filter(Boolean);
        if (createdIds.length) {
          try { await deleteByIds(orderTable(), createdIds); }
          catch (rollbackError) { console.error("Failed to roll back order after product-request error:", rollbackError); }
        }
        throw requestError;
      }
    }
  } catch (error) {
    throw directError(error?.message || "Failed to save order to Supabase.", Number(error?.status) || 500, mutationStarted);
  }

  const createdRows = Array.isArray(created) ? created : [];
  if (!createdRows.length) throw directError("Failed to save order to Supabase.", 500, true);
  await invalidateLegacyOperationsCaches(account).catch(() => {});

  const items = createdRows.map((row, index) => rowResponse(row, cleanProducts[index]?.customProduct ? "" : cleanProducts[index]?.id));
  const uid = accountMemberId(account);
  const ids = items.map((item) => item.id).filter(Boolean);
  const undoToken = signPayload({
    scope: "undo-order",
    uid,
    ids,
    orderId: `ORD-${orderNumber}`,
    exp: Date.now() + UNDO_TOKEN_TTL_MS,
  });

  return {
    success: true,
    message: "Order submitted and saved to Supabase successfully!",
    source: "supabase-direct",
    orderId: `ORD-${orderNumber}`,
    orderNumber,
    orderType: finalType || null,
    nextStatusStep: "Waiting for approval",
    undoToken,
    orderItems: items.map((item) => ({
      orderPageId: item.id,
      productId: item.productPageId,
      orderId: item.orderId,
    })),
  };
}

async function updateExistingOrderDirect({ account = {}, products = [], orderType = "", priorityLevel = "", requestedDeliveryDate = null, editToken = "", removedOrderRowIds } = {}) {
  const signed = verifySignedPayload(editToken, "edit-order", account);
  const ids = cleanIds(signed?.ids);
  if (!ids.length || ids.length > 500 || !ids.every((id) => /^\d+$/.test(id))) throw directError("Edit session expired. Please reopen the order and try again.", 400);

  const rows = await verifyOwnedRows(ids, account);
  assertEditSnapshot(signed, rows);
  validateEditRowSelection(ids, Array.isArray(products) ? products : [], removedOrderRowIds);
  const originalType = canonicalOrderType(signed?.orderType || rawOrderType(rows[0]));
  const finalType = canonicalOrderType(orderType || originalType);
  if (orderTypeKey(finalType) !== orderTypeKey(originalType)) throw directError("The order type cannot be changed in edit mode.", 409);
  let requestMetadata = { priorityLevel: null, requestedDeliveryDate: null };
  if (orderTypeKey(finalType) !== "requestmaintenance") {
    try { requestMetadata = requireOrderRequestMetadata({ priorityLevel, requestedDeliveryDate }); }
    catch (error) { throw directError(error.message, 400); }
  }
  const cleanProducts = cleanSubmittedProducts(products, finalType);
  const catalog = await getProductsList({ fresh: true });
  const maps = productMaps(catalog);
  const pending = await pendingRequestsForRows(rows);
  const originals = new Map(rows.map(row => [text(row.id), row]));
  // Already submitted requests belong to the catalog review workflow. Keep
  // them intact, including their quantity, until a reviewer links the product.
  for (const [rowId, request] of pending) {
    const item = cleanProducts.find(entry => entry.orderRowId === rowId);
    const original = pendingCartItem(originals.get(rowId), request);
    if (!item || item.id !== original.id || !item.customProduct || item.quantity !== original.quantity ||
        Object.keys(original.customProduct).some(key => item.customProduct[key] !== original.customProduct[key])) {
      throw directError("A pending catalog component cannot be changed or removed here. Wait for catalog review and reopen the order.", 409);
    }
  }
  if (cleanProducts.some(item => item.customProduct && item.orderRowId && !pending.has(item.orderRowId))) {
    throw directError("A component has changed during catalog review. Reopen the order before saving.", 409);
  }
  const unknown = cleanProducts.find((item) => !item.customProduct && !maps.byId.has(item.id));
  if (unknown) throw directError("One or more selected products no longer exist.", 400);
  const additions = cleanProducts.filter(item => item.customProduct && !item.orderRowId);
  if (new Set(additions.map(item => item.id)).size !== additions.length) throw directError("Duplicate new component request.", 400);
  if (additions.length) await ensureProductAdditionRequestsTable();

  const orderNumber = Number.isFinite(Number(signed?.orderNumber))
    ? Number(signed.orderNumber)
    : (rawOrderNumber(rows[0]) ?? await nextOrderNumber());
  const currentStatus = text(valueFor(rows[0], ["status", "Status"])) || "Under Supervision";
  const currentApproval = text(valueFor(rows[0], ["sv_approval", "S.V Approval", "SV Approval"])) || null;
  const currentTeamMemberId = text(valueFor(rows[0], ["team_member_id", "team_members_id", "created_by_id", "owner_id"])) || null;
  const currentTeamMemberName = text(valueFor(rows[0], ["team_member_name", "Teams Members", "teams_members", "created_by_name", "created_by", "Created By"])) || accountUsername(account) || null;
  const createdTime = rawCreatedTime(rows[0]);
  // Catalog lookup can take time; re-read authorization and rows immediately
  // before the first mutation as well. No stale draft is silently rebased.
  if (signed.snapshot !== undefined) assertEditSnapshot(signed, await verifyOwnedRows(ids, account));
  const updated = [];
  let mutationStarted = false;

  try {
    // Insert new custom rows and link their requests BEFORE touching existing
    // rows. A failed request insert rolls back these new rows, not the order.
    if (additions.length) {
      const newRows = [];
      try {
        mutationStarted = true;
        for (const item of additions) {
          const custom = item.customProduct;
          const row = await insert(orderTable(), {
            reason: item.reason || null,
            priority_level: requestMetadata.priorityLevel,
            requested_delivery_date: requestMetadata.requestedDeliveryDate,
            order_number: orderNumber, order_type: finalType,
            notion_created_time: createdTime,
            product_id: null, product_name: custom.name, product_url: custom.url,
            unit_price: custom.unitPrice, product_tag: custom.tag, kit_tag: null,
            quantity_requested: item.quantity, quantity_progress: item.quantity,
            quantity_received_by_operations: 0, quantity_remaining: item.quantity,
            status: "Under Supervision", sv_approval: null,
            team_member_id: currentTeamMemberId, team_member_name: currentTeamMemberName,
            issue_description: null, supervisor: null, person_received_by_operations: null,
          });
          if (!text(row?.id)) throw directError("Could not create the new component order row.", 500);
          newRows.push(row);
        }
        await createProductAdditionRequests(additions, newRows, account, orderNumber);
      } catch (error) {
        const createdIds = newRows.map(row => text(row.id));
        if (createdIds.length) {
          // Best effort compensation, matching normal cart submission.
          try {
            await cancelProductAdditionRequestsForOrderRows(createdIds);
            await deleteByIds(orderTable(), createdIds);
          } catch (rollbackError) { console.error("Failed to roll back new edit components:", rollbackError); }
        }
        throw error;
      }
      updated.push(...newRows.map(row => ({ row, productId: "" })));
    }
    for (const item of cleanProducts) {
      if (item.customProduct) {
        if (item.orderRowId) {
          // Update only shared order metadata, never overwrite catalog data or
          // status while a reviewer may be working on the pending request.
          mutationStarted = true;
          const row = await updateById(orderTable(), item.orderRowId, {
            reason: item.reason || null,
            priority_level: requestMetadata.priorityLevel,
            requested_delivery_date: requestMetadata.requestedDeliveryDate,
          });
          updated.push({ row, productId: "" });
        }
        continue;
      }
      const product = maps.byId.get(item.id) || {};
      const match = item.orderRowId ? { rowId: item.orderRowId } : null;
      const original = match ? originals.get(match.rowId) : null;
      // Adding a component must not reset the received/progress quantities of
      // unchanged original components (including legacy rows resolved by name).
      const unchanged = original && text(resolveRowProduct(original, maps)?.id) === item.id && rawRequestedQty(original) === item.quantity;
      const patch = {
        reason: item.reason || null,
        ...(orderTypeKey(finalType) !== "requestmaintenance" ? {
          priority_level: requestMetadata.priorityLevel,
          requested_delivery_date: requestMetadata.requestedDeliveryDate,
        } : {}),
        order_number: orderNumber,
        order_type: finalType || null,
        product_id: item.id,
        product_name: text(product?.name) || item.id,
        product_url: text(product?.url) || null,
        unit_price: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null,
        quantity_requested: item.quantity,
        ...(unchanged ? {} : {
          quantity_progress: item.quantity,
          quantity_received_by_operations: 0,
          quantity_remaining: item.quantity,
        }),
        issue_description: item.issueDescription || null,
        status: match ? (text(valueFor(originals.get(match.rowId), ["status", "Status"])) || currentStatus) : currentStatus,
        sv_approval: match ? (text(valueFor(originals.get(match.rowId), ["sv_approval", "S.V Approval", "SV Approval"])) || null) : currentApproval,
        team_member_id: currentTeamMemberId,
        team_member_name: currentTeamMemberName,
      };

      mutationStarted = true;
      if (match?.rowId) {
        updated.push({ row: await updateById(orderTable(), match.rowId, patch), productId: item.id });
      } else {
        updated.push({
          row: await insert(orderTable(), {
            ...patch,
            notion_created_time: createdTime,
            supervisor: null,
            person_received_by_operations: null,
          }),
          productId: item.id,
        });
      }
    }

    for (const rowId of removedOrderRowIds.map(text)) {
      await updateById(orderTable(), rowId, { status: "Archive" });
    }
  } catch (error) {
    throw directError(error?.message || "Failed to update order in Supabase.", Number(error?.status) || 500, mutationStarted);
  }

  await invalidateLegacyOperationsCaches(account).catch(() => {});
  const items = updated.map((entry) => rowResponse(entry.row || {}, entry.productId));
  return {
    success: true,
    message: "Order updated in Supabase successfully!",
    source: "supabase-direct",
    orderId: `ORD-${orderNumber}`,
    orderNumber,
    orderType: finalType || null,
    nextStatusStep: "Waiting for approval",
    orderItems: items.map((item) => ({
      orderPageId: item.id,
      productId: item.productPageId,
      orderId: item.orderId,
    })),
  };
}

export async function submitShoppingCartOrderDirect({
  account = {},
  products = [],
  orderType = "",
  priorityLevel = "",
  requestedDeliveryDate = null,
  editMode = false,
  editToken = "",
  removedOrderRowIds,
} = {}) {
  const key = editMode ? "orders.shopping.edit_submit" : "orders.shopping.submit";
  if (!orderActionAllowed(account, key) || (editMode && !orderActionAllowed(account, "orders.my.edit"))) throw directError("Order submission is not permitted.", 403);
  if (!isSupabaseConfigured()) return null;
  if (editMode) {
    if (!text(editToken)) return null;
    return await updateExistingOrderDirect({ account, products, orderType, priorityLevel, requestedDeliveryDate, editToken, removedOrderRowIds });
  }
  return await createNewOrderDirect({ account, products, orderType, priorityLevel, requestedDeliveryDate });
}

export async function undoShoppingCartOrderDirect({ account = {}, undoToken = "" } = {}) {
  if (!orderActionAllowed(account, "orders.shopping.undo")) throw directError("Permission orders.shopping.undo is not allowed.", 403);
  if (!isSupabaseConfigured() || !text(undoToken)) return null;
  const signed = verifySignedPayload(undoToken, "undo-order", account);
  const ids = cleanIds(signed?.ids);
  if (!ids.length || ids.length > 500 || !ids.every((id) => /^\d+$/.test(id))) throw directError("This order is no longer available to undo.", 404);
  await verifyOwnedRows(ids, account, { undo: true });

  let deleted;
  try {
    deleted = await deleteByIds(orderTable(), ids);
  } catch (error) {
    throw directError(error?.message || "Failed to undo order.", Number(error?.status) || 500, true);
  }
  await cancelProductAdditionRequestsForOrderRows(ids).catch(error => console.error("Could not cancel pending product addition requests:", error));
  await invalidateLegacyOperationsCaches(account).catch(() => {});
  return {
    success: true,
    deleted: Array.isArray(deleted) ? deleted.length : ids.length,
    orderId: text(signed?.orderId) || null,
    source: "supabase-direct",
  };
}

export const __shoppingCartOrderServiceTest = {
  canonicalOrderType,
  cleanSubmittedProducts,
  rowOwnedByAccount,
};


function proposalSourceKits(value) {
  const raw = Array.isArray(value) ? value : (() => {
    if (!value || typeof value !== "string") return [];
    try { return JSON.parse(value); } catch { return []; }
  })();
  return (Array.isArray(raw) ? raw : [])
    .map((source, index) => ({
      kitId: text(source?.kitId || source?.kit_id || source?.id),
      kitName: text(source?.kitName || source?.kit_name || source?.name),
      quantity: Math.max(1, Math.round(Number(source?.quantity || source?.qty) || 1)),
      order: Number.isFinite(Number(source?.order)) ? Number(source.order) : index,
    }))
    .filter((source) => source.kitId || source.kitName);
}

function primaryProposalSourceKit(value) {
  const sources = proposalSourceKits(value);
  if (!sources.length) return null;
  return sources.slice().sort((a, b) =>
    (Number(b.quantity || 0) - Number(a.quantity || 0)) || (Number(a.order || 0) - Number(b.order || 0))
  )[0] || null;
}

async function insertOrderRowsSafe(rows = []) {
  let payload = (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === "object").map((row) => ({ ...row }));
  if (!payload.length) return { count: 0, removedColumns: [] };
  const removedColumns = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await supabaseRequest(`/${encodeURIComponent(orderTable())}`, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: payload,
        timeoutMs: 45_000,
        profileName: "orders.proposal-create-batch",
      });
      return { count: payload.length, removedColumns };
    } catch (error) {
      const message = [error?.message, error?.details?.message, error?.details?.details, error?.details?.hint]
        .filter(Boolean).join(" ");
      const missing =
        (message.match(/Could not find the ['\"]([^'\"]+)['\"] column/i) || [])[1] ||
        (message.match(/column ['\"]([^'\"]+)['\"]/i) || [])[1] ||
        "";
      if (!missing || !payload.some((row) => Object.prototype.hasOwnProperty.call(row, missing))) throw error;
      payload = payload.map((row) => {
        const next = { ...row };
        delete next[missing];
        return next;
      });
      removedColumns.push(missing);
    }
  }
  throw directError(`Failed to create order after removing unsupported column(s): ${removedColumns.join(", ")}`, 500, true);
}

export async function createOrderFromProposalDirect({
  account = {},
  proposal = {},
  items = [],
  teamMemberId = "",
} = {}) {
  if (!isSupabaseConfigured()) return null;
  const memberId = text(teamMemberId);
  if (!memberId) throw directError("Team member is required.", 400);
  const proposalId = text(proposal?.id);
  if (!proposalId) throw directError("Proposal ID is required.", 400);
  const proposalName = text(proposal?.name) || "Proposal";
  const proposalItems = Array.isArray(items) ? items : [];
  if (!proposalItems.length) throw directError("This proposal has no components yet.", 400);

  const [members, products] = await Promise.all([
    listTeamMembersLite({ fresh: true }),
    getProductsList({ fresh: true }),
  ]);
  const member = (members || []).find((entry) => text(entry?.id) === memberId);
  if (!member) throw directError("Team member not found.", 404);
  const productMap = new Map((products || []).map((product) => [text(product?.id), product]).filter(([id]) => Boolean(id)));
  const missing = proposalItems.find((item) => !productMap.has(text(item?.productId)));
  if (missing) throw directError("One or more proposal components no longer exist in Products.", 400);

  const orderNumber = await nextOrderNumber();
  const now = new Date().toISOString();
  const creatorName = accountUsername(account) || null;
  const creatorId = accountMemberId(account) || null;
  const rows = proposalItems.map((item) => {
    const productId = text(item?.productId);
    const product = productMap.get(productId) || {};
    const qty = Math.max(1, Math.round(Number(item?.quantity) || 1));
    const primaryKit = primaryProposalSourceKit(item?.sourceKits || item?.source_kits);
    const numericProductId = Number(productId);
    return {
      reason: "Generated from Proposal",
      order_number: orderNumber,
      order_type: "Request Products",
      notion_created_time: now,
      product_id: Number.isFinite(numericProductId) ? numericProductId : null,
      product_name: text(product?.name) || text(item?.productName) || "Unknown Product",
      product_url: text(product?.url) || null,
      unit_price: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null,
      quantity_requested: qty,
      quantity_progress: qty,
      quantity_received_by_operations: 0,
      quantity_remaining: qty,
      status: "In Progress",
      sv_approval: "Approved",
      product_tag: Array.isArray(product?.tags) ? (product.tags.map(text).find(Boolean) || null) : null,
      kit_tag: text(primaryKit?.kitName) || null,
      source_proposal_id: proposalId,
      source_proposal_name: proposalName,
      source_kits: proposalSourceKits(item?.sourceKits || item?.source_kits),
      team_member_id: member.id || memberId,
      team_member_name: member.name || null,
      issue_description: `Created from proposal: ${proposalName}`,
      supervisor: null,
      person_received_by_operations: null,
      created_by_name: creatorName,
      created_by_id: creatorId,
    };
  });

  let inserted;
  try {
    inserted = await insertOrderRowsSafe(rows);
  } catch (error) {
    if (error?.code === "DIRECT_SHOPPING_CART_ORDER_FAILED") throw error;
    throw directError(error?.message || "Failed to create order from proposal.", Number(error?.status) || 500, true);
  }
  await invalidateLegacyOperationsCaches(account).catch(() => {});
  return {
    success: true,
    source: "supabase-direct",
    orderNumber,
    orderId: `ORD-${orderNumber}`,
    count: inserted.count,
    member,
  };
}

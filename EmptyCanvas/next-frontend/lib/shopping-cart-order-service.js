import "server-only";

import crypto from "node:crypto";

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
import { listTeamMembersLite } from "./team-members-service";
import { loadRawOrderRowsByIds } from "./order-details-data";
import { directPageMutationAccess, verifyPageAdminPasswordDirect } from "./order-action-auth";
import { invalidateLegacyOperationsCaches } from "./operations-orders-data";

const EDIT_TOKEN_TTL_MS = 30 * 60 * 1000;
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

function identityKey(value) {
  return text(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
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

function sameOwnerName(left, right) {
  const a = token(left);
  const b = token(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function rowOwnedByAccount(row = {}, account = {}) {
  const memberId = accountMemberId(account);
  const username = accountUsername(account);
  const ownerId = text(valueFor(row, ["team_member_id", "team_members_id", "created_by_id", "owner_id"]));
  const ownerName = text(valueFor(row, ["team_member_name", "Teams Members", "teams_members", "created_by_name", "created_by", "Created By"]));

  if (ownerId && memberId) return ownerId === memberId;
  if (ownerName && username) return sameOwnerName(ownerName, username);
  // Historical imported rows did not always contain an owner id/name. The
  // Current Orders read path already treats those rows as visible, so keep the
  // same compatibility behavior here rather than making them impossible to edit.
  return !ownerId && !ownerName;
}

function cleanIds(value = []) {
  const source = Array.isArray(value) ? value : [value];
  return [...new Set(source.map((id) => text(id)).filter(Boolean))].slice(0, 500);
}

function directError(message, status = 500, mutationStarted = false) {
  const error = new Error(message || "Shopping Cart order action failed.");
  error.code = "DIRECT_SHOPPING_CART_ORDER_FAILED";
  error.status = Number(status) || 500;
  error.mutationStarted = Boolean(mutationStarted);
  return error;
}

function signingSecret() {
  return String(process.env.SESSION_SECRET || "dev-fallback-secret");
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
  const currentIdentity = identityKey(accountUsername(account)) || accountMemberId(account);
  if (!identity || !currentIdentity || identity !== currentIdentity) {
    throw directError("This order action does not belong to the current account.", 403);
  }
  return payload;
}

function productMaps(products = []) {
  const byId = new Map();
  const byUrl = new Map();
  const byName = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const id = text(product?.id);
    const url = text(product?.url);
    const nameKey = token(product?.name);
    if (id) byId.set(id, product);
    if (url && !byUrl.has(url)) byUrl.set(url, product);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, product);
  }
  return { byId, byUrl, byName };
}

function resolveRowProduct(row = {}, maps = {}) {
  const directId = text(valueFor(row, ["product_id", "productId", "product_page_id", "productPageId"]));
  if (directId && maps.byId?.has(directId)) return maps.byId.get(directId);
  const productUrl = text(valueFor(row, ["product_url", "Product URL", "url", "URL"]));
  if (productUrl && maps.byUrl?.has(productUrl)) return maps.byUrl.get(productUrl);
  const nameKey = token(valueFor(row, ["product_name", "Product Name", "product", "Product"]));
  if (nameKey && maps.byName?.has(nameKey)) return maps.byName.get(nameKey);
  return null;
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
    quantity: maintenance ? 1 : Number(item?.quantity),
    reason: text(item?.reason),
    issueDescription: text(item?.issueDescription),
    schoolId: text(item?.schoolId),
  })).filter((item) => item.id && (maintenance || (Number.isFinite(item.quantity) && item.quantity > 0)));

  if (!clean.length) throw directError("Missing products.", 400);
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

async function verifyOwnedRows(ids = [], account = {}) {
  const rows = await loadRawOrderRowsByIds(ids);
  if (!Array.isArray(rows) || rows.length !== ids.length) throw directError("Orders not found.", 404);
  const byId = new Map(rows.map((row) => [text(row?.id), row]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  if (ordered.length !== ids.length) throw directError("Orders not found.", 404);
  if (ordered.some((row) => !rowOwnedByAccount(row, account))) {
    throw directError("This order does not belong to the current account.", 403);
  }
  return ordered;
}

export async function initializeCurrentOrderEditDirect({
  account = {},
  orderIds = [],
  adminPassword = "",
} = {}) {
  if (!isSupabaseConfigured()) return null;
  const access = directPageMutationAccess(account, "Current Orders");
  if (access === null) return null;
  if (!access) throw directError("Edit access is required for this action.", 403);

  const ids = cleanIds(orderIds);
  if (!ids.length) throw directError("orderIds required", 400);
  if (!ids.every((id) => /^\d+$/.test(id))) return null;

  const password = text(adminPassword);
  if (!password) throw directError("adminPassword required", 400);
  const passwordOk = await verifyPageAdminPasswordDirect(account, password, "Current Orders");
  if (passwordOk === null) return null;
  if (!passwordOk) throw directError("Invalid admin password", 401);

  const [rows, products] = await Promise.all([
    verifyOwnedRows(ids, account),
    getProductsList({ fresh: true }),
  ]);
  const maps = productMaps(products);
  const draft = [];
  let orderType = "";
  let orderNumber = null;

  for (const row of rows) {
    const product = resolveRowProduct(row, maps);
    if (!product?.id) continue;
    if (!orderType) orderType = rawOrderType(row);
    if (!Number.isFinite(orderNumber)) orderNumber = rawOrderNumber(row);
    draft.push({
      id: text(product.id),
      quantity: Math.abs(rawRequestedQty(row)) || 1,
      reason: text(valueFor(row, ["reason", "Reason"])),
      issueDescription: text(valueFor(row, ["issue_description", "Issue Description"])),
      schoolId: "",
      expectedSparePartId: "",
    });
  }

  if (!draft.length) throw directError("No editable products found for this order.", 400);
  if (!orderType) {
    if (draft.some((item) => item.issueDescription)) orderType = "Request Maintenance";
    else if (rows.some((row) => rawRequestedQty(row) < 0)) orderType = "Withdraw Products";
    else orderType = "Request Products";
  }

  const reason = text(draft.find((item) => item.reason)?.reason);
  const uid = identityKey(accountUsername(account)) || accountMemberId(account);
  const editToken = signPayload({
    scope: "edit-order",
    uid,
    ids,
    orderNumber: Number.isFinite(orderNumber) ? orderNumber : null,
    orderType: canonicalOrderType(orderType),
    exp: Date.now() + EDIT_TOKEN_TTL_MS,
  });

  return {
    ok: true,
    source: "supabase-direct",
    count: draft.length,
    orderType: canonicalOrderType(orderType),
    reason,
    products: draft,
    editToken,
  };
}

async function createNewOrderDirect({ account = {}, products = [], orderType = "" } = {}) {
  const finalType = canonicalOrderType(orderType);
  const cleanProducts = cleanSubmittedProducts(products, finalType);
  const catalog = await getProductsList({ fresh: true });
  const maps = productMaps(catalog);
  const unknown = cleanProducts.find((item) => !maps.byId.has(item.id));
  if (unknown) throw directError("One or more selected products no longer exist.", 400);

  const orderNumber = await nextOrderNumber();
  const now = new Date().toISOString();
  const creatorName = accountUsername(account) || null;
  const rows = cleanProducts.map((item) => {
    const product = maps.byId.get(item.id) || {};
    return {
      reason: item.reason || null,
      order_number: orderNumber,
      order_type: finalType || null,
      notion_created_time: now,
      product_name: text(product?.name) || item.id,
      product_url: text(product?.url) || null,
      unit_price: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null,
      quantity_requested: item.quantity,
      quantity_progress: item.quantity,
      quantity_received_by_operations: 0,
      quantity_remaining: item.quantity,
      status: "Under Supervision",
      sv_approval: null,
      product_tag: Array.isArray(product?.tags) ? (product.tags.map(text).find(Boolean) || null) : null,
      kit_tag: null,
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
  } catch (error) {
    throw directError(error?.message || "Failed to save order to Supabase.", Number(error?.status) || 500, mutationStarted);
  }

  const createdRows = Array.isArray(created) ? created : [];
  if (!createdRows.length) throw directError("Failed to save order to Supabase.", 500, true);
  await invalidateLegacyOperationsCaches(account).catch(() => {});

  const items = createdRows.map((row, index) => rowResponse(row, cleanProducts[index]?.id));
  const uid = identityKey(accountUsername(account)) || accountMemberId(account);
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

async function updateExistingOrderDirect({ account = {}, products = [], orderType = "", editToken = "" } = {}) {
  const signed = verifySignedPayload(editToken, "edit-order", account);
  const ids = cleanIds(signed?.ids);
  if (!ids.length || !ids.every((id) => /^\d+$/.test(id))) throw directError("Edit session expired. Please reopen the order and try again.", 400);

  const rows = await verifyOwnedRows(ids, account);
  const finalType = canonicalOrderType(orderType || signed?.orderType || rawOrderType(rows[0]));
  const cleanProducts = cleanSubmittedProducts(products, finalType);
  const catalog = await getProductsList({ fresh: true });
  const maps = productMaps(catalog);
  const unknown = cleanProducts.find((item) => !maps.byId.has(item.id));
  if (unknown) throw directError("One or more selected products no longer exist.", 400);

  const rowById = new Map(rows.map((row) => [text(row?.id), row]));
  const unused = ids.map((id) => {
    const row = rowById.get(id);
    const product = resolveRowProduct(row, maps);
    return { rowId: id, productId: text(product?.id) };
  });
  const orderNumber = Number.isFinite(Number(signed?.orderNumber))
    ? Number(signed.orderNumber)
    : (rawOrderNumber(rows[0]) ?? await nextOrderNumber());
  const currentStatus = text(valueFor(rows[0], ["status", "Status"])) || "Under Supervision";
  const currentApproval = text(valueFor(rows[0], ["sv_approval", "S.V Approval", "SV Approval"])) || null;
  const currentTeamMemberId = text(valueFor(rows[0], ["team_member_id", "team_members_id", "created_by_id", "owner_id"])) || null;
  const currentTeamMemberName = text(valueFor(rows[0], ["team_member_name", "Teams Members", "teams_members", "created_by_name", "created_by", "Created By"])) || accountUsername(account) || null;
  const createdTime = rawCreatedTime(rows[0]);
  const usedIds = new Set();
  const updated = [];
  let mutationStarted = false;

  const takeMatch = (productId) => {
    const exactIndex = unused.findIndex((entry) => entry.productId === productId && !usedIds.has(entry.rowId));
    if (exactIndex >= 0) return unused.splice(exactIndex, 1)[0];
    const anyIndex = unused.findIndex((entry) => !usedIds.has(entry.rowId));
    if (anyIndex >= 0) return unused.splice(anyIndex, 1)[0];
    return null;
  };

  try {
    for (const item of cleanProducts) {
      const product = maps.byId.get(item.id) || {};
      const match = takeMatch(item.id);
      const patch = {
        reason: item.reason || null,
        order_number: orderNumber,
        order_type: finalType || null,
        product_id: item.id,
        product_name: text(product?.name) || item.id,
        product_url: text(product?.url) || null,
        unit_price: Number.isFinite(Number(product?.unitPrice)) ? Number(product.unitPrice) : null,
        quantity_requested: item.quantity,
        quantity_progress: item.quantity,
        quantity_received_by_operations: 0,
        quantity_remaining: item.quantity,
        issue_description: item.issueDescription || null,
        status: currentStatus,
        sv_approval: currentApproval,
        team_member_id: currentTeamMemberId,
        team_member_name: currentTeamMemberName,
      };

      mutationStarted = true;
      if (match?.rowId) {
        usedIds.add(match.rowId);
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

    for (const leftover of unused) {
      if (!leftover?.rowId || usedIds.has(leftover.rowId)) continue;
      await updateById(orderTable(), leftover.rowId, { status: "Archive" });
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
  editMode = false,
  editToken = "",
} = {}) {
  if (!isSupabaseConfigured()) return null;
  if (editMode) {
    if (!text(editToken)) return null;
    return await updateExistingOrderDirect({ account, products, orderType, editToken });
  }
  return await createNewOrderDirect({ account, products, orderType });
}

export async function undoShoppingCartOrderDirect({ account = {}, undoToken = "" } = {}) {
  if (!isSupabaseConfigured() || !text(undoToken)) return null;
  const signed = verifySignedPayload(undoToken, "undo-order", account);
  const ids = cleanIds(signed?.ids);
  if (!ids.length || !ids.every((id) => /^\d+$/.test(id))) throw directError("This order is no longer available to undo.", 404);
  await verifyOwnedRows(ids, account);

  let deleted;
  try {
    deleted = await deleteByIds(orderTable(), ids);
  } catch (error) {
    throw directError(error?.message || "Failed to undo order.", Number(error?.status) || 500, true);
  }
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

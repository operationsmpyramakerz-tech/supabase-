import "server-only";

import { isSupabaseConfigured, select } from "./supabase-rest";

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 1000;
const CACHE_TTL_MS = 1_200;
const SUMMARY_SELECT = [
  "id",
  "actor_team_member_id",
  "actor_name",
  "actor_department",
  "actor_position",
  "page_key",
  "page_name",
  "action_key",
  "action_label",
  "entity_type",
  "entity_id",
  "entity_label",
  "method",
  "path",
  "status_code",
  "duration_ms",
  "request_body",
  "created_at",
].join(",");

let listCache = null;
let listInflight = null;

function text(value) {
  return String(value ?? "").trim();
}

function historyTable() {
  return text(process.env.SUPABASE_HISTORY_TABLE) || "operation_history";
}

function ordersTable() {
  return text(process.env.SUPABASE_ORDERS_TABLE) || "orders";
}

function safeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function value(row = {}, keys = []) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && typeof row[key] !== "undefined") {
      return row[key];
    }
  }
  return null;
}

function visibleRow(row = {}) {
  const path = text(row.path || row.Path).split("?")[0];
  return ![
    /^\/api\/order-draft(\/|$)/i,
    /^\/api\/account\/verify-password$/i,
    /^\/api\/b2b\/admin\/verify$/i,
    /^\/api\/kpis\/admin\/verify$/i,
    /^\/api\/task-management\/admin\/verify$/i,
    /^\/api\/notifications\/read/i,
    /^\/api\/messages\/presence/i,
  ].some((pattern) => pattern.test(path));
}

function safeText(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean).slice(0, 4).join(", ");
  if (typeof value === "object") return "";
  return text(value);
}

function nestedValue(source = {}, keys = []) {
  if (!source || typeof source !== "object") return "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const current = source[key];
    if (Array.isArray(current)) {
      const clean = current.map(safeText).filter(Boolean);
      if (clean.length) return clean.slice(0, 4).join(", ");
    } else if (current && typeof current === "object") {
      const nested = nestedValue(current, keys);
      if (nested) return nested;
    } else {
      const clean = safeText(current);
      if (clean) return clean;
    }
  }
  return "";
}

function orderRelated(row = {}) {
  const page = text(value(row, ["page_name", "pageName"])).toLowerCase();
  const path = text(value(row, ["path"])).toLowerCase();
  const entityType = text(value(row, ["entity_type", "entityType"])).toLowerCase();
  const action = text(value(row, ["action_label", "actionLabel"])).toLowerCase();
  return /order/.test(page) || /order|submit-order|sv-orders|requested-orders|current-orders/.test(path) || /order/.test(entityType) || /order|approval/.test(action);
}

function orderIds(row = {}) {
  const out = new Set();
  const add = (candidate) => {
    if (candidate === null || typeof candidate === "undefined") return;
    if (Array.isArray(candidate)) return candidate.forEach(add);
    const raw = safeText(candidate);
    if (!raw) return;
    raw.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
      if (/^\d+$/.test(part)) out.add(part);
    });
  };

  add(value(row, ["entity_id", "entityId"]));
  const body = value(row, ["request_body", "requestBody"]);
  if (body && typeof body === "object") {
    add(body.orderIds);
    add(body.order_ids);
    add(body.orderId);
    add(body.order_id);
    add(body.id);
  }
  return Array.from(out);
}

async function buildOrderMap(rows = []) {
  const ids = Array.from(new Set(rows.filter(orderRelated).flatMap(orderIds))).filter((id) => /^\d+$/.test(id));
  const map = new Map();
  if (!ids.length) return map;

  for (let index = 0; index < ids.length; index += 150) {
    const batch = ids.slice(index, index + 150);
    try {
      const orderRows = await select(ordersTable(), {
        select: "id,order_number,reason,product_name",
        id: `in.(${batch.join(",")})`,
        limit: String(Math.max(150, batch.length)),
      });
      for (const row of Array.isArray(orderRows) ? orderRows : []) {
        const id = safeText(row?.id);
        const number = Number(row?.order_number);
        const label = Number.isFinite(number) ? `ORD-${number}` : (safeText(row?.reason) || safeText(row?.product_name) || id);
        if (id && label) map.set(id, label);
      }
    } catch {
      // Entity enrichment is optional. The audit row itself is still usable.
    }
  }
  return map;
}

function singularPageLabel(pageName = "") {
  const label = text(pageName) || "record";
  const labels = {
    Products: "product",
    Expenses: "expense",
    "Expenses Users": "expense",
    "Users Center": "user",
    B2B: "school",
    Proposals: "proposal",
    KPIs: "KPI",
    Stocktaking: "stock item",
    "Create New Order": "order",
    "Current Orders": "order",
    "Operations Orders": "order",
    "Orders Review": "order",
    "Maintenance Orders": "maintenance order",
    Tasks: "task",
  };
  return labels[label] || label.replace(/s$/i, "").toLowerCase();
}

function actionLabel(row = {}) {
  const raw = safeText(value(row, ["action_label", "actionLabel"])) || "Action";
  const pageName = safeText(value(row, ["page_name", "pageName"]));
  const numeric = raw.match(/^(Created|Updated|Deleted|Archived|Unarchived|Approved|Rejected)\s+\d+$/i);
  if (numeric && pageName) return `${numeric[1]} ${singularPageLabel(pageName)}`;
  if (/^Created\s+Submit\s+Order$/i.test(raw)) return "Created order";
  if (/^Updated\s+Update\s+Approval$/i.test(raw)) return "Updated approval";
  return raw;
}

function entityLabel(row = {}, orderMap = null) {
  if (orderMap && orderRelated(row)) {
    const labels = Array.from(new Set(orderIds(row).map((id) => orderMap.get(String(id))).filter(Boolean)));
    if (labels.length) return `${labels.slice(0, 4).join(", ")}${labels.length > 4 ? ` +${labels.length - 4}` : ""}`;
  }

  const body = value(row, ["request_body", "requestBody"]);
  const bodyLabel = nestedValue(body, [
    "orderNumber", "order_number", "orderIdLabel", "orderLabel",
    "name", "title", "productName", "product_name", "schoolName", "school_name",
    "username", "team_member_name", "memberName", "departmentName", "position",
    "reason", "receiptNumber", "receipt_number", "employeeCode", "employee_code",
    "reviewMonth", "review_month", "standardTitle", "standard_title",
    "amount", "total", "value",
  ]);
  if (bodyLabel) return bodyLabel.slice(0, 220);

  const explicit = safeText(value(row, ["entity_label", "entityLabel"]));
  if (explicit) return explicit.slice(0, 220);

  const rawId = safeText(value(row, ["entity_id", "entityId"]));
  const page = text(value(row, ["page_name", "pageName"])).toLowerCase();
  const entityType = text(value(row, ["entity_type", "entityType"])).toLowerCase();
  if (rawId && !/hard-refresh|refresh/i.test(`${page} ${entityType}`)) return rawId.slice(0, 220);
  return "";
}

function serializeRow(row = {}, { orderMap = null, includeDetails = false } = {}) {
  const output = {
    id: value(row, ["id", "ID"]),
    actorId: value(row, ["actor_team_member_id", "actorTeamMemberId"]) || "",
    actorName: value(row, ["actor_name", "actorName"]) || "System",
    actorDepartment: value(row, ["actor_department", "actorDepartment"]) || "",
    actorPosition: value(row, ["actor_position", "actorPosition"]) || "",
    pageKey: value(row, ["page_key", "pageKey"]) || "",
    pageName: value(row, ["page_name", "pageName"]) || "System",
    actionKey: value(row, ["action_key", "actionKey"]) || "",
    actionLabel: actionLabel(row),
    entityType: value(row, ["entity_type", "entityType"]) || "",
    entityId: value(row, ["entity_id", "entityId"]) || "",
    entityLabel: entityLabel(row, orderMap),
    method: value(row, ["method"]) || "",
    path: value(row, ["path"]) || "",
    statusCode: value(row, ["status_code", "statusCode"]) || null,
    durationMs: value(row, ["duration_ms", "durationMs"]) || null,
    createdAt: value(row, ["created_at", "createdAt"]) || null,
    detailsLoaded: Boolean(includeDetails),
  };

  if (includeDetails) {
    output.requestQuery = value(row, ["request_query", "requestQuery"]) || {};
    output.requestBody = value(row, ["request_body", "requestBody"]) || {};
    output.details = value(row, ["details"]) || {};
    output.ipAddress = value(row, ["ip_address", "ipAddress"]) || "";
    output.userAgent = value(row, ["user_agent", "userAgent"]) || "";
  }
  return output;
}

async function rawHistoryRows(limit) {
  const params = {
    select: SUMMARY_SELECT,
    order: "created_at.desc,id.desc",
    limit: String(limit),
  };
  try {
    return await select(historyTable(), params, { profileName: "history.list" });
  } catch (projectionError) {
    // Compatibility with older history schemas while the rollout is gradual.
    try {
      return await select(historyTable(), { select: "*", order: "created_at.desc,id.desc", limit: String(limit) }, { profileName: "history.list-fallback" });
    } catch {
      throw projectionError;
    }
  }
}

export async function historyList({ limit = DEFAULT_LIMIT, fresh = false } = {}) {
  if (!isSupabaseConfigured()) return null;
  const cleanLimit = safeLimit(limit);
  const cacheKey = String(cleanLimit);

  if (!fresh && listCache?.key === cacheKey && listCache.expiresAt > Date.now()) return listCache.value;
  if (!fresh && listInflight?.key === cacheKey) return await listInflight.promise;

  const promise = (async () => {
    const rawRows = await rawHistoryRows(cleanLimit);
    const visibleRows = (Array.isArray(rawRows) ? rawRows : []).filter(visibleRow);
    const orderMap = await buildOrderMap(visibleRows);
    return {
      ok: true,
      source: "supabase-next",
      rows: visibleRows.map((row) => serializeRow(row, { orderMap, includeDetails: false })),
    };
  })();

  if (!fresh) listInflight = { key: cacheKey, promise };
  try {
    const payload = await promise;
    listCache = { key: cacheKey, value: payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return payload;
  } finally {
    if (listInflight?.promise === promise) listInflight = null;
  }
}

export async function historyDetail(id) {
  if (!isSupabaseConfigured()) return null;
  const cleanId = text(id);
  if (!cleanId) {
    const error = new Error("History record ID is required.");
    error.status = 400;
    throw error;
  }

  const rows = await select(historyTable(), {
    select: "*",
    id: `eq.${cleanId}`,
    limit: "1",
  }, { profileName: "history.detail" });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !visibleRow(row)) {
    const error = new Error("History record was not found.");
    error.status = 404;
    throw error;
  }
  const orderMap = await buildOrderMap([row]);
  return { ok: true, source: "supabase-next", row: serializeRow(row, { orderMap, includeDetails: true }) };
}

export const __historyDataTest = {
  visibleRow,
  actionLabel,
  entityLabel,
  serializeRow,
  orderIds,
};

import "server-only";

import { rpc } from "./supabase-rest";

const RPC_NAME = "erp_home_order_groups";
const CAPABILITY_COOLDOWN_MS = 10 * 60 * 1000;
let disabledUntil = 0;

function text(value) {
  return String(value ?? "").trim();
}

function cleanStringList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => text(value))
    .filter(Boolean))];
}

function bool(value) {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function missingRpc(error) {
  const status = Number(error?.status) || 0;
  const message = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
  ].filter(Boolean).join(" ").toLowerCase();
  if (status === 404 && message.includes(RPC_NAME)) return true;
  if (!message.includes(RPC_NAME)) return false;
  return /could not find|schema cache|pgrst202|does not exist|undefined function|42883/.test(message);
}

export function canUseHomeOrderGroupsRpc() {
  return Date.now() >= disabledUntil;
}

export function noteHomeOrderGroupsRpcError(error) {
  if (!missingRpc(error)) return false;
  disabledUntil = Date.now() + CAPABILITY_COOLDOWN_MS;
  return true;
}

function normalizeRow(row = {}) {
  return {
    key: text(row.group_key ?? row.groupKey),
    orderNumber: Number.isFinite(Number(row.order_number ?? row.orderNumber))
      ? Number(row.order_number ?? row.orderNumber)
      : null,
    createdTime: text(row.created_time ?? row.createdTime),
    teamMemberId: text(row.team_member_id ?? row.teamMemberId),
    teamMemberName: text(row.team_member_name ?? row.teamMemberName),
    reason: text(row.reason),
    productName: text(row.product_name ?? row.productName),
    itemCount: finite(row.item_count ?? row.itemCount),
    totalCost: finite(row.total_cost ?? row.totalCost),
    orderTypeBucket: text(row.order_type_bucket ?? row.orderTypeBucket) || "request",
    currentBucket: text(row.current_bucket ?? row.currentBucket) || "progress",
    reviewBucketAll: text(row.review_bucket_all ?? row.reviewBucketAll) || "pending",
    reviewItemCount: finite(row.review_item_count ?? row.reviewItemCount),
    reviewTotalCost: finite(row.review_total_cost ?? row.reviewTotalCost),
    reviewOrderTypeBucket: text(row.review_order_type_bucket ?? row.reviewOrderTypeBucket) || "request",
    reviewBucket: text(row.review_bucket ?? row.reviewBucket) || "pending",
    approvedItemCount: finite(row.approved_item_count ?? row.approvedItemCount),
    approvedTotalCost: finite(row.approved_total_cost ?? row.approvedTotalCost),
    approvedOrderTypeBucket: text(row.approved_order_type_bucket ?? row.approvedOrderTypeBucket) || "request",
    approvedOperationsBucket: text(row.approved_operations_bucket ?? row.approvedOperationsBucket) || "pending",
    approvedMaintenanceBucket: text(row.approved_maintenance_bucket ?? row.approvedMaintenanceBucket) || "pending",
    hasApprovedRows: bool(row.has_approved_rows ?? row.hasApprovedRows),
  };
}

/**
 * Home-specific order aggregation fast path.
 *
 * The SQL function collapses component rows into one row per order inside
 * PostgreSQL and returns the exact counters/buckets the dashboard needs. The
 * existing row-based Home loader remains the compatibility fallback, so this
 * accelerator can be deployed independently of the application code.
 */
export async function loadHomeOrderGroupsRpc({
  currentUserId = "",
  currentUserName = "",
  selectedUserId = "",
  selectedUserName = "",
  reviewerIds = [],
  reviewerNames = [],
  includeCurrent = false,
  includeReview = false,
  includeApproved = false,
  profileName = "home.order-groups-rpc",
} = {}) {
  const payload = {
    currentUserId: text(currentUserId),
    currentUserName: text(currentUserName),
    selectedUserId: text(selectedUserId),
    selectedUserName: text(selectedUserName),
    reviewerIds: cleanStringList(reviewerIds),
    reviewerNames: cleanStringList(reviewerNames),
    includeCurrent: Boolean(includeCurrent),
    includeReview: Boolean(includeReview),
    includeApproved: Boolean(includeApproved),
  };

  const rows = await rpc(RPC_NAME, { p_options: payload }, {
    profileName,
    timeoutMs: 10_000,
  });

  return (Array.isArray(rows) ? rows : [])
    .map(normalizeRow)
    .filter((row) => row.key);
}

export const __homeOrderGroupsRpcTest = {
  cleanStringList,
  missingRpc,
  normalizeRow,
};

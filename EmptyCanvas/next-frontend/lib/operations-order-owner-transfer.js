import "server-only";
import { select, supabaseRequest } from "./supabase-rest";
import { listTeamMembersLite } from "./team-members-service";
import { validateWholeOperationsOrder } from "./operations-whole-order-policy.mjs";
import { recordHistoryForAccount } from "./history-audit";

const clean = (v) => String(v ?? "").trim();
const orderTable = () => clean(process.env.SUPABASE_ORDERS_TABLE) || "orders";
function fail(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  error.code = "DIRECT_OPERATIONS_MUTATION_FAILED";
  return error;
}
function owner(row = {}) {
  return { id: clean(row.team_member_id), name: clean(row.team_member_name) };
}
function sharedOrderNumber(rows = []) {
  const numbers = new Set(rows.map((row) => clean(row.order_number)));
  if (numbers.size !== 1 || !/^\d+$/.test([...numbers][0] || "")) {
    throw fail("Creator transfer requires a complete, single saved order.", 409);
  }
  return [...numbers][0];
}
function sharedOwner(rows = []) {
  const ids = new Set(rows.map((row) => owner(row).id));
  const names = new Set(rows.map((row) => owner(row).name));
  if (!rows.length || ids.size !== 1 || names.size !== 1) {
    throw fail("This order has inconsistent owners. Review its rows before reassigning.", 409);
  }
  return owner(rows[0]);
}
async function allRowsByOrderNumber(orderNumber) {
  return await select(orderTable(), {
    select: "id,order_number,team_member_id,team_member_name",
    order_number: `eq.${orderNumber}`, limit: "1001",
  });
}
async function assertCompleteOrder(ids, rows, orderNumber) {
  const fullRows = await allRowsByOrderNumber(orderNumber);
  if (!validateWholeOperationsOrder(ids, rows, fullRows).ok) {
    throw fail("The order has changed or is incomplete. Refresh and open it again.", 409);
  }
  return fullRows;
}

/** Strict preflight runs before any component changes. ID is never accepted as a username. */
export async function prepareOperationsCreatorTransfer({
  orderIds = [], rows = [], targetId = "", expectedId = "", expectedName = "",
} = {}) {
  const id = clean(targetId);
  if (!id) throw fail("Select an Order Creator.", 400);
  const members = await listTeamMembersLite({ fresh: true });
  const member = members.find((entry) => clean(entry?.id) === id);
  if (!member?.id || !clean(member.name)) throw fail("The selected user no longer exists.", 409);
  const orderNumber = sharedOrderNumber(rows);
  const oldOwner = sharedOwner(rows);
  if (oldOwner.id !== clean(expectedId) || oldOwner.name !== clean(expectedName)) {
    throw fail("Order Creator changed since you opened Edit Mode. Refresh and try again.", 409);
  }
  await assertCompleteOrder(orderIds, rows, orderNumber);
  return { member: { id, name: clean(member.name) }, orderNumber, oldOwner };
}

/**
 * A single conditional PATCH updates every component in one database statement.
 * It changes order ownership only; does NOT move already-transferred stock,
 * tamper with creation timestamps, modify approvals or trigger stock operations.
 */
export async function commitOperationsCreatorTransfer({
  account, orderIds = [], rows = [], prepared,
} = {}) {
  if (!prepared?.member?.id) throw fail("Creator transfer was not prepared.", 400);
  const number = sharedOrderNumber(rows);
  if (number !== prepared.orderNumber) throw fail("Order number changed during edit.", 409);
  const actual = await assertCompleteOrder(orderIds, rows, number);
  const current = sharedOwner(actual);
  if (current.id !== prepared.oldOwner.id || current.name !== prepared.oldOwner.name) {
    throw fail("Order ownership changed while saving. Refresh the order.", 409);
  }
  const next = prepared.member;
  if (current.id === next.id && current.name === next.name) {
    return { changed: false, creator: next };
  }
  // Update by the verified ORDER NUMBER (not per-component and not using a
  // partial owner filter). PostgreSQL executes this as ONE statement, so a
  // concurrent row-level owner edit cannot leave half the order transferred.
  // The earlier complete-order + previous-owner verification guards stale UI
  // edits; a simultaneous reassignment follows database last-writer-wins.
  const query = new URLSearchParams({
    order_number: `eq.${number}`, select: "id",
  });
  const result = await supabaseRequest(
    `/${encodeURIComponent(orderTable())}?${query.toString()}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: { team_member_id: next.id, team_member_name: next.name },
      profileName: "operations.creator-transfer",
    },
  );
  if (!Array.isArray(result) || !result.length) {
    throw fail("Creator transfer did not update any rows. Refresh the order.", 409);
  }
  // The order-number predicate updates every existing component atomically.
  // An additional row concurrently created after preflight is included too.
  if (result.length !== actual.length) {
    console.warn("[operations-orders] Creator transfer included concurrent order rows", {
      expected: actual.length, updated: result.length,
    });
  }
  try {
    await recordHistoryForAccount({
      account, pageName: "Operations Orders", pageKey: "orders.operations",
      actionLabel: `Transferred ORD-${number}: ${current.name || current.id || "Unassigned"} → ${next.name}`,
      actionKey: "orders.operations.transfer_creator",
      entityType: "order", entityId: clean(actual[0]?.id), entityLabel: `ORD-${number}`,
      method: "PATCH", path: "/next/api/orders/operations/mutations-direct",
      statusCode: 200,
    });
  } catch (error) {
    // The single orders-table PATCH is already committed. Never ask the user to
    // retry a successful transfer just because the optional audit writer failed.
    console.warn("[operations-orders] Creator transfer succeeded; history unavailable:", error?.message);
  }
  return { changed: true, creator: next };
}

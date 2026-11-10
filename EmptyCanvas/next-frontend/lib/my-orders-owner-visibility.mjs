// My Orders legacy ownership boundary. Keep legacy Page Access compatibility,
// but never use partial names or a missing scoped marker as global visibility.
import { ownerInOrderScope } from "./order-data-scope.mjs";

const clean = (value) => String(value ?? "").trim();
const normalizedName = (value) => clean(value).replace(/\s+/g, " ").toLocaleLowerCase("en");

export function legacyMyOrderOwnerMatches(row = {}, account = {}) {
  const ownerId = clean(row?.team_member_id ?? row?._scopeOwnerId ?? row?.teamMemberId ?? row?.createdById);
  const memberId = clean(account?.teamMemberId || account?.userSupabaseId);
  // When an order has a saved owner ID, names are never an alternative. A
  // missing or different session member ID must fail closed.
  if (ownerId) return Boolean(memberId) && ownerId === memberId;

  // Only historical orders without an owner ID may use the creator's name.
  // Prefix/substring matches (Lab 1 vs Lab 2) are NOT ownership evidence.
  const orderName = normalizedName(row?.team_member_name ?? row?.createdByName ?? row?.["Teams Members"] ?? row?.teams_members);
  const accountName = normalizedName(account?.username || account?.name);
  return Boolean(orderName && accountName) && orderName === accountName;
}

export function canViewMyOrderRow(row = {}, account = {}, resolved = null) {
  if (resolved && resolved.scope !== null && resolved.scope !== undefined) {
    return ownerInOrderScope(row, resolved.scope, resolved.visibleIds || []);
  }
  return legacyMyOrderOwnerMatches(row, account);
}

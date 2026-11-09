/**
 * Quantity that has actually arrived for one component.  Never infer an
 * outstanding component's delivered amount from the originally requested qty.
 *
 * Legacy completed rows can have a blank received field, but their remaining
 * quantity is explicitly zero.  Only those fully completed rows may fall back
 * to the effective requested quantity.
 */
const EPSILON = 1e-9;
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const absoluteQty = (value) => Math.round(Math.abs(value) * 1e6) / 1e6;

export function operationsDeliveredTransferQuantity(item = {}) {
  if (!/(arrived|delivered|received)/i.test(String(item?.status ?? ""))) return 0;

  const received = numberOrNull(item?.quantityReceived ?? item?.quantity_received_by_operations ?? item?.quantity_received);
  if (received !== null && Math.abs(received) > EPSILON) return absoluteQty(received);

  const remaining = numberOrNull(item?.quantityRemaining ?? item?.quantity_remaining);
  // An unknown remaining balance is not proof that an unrecorded receipt is complete.
  if (remaining === null || Math.abs(remaining) > EPSILON) return 0;

  for (const raw of [item?.quantity, item?.quantityEditedBySupervisor, item?.quantityProgress, item?.quantityRequested, item?.quantity_requested]) {
    const value = numberOrNull(raw);
    if (value !== null && Math.abs(value) > EPSILON) return absoluteQty(value);
  }
  return 0;
}

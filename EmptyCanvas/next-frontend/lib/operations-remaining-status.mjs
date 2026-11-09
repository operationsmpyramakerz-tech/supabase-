/**
 * An Arrived/Delivered database status confirms that a receipt was uploaded;
 * it does not prove that the requested quantity was received in full.
 * Keep these two concepts independent so partial deliveries remain outstanding.
 * Archived and maintenance orders keep their original workflow semantics.
 */
export function operationsHasOutstandingQuantity({ stage = 1, hasRemaining = false, maintenance = false } = {}) {
  const step = Number(stage) || 1;
  return step >= 3 && step < 5 && !maintenance && Boolean(hasRemaining);
}

export function operationsMatchesTab(group = {}, tab = "all") {
  const step = Number(group.stage) || 1;
  const outstanding = operationsHasOutstandingQuantity(group);
  switch (String(tab || "all").toLowerCase()) {
    case "all": return step < 5;
    case "archive": return step >= 5;
    // A partially received order must be visible in BOTH buckets: its
    // outstanding components in Remaining and its arrived components in
    // Delivered. The group status must not suppress the arrived portion.
    case "delivered": return step === 4;
    case "remaining": return outstanding;
    case "received": return step === 3 && (Boolean(group.maintenance) || Boolean(group.hasReceived));
    case "approved": return step === 2 && Boolean(group.hasApproved);
    case "rejected": return step === 2 && Boolean(group.hasRejected);
    default: return false;
  }
}

/**
 * Only show the arrived portion of a mixed order inside Delivered.
 * A legacy fully-arrived component can have no explicit received quantity,
 * so allow a zero remaining quantity if the row itself is Arrived/Delivered.
 * In-progress / shipped rows are never treated as delivered merely because
 * another component of the same order reached that stage.
 */
export function operationsArrivedItemVisible({ stage = 1, received = 0, delivered = 0, remaining = 0 } = {}) {
  if (Number(stage) !== 4) return false;
  const abs = (value) => Math.abs(Number(value) || 0);
  return abs(received) > 1e-9 || abs(delivered) > 1e-9 || abs(remaining) <= 1e-9;
}

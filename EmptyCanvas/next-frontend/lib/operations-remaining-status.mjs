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
    case "delivered": return step === 4 && !outstanding;
    case "remaining": return outstanding;
    case "received": return step === 3 && (Boolean(group.maintenance) || Boolean(group.hasReceived));
    case "approved": return step === 2 && Boolean(group.hasApproved);
    case "rejected": return step === 2 && Boolean(group.hasRejected);
    default: return false;
  }
}

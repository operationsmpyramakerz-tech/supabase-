// Shared presentation-only rules. Never mutate order stages or quantities here.
const EPSILON = 1e-9;

export function isPartiallyDeliveredOrder({ stage, hasRemaining, hasReceived, maintenance } = {}) {
  return Number(stage) === 4 && !maintenance && Boolean(hasRemaining) && Boolean(hasReceived);
}

export function hasOutstandingOrderItem({ stage, remaining, maintenance } = {}) {
  return Number(stage) >= 3 && Number(stage) < 5 && !maintenance
    && Math.abs(Number(remaining) || 0) > EPSILON;
}

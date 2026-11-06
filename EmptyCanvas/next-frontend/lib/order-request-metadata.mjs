// Shared validation for order-level Shopping Cart request metadata.
export const ORDER_PRIORITIES = Object.freeze(["Low", "Normal", "High", "Urgent"]);

export function normalizeOrderPriority(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Normal";
  const priority = ORDER_PRIORITIES.find((option) => option.toLowerCase() === raw.toLowerCase());
  if (!priority) throw new Error("Priority Level must be Low, Normal, High, or Urgent.");
  return priority;
}

export function normalizeRequestedDeliveryDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("Delivery Date must be a valid date (YYYY-MM-DD).");
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error("Delivery Date must be a valid calendar date.");
  }
  return raw;
}

export function normalizeOrderRequestMetadata({ priorityLevel, requestedDeliveryDate } = {}) {
  return {
    priorityLevel: normalizeOrderPriority(priorityLevel),
    requestedDeliveryDate: normalizeRequestedDeliveryDate(requestedDeliveryDate),
  };
}

// Orders cannot be created or updated without both fields. The permissive
// normalizer above stays available for reading legacy orders and drafts.
export function requireOrderRequestMetadata({ priorityLevel, requestedDeliveryDate } = {}) {
  if (!String(priorityLevel ?? "").trim()) throw new Error("Priority Level is required.");
  if (!String(requestedDeliveryDate ?? "").trim()) throw new Error("Delivery Date is required.");
  return normalizeOrderRequestMetadata({ priorityLevel, requestedDeliveryDate });
}

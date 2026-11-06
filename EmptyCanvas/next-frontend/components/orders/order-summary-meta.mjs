/** Read the order-level metadata from the source rows, without inventing values. */
const safeText = value => String(value ?? "").trim();

export function orderPriority(group) {
  const direct = safeText(group?.priorityLevel || group?.priority);
  const itemValue = (Array.isArray(group?.items) ? group.items : [])
    .map(item => safeText(item?.priorityLevel || item?.priority_level))
    .find(Boolean);
  return direct || itemValue || "—";
}

export function orderDeliveryDate(group) {
  const direct = safeText(group?.requestedDeliveryDate || group?.requested_delivery_date);
  const itemValue = (Array.isArray(group?.items) ? group.items : [])
    .map(item => safeText(item?.requestedDeliveryDate || item?.requested_delivery_date))
    .find(Boolean);
  return direct || itemValue || null;
}

export function orderCreatedDate(group) {
  const direct = safeText(group?.createdAt || group?.createdTime);
  if (direct && Number.isFinite(Date.parse(direct))) return direct;
  // The first component created belongs to the original order creation;
  // latestCreated can instead be a component added later while editing.
  const timestamps = (Array.isArray(group?.items) ? group.items : [])
    .map(item => safeText(item?.createdTime || item?.createdAt || item?.created_at))
    .filter(value => value && Number.isFinite(Date.parse(value)));
  if (timestamps.length) return timestamps.reduce((earliest, next) =>
    Date.parse(next) < Date.parse(earliest) ? next : earliest);
  return group?.latestCreated || null;
}

import { operationsHasOutstandingQuantity } from './operations-remaining-status.mjs';
import { isPartiallyDeliveredOrder } from './order-partial-delivery.mjs';

// Match the badges shown in the All view, not the overlapping action tabs.
export const OPERATIONS_STATUS_OPTIONS = [
  { key: 'under-supervision', label: 'Under Supervision' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'remaining', label: 'Remaining' },
  { key: 'received', label: 'Shipping' },
  { key: 'partial-delivered', label: 'Partially Delivered' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'archive', label: 'Archive' },
];

export function normalizeOperationsStatuses(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(',');
  const keys = new Set(input.map(key => String(key).trim().toLowerCase()));
  return OPERATIONS_STATUS_OPTIONS.map(option => option.key).filter(key => keys.has(key));
}

export function operationsCardStatusKeys(group = {}) {
  const stage = Number(group.stage) || 1;
  if (stage >= 5) return ['archive'];
  if (isPartiallyDeliveredOrder(group)) return ['partial-delivered'];
  if (operationsHasOutstandingQuantity(group)) return ['remaining'];
  if (stage >= 4) return ['delivered'];
  if (stage >= 3) return ['received'];
  const keys = [];
  if (group.hasApproved) keys.push('approved');
  if (group.hasRejected) keys.push('rejected');
  return keys.length ? keys : ['under-supervision'];
}

export function operationsMatchesStatuses(group, statuses) {
  const selected = normalizeOperationsStatuses(statuses);
  return !selected.length || operationsCardStatusKeys(group).some(key => selected.includes(key));
}

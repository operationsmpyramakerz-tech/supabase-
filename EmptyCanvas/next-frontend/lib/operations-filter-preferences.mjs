import { OPERATIONS_STATUS_OPTIONS, normalizeOperationsStatuses, operationsCardStatusKeys } from './operations-status-filter.mjs';

export const FILTER_STATUS_ORDER = ['approved','rejected','remaining','received','delivered','partial-delivered','under-supervision','archive'];
export const OPERATIONS_SHORTCUTS = [
  { key: 'progress', label: 'In Progress', icon: 'play', statuses: ['under-supervision','approved','received'] },
  { key: 'completed', label: 'Completed', icon: 'check', statuses: ['delivered'] },
  { key: 'exception', label: 'Exception', icon: 'alert', statuses: ['rejected','remaining','partial-delivered'] },
];
export function toggleOperationsShortcut(values, shortcut) {
  const selected = normalizeOperationsStatuses(values);
  const keys = shortcut.statuses;
  return normalizeOperationsStatuses(keys.every(key => selected.includes(key))
    ? selected.filter(key => !keys.includes(key)) : [...selected, ...keys]);
}
export function summarizeOperationsFacets(groups, type = 'all') {
  const statuses = Object.fromEntries(OPERATIONS_STATUS_OPTIONS.map(({key}) => [key,0]));
  const shortcuts = Object.fromEntries(OPERATIONS_SHORTCUTS.map(({key}) => [key,0]));
  for (const group of groups) {
    const typeKey = String(group.orderType || '').toLowerCase().replace(/[^a-z0-9]/g,'');
    if (type !== 'all' && type !== typeKey) continue;
    const keys = operationsCardStatusKeys({...group, maintenance: typeKey === 'requestmaintenance'});
    for (const key of keys) statuses[key]++;
    for (const shortcut of OPERATIONS_SHORTCUTS) if (keys.some(key => shortcut.statuses.includes(key))) shortcuts[shortcut.key]++;
  }
  return {statuses,shortcuts};
}
// Every page uses the permission-scoped Operations summary endpoint. A failed or
// incomplete scan never returns partial counts as if they were totals.
export async function collectOperationsFilterGroups(loadPage, buildGroups, {signal, maxPages=500}={}) {
  const groups = new Map(), cursors = new Set();
  let cursor = null;
  for (let page=0; page<maxPages; page++) {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'),{name:'AbortError'});
    const data = await loadPage(cursor, signal);
    if (!Array.isArray(data?.items) || !data?.pageInfo) throw new Error('Incomplete order count response.');
    for (const group of buildGroups(data.items)) groups.set(group.key, {key:group.key,orderType:group.orderType,stage:group.stage,hasRemaining:group.hasRemaining,hasReceived:group.hasReceived,hasApproved:group.hasApproved,hasRejected:group.hasRejected});
    if (!data.pageInfo.hasMore) return [...groups.values()];
    const next = data.pageInfo.nextCursor;
    if (next == null || next === '' || cursors.has(String(next)) || String(next) === String(cursor)) throw new Error('Order count pagination did not advance.');
    cursors.add(String(next)); cursor=next;
  }
  throw new Error('Too many pages to count orders safely.');
}

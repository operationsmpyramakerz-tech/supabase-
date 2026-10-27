/**
 * Audited processing-time metrics. Only use events captured by the Supabase
 * INSERT/UPDATE trigger; NEVER infer historical completion timestamps from
 * a row's current status or from its creation date.
 *
 * An order is eligible for a metric only if every currently scoped component
 * has a genuine `created` event, no row is deleted/renumbered, and all its
 * components have reached the necessary stage in the audit log.
 */

const MS_HOUR = 3_600_000;

export function lifecycleOrderNumber(group = {}) {
  const raw = group?.orderNumber ?? group?.order_number
    ?? group?.items?.[0]?.orderIdNumber ?? group?.items?.[0]?.order_number;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

export function createLifecycleScope(groups = [], { rowCountOf } = {}) {
  const entries = new Map();
  for (const group of Array.isArray(groups) ? groups : []) {
    const number = lifecycleOrderNumber(group);
    if (!number) continue;
    const rows = rowCountOf ? rowCountOf(group) : group?.itemCount ?? group?.items?.length;
    const expectedRows = Number(rows);
    if (!Number.isSafeInteger(expectedRows) || expectedRows < 1) continue;
    // Defensive: duplicate group sources must not decrease expected row count.
    entries.set(number, Math.max(expectedRows, entries.get(number) || 0));
  }
  return [...entries].map(([orderNumber, expectedRows]) => ({ orderNumber, expectedRows }));
}

const clean = (value) => String(value ?? '').trim().toLowerCase();
const approved = (value) => /^approved?(?:\b|$)/.test(clean(value));
const rejected = (value) => /reject|cancel/.test(clean(value));
const terminal = (value) => /^(completed?|delivered?|arrived|done)$/i.test(String(value ?? '').trim());
const archived = (value) => /^(archive|archived)$/i.test(String(value ?? '').trim());

function transitionTime(events, reached) {
  let at = null;
  let previouslyReached = false;
  for (const event of events) {
    const isReached = reached(event, previouslyReached);
    if (isReached && !previouslyReached) at = event.timestamp;
    previouslyReached = isReached;
  }
  return previouslyReached ? at : null;
}

export function auditedOrderTimeline(events, expectedRows) {
  const rows = new Map();
  for (const event of events || []) {
    const rowId = String(event.row_id ?? event.rowId ?? '').trim();
    const at = Date.parse(event.occurred_at ?? event.occurredAt ?? '');
    if (!rowId || !Number.isFinite(at)) return null;
    if (!rows.has(rowId)) rows.set(rowId, []);
    rows.get(rowId).push({
      id: Number(event.id) || 0,
      timestamp: at,
      kind: clean(event.event_type ?? event.eventType),
      status: event.status,
      svApproval: event.sv_approval ?? event.svApproval,
      operationsApproval: event.operations_approval ?? event.operationsApproval,
    });
  }
  if (rows.size !== expectedRows || !rows.size) return null;
  const started = [];
  const approval = [];
  const completed = [];
  let allApproved = true;
  let allCompleted = true;

  for (const rowEvents of rows.values()) {
    rowEvents.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
    // Historical rows never get a fabricated creation event.
    if (rowEvents[0].kind !== 'created' || rowEvents.some((event) =>
      event.kind === 'deleted' || event.kind === 'renumbered')) return null;
    if (rowEvents.filter((event) => event.kind === 'created').length !== 1) return null;
    started.push(rowEvents[0].timestamp);
    const last = rowEvents[rowEvents.length - 1];
    const approvalAt = transitionTime(rowEvents, (event) => approved(event.svApproval));
    if (approvalAt !== null && approved(last.svApproval)) approval.push(approvalAt);
    else allApproved = false;
    // Archiving an already completed order does not erase its delivery time.
    // An order archived without any prior completion remains unverified.
    const completionAt = transitionTime(rowEvents, (event, wasCompleted) =>
      terminal(event.status) || (archived(event.status) && wasCompleted));
    if (completionAt !== null && (terminal(last.status) || archived(last.status)) && !rejected(last.status)) completed.push(completionAt);
    else allCompleted = false;
  }
  const createdAt = Math.min(...started);
  const approvedAt = allApproved ? Math.max(...approval) : null;
  const completedAt = allCompleted ? Math.max(...completed) : null;
  if (approvedAt !== null && approvedAt < createdAt) return null;
  if (completedAt !== null && completedAt < createdAt) return null;
  return { createdAt, approvedAt, completedAt };
}

const definitions = {
  current: { label: 'Request to completion', from: 'createdAt', to: 'completedAt' },
  review: { label: 'Request to approval', from: 'createdAt', to: 'approvedAt' },
  operations: { label: 'Approval to delivery', from: 'approvedAt', to: 'completedAt' },
  maintenance: { label: 'Approval to completion', from: 'approvedAt', to: 'completedAt' },
};

function statistics(hours) {
  if (!hours.length) return { sample: 0, medianHours: null, averageHours: null, minHours: null, maxHours: null };
  hours.sort((a, b) => a - b);
  const n = hours.length;
  const median = n % 2 ? hours[(n - 1) / 2] : (hours[n / 2 - 1] + hours[n / 2]) / 2;
  const round = (value) => Math.round(value * 10) / 10;
  return {
    sample: n,
    medianHours: round(median),
    averageHours: round(hours.reduce((sum, value) => sum + value, 0) / n),
    minHours: round(hours[0]),
    maxHours: round(hours[n - 1]),
  };
}

export function buildLifecycleAnalytics(scopes = {}, events = []) {
  const byNumber = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const number = String(event?.order_number ?? event?.orderNumber ?? '').trim();
    if (!byNumber.has(number)) byNumber.set(number, []);
    byNumber.get(number).push(event);
  }
  const result = {};
  for (const [workspace, definition] of Object.entries(definitions)) {
    const scope = Array.isArray(scopes?.[workspace]) ? scopes[workspace] : [];
    let audited = 0;
    const durations = [];
    for (const order of scope) {
      const timeline = auditedOrderTimeline(byNumber.get(String(order.orderNumber)) || [], Number(order.expectedRows));
      if (!timeline) continue;
      audited++;
      const start = timeline[definition.from];
      const end = timeline[definition.to];
      if (start !== null && end !== null && end >= start) durations.push((end - start) / MS_HOUR);
    }
    result[workspace] = {
      ...definition,
      eligible: scope.length,
      audited,
      excluded: scope.length - audited,
      ...statistics(durations),
    };
  }
  return result;
}

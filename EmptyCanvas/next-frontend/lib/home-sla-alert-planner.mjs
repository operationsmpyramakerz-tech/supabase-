/** Pure opt-in SLA alert planner. All timings come from verified row-level audit events. */
import { auditedOrderTimeline } from './home-lifecycle-analytics.mjs';
import { normalizeBusinessCalendar, businessHoursBetween } from './home-business-calendar.mjs';

const STAGES = {
  current: { from: 'createdAt', to: 'completedAt', label: 'Current orders', url: '/next/orders' },
  review: { from: 'createdAt', to: 'approvedAt', label: 'Orders review', url: '/next/orders-review' },
  operations: { from: 'approvedAt', to: 'completedAt', label: 'Operations orders', url: '/next/operations-orders' },
  maintenance: { from: 'approvedAt', to: 'completedAt', label: 'Maintenance orders', url: '/next/maintenance-orders' },
};
const HOUR = 3600000;

/** Scopes include { orderNumber, expectedRows, isMaintenance, approved, rejected }.
 * Never infer a missing stage from an order's current status. */
export function planSlaAlerts(scopes = [], events = [], policies = [], calendarRow = null, now = Date.now(), options = {}) {
  const enabled = options || {};
  const calendar = normalizeBusinessCalendar(calendarRow);
  const policyMap = new Map((Array.isArray(policies) ? policies : []).map(p => [p.workspace, p]));
  const indexed = new Map();
  for (const event of events || []) {
    const key = String(event?.order_number ?? '').trim();
    if (!indexed.has(key)) indexed.set(key, []);
    indexed.get(key).push(event);
  }
  const results = [];
  const seen = new Set();
  const nowMs = Number(now);
  if (!Number.isFinite(nowMs)) return results;
  const utcDay = new Date(nowMs).toISOString().slice(0, 10);
  for (const group of Array.isArray(scopes) ? scopes : []) {
    const orderNumber = String(group.orderNumber ?? '').trim();
    if (!/^\d{1,12}$/.test(orderNumber) || !Number.isSafeInteger(Number(group.expectedRows)) || group.expectedRows < 1 || group.rejected) continue;
    const timeline = auditedOrderTimeline(indexed.get(orderNumber) || [], Number(group.expectedRows));
    if (!timeline) continue;
    for (const [workspace, stage] of Object.entries(STAGES)) {
      if (workspace === 'maintenance' && !group.isMaintenance) continue;
      if (workspace === 'operations' && group.isMaintenance) continue;
      if ((workspace === 'operations' || workspace === 'maintenance') && !group.approved) continue;
      const policy = policyMap.get(workspace);
      if (policy?.enabled !== true) continue;
      const target = Number(policy.target_hours), warn = Number(policy.warning_percent);
      if (!Number.isFinite(target) || target <= 0 || target > 8760 || !Number.isFinite(warn) || warn < 50 || warn >= 100) continue;
      const working = policy.time_basis === 'working';
      if (working && !calendar) continue;
      const start = timeline[stage.from], finish = timeline[stage.to];
      if (!Number.isFinite(start) || start > nowMs || finish !== null) continue;
      const hours = working ? businessHoursBetween(start, nowMs, calendar) : (nowMs - start) / HOUR;
      if (!Number.isFinite(hours) || hours < 0) continue;
      let kind = null;
      if (hours > target && enabled.overdue === true) kind = 'overdue';
      else if (hours >= target * warn / 100 && hours <= target && enabled.warning === true) kind = 'warning';
      if (kind) {
        const key = `${workspace}:${orderNumber}:${start}:${kind}:${policy.updated_at || 'base'}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ key, workspace, orderNumber, kind, startedAt: start, title: kind === 'warning' ? `SLA deadline approaching · Order #${orderNumber}` : `SLA overdue · Order #${orderNumber}`,
            body: `${stage.label}: ${hours.toFixed(1)} of ${target} ${working ? 'working' : 'calendar'} hours used.`, url: stage.url });
        }
      }
      // A separate personal follow-up (NOT a manager notification). Opt-in only.
      // Limit to one per UTC day and only after another 24 measured hours overdue.
      if (hours >= target + 24 && enabled.follow_up === true) {
        const key = `${workspace}:${orderNumber}:${start}:follow_up:${utcDay}:${policy.updated_at || 'base'}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ key, workspace, orderNumber, kind: 'follow_up', startedAt: start,
            title: `SLA follow-up · Order #${orderNumber}`, body: `${stage.label}: ${hours.toFixed(1)} of ${target} ${working ? 'working' : 'calendar'} hours used. Still awaiting completion.`, url: stage.url });
        }
      }
    }
  }
  return results;
}

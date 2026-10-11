import assert from 'node:assert/strict';
import { planSlaAlerts } from '../lib/home-sla-alert-planner.mjs';
import { buildSlaAnalytics } from '../lib/home-sla-analytics.mjs';

const start = Date.parse('2026-10-01T00:00:00Z');
const hour = 3600000;
const event = (order_number, row_id, event_type, at, status = 'In progress', sv_approval = null) => ({
  order_number: String(order_number), row_id, event_type, occurred_at: new Date(start + at * hour).toISOString(), status, sv_approval,
});
const scope = (orderNumber, expectedRows = 1, props = {}) => ({ orderNumber: String(orderNumber), expectedRows, approved: false, isMaintenance: false, ...props });
const rules = [
  { workspace: 'current', enabled: true, target_hours: 10, warning_percent: 80, time_basis: 'elapsed' },
  { workspace: 'review', enabled: false, target_hours: 10, warning_percent: 80, time_basis: 'elapsed' },
  { workspace: 'operations', enabled: true, target_hours: 10, warning_percent: 80, time_basis: 'elapsed' },
];
const opts = { warning: true, overdue: true, follow_up: false };
const active = [event(101, 'a', 'created', 0)];
const one = [scope(101)];
assert.equal(planSlaAlerts(one, active, rules, null, start + 7 * hour, opts).length, 0);
assert.deepEqual(planSlaAlerts(one, active, rules, null, start + 8 * hour, opts).map(x => x.kind), ['warning']);
assert.deepEqual(planSlaAlerts(one, active, rules, null, start + 11 * hour, opts).map(x => x.kind), ['overdue']);
assert.deepEqual(planSlaAlerts(one, active, rules, null, start + 35 * hour, { ...opts, follow_up: true }).map(x => x.kind), ['overdue', 'follow_up']);
assert.equal(planSlaAlerts(one, active, rules, null, start + 35 * hour, { warning: false, overdue: false, follow_up: false }).length, 0);
assert.equal(planSlaAlerts(one, active, rules.map(p => ({ ...p, enabled: false })), null, start + 35 * hour, opts).length, 0);
assert.equal(planSlaAlerts([scope(101, 2)], active, rules, null, start + 11 * hour, opts).length, 0, 'Missing component must exclude order');
assert.equal(planSlaAlerts(one, [event(101, 'a', 'changed', 2)], rules, null, start + 11 * hour, opts).length, 0, 'Missing creation event must exclude order');
assert.equal(planSlaAlerts(one, [...active, event(101, 'a', 'changed', 4, 'Delivered')], rules, null, start + 11 * hour, opts).length, 0, 'Closed order cannot generate reminders');
assert.equal(planSlaAlerts([scope(101, 1, { rejected: true })], active, rules, null, start + 11 * hour, opts).length, 0, 'Rejected orders excluded');
assert.equal(planSlaAlerts(one, [...active, event(101, 'a', 'deleted', 5)], rules, null, start + 11 * hour, opts).length, 0);
assert.equal(planSlaAlerts(one, [...active, event(101, 'a', 'renumbered', 5)], rules, null, start + 11 * hour, opts).length, 0);
assert.deepEqual(planSlaAlerts(one, active, rules, null, start + 11 * hour, opts), planSlaAlerts(one, active, rules, null, start + 11 * hour, opts), 'Alert keys are stable');
const approvedEvents = [...active, event(101, 'a', 'changed', 1, 'In progress', 'Approved')];
const approvedGroup = [scope(101, 1, { approved: true })];
assert.equal(planSlaAlerts(approvedGroup, approvedEvents, rules, null, start + 12 * hour, opts).filter(x => x.workspace === 'operations').length, 1);
assert.equal(planSlaAlerts([scope(101, 1, { approved: false })], approvedEvents, rules, null, start + 12 * hour, opts).filter(x => x.workspace === 'operations').length, 0);
assert.equal(planSlaAlerts([scope(101, 1, { approved: true, isMaintenance: true })], approvedEvents, rules, null, start + 12 * hour, opts).filter(x => x.workspace === 'operations').length, 0);
assert.equal(planSlaAlerts(approvedGroup, approvedEvents, rules.map(p => ({ ...p, time_basis: 'working' })), null, start + 12 * hour, opts).length, 0, 'Missing calendar => no working-hour claims');
const calendar = { enabled: true, timezone: 'UTC', work_days: [0,1,2,3,4,5,6], work_start: '00:00', work_end: '23:59', holidays: [] };
assert.ok(planSlaAlerts(one, active, rules.map(p => ({ ...p, time_basis: 'working' })), calendar, start + 12 * hour, opts).length);
assert.equal(buildSlaAnalytics({ current: one }, active, rules, start + 11 * hour).workspaces.current.activeOverdue, 1);
console.log('SLA opt-in alert planner: all assertions passed');

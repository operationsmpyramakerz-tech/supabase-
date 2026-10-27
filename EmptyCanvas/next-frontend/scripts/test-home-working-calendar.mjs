import assert from 'node:assert/strict';
import { normalizeBusinessCalendar, businessHoursBetween } from '../lib/home-business-calendar.mjs';
import { buildSlaAnalytics } from '../lib/home-sla-analytics.mjs';

const base = { enabled: true, timezone: 'Africa/Cairo', work_days: [0, 1, 2, 3, 4], work_start: '09:00', work_end: '17:00', holidays: [] };
const between = (start, end, data = base) => businessHoursBetween(Date.parse(start), Date.parse(end), normalizeBusinessCalendar(data));
// Egypt in October before the DST transition is UTC+3.
assert.equal(between('2026-10-11T07:00:00Z', '2026-10-13T09:00:00Z'), 18);
assert.equal(between('2026-10-11T07:00:00Z', '2026-10-13T09:00:00Z', { ...base, holidays: ['2026-10-12'] }), 10);
assert.equal(between('2026-10-09T07:00:00Z', '2026-10-10T14:00:00Z'), 0);
assert.equal(between('2026-10-11T00:00:00Z', '2026-10-11T06:00:00Z'), 0);
// Thursday before the Cairo spring clock change, through the following Sunday.
assert.equal(between('2026-04-23T13:00:00Z', '2026-04-26T09:00:00Z'), 5);
assert.equal(normalizeBusinessCalendar({ ...base, enabled: false }), null);
assert.equal(normalizeBusinessCalendar({ ...base, work_start: '18:00' }), null);
assert.equal(businessHoursBetween(10, 5, normalizeBusinessCalendar(base)), null);

const rows = [{ orderNumber: '38', expectedRows: 1 }];
const scopes = { current: rows };
const events = [
  { id: 1, order_number: '38', row_id: 'r', event_type: 'created', occurred_at: '2026-10-11T07:00:00Z', status: 'In progress' },
];
const policies = [{ workspace: 'current', enabled: true, target_hours: 12, warning_percent: 80, time_basis: 'working' }];
const now = Date.parse('2026-10-13T09:00:00Z');
const live = buildSlaAnalytics(scopes, events, policies, now, base).workspaces.current;
assert.equal(live.configured, true);
assert.equal(live.activeOverdue, 1);
assert.equal(live.topOverdue[0].elapsedHours, 18);
const holiday = buildSlaAnalytics(scopes, events, policies, now, { ...base, holidays: ['2026-10-12'] }).workspaces.current;
assert.equal(holiday.activeWarning, 1);
assert.equal(holiday.activeOverdue, 0);
const missing = buildSlaAnalytics(scopes, events, policies, now, { ...base, enabled: false }).workspaces.current;
assert.equal(missing.configured, false);
assert.equal(missing.calendarMissing, true);
assert.equal(missing.activeOverdue, 0);
const elapsed = buildSlaAnalytics(scopes, events, [{ ...policies[0], time_basis: 'elapsed' }], now, null).workspaces.current;
assert.equal(elapsed.configured, true);
assert.equal(elapsed.activeOverdue, 1);
console.log('Working calendar & SLA integration: assertions passed');

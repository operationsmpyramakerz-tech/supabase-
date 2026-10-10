import assert from 'node:assert/strict';
import { buildSlaAnalytics } from '../lib/home-sla-analytics.mjs';

const start = Date.parse('2026-10-11T00:00:00Z');
const iso = (hours) => new Date(start + hours * 3_600_000).toISOString();
const event = (number, row, kind, hours, status = 'In progress', approval = null, id = 0) => ({
  id, order_number: String(number), row_id: row, event_type: kind,
  occurred_at: iso(hours), status, sv_approval: approval,
});
const scope = (nums) => nums.map((number) => ({ orderNumber: String(number), expectedRows: (number === 10 || number === 16) ? 2 : 1 }));
const scopes = {
  current: scope([10, 11, 12, 13, 14, 15, 16, 17, 20]),
  review: scope([10, 18]),
  operations: scope([10, 11, 19]),
  maintenance: scope([10]),
};
const events = [
  // 10: all rows created; approval 3h, fully delivered 9h.
  event(10, 'a', 'created', 0), event(10, 'b', 'created', .5),
  event(10, 'a', 'changed', 2, 'In progress', 'Approved'),
  event(10, 'b', 'changed', 3, 'In progress', 'Approved'),
  event(10, 'a', 'changed', 7, 'Delivered', 'Approved'),
  event(10, 'b', 'changed', 9, 'Delivered', 'Approved'),
  // 11: approved, still open at 20h.
  event(11, 'a', 'created', 0), event(11, 'a', 'changed', 4, 'In progress', 'Approved'),
  // 12: open at 23h as of the test observation time.
  event(12, 'a', 'created', 1),
  // 13: open at 19h, in warning range.
  event(13, 'a', 'created', 5),
  // 14: closed late at 21h.
  event(14, 'a', 'created', 0), event(14, 'a', 'changed', 21, 'Delivered'),
  // 15: old data missing create; never an SLA sample.
  event(15, 'a', 'changed', 1, 'Delivered'),
  // 16: second component missing; must be excluded.
  event(16, 'a', 'created', 0),
  // 17: completed then reopened; it's again overdue, not completed.
  event(17, 'a', 'created', 0), event(17, 'a', 'changed', 4, 'Delivered'),
  event(17, 'a', 'changed', 8, 'In progress'),
  // 20: still safely on-track after 9h.
  event(20, 'a', 'created', 15),
  // 18: never approved.
  event(18, 'a', 'created', 0),
  // 19: newly created without supervisor approval; operations stage not started.
  event(19, 'a', 'created', 0),
];
const policies = [
  { workspace:'current', enabled: true, target_hours:20, warning_percent:80 },
  { workspace:'review', enabled: true, target_hours:2, warning_percent:80 },
  { workspace:'operations', enabled: true, target_hours:24, warning_percent:80 },
  { workspace:'maintenance', enabled: false, target_hours:null, warning_percent:80 },
];
const now = start + 24 * 3_600_000;
const { workspaces } = buildSlaAnalytics(scopes, events, policies, now);
assert.deepEqual([workspaces.current.eligible, workspaces.current.audited], [9, 7]);
assert.equal(workspaces.current.activeOnTrack, 1);
assert.equal(workspaces.current.activeWarning, 1);
assert.equal(workspaces.current.activeOverdue, 3);
assert.equal(workspaces.current.completedOnTime, 1);
assert.equal(workspaces.current.completedLate, 1);
assert.equal(workspaces.review.completedLate, 1);
assert.equal(workspaces.review.awaitingStart, 0);
assert.equal(workspaces.operations.awaitingStart, 1);
assert.equal(workspaces.operations.completedOnTime, 1);
assert.equal(workspaces.operations.activeWarning, 1);
assert.equal(workspaces.current.untracked, 2);
assert.equal(workspaces.current.topOverdue.length, 3);
assert.equal(workspaces.maintenance.configured, false);
assert.equal(workspaces.maintenance.activeOverdue, 0);
const withoutPolicy = buildSlaAnalytics(scopes, events, [], now);
assert.equal(withoutPolicy.workspaces.current.configured, false);
assert.equal(withoutPolicy.workspaces.current.activeOverdue, 0);
const withLaterNow = buildSlaAnalytics(scopes, events, policies, start + 30 * 3_600_000);
assert.equal(withLaterNow.workspaces.current.completedLate, 1);
assert.equal(withLaterNow.workspaces.current.onTimePercent, 50);
assert.equal(buildSlaAnalytics({current:[{orderNumber:'10',expectedRows:3}]},events,policies,now).workspaces.current.audited,0);
assert.equal(buildSlaAnalytics({current:[{orderNumber:'10',expectedRows:2}]},[...events, event(10,'b','deleted',10,'Delivered','Approved')],policies,now).workspaces.current.audited,0);
console.log('SLA dashboard analytics: assertions passed');

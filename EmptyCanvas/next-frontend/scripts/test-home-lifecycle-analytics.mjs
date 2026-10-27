import assert from 'node:assert/strict';
import { buildLifecycleAnalytics, createLifecycleScope, lifecycleOrderNumber } from '../lib/home-lifecycle-analytics.mjs';

const start = Date.parse('2026-10-11T08:00:00.000Z');
const iso = (hours) => new Date(start + hours * 3600000).toISOString();
const record = (order_number, row_id, event_type, hours, status = 'In progress', sv_approval = null, id = 0) => ({
  order_number: String(order_number), row_id, event_type, occurred_at: iso(hours), status, sv_approval, id,
});
const scopes = {
  current: [{orderNumber:'61',expectedRows:2},{orderNumber:'62',expectedRows:1},{orderNumber:'63',expectedRows:1}],
  review: [{orderNumber:'61',expectedRows:2},{orderNumber:'62',expectedRows:1}],
  operations: [{orderNumber:'61',expectedRows:2},{orderNumber:'62',expectedRows:1}],
  maintenance: [{orderNumber:'61',expectedRows:2}],
};
const events = [
  record(61,'a','created',0), record(61,'b','created',0.1),
  record(61,'a','changed',1,'In progress','Approved'),
  record(61,'b','changed',3,'In progress','Approved'),
  record(61,'a','changed',7,'Delivered','Approved'),
  record(61,'b','changed',9,'Delivered','Approved'),
  // Old, unaudited order: status changes alone must NOT generate samples.
  record(62,'c','changed',4,'Delivered','Approved'),
  // A newly tracked but still open order.
  record(63,'d','created',2),
];
const actual = buildLifecycleAnalytics(scopes, events);
assert.deepEqual([actual.current.eligible,actual.current.audited,actual.current.sample], [3,2,1]);
assert.equal(actual.current.medianHours, 9);
assert.equal(actual.review.medianHours, 3);
assert.equal(actual.operations.medianHours, 6);
assert.equal(actual.maintenance.medianHours, 6);
assert.equal(actual.current.excluded, 1);
assert.equal(actual.review.excluded, 1);
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'61',expectedRows:3}]}, events).current.sample, 0, 'Missing component must exclude duration');
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'61',expectedRows:2}]}, [...events, record(61,'b','deleted',10,'Delivered','Approved')]).current.sample, 0, 'Deletion invalidates sample');
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'61',expectedRows:2}]}, [...events, record(61,'b','renumbered',10,'Delivered','Approved')]).current.sample, 0, 'Renumbering invalidates sample');
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'61',expectedRows:2}]}, [...events, record(61,'b','changed',10,'In progress','Approved')]).current.sample, 0, 'Reopened order is not completed');
const replay = [...events, record(61,'b','changed',10,'In progress','Approved'), record(61,'b','changed',14,'Delivered','Approved')];
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'61',expectedRows:2}]}, replay).current.medianHours, 14, 'Recompletion uses latest transition');
assert.equal(lifecycleOrderNumber({items:[{orderIdNumber:70}]}),'70');
assert.deepEqual(createLifecycleScope([{orderNumber:7,itemCount:4},{orderNumber:7,itemCount:2},{orderNumber:8,itemCount:1}]), [
  {orderNumber:'7',expectedRows:4},{orderNumber:'8',expectedRows:1},
]);
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'61',expectedRows:2}]}, []).current.medianHours,null);
console.log('Home audited processing-time analytics: all tests passed');
const archivedEvents = [...events, record(61,'a','changed',10,'Archive','Approved'), record(61,'b','changed',10,'Archive','Approved')];
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'61',expectedRows:2}]}, archivedEvents).current.medianHours, 9, 'Archiving after delivery preserves completion time');
const onlyArchived = [record(71,'z','created',0,'In progress'), record(71,'z','changed',4,'Archive')];
assert.equal(buildLifecycleAnalytics({current:[{orderNumber:'71',expectedRows:1}]}, onlyArchived).current.sample, 0, 'Archive is not itself a completion event');

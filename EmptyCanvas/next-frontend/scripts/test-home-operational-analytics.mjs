import assert from 'node:assert/strict';
import { buildWorkspaceBacklog } from '../lib/home-operational-analytics.mjs';

const now = new Date('2026-10-11T12:00:00Z');
const date = (days) => new Date(now.getTime() - days * 86400000).toISOString();
const order = (days, status = 'pending', orderNumber = null) => ({
  createdTime: days === null ? null : date(days), statusBucket: status, orderNumber,
});
const source = [
  order(1,'pending',1), order(5,'pending',2), order(10,'pending',3),
  order(20,'received',4), order(43,'pending',5), order(100,'delivered',6),
  order(null,'pending',7), order(-2,'pending',8),
];
const run = (duration = 'all') => buildWorkspaceBacklog(source, {
  statusOf: (group) => group.statusBucket,
  openStatuses: ['pending','received'], duration, at: now,
});
const all = run();
assert.equal(all.open, 6);
assert.equal(all.dated, 5);
assert.equal(all.unknownDate, 1);
assert.deepEqual(all.bands.map((band) => band.count), [1,1,1,1,1]);
assert.equal(all.medianAgeDays, 10);
assert.equal(all.averageAgeDays, 15.8);
assert.equal(all.sevenPlus, 3);
assert.equal(all.fourteenPlus, 2);
assert.equal(all.oldest[0].label, 'Order #5');
assert.equal(all.oldest.length, 4);
assert.equal(run('week').open, 2);
assert.equal(run('month').open, 4);
assert.equal(run('year').open, 5);
const missing = buildWorkspaceBacklog([{ statusBucket:'pending', createdTime: null }], {openStatuses:['pending'], at:now});
assert.equal(missing.open, 1);
assert.equal(missing.medianAgeDays, null);
assert.equal(missing.unknownDate, 1);
const fallback = buildWorkspaceBacklog([{ items:[{orderIdNumber:62,createdTime:date(18)}] , statusBucket:'progress' }], { openStatuses:['progress'], at:now });
assert.equal(fallback.oldest[0].label, 'Order #62');
assert.equal(fallback.fourteenPlus, 1);
const noLeak = buildWorkspaceBacklog(source, {statusOf:(g)=>g.statusBucket,openStatuses:['pending'],at:now});
assert.equal(noLeak.open, 5); // received is not included in pending-only review
console.log('Home backlog analytics: all tests passed');

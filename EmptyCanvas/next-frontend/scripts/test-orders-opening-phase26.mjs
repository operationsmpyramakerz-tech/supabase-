import assert from 'node:assert/strict';
import { createOrderDetailsLoader } from '../components/orders/orderDetailsLoader.js';
import { selectOpeningAttempt } from '../components/orders/ordersPerfAnalysis.js';
import { loadOrderAndModalWithMetrics, markOrderOpenStarted, reportOrderVisibleAfterPaint, cancelOrderOpenTimer } from '../components/orders/orderOpeningPerformance.js';

const events = [];
const store = new Map([['pyramakerz:orders-performance-enabled', '1']]);
globalThis.window = {
  location: { search: '' },
  sessionStorage: { getItem: (key) => store.get(key) ?? null },
  dispatchEvent: (event) => { events.push(event.detail); },
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
const priorInfo = console.info;
console.info = () => {};
const group = { key: 'order-test-key', orderIds: ['private-order-id'], items: [{ summaryOnly: true }] };
let requests = 0;
let resolvePending;
const makeResponse = () => ({
  ok: true, status: 200,
  headers: { get: () => null },
  json: async () => [{ fake: true }],
});
globalThis.fetch = async () => { requests++; return makeResponse(); };
const loader = createOrderDetailsLoader({ endpoint: '/api/orders/requested/details-direct', buildGroups: () => [{ key: group.key, items: [{ fake: true }] }] });
const eventsFor = (id) => events.filter((event) => event.attemptId === id);
try {
  const first = markOrderOpenStarted('Operations');
  assert.equal(typeof first, 'number');
  assert(eventsFor(first).some(e => e.kind === 'start'));
  await loadOrderAndModalWithMetrics({ page: 'Operations', attemptId: first, loadDetails: ({ attemptId }) => loader.get(group, { attemptId }), loadModal: async () => true });
  await new Promise((r) => { reportOrderVisibleAfterPaint('Operations'); setTimeout(r, 20); });
  assert.equal(requests, 1);
  assert(eventsFor(first).some(e => e.kind === 'fetch'));
  assert(eventsFor(first).some(e => e.kind === 'source' && e.source === 'network'));
  assert(eventsFor(first).some(e => e.kind === 'open'));
  assert(eventsFor(first).some(e => e.kind === 'paint'));

  const second = markOrderOpenStarted('Operations');
  await loadOrderAndModalWithMetrics({ page: 'Operations', attemptId: second, loadDetails: ({ attemptId }) => loader.get(group, { attemptId }), loadModal: async () => true });
  assert.equal(requests, 1, 'cache must prevent a second request');
  assert(eventsFor(second).some(e => e.kind === 'source' && e.source === 'cache'));
  assert(!eventsFor(second).some(e => e.kind === 'fetch'), 'cache must not claim previous API timing');
  assert.equal(selectOpeningAttempt([{ kind: 'start', attemptId: 999 }, ...events.slice().reverse()]).attemptId, 999, 'new opening clears old measurement immediately');
  assert.equal(selectOpeningAttempt([{ kind: 'open', attemptId: 999, readyMs: 3 }, { kind: 'start', attemptId: 1000 }, { kind: 'paint', attemptId: 999, visibleMs: 8 }]).attemptId, 1000, 'late completion of an old order must not override the newer click');
  const cachePanel = selectOpeningAttempt([{ kind: 'paint', attemptId: second, visibleMs: 1 }, ...events.slice().reverse()]);
  assert.equal(cachePanel.latestSource?.source, 'cache');
  assert.equal(cachePanel.latestFetch, undefined, 'panel must not show a stale API result');
  cancelOrderOpenTimer('Operations');

  // A request started by intent prefetch may still be running at click time.
  loader.clear();
  globalThis.fetch = () => { requests++; return new Promise((resolve) => { resolvePending = resolve; }); };
  const pendingPrefetch = loader.get(group);
  await Promise.resolve(); await Promise.resolve();
  const third = markOrderOpenStarted('Operations');
  const pendingClick = loader.get(group, { attemptId: third });
  assert(eventsFor(third).some(e => e.kind === 'source' && e.source === 'in-flight'));
  assert(!eventsFor(third).some(e => e.kind === 'fetch'), 'prefetch event is not attributable to the click');
  resolvePending(makeResponse());
  await Promise.all([pendingPrefetch, pendingClick]);
  assert.equal(requests, 2);

  assert(!events.some(e => Object.keys(e).some(k => /orderId|school|product/i.test(k))), 'diagnostics must not include sensitive identifiers');
  console.info = priorInfo;
  console.log('PASS: network, cache, in-flight prefetch, paint correlation, and privacy');
} catch (e) {
  console.info = priorInfo;
  throw e;
}

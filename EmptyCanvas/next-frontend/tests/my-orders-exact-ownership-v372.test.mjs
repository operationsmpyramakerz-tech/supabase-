import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { legacyMyOrderOwnerMatches, canViewMyOrderRow } from '../lib/my-orders-owner-visibility.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const lab1 = { teamMemberId: 'member-lab-1', username: 'Moon Gardens Lab 1' };
const lab2 = { teamMemberId: 'member-lab-2', username: 'Moon Gardens Lab 2' };
const own = { id: '1', order_number: 75, team_member_id: 'member-lab-1', team_member_name: 'Moon Gardens Lab 1' };
const foreign = { id: '2', order_number: 76, team_member_id: 'member-lab-2', team_member_name: 'Moon Gardens Lab 2' };

test('Moon Gardens Lab 1 cannot read Lab 2 orders in legacy My Orders', () => {
  assert.equal(legacyMyOrderOwnerMatches(own, lab1), true);
  assert.equal(legacyMyOrderOwnerMatches(foreign, lab1), false);
  assert.equal(legacyMyOrderOwnerMatches(foreign, lab2), true);
  assert.equal(canViewMyOrderRow(foreign, lab1, { scope: null, visibleIds: [] }), false);
});

test('saved owner ID overrides name and cannot be bypassed using shared prefix', () => {
  assert.equal(legacyMyOrderOwnerMatches({ ...foreign, team_member_name: lab1.username }, lab1), false);
  assert.equal(legacyMyOrderOwnerMatches(own, { username: lab1.username }), false);
  assert.equal(legacyMyOrderOwnerMatches({ ...own, team_member_id: '' }, lab1), true);
  assert.equal(legacyMyOrderOwnerMatches({ ...own, team_member_id: '', team_member_name: lab2.username }, lab1), false);
});

test('old rows without owner ID can match only normalized full name', () => {
  const old = { team_member_id: null, team_member_name: ' MOON   GARDENS  LAB 1 ' };
  assert.equal(legacyMyOrderOwnerMatches(old, lab1), true);
  assert.equal(legacyMyOrderOwnerMatches(old, lab2), false);
  assert.equal(legacyMyOrderOwnerMatches({ team_member_id: null, team_member_name: 'Moon' }, lab1), false);
  assert.equal(legacyMyOrderOwnerMatches({}, lab1), false);
  assert.equal(legacyMyOrderOwnerMatches(old, {}), false);
});

test('explicit Own, Team and All scopes keep their intended permission semantics', () => {
  assert.equal(canViewMyOrderRow(own, lab1, { scope: 'own', visibleIds: [lab1.teamMemberId] }), true);
  assert.equal(canViewMyOrderRow(foreign, lab1, { scope: 'own', visibleIds: [lab1.teamMemberId] }), false);
  assert.equal(canViewMyOrderRow(foreign, lab1, { scope: 'team', visibleIds: [lab1.teamMemberId, lab2.teamMemberId] }), true);
  assert.equal(canViewMyOrderRow(foreign, lab1, { scope: 'all', visibleIds: [] }), true);
  assert.equal(canViewMyOrderRow(foreign, lab1, { scope: 'none', visibleIds: [] }), false);
});

test('real current-orders grouping excludes foreign orders (even when candidate scan returns them)', () => {
  const src = read('lib/current-orders-data.js');
  const start = src.indexOf('function groupRows(rows = [], account = {}, includeLocalSearchFields = false, resolved = null) {');
  const end = src.indexOf('\nexport async function loadCurrentOrdersPage(', start);
  assert.ok(start !== -1 && end > start);
  const sandbox = {
    canViewMyOrderRow,
    performance: { now: () => 1 },
    recordPerformanceSample: () => {},
    serializeOperationsCompactSummaryRow: row => ({ ...row, orderIdNumber: row.order_number }),
  };
  vm.runInNewContext(`${src.slice(start, end)}\nglobalThis.runGroupRows = groupRows;`, sandbox);
  const groups = sandbox.runGroupRows([own, foreign], lab1, false, { scope: null, visibleIds: [] });
  assert.equal(groups.size, 1);
  assert.ok(groups.has(75));
  assert.ok(!groups.has(76));
  // A shared order number containing another owner's component must fail closed.
  const mixed = sandbox.runGroupRows([own, { ...foreign, order_number: 75 }], lab1, false, { scope: null, visibleIds: [] });
  assert.equal(mixed.size, 0);
});

test('list, detail and tracking routes use the same owner enforcement', () => {
  const current = read('lib/current-orders-data.js');
  const tracking = read('lib/order-tracking-data.js');
  assert.match(current, /if \(!canViewMyOrderRow\(row, account, resolved\)\)/);
  assert.match(current, /const visible = \(Array\.isArray\(rows\) \? rows : \[\]\)\.filter\(\(row\) =>\s*canViewMyOrderRow\(row, account, resolved\)\)/);
  assert.doesNotMatch(current, /split\(\/\\s\+\/\)\[0\]/);
  assert.match(tracking, /rows\.some\(row => !canViewMyOrderRow\(row, account, resolved\)\)/);
  assert.match(tracking, /row && canViewMyOrderRow\(row, account, resolved\)/);
});

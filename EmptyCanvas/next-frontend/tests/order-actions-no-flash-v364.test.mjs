import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, 'components/orders', file), 'utf8');

// An actions trigger must never be rendered based on a missing/unknown permission.
test('Loading details never show a fake actions menu before permission checks', () => {
  const loading = read('OrderDetailsLoadingOverlay.jsx');
  assert.doesNotMatch(loading, /co-modal-more-btn|co-modal-more-dots|orders-detail-loading-more/);
});

test('My Orders actions menu checks explicit grants, separately from other controls', () => {
  const current = read('CurrentOrdersHeavyModals.jsx');
  assert.match(current, /const canUseMenu = \(action\) => permissions\?\.\[action\] === true;/);
  assert.match(current, /const hasMenuAction = archived \? \(canUseMenu\("unarchive"\) \|\| canUseMenu\("delete"\)\)/);
  for (const action of ['edit', 'archive', 'unarchive', 'delete']) {
    assert.match(current, new RegExp(`canUseMenu\\("${action}"\\)`));
  }
});

test('Operations Orders actions menu is fail-closed for missing or false permissions', () => {
  const operations = read('OperationsOrdersHeavyModals.jsx');
  assert.match(operations, /const canEditMenu = permissions\.edit === true;/);
  assert.match(operations, /const canDeleteMenu = permissions\.delete === true;/);
  assert.match(operations, /!isEditing && \(canEditMenu \|\| canDeleteMenu\)/);
  assert.match(operations, /: isEditing \? <div className="next-operations-edit-mode-badge"/);
  assert.doesNotMatch(operations, /!isEditing && \(permitted\("edit"\) \|\| permitted\("delete"\)\)/);
});

test('Maintenance Orders actions menu is fail-closed for missing or false permissions', () => {
  const maintenance = read('MaintenanceHeavyModals.jsx');
  assert.match(maintenance, /\(permissions\.edit === true \|\| permissions\.archive === true \|\| permissions\.delete === true\)/);
  for (const action of ['edit', 'archive', 'delete']) {
    assert.match(maintenance, new RegExp(`\\{permissions\\.${action} === true \\? <button`));
  }
});

test('Orders Review actions menu already checks explicit permissions', () => {
  const review = read('OrdersReviewHeavyModals.jsx');
  assert.match(review, /const showEdit = permissions\.update_approval &&/);
  assert.match(review, /const showArchive = permissions\.archive &&/);
  assert.match(review, /const showUnarchive = permissions\.unarchive &&/);
  assert.match(review, /\(showEdit \|\| showArchive \|\| showUnarchive\)/);
});

test('Explicit grants show only the authorized actions', () => {
  const cases = [
    [{}, []],
    [{ edit: false, archive: false, delete: false }, []],
    [{ edit: true }, ['edit']],
    [{ archive: true }, ['archive']],
    [{ delete: true }, ['delete']],
    [{ edit: true, archive: true, delete: false }, ['edit', 'archive']],
  ];
  for (const [permissions, expected] of cases) {
    assert.deepEqual(['edit', 'archive', 'delete'].filter(action => permissions[action] === true), expected);
  }
});

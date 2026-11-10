import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const toolbar = read('components/orders/OrdersEmptyState.jsx');
const workspaceCss = read('public/css/orders-workspace.css');
const preferences = read('components/orders/OrdersPreferencesControl.jsx');
const shell = read('components/PersistentAppShell.jsx');
const pages = [
  'OperationsOrdersClient.jsx', 'CurrentOrdersClient.jsx',
  'OrdersReviewClient.jsx', 'MaintenanceOrdersClient.jsx',
];

test('All four orders pages use the single shared icon-only Preferences button', () => {
  for (const page of pages) {
    const source = read(`components/orders/${page}`);
    assert.match(source, /import OrdersPreferencesControl from "\.\/OrdersPreferencesControl"/);
    if (page === 'OperationsOrdersClient.jsx') {
      assert.match(source, /<OrdersPreferencesControl[^>]+sortMode=\{sortMode\}[^>]+onApply=\{applyFilters\}/);
    } else {
      assert.match(source, /<OrdersPreferencesControl[^>]+sortMode=\{sortMode\}[^>]+onSortChange=\{setSortMode\}/);
      assert.match(source, /onFilterChange=\{setType\}/);
    }
    assert.doesNotMatch(source, /<OrdersListHeader /);
  }
});

test('Speed button and shown count are removed from the shared toolbar, without deleting performance tooling', () => {
  const header = toolbar.split('export function OrdersListHeader(')[1].split('export default function OrdersEmptyState')[0];
  assert.doesNotMatch(header, /orders-workspace-perf-toggle|orders-workspace-list-head__count|setOrdersPerfEnabled|shown|>Speed</);
  assert.ok(read('components/orders/orderOpeningPerformance.js').includes('ordersPerfEnabled'));
});

test('Sort dropdown preserves existing sort modes exactly', () => {
  for (const key of ['latest', 'oldest', 'number-desc', 'number-asc', 'creator']) {
    assert.match(toolbar, new RegExp(`value: "${key}"`));
    if (key !== "latest") assert.match(toolbar, new RegExp(`mode === "${key}"`));
  }
  assert.match(toolbar, /mode = "latest"/);
  assert.match(toolbar, /onSortChange\(option\.value\)/);
});

test('Combined Preferences popover has Filter and Sort tabs with accessible controls', () => {
  for (const needle of ['aria-haspopup="dialog"', 'aria-expanded={open}', 'role="dialog"', 'role="tablist"', 'role="tabpanel"', 'aria-pressed=', 'Escape', 'pointerdown', 'ArrowRight', 'ArrowLeft']) {
    assert.ok(preferences.includes(needle), needle);
  }
  for (const key of ['latest', 'oldest', 'number-desc', 'number-asc', 'creator']) {
    assert.ok(preferences.includes(`value: "${key}"`), key);
  }
  assert.match(workspaceCss, /orders-preferences__panel\s*\{/);
  assert.match(workspaceCss, /orders-preferences__tabs/);
  assert.match(workspaceCss, /orders-preferences__active-dot/);
  assert.match(preferences, /<ClassicOrderIcon name="preferences"/);
  assert.doesNotMatch(preferences, /orders-workspace-sort__value/);
});

test('Route style links use cache-busted versions for production', () => {
  assert.equal((shell.match(/orders-workspace-v382-filter-panel/g) || []).length, 2);
});

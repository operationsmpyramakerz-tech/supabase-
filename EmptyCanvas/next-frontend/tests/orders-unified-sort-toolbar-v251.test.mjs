import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const toolbar = read('components/orders/OrdersEmptyState.jsx');
const workspaceCss = read('public/css/orders-workspace.css');
const redesignCss = read('public/css/ui-redesign.css');
const shell = read('components/PersistentAppShell.jsx');
const layout = read('app/layout.jsx');
const pages = [
  'OperationsOrdersClient.jsx', 'CurrentOrdersClient.jsx',
  'OrdersReviewClient.jsx', 'MaintenanceOrdersClient.jsx',
];

test('All four orders pages render the same shared OrdersListHeader', () => {
  for (const page of pages) {
    const source = read(`components/orders/${page}`);
    assert.match(source, /import OrdersEmptyState,\s*\{ OrdersListHeader, sortOrderGroups \} from "\.\/OrdersEmptyState"/);
    assert.match(source, /<OrdersListHeader[^>]+sortMode=\{sortMode\}[^>]+onSortChange=\{setSortMode\}/);
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

test('Modern sort dropdown has accessible states and supports keyboard navigation', () => {
  for (const needle of ['aria-haspopup="menu"', 'aria-expanded={sortOpen}', 'role="menuitemradio"', 'aria-checked={sortMode === option.value}', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'closeOnOutsideClick']) {
    assert.ok(toolbar.includes(needle), needle);
  }
  assert.match(workspaceCss, /orders-workspace-sort__menu\s*\{/);
  assert.match(workspaceCss, /orders-workspace-sort__option\.is-active/);
});

test('Filter selected-state dot is dark, scoped to orders pages', () => {
  const rule = redesignCss.match(/:where\(body\.current-orders-page, body\.operations-orders-page, body\.orders-review-page, body\[data-orders-view="maintenance"\], body\.page-orders-maintenance-orders\) \.orders-type-filter__button-dot\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, 'orders-only indicator selector');
  assert.match(rule, /background:\s*#111827\s*!important/);
  assert.doesNotMatch(rule, /#FF5A1F|255,90,31/);
});

test('Route style links use cache-busted versions for production', () => {
  assert.equal((shell.match(/orders-workspace-v9-modern-sort/g) || []).length, 2);
  assert.match(layout, /ui-redesign\.css\?v=orders-filter-dot-black-251/);
});

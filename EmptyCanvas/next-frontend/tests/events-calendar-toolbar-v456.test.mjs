import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const client = read('components/events/EventsCalendarClient.jsx');
const css = read('public/css/events.css');
test('the agenda uses the persistent header search and cleans up its input listener', () => {
  assert.match(client,/querySelector\("\.classic-app-shell \.main-header \.searchbar input"\)/);
  assert.match(client,/const handle = event => setSearch\(event.target.value \|\| ""\)/);
  assert.match(client,/input\.addEventListener\("input", handle\)/);
  assert.match(client,/input\.removeEventListener\("input", handle\)/);
  assert.match(client,/\.includes\(lower\(search\)\)/);
  assert.doesNotMatch(client,/className="agenda-search"/);
  assert.match(read('components/HeaderSearch.jsx'),/dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/);
});
test('filter is an icon-only popover beside the tabs with original confirmation choices', () => {
  assert.match(client,/<AgendaStatusFilter activeList=\{activeList\} value=\{filter\} onChange=\{setFilter\}\/>/);
  assert.doesNotMatch(client,/<select value=\{filter\}/);
  for (const status of ['all','pending','confirmed','cancelled']) assert.match(client,new RegExp(`key: "${status}"`));
  assert.match(client,/activeList !== "upcoming" \? \[\{ key: "cancelled"/);
  assert.match(client,/onChange\(option.key\); closeAndFocus\(\)/);
  assert.match(client,/eventConfirmation\(event.status\) !== filter/);
  assert.match(client,/if \(day >= today && filter === "cancelled"\) setFilter\("all"\)/);
});
test('popover closes on outside pointer and Escape and retains selection accessibility', () => {
  assert.match(client,/document\.addEventListener\("pointerdown", onPointerDown\)/);
  assert.match(client,/document\.removeEventListener\("pointerdown", onPointerDown\)/);
  assert.match(client,/event.key === "Escape" && open/);
  assert.match(client,/aria-expanded=\{open\}/);
  assert.match(client,/aria-pressed=\{value === option.key\}/);
});
test('today has a black outline with contrasting dark mode and separate selected state', () => {
  assert.match(css,/\.agenda-calendar \.agenda-day\.is-today\s*\{\s*border-color: #111111 !important;/);
  assert.match(css,/html\[data-theme="dark"\] \.agenda-v2 \.agenda-calendar \.agenda-day\.is-today\s*\{\s*border-color: #e5e7eb !important;/);
  assert.match(client,/aria-current=\{sameDay\(day,today\) \? "date" : undefined\}/);
  assert.match(css,/\.agenda-day\.is-selected\{background:var\(--ag-orange\)/);
});
test('compact toolbar and horizontal popover cards override legacy button rules', () => {
  assert.match(css,/\.agenda-list \.agenda-toolbar \{[^}]*grid-template-columns: minmax\(0, 1fr\) 38px;/s);
  assert.match(css,/\.agenda-status-menu > \.agenda-status-menu-option \{[^}]*flex-direction: row !important;/s);
  assert.match(css,/\.agenda-status-filter > \.agenda-status-filter-trigger \{[^}]*padding: 0 !important;/s);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const css = read('public/css/projects-preparing.css');
const testing = read('components/preparing/ProjectTesting.jsx');

test('icon-only Testing filter overrides space-between to center its pictogram', () => {
  const scoped = css.slice(css.indexOf('/* v281 · Align the Testing filter pictogram'));
  assert.match(scoped, /\.pr-pt-modern \.pr-pt-toolbar \.pr-pt-filter-select \.pr-modern-select-trigger\s*\{[^}]*display:flex;[^}]*align-items:center;[^}]*justify-content:center;/s);
  assert.match(scoped, /\.pr-pt-filter-select \.pr-modern-select-trigger>svg\s*\{[^}]*display:block;[^}]*width:21px;[^}]*height:21px;[^}]*margin:0;/s);
});

test('remaining KPI uses a slightly larger vector clock, without impacting other KPIs', () => {
  assert.match(testing, /clock:<><circle cx="12" cy="12" r="9"\/>/);
  assert.match(testing, /stat\.key==="remaining"\?<TestingIcon name="clock" size=\{25\}\/>:stat\.mark/);
  const scoped = css.slice(css.indexOf('/* v281 · Align the Testing filter pictogram'));
  assert.match(scoped, /\.pr-pt-stat--remaining \.pr-pt-stat-icon svg\s*\{[^}]*width:25px;[^}]*height:25px;/s);
});

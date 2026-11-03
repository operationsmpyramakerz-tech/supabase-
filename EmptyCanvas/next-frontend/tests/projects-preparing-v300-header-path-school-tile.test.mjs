import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ui = read('components/preparing/PreparingClient.jsx');
const css = read('public/css/projects-preparing.css');
const page = read('app/projects-preparing/page.jsx');

test('project folder path appears in shared title with working client-side navigation', () => {
  assert.match(ui, /createPortal\(/);
  assert.match(ui, /document\.querySelector\("\.classic-app-shell \.main-header \.dash-title"\)/);
  assert.match(ui, /onClick=\{onProjects\} title="All projects">Projects Preparing/);
  assert.match(ui, /onClick=\{onProject\}/);
  assert.match(ui, /title=\{school\.beneficiary_name\}/);
  assert.match(ui, /function goToProjectsIndex\(\)/);
  assert.match(ui, /setSchoolId\(""\); setProjectId\(""\)/);
  assert.doesNotMatch(ui, /\{project && <div className="pr-header">/);
  assert.match(css, /\.main-header \.dash-title:has\(> \.pr-header-path\)/);
  assert.match(page, /v300-header-path-school-tile/);
});

test('Schools tab has only global search and fixed grid; add tile is first and matches Add Project', () => {
  const tab = ui.split('{projectTab === "schools" &&')[1].split('{project && !school && showWarehouse')[0];
  assert.ok(tab);
  assert.doesNotMatch(tab, /pr-project-school-search|pr-project-view-switch|schoolView/);
  assert.match(ui, /\.system-header-search__input/);
  assert.ok(tab.indexOf('className="pr-add-school-tile"') < tab.indexOf('schoolFiltered.map(row =>'), 'Add School first');
  assert.match(tab, /canManage && <button type="button" className="pr-add-school-tile" onClick={openSchools}/);
  assert.match(tab, /className="pr-index-add-icon"/);
  assert.match(css, /\.pr-dashboard-schools \.pr-add-school-tile[\s\S]*?#22c76c/);
  assert.match(css, /\.pr-dashboard-schools \.pr-add-school-tile \.pr-index-add-icon[\s\S]*?#06bc51/);
});

test('modified JSX is syntactically valid', () => {
  const parsed = ts.createSourceFile('PreparingClient.jsx', ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics.map(e => e.messageText), []);
});

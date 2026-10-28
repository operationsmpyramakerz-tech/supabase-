import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const preparing = read('components/preparing/PreparingClient.jsx');
const css = read('public/css/projects-preparing.css');
const users = read('components/users-center/UsersCenterDialogs.jsx');
const nav = read('lib/navigation-config.js');

test('Proposals-style cards keep both project and school drill-down actions', () => {
  assert.match(preparing, /className="pr-folder-main"/);
  assert.match(preparing, /pr-folder-figure/);
  assert.match(preparing, /pr-folder-paper left/);
  assert.match(preparing, /pr-folder-paper middle/);
  assert.match(preparing, /pr-folder-paper right/);
  assert.match(preparing, /openProjectFolder\(row\.id\)/);
  assert.match(preparing, /openSchoolFolder\(row\.id\)/);
  assert.match(preparing, /onPointerDown=\{event=>\{if\(canManage\)startFolderHold/);
  assert.match(preparing, /onContextMenu=\{event=>\{if\(canManage\)folderContextMenu/);
  assert.match(preparing, /event\.key === "ContextMenu"/);
  for (const action of ['Project Dashboard','Project Kit Cartons','Rename','Delete','Packing & Delivery','Technical Follow-up','Final Closing'])
    assert.ok(preparing.includes(action), action);
});
test('project folder shows Rename/Delete only and deletion uses explicit server action', () => {
  const folderArea = preparing.split('<div className="pr-folders"')[1].split('        {project && !projectSchools.length')[0];
  const projectMenu = folderArea.split('aria-label={`${row.name} actions`}')[1].split('</div>}')[0];
  assert.match(projectMenu,/renameProjectFolder\(row\)/);
  assert.match(projectMenu,/deleteProjectFolder\(row\)/);
  assert.doesNotMatch(projectMenu,/Open Project|Project Dashboard|Kit Cartons|Edit Project/);
  assert.match(preparing,/action:"delete_project"/);
  assert.match(read('app/api/projects-preparing/route.js'),/export async function DELETE/);
});
test('Proposals exact compact folder dimensions and accessibility work on tablet and phone', () => {
  assert.match(css, /\.pr-root \.pr-folder-card \{/);
  assert.match(css, /\.pr-root--index \.pr-folder-card \{[\s\S]*?width:154px; height:144px; min-height:144px;/);
  assert.match(css, /\.pr-root--index \.pr-folder-card \{[\s\S]*?border:5px solid #101217/);
  assert.match(css, /\.pr-root--index \.pr-folders \{[\s\S]*?minmax\(154px,154px\)/);
  assert.match(css, /\.pr-root \.pr-folder-main::before/);
  assert.match(css, /\.pr-root \.pr-folder-paper/);
  assert.match(css, /\.pr-folder-menu-trigger:focus-visible/);
  assert.match(css, /\.pr-root \.pr-folder-menu button:hover/);
  assert.match(css, /@media\(max-width:670px\)/);
});
test('Products route exists in navigation and remains protected by its view grant', () => {
  assert.match(nav, /label: "Products", href: "\/next\/products", icon: "package"/);
  const shell = read('components/AppShell.jsx');
  assert.match(shell, /canSeeNavigationLink\(link, allowedPages\)/);
  const route = read('app/products/page.jsx');
  assert.match(route, /featureGate\(gateResult\.value, "products\.view"\)/);
});
test('advanced permissions must not infer migrated Products from unrelated enabled flag', () => {
  const block = users.split('setEnabledModules({')[1].split('"orders.my":')[0];
  assert.doesNotMatch(block, /result\.enabled === true/);
  assert.match(block, /stored\.some\(item => item\.key\.startsWith\("products\."\)/);
  assert.match(block, /PHASE2A_LEGACY_MARKERS\.products/);
});
test('changed JSX parses and CSS version is refreshed', () => {
  for (const file of ['components/preparing/PreparingClient.jsx','components/users-center/UsersCenterDialogs.jsx']) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    assert.deepEqual(source.parseDiagnostics.map(d => d.messageText), [], file);
  }
  assert.match(read('app/projects-preparing/page.jsx'), /projects-preparing\.css\?v=238/);
});

// v226: actual filtering controls replace oversized, noninteractive stats on the index.
test('compact first-page project tabs filter source data with keyboard-safe buttons', () => {
  assert.match(preparing, /projectFilter, setProjectFilter/);
  assert.match(preparing, /role="group" aria-label="Filter project folders"/);
  assert.match(preparing, /aria-pressed=\{projectFilter === tab.key\}/);
  assert.match(preparing, /projectFilter === "delivered"/);
  assert.match(preparing, /projectFilter === "closed"/);
  assert.match(preparing, /className="pr-search pr-index-search"/);
  assert.match(css, /\.pr-root--index \.pr-project-tab\.is-active/);
  assert.match(css, /\.pr-root--index \.pr-create-project/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const postcss = require('postcss');
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const parent = read('components/preparing/PreparingClient.jsx');
const bom = read('components/preparing/ProjectMasterComponents.jsx');
const css = read('public/css/projects-preparing.css');

test('Components tab directly renders the complete Master BOM without a modal or launch card', () => {
  const panel = parent.split('{projectTab === "components" &&')[1]?.split('{projectTab === "schools" &&')[0];
  assert.ok(panel, 'Components tab must exist');
  assert.match(panel, /role="tabpanel" aria-labelledby="pr-detail-tab-components"/);
  assert.match(panel, /<ProjectMasterComponents key=\{projectId\}[^>]* inline/);
  assert.match(panel, /allowed=\{canManage\} request=\{api\}/);
  assert.doesNotMatch(panel, /pr-project-components-card|setShowProjectBOM|pr-components-overlay/);
  assert.doesNotMatch(parent, /showProjectBOM|setShowProjectBOM/);
});

test('Inline Master BOM preserves editing, search, kit folders, and parent refresh', () => {
  assert.match(bom, /inline=false,onChanged/);
  assert.match(bom, /\{!inline&&<button className="pr-pbom-close"/);
  assert.match(bom, /onChanged\?\.\(\)/);
  assert.match(parent, /onChanged=\{\(\)=>\{setProjectStageRevision\(value=>value\+1\);reload\(\)/);
  for (const text of ['pr-pbom-summary-card--black', 'pr-pbom-summary-card--orange', 'pr-pbom-summary-card--white', 'pr-pbom-search', 'pr-kit-group-list', 'pr-pbom-inline-qty', 'ProjectProductPicker', 'operation:"delete"']) {
    assert.ok(bom.includes(text), `${text} must remain available`);
  }
  assert.match(css, /\.pr-root--project \.pr-project-tab-pane--components \.pr-pbom--inline/);
  assert.match(css, /\.pr-root--project \.pr-project-tab-pane--components \.pr-pbom--inline \.pr-kit-group-list/);
});

test('JSX, stylesheet and cache-busting URL remain valid', () => {
  for (const file of ['components/preparing/PreparingClient.jsx','components/preparing/ProjectMasterComponents.jsx']) {
    const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
    assert.deepEqual(parsed.parseDiagnostics, [], file);
  }
  assert.doesNotThrow(() => postcss.parse(css));
  assert.match(read('app/projects-preparing/page.jsx'), /v296-inline-components-tab/);
});

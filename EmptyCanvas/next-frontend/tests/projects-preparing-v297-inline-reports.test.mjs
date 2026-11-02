import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ui = read('components/preparing/PreparingClient.jsx');
const dashboard = read('components/preparing/ProjectDashboard.jsx');
const css = read('public/css/projects-preparing.css');
const page = read('app/projects-preparing/page.jsx');

test('Reports tab embeds the Master Dashboard without an intermediary card or dialog', () => {
  const reportSection = ui.split('{projectTab === "reports" &&')[1]?.split('{project && !school && showWarehouse &&')[0] || '';
  assert.match(reportSection, /id="pr-detail-panel-reports" role="tabpanel"/);
  assert.match(reportSection, /<ProjectDashboard key=\{projectId\}[^>]* inline/);
  assert.doesNotMatch(reportSection, /pr-project-report-card|pr-components-overlay|role="dialog"/);
  assert.doesNotMatch(ui, /showDashboard|setShowDashboard/);
  assert.match(ui, /setSchoolId\(id\);setProjectTab\("schools"\)/);
});

test('Inline report preserves report tabs, CSV exports, refresh, school drill-down and error retry', () => {
  assert.match(dashboard, /inline = false/);
  assert.match(dashboard, /pr-report-root--inline/);
  assert.match(dashboard, /\{!inline && <button[^>]*onClick=\{onClose\}>Close<\/button>\}/);
  assert.match(dashboard, /onClick=\{load\} disabled=\{loading\}>Refresh/);
  assert.match(dashboard, /Ministry Status CSV/);
  assert.match(dashboard, /Operations CSV/);
  assert.match(dashboard, /"School matrix"/);
  assert.match(dashboard, /"Risks & follow-up"/);
  assert.match(dashboard, /onOpenSchool\(row\.id\)/);
  assert.match(dashboard, /Retry/);
});

test('Report is full-width with native page scrolling and responsive matrix overflow', () => {
  assert.match(css, /\.pr-root--project \.pr-project-tab-pane--reports \.pr-report-root--inline/);
  assert.match(css, /pr-report-table-scroll \{\s*overflow-x:auto;/);
  assert.match(css, /max-width:980px/);
  assert.match(page, /v297-inline-reports-tab/);
  for (const [filename, source] of [['PreparingClient.jsx', ui], ['ProjectDashboard.jsx', dashboard]]) {
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), [], filename);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const ui = read("components/preparing/PreparingClient.jsx");
const css = read("public/css/projects-preparing.css");
const page = read("app/projects-preparing/page.jsx");

const tabRegion = ui.split('<nav className="pr-project-detail-tabs"')[1]?.split('</nav>')[0] || '';
const overview = ui.split('{projectTab === "overview" &&')[1]?.split('{projectTab === "stages" &&')[0] || '';
const stages = ui.split('{projectTab === "stages" &&')[1]?.split('{projectTab === "components" &&')[0] || '';

test("project detail has four keyboard-accessible tabs, including Stages and no Reports", () => {
  assert.deepEqual([...tabRegion.matchAll(/\{key:"([^"]+)",label:"([^"]+)"/g)].map(m => [m[1],m[2]]), [
    ["overview","Overview"], ["stages","Stages"], ["components","Components"], ["schools","Schools"],
  ]);
  assert.match(ui, /const keys = \["overview", "stages", "components", "schools"\];/);
  assert.match(ui, /role="tablist"/);
  assert.match(ui, /role="tab"/);
  assert.match(ui, /aria-selected=\{projectTab === tab\.key\}/);
  assert.doesNotMatch(tabRegion, /Reports/);
});

test("Overview shows project metrics, five-stage progress, and embedded dashboard without stages", () => {
  assert.match(overview, /Project Overview/);
  assert.match(overview, /Overall Progress/);
  assert.match(overview, /<ProjectDashboard key=\{projectId\}[^>]* inline/);
  assert.match(overview, /setSchoolId\(id\);setProjectTab\("schools"\)/);
  assert.doesNotMatch(overview, /projectStepCards\.map|pr-project-step-timeline/);
  assert.doesNotMatch(overview, /showDashboard|pr-components-overlay/);
});

test("Stages has all five clickable operational step cards, live percentages, and error retry", () => {
  assert.match(stages, /id="pr-detail-panel-stages" role="tabpanel"/);
  assert.match(stages, /pr-project-steps-panel--tab/);
  assert.match(stages, /projectStepCards\.map/);
  assert.match(stages, /step\.open/);
  assert.match(stages, /projectStepPercents\?\.\[index\]/);
  assert.match(stages, /pr-step-kpi-track/);
  assert.match(stages, /projectStageError/);
  assert.match(stages, /setProjectStageRevision\(n=>n\+1\)/);
  assert.match(stages, /StepAccessAvatars access=\{stepAccess\?\.\[step\.key\]\}/);
  for (const title of ["Project Testing", "Warehouse Receiving", "Production Receiving", "Box Distribution", "Project Kit Cartons"]) {
    assert.match(ui, new RegExp(`title:"${title}"`));
  }
});

test("Overview report and Stages use independent responsive panels without modal scrolling", () => {
  assert.match(css, /\.pr-root--project \.pr-project-detail-overview \{/);
  assert.match(css, /\.pr-project-overview-reports/);
  assert.match(css, /\.pr-project-steps-panel--tab/);
  assert.match(css, /overflow-x:auto;overscroll-behavior-x:contain/);
  assert.match(page, /v298-stages-overview-reports/);
  const parsed = ts.createSourceFile("PreparingClient.jsx", ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics.map(error => error.messageText), []);
});

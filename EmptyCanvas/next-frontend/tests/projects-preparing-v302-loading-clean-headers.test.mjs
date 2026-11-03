import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const postcss=require('postcss');
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const ui=read('components/preparing/PreparingClient.jsx');
const bom=read('components/preparing/ProjectMasterComponents.jsx');
const css=read('public/css/projects-preparing.css');
const loading=read('app/projects-preparing/loading.jsx');
const loadingCSS=read('app/projects-preparing/loading.module.css');

test('route loading uses a responsive and accessible skeleton instead of plain loading text',()=>{
  assert.match(loading,/import styles from "\.\/loading\.module\.css"/);
  assert.match(loading,/aria-busy="true"/);
  assert.match(loading,/role="status"/);
  assert.match(loading,/styles\.hero/);
  assert.match(loading,/styles\.stats/);
  assert.match(loading,/styles\.tabs/);
  assert.match(loading,/styles\.folders/);
  assert.doesNotMatch(loading,/style=\{\{ padding: 24 \}\}/);
  assert.match(loadingCSS,/@media \(max-width: 520px\)/);
  assert.match(loadingCSS,/@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotThrow(()=>postcss.parse(loadingCSS));
});

test('Schools tab removes duplicated title/count but retains school cards and management access',()=>{
  const tab=ui.split('{projectTab === "schools" &&')[1]?.split('{project && !school && showWarehouse')[0];
  assert.ok(tab);
  assert.doesNotMatch(tab,/<h2>Schools<\/h2>|pr-project-schools-heading/);
  assert.match(tab,/className="pr-add-school-tile" onClick=\{openSchools\}/);
  assert.match(tab,/schoolFiltered\.map\(row =>/);
  assert.match(css,/\.pr-root\.pr-root--project \.pr-project-tab-pane--schools \.pr-folders\.pr-dashboard-schools[\s\S]*?margin-top:0/);
});

test('Stages has no redundant count or description but preserves full stage list',()=>{
  const tab=ui.split('{projectTab === "stages" &&')[1]?.split('{projectTab === "components" &&')[0];
  assert.ok(tab);
  assert.match(tab,/<h2>Project Steps<\/h2>/);
  assert.doesNotMatch(tab,/5 stages|These five stages determine/);
  assert.match(tab,/projectStepCards\.map\(/);
  assert.match(tab,/aria-valuenow/);
});

test('Components title is hidden only inline; modal still retains heading and Close',()=>{
  assert.match(bom,/\{!inline&&<div className="pr-manifest-title pr-pbom-title">/);
  assert.match(bom,/PROJECT · \{project\.name\}/);
  assert.match(bom,/<h3>Project Components<\/h3>/);
  assert.match(bom,/\{!inline&&<button className="pr-pbom-close"/);
  assert.match(bom,/pr-pbom-summary/);
});

test('updated JSX parses and project stylesheet version refreshes',()=>{
  for(const file of ['components/preparing/PreparingClient.jsx','components/preparing/ProjectMasterComponents.jsx','app/projects-preparing/loading.jsx']){
    const parsed=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
    assert.deepEqual(parsed.parseDiagnostics.map(err=>err.messageText),[],file);
  }
  assert.doesNotThrow(()=>postcss.parse(css));
  assert.match(read('app/projects-preparing/page.jsx'),/v303-granular-stage-permissions/);
});

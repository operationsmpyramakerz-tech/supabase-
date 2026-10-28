import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const ui=read('components/preparing/PreparingClient.jsx');
const api=read('app/api/projects-preparing/route.js');
const service=read('lib/preparing-service.js');
const sql=read('sql/2026-10-28-preparing-folder-rename-archive-v233.sql');

test('long press shows exactly Rename and Delete on project folders, never project shortcuts',()=>{
  const folderArea=ui.split('!project ? projectFiltered.map')[1].split(': schoolFiltered.map')[0];
  const menu=folderArea.split('aria-label={`${row.name} actions`}')[1].split('</div>}')[0];
  const actions=[...menu.matchAll(/role="menuitem"/g)];
  assert.equal(actions.length,2);
  assert.match(menu,/renameProjectFolder\(row\)/);
  assert.match(menu,/deleteProjectFolder\(row\)/);
  assert.doesNotMatch(menu,/Open Project|Project Dashboard|Kit Cartons|Edit Project/);
  assert.match(folderArea,/if\(canManage\)startFolderHold/);
});
test('project header has only Add Schools for managers, no Edit shortcut',()=>{
  const header=ui.split('<div className="pr-top-actions">')[1].split('</div>')[0];
  assert.match(header,/Add Schools/);
  assert.doesNotMatch(header,/Edit|openEditProject/);
});
test('rename changes only the name in a locked transaction, preserving project metadata',()=>{
  const section=sql.split('CREATE OR REPLACE FUNCTION public.erp_preparing_rename_project(')[1].split('REVOKE ALL ON FUNCTION public.erp_preparing_rename_project')[0];
  assert.match(section,/WHERE id=p_project_id FOR UPDATE/);
  assert.match(section,/SET name=new_name,updated_at=now\(\)/);
  assert.doesNotMatch(section,/UPDATE public\.erp_preparing_schools|source_proposal_id\s*=|description\s*=/);
  assert.match(ui,/action:"rename_project"/);
  assert.match(api,/access\("manage"\)/);
});
test('delete is soft archive with a name confirmation, not SQL DELETE or cascading',()=>{
  const section=sql.split('CREATE OR REPLACE FUNCTION public.erp_preparing_archive_project(')[1];
  assert.match(section,/WHERE id=p_project_id FOR UPDATE/);
  assert.match(section,/target\.name IS DISTINCT FROM p_expected_name/);
  assert.match(section,/SET deleted_at=now\(\),deleted_by_id=p_member_id/);
  assert.doesNotMatch(section,/DELETE FROM|TRUNCATE|DROP TABLE/i);
  assert.match(ui,/deleteConfirmName !==/);
  assert.match(ui,/action:"delete_project"/);
  assert.match(api,/export async function DELETE\(request\)/);
  assert.match(api,/await access\("manage"\)/);
});
test('listing excludes archived projects and orphan UI schools/stages',()=>{
  assert.match(service,/deleted_at:"is\.null"/);
  assert.match(service,/visibleProjectIds/);
  assert.match(service,/visibleSchoolIds/);
  assert.match(service,/if \(!row \|\| row\.deleted_at\) fail/);
  assert.match(sql,/ALTER TABLE public\.erp_preparing_project_actions_audit ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.erp_preparing_archive_project/);
});
test('new stylesheet and changed JSX/API/service parse cleanly',()=>{
  assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=237/);
  for(const name of ['components/preparing/PreparingClient.jsx','app/api/projects-preparing/route.js','lib/preparing-service.js']){
    const source=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,name.endsWith('.jsx')?ts.ScriptKind.JSX:ts.ScriptKind.JS);
    assert.deepEqual(source.parseDiagnostics.map(d=>d.messageText),[],name);
  }
});

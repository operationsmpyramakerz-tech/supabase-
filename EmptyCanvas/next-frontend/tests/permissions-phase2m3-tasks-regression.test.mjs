import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { taskScopeFor, taskOwnerAllowed, taskAssigneeAllowed, taskCardAllows, TASK_SCOPE_MARKER } from '../lib/task-data-scope.mjs';
import { featureAllowed } from '../lib/feature-permissions-registry.js';

const read = (file) => readFileSync(resolve(import.meta.dirname, '..', file), 'utf8');
const dataUri = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const fakeDb = dataUri(`
const tickets = { self: {id:'self', created_by_id:'manager'}, team: {id:'team', created_by_id:'alice'}, outside: {id:'outside', created_by_id:'eve'} };
const sections = { s1: {id:'s1',ticket_id:'self'}, s2:{id:'s2',ticket_id:'team'}, s3:{id:'s3',ticket_id:'outside'} };
const assignments = { a1:{id:'a1',section_id:'s1',assignee_id:'manager'}, a2:{id:'a2',section_id:'s2',assignee_id:'alice'}, a3:{id:'a3',section_id:'s3',assignee_id:'eve'} };
export async function selectById(table,id){return (table==='department_tickets'?tickets:table==='department_ticket_sections'?sections:table==='department_ticket_section_assignments'?assignments:{})[id]||null}
export async function select(table,filters){
  if(table==='erp_member_scope_team_links') {
    if(filters.manager_member_id === 'eq.broken') throw Error('missing table');
    return filters.manager_member_id==='eq.manager'?[{visible_member_id:'alice'}]:[];
  }
  if(table==='department_ticket_section_assignments'){
    const ids = new Set((filters.assignee_id.match(/in\\.\\((.*?)\\)/)?.[1]||'').split(','));
    return Object.values(assignments).filter(row=>ids.has(row.assignee_id));
  }
  throw Error('Unexpected table ' + table);
}
`);
const testScopeCode = read('lib/task-data-scope.js')
  .replace('import "server-only";', '')
  .replace('"./supabase-rest"', `"${fakeDb}"`)
  .replace('"./task-data-scope.mjs"', `"${new URL('../lib/task-data-scope.mjs', import.meta.url).href}"`);
const scope = await import(dataUri(testScopeCode));
const member = (view='team', edit='own', marker=true, id='manager') => ({
  teamMemberId: id, featureAccess: {mode:'enforced',version:5,grants: {
    ...(marker ? {[TASK_SCOPE_MARKER]:{allowed:true}} : {}),
    'tasks.view':{allowed:true,scope:view}, 'tasks.project_edit':{allowed:true,scope:edit},
    'tasks.project_delete':{allowed:false,scope:'all'},
    'tasks.assignment_work':{allowed:true,scope:edit},
    'tasks.section_edit':{allowed:true,scope:edit},
  }}
});
const context = (account)=>({account, view:'my',memberId:account.teamMemberId});

test('Team/Own scopes require explicit opt-in and View caps every action',()=>{
 assert.equal(taskScopeFor(member('team','own',false),'tasks.view'),null);
 assert.equal(taskScopeFor(member('team','own'),'tasks.view'),'team');
 assert.equal(taskScopeFor(member('team','own'),'tasks.project_edit'),'own');
 assert.equal(taskScopeFor(member('own','all'),'tasks.project_edit'),'own');
 assert.equal(taskScopeFor(member('team','own'),'tasks.project_delete'),'none');
 assert.equal(taskScopeFor({featureAccess:{mode:'legacy'}},'tasks.view'),null);
 assert.equal(featureAllowed(member('own','own',false),'tasks.view'),false);
 assert.equal(featureAllowed(member('own','own'),'tasks.view'),true);
});

test('No names or department matching can impersonate creator or assignee',()=>{
 assert.equal(taskOwnerAllowed({createdById:'manager',createdByName:'Alice'},'own',['manager']),true);
 assert.equal(taskOwnerAllowed({createdByName:'Manager'},'team',['manager','alice']),false);
 assert.equal(taskOwnerAllowed({createdById:'eve',createdByName:'Manager'},'team',['manager','alice']),false);
 assert.equal(taskAssigneeAllowed({assigneeName:'Manager'},'own',['manager']),false);
 assert.equal(taskAssigneeAllowed({assigneeId:'alice'},'team',['manager','alice']),true);
});

test('Manager team scope resolves only explicit links and includes self',async()=>{
 const resolved=await scope.resolveTaskScope(member('team','own'),'tasks.view');
 assert.deepEqual(resolved,{scope:'team',visibleIds:['manager','alice']});
 assert.deepEqual((await scope.scopedTaskAssignments(resolved)).map(a=>a.section_id),['s1','s2']);
 await assert.rejects(scope.resolveTaskScope(member('team','own',true,'broken'),'tasks.view'),{status:503});
});

test('View scope permits genuinely assigned tasks, denies unassigned outside projects',async()=>{
 const resolved=await scope.resolveTaskScope(member('team','own'),'tasks.view');
 const assignees=await scope.scopedTaskAssignments(resolved);
 assert.equal(scope.taskTicketVisible({createdById:'eve',sections:[{id:'s2'}]},resolved,assignees),true);
 assert.equal(scope.taskTicketVisible({createdById:'eve',createdByName:'Manager',sections:[{id:'s3'}]},resolved,assignees),false);
 assert.equal(scope.taskTicketVisible({createdById:'alice',sections:[]},resolved,assignees),true);
});

test('A Team-view member cannot edit a colleague’s project with Own-edit grant',async()=>{
 await scope.assertTaskActionScope(context(member()),'tasks.project_edit','ticket-update',{ticketId:'self'});
 await assert.rejects(scope.assertTaskActionScope(context(member()),'tasks.project_edit','ticket-update',{ticketId:'team'}),{status:403});
 await assert.rejects(scope.assertTaskActionScope(context(member()),'tasks.project_delete','ticket-delete',{ticketId:'self'}),{status:403});
});

test('Assignment mutations check their assignee ID, even in another creator’s project',async()=>{
 await scope.assertTaskActionScope(context(member()),'tasks.assignment_work','assignment-work',{assignmentId:'a1'});
 await assert.rejects(scope.assertTaskActionScope(context(member()),'tasks.assignment_work','assignment-work',{assignmentId:'a2'}),{status:403});
 await assert.rejects(scope.assertTaskActionScope(context(member()),'tasks.assignment_work','assignment-work',{assignmentId:'a3'}),{status:403});
});

test('Section update checks actual section assignment; no name-based bypass',async()=>{
 await scope.assertTaskActionScope(context(member()),'tasks.section_edit','section-update',{sectionId:'s1'});
 await assert.rejects(scope.assertTaskActionScope(context(member()),'tasks.section_edit','section-update',{sectionId:'s2'}),{status:403});
});

test('UI hides forbidden project actions while supporting permitted personal work',()=>{
 const policy={self:'manager',teamIds:['manager','alice'],scopes:{project_edit:'own',project_archive:'team',project_delete:'none',assignment_work:'own'}};
 assert.equal(taskCardAllows(policy,'project_edit',{createdById:'alice'}),false);
 assert.equal(taskCardAllows(policy,'project_archive',{createdById:'alice'}),true);
 assert.equal(taskCardAllows(policy,'project_delete',{createdById:'manager'}),false);
 assert.equal(taskCardAllows(policy,'assignment_work',{scopeAssigneeIds:['manager']},{personalWork:true}),true);
 assert.equal(taskCardAllows(policy,'assignment_work',{scopeAssigneeIds:['alice']},{personalWork:true}),false);
});

test('Read and mutation routes both enforce database scope, and admin UI persists marker',()=>{
 assert.match(read('lib/task-management-data.js'), /taskTicketVisible\(/);
 assert.match(read('lib/task-management-data.js'), /scopedContext\(context\)/);
 assert.match(read('app/api/task-management/mutations-direct/route.js'), /assertTaskActionScope\(/);
 assert.match(read('components/users-center/UsersCenterDialogs.jsx'), /tasks: TASK_SCOPE_MARKER/);
 assert.match(read('app/api/task-management/\u005bid\u005d/route.js'), /ERP_ADVANCED_PERMISSIONS_ENABLED/);
});

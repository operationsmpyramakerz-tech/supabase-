import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const uri = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const load = (file, imports) => {
  let code = source(file).replace('import "server-only";', "");
  for (const [from, to] of Object.entries(imports)) code = code.replaceAll('"' + from + '"', '"' + to + '"');
  return uri(code);
};
const database = uri(`
export const rows = { department_tickets: [{id:'1000', title:'Existing Project', created_by_id:'owner', created_by_name:'Owner', status:'completed', due_date:'2026-11-30'}], department_ticket_sections: [{id:'50',ticket_id:'1000', department:'Operations',status:'completed'}], department_ticket_section_edges: [], department_ticket_section_assignments: [], erp_member_scope_team_links: [] };
export const written = [];
let next = 1001;
export let missingMigration = false;
export function legacy(flag){missingMigration=flag}
export async function select(table, filters) {
  if (!rows[table]) throw Error(table);
  if (missingMigration && table === 'department_tickets' && filters.select.includes('ticket_kind')) { const e = Error('column department_tickets.ticket_kind does not exist'); e.details={code:'42703'}; throw e; }
  let result = rows[table].filter(row => Object.entries(filters).every(([key,val]) => !String(val).startsWith('eq.') || String(row[key]) === val.slice(3)));
  return result.map(row => ({...row}));
}
export async function selectById(t,id){const r=rows[t]?.find(row=>row.id===String(id)); return r?{...r}:null}
export async function insert(t,row){const r={...row,id:String(next++)}; if(t==='department_tickets')r.ticket_kind??='project'; rows[t].push(r); written.push(['insert',t,r]); return {...r}}
export async function updateById(t,id,patch){Object.assign(rows[t].find(row=>row.id===String(id)),patch);written.push(['update',t,patch])}
export async function updateByIds(t,ids,patch){for (let id of ids) await updateById(t,id,patch)}
export async function deleteById(t,id){rows[t]=rows[t].filter(row=>row.id!==String(id))}
export async function deleteByIds(t,ids){for(let id of ids) await deleteById(t,id)}
`);
const db = await import(database);
const scopePure = new URL("../lib/task-data-scope.mjs", import.meta.url).href;
const scopeUri = load("../lib/task-data-scope.js", {"./supabase-rest": database,"./task-data-scope.mjs":scopePure});
const team = uri(`export async function listTeamMembersLite(){return [{id:'owner',name:'Owner',department:'Operations'},{id:'assigned',name:'Same Name',department:'Operations'},{id:'colleague',name:'Same Name',department:'Operations'}]}`);
const dataUri = load("../lib/task-management-data.js", {
  "./admin-identity-policy.mjs":uri("export const isTrustedLegacyAdmin=()=>false;"),
  "./feature-permissions-server":uri("export const featureGate=(context)=>context;"),
  "./task-data-scope":scopeUri,"./task-data-scope.mjs":scopePure,"./products-auth":uri("export const getDirectAccountGate=async()=>null;"),"./supabase-rest":database,"./team-members-service":team,
});
const data = await import(dataUri);
const mutations = await import(load("../lib/task-management-mutations.js", {
  "./supabase-rest":database,"./team-members-service":team,"./task-management-data":dataUri,
  "./order-action-auth":uri("export const verifyPageAdminPasswordDirect=async()=>true;"),
}));
const scope = await import(scopeUri);
const ctx = (id,view,admin=false, scoped=false) => ({ok:true,view,memberId:id,isPageAdmin:admin,account:{teamMemberId:id,name:id==='owner'?'Owner':'Same Name',department:'Operations', ...(scoped?{featureAccess:{mode:'enforced',grants:{'tasks.__scoped':{allowed:true},'tasks.view':{allowed:true,scope:'own'},'tasks.assignment_work':{allowed:true,scope:'own'},'tasks.project_create':{allowed:true,scope:'own'}}}}:{})}});
const list = (context) => data.listTaskManagementTickets(context,{force:true});
const payload = {kind:"task",title:"Check components",description:"Verify the shipment",priority:"High",dueDate:"2026-11-27",assigneeId:"assigned",assigneeName:"Client fake name"};
let task;
test("legacy schema remains readable and projects retain section-derived status",async()=>{
  db.legacy(true);
  const [project]=await list(ctx("owner","delegated"));
  assert.equal(project.kind,"project");
  assert.equal(project.status,"completed");
  assert.equal(project.progress,100);
  db.legacy(false);
});
test("create rejects invalid dates, fake employees and other views; valid task is standalone",async()=>{
  await assert.rejects(mutations.createTaskManagementTicket(ctx("owner","my"),payload),{status:403});
  await assert.rejects(mutations.createTaskManagementTicket(ctx("owner","delegated"),{...payload,dueDate:"2026-02-31"}),{status:400});
  await assert.rejects(mutations.createTaskManagementTicket(ctx("owner","delegated"),{...payload,assigneeId:"unknown"}),{status:400});
  task=await mutations.createTaskManagementTicket(ctx("owner","delegated"),payload);
  assert.equal(task.kind,"task"); assert.equal(task.directAssigneeId,"assigned"); assert.equal(task.directAssigneeName,"Same Name");
  assert.equal(task.status,"not_started"); assert.equal(task.sections.length,0); assert.equal(task.edges.length,0);
  assert.equal(task.sectionsCount,1); assert.equal(db.written.length,1); assert.equal(db.written[0][1],"department_tickets");
});
test("actual list/detail expose task only in correct personal views and authorized All view",async()=>{
  assert.ok((await list(ctx("owner","delegated"))).some(t=>t.id===task.id));
  assert.ok((await list(ctx("assigned","my",false,true))).some(t=>t.id===task.id));
  assert.ok(!(await list(ctx("colleague","my",true))).some(t=>t.id===task.id));
  assert.ok(!(await list(ctx("colleague","delegated"))).some(t=>t.id===task.id));
  assert.ok((await list(ctx("colleague","all"))).some(t=>t.id===task.id));
  assert.ok(!(await list(ctx("colleague","all",false,true))).some(t=>t.id===task.id));
  assert.ok((await list(ctx("assigned","all",false,true))).some(t=>t.id===task.id));
  await assert.rejects(data.getTaskManagementTicket(task.id,ctx("colleague","my"),{force:true}),{status:403});
  const detail=await data.getTaskManagementTicket(task.id,ctx("assigned","my",false,true),{force:true});
  assert.deepEqual(detail.scopeAssigneeIds,["assigned"]); assert.equal(detail.description,payload.description);
});
test("scoped and legacy work mutation denies impersonation, wrong views, and project IDs", async()=>{
  await scope.assertTaskActionScope(ctx("assigned","my",false,true),"tasks.assignment_work","ticket-task-work",{ticketId:task.id});
  await assert.rejects(scope.assertTaskActionScope(ctx("colleague","my",false,true),"tasks.assignment_work","ticket-task-work",{ticketId:task.id}),{status:403});
  await assert.rejects(mutations.updateDirectTaskWork(ctx("colleague","my",true),task.id,{status:"completed"}),{status:403});
  await assert.rejects(mutations.updateDirectTaskWork(ctx("assigned","all"),task.id,{status:"completed"}),{status:403});
  await assert.rejects(mutations.updateDirectTaskWork(ctx("assigned","my"),"1000",{status:"completed"}),{status:404});
  await assert.rejects(mutations.markTaskManagementDelivered(ctx("owner","delegated",true),task.id),{status:403});
  await assert.rejects(mutations.updateDirectTaskWork(ctx("assigned","my"),task.id,{status:"rejected"}),{status:400});
  const updated=await mutations.updateDirectTaskWork(ctx("assigned","my"),task.id,{status:"completed",workReport:"Checked"});
  assert.equal(updated.status,"completed"); assert.equal(updated.directWorkReport,"Checked"); assert.equal(updated.progress,100);
  const delegated=(await list(ctx("owner","delegated"))).find(t=>t.id===task.id);
  assert.equal(delegated.status,"completed"); assert.equal(delegated.viewerProgress,100); assert.equal(delegated.directWorkReport,undefined);
  const mine=(await list(ctx("assigned","my",false,true))).find(t=>t.id===task.id);
  assert.equal(mine.viewerProgress,100);
});
test("metadata is minimal; task edit cannot change identity or insert workflow sections", async()=>{
  const meta = await data.taskManagementMeta(ctx("owner","delegated"));
  assert.deepEqual(Object.keys(meta.taskAssignees[0]),["id","name","department"]);
  assert.equal((await data.taskManagementMeta(ctx("assigned","my"))).taskAssignees,undefined);
  await assert.rejects(mutations.updateTaskManagementTicket(ctx("assigned","my"),task.id,{...payload,title:"Forged"}),{status:403});
  const result=await mutations.updateTaskManagementTicket(ctx("owner","delegated",true),task.id,{...payload,title:"Updated",assigneeId:"colleague",sections:[{department:"Operations"}]});
  assert.equal(result.directAssigneeId,"assigned"); assert.equal(result.sections.length,0); assert.equal(result.title,"Updated");
});
test("creator can archive and restore; archived tasks are not writable by assignee", async()=>{
  await assert.rejects(mutations.archiveTaskManagementTicket(ctx("assigned","my"),task.id),{status:403});
  const creator=ctx("owner","delegated",true);
  await mutations.archiveTaskManagementTicket(creator,task.id);
  assert.ok(!(await list(ctx("assigned","my"))).some(t=>t.id===task.id));
  assert.ok((await list(creator)).some(t=>t.id===task.id && t.isArchived));
  await assert.rejects(mutations.updateDirectTaskWork(ctx("assigned","my"),task.id,{status:"not_started"}),{status:409});
  await mutations.archiveTaskManagementTicket(creator,task.id,{archived:false});
  assert.ok((await list(ctx("assigned","my"))).some(t=>t.id===task.id));
});

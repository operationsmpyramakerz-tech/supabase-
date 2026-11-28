import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { directTaskOwnerPrefix, isDirectTaskAttachment, validateDirectTaskAttachments, readDirectTaskAttachment, DIRECT_TASK_ATTACHMENT_BUCKET, DIRECT_TASK_ATTACHMENT_MAX_BYTES } from "../lib/direct-task-attachment-policy.mjs";
import { taskLinkIsVisible } from "../lib/storage-task-record-policy.mjs";

const ref = "signed.direct-task-token";
const url = "/next/api/storage/file-direct?reference=" + ref;
const payload = { scope:"task-management", bucket:DIRECT_TASK_ATTACHMENT_BUCKET, path:directTaskOwnerPrefix("creator")+"file.pdf", recordAuthRequired:true, name:"real.pdf", type:"application/pdf", size:123 };
const opts = { memberId:"creator", verifyReference: token => { assert.equal(token,ref); return payload; }, makeUrl: (token,name)=>url+"&name="+name };

test("direct task attachment accepts only owned, record-bound signed files and canonical metadata",()=>{
  assert.deepEqual(validateDirectTaskAttachments(undefined,opts),[]);
  assert.deepEqual(validateDirectTaskAttachments([{url,name:"fake.pdf",size:9},{url}],opts),[{name:"real.pdf",url:url+"&name=real.pdf",type:"application/pdf",size:123}]);
  assert.throws(()=>validateDirectTaskAttachments([{url}],{...opts,memberId:"other"}),{status:403});
  assert.throws(()=>validateDirectTaskAttachments([{url:"https://evil.invalid/file.pdf"}],opts),{status:400});
  assert.throws(()=>validateDirectTaskAttachments([{url}],{...opts,verifyReference:()=>({...payload,recordAuthRequired:false})}),{status:403});
  assert.throws(()=>validateDirectTaskAttachments([{url}],{...opts,verifyReference:()=>({...payload,bucket:"public"})}),{status:403});
  assert.throws(()=>validateDirectTaskAttachments([{url}],{...opts,verifyReference:()=>({...payload,path:"task-management/attachments/workflow.pdf"})}),{status:403});
  assert.throws(()=>validateDirectTaskAttachments(Array(21).fill({url}),opts),{status:400});
  assert.throws(()=>validateDirectTaskAttachments([{url}],{...opts,verifyReference:()=>({...payload,size:0})}),{status:400});
  assert.ok(isDirectTaskAttachment(payload));
  assert.ok(!isDirectTaskAttachment({...payload,scope:"b2c"}));
});

test("attachment body rejects empty, Content-Length overflow, and streamed oversize",async()=>{
  const request=(body,headers)=>new Request("https://erp.invalid/upload",{method:"POST",body,headers,duplex:"half"});
  assert.deepEqual(await readDirectTaskAttachment(request(new Uint8Array([1,2,3]))),Buffer.from([1,2,3]));
  await assert.rejects(readDirectTaskAttachment(request(new Uint8Array())),{status:400});
  await assert.rejects(readDirectTaskAttachment(request(new Uint8Array([1]),{"content-length":String(DIRECT_TASK_ATTACHMENT_MAX_BYTES+1)})),{status:413});
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(DIRECT_TASK_ATTACHMENT_MAX_BYTES));controller.enqueue(new Uint8Array([1]));controller.close();}});
  await assert.rejects(readDirectTaskAttachment(request(stream)),{status:413});
});

test("download requires the same visible individual task with an exact stored reference",()=>{
  const ticket={id:"42",kind:"task",directAttachments:[{url}],sections:[]};
  const link={ticket_id:"42",section_id:null,assignment_id:null,file_kind:"direct_task_attachment"};
  assert.ok(taskLinkIsVisible(link,ticket,ref));
  assert.ok(!taskLinkIsVisible({...link,ticket_id:"43"},ticket,ref));
  assert.ok(!taskLinkIsVisible({...link,section_id:"fake"},ticket,ref));
  assert.ok(!taskLinkIsVisible(link,{...ticket,kind:"project"},ref));
  assert.ok(!taskLinkIsVisible(link,{...ticket,directAttachments:[]},ref));
  assert.ok(!taskLinkIsVisible(link,ticket,"direct-task-token"));
});

test("migration is additive, preserves all old RPC branches and restricts lookup to service_role",()=>{
  const sql=readFileSync(new URL("../sql/2026-11-28-individual-task-attachments.sql",import.meta.url),"utf8");
  assert.match(sql,/ADD COLUMN IF NOT EXISTS direct_attachments jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
  for(const kind of ["direct_task_attachment","section_attachment","section_work","assignment_attachment","assignment_work"]) assert.ok(sql.includes("'"+kind+"'"));
  assert.match(sql,/REVOKE ALL.* FROM anon, authenticated/i);
  assert.match(sql,/GRANT EXECUTE.* TO service_role/i);
  assert.match(sql,/ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|UPDATE storage\.buckets/i);
});

// Execute the actual upload and download-authorization modules with isolated
// authentication/storage/database doubles. No production service is contacted.
const moduleUri = code => "data:text/javascript;base64,"+Buffer.from(code).toString("base64");
const load = (path, imports) => {
  let code = readFileSync(new URL(path,import.meta.url),"utf8").replace('import "server-only";',"");
  for (const [from,to] of Object.entries(imports)) code=code.replaceAll('"'+from+'"','"'+to+'"');
  return moduleUri(code);
};
const authUri=moduleUri(`
export let context={ok:true,view:"delegated",memberId:"creator",account:{}};
export let tickets={};
export function setup(next,records={}){context=next;tickets=records}
export async function directTaskManagementContext(view){return {...context,view}}
export const taskManagementCurrentMember=c=>({id:c.memberId})
export async function getTaskManagementTicket(id,ctx,opts){
 if(!opts.force)throw Error("Must force authorization");
 const result=tickets[id]?.[ctx.view];
 if(!result){const e=Error("Not authorized");e.status=403;throw e;}return result;
}
`);
const auth=await import(authUri);
const dbUri=moduleUri(`
export let writes=[];
export let links=[];
export let privateOk=true;
export function setup(records=[],ok=true){writes=[];links=records;privateOk=ok}
export async function assertPrivateStorageBucket(bucket){if(!privateOk){const e=Error("Public bucket");e.status=503;throw e}}
export async function uploadStorageObject(path,bytes,options){writes.push({path,bytes,options});return{path}}
export async function rpc(){return links}
`);
const db=await import(dbUri);
const signing=moduleUri(`
export let last;
export const createFileReference=payload=>{last=payload;return "signed-direct-test-reference"};
export const fileUrl=(ref,name)=>"/next/api/storage/file-direct?reference="+ref+"&name="+encodeURIComponent(name);
export const safeFileName=name=>({original:name,clean:"safe.pdf"});
`);
const signingMock=await import(signing);
const feature=moduleUri('export function featureGate(c,key){return c.deny===key?{ok:false,status:403,error:"Permission denied"}:c}');
const upload=await import(load("../app/api/task-management/upload-task-attachment/route.js",{
 "next/server":moduleUri("export const NextResponse=Response"),
 "../../../../lib/task-management-data":authUri,
 "../../../../lib/feature-permissions-server":feature,
 "../../../../lib/supabase-rest":dbUri,
 "../../../../lib/storage-direct":signing,
 "../../../../lib/direct-task-attachment-policy.mjs":new URL("../lib/direct-task-attachment-policy.mjs",import.meta.url).href,
}));
test("actual upload route enforces both features, private bucket, exact bytes and ownership",async()=>{
 const req=()=>new Request("https://erp.invalid/upload?filename=spec.pdf",{method:"POST",headers:{"content-type":"application/pdf"},body:new Uint8Array([1,2,3])});
 db.setup();auth.setup({ok:true,memberId:"creator",deny:"tasks.attachment_upload",account:{}});
 assert.equal((await upload.POST(req())).status,403);assert.equal(db.writes.length,0);
 auth.setup({ok:true,memberId:"creator",deny:"tasks.project_create",account:{}});
 assert.equal((await upload.POST(req())).status,403);assert.equal(db.writes.length,0);
 auth.setup({ok:true,memberId:"creator",account:{}});db.setup([],false);
 assert.equal((await upload.POST(req())).status,503);assert.equal(db.writes.length,0);
 db.setup();const res=await upload.POST(req());assert.equal(res.status,201);
 const file=(await res.json()).file;
 assert.equal(file.name,"spec.pdf");assert.equal(file.size,3);
 assert.deepEqual(db.writes[0].bytes,Buffer.from([1,2,3]));
 assert.equal(db.writes[0].options.bucketName,DIRECT_TASK_ATTACHMENT_BUCKET);
 assert.equal(db.writes[0].options.upsert,false);
 assert.ok(db.writes[0].path.startsWith(directTaskOwnerPrefix("creator")));
 assert.equal(signingMock.last.recordAuthRequired,true);
 assert.equal(signingMock.last.scope,"task-management");
});
const downloadAuth=await import(load("../lib/storage-task-record-access.js",{
 "./supabase-rest":dbUri,"./task-management-data":authUri,
 "./task-management-mutations":moduleUri("export const getTaskManagementPeopleWorkflow=async()=>({assignments:[]})"),
 "./storage-task-record-policy.mjs":new URL("../lib/storage-task-record-policy.mjs",import.meta.url).href,
}));
test("actual download guard rejects unlinked, copied workflow, wrong-user and non-direct references",async()=>{
 const ticket={id:"42",kind:"task",directAttachments:[{url}],sections:[]};
 const link={ticket_id:"42",section_id:null,assignment_id:null,file_kind:"direct_task_attachment"};
 const project={id:"43",kind:"project",sections:[{id:"s1",attachments:[{url}]}]};
 const copied={ticket_id:"43",section_id:"s1",assignment_id:null,file_kind:"section_attachment"};
 auth.setup({ok:true,memberId:"assignee",account:{}},{"42":{my:ticket},"43":{all:project}});
 db.setup([link]);await downloadAuth.assertTaskStorageRecordAccess(ref,{directTaskOnly:true});
 await assert.rejects(downloadAuth.assertTaskStorageRecordAccess(ref),{status:403});
 db.setup([]);await assert.rejects(downloadAuth.assertTaskStorageRecordAccess(ref,{directTaskOnly:true}),{status:403});
 db.setup([copied]);await assert.rejects(downloadAuth.assertTaskStorageRecordAccess(ref,{directTaskOnly:true}),{status:403});
 db.setup([link]);auth.setup({ok:true,memberId:"other",account:{}},{});
 await assert.rejects(downloadAuth.assertTaskStorageRecordAccess(ref,{directTaskOnly:true}),{status:403});
});

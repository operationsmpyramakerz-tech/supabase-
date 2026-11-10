import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { parseStrictImageDataUrl } from '../lib/strict-upload-image.mjs';
import { PREPARING_STAGE_KEYS } from '../lib/preparing-stage-access.js';
const source=readFileSync(new URL('../lib/preparing-stage-closures.js',import.meta.url),'utf8');
const project='ed0f3b19-9e66-40e5-8b12-2f0a1845074e';
const account={id:'member-1',name:'Operations User'};
const photo=()=>new File([Buffer.from('89504e470d0a1a0a','hex')],'signed.png',{type:'image/png'});
function setup(){
  const rows=[],objects=new Set(),deleted=[];let failUpload=false,failInsert=false;
  const deps={randomUUID,createHmac,timingSafeEqual,PREPARING_STAGE_KEYS,parseStrictImageDataUrl,
    select:async(table,q)=>rows.filter(r=>`eq.${r.project_id}`===q.project_id&&(!q.stage_key||`eq.${r.stage_key}`===q.stage_key)),
    selectById:async()=>({id:project}),assertPrivateStorageBucket:async b=>assert.equal(b,'preparing-stage-documents'),
    uploadStorageObject:async(path,buf,opts)=>{assert.equal(opts.upsert,false);if(failUpload&&objects.size)throw new Error('Upload failure');objects.add(path);},
    deleteStorageObjects:async paths=>{paths.forEach(p=>{objects.delete(p);deleted.push(p);});},
    createSignedDownloadUrl:async path=>({signedUrl:`https://private.example/${path}`}),
    insert:async(table,row)=>{if(failInsert)throw new Error('Database unavailable');if(rows.some(r=>r.project_id===row.project_id&&r.stage_key===row.stage_key)){const e=new Error('duplicate');e.status=409;throw e;}const record={...row,closed_at:'2026-11-10T10:00:00Z'};rows.push(record);return record;}};
  const code=source.replace(/^import .*;\s*$/gm,'').replace(/export (async )?function /g,'$1function ');
  const api=new Function(...Object.keys(deps),'process','Buffer',`${code}\nreturn { closeProjectStage,getStageClosure,getClosureDocument,listStageClosures,uploadStageDocument,finalizeStageDocuments };`)(...Object.values(deps),{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},Buffer);
  return {api,rows,objects,deleted,setFailUpload:()=>{failUpload=true;},setFailInsert:()=>{failInsert=true;}};
}
test('Each project stage has its own closure, verified actor and saved evidence',async()=>{const {api,rows,objects}=setup();for(const stage of PREPARING_STAGE_KEYS){const record=await api.closeProjectStage(project,stage,[photo()],account);assert.equal(record.closedBy,account.name);assert.equal(record.documents.length,1);assert.equal(record.stage,stage);assert.equal(record.closedAt,'2026-11-10T10:00:00Z');assert.equal(record.documents[0].path,undefined);}assert.equal(rows.length,6);assert.equal(objects.size,6);assert.equal(rows[0].closed_by_id,account.id);assert.equal((await api.getStageClosure(project,'testing')).closedBy,account.name);assert.match(await api.getClosureDocument(project,'testing',0),/^https:\/\/private\.example\//);});
test('Reject empty and spoofed images before storage writes',async()=>{const {api,objects}=setup();await assert.rejects(api.closeProjectStage(project,'testing',[],account));await assert.rejects(api.closeProjectStage(project,'testing',[new File(['html'],'fake.png',{type:'image/png'})],account));assert.equal(objects.size,0);});
test('Duplicate closure preserves original actor and images',async()=>{const {api,rows,objects}=setup();await api.closeProjectStage(project,'testing',[photo()],account);await assert.rejects(api.closeProjectStage(project,'testing',[photo()],{id:'other',name:'Other'}),{status:409});assert.equal(rows[0].closed_by_id,account.id);assert.equal(objects.size,1);});
test('Partial upload failure does not create a closure and cleans completed uploads',async()=>{const {api,rows,objects,deleted,setFailUpload}=setup();setFailUpload();await assert.rejects(api.closeProjectStage(project,'testing',[photo(),photo()],account));assert.equal(rows.length,0);assert.equal(objects.size,0);assert.equal(deleted.length,1);});
test('Database error never reports success or deletes potentially committed documents',async()=>{const {api,rows,objects,setFailInsert}=setup();setFailInsert();await assert.rejects(api.closeProjectStage(project,'testing',[photo()],account));assert.equal(rows.length,0);assert.equal(objects.size,1);});
test('Closure endpoint enforces stage read and mutation permissions; status list is aggregate only',()=>{const route=readFileSync(new URL('../app/api/projects-preparing/stage-closures/route.js',import.meta.url),'utf8');assert.match(route,/preparingStageReadGate\(await gate\(\),stage\)/);assert.match(route,/preparingStageGate\(await gate\(\),stage\)/);const progress=readFileSync(new URL('../app/api/projects-preparing/progress/route.js',import.meta.url),'utf8');assert.match(progress,/closures\.map\(row => \[row\.stage_key, true\]\)/);const ui=readFileSync(new URL('../components/preparing/PreparingClient.jsx',import.meta.url),'utf8');for(const stage of PREPARING_STAGE_KEYS)assert.match(ui,new RegExp(`stage="${stage}" allowed=\\{stagePermissions\\.${stage}\\}`));});

const pdf=()=>new File(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'],'signed.pdf',{type:'application/pdf'});
test('Staged uploads accept more than ten documents including PDFs and close only at finalization',async()=>{
 const {api,rows,objects}=setup();const tokens=[];
 for(let i=0;i<13;i++)tokens.push(await api.uploadStageDocument(project,'testing',i===12?pdf():photo(),account));
 assert.equal(rows.length,0);assert.equal(objects.size,13);
 const result=await api.finalizeStageDocuments(project,'testing',tokens,account);
 assert.equal(result.documents.length,13);assert.equal(result.documents[12].mime,'application/pdf');assert.equal(rows.length,1);
 assert.deepEqual(await api.finalizeStageDocuments(project,'testing',tokens,account),result);
});
test('PDF upload rejects wrong content and signed receipts reject tampering and cross-stage/user use',async()=>{
 const {api,rows,objects}=setup();
 await assert.rejects(api.uploadStageDocument(project,'testing',new File(['not a pdf'],'fake.pdf',{type:'application/pdf'}),account));
 assert.equal(objects.size,0);
 const token=await api.uploadStageDocument(project,'testing',pdf(),account);
 await assert.rejects(api.finalizeStageDocuments(project,'warehouse',[token],account));
 await assert.rejects(api.finalizeStageDocuments(project,'testing',[token],{id:'another',name:'Other'}));
 await assert.rejects(api.finalizeStageDocuments(project,'testing',[token+'x'],account));
 await assert.rejects(api.finalizeStageDocuments(project,'testing',[token,token],account));
 assert.equal(rows.length,0);
});

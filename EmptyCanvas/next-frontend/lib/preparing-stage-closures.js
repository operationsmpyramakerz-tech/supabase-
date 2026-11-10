import 'server-only';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { select, selectById, insert, assertPrivateStorageBucket, uploadStorageObject, deleteStorageObjects, createSignedDownloadUrl } from './supabase-rest';
import { PREPARING_STAGE_KEYS } from './preparing-stage-access';
import { parseStrictImageDataUrl } from './strict-upload-image.mjs';

const TABLE = 'erp_preparing_project_stage_closures';
const BUCKET = 'preparing-stage-documents';
const MAX_BYTES = 3500000;
const EXTENSIONS = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf' };
function verifiedActor(account) {
  const actor=String(account?.id||account?.memberId||account?.teamMemberId||'').trim();
  const name=String(account?.name||account?.username||'').trim();
  if (!actor||!name||name.length>160) fail('Verified ERP user required.',401);
  return {actor,name};
}
async function prepareDocument(file) {
  if (!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>MAX_BYTES) fail('Each file must be non-empty and at most 3.5 MB.',413);
  const raw=Buffer.from(await file.arrayBuffer());
  let mime,buffer;
  if(file.type==='application/pdf'){
    if (!/^%PDF-\d\.\d/.test(raw.subarray(0,12).toString('ascii')) || !raw.subarray(Math.max(0,raw.length-2048)).toString('latin1').includes('%%EOF')) fail('The uploaded file is not a valid PDF.');
    mime='application/pdf';buffer=raw;
  }else{({mime,buffer}=parseStrictImageDataUrl(`data:${file.type};base64,${raw.toString('base64')}`,{maxBytes:MAX_BYTES}));}
  return {name:String(file.name||'Signed document').slice(0,180),mime,buffer};
}
function receiptSignature(payload){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_KEY;
  return createHmac('sha256',key).update('preparing-stage-document-v379:'+payload).digest('base64url');
}
function signReceipt(data){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');return payload+'.'+receiptSignature(payload);}
function readReceipt(token,id,stage,actor){
  if(typeof token!=='string'||token.length>4096)fail('Invalid upload receipt.');
  const [payload,sig,...extra]=token.split('.');
  if(!payload||!sig||extra.length)fail('Invalid upload receipt.');
  const expected=Buffer.from(receiptSignature(payload)), actual=Buffer.from(sig);
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))fail('Invalid upload receipt.');
  let d;try{d=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{fail('Invalid upload receipt.');}
  if(d.projectId!==id||d.stage!==stage||d.actor!==actor||d.expires<Date.now()||!d.path.startsWith(`${id}/${stage}/`))fail('Upload receipt expired or does not belong to this stage.');
  return {path:d.path,name:d.name,size:d.size,mime:d.mime};
}
const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
function fail(message, status=400) { const e = new Error(message); e.status=status; throw e; }
export function validateClosureStage(stage) { if (!PREPARING_STAGE_KEYS.includes(stage)) fail('Invalid preparation stage.'); return stage; }
async function requireProject(id) {
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)) fail('Server-side database credentials required.',503);
  if (!UUID.test(String(id||''))) fail('Invalid project ID.');
  const project = await selectById('erp_preparing_projects',id);
  if (!project || project.deleted_at) fail('Project not found.',404);
  return id;
}
export async function listStageClosures(projectId) {
  const id = await requireProject(projectId);
  return await select(TABLE,{select:'stage_key,closed_at',project_id:`eq.${id}`,limit:'5'});
}
async function readClosure(id,stage) {
  const rows = await select(TABLE,{select:'*',project_id:`eq.${id}`,stage_key:`eq.${stage}`,limit:'1'});
  return rows?.[0] || null;
}
function publicRecord(row) {
  if (!row) return null;
  return {stage:row.stage_key,closedBy:row.closed_by_name,closedAt:row.closed_at,documents:row.documents.map((d,index)=>({index,name:d.name,size:d.size,mime:d.mime}))};
}
export async function getStageClosure(projectId,stage) {
  const id=await requireProject(projectId);validateClosureStage(stage);
  return publicRecord(await readClosure(id,stage));
}
export async function getClosureDocument(projectId,stage,index) {
  const id=await requireProject(projectId);validateClosureStage(stage);
  const row=await readClosure(id,stage);
  const document=Number.isInteger(index)&&index>=0?row?.documents?.[index]:null;
  if (!document) fail('Document not found.',404);
  if (!document.path.startsWith(`${id}/${stage}/`)) fail('Invalid document reference.',500);
  await assertPrivateStorageBucket(BUCKET);
  return (await createSignedDownloadUrl(document.path,{bucketName:BUCKET,expiresIn:60})).signedUrl;
}
export async function closeProjectStage(projectId,stage,files,account) {
  const id=await requireProject(projectId);validateClosureStage(stage);
  const {actor,name}=verifiedActor(account);
  if (await readClosure(id,stage)) fail('This stage is already closed.',409);
  if (!Array.isArray(files)||!files.length) fail('Upload at least one signed document.');
  const prepared=[];
  for (const file of files) prepared.push(await prepareDocument(file));
  await assertPrivateStorageBucket(BUCKET);
  const batch=randomUUID(),uploaded=[];
  let insertAttempted=false;
  try {
    for (const file of prepared) {
      const extension=EXTENSIONS[file.mime];
      const path=`${id}/${stage}/${batch}/${randomUUID()}.${extension}`;
      await uploadStorageObject(path,file.buffer,{bucketName:BUCKET,contentType:file.mime,upsert:false});
      uploaded.push({path,name:file.name,size:file.buffer.length,mime:file.mime});
    }
    insertAttempted=true;
    const row=await insert(TABLE,{project_id:id,stage_key:stage,closed_by_id:actor,closed_by_name:name,documents:uploaded});
    return publicRecord(row);
  } catch (error) {
    // A timed-out insert may have committed. Never delete evidence referenced by a committed closure.
    let safeToClean=!insertAttempted;
    if (insertAttempted) {
      try {
        const existing=await readClosure(id,stage);
        if (existing?.documents?.some(d=>d.path.startsWith(`${id}/${stage}/${batch}/`))) return publicRecord(existing);
        safeToClean=!!existing || error?.status===409;
        if (existing) { const conflict=new Error('This stage is already closed.'); conflict.status=409; error=conflict; }
      } catch { /* Unknown commit state: retain objects rather than destroy evidence. */ }
    }
    if (safeToClean&&uploaded.length) await deleteStorageObjects(uploaded.map(d=>d.path),{bucketName:BUCKET}).catch(()=>{});
    throw error;
  }
}

// Each upload is a separate bounded request; only finalization creates the closure.
export async function uploadStageDocument(projectId,stage,file,account) {
  const id=await requireProject(projectId);validateClosureStage(stage);
  const {actor}=verifiedActor(account);
  if(await readClosure(id,stage))fail('This stage is already closed.',409);
  const d=await prepareDocument(file);
  await assertPrivateStorageBucket(BUCKET);
  const path=`${id}/${stage}/${randomUUID()}/${randomUUID()}.${EXTENSIONS[d.mime]}`;
  await uploadStorageObject(path,d.buffer,{bucketName:BUCKET,contentType:d.mime,upsert:false});
  return signReceipt({projectId:id,stage,actor,path,name:d.name,size:d.buffer.length,mime:d.mime,expires:Date.now()+86400000});
}
export async function finalizeStageDocuments(projectId,stage,receipts,account){
  const id=await requireProject(projectId);validateClosureStage(stage);
  const {actor,name}=verifiedActor(account);
  if(!Array.isArray(receipts)||!receipts.length)fail('Upload at least one signed document.');
  const documents=receipts.map(r=>readReceipt(r,id,stage,actor));
  if(new Set(documents.map(d=>d.path)).size!==documents.length)fail('Duplicate document receipts.');
  const matches=row=>row&&row.closed_by_id===actor&&row.documents.length===documents.length&&documents.every((d,i)=>row.documents[i].path===d.path);
  const existing=await readClosure(id,stage);
  if(existing){if(matches(existing))return publicRecord(existing);fail('This stage is already closed.',409);}
  try{
    const row=await insert(TABLE,{project_id:id,stage_key:stage,closed_by_id:actor,closed_by_name:name,documents});
    return publicRecord(row);
  }catch(error){
    const row=await readClosure(id,stage).catch(()=>null);
    if(matches(row))return publicRecord(row);
    if(row)fail('This stage is already closed.',409);
    throw error;
  }
}

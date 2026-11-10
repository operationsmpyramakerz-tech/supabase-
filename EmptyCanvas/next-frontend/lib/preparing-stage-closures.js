import 'server-only';
import { randomUUID } from 'node:crypto';
import { select, selectById, insert, assertPrivateStorageBucket, uploadStorageObject, deleteStorageObjects, createSignedDownloadUrl } from './supabase-rest';
import { PREPARING_STAGE_KEYS } from './preparing-stage-access';
import { parseStrictImageDataUrl } from './strict-upload-image.mjs';

const TABLE = 'erp_preparing_project_stage_closures';
const BUCKET = 'preparing-stage-documents';
const MAX_BYTES = 3500000;
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
  return {stage:row.stage_key,closedBy:row.closed_by_name,closedAt:row.closed_at,documents:row.documents.map((d,index)=>({index,name:d.name,size:d.size}))};
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
  const actor=String(account?.id||account?.memberId||account?.teamMemberId||'').trim();
  const name=String(account?.name||account?.username||'').trim();
  if (!actor||!name||name.length>160) fail('Verified ERP user required.',401);
  if (await readClosure(id,stage)) fail('This stage is already closed.',409);
  if (!Array.isArray(files)||!files.length||files.length>10) fail('Upload 1–10 signed document images.');
  if (files.some(f=>!f||typeof f.arrayBuffer!=='function'||!f.size)||files.reduce((s,f)=>s+f.size,0)>MAX_BYTES) fail('Images must total 3.5 MB or less.',413);
  // Validate every image before writing any object. Client MIME is not sufficient.
  const prepared=[];
  for (const file of files) {
    const raw=Buffer.from(await file.arrayBuffer());
    const {mime,buffer}=parseStrictImageDataUrl(`data:${file.type};base64,${raw.toString('base64')}`,{maxBytes:MAX_BYTES});
    prepared.push({name:String(file.name||'Signed document').slice(0,180),mime,buffer});
  }
  await assertPrivateStorageBucket(BUCKET);
  const batch=randomUUID(),uploaded=[];
  let insertAttempted=false;
  try {
    for (const file of prepared) {
      const extension=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' })[file.mime];
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

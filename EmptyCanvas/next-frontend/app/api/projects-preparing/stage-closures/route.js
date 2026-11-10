import { NextResponse } from 'next/server';
import { getDirectAccountGate } from '../../../../lib/products-auth';
import { featureGate } from '../../../../lib/feature-permissions-server';
import { preparingStageGate, preparingStageReadGate } from '../../../../lib/preparing-stage-access';
import { closeProjectStage, getStageClosure, getClosureDocument, validateClosureStage, uploadStageDocument, finalizeStageDocuments } from '../../../../lib/preparing-stage-closures';
export const dynamic='force-dynamic';
export const revalidate=0;
export const runtime='nodejs';
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const gate=async()=>featureGate(await getDirectAccountGate(['Projects Preparing']),'preparing.view');
function failure(e){console.error('[preparing:stage-closures]',e?.message||e);return reply({ok:false,error:e?.message||'Stage closure failed.'},Number(e?.status)||500);}
export async function GET(req){
  try{
    const params=new URL(req.url).searchParams,stage=validateClosureStage(params.get('stage')),projectId=params.get('projectId');
    const auth=preparingStageReadGate(await gate(),stage);
    if(!auth.ok)return reply({ok:false,error:auth.error||'Access denied.'},auth.status||403);
    if(params.has('document')){
      const value=params.get('document');
      if(!/^\d+$/.test(value))return reply({ok:false,error:'Invalid document.'},400);
      const url=await getClosureDocument(projectId,stage,Number(value));
      // Proxy through the authenticated ERP route: self-hosted Storage may use an internal hostname.
      const image=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
      const mime=(image.headers.get('content-type')||'').split(';')[0].trim();
      if(!image.ok||!image.body||!['image/jpeg','image/png','image/webp','application/pdf'].includes(mime))return reply({ok:false,error:'Unable to read signed document.'},502);
      return new Response(image.body,{headers:{'Content-Type':mime,'Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
    }
    return reply({ok:true,closure:await getStageClosure(projectId,stage)});
  }catch(e){return failure(e);}
}
export async function POST(req){
  try{
    const params=new URL(req.url).searchParams,stage=validateClosureStage(params.get('stage')),projectId=params.get('projectId');
    const auth=preparingStageGate(await gate(),stage);
    if(!auth.ok)return reply({ok:false,error:auth.error||'Access denied.'},auth.status||403);
    if(Number(req.headers.get('content-length'))>4000000)return reply({ok:false,error:'Upload is too large.'},413);
    if(params.get('action')==='finalize'){
      const body=await req.json();
      return reply({ok:true,closure:await finalizeStageDocuments(projectId,stage,body.receipts,auth.account)},201);
    }
    const form=await req.formData();
    if(params.get('action')==='upload'){
      const documents=form.getAll('documents');
      if(documents.length!==1)return reply({ok:false,error:'Upload one document per request.'},400);
      return reply({ok:true,receipt:await uploadStageDocument(projectId,stage,documents[0],auth.account)},201);
    }
    return reply({ok:true,closure:await closeProjectStage(projectId,stage,form.getAll('documents'),auth.account)},201);
  }catch(e){return failure(e);}
}

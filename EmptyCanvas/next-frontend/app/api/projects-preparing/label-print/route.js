import {preparingStageReadGate} from '../../../../lib/preparing-stage-access';
import {getDirectAccountGate} from '../../../../lib/products-auth';
import {featureGate} from '../../../../lib/feature-permissions-server';
import {readPublicLabel} from '../../../../lib/preparing-label-content';
import {configuredLabelSecret,configuredPublicLabelBase,labelIdentity,labelToken,publicLabelUrl} from '../../../../lib/preparing-label-token.mjs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const fail=(message,status)=>Response.json({ok:false,error:message},{status,headers:{'Cache-Control':'private, no-store'}});
function collect(doc){return new Promise((resolve,reject)=>{const bytes=[];doc.on('data',chunk=>bytes.push(chunk));doc.on('end',()=>resolve(Buffer.concat(bytes)));doc.on('error',reject);});}
const plain=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
// PDFKit base fonts don't have Arabic glyphs. The QR's scan page always shows
// the complete school name correctly; optionally configure an Arabic-aware font.
function pdfText(value,fontReady){const str=plain(value);return fontReady?str: /[^\u0020-\u007e]/.test(str)?'Scan QR for full name':str;}
export async function GET(request){
 const params=new URL(request.url).searchParams,kind=params.get('kind'),id=params.get('id'),projectId=params.get('projectId');
 if(!labelIdentity(kind,id)||!projectId||!/^[\da-f-]{36}$/i.test(projectId))return fail('Invalid label request.',400);
 const initial=featureGate(await getDirectAccountGate(['Projects Preparing']),'preparing.view');
 const gate=preparingStageReadGate(initial,kind==='kit'?'boxes':'cartons');
 if(!gate.ok)return fail(gate.error||'Access denied.',gate.status||403);
 try{
  const secret=configuredLabelSecret();
  // Validate project ownership before printing: an authenticated user cannot
  // claim an arbitrary project ID to obtain another project's label.
  const {selectById}=await import('../../../../lib/supabase-rest');
  const record=await selectById(kind==='kit'?'erp_preparing_project_cartons':'erp_preparing_school_cartons',id);
  if(!record || record.project_id!==projectId)return fail('Label not found in this project.',404);
  const label=await readPublicLabel(kind,id);
  const base=configuredPublicLabelBase();
  const url=publicLabelUrl(kind,id,labelToken(kind,id,secret),base);
  const qr=await QRCode.toBuffer(url,{type:'png',width:320,margin:1,errorCorrectionLevel:'M',color:{dark:'#121821',light:'#FFFFFF'}});
  // Compact 105 x 75 mm physical sticker (single label per PDF).
  const width=297.64,height=212.6;
  const doc=new PDFDocument({size:[width,height],margin:0,compress:true,info:{Title:`${kind==='kit'?'Kit':'Carton'} ${label.label}`,Creator:'Pyramakerz ERP'}});
  const done=collect(doc);
  let fontReady=false;
  if(process.env.PREPARING_LABEL_PDF_FONT){try{doc.registerFont('LabelUnicode',process.env.PREPARING_LABEL_PDF_FONT);fontReady=true;}catch(e){console.warn('[preparing-label] Unicode font unavailable:',e?.message);}}
  const font=fontReady?'LabelUnicode':'Helvetica';
  doc.rect(0,0,width,height).fill('#fff');
  doc.rect(0,0,width,7).fill('#fb7000');
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('PYRAMAKERZ  /  PROJECTS',14,16,{width:269});
  doc.font('Helvetica').fontSize(8).fillColor('#7b8592').text(kind==='kit'?'SCHOOL KIT LABEL':'SCHOOL CARTON LABEL',14,35,{width:152});
  doc.fillColor('#131824').font('Helvetica-Bold').fontSize(21).text(plain(label.label),14,49,{width:168,height:54,ellipsis:true});
  doc.strokeColor('#e1e3e8').lineWidth(.7).moveTo(14,108).lineTo(174,108).stroke();
  doc.font(font).fillColor('#29313f').fontSize(9).text(pdfText(label.schoolName,fontReady),14,118,{width:155,height:28,ellipsis:true});
  const desc=kind==='kit'?pdfText(label.kitGroup,fontReady):`${label.kitCount} completed Kits`;
  doc.font(font).fontSize(8).fillColor('#6b7280').text(desc,14,147,{width:155,height:22,ellipsis:true});
  doc.roundedRect(14,178,119,22,6).fill(kind==='kit'&&label.status!=='Packed'?'#fff0e1':'#eaf7ee');
  doc.fillColor(kind==='kit'&&label.status!=='Packed'?'#ab540e':'#147b43').font('Helvetica-Bold').fontSize(8)
    .text(label.status.toUpperCase(),20,185,{width:106});
  doc.image(qr,177,45,{fit:[105,105]});
  doc.font('Helvetica').fillColor('#677284').fontSize(7).text('SCAN FOR CONTENTS',177,156,{width:105,align:'center'});
  doc.font('Helvetica').fillColor('#9aa3b1').fontSize(6).text('Anyone with this QR can view the item list.',152,189,{width:131,align:'right'});
  doc.end();const buffer=await done;
  const safeName=`${kind}-${String(label.label).replace(/[^a-zA-Z0-9-]/g,'_').slice(0,70)}.pdf`;
  return new Response(buffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${safeName}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){console.error('[preparing-label-print]',e?.message||e);return fail(e?.status===503?e.message:'Label PDF could not be generated.',e?.status||500);}
}

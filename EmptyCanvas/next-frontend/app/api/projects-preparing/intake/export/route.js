import { preparingStageReadGate } from "../../../../../lib/preparing-stage-access";
import PDFDocument from "pdfkit";
import {getDirectAccountGate} from "../../../../../lib/products-auth";
import {featureGate} from "../../../../../lib/feature-permissions-server";
import {productionIntakeOverview} from "../../../../../lib/preparing-project-testing";
import {TESTING_EXPORT_COLUMNS,testingGroups,testingExportValue} from "../../../../../lib/preparing-project-testing-grouping.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(message,status)=>Response.json({ok:false,error:message},{status,headers:{"Cache-Control":"private, no-store"}});
const labels=Object.fromEntries(TESTING_EXPORT_COLUMNS.map(col=>[col.key,col.label.replace("Tested", "Received")]));
const widths={name:214,code:66,required:66,tested:92,remaining:73,testedBy:92,signature:104};
function collect(doc){return new Promise((resolve,reject)=>{const chunks=[];doc.on("data",chunk=>chunks.push(chunk));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});}

export async function POST(request){
 const gate=preparingStageReadGate(featureGate(await getDirectAccountGate(["Projects Preparing"]),"preparing.view"),"intake");
 if(!gate.ok)return reply(gate.error||"Access denied.",gate.status||403);
 try{
  const body=await request.json();
  const columns=body?.columns;
  if(!Array.isArray(columns)||!columns.length||columns.length>TESTING_EXPORT_COLUMNS.length||new Set(columns).size!==columns.length
   ||columns.some(key=>typeof key!=="string"||!labels[key])||!columns.includes("name"))return reply("Choose valid export columns including Component.",400);
  if(typeof body.blank!=="boolean")return reply("Invalid export mode.",400);
  const data=await productionIntakeOverview(body.projectId);
  const visible=new Set(Array.isArray(body.groupKeys)?body.groupKeys:[]);
  if(visible.size>150||[...visible].some(key=>typeof key!=="string"||key.length>200))return reply("Invalid Kit selection.",400);
  const groups=testingGroups(data.items||[],data.kitGroups||[]).filter(g=>!visible.size||visible.has(g.key));
  const doc=new PDFDocument({size:"A4",layout:"landscape",margin:32,bufferPages:true,info:{Title:body.blank?"Blank Production Receiving Sheet":"Production Receiving Results",Creator:"Projects Preparing ERP"}});
  const done=collect(doc),left=32,right=doc.page.width-32,available=right-left;
  const base=columns.reduce((sum,key)=>sum+widths[key],0),scale=available/base;
  const specs=columns.map(key=>({key,width:widths[key]*scale}));
  const now=new Date().toISOString().slice(0,10);
  let y=32,page=1;
  const drawPageTitle=()=>{
   doc.rect(left,y,available,4).fill("#ef8827");y+=13;
   doc.fillColor("#152036").font("Helvetica-Bold").fontSize(16).text("PRODUCTION RECEIVING",left,y,{width:available});y+=23;
   doc.fillColor("#687386").font("Helvetica").fontSize(9).text(`${body.blank?"PHYSICAL RECEIVING SHEET - FILL IN BY HAND":"SAVED RESULTS"}   |   Project: ${String(body.projectName||"Project").slice(0,90)}   |   Date: ${now}`,left,y,{width:available});y+=18;
   doc.strokeColor("#e3e7ed").moveTo(left,y).lineTo(right,y).stroke();y+=14;
  };
  const newPage=()=>{doc.addPage();page++;y=32;drawPageTitle();};
  const ensure=height=>{if(y+height>doc.page.height-37)newPage();};
  const drawTableHead=()=>{
   ensure(26);doc.rect(left,y,available,24).fill("#eff1f5");let x=left;
   for(const col of specs){doc.font("Helvetica-Bold").fontSize(8).fillColor("#344053").text(labels[col.key],x+5,y+5,{width:col.width-10,height:16,ellipsis:true});x+=col.width;}
   y+=24;
  };
  drawPageTitle();
  if(!groups.length){doc.fontSize(10).fillColor("#667085").text("No components matched the selected Kit groups.",left,y);}
  for(const group of groups){
   ensure(60);doc.roundedRect(left,y,available,22,5).fill("#fff1e3");
   doc.font("Helvetica-Bold").fontSize(10).fillColor("#a55c20").text(group.name,left+9,y+6,{width:available-16,height:14,ellipsis:true});
   y+=27;drawTableHead();
   for(const row of group.items){
    const nameCol=specs.find(c=>c.key==="name");
    doc.font("Helvetica").fontSize(8.8);
    const nameHeight=doc.heightOfString(String(row.name||""),{width:Math.max(40,nameCol.width-10)});
    const h=Math.max(body.blank?43:34,Math.min(68,Math.ceil(nameHeight)+12));
    if(y+h>doc.page.height-37){newPage();doc.font("Helvetica-Bold").fontSize(9).fillColor("#a55c20").text(`${group.name} (continued)`,left,y,{width:available});y+=18;drawTableHead();}
    doc.rect(left,y,available,h).fill((Math.floor(y)%2)?"#ffffff":"#fbfcfe");
    doc.strokeColor("#e6eaf0").lineWidth(.45).moveTo(left,y+h).lineTo(right,y+h).stroke();
    let x=left;
    for(const col of specs){
     const value=String(testingExportValue(row,col.key,body.blank));
     doc.fillColor("#263244").font("Helvetica").fontSize(8.8);
     if(body.blank&&["tested","remaining","testedBy","signature"].includes(col.key)){
      doc.strokeColor("#b9c3d0").lineWidth(.55).moveTo(x+7,y+h-12).lineTo(x+col.width-7,y+h-12).stroke();
     }else if(value){doc.text(value,x+5,y+8,{width:col.width-10,height:h-11,ellipsis:true});}
     x+=col.width;
    }
    y+=h;
   }
   y+=13;
  }
  if(body.blank){ensure(40);doc.font("Helvetica").fontSize(8).fillColor("#637083").text("Notes: ____________________________________________    Supervisor signature: ________________________",left,y,{width:available});}
  const pages=doc.bufferedPageRange();
  for(let i=pages.start;i<pages.start+pages.count;i++){
   doc.switchToPage(i);
   doc.font("Helvetica").fontSize(8).fillColor("#98a2b3").text(`Projects Preparing  |  ${i+1} / ${pages.count}`,left,doc.page.height-42,{width:available,align:"right",lineBreak:false});
  }
  doc.end();const pdf=await done;
  return new Response(pdf,{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="production-intake-${body.blank?"blank":"results"}-${now}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){console.error("[preparing:testing:export]",e?.message||e);return reply(e?.message||"PDF export failed.",Number(e?.status)||500);}
}

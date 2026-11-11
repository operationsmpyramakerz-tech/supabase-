import { preparingStageReadGate } from "../../../../../lib/preparing-stage-access";
import PDFDocument from "pdfkit";
import {getDirectAccountGate} from "../../../../../lib/products-auth";
import {featureGate} from "../../../../../lib/feature-permissions-server";
import {warehouseWorkspace} from "../../../../../lib/preparing-warehouse";
import {warehouseTotals,warehouseReceivingBalances,projectRequired} from "../../../../../lib/preparing-warehouse-math.mjs";
import {WAREHOUSE_COLUMNS,warehouseGroups,warehouseExportValue} from "../../../../../lib/preparing-warehouse-view.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const reply=(message,status)=>Response.json({ok:false,error:message},{status,headers:{"Cache-Control":"private, no-store"}});
const labels=Object.fromEntries(WAREHOUSE_COLUMNS.map(col=>[col.key,col.label]));
const widths={name:215,code:69,required:70,tested:70,accepted:70,allocated:70,available:75,remaining:75,receivedBy:120,signature:114};
function collect(doc){return new Promise((resolve,reject)=>{const chunks=[];doc.on("data",chunk=>chunks.push(chunk));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});}
export async function POST(request){
 const gate=preparingStageReadGate(featureGate(await getDirectAccountGate(["Projects Preparing"]),"preparing.view"),"warehouse");
 if(!gate.ok)return reply(gate.error||"Access denied.",gate.status||403);
 try{
  const body=await request.json();
  const columns=body?.columns;
  if(!Array.isArray(columns)||!columns.length||columns.length>WAREHOUSE_COLUMNS.length||new Set(columns).size!==columns.length||columns.some(k=>typeof k!=="string"||!labels[k])||!columns.includes("name"))return reply("Choose valid export columns including Component.",400);
  if(typeof body.blank!=="boolean")return reply("Invalid export mode.",400);
  const visible=new Set(Array.isArray(body.groupKeys)?body.groupKeys:[]);
  if(visible.size>150||[...visible].some(key=>typeof key!=="string"||key.length>200))return reply("Invalid Kit groups.",400);
  const state=await warehouseWorkspace(body.projectId);
  const count=state.schools.length;
  const items=warehouseReceivingBalances(warehouseTotals(state.items.map(r=>({...r,required_qty:projectRequired(Number(r.required_qty||0),count)})),state.receiptLines,state.allocations),state.testingBalances||[]);
  const members=new Map();
  for(const receipt of [...state.receipts].reverse()){
   if(!receipt.created_by_name)continue;
   for(const line of state.receiptLines.filter(r=>r.receipt_id===receipt.id)){
    if(!members.has(line.item_id))members.set(line.item_id,new Map());
    members.get(line.item_id).set(receipt.created_by_id,{id:receipt.created_by_id,name:receipt.created_by_name});
   }
  }
  const groups=warehouseGroups(items.filter(row=>Number(row.tested)>0||Number(row.accepted)>0).map(row=>({...row,receivedBy:[...(members.get(row.id)?.values()||[])]})),state.kitGroups).filter(g=>!visible.size||visible.has(g.key));
  const doc=new PDFDocument({size:"A4",layout:"landscape",margin:32,bufferPages:true,info:{Title:body.blank?"Blank Warehouse Return":"Project Warehouse Returns",Creator:"Projects Preparing ERP"}});
  const done=collect(doc),left=32,right=doc.page.width-32,available=right-left;
  const base=columns.reduce((sum,key)=>sum+widths[key],0),scale=available/base,specs=columns.map(key=>({key,width:widths[key]*scale}));
  const now=new Date().toISOString().slice(0,10);
  let y=32;
  function title(){doc.rect(left,y,available,4).fill("#ed8729");y+=12;
   doc.fillColor("#18253b").font("Helvetica-Bold").fontSize(15).text("PROJECT WAREHOUSE RETURN",left,y,{width:available});y+=22;
   doc.fillColor("#647386").font("Helvetica").fontSize(9).text(`${body.blank?"BLANK RETURN FORM - COMPLETE BY HAND":"SAVED WAREHOUSE RETURNS"}  |  ${now}`,left,y,{width:available});y+=17;
   doc.strokeColor("#e4e8ef").moveTo(left,y).lineTo(right,y).stroke();y+=12;
  }
  function page(){doc.addPage();y=32;title();}
  function ensure(h){if(y+h>doc.page.height-37)page();}
  function tableHead(){ensure(26);doc.rect(left,y,available,24).fill("#eff2f6");let x=left;
   for(const c of specs){doc.fillColor("#3b4659").font("Helvetica-Bold").fontSize(8).text(labels[c.key],x+5,y+5,{width:c.width-10,height:15,ellipsis:true});x+=c.width;}y+=24;
  }
  title();
  if(!groups.length)doc.fontSize(10).fillColor("#667085").text("No matching components.",left,y);
  for(const group of groups){
   ensure(60);doc.roundedRect(left,y,available,22,5).fill("#fff2e4");doc.font("Helvetica-Bold").fontSize(10).fillColor("#a65e23").text(group.name,left+9,y+6,{width:available-16,height:14,ellipsis:true});y+=26;tableHead();
   for(const row of group.items){
    const nameWidth=specs.find(c=>c.key==="name").width-10;
    doc.font("Helvetica").fontSize(8.5);
    const ht=doc.heightOfString(String(row.name||""),{width:Math.max(40,nameWidth)}),h=Math.max(body.blank?44:34,Math.min(70,Math.ceil(ht)+12));
    if(y+h>doc.page.height-37){page();doc.font("Helvetica-Bold").fontSize(9).fillColor("#a65e23").text(`${group.name} (continued)`,left,y,{width:available});y+=18;tableHead();}
    doc.rect(left,y,available,h).fill("#ffffff");doc.strokeColor("#e6eaf0").lineWidth(.45).moveTo(left,y+h).lineTo(right,y+h).stroke();
    let x=left;
    for(const col of specs){const v=String(warehouseExportValue(row,col.key,body.blank));
     doc.fillColor("#263244").font("Helvetica").fontSize(8.6);
     if(body.blank&&["accepted","allocated","available","remaining","receivedBy","signature"].includes(col.key)){
      doc.strokeColor("#b9c3d0").lineWidth(.55).moveTo(x+7,y+h-12).lineTo(x+col.width-7,y+h-12).stroke();
     } else if(v)doc.text(v,x+5,y+8,{width:col.width-10,height:h-11,ellipsis:true});x+=col.width;
    }y+=h;
   }
   y+=13;
  }
  if(body.blank){ensure(32);doc.font("Helvetica").fontSize(8).fillColor("#69778b").text("Return reference: ______________________  Warehouse receiver: ______________________  Signature: ______________________",left,y,{width:available});}
  const pages=doc.bufferedPageRange();
  for(let i=pages.start;i<pages.start+pages.count;i++){doc.switchToPage(i);doc.font("Helvetica").fontSize(8).fillColor("#98a2b3").text(`Projects Preparing | ${i+1} / ${pages.count}`,left,doc.page.height-42,{width:available,align:"right",lineBreak:false});}
  doc.end();const buffer=await done;
  return new Response(buffer,{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="warehouse-return-${body.blank?"blank":"values"}-${now}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){console.error("[preparing:warehouse:export]",e?.message||e);return reply(e?.message||"Warehouse Return PDF export failed.",Number(e?.status)||500);}
}

import PDFDocument from "pdfkit";
import {getDirectAccountGate} from "../../../../../lib/products-auth";
import {featureGate} from "../../../../../lib/feature-permissions-server";
import {productionWorkspace} from "../../../../../lib/preparing-production";
import {warehouseGroups} from "../../../../../lib/preparing-warehouse-view.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const KEYS={name:"Component",code:"Code",required:"Project Required",warehouse:"Warehouse Received",production:"Production Received",available:"Available for Production",packed:"Packed",unpacked:"Unpacked",receivedBy:"Received By",signature:"Signature"};
const WIDTH={name:210,code:65,required:70,warehouse:90,production:90,available:90,packed:65,unpacked:70,receivedBy:110,signature:105};
const fail=(message,status=400)=>Response.json({ok:false,error:message},{status,headers:{"Cache-Control":"private, no-store"}});
const save=doc=>new Promise((resolve,reject)=>{const buffers=[];doc.on("data",d=>buffers.push(d));doc.on("end",()=>resolve(Buffer.concat(buffers)));doc.on("error",reject);});
export async function POST(req){
 const gate=featureGate(await getDirectAccountGate(["Projects Preparing"]),"preparing.view");if(!gate.ok)return fail(gate.error||"Access denied.",gate.status||403);
 try{
  const body=await req.json(),columns=body?.columns;
  const scope=body?.scope==="boxes"?"boxes":"receiving";
  const receiveKeys=new Set(["name","code","required","warehouse","production","available","receivedBy","signature"]);
  const boxKeys=new Set(["name","code","required","production","packed","unpacked","signature"]);
  const permitted=scope==="boxes"?boxKeys:receiveKeys;
  if(!Array.isArray(columns)||!columns.length||columns.length>Object.keys(KEYS).length||new Set(columns).size!==columns.length||columns.some(c=>!permitted.has(c))||!columns.includes("name")||typeof body.blank!=="boolean")return fail("Choose valid export columns and mode.");
  const selected=new Set(Array.isArray(body.groupKeys)?body.groupKeys:[]);
  if(selected.size>150||[...selected].some(key=>typeof key!=="string"||key.length>200))return fail("Invalid Kit group selection.");
  const state=await productionWorkspace(body.projectId);
  const names=new Map();for(const h of [...state.handoffs].reverse()){if(!names.has(h.item_id))names.set(h.item_id,new Map());names.get(h.item_id).set(h.received_by_id,h.received_by_name);}
  const groups=warehouseGroups(state.items.map(item=>({...item,required_qty:Number(item.required_qty||0)*Math.max(1,state.schoolsCount),receivedBy:[...(names.get(item.id)?.values()||[])]})),state.kitGroups).filter(g=>!selected.size||selected.has(g.key));
  const doc=new PDFDocument({size:"A4",layout:"landscape",margin:32,bufferPages:true,info:{Title:scope==="boxes"?"Box Distribution":"Production Receiving",Creator:"Projects Preparing ERP"}}),done=save(doc);
  const left=32,available=doc.page.width-64,scale=available/columns.reduce((sum,c)=>sum+WIDTH[c],0),spec=columns.map(key=>({key,width:WIDTH[key]*scale}));let y=32;const today=new Date().toISOString().slice(0,10);
  function header(){doc.rect(left,y,available,4).fill("#ec8428");y+=11;doc.fillColor("#172338").font("Helvetica-Bold").fontSize(15).text(scope==="boxes"?"BOX DISTRIBUTION":"PRODUCTION RECEIVING",left,y,{width:available});y+=23;doc.font("Helvetica").fontSize(9).fillColor("#68788d").text(`${body.blank?"BLANK PHYSICAL HANDOVER SHEET":scope==="boxes"?"SAVED BOX DISTRIBUTION":"SAVED PRODUCTION RECEIPTS"}  |  ${today}`,left,y);y+=25;}
  function page(){doc.addPage();y=32;header();}
  function ensure(h){if(y+h>doc.page.height-45)page();}
  function heads(){ensure(25);doc.rect(left,y,available,22).fill("#eff2f7");let x=left;for(const c of spec){doc.fillColor("#3d4b5d").font("Helvetica-Bold").fontSize(7.5).text(KEYS[c.key],x+4,y+5,{width:c.width-8,height:16,ellipsis:true});x+=c.width;}y+=22;}
  function val(r,k){if(k==="name")return r.product_name;if(k==="code")return r.product_id||"";if(k==="required")return String(r.required_qty);if(k==="warehouse")return String(r.warehouseReceived);if(body.blank)return "";if(k==="production")return String(r.productionReceived);if(k==="available")return String(r.availableToProduction);if(k==="packed")return String(r.packedQty);if(k==="unpacked")return String(r.unpacked);if(k==="receivedBy")return r.receivedBy.join("; ");return "";}
  header();if(!groups.length)doc.fontSize(11).text("No matching components",left,y);
  for(const g of groups){ensure(57);doc.roundedRect(left,y,available,22,4).fill("#fff2e6");doc.fillColor("#9e5c29").font("Helvetica-Bold").fontSize(10).text(g.name,left+8,y+5,{width:available-16,height:13,ellipsis:true});y+=27;heads();for(const r of g.items){const h=body.blank?46:37;ensure(h+2);doc.moveTo(left,y+h).lineTo(left+available,y+h).strokeColor("#e1e7ee").lineWidth(.5).stroke();let x=left;for(const c of spec){const v=String(val(r,c.key)||"");if(body.blank&&["production","available","packed","unpacked","receivedBy","signature"].includes(c.key)){doc.moveTo(x+6,y+h-12).lineTo(x+c.width-7,y+h-12).strokeColor("#afb9c6").stroke();}else if(v)doc.font("Helvetica").fontSize(8).fillColor("#263346").text(v,x+4,y+8,{width:c.width-8,height:h-12,ellipsis:true});x+=c.width;}y+=h;}y+=13;}
  if(body.blank){ensure(32);doc.font("Helvetica").fontSize(8).fillColor("#506077").text(scope==="boxes"?"Box reference: __________________  Packed by: __________________  Signature: __________________":"Handover reference: __________________  Production receiver: __________________  Signature: __________________",left,y,{width:available});}
  const pages=doc.bufferedPageRange();for(let i=pages.start;i<pages.start+pages.count;i++){doc.switchToPage(i);doc.font("Helvetica").fontSize(8).fillColor("#95a1b4").text(`Projects Preparing | ${i+1} / ${pages.count}`,left,doc.page.height-42,{width:available,align:"right",lineBreak:false});}
  doc.end();return new Response(await done,{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="production-${scope}-${body.blank?"blank":"values"}-${today}.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){console.error("[preparing:production:export]",e?.message||e);return fail(e.message||"Production PDF export failed.",e.status||500);}
}

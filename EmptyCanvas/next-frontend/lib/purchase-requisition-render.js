import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import pdfArabicSupport from "./pdfArabicSupport";
import { normalizePrForm, PR_SIGNERS } from "./purchase-requisition-data.mjs";

const { enableArabicPdf, ensurePdfArabicSupport, withNativeArabicPdfText } = pdfArabicSupport;
const encodeXml = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;").replace(/\r?\n/g,"&#10;");
const safe = value => String(value || "").replace(/[\\/:*?"<>|]/g,"-").slice(0,90);
const displayDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value.split("-").reverse().join(" / ") : value;
const check = (value, labels) => { const active = new Set(String(value || "").split(/[,،;]/).map(v => v.trim()).filter(Boolean)); return labels.map(label => `${active.has(label) ? "☑" : "☐"} ${label}`).join("  "); };
function variables(form) {
  const v = {
    PR_NUMBER:form.prNumber,REQUEST_DATE:displayDate(form.requestDate),DEPARTMENT:form.department,
    COST_CENTER:form.costCenter,REQUESTER:form.requester,WORK_ORDER:form.workOrder,
    REQUEST_TYPE:check(form.requestType,["مخزني","خدمة","أصل ثابت"]),
    PRIORITY:check(form.priority,["عادي","عاجل","طارئ"]),
    REQUIRED_DATE:displayDate(form.requiredDate),DELIVERY_PLACE:form.deliveryPlace,
    MIN_SHELF_LIFE:form.minShelfLife,INSPECTION:form.inspection,
    ATTACHMENTS:check(form.attachments,["كتالوج","صورة","مواصفة","أخرى"]),
    ALTERNATIVE:check(form.alternative,["نعم","لا","بموافقة فنية"]),
    STOCK_AVAILABLE:check(form.stockAvailable,["نعم","لا"]),
    PURCHASE_REASON:form.purchaseReason,NOTES:form.notes,
  };
  for(const role of PR_SIGNERS){
    for(const attr of ["name","signature","date"])v[`SIGN_${role.toUpperCase()}_${attr.toUpperCase()}`] = `${({name:"الاسم",signature:"التوقيع",date:"التاريخ"})[attr]}: ${attr === "date" ? (displayDate(form.signatures[role][attr]) || ".... / .... / ........") : (form.signatures[role][attr] || "........................")}`;
  }
  return v;
}
export async function renderPrWord(raw) {
  const form = normalizePrForm(raw);
  const file = await fs.readFile(path.join(process.cwd(),"public","templates","purchase-requisition-template.docx"));
  const zip = await JSZip.loadAsync(file);
  let xml = await zip.file("word/document.xml").async("string");
  const rowIndex = xml.indexOf("__ITEM_SEQ__");
  if(rowIndex < 0) throw new Error("Purchase Requisition template is missing the item row");
  const rowStarts = [...xml.slice(0,rowIndex).matchAll(/<w:tr(?=[\s>])/g)];
  const start = rowStarts.length ? rowStarts[rowStarts.length - 1].index : -1;
  const end = xml.indexOf("</w:tr>",rowIndex) + 7;
  if(start < 0 || end < 7) throw new Error("Could not locate purchase requisition item table");
  const prototype = xml.slice(start,end);
  const rows = (form.items.length ? form.items : [{}]).map((item,i) => {
    const props = { SEQ:String(i+1),CODE:item.code||"",DESCRIPTION:item.description||"",UNIT:item.unit||"",QTY:item.quantity||"",MODEL:item.model||"",WARRANTY:item.warranty||"",EXPIRY:item.expiry||"" };
    return prototype.replace(/__ITEM_([A-Z]+)__/g,(_match,key)=>encodeXml(props[key] || ""));
  }).join("");
  xml = xml.slice(0,start) + rows + xml.slice(end);
  const map=variables(form);
  xml = xml.replace(/__([A-Z_]+)__/g,(_match,key)=>Object.prototype.hasOwnProperty.call(map,key) ? encodeXml(map[key]||"") : _match);
  zip.file("word/document.xml",xml);
  return await zip.generateAsync({ type:"nodebuffer",compression:"DEFLATE",compressionOptions:{level:6} });
}

// PDFKit renderer follows the five sections, tables, orange headings, logo and signature grid
// in the supplied Word sample. It paginates long purchase lists rather than truncating them.
// Where LibreOffice is installed, convert the ORIGINAL filled Word design into PDF.
// That preserves the exact page breaks, artwork and watermark; the native PDF
// renderer below remains functional when Office is not available on the server.
async function convertFilledWordToPdf(raw) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "erp-pr-"));
  try {
    const source = path.join(dir, "purchase-requisition.docx");
    const output = path.join(dir, "purchase-requisition.pdf");
    await fs.writeFile(source, await renderPrWord(raw));
    const command = process.env.PR_LIBREOFFICE_BIN || "libreoffice";
    await promisify(execFile)(command, [
      `-env:UserInstallation=${new URL(`file://${dir}/lo-profile`).href}`,
      "--headless", "--convert-to", "pdf", "--outdir", dir, source,
    ], { timeout: 25000, maxBuffer: 1024 * 1024 });
    const buffer = await fs.readFile(output);
    if (!buffer.subarray(0,5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid converted PDF");
    return buffer;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
export async function renderPrPdf(raw) {
  try { return await convertFilledWordToPdf(raw); }
  catch (error) { console.warn("[purchase-requisition] Word-to-PDF conversion unavailable, using native PDF renderer:", error?.message); }
  const form = normalizePrForm(raw);
  await ensurePdfArabicSupport();
  const doc = new PDFDocument({size:"A4",margin:28,compress:true,bufferPages:true,autoFirstPage:true});
  enableArabicPdf(doc);
  const chunks=[];doc.on("data",c=>chunks.push(c));
  const ready = new Promise((resolve,reject)=>{doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});
  const pw=doc.page.width,ph=doc.page.height,x=33,w=pw-66;
  const line="#B7BDC5",ink="#253746",orange="#C66723";
  const drawTxt=(str,xx,yy,ww,hh,{fontSize=9,bold=false,align="right",color=ink}={})=>{
    doc.fillColor(color).font(bold?"Helvetica-Bold":"Helvetica").fontSize(fontSize);
    doc.text(String(str||""),xx+4,yy+3,{width:ww-8,height:hh-5,align,ellipsis:true,lineBreak:false});
  };
  const cell=(txt,xx,yy,ww,hh,opts={})=>{
    doc.rect(xx,yy,ww,hh).lineWidth(.65).stroke(line);
    drawTxt(txt,xx,yy,ww,hh,opts);
  };
  function header(){
    try{doc.image(path.join(process.cwd(),"public","images","purchase-requisition-logo.png"),x+4,23,{width:67});}catch{}
    drawTxt("PRO Pyramakerz",pw-195,27,160,23,{fontSize:12,align:"right"});
    drawTxt("Global HLD",pw-195,46,160,19,{fontSize:12,align:"right"});
  }
  const watermark=()=>{
    doc.save().opacity(.055).fillColor("#182D43");
    const cx=pw/2,cy=ph/2;
    for(let j=0;j<4;j++){
      const s=85+j*50;
      doc.save().translate(cx,cy).rotate(45).rect(-s/2,-s/2,s,s).lineWidth(17).stroke("#182D43").restore();
    }
    doc.restore();
  };
  const begin=()=>{header();watermark();};
  const ensure=(y,h)=>{if(y+h > ph-46){doc.addPage();begin();return 100;}return y;};
  const heading=(value,y)=>{doc.fillColor(orange).font("Helvetica-Bold").fontSize(12);doc.text(value,x,y,{width:w,align:"right"});return y+23;};
  const row4=(a,b,c,d,y,h=29)=>{const widths=[w*.28,w*.22,w*.27,w*.23];let xx=x+w;for(const [v,ww,opts] of [[a,widths[0],{bold:true}],[b,widths[1],{}],[c,widths[2],{bold:true}],[d,widths[3],{}]]){xx-=ww;cell(v,xx,y,ww,h,opts)}return y+h;};
  begin();
  let y=107;
  drawTxt("PURCHASE REQUISITION (PR)   |   نموذج طلب شراء",x,y,w,31,{fontSize:15,bold:true,align:"center"});y+=36;
  y=heading("أولاً | بيانات طلب الشراء",y);
  y=row4("رقم طلب الشراء (PR No.)",form.prNumber,"تاريخ الطلب",displayDate(form.requestDate),y);
  y=row4("الإدارة / القسم الطالب",form.department,"مركز التكلفة / المشروع",form.costCenter,y);
  y=row4("اسم مقدم الطلب / الوظيفة",form.requester,"رقم أمر الشغل (إن وجد)",form.workOrder,y);
  y=row4("نوع الطلب",check(form.requestType,["مخزني","خدمة","أصل ثابت"]),"درجة الأولوية",check(form.priority,["عادي","عاجل","طارئ"]),y);
  y+=8;y=heading("ثانياً | الأصناف / الخدمات المطلوبة",y);
  drawTxt("يُكتب لكل صنف وصف فني واضح؛ ويمكن إرفاق كشف تكميلي مع الإشارة إلى رقم الطلب نفسه.",x,y,w,19,{fontSize:9});y+=21;
  const widths=[26,66,175,38,38,78,65,w-(26+66+175+38+38+78+65)];
  const headers=["م","كود الصنف","اسم الصنف / الخدمة والمواصفات الفنية","الوحدة","الكمية","العلامة / الموديل / المقاس","الضمان المطلوب","الصلاحية / تاريخ الانتهاء"];
  const itemRow=(values,yy,h,headerMode=false)=>{
    let xx=x+w;for(let i=0;i<widths.length;i++){
      const ww=widths[i];xx-=ww;
      if(headerMode)doc.rect(xx,yy,ww,h).fill("#F3F5F7");
      cell(values[i],xx,yy,ww,h,{fontSize:headerMode?8:7.8,bold:headerMode,align:i===2?"right":"center"});
    }
    return yy+h;
  };
  const drawTableHeader=()=>{y=itemRow(headers,y,39,true);};
  drawTableHeader();
  for(let i=0;i<Math.max(4,form.items.length);i++){
    y=ensure(y,39);
    if(y===100)drawTableHeader();
    const it=form.items[i]||{};
    const values=[String(i+1),it.code||"",it.description||"",it.unit||"",it.quantity||"",it.model||"",it.warranty||"",it.expiry||""];
    y=itemRow(values,y,38);
  }
  y=ensure(y,174);y+=8;y=heading("ثالثاً | المتطلبات الفنية والتسليم",y);
  y=row4("تاريخ التوريد المطلوب",displayDate(form.requiredDate),"مكان التسليم",form.deliveryPlace,y);
  y=row4("الحد الأدنى للصلاحية عند التوريد",form.minShelfLife,"متطلبات الفحص / الاختبار",form.inspection,y);
  y=row4("المرفقات",check(form.attachments,["كتالوج","صورة","مواصفة","أخرى"]),"بديل معادل مسموح؟",check(form.alternative,["نعم","لا","بموافقة فنية"]),y);
  y=row4("هل الصنف متاح بالمخزن؟",check(form.stockAvailable,["نعم","لا"]),"مبرر الشراء / الاستخدام",form.purchaseReason,y);
  y=ensure(y,145);y+=8;y=heading("رابعاً | الملاحظات",y);
  cell(form.notes,x,y,w,60,{align:"right"});y+=68;
  y=ensure(y,145);y=heading("خامساً | التوقيعات والاعتمادات",y);
  const labels=["مقدم الطلب","رئيس القسم / المدير المباشر","المراجعة الفنية (إن لزم)","اعتماد صاحب الصلاحية"];
  const roles=["requester","manager","technical","approver"];
  const q=w/4;
  for(let col=0;col<4;col++){
    const xx=x+w-(col+1)*q, signer=form.signatures[roles[col]];
    cell(labels[col],xx,y,q,37,{bold:true,align:"center"});
    cell(`الاسم: ${signer.name||"........................"}`,xx,y+37,q,27);
    cell(`التوقيع: ${signer.signature||"........................"}`,xx,y+64,q,27);
    cell(`التاريخ: ${displayDate(signer.date)||".... / .... / ........"}`,xx,y+91,q,27);
  }
  doc.end();return await ready;
}
export function prDownloadName(raw,ext){const form=normalizePrForm(raw);return `purchase-requisition-${safe(form.prNumber||"draft")}.${ext}`;}

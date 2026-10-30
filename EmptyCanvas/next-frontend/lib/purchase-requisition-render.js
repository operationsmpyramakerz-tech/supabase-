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
import { hasPrArabic, prTextTokens, prSplitLines, prLineWidth } from "./purchase-requisition-pdf-layout.mjs";

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
  const doc = new PDFDocument({size:"A4", margin:0, compress:true, bufferPages:true});
  enableArabicPdf(doc);
  const chunks = []; doc.on("data", value => chunks.push(value));
  const ready = new Promise((resolve,reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const pageWidth=doc.page.width, pageHeight=doc.page.height;
  const margin=34, left=margin, pageContent=pageWidth-margin*2;
  const palette={ink:"#172638",secondary:"#536477",orange:"#EF6B1B",paleOrange:"#FFF4EB",navy:"#152438",rule:"#D5DEE7",label:"#EAF1F7",stripe:"#F7F9FC",white:"#FFFFFF"};
  const rightEdge=left+pageContent;
  const bottomLimit=pageHeight-55;
  let pageNumber=1;

  const fontFor=(bold=false)=>bold?"Helvetica-Bold":"Helvetica";
  function measureToken(token,size,bold=false) {
    if (token==="☐" || token==="☑") return size+2;
    doc.font(fontFor(bold)).fontSize(size);
    const width=withNativeArabicPdfText(doc,()=>doc.widthOfString(token));
    return Number.isFinite(width)?width:size*String(token).length*.59;
  }
  function paintToken(token,xx,yy,size,bold,color) {
    if (token==="☐" || token==="☑") {
      const len=size*.8;
      doc.save().lineWidth(.75).strokeColor(color).rect(xx,yy+size*.22,len,len).stroke();
      if (token==="☑") doc.moveTo(xx+1.4,yy+size*.57).lineTo(xx+len*.43,yy+size*.84).lineTo(xx+len-1,yy+size*.28).lineWidth(1.25).stroke();
      doc.restore();return;
    }
    doc.font(fontFor(bold)).fontSize(size).fillColor(color);
    withNativeArabicPdfText(doc,()=>doc.text(token,xx,yy,{lineBreak:false}));
  }
  function write(value,x,y,w,h,opts={}) {
    const text=String(value??'').trim(); if (!text) return;
    const size=opts.size??9,bold=Boolean(opts.bold),color=opts.color??palette.ink;
    const padding=opts.padding??7;
    const maxWidth=Math.max(5,w-padding*2), lineHeight=size*(opts.lineSpacing??1.48);
    const rtl=opts.rtl??hasPrArabic(text);
    const gap=size*.38;
    const measure=token=>measureToken(token,size,bold);
    let lines=prSplitLines(text,maxWidth,measure,gap);
    const maxLines=opts.maxLines??Math.max(1,Math.floor((h-6)/lineHeight));
    if (lines.length>maxLines) lines=lines.slice(0,maxLines);
    const textHeight=lines.length*lineHeight;
    const top=y+(opts.valign==="top"?padding:Math.max(1,(h-textHeight)/2));
    lines.forEach((tokens,i)=>{
      const used=prLineWidth(tokens,measure,gap);
      let cursor;
      if(rtl){
        const align=opts.align??"right";
        cursor=align==="center"?x+(w+used)/2:align==="left"?x+padding+used:x+w-padding;
        for(const token of tokens){const tw=measure(token);cursor-=tw;paintToken(token,cursor,top+i*lineHeight,size,bold,color);cursor-=gap;}
      } else {
        const align=opts.align??"left";
        cursor=align==="center"?x+(w-used)/2:align==="right"?x+w-padding-used:x+padding;
        // Latin text uses PDFKit's normal LTR order and keeps nested parentheses.
        for(const token of tokens){paintToken(token,cursor,top+i*lineHeight,size,bold,color);cursor+=measure(token)+gap;}
      }
    });
  }
  const rect=(x,y,w,h,fill=palette.white)=>{
    doc.save().fillColor(fill).rect(x,y,w,h).fill().restore();
    doc.save().lineWidth(.65).strokeColor(palette.rule).rect(x,y,w,h).stroke().restore();
  };
  const cell=(value,x,y,w,h,opts={})=>{
    rect(x,y,w,h,opts.bg??palette.white);
    // PDFKit does not clip text to a table cell by default. This prevents a
    // long user-entered value from overlapping adjacent cells.
    doc.save().rect(x+1,y+1,w-2,h-2).clip();
    write(value,x,y,w,h,opts);
    doc.restore();
  };
  const safeCellText=(value)=>String(value||"").trim()||"—";

  function brand() {
    const top=22;
    try{doc.image(path.join(process.cwd(),"public","images","purchase-requisition-logo.png"),left+3,top+1,{fit:[54,54]});}catch{}
    doc.save().moveTo(left+70,top+2).lineTo(left+70,top+55).lineWidth(2.4).strokeColor(palette.orange).stroke().restore();
    write("PRO Pyramakerz",left+79,top+7,190,24,{size:12,bold:true,rtl:false});
    write("Global HLD",left+79,top+30,180,19,{size:9.5,rtl:false,color:palette.secondary});
    write("PURCHASE REQUISITION",rightEdge-156,top+11,156,20,{size:8,bold:true,rtl:false,align:"right",color:palette.secondary});
    const ruleY=86;
    doc.save().moveTo(left,ruleY).lineTo(rightEdge,ruleY).lineWidth(.8).strokeColor(palette.rule).stroke().restore();
  }
  function footer() {
    const yy=pageHeight-39;
    doc.save().moveTo(left,yy-9).lineTo(rightEdge,yy-9).lineWidth(.8).strokeColor(palette.rule).stroke().restore();
    write("PRO Pyramakerz  •  Purchase Requisition",left,yy,370,20,{size:7.5,rtl:false,color:palette.secondary});
    write(String(pageNumber),rightEdge-35,yy,35,20,{size:8,rtl:false,align:"right",color:palette.secondary});
  }
  const newPage=()=>{footer();doc.addPage();pageNumber++;brand();return 101;};
  const guard=(y,h)=>y+h>bottomLimit?newPage():y;
  function section(value,y) {
    y=guard(y,32);
    doc.save().fillColor(palette.orange).roundedRect(rightEdge-4,y+7,4,17,2).fill().restore();
    write(value,left,y,pageContent-13,32,{size:11.7,bold:true,color:palette.orange,rtl:true,align:"right"});
    return y+31;
  }
  function pairRow(labelRight,valueRight,labelLeft,valueLeft,y,h=39) {
    // Columns are laid out from right to left, with wider, shaded field labels.
    const sizes=[143,126,143,pageContent-143-126-143];
    const values=[labelRight,valueRight,labelLeft,valueLeft];
    let xx=rightEdge;
    for(let j=0;j<4;j++) {
      const width=sizes[j];xx-=width;
      const label=j%2===0;
      cell(safeCellText(values[j]),xx,y,width,h,{
        bg:label?palette.label:palette.white,size:label?8.8:9.1,bold:label,
        rtl:label||hasPrArabic(values[j]),align:label||hasPrArabic(values[j])?"right":"center",
        color:label?palette.navy:palette.ink,padding:6,maxLines:3
      });
    }
    return y+h;
  }
  function sectionTitle() {
    const cy=100;
    const arabic="نموذج طلب شراء",english="Purchase Requisition (PR)";
    // Both segments have explicit coordinates: bidi cannot split the title.
    const groupWidth=365,groupLeft=(pageWidth-groupWidth)/2;
    write(english,groupLeft,cy,182,33,{size:13,bold:true,rtl:false,align:"right"});
    doc.save().moveTo(groupLeft+190,cy+8).lineTo(groupLeft+190,cy+28).lineWidth(2).strokeColor(palette.orange).stroke().restore();
    write(arabic,groupLeft+200,cy,165,33,{size:14.5,bold:true,rtl:true,align:"left"});
  }
  brand();sectionTitle();
  let y=136;
  y=section("أولاً | بيانات طلب الشراء",y);
  y=pairRow("رقم طلب الشراء (PR No.)",form.prNumber,"تاريخ الطلب",displayDate(form.requestDate),y);
  y=pairRow("الإدارة / القسم الطالب",form.department,"مركز التكلفة / المشروع",form.costCenter,y);
  y=pairRow("اسم مقدم الطلب / الوظيفة",form.requester,"رقم أمر الشغل (إن وجد)",form.workOrder,y);
  y=pairRow("نوع الطلب",check(form.requestType,["مخزني","خدمة","أصل ثابت"]),"درجة الأولوية",check(form.priority,["عادي","عاجل","طارئ"]),y,42);

  y+=8;y=section("ثانياً | الأصناف / الخدمات المطلوبة",y);
  write("يُكتب لكل صنف وصف فني واضح؛ ويمكن إرفاق كشف تكميلي مع الإشارة إلى رقم الطلب نفسه.",left,y,pageContent,24,{size:8.5,color:palette.secondary,align:"right",rtl:true});
  y+=23;
  // All widths add exactly to the A4 content width. The description owns a
  // third of the table instead of being squeezed by narrow auxiliary fields.
  const columnWidths=[25,51,172,39,36,73,61,pageContent-(25+51+172+39+36+73+61)];
  const titles=["م","كود الصنف","اسم الصنف / الخدمة والمواصفات الفنية","الوحدة","الكمية","العلامة / الموديل / المقاس","الضمان المطلوب","الصلاحية / تاريخ الانتهاء"];
  function itemHeight(item) {
    const fields=[
      [item.code||"",columnWidths[1],8.15],
      [item.description||"",columnWidths[2],8.5],
      [item.unit||"",columnWidths[3],8.15],
      [item.model||"",columnWidths[5],8.15],
      [item.warranty||"",columnWidths[6],8.15],
      [item.expiry||"",columnWidths[7],8.15],
    ];
    return Math.max(35,...fields.map(([value,width,size]) => {
      const measure=token=>measureToken(token,size);
      const lines=prSplitLines(value,Math.max(8,width-10),measure,size*.38).length;
      return Math.ceil(lines*size*1.48+10);
    }));
  }
  function itemRow(values,y,h,header=false,index=0) {
    let xx=rightEdge;
    for(let c=0;c<columnWidths.length;c++){
      const ww=columnWidths[c];xx-=ww;
      const bg=header?palette.label:c===0?palette.label:index%2?palette.stripe:palette.white;
      cell(values[c]??"",xx,y,ww,h,{
        bg,size:header?7.75:(c===2?8.5:8.15),bold:header||c===0,
        rtl:hasPrArabic(values[c]),align:c===2?"right":"center",
        color:header?palette.navy:palette.ink,padding:header?3:5,maxLines:header?3:Math.floor((h-6)/(8.5*1.48)),
      });
    }
    return y+h;
  }
  const tableHead=()=>{y=itemRow(titles,y,41,true);};
  tableHead();
  for(let index=0;index<Math.max(4,form.items.length);index++){
    const item=form.items[index]||{};
    const description=String(item.description||"");
    const height=itemHeight(item);
    if(y+height>bottomLimit){y=newPage();write("الأصناف / الخدمات المطلوبة — تابع",left,y,pageContent,27,{size:10.5,bold:true,color:palette.orange,rtl:true,align:"right"});y+=31;tableHead();}
    y=itemRow([String(index+1),item.code,description,item.unit,item.quantity,item.model,item.warranty,item.expiry],y,height,false,index);
  }

  const deliveryHeight=36+3*39+45;
  y=guard(y,deliveryHeight+12);y+=12;
  y=section("ثالثاً | المتطلبات الفنية والتسليم",y);
  y=pairRow("تاريخ التوريد المطلوب",displayDate(form.requiredDate),"مكان التسليم",form.deliveryPlace,y);
  y=pairRow("الحد الأدنى للصلاحية عند التوريد",form.minShelfLife,"متطلبات الفحص / الاختبار",form.inspection,y);
  y=pairRow("المرفقات",check(form.attachments,["كتالوج","صورة","مواصفة","أخرى"]),"بديل معادل مسموح؟",check(form.alternative,["نعم","لا","بموافقة فنية"]),y);
  y=pairRow("هل الصنف متاح بالمخزن؟",check(form.stockAvailable,["نعم","لا"]),"مبرر الشراء / الاستخدام",form.purchaseReason,y,45);
  y=guard(y,115);y+=10;y=section("رابعاً | الملاحظات",y);
  // Notes can be 1,800 characters. Never silently truncate them: split into
  // individually page-aware blocks, retaining all user-entered text.
  const noteSize=9.2, noteStep=noteSize*1.48;
  const noteMeasure=token=>measureToken(token,noteSize);
  const noteLines=form.notes ? prSplitLines(form.notes,pageContent-24,noteMeasure,noteSize*.38) : [];
  if (!noteLines.length) {cell("",left,y,pageContent,56);y+=64;}
  else {
    let current=0;
    while(current<noteLines.length){
      const capacity=Math.max(1,Math.floor((bottomLimit-y-23)/noteStep));
      const segment=noteLines.slice(current,current+capacity);
      const height=Math.max(54,Math.ceil(segment.length*noteStep+20));
      cell(segment.map(tokens=>tokens.join(" ")).join("\n"),left,y,pageContent,height,{size:noteSize,rtl:true,align:"right",maxLines:segment.length,valign:"top",padding:11});
      current+=segment.length;y+=height+8;
      if(current<noteLines.length){y=newPage();y=section("رابعاً | الملاحظات — تابع",y);}
    }
  }

  y=guard(y,205);y+=7;y=section("خامساً | التوقيعات والاعتمادات",y);
  const roles=["requester","manager","technical","approver"];
  const roleLabels=["مقدم الطلب","رئيس القسم / المدير المباشر","المراجعة الفنية (إن لزم)","اعتماد صاحب الصلاحية"];
  const width=pageContent/4;
  for(let i=0;i<roles.length;i++){
    const xx=rightEdge-(i+1)*width;
    const signer=form.signatures[roles[i]]||{};
    cell(roleLabels[i],xx,y,width,49,{bg:palette.label,bold:true,size:9.1,rtl:true,align:"center",maxLines:2});
    for(const [j,label,value] of [[0,"الاسم",signer.name],[1,"التوقيع",signer.signature],[2,"التاريخ",displayDate(signer.date)]]){
      const rowY=y+49+j*35;
      rect(xx,rowY,width,35,palette.white);
      write(label+":",xx+width-49,rowY,45,35,{size:8.2,bold:true,rtl:true,align:"right",padding:3});
      if (value) write(value,xx+7,rowY,width-58,35,{size:8.4,rtl:hasPrArabic(value),align:"center",padding:2,maxLines:2});
      else doc.save().moveTo(xx+12,rowY+24).lineTo(xx+width-59,rowY+24).lineWidth(.6).strokeColor("#9EAAB8").dash(1.2,2.8).stroke().undash().restore();
    }
  }
  footer();
  doc.end();return await ready;
}
export function prDownloadName(raw,ext){const form=normalizePrForm(raw);return `purchase-requisition-${safe(form.prNumber||"draft")}.${ext}`;}

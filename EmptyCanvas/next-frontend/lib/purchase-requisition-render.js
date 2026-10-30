import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import pdfArabicSupport from "./pdfArabicSupport";
import { normalizePrForm, PR_SIGNERS, safePrProductUrl } from "./purchase-requisition-data.mjs";
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
  const relPath="word/_rels/document.xml.rels";
  let rels = await zip.file(relPath).async("string");
  const links = new Map();
  const hyperlinkIds = new Map();
  const rows = (form.items.length ? form.items : [{}]).map((item,i) => {
    const props = { SEQ:String(i+1),CODE:item.code||"",DESCRIPTION:item.description||"",UNIT:item.unit||"",QTY:item.quantity||"",MODEL:item.model||"",WARRANTY:item.warranty||"",EXPIRY:item.expiry||"" };
    let row=prototype.replace(/__ITEM_([A-Z]+)__/g,(_match,key)=>encodeXml(props[key] || ""));
    const link = safePrProductUrl(item.url);
    if (link && props.DESCRIPTION) {
      if (!hyperlinkIds.has(link)) {
        const id = `rIdPrProduct${hyperlinkIds.size+1}`;
        hyperlinkIds.set(link,id);
        links.set(id,link);
      }
      const id=hyperlinkIds.get(link);
      // Keep the original template run styling, but make ONLY the component
      // description a real clickable Word hyperlink (not a displayed URL).
      const desc=encodeXml(props.DESCRIPTION);
      const escaped=desc.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const runPattern=new RegExp(`<w:r>(<w:rPr>(?:(?!<\\/w:rPr>)[\\s\\S])*?<\\/w:rPr>)<w:t>${escaped}<\\/w:t><\\/w:r>`);
      row=row.replace(runPattern, (_match,rPr)=>`<w:hyperlink r:id="${id}" w:history="1"><w:r>${rPr.replace("</w:rPr>",'<w:color w:val="1570B8"/><w:u w:val="single"/></w:rPr>')}<w:t>${desc}</w:t></w:r></w:hyperlink>`);
    }
    return row;
  }).join("");
  if (links.size) {
    rels=rels.replace("</Relationships>", [...links].map(([id,url])=>`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${encodeXml(url)}" TargetMode="External"/>`).join("")+"</Relationships>");
    zip.file(relPath,rels);
  }
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
  // Slightly smaller typography across the native PDF without changing table geometry.
  const PDF_FONT_SCALE=0.94;
  let pageNumber=1;

  const fontFor=(bold=false)=>bold?"Helvetica-Bold":"Helvetica";
  function measureToken(token,size,bold=false) {
    if (token==="☐" || token==="☑") return size+2;
    doc.font(fontFor(bold)).fontSize(size);
    const width=withNativeArabicPdfText(doc,()=>doc.widthOfString(token));
    return Number.isFinite(width)?width:size*String(token).length*.59;
  }
  function paintToken(token,xx,yy,size,bold,color,opts={}) {
    if (token==="☐" || token==="☑") {
      const len=size*.8;
      doc.save().lineWidth(.75).strokeColor(color).rect(xx,yy+size*.22,len,len).stroke();
      if (token==="☑") doc.moveTo(xx+1.4,yy+size*.57).lineTo(xx+len*.43,yy+size*.84).lineTo(xx+len-1,yy+size*.28).lineWidth(1.25).stroke();
      doc.restore();return;
    }
    // Place standalone | and / a little lower so they sit on the same optical
    // centerline as Arabic text. Other glyphs retain their existing baseline.
    const isolatedPunctuation=/^[\/|()]$/.test(token);
    const lowerAsciiDigits=Boolean(opts.lowerAsciiDigitsInArabic) && /\d/.test(token) && !/[\u0600-\u06FF]/.test(token);
    doc.font(fontFor(bold)).fontSize(size).fillColor(color);
    if (isolatedPunctuation || lowerAsciiDigits) {
      const printed=token==="("?")":token===")"?"(":token;
      // Pipe separators in section headings and slashes in RTL labels need a
      // little more descent than parentheses to align with adjacent Arabic.
      // In Arabic notes, standalone Latin digits also sit optically high, so
      // they receive a slightly stronger baseline drop.
      const baselineDrop=lowerAsciiDigits ? (opts.digitBaselineDrop ?? size*.32) : (token==="|"?size*.36:token==="/"?size*.33:size*.14);
      withNativeArabicPdfText(doc,()=>doc.text(printed,xx,yy+baselineDrop,{lineBreak:false}));
    } else withNativeArabicPdfText(doc,()=>doc.text(token,xx,yy,{lineBreak:false}));
  }
  function write(value,x,y,w,h,opts={}) {
    const text=String(value??'').trim(); if (!text) return;
    const size=(opts.size??9)*PDF_FONT_SCALE,bold=Boolean(opts.bold),color=opts.color??palette.ink;
    const padding=opts.padding??7;
    const maxWidth=Math.max(5,w-padding*2), lineHeight=size*(opts.lineSpacing??1.48);
    const rtl=opts.rtl??hasPrArabic(text);
    const gap=size*.28;
    const measure=token=>measureToken(token,size,bold);
    let lines=prSplitLines(text,maxWidth,measure,gap);
    const maxLines=opts.maxLines??Math.max(1,Math.floor((h-6)/lineHeight));
    if (lines.length>maxLines) lines=lines.slice(0,maxLines);
    const textHeight=lines.length*lineHeight;
    // Arabic glyph ascenders differ from Helvetica; keep all tokens optically centered.
    const top=y+(opts.valign==="top"?padding:Math.max(1,(h-textHeight)/2))-(rtl?0.9:0);
    lines.forEach((tokens,i)=>{
      const used=prLineWidth(tokens,measure,gap);
      let cursor;
      if(rtl){
        const align=opts.align??"right";
        cursor=align==="center"?x+(w+used)/2:align==="left"?x+padding+used:x+w-padding;
        for(const token of tokens){const tw=measure(token);cursor-=tw;paintToken(token,cursor,top+i*lineHeight,size,bold,color,opts);cursor-=gap;}
      } else {
        const align=opts.align??"left";
        cursor=align==="center"?x+(w-used)/2:align==="right"?x+w-padding-used:x+padding;
        // Latin text uses PDFKit's normal LTR order and keeps nested parentheses.
        for(const token of tokens){paintToken(token,cursor,top+i*lineHeight,size,bold,color,opts);cursor+=measure(token)+gap;}
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
    // Arabic tanween combining marks can float away from short section labels
    // in PDFKit; render these headings without diacritics.
    value=String(value).replace(/[\u064B-\u065F]/g, "");
    y=guard(y,29);
    doc.save().fillColor(palette.orange).roundedRect(rightEdge-4,y+6,4,15,2).fill().restore();
    write(value,left,y-1,pageContent-13,29,{size:11.4,bold:true,color:palette.orange,rtl:true,align:"right"});
    return y+27;
  }
  function centeredDate(value,x,y,w,h) {
    // Draw dates as one LTR run. Token-by-token spacing made the slash-delimited
    // dates appear off-center inside otherwise symmetrical value cells.
    const date=String(value).trim().replace(/\s*\/\s*/g," / ");
    const fontSize=8.9*PDF_FONT_SCALE;
    doc.font("Helvetica").fontSize(fontSize).fillColor(palette.ink);
    const dateWidth=doc.widthOfString(date);
    const dateX=x+(w-dateWidth)/2;
    const dateY=y+(h-fontSize*1.18)/2;
    doc.save().rect(x+1,y+1,w-2,h-2).clip();
    doc.text(date,dateX,dateY,{lineBreak:false});
    doc.restore();
  }
  function prNumberLabel(x,y,w,h) {
    // Form a compact, centered bilingual label as one optical group. Measure
    // both scripts independently so their separation is consistent on PDFKit.
    rect(x,y,w,h,palette.label);
    const arabic="رقم طلب الشراء", english="PR No.";
    const arabicSize=8.5*PDF_FONT_SCALE, englishSize=8.5*PDF_FONT_SCALE;
    const arabicWidth=prLineWidth(prTextTokens(arabic),token=>measureToken(token,arabicSize,true),arabicSize*.28)+3;
    const englishWidth=measureToken(english,englishSize,true)+3;
    const dashWidth=7,gap=4;
    const groupWidth=englishWidth+gap+dashWidth+gap+arabicWidth;
    const groupLeft=x+(w-groupWidth)/2;
    // The Latin glyphs render optically higher than the adjacent Arabic.
    // Lower PR No. alone by 2.5pt; preserve the group width and all other baselines.
    write(english,groupLeft,y+2.5,englishWidth,h,{size:8.5,bold:true,rtl:false,align:"center",padding:0});
    write("-",groupLeft+englishWidth+gap,y,dashWidth,h,{size:8.5,bold:true,rtl:false,align:"center",padding:0});
    write(arabic,groupLeft+englishWidth+gap+dashWidth+gap,y,arabicWidth,h,{size:8.5,bold:true,rtl:true,align:"center",padding:0});
  }
  function pairRow(labelRight,valueRight,labelLeft,valueLeft,y,h=32) {
    // Columns are laid out from right to left, with wider, shaded field labels.
    const sizes=[143,126,143,pageContent-143-126-143];
    const values=[labelRight,valueRight,labelLeft,valueLeft];
    let xx=rightEdge;
    for(let j=0;j<4;j++) {
      const width=sizes[j];xx-=width;
      const label=j%2===0;
      if(label && values[j]==="رقم طلب الشراء - PR No.") {
        prNumberLabel(xx,y,width,h);
      } else if(!label && /^\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}$/.test(String(values[j]??""))) {
        rect(xx,y,width,h,palette.white);
        centeredDate(values[j],xx,y,width,h);
      } else {
        // The PR No. field is intentionally empty until the user assigns one.
        // Keep its PDF value cell blank rather than inserting an em dash.
        cell(j===1 && labelRight==="رقم طلب الشراء - PR No." ? String(values[j]??"") : safeCellText(values[j]),xx,y,width,h,{
          bg:label?palette.label:palette.white,size:label?8.5:8.9,bold:label,
          rtl:label||hasPrArabic(values[j]),align:label||hasPrArabic(values[j])?"right":"center",
          color:label?palette.navy:palette.ink,padding:6,maxLines:3
        });
      }
    }
    return y+h;
  }
  function sectionTitle() {
    const cy=100;
    const arabic="نموذج طلب شراء",english="Purchase Requisition (PR)";
    // Both segments have explicit coordinates: bidi cannot split the title.
    const groupWidth=365,groupLeft=(pageWidth-groupWidth)/2;
    write(english,groupLeft,cy,182,33,{size:13,bold:true,rtl:false,align:"right"});
    // Center the vertical orange divider against both title text baselines.
    doc.save().moveTo(groupLeft+190,cy+1).lineTo(groupLeft+190,cy+21).lineWidth(2).strokeColor(palette.orange).stroke().restore();
    // Arabic glyph metrics sit visibly lower than Latin at identical y; lift by 7 pt.
    write(arabic,groupLeft+200,cy-7,165,33,{size:14.5,bold:true,rtl:true,align:"left"});
  }
  brand();sectionTitle();
  let y=136;
  y=section("أولاً | بيانات طلب الشراء",y);
  y=pairRow("رقم طلب الشراء - PR No.",form.prNumber,"تاريخ الطلب",displayDate(form.requestDate),y);
  y=pairRow("الإدارة / القسم الطالب",form.department,"مركز التكلفة / المشروع",form.costCenter,y);
  y=pairRow("اسم مقدم الطلب / الوظيفة",form.requester,"رقم أمر الشغل (إن وجد)",form.workOrder,y);
  y=pairRow("نوع الطلب",check(form.requestType,["مخزني","خدمة","أصل ثابت"]),"درجة الأولوية",check(form.priority,["عادي","عاجل","طارئ"]),y,36);

  y+=6;y=section("ثانياً | الأصناف / الخدمات المطلوبة",y);
  write("يُكتب لكل صنف وصف فني واضح؛ ويمكن إرفاق كشف تكميلي مع الإشارة إلى رقم الطلب نفسه.",left,y,pageContent,24,{size:8.5,color:palette.secondary,align:"right",rtl:true});
  y+=21;
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
    return Math.max(29,...fields.map(([value,width,size]) => {
      const measure=token=>measureToken(token,size);
      const lines=prSplitLines(value,Math.max(8,width-10),measure,size*.38).length;
      return Math.ceil(lines*size*1.35+7);
    }));
  }
  function itemRow(values,y,h,header=false,index=0,productUrl="") {
    let xx=rightEdge;
    for(let c=0;c<columnWidths.length;c++){
      const ww=columnWidths[c];xx-=ww;
      const bg=header?palette.label:c===0?palette.label:index%2?palette.stripe:palette.white;
      cell(values[c]??"",xx,y,ww,h,{
        bg,size:header?7.75:(c===2?8.5:8.15),bold:header||c===0,
        rtl:hasPrArabic(values[c]),align:c===2?"right":"center",
        color:header?palette.navy:(c===2&&productUrl?"#1568A8":palette.ink),padding:header?3:4,maxLines:header?3:Math.max(1,Math.floor((h-5)/(8.5*1.38))),
      });
      if (!header && c===2 && safePrProductUrl(productUrl)) {
        doc.link(xx+2,y+2,ww-4,h-4,safePrProductUrl(productUrl));
      }
    }
    return y+h;
  }
  const tableHead=()=>{y=itemRow(titles,y,35,true);};
  tableHead();
  for(let index=0;index<Math.max(4,form.items.length);index++){
    const item=form.items[index]||{};
    const description=String(item.description||"");
    const height=itemHeight(item);
    if(y+height>bottomLimit){y=newPage();write("الأصناف / الخدمات المطلوبة — تابع",left,y,pageContent,27,{size:10.5,bold:true,color:palette.orange,rtl:true,align:"right"});y+=31;tableHead();}
    y=itemRow([String(index+1),item.code,description,item.unit,item.quantity,item.model,item.warranty,item.expiry],y,height,false,index,item.url);
  }

  const deliveryHeight=28+3*32+39;
  y=guard(y,deliveryHeight+12);y+=12;
  y=section("ثالثاً | المتطلبات الفنية والتسليم",y);
  y=pairRow("تاريخ التوريد المطلوب",displayDate(form.requiredDate),"مكان التسليم",form.deliveryPlace,y);
  y=pairRow("الحد الأدنى للصلاحية عند التوريد",form.minShelfLife,"متطلبات الفحص / الاختبار",form.inspection,y);
  y=pairRow("المرفقات",check(form.attachments,["كتالوج","صورة","مواصفة","أخرى"]),"بديل معادل مسموح؟",check(form.alternative,["نعم","لا","بموافقة فنية"]),y);
  y=pairRow("هل الصنف متاح بالمخزن؟",check(form.stockAvailable,["نعم","لا"]),"مبرر الشراء / الاستخدام",form.purchaseReason,y,39);
  y=guard(y,115);y+=10;y=section("رابعاً | الملاحظات",y);
  // Notes can be 1,800 characters. Never silently truncate them: split into
  // individually page-aware blocks, retaining all user-entered text.
  const noteSize=9.2, noteStep=noteSize*1.48;
  const noteMeasure=token=>measureToken(token,noteSize);
  const noteLines=form.notes ? prSplitLines(form.notes,pageContent-24,noteMeasure,noteSize*.38) : [];
  // Blank notes need a compact writing area; the old 46pt placeholder left
  // unnecessary white space before signatures on the following page.
  if (!noteLines.length) {cell("",left,y,pageContent,25);y+=33;}
  else {
    let current=0;
    while(current<noteLines.length){
      const capacity=Math.max(1,Math.floor((bottomLimit-y-23)/noteStep));
      const segment=noteLines.slice(current,current+capacity);
      const height=Math.max(54,Math.ceil(segment.length*noteStep+20));
      cell(segment.map(tokens=>tokens.join(" ")).join("\n"),left,y,pageContent,height,{size:noteSize,rtl:true,align:"right",maxLines:segment.length,valign:"top",padding:11,lowerAsciiDigitsInArabic:true,digitBaselineDrop:3.5});
      current+=segment.length;y+=height+8;
      if(current<noteLines.length){y=newPage();y=section("رابعاً | الملاحظات — تابع",y);}
    }
  }

  // Actual section+signature height is 27+40+3*30. Reserve precisely that,
  // rather than forcing an early page break with a padded 175pt estimate.
  y=guard(y,162);y+=5;y=section("خامساً | التوقيعات والاعتمادات",y);
  const roles=["requester","manager","technical","approver"];
  const roleLabels=["مقدم الطلب","رئيس القسم / المدير المباشر","المراجعة الفنية (إن لزم)","اعتماد صاحب الصلاحية"];
  const width=pageContent/4;
  for(let i=0;i<roles.length;i++){
    const xx=rightEdge-(i+1)*width;
    const signer=form.signatures[roles[i]]||{};
    cell(roleLabels[i],xx,y,width,40,{bg:palette.label,bold:true,size:8.9,rtl:true,align:"center",maxLines:2});
    for(const [j,label,value] of [[0,"الاسم",signer.name],[1,"التوقيع",signer.signature],[2,"التاريخ",displayDate(signer.date)]]){
      const rowY=y+40+j*30;
      rect(xx,rowY,width,30,palette.white);
      // A dedicated right-aligned label region and centered value region keep
      // both Arabic and Latin signer names away from the column divider.
      // Shift the label and its writing/value zone right by about 6-8pt,
      // while retaining an internal gap to prevent Latin/Arabic collisions.
      const labelWidth=39,valueLeft=xx+13,valueWidth=width-labelWidth-18;
      write(label+":",xx+width-labelWidth-2,rowY,labelWidth,30,{size:8.2,bold:true,rtl:true,align:"right",padding:2});
      if (value) {
        doc.save().rect(valueLeft,rowY+1,valueWidth,28).clip();
        write(value,valueLeft,rowY,valueWidth,30,{size:8.2,rtl:hasPrArabic(value),align:"center",padding:1,maxLines:2,lineSpacing:1.35});
        doc.restore();
      } else doc.save().moveTo(valueLeft+4,rowY+21).lineTo(valueLeft+valueWidth-4,rowY+21).lineWidth(.6).strokeColor("#9EAAB8").dash(1.2,2.8).stroke().undash().restore();
    }
  }
  footer();
  doc.end();return await ready;
}
export function prDownloadName(raw,ext){const form=normalizePrForm(raw);return `purchase-requisition-${safe(form.prNumber||form.workOrder||"draft")}.${ext}`;}

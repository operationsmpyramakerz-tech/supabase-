"use client";
import {useRef,useState} from "react";
import Link from "next/link";
import "./purchase-requisition.css";

const signatures=[['requester','مقدم الطلب'],['manager','رئيس القسم / المدير المباشر'],['technical','المراجعة الفنية (إن لزم)'],['approver','اعتماد صاحب الصلاحية']];
const itemFields=[['code','كود الصنف'],['description','اسم الصنف / الخدمة والمواصفات الفنية'],['unit','الوحدة'],['quantity','الكمية'],['model','العلامة / الموديل / المقاس'],['warranty','الضمان المطلوب'],['expiry','الصلاحية / تاريخ الانتهاء']];
function Field({label,value,onChange,type="text",placeholder="",span=false}){return <label className={`pr-field ${span?'pr-field--wide':''}`}><span>{label}</span><input type={type} value={value||""} placeholder={placeholder} onChange={e=>onChange(e.target.value)} dir={/^[\u0600-\u06ff]/.test(String(value||""))?'rtl':'auto'}/></label>}
function Choice({label,value,onChange,values}){return <div className="pr-field"><span>{label}</span><div className="pr-choice">{values.map(v=><label key={v} className={value===v?'is-selected':''}><input type="radio" checked={value===v} onChange={()=>onChange(v)}/>{v}</label>)}</div></div>}
function MultiChoice({label,value,onChange,values}){const selected=String(value||" ").split(/[,،;]/).map(v=>v.trim()).filter(Boolean);return <div className="pr-field"><span>{label}</span><div className="pr-choice">{values.map(v=><label key={v} className={selected.includes(v)?"is-selected":""}><input type="checkbox" checked={selected.includes(v)} onChange={()=>onChange(selected.includes(v)?selected.filter(a=>a!==v).join(","):selected.concat(v).join(","))}/>{v}</label>)}</div></div>}
export default function PurchaseRequisitionClient({initialForm,orderIds,initialSavedAt=null,initialLoadError=""}){
 const [form,setFormState]=useState(initialForm);const [busy,setBusy]=useState("");const [error,setError]=useState("");
 const [savedAt,setSavedAt]=useState(initialSavedAt);const [dirty,setDirty]=useState(false);
 const revision=useRef(0);
 const setForm=updater=>{revision.current+=1;setDirty(true);setFormState(updater)};
 const set=(key,value)=>setForm(old=>({...old,[key]:value}));
 const item=(i,key,value)=>setForm(old=>({...old,items:old.items.map((r,j)=>j===i?{...r,[key]:value}:r)}));
 const sign=(r,key,value)=>setForm(old=>({...old,signatures:{...old.signatures,[r]:{...old.signatures[r],[key]:value}}}));
 const saveForm=async()=>{
  if(busy)return;
  const revisionAtSave=revision.current;
  setBusy("save");setError("");
  try{
   const response=await fetch("/next/api/orders/purchase-requisition/save",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderIds,form})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw new Error(data.error||"Failed to save Purchase Requisition");
   setSavedAt(data.updatedAt||new Date().toISOString());
   if(revision.current===revisionAtSave)setDirty(false);
  }catch(e){setError(e.message||"Save failed")}
  finally{setBusy("")}
 };
 const exportFile=async kind=>{
  if(busy)return;setBusy(kind);setError("");
  try{
   const response=await fetch("/next/api/orders/purchase-requisition",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderIds,kind,form})});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"Failed to create file")}
   const file=await response.blob();const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;
   a.download=`purchase-requisition-${(form.prNumber||form.workOrder||"draft").replace(/[^a-zA-Z0-9_-]/g,'-')}.${kind==='word'?'docx':'pdf'}`;
   document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),120_000);
  }catch(e){setError(e.message||"Download failed")}
  finally{setBusy("")}
 };
 return <div className="pr-workspace" dir="rtl">
  <div className="pr-top" dir="ltr"><Link href="/operations-orders" className="pr-back">← Back to orders</Link><div><strong>Purchase Requisition</strong><small>Fill in the form, then export as PDF or editable Word</small></div></div>
  <div className="pr-paper">
   <header className="pr-paper-head"><img src="/next/images/purchase-requisition-logo.png" alt="PRO Pyramakerz"/><div>PRO Pyramakerz<br/>Global HLD</div></header>
   <h2>نموذج طلب شراء <span>| Purchase Requisition (PR)</span></h2>
   <section><h3>أولاً | بيانات طلب الشراء</h3><div className="pr-fields">
    <Field label="رقم طلب الشراء - PR No." value={form.prNumber} onChange={v=>set('prNumber',v)}/>
    <Field label="تاريخ الطلب" type="date" value={form.requestDate} onChange={v=>set('requestDate',v)}/>
    <Field label="الإدارة / القسم الطالب" value={form.department} onChange={v=>set('department',v)}/>
    <Field label="مركز التكلفة / المشروع" value={form.costCenter} onChange={v=>set('costCenter',v)}/>
    <Field label="اسم مقدم الطلب / الوظيفة" value={form.requester} onChange={v=>set('requester',v)}/>
    <Field label="رقم أمر الشغل (إن وجد)" value={form.workOrder} onChange={v=>set('workOrder',v)}/>
    <Choice label="نوع الطلب" value={form.requestType} onChange={v=>set('requestType',v)} values={["مخزني","خدمة","أصل ثابت"]}/>
    <Choice label="درجة الأولوية" value={form.priority} onChange={v=>set('priority',v)} values={["عادي","عاجل","طارئ"]}/>
   </div></section>
   <section><div className="pr-items-head"><div><h3>ثانياً | الأصناف / الخدمات المطلوبة</h3><p>يُكتب لكل صنف وصف فني واضح؛ ويمكن إرفاق كشف تكميلي مع الإشارة إلى رقم الطلب نفسه.</p></div><button type="button" onClick={()=>setForm(old=>({...old,items:[...old.items,{code:'',description:'',unit:'قطعة',quantity:'',model:'',warranty:'',expiry:'',url:''}]}))}>+ إضافة صنف</button></div>
    <div className="pr-table-scroll"><table className="pr-items"><thead><tr><th>م</th>{itemFields.map(([k,l])=><th key={k}>{l}</th>)}<th></th></tr></thead><tbody>{form.items.map((r,i)=><tr key={i}><td>{i+1}</td>{itemFields.map(([k])=><td key={k}><input aria-label={`${itemFields.find(([key])=>key===k)?.[1]} ${i+1}`} value={r[k]??''} onChange={e=>item(i,k,e.target.value)}/>{k==='description'&&/^https?:\/\//i.test(r.url||'')&&<a className="pr-product-link" href={r.url} target="_blank" rel="noopener noreferrer" title="Open product link">↗ Open product</a>}</td>)}<td><button type="button" className="pr-remove" onClick={()=>setForm(old=>({...old,items:old.items.filter((_,j)=>j!==i)}))} aria-label={`Remove item ${i+1}`}>×</button></td></tr>)}</tbody></table></div>
   </section>
   <section><h3>ثالثاً | المتطلبات الفنية والتسليم</h3><div className="pr-fields">
    <Field label="تاريخ التوريد المطلوب" type="date" value={form.requiredDate} onChange={v=>set('requiredDate',v)}/>
    <Field label="مكان التسليم" value={form.deliveryPlace} onChange={v=>set('deliveryPlace',v)}/>
    <Field label="الحد الأدنى للصلاحية عند التوريد" value={form.minShelfLife} onChange={v=>set('minShelfLife',v)}/>
    <Field label="متطلبات الفحص / الاختبار" value={form.inspection} onChange={v=>set('inspection',v)}/>
    <MultiChoice label="المرفقات" value={form.attachments} onChange={v=>set('attachments',v)} values={["كتالوج","صورة","مواصفة","أخرى"]}/>
    <Choice label="بديل معادل مسموح؟" value={form.alternative} onChange={v=>set('alternative',v)} values={["نعم","لا","بموافقة فنية"]}/>
    <Choice label="هل الصنف متاح بالمخزن؟" value={form.stockAvailable} onChange={v=>set('stockAvailable',v)} values={["نعم","لا"]}/>
    <Field label="مبرر الشراء / الاستخدام" value={form.purchaseReason} onChange={v=>set('purchaseReason',v)}/>
   </div></section>
   <section><h3>رابعاً | الملاحظات</h3><textarea className="pr-notes" rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="أضف أي ملاحظات إضافية..."/></section>
   <section><h3>خامساً | التوقيعات والاعتمادات</h3><div className="pr-signatures">{signatures.map(([role,label])=><div key={role} className="pr-signer"><h4>{label}</h4>{[['name','الاسم'],['signature','التوقيع'],['date','التاريخ']].map(([key,label])=><Field key={key} label={label} value={form.signatures[role][key]} onChange={v=>sign(role,key,v)} type={key==='date'?'date':'text'}/>)}</div>)}</div></section>
  </div>
  {initialLoadError&&<div role="alert" className="pr-alert">{initialLoadError}</div>}
  <div className={`pr-save-status ${dirty?'is-unsaved':'is-saved'}`} role="status" dir="ltr">{dirty ? "Unsaved changes" : savedAt ? `Saved · ${new Date(savedAt).toLocaleString("en-GB",{timeZone:"Africa/Cairo"})}` : "Not saved yet"}</div>
  {error&&<div role="alert" className="pr-alert">{error}</div>}
  <div className="pr-bottom" dir="ltr"><span>{form.items.length} items · {orderIds.length} order rows</span><button type="button" className="pr-save" disabled={!!busy} onClick={saveForm}>{busy==="save"?"Saving…":"Save"}</button><button type="button" disabled={!!busy} onClick={()=>exportFile('pdf')}>{busy==='pdf'?'Preparing…':'Download PDF'}</button><button type="button" disabled={!!busy} onClick={()=>exportFile('word')}>{busy==='word'?'Preparing…':'Download Word'}</button></div>
 </div>
}

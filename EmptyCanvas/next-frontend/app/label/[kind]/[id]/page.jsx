import {configuredLabelSecret,verifyLabelToken,labelIdentity} from '../../../../lib/preparing-label-token.mjs';
import {readPublicLabel} from '../../../../lib/preparing-label-content';
import './label.css';

export const dynamic='force-dynamic';
export const revalidate=0;
export const metadata={title:'Label Contents | Pyramakerz',robots:{index:false,follow:false}};
function QuantityTable({items}){
 return items.length?<div className="scn-table"><div className="scn-table-head"><span>Component</span><span>Packed Qty</span></div>
  {items.map((item,index)=><div className="scn-table-row" key={`${item.name}-${index}`}><span>{item.name}</span><strong>{item.quantity}</strong></div>)}
 </div>:<p className="scn-blank">No physical components have been recorded as packed yet.</p>;
}
export default async function LabelScanPage({params,searchParams}){
 const route=await params;const query=await searchParams;
 const kind=route?.kind,id=route?.id,token=query?.token;
 let label=null;
 if(labelIdentity(kind,id)&&typeof token==='string'){
  try{
   if(verifyLabelToken(kind,id,token,configuredLabelSecret()))label=await readPublicLabel(kind,id);
  }catch(e){console.error('[public-label-scan]',e?.status||'unavailable');}
 }
 return <main className="scn-page"><meta name="referrer" content="no-referrer"/><div className="scn-wrap">
  <div className="scn-brand"><span className="scn-logo">◇</span><div><strong>PYRAMAKERZ</strong><small>Physical packing verification</small></div></div>
  {!label?<section className="scn-card scn-invalid"><div className="scn-no">!</div><h1>Label unavailable</h1><p>This label link is invalid, unavailable, or its verification key has changed. Contact the issuing team for a fresh label.</p></section>:<>
   <header className="scn-hero"><span className="scn-tag">{label.kind==='kit'?'KIT LABEL':'CARTON LABEL'}</span><h1>{label.label}</h1><p>{label.schoolName}</p><span className={`scn-status ${label.status==='Packed'?'scn-ready':''}`}>{label.status}</span></header>
   {label.kind==='kit'?<section className="scn-card"><div className="scn-card-title"><div><small>Kit Group</small><h2>{label.kitGroup}</h2></div><span className="scn-counter">{label.components.length} component types</span></div>
    {label.status!=='Packed'&&<p className="scn-alert">Packing is still in progress. The quantities below show only recorded physical contents and are not final.</p>}
    <QuantityTable items={label.components}/></section>:
   <section className="scn-card"><div className="scn-card-title"><div><small>Verified Contents</small><h2>{label.kitCount} packed Kits</h2></div><span className="scn-counter">Locked carton</span></div>
    {label.kits.map(kit=><details className="scn-kit" key={kit.label} open={label.kits.length===1}><summary><div><strong>{kit.label}</strong><small>{kit.kitGroup}</small></div><span>{kit.components.length} components <span aria-hidden="true">⌄</span></span></summary><QuantityTable items={kit.components}/></details>)}
   </section>}
   <p className="scn-footnote">Read-only contents · Retrieved from the Pyramakerz project records</p>
  </>}
 </div></main>;
}

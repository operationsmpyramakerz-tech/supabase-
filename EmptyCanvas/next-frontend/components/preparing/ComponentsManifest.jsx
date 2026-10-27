"use client";
import { useEffect, useMemo, useState } from "react";
import { componentTotals } from "../../lib/preparing-workflow";

const n = value => Number(value) || 0;
const initialDraft = row => ({received:String(row.received_qty),damaged:String(row.damaged_qty),prepared:String(row.prepared_qty),notes:row.notes || ""});
const formatted = value => String(value || "—");
const kitNames = source => (Array.isArray(source) ? source : []).map(item => item?.kitName).filter(Boolean).join(" · ");

export default function ComponentsManifest({ schoolId, proposalName, allowed, request, onClose }) {
  const [manifest,setManifest] = useState(null);
  const [items,setItems] = useState([]);
  const [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState(false);
  const [editing,setEditing] = useState("");
  const [drafts,setDrafts] = useState({});
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [query,setQuery] = useState("");
  const [filter,setFilter] = useState("all");
  async function refresh() {
    const json=await request(`/components?schoolId=${encodeURIComponent(schoolId)}`);
    setManifest(json.manifest); setItems(json.items || []);
    setDrafts(Object.fromEntries((json.items || []).map(item => [item.id, initialDraft(item)])));
    setLoaded(true);
  }
  // Parent mounts with a new key per school, so only the current school's rows are loaded.
  useEffect(() => {
    let live = true;
    request(`/components?schoolId=${encodeURIComponent(schoolId)}`).then(json => {
      if (!live) return;
      setManifest(json.manifest);setItems(json.items || []);
      setDrafts(Object.fromEntries((json.items || []).map(item => [item.id, initialDraft(item)])));
      setLoaded(true);
    }).catch(err => { if (live) { setLoaded(true); setError(err.message); } });
    return () => { live = false; };
  }, [schoolId]);
  const totals=useMemo(()=>componentTotals(items),[items]);
  const shown=useMemo(()=>items.filter(item=>{
    const q=`${item.product_name} ${kitNames(item.source_kits)} ${item.product_id}`.toLowerCase();
    if (!q.includes(query.toLowerCase().trim())) return false;
    if (filter==="missing") return n(item.received_qty)<n(item.planned_qty);
    if (filter==="damaged") return n(item.damaged_qty)>0;
    if (filter==="pending") return n(item.prepared_qty)<n(item.planned_qty);
    return true;
  }),[items,query,filter]);
  async function initialize() {
    if (busy) return; setBusy(true);setError("");setMessage("");
    try { await request("/components","POST",{action:"initialize",schoolId});await refresh();setMessage("Proposal quantities captured for this school. The source proposal remains unchanged."); }
    catch(err) {setError(err.message);}
    finally {setBusy(false);}
  }
  async function saveRow(row) {
    if (busy) return;setBusy(true);setError("");setMessage("");
    try {
      const d=drafts[row.id] || initialDraft(row);
      const vals=[d.received,d.damaged,d.prepared].map(value=>String(value).trim());
      if (vals.some(v=>!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)))) throw new Error("Quantities must be non-negative whole numbers.");
      await request("/components","PATCH",{schoolId,componentId:row.id,received:Number(vals[0]),damaged:Number(vals[1]),prepared:Number(vals[2]),notes:d.notes,expectedUpdatedAt:row.updated_at});
      await refresh();setEditing("");setMessage(`Saved: ${row.product_name}`);
    } catch(err) {setError(err.message);}
    finally {setBusy(false);}
  }
  function exportCSV() {
    const header=["Component","Kit tags","Required","Received","Damaged","Prepared","Missing","Usable shortage","Notes"];
    const quote=v=>{ const raw=String(v??""); const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`; };
    const data=[header,...items.map(row=>[row.product_name,kitNames(row.source_kits),row.planned_qty,row.received_qty,row.damaged_qty,row.prepared_qty,Math.max(0,n(row.planned_qty)-n(row.received_qty)),Math.max(0,n(row.planned_qty)-n(row.received_qty)+n(row.damaged_qty)),row.notes])];
    const csv="\uFEFF"+data.map(row=>row.map(quote).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    const a=document.createElement("a");a.href=url;a.download=`preparing-${schoolId}.csv`;a.click();URL.revokeObjectURL(url);
  }
  return <div className="pr-manifest">
    <div className="pr-manifest-title"><div><h3>Components & QC</h3></div><button className="pr-secondary" type="button" onClick={onClose}>Close</button></div>
    {error && <div className="pr-alert" role="alert">{error}</div>}
    {message && <p className="pr-manifest-success" role="status">{message}</p>}
    {!loaded ? <p className="pr-muted">Loading components…</p> : !manifest ? <div className="pr-manifest-empty">
      <h3>No component baseline yet</h3><p>Capture the current Proposal items once. They will stay unchanged if the original Proposal is edited later. No warehouse stock is changed by this action.</p>
      {allowed && <button className="pr-primary" type="button" disabled={busy} onClick={initialize}>{busy?"Capturing…":"Capture Proposal Components"}</button>}
    </div> : <>
      <div className="pr-manifest-snapshot"><span>Snapshot: {new Date(manifest.created_at).toLocaleString("en-GB")}</span><span>{items.length} item rows · read-only baseline</span></div>
      <div className="pr-qty-summary">{[["Required",totals.planned],["Received",totals.received],["Damaged",totals.damaged],["Prepared",totals.prepared],["Missing",totals.missing],["Usable shortage",totals.usableShortage]].map(([title,value])=><div key={title}><small>{title}</small><strong>{value}</strong></div>)}</div>
      <div className="pr-manifest-actions"><label className="pr-search"><input aria-label="Search components" placeholder="Search components or kit…" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter components" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All items</option><option value="missing">Missing</option><option value="damaged">Damaged</option><option value="pending">Not fully prepared</option></select><button className="pr-secondary" onClick={exportCSV}>CSV</button></div>
      <div className="pr-component-list">{shown.map(row=>{const d=drafts[row.id]||initialDraft(row);const isEditing=editing===row.id;const missing=Math.max(0,n(row.planned_qty)-n(row.received_qty));const shortage=Math.max(0,n(row.planned_qty)-n(row.received_qty)+n(row.damaged_qty));return <div className="pr-component" key={row.id}>
        <div className="pr-component-head"><div><strong>{row.product_name}</strong><small>{kitNames(row.source_kits)||"Direct proposal item"}</small></div><span className={shortage>0?"pr-component-short":"pr-component-ready"}>{shortage>0?`${shortage} to replenish`:"Usable stock sufficient"}</span></div>
        <div className="pr-component-values"><div><small>Required</small><b>{row.planned_qty}</b></div><div><small>Received</small><b>{row.received_qty}</b></div><div><small>Damaged</small><b>{row.damaged_qty}</b></div><div><small>Prepared</small><b>{row.prepared_qty}</b></div><div><small>Missing</small><b>{missing}</b></div></div>
        {row.notes && !isEditing && <p className="pr-component-note">{row.notes}</p>}
        {isEditing ? <div className="pr-component-editor"><div className="pr-component-inputs">{[["Received","received"],["Damaged","damaged"],["Prepared","prepared"]].map(([label,key])=><label key={key}>{label}<input aria-label={`${label} ${row.product_name}`} type="number" min="0" step="1" max="1000000" value={d[key]} onChange={e=>setDrafts(prev=>({...prev,[row.id]:{...d,[key]:e.target.value}}))}/></label>)}</div><label>Notes<textarea maxLength={1000} rows={2} value={d.notes} onChange={e=>setDrafts(prev=>({...prev,[row.id]:{...d,notes:e.target.value}}))}/></label><div className="pr-component-buttons"><button className="pr-secondary" disabled={busy} onClick={()=>{setEditing("");setDrafts(prev=>({...prev,[row.id]:initialDraft(row)}));}}>Cancel</button><button className="pr-primary" disabled={busy} onClick={()=>saveRow(row)}>{busy?"Saving…":"Save quantities"}</button></div></div> : allowed && <button className="pr-component-edit" disabled={busy} onClick={()=>setEditing(row.id)}>Update quantities</button>}
      </div>;})}{!shown.length && <p className="pr-muted">No matching components.</p>}</div>

    </>}
  </div>;
}

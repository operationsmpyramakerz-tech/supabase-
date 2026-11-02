"use client";
import PreparingSelect from "./PreparingSelect";
import { useEffect, useMemo, useState } from "react";
import { internalPreparingCSV, ministryStatusCSV } from "../../lib/preparing-reports";

const FILTERS = [
  ["all", "All schools"], ["preparing", "Preparing / Delivery"], ["technical", "Technical follow-up"],
  ["closing", "Awaiting final closing"], ["blocked", "Blocked"], ["closed", "Closed"], ["overdue", "Overdue issues"],
];
const number = value => Number(value || 0).toLocaleString("en-GB");
const showDate = value => value ? String(value).slice(0, 10) : "—";
const nice = value => ({ preparing: "Preparing / Delivery", technical: "Technical follow-up", closing: "Closing pending", blocked: "Blocked", closed: "Closed" })[value] || value;
function downloadCSV(content, name) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Metric({ label, value, warning = false }) {
  return <div className={`pr-report-metric${warning ? " warning" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
function Qty({ value }) { return value === null || value === undefined ? <span className="pr-report-na">N/A</span> : number(value); }
function Status({ phase }) { return <span className={`pr-report-pill ${phase}`}>{nice(phase)}</span>; }

export default function ProjectDashboard({ projectId, request, onClose, onOpenSchool, inline = false }) {
  const [report, setReport] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"), [query, setQuery] = useState(""), [sort, setSort] = useState("name");
  const [tab, setTab] = useState("overview");
  const load = async () => {
    setLoading(true); setError(""); setReport(null);
    try {
      const result = await request(`/reports?projectId=${encodeURIComponent(projectId)}`);
      setReport(result.report);
    } catch (cause) { setError(cause.message || "Unable to load project report."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setReport(null);
    request(`/reports?projectId=${encodeURIComponent(projectId)}`).then(value => {
      if (alive) setReport(value.report);
    }).catch(cause => { if (alive) setError(cause.message || "Unable to load project report."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);
  const rows = useMemo(() => {
    if (!report) return [];
    const text = query.trim().toLowerCase();
    return report.schools.filter(row => {
      const match = filter === "all" || (filter === "overdue" ? row.overdueIssues > 0 : row.phase === filter);
      return match && `${row.name} ${row.proposal} ${row.schoolLabel}`.toLowerCase().includes(text);
    }).sort((a, b) => sort === "progress" ? a.completedStages - b.completedStages || a.name.localeCompare(b.name) :
      sort === "issues" ? b.overdueIssues - a.overdueIssues || b.openIssues - a.openIssues || a.name.localeCompare(b.name) :
      a.name.localeCompare(b.name));
  }, [report, filter, query, sort]);
  const risky = useMemo(() => report ? report.schools.filter(row => row.blocked || row.overdueIssues || row.anomalies.length || !row.hasManifest || row.openIssues).sort((a, b) => b.overdueIssues - a.overdueIssues || b.openIssues - a.openIssues) : [], [report]);
  const safeFileName = (report?.project?.name || "Preparing_Project").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 65);
  return <div className={`pr-report-root${inline ? " pr-report-root--inline" : ""}`}>
    <div className="pr-manifest-title pr-report-top"><div><h3>Master Project Dashboard</h3>{inline && <p>Review school handovers, open issues, quantities and project status.</p>}</div>
      <div className="pr-report-actions"><button className="pr-secondary" type="button" onClick={load} disabled={loading}>Refresh</button>{!inline && <button className="pr-secondary" type="button" onClick={onClose}>Close</button>}</div>
    </div>
    {error && <div className="pr-alert" role="alert">{error} <button className="pr-link" onClick={load} type="button">Retry</button></div>}
    {loading ? <div className="pr-report-loading" role="status">Loading project reports and checking all school records…</div> : !report ? <p className="pr-muted">No project report is available.</p> : <>
      <div className="pr-report-metrics">
        <Metric label="Schools" value={number(report.summary.totalSchools)} subtitle="Beneficiaries in this project"/>
        <Metric label="Delivery handover" value={`${report.summary.deliveredSchools}/${report.summary.totalSchools}`} subtitle="Handover stage completed"/>
        <Metric label="Final closed" value={`${report.summary.closedSchools}/${report.summary.totalSchools}`} subtitle="Approval and closing stage"/>
        <Metric label="Overall progress" value={`${report.summary.averageProgress}%`} subtitle="Average of 9 workflow stages"/>
        <Metric label="Open technical issues" value={number(report.summary.openIssues)} subtitle={`${report.summary.overdueIssues} past their individual deadlines`} warning={report.summary.overdueIssues>0}/>
        <Metric label="BOM not captured" value={number(report.summary.schoolsWithoutManifest)} subtitle="Excluded from quantity totals" warning={report.summary.schoolsWithoutManifest>0}/>
      </div>
      <div className="pr-report-exports"><div><strong>Reporting & exports</strong></div><div>
        <button type="button" className="pr-secondary" onClick={()=>downloadCSV(internalPreparingCSV(report),`${safeFileName}_Operations_Report.csv`)}>Operations CSV</button>
        <button type="button" className="pr-secondary" onClick={()=>downloadCSV(ministryStatusCSV(report),`${safeFileName}_Ministry_Status.csv`)}>Ministry Status CSV</button>
      </div></div>
      <nav className="pr-report-tabs" aria-label="Preparing dashboard sections">{[["overview","Overview"],["schools","School matrix"],["risks","Risks & follow-up"]].map(([id,label])=><button key={id} className={tab===id?"active":""} type="button" aria-current={tab===id?"page":undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>
      {tab==="overview" && <>
        <div className="pr-report-columns"><section className="pr-report-panel"><h4>Workflow stage distribution</h4>
          <div className="pr-report-stages">{report.stageBreakdown.map(stage=><div className="pr-report-stage" key={stage.key}><div><span>{stage.title}</span><b>{stage.count}</b></div><div className="pr-report-bar"><span style={{width:`${report.summary.totalSchools ? stage.count / report.summary.totalSchools * 100 : 0}%`}}/></div></div>)}</div>
          <p className="pr-muted">Closed: {report.summary.closedSchools} schools</p>
        </section><section className="pr-report-panel"><h4>Component & delivery quantities</h4>
          <div className="pr-report-quantities">{[["Required", "planned"],["Warehouse received","received"],["Damaged","damaged"],["Prepared","prepared"],["Packed (active cartons)","packed"],["Gross signed receipt","grossDelivered"],["Returned to Operations","returned"],["Net school received","delivered"],["Missing at receiving","missing"],["Usable shortage","usableShortage"]].map(([title,key])=><div key={key}><span>{title}</span><strong>{number(report.summary.quantities[key])}</strong></div>)}</div>
          {report.summary.schoolsWithoutManifest>0&&<p className="pr-hint">{report.summary.schoolsWithoutManifest} schools have no snapshot; totals are incomplete, not zero for those schools.</p>}
        </section></div>
        <div className="pr-report-panel"><h4>Project follow-up</h4><div className="pr-report-followup"><span><strong>{report.summary.technicalFollowupSchools}</strong> delivered schools still in follow-up/closing</span><span><strong>{report.summary.technicalAcceptedSchools}</strong> schools with technical acceptance</span><span><strong>{report.summary.blockedSchools}</strong> schools with blocked checkpoints or stages</span></div></div>
      </>}
      {tab==="schools" && <>
        <div className="pr-report-controls"><label className="pr-field">Show<PreparingSelect value={filter} onChange={e=>setFilter(e.target.value)}>{FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</PreparingSelect></label><label className="pr-field">School / proposal<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search schools…"/></label><label className="pr-field">Sort<PreparingSelect value={sort} onChange={e=>setSort(e.target.value)}><option value="name">School name</option><option value="progress">Least progress</option><option value="issues">Most issues first</option></PreparingSelect></label></div>
        <div className="pr-report-table-scroll"><table className="pr-report-table"><thead><tr><th>School</th><th>Status</th><th>Stage / progress</th><th>Quantity status</th><th>Delivery</th><th>Technical issues</th><th>Closing</th><th>Actions</th></tr></thead><tbody>
          {rows.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{row.proposal}</small></td><td><Status phase={row.phase}/></td><td><span>{row.stageTitle}</span><div className="pr-report-bar"><span style={{width:`${row.progressPercent}%`}}/></div><small>{row.completedStages}/{row.totalStages} · {row.progressPercent}%</small></td>
            <td>{row.quantities?<><span>Received <Qty value={row.quantities.received}/> / <Qty value={row.quantities.planned}/></span><small>Usable shortage: <Qty value={row.quantities.usableShortage}/></small></>:<span className="pr-report-na">BOM not captured</span>}</td>
            <td>{row.delivered?"Handover complete":"Pending"}<small>{showDate(row.latestDelivery)}</small></td><td>{row.openIssues} open{row.overdueIssues>0&&<small className="pr-report-danger">{row.overdueIssues} overdue</small>}</td><td>{row.closed?"Closed":`${row.verifiedClosing}/${row.closingTotal} verified`}{row.anomalies.length>0&&<small className="pr-report-danger">Review discrepancy</small>}</td><td><button type="button" className="pr-link" onClick={()=>onOpenSchool(row.id)}>Open school</button></td></tr>)}
          {!rows.length&&<tr><td colSpan={8}>No schools match these filters.</td></tr>}
        </tbody></table></div><p className="pr-muted">Showing {rows.length} of {report.schools.length} schools. Zero required quantities are not assumed when the BOM snapshot is missing.</p>
      </>}
      {tab==="risks" && <div className="pr-report-risk-list">{!risky.length&&<div className="pr-report-panel"><p className="pr-muted">No open issues, blocks, reporting discrepancies or uncaptured BOM snapshots are currently recorded.</p></div>}{risky.map(row=><article className="pr-report-risk" key={row.id}><div><strong>{row.name}</strong><small>{row.stageTitle}</small><div className="pr-report-flags">{row.blocked&&<span>Blocked</span>}{row.openIssues>0&&<span>{row.openIssues} open issues</span>}{row.overdueIssues>0&&<span className="danger">{row.overdueIssues} overdue</span>}{!row.hasManifest&&<span>No BOM snapshot</span>}{row.anomalies.map(flag=><span className="danger" key={flag}>{flag}</span>)}</div>{row.nextIssueDeadline&&<small>Nearest assigned issue deadline: {row.nextIssueDeadline}</small>}</div><button className="pr-secondary" type="button" onClick={()=>onOpenSchool(row.id)}>Open school</button></article>)}</div>}

    </>}
  </div>;
}

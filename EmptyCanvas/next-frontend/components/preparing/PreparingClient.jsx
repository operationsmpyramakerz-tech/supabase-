"use client";

import { useMemo, useState } from "react";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import ComponentsManifest from "./ComponentsManifest";
import PackingDelivery from "./PackingDelivery";
import ReturnsReplacements from "./ReturnsReplacements";
import TechnicalFollowUp from "./TechnicalFollowUp";
import FinalSchoolClosing from "./FinalSchoolClosing";
import ProjectDashboard from "./ProjectDashboard";
import ProjectKitCartons from "./ProjectKitCartons";
import { PREPARING_STAGES, PREPARING_STATES, canCompleteStage, schoolProgress } from "../../lib/preparing-workflow";

const clean = value => String(value ?? "").trim();
const asArray = value => Array.isArray(value) ? value : [];
const EMPTY_DATA = { projects: [], schools: [], stages: [], proposals: [], members: [] };
const stateLabels = { not_started: "Not started", in_progress: "In progress", blocked: "Blocked", completed: "Completed" };
const fmtDate = value => { try { return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; } catch { return "—"; } };

function Ico({ name, size = 20 }) {
  const paths = {
    folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M3 12h18"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    back: <path d="M20 12H4m7-7-7 7 7 7"/>,
    check: <path d="m4 12 5 5L20 6"/>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    school: <><path d="M3 20h18M5 20V9l7-5 7 5v11"/><rect x="10" y="13" width="4" height="7"/><path d="M8 11h.01M16 11h.01"/></>,
    edit: <><path d="M13 5 19 11M4 20l4.5-.9L20 7.6a2 2 0 0 0-3-3L5.5 16z"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    refresh: <><path d="M20 7v6h-6"/><path d="M4 17v-6h6"/><path d="M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12-3"/></>,
    box: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M12 7v13M7 4h10"/></>,
    chart: <><path d="M4 20V4M4 20h17M8 16v-4M13 16V7M18 16V9"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 11h6M9 15h6"/></>,
    truck: <><path d="M3 6h12v12H3zM15 10h4l3 4v4h-7"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    wrench: <><path d="M14 7a5 5 0 0 0-7 7L3 18l3 3 4-4a5 5 0 0 0 7-7l-4 4-3-3z"/></>,
    return: <><path d="m9 14-5-5 5-5M4 9h11a5 5 0 0 1 0 10h-3"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.folder}</svg>;
}
function Meter({ value = 0, max = 1 }) { return <div className="pr-meter"><span style={{ width: `${Math.min(100, Math.round(value * 100 / (max || 1)))}%` }} /></div>; }
function Sheet({ title, onClose, children, footer }) {
  return <div className="pr-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="pr-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="pr-sheet-head"><div><h2>{title}</h2></div><button type="button" className="pr-icon" onClick={onClose} aria-label="Close"><Ico name="close"/></button></header>
      <div className="pr-sheet-body">{children}</div>{footer && <footer className="pr-sheet-foot">{footer}</footer>}
    </section>
  </div>;
}

export default function PreparingClient({ account, initialData = EMPTY_DATA, bootstrapError = "" }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState(bootstrapError);
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [sheet, setSheet] = useState("");
  const [query, setQuery] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [proposalId, setProposalId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [stageKey, setStageKey] = useState("");
  const [stageStatus, setStageStatus] = useState("not_started");
  const [stageNotes, setStageNotes] = useState("");
  const [showComponents, setShowComponents] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showReconciliation,setShowReconciliation] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showProjectCartons, setShowProjectCartons] = useState(false);
  const canCreate = featureAllowed(account, "preparing.create");
  const canManage = featureAllowed(account, "preparing.manage");
  const canStage = featureAllowed(account, "preparing.stage_update");
  const canClose = featureAllowed(account, "preparing.close");
  const projects = asArray(data.projects);
  const schools = asArray(data.schools);
  const stages = asArray(data.stages);
  const project = projects.find(row => row.id === projectId);
  const projectSchools = schools.filter(row => row.project_id === projectId);
  const school = projectSchools.find(row => row.id === schoolId);
  const schoolStages = stages.filter(row => row.school_id === schoolId);
  const currentStage = PREPARING_STAGES.find(row => row.key === stageKey);
  const stageRow = schoolStages.find(row => row.stage_key === stageKey);
  const projectSummaries = useMemo(() => {
    const bySchool = new Map();
    for (const row of stages) { if (!bySchool.has(row.school_id)) bySchool.set(row.school_id, []); bySchool.get(row.school_id).push(row); }
    return new Map(projects.map(project => {
      const enrolled = schools.filter(school => school.project_id === project.id);
      return [project.id, { total: enrolled.length, closed: enrolled.filter(school => schoolProgress(bySchool.get(school.id)).closed).length,
        delivered: enrolled.filter(school => schoolProgress(bySchool.get(school.id)).delivered).length }];
    }));
  }, [stages, projects, schools]);
  const totals = { projects: projects.length, schools: schools.length,
    delivered: schools.filter(school => schoolProgress(stages.filter(row => row.school_id === school.id)).delivered).length,
    closed: schools.filter(school => schoolProgress(stages.filter(row => row.school_id === school.id)).closed).length };
  const progress = school ? schoolProgress(schoolStages) : null;
  const projectCompletedStages = projectSchools.reduce((total, row) => total + schoolProgress(stages.filter(stage => stage.school_id === row.id)).completed, 0);
  const projectProgress = projectSchools.length ? Math.round(projectCompletedStages * 100 / (projectSchools.length * PREPARING_STAGES.length)) : 0;
  const tools = [
    { key:"components", name:"Components & QC", icon:"box", open:()=>setShowComponents(true) },
    { key:"delivery", name:"Packing & Delivery", icon:"truck", open:()=>setShowDelivery(true) },
    { key:"technical", name:"Technical Follow-up", icon:"wrench", open:()=>setShowTechnical(true) },
    { key:"reconciliation", name:"Returns & Replacements", icon:"return", open:()=>setShowReconciliation(true) },
    { key:"closing", name:"Final School Closing", icon:"shield", open:()=>setShowClosing(true) },
  ];
  async function api(path, method = "GET", payload = null) {
    const response = await fetch(`/next/api/projects-preparing${path}`, { method, cache: "no-store",
      ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw new Error(json.error || `Request failed (${response.status}).`);
    return json;
  }
  async function reload() {
    const json = await api("");
    setData({ projects: json.projects || [], schools: json.schools || [], stages: json.stages || [],
      proposals: json.proposals || [], members: json.members || [] });
    setError("");
  }
  async function save(task) {
    if (busy) return;
    setBusy(true); setError("");
    try { await task(); await reload(); setSheet(""); }
    catch (err) { setError(err.message || "Unable to save."); }
    finally { setBusy(false); }
  }
  function openNewProject() { setProjectName(""); setProjectDescription(""); setSheet("project"); }
  function openEditProject() { setProjectName(project?.name || ""); setProjectDescription(project?.description || ""); setSheet("edit_project"); }
  function openSchools() { setSelectedMembers([]); setMemberQuery(""); setProposalId(""); setSheet("schools"); }
  function openStage(stage) { const record = schoolStages.find(row => row.stage_key === stage.key); setStageKey(stage.key); setStageStatus(record?.status || "not_started"); setStageNotes(record?.notes || ""); setSheet("stage"); }
  function backToParent() {
    if (school) { setSchoolId(""); setQuery(""); setShowComponents(false); setShowDelivery(false); setShowReconciliation(false); setShowTechnical(false); setShowClosing(false); return; }
    setProjectId(""); setQuery(""); setShowDashboard(false); setShowProjectCartons(false);
  }
  const filteredMembers = asArray(data.members).filter(member => {
    const used = new Set(projectSchools.map(row => clean(row.beneficiary_id)));
    return !used.has(member.id) && `${member.name} ${member.school}`.toLowerCase().includes(memberQuery.toLowerCase());
  });
  const projectFiltered = projects.filter(row => `${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase()));
  const schoolFiltered = projectSchools.filter(row => `${row.beneficiary_name} ${row.school_label} ${row.proposal_name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="pr-root">
    <div className="pr-header">
      <div className="pr-headline">
        {project && <button type="button" className="pr-back" onClick={backToParent}><Ico name="back" size={18}/>{school ? project.name : "Projects"}</button>}
        <h1>{school ? school.beneficiary_name : project ? project.name : "Projects"}</h1>
      </div>
      <div className="pr-top-actions">
        <button type="button" className="pr-icon" title="Refresh" aria-label="Refresh" onClick={() => save(async () => {})} disabled={busy}><Ico name="refresh"/></button>
        {!project && canCreate && <button type="button" className="pr-primary" onClick={openNewProject}><Ico name="plus" size={17}/> New Project</button>}
        {project && !school && canManage && <><button type="button" className="pr-secondary" onClick={openEditProject}><Ico name="edit" size={16}/> Edit</button><button type="button" className="pr-primary" onClick={openSchools}><Ico name="plus" size={17}/> Add Schools</button></>}
      </div>
    </div>
    {error && <div className="pr-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Ico name="close" size={16}/></button></div>}
    <div className="pr-metrics">
      {(school ? [
        ["Stages completed", `${progress.completed} / ${progress.total}`],
        ["Remaining", progress.total - progress.completed],
        ["Delivery", progress.delivered ? "Done" : "Pending"],
        ["Closing", progress.closed ? "Closed" : "Open"],
      ] : project ? [
        ["Schools", projectSchools.length], ["Delivered", projectSummaries.get(project.id)?.delivered || 0],
        ["Closed", projectSummaries.get(project.id)?.closed || 0], ["Progress", `${projectProgress}%`],
      ] : [
        ["Projects", totals.projects], ["Schools", totals.schools], ["Delivered", totals.delivered], ["Closed", totals.closed],
      ]).map(([name, count]) => <div className="pr-metric" key={name}><span>{name}</span><strong>{count}</strong></div>)}
    </div>
    {project && !school && <div className="pr-tool-grid pr-project-tools">
      <button type="button" className="pr-tool" onClick={()=>setShowProjectCartons(true)}><span className="pr-tool-icon"><Ico name="box" size={20}/></span><strong>Project Kit Cartons</strong><Ico name="arrow" size={17}/></button>
      <button type="button" className="pr-tool" onClick={()=>setShowDashboard(true)}><span className="pr-tool-icon"><Ico name="chart" size={20}/></span><strong>Project Dashboard</strong><Ico name="arrow" size={17}/></button>
    </div>}
    {project && !school && showProjectCartons && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProjectCartons(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Project Kit Cartons"><ProjectKitCartons key={projectId} projectId={projectId} projectName={project?.name||""} stageRecords={stages} allowed={canStage} request={api} onClose={()=>{setShowProjectCartons(false);reload().catch(err=>setError(err.message));}}/></section></div>}
    {project && !school && showDashboard && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowDashboard(false);}}><section className="pr-components-sheet pr-report-sheet" role="dialog" aria-modal="true" aria-label="Master project dashboard"><ProjectDashboard key={projectId} projectId={projectId} request={api} onClose={()=>setShowDashboard(false)} onOpenSchool={id=>{setShowDashboard(false);setSchoolId(id);setShowComponents(false);setShowDelivery(false);setShowReconciliation(false);setShowTechnical(false);setShowClosing(false);}}/></section></div>}
    {school ? <>
      <div className="pr-school-info">
        <div><span>PROPOSAL</span><strong>{school.proposal_name}</strong></div>
        <div><span>OVERALL PROGRESS</span><strong>{progress.completed} / {progress.total} stages</strong><Meter value={progress.completed} max={progress.total}/></div>
      </div>
      <div className="pr-section-heading"><h2>Workspace</h2></div>
      <div className="pr-tool-grid pr-school-tools">{tools.map(tool => <button className="pr-tool" type="button" key={tool.key} onClick={tool.open}>
        <span className="pr-tool-icon"><Ico name={tool.icon} size={20}/></span><strong>{tool.name}</strong><Ico name="arrow" size={17}/>
      </button>)}</div>
      {showComponents && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowComponents(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Components and QC"><ComponentsManifest key={school.id} schoolId={school.id} proposalName={school.proposal_name} allowed={canStage} request={api} onClose={()=>setShowComponents(false)}/></section></div>}
      {showDelivery && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowDelivery(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Packing and delivery"><PackingDelivery key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} proposalName={school.proposal_name} stageStatuses={schoolStages} allowed={canStage} request={api} onClose={()=>{setShowDelivery(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      {showTechnical && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowTechnical(false);setShowClosing(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Technical installation follow-up"><TechnicalFollowUp key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} allowed={canStage} request={api} onClose={()=>{setShowTechnical(false);setShowClosing(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      {showReconciliation && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowReconciliation(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Returns and replacements"><ReturnsReplacements key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} allowed={canStage} request={api} onOpenDelivery={()=>{setShowReconciliation(false);setShowDelivery(true);}} onClose={()=>{setShowReconciliation(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      {showClosing && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowClosing(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Final school closing"><FinalSchoolClosing key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} canEdit={canStage} canApprove={canClose} request={api} onClose={()=>{setShowClosing(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      <div className="pr-section-heading pr-workflow-heading"><h2>Preparing Workflow</h2><span>{progress.completed} of {progress.total}</span></div>
      <div className="pr-stage-list">{PREPARING_STAGES.map((stage, index) => {
        const entry = schoolStages.find(row => row.stage_key === stage.key);
        const status = entry?.status || "not_started";
        return <button type="button" key={stage.key} className={`pr-stage ${status}`} onClick={() => openStage(stage)}>
          <span className="pr-stage-number">{status === "completed" ? <Ico name="check" size={19}/> : String(index + 1).padStart(2,"0")}</span>
          <span className="pr-stage-body"><strong>{stage.title}</strong>{entry?.notes && <em>{entry.notes}</em>}</span>
          <span className={`pr-status ${status}`}>{stateLabels[status]}</span><span className="pr-stage-arrow"><Ico name="arrow" size={18}/></span>
        </button>;
      })}</div>
    </> : <>
      <div className="pr-section-bar"><div><h2>{project ? "Schools" : "Project Folders"}</h2></div><label className="pr-search"><Ico name="search" size={17}/><input aria-label="Search projects or schools" placeholder="Search…" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
      <div className="pr-folders">
        {!project ? projectFiltered.map(row => { const summary = projectSummaries.get(row.id) || { total:0,closed:0,delivered:0 }; return <button type="button" className="pr-folder" key={row.id} onClick={()=>{setProjectId(row.id);setSchoolId("");setQuery("");}}>
          <span className="pr-folder-icon"><Ico name="folder" size={26}/></span><strong>{row.name}</strong><div className="pr-folder-count">{summary.total} schools <span>{summary.closed} closed</span></div><Meter value={summary.closed} max={summary.total || 1}/><span className="pr-folder-date">{fmtDate(row.created_at)}</span>
        </button>; }) : schoolFiltered.map(row => { const progress = schoolProgress(stages.filter(stage=>stage.school_id===row.id)); return <button type="button" className="pr-folder" key={row.id} onClick={()=>{setSchoolId(row.id);setShowComponents(false);setShowDelivery(false);setShowReconciliation(false);setShowTechnical(false);setShowClosing(false);}}>
          <span className="pr-folder-icon school"><Ico name="school" size={26}/></span><strong>{row.beneficiary_name}</strong><small>{row.proposal_name}</small><div className="pr-folder-count">{progress.completed}/{progress.total} stages <span>{progress.closed ? "Closed" : progress.delivered ? "Delivered" : "Preparing"}</span></div><Meter value={progress.completed} max={progress.total}/>
        </button>; })}
        {project && !projectSchools.length && <div className="pr-empty"><Ico name="school" size={36}/><h3>No schools assigned</h3>{canManage && <button className="pr-primary" onClick={openSchools}>Add Schools</button>}</div>}
        {!project && !projects.length && <div className="pr-empty"><Ico name="folder" size={36}/><h3>No project folders yet</h3>{canCreate && <button className="pr-primary" onClick={openNewProject}>Create first project</button>}</div>}
      </div>
    </>}
    {(sheet === "project" || sheet === "edit_project") && <Sheet title={sheet === "project" ? "New Project" : "Edit Project"} onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button className="pr-primary" disabled={busy || projectName.trim().length < 2} onClick={()=>save(async()=>api("", sheet === "project" ? "POST" : "PATCH", { action:"create_project", projectId, name:projectName, description:projectDescription }))}>{busy ? "Saving…" : "Save Project"}</button></>}>
      <label className="pr-field">Project name<input autoFocus maxLength={160} value={projectName} placeholder="30 June Schools" onChange={event=>setProjectName(event.target.value)}/></label>
      <label className="pr-field">Description<textarea rows={4} maxLength={1000} value={projectDescription} placeholder="STEAM Labs · 11 schools" onChange={event=>setProjectDescription(event.target.value)}/></label>
    </Sheet>}
    {sheet === "schools" && <Sheet title="Add Beneficiaries" onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button className="pr-primary" disabled={busy || !proposalId || !selectedMembers.length} onClick={()=>save(async()=>api("","POST",{action:"add_schools",projectId,proposalId,beneficiaryIds:selectedMembers}))}>{busy ? "Adding…" : `Add ${selectedMembers.length} Schools`}</button></>}>
      <label className="pr-field">Source Proposal<select value={proposalId} onChange={event=>setProposalId(event.target.value)}><option value="">Select proposal…</option>{asArray(data.proposals).map(proposal=><option key={proposal.id} value={proposal.id}>{proposal.name} ({proposal.itemsCount} items)</option>)}</select></label>
      <label className="pr-field">Beneficiary users / schools<input value={memberQuery} placeholder="Search beneficiaries…" onChange={event=>setMemberQuery(event.target.value)}/></label>
      <div className="pr-choose-tools"><span>{selectedMembers.length} selected</span><button type="button" className="pr-link" onClick={()=>setSelectedMembers([])}>Clear selection</button></div>
      <div className="pr-member-list">{filteredMembers.map(member=><label className="pr-member" key={member.id}><input type="checkbox" checked={selectedMembers.includes(member.id)} onChange={event=>setSelectedMembers(previous=>event.target.checked ? [...previous,member.id] : previous.filter(id=>id!==member.id))}/><span><strong>{member.name}</strong>{member.school && <small>{member.school}</small>}</span></label>)}{!filteredMembers.length && <p className="pr-muted">No available users match the search.</p>}</div>

    </Sheet>}
    {sheet === "stage" && currentStage && <Sheet title={currentStage.title} onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button>{canStage && currentStage.key !== "final_closing" && <button className="pr-primary" disabled={busy} onClick={()=>save(async()=>api("/stages","PATCH",{schoolId,stageKey,status:stageStatus,notes:stageNotes}))}>{busy ? "Saving…" : "Save Status"}</button>}</>}>
      <label className="pr-field">Stage status<select value={stageStatus} disabled={!canStage || currentStage.key === "final_closing"} onChange={event=>setStageStatus(event.target.value)}>{PREPARING_STATES.map(status=><option key={status} value={status} disabled={currentStage.key === "final_closing" || (status === "completed" && !canCompleteStage(currentStage.key, schoolStages))}>{stateLabels[status]}</option>)}</select></label>
      {!canCompleteStage(currentStage.key, schoolStages) && <p className="pr-hint">Previous stages must be completed before this stage can be marked completed.</p>}
      {currentStage.key === "final_closing" && <p className="pr-hint">Use Open Closing to verify the checklist, approve and close, or reopen. Stage status is read-only here.</p>}
      {["installation","testing"].includes(currentStage.key) && <p className="pr-hint">Use Open Technical to complete the technical checkpoints, resolve issues, and record acceptance before marking this stage completed.</p>}
      <label className="pr-field">Notes / reference<textarea disabled={!canStage || currentStage.key === "final_closing"} maxLength={2000} rows={5} placeholder="Enter handover number, issues, or technical follow-up reference…" value={stageNotes} onChange={event=>setStageNotes(event.target.value)} /></label>
      {stageRow?.updated_at && <span className="pr-form-meta">Updated {fmtDate(stageRow.updated_at)}</span>}
    </Sheet>}
  </div>;
}

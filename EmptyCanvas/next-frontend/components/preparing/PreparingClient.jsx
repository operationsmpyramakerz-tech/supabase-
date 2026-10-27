"use client";

import { useMemo, useState } from "react";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import ComponentsManifest from "./ComponentsManifest";
import PackingDelivery from "./PackingDelivery";
import TechnicalFollowUp from "./TechnicalFollowUp";
import FinalSchoolClosing from "./FinalSchoolClosing";
import ProjectDashboard from "./ProjectDashboard";
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
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.folder}</svg>;
}
function Meter({ value = 0, max = 1 }) { return <div className="pr-meter"><span style={{ width: `${Math.min(100, Math.round(value * 100 / (max || 1)))}%` }} /></div>; }
function Sheet({ title, subtitle, onClose, children, footer }) {
  return <div className="pr-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="pr-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="pr-sheet-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="pr-icon" onClick={onClose} aria-label="Close"><Ico name="close"/></button></header>
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
  const [showTechnical, setShowTechnical] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
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
  const filteredMembers = asArray(data.members).filter(member => {
    const used = new Set(projectSchools.map(row => clean(row.beneficiary_id)));
    return !used.has(member.id) && `${member.name} ${member.school}`.toLowerCase().includes(memberQuery.toLowerCase());
  });
  const projectFiltered = projects.filter(row => `${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase()));
  const schoolFiltered = projectSchools.filter(row => `${row.beneficiary_name} ${row.school_label} ${row.proposal_name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="pr-root">
    <div className="pr-header">
      <div className="pr-headline">{project ? <button className="pr-back" onClick={() => { setProjectId(""); setSchoolId(""); setQuery(""); setShowComponents(false); setShowDelivery(false); setShowTechnical(false);setShowClosing(false); setShowDashboard(false); }}><Ico name="back"/> Projects</button> : <span className="pr-eyebrow">OPERATIONS WORKSPACE</span>}
        <h1>{school ? school.beneficiary_name : project ? project.name : "Projects Preparing"}</h1>
        <p>{school ? `Source proposal: ${school.proposal_name}` : project ? (project.description || "Select a beneficiary to view the preparing workflow") : "Manage preparing, delivery and technical follow-up across projects."}</p>
      </div>
      <div className="pr-top-actions">
        <button type="button" className="pr-icon" title="Refresh" aria-label="Refresh" onClick={() => save(async () => {})} disabled={busy}><Ico name="refresh" /></button>
        {!project && canCreate && <button className="pr-primary" onClick={openNewProject}><Ico name="plus" size={17}/> New Project</button>}
        {project && !school && <button type="button" className="pr-primary" onClick={()=>setShowDashboard(true)}>Project Dashboard</button>}
        {project && !school && canManage && <><button className="pr-secondary" onClick={openEditProject}><Ico name="edit" size={17}/> Edit Project</button><button className="pr-primary" onClick={openSchools}><Ico name="plus" size={17}/> Add Schools</button></>}
      </div>
    </div>
    {error && <div className="pr-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Ico name="close" size={16}/></button></div>}
    <div className="pr-metrics">
      {[
        [project ? "Schools" : "Projects", project ? projectSchools.length : totals.projects],
        ["Beneficiaries", project ? projectSchools.length : totals.schools],
        ["Delivered", project ? (projectSummaries.get(project.id)?.delivered || 0) : totals.delivered],
        ["Closed", project ? (projectSummaries.get(project.id)?.closed || 0) : totals.closed],
      ].map(([name, count]) => <div className="pr-metric" key={name}><span>{name}</span><strong>{count}</strong></div>)}
    </div>
    {project && !school && <div className="pr-report-entry"><div><strong>Project Performance & Reports</strong><p>Track all schools, BOM quantities, deliveries, technical issues, and final closing from one read-only dashboard.</p></div><button type="button" className="pr-secondary" onClick={()=>setShowDashboard(true)}>Open Dashboard</button></div>}
    {project && !school && showDashboard && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowDashboard(false);}}><section className="pr-components-sheet pr-report-sheet" role="dialog" aria-modal="true" aria-label="Master project dashboard"><ProjectDashboard key={projectId} projectId={projectId} request={api} onClose={()=>setShowDashboard(false)} onOpenSchool={id=>{setShowDashboard(false);setSchoolId(id);setShowComponents(false);setShowDelivery(false);setShowTechnical(false);setShowClosing(false);}}/></section></div>}
    {school ? <>
      <div className="pr-breadcrumb"><button onClick={() => {setSchoolId("");setShowComponents(false);setShowDelivery(false);setShowTechnical(false);setShowClosing(false);}}>{project.name}</button><Ico name="arrow" size={14}/><span>{school.beneficiary_name}</span></div>
      <div className="pr-school-info"><div><span>BENEFICIARY</span><strong>{school.beneficiary_name}</strong><small>{school.school_label || "No school column assigned"}</small></div><div><span>PROPOSAL</span><strong>{school.proposal_name}</strong><small>Linked source (read-only)</small></div><div><span>OVERALL PROGRESS</span><strong>{schoolProgress(schoolStages).completed} / {PREPARING_STAGES.length} stages</strong><Meter value={schoolProgress(schoolStages).completed} max={PREPARING_STAGES.length}/></div></div>
      <div className="pr-component-entry"><div><h2>Components & QC</h2><p>Proposal BOM · Received, damaged, prepared and missing quantities, per school</p></div><button className="pr-primary" type="button" onClick={()=>setShowComponents(true)}>Open Components</button></div>
      {showComponents && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowComponents(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Components and QC"><ComponentsManifest key={school.id} schoolId={school.id} proposalName={school.proposal_name} allowed={canStage} request={api} onClose={()=>setShowComponents(false)}/></section></div>}
      <div className="pr-component-entry pr-delivery-entry"><div><h2>Packing & School Delivery</h2><p>Carton labels, packing lists, transport, signed receipt and school reconciliation</p></div><button className="pr-primary" type="button" onClick={()=>setShowDelivery(true)}>Open Delivery</button></div>
      {showDelivery && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowDelivery(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Packing and delivery"><PackingDelivery key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} proposalName={school.proposal_name} stageStatuses={schoolStages} allowed={canStage} request={api} onClose={()=>{setShowDelivery(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      <div className="pr-component-entry pr-technical-entry"><div><h2>Technical Installation Follow-up</h2><p>Technical checkpoints, assigned team, due dates, snag list, commissioning and sign-off evidence</p></div><button className="pr-primary" type="button" onClick={()=>setShowTechnical(true)}>Open Technical</button></div>
      {showTechnical && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowTechnical(false);setShowClosing(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Technical installation follow-up"><TechnicalFollowUp key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} allowed={canStage} request={api} onClose={()=>{setShowTechnical(false);setShowClosing(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      <div className="pr-component-entry pr-closing-entry"><div><h2>Final School Closing</h2><p>Signed records, seven-day receipt review, custody reconciliation, technical acceptance and final Operations approval</p></div><button className="pr-primary" type="button" onClick={()=>setShowClosing(true)}>Open Closing</button></div>
      {showClosing && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowClosing(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Final school closing"><FinalSchoolClosing key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} canEdit={canStage} canApprove={canClose} request={api} onClose={()=>{setShowClosing(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      <div className="pr-section-heading"><h2>Preparing Workflow</h2><p>Operations executes steps 1–6. Technical installation and commissioning are followed up in steps 7–9.</p></div>
      <div className="pr-stage-list">{PREPARING_STAGES.map((stage, index) => {
        const entry = schoolStages.find(row => row.stage_key === stage.key);
        const status = entry?.status || "not_started";
        return <button type="button" key={stage.key} className={`pr-stage ${status}`} onClick={() => openStage(stage)}>
          <span className="pr-stage-number">{status === "completed" ? <Ico name="check" size={19}/> : String(index + 1).padStart(2,"0")}</span>
          <span className="pr-stage-body"><strong>{stage.title}</strong><small>{stage.subtitle}</small>{entry?.notes && <em>{entry.notes}</em>}</span>
          <span className={`pr-status ${status}`}>{stateLabels[status]}</span><span className="pr-stage-arrow"><Ico name="arrow" size={18}/></span>
        </button>;
      })}</div>
    </> : <>
      <div className="pr-section-bar"><div><h2>{project ? "Project Schools" : "Project Folders"}</h2><p>{project ? "Choose a school to manage its stages" : "One folder per complete deployment project"}</p></div><label className="pr-search"><Ico name="search" size={17}/><input aria-label="Search projects or schools" placeholder="Search…" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
      <div className="pr-folders">
        {!project ? projectFiltered.map(row => { const summary = projectSummaries.get(row.id) || { total:0,closed:0,delivered:0 }; return <button type="button" className="pr-folder" key={row.id} onClick={()=>{setProjectId(row.id);setSchoolId("");setQuery("");}}>
          <span className="pr-folder-icon"><Ico name="folder" size={32}/></span><strong>{row.name}</strong><small>{row.description || "Preparing & Deployment Project"}</small><div className="pr-folder-count">{summary.total} schools <span>{summary.closed} closed</span></div><Meter value={summary.closed} max={summary.total || 1}/><span className="pr-folder-date">Created {fmtDate(row.created_at)}</span>
        </button>; }) : schoolFiltered.map(row => { const progress = schoolProgress(stages.filter(stage=>stage.school_id===row.id)); return <button type="button" className="pr-folder" key={row.id} onClick={()=>{setSchoolId(row.id);setShowComponents(false);setShowDelivery(false);setShowTechnical(false);setShowClosing(false);}}>
          <span className="pr-folder-icon school"><Ico name="school" size={31}/></span><strong>{row.beneficiary_name}</strong><small>{row.proposal_name}</small><div className="pr-folder-count">{progress.completed}/{progress.total} stages <span>{progress.closed ? "Closed" : progress.delivered ? "Delivered" : "Preparing"}</span></div><Meter value={progress.completed} max={progress.total}/><span className="pr-folder-date">{row.school_label || "Beneficiary account"}</span>
        </button>; })}
        {project && !projectSchools.length && <div className="pr-empty"><Ico name="school" size={36}/><h3>No schools assigned</h3><p>Use Add Schools to select the beneficiaries and the approved proposal.</p>{canManage && <button className="pr-primary" onClick={openSchools}>Add Schools</button>}</div>}
        {!project && !projects.length && <div className="pr-empty"><Ico name="folder" size={36}/><h3>No project folders yet</h3><p>Create a folder for 30 June Schools or your next STEAM deployment.</p>{canCreate && <button className="pr-primary" onClick={openNewProject}>Create first project</button>}</div>}
      </div>
    </>}
    {(sheet === "project" || sheet === "edit_project") && <Sheet title={sheet === "project" ? "New Project" : "Edit Project"} subtitle="One folder for the complete project" onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button className="pr-primary" disabled={busy || projectName.trim().length < 2} onClick={()=>save(async()=>api("", sheet === "project" ? "POST" : "PATCH", { action:"create_project", projectId, name:projectName, description:projectDescription }))}>{busy ? "Saving…" : "Save Project"}</button></>}>
      <label className="pr-field">Project name<input autoFocus maxLength={160} value={projectName} placeholder="30 June Schools" onChange={event=>setProjectName(event.target.value)}/></label>
      <label className="pr-field">Description<textarea rows={4} maxLength={1000} value={projectDescription} placeholder="STEAM Labs · 11 schools" onChange={event=>setProjectDescription(event.target.value)}/></label>
    </Sheet>}
    {sheet === "schools" && <Sheet title="Add Beneficiaries" subtitle="Select school users and their approved source proposal" onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button className="pr-primary" disabled={busy || !proposalId || !selectedMembers.length} onClick={()=>save(async()=>api("","POST",{action:"add_schools",projectId,proposalId,beneficiaryIds:selectedMembers}))}>{busy ? "Adding…" : `Add ${selectedMembers.length} Schools`}</button></>}>
      <label className="pr-field">Source Proposal<select value={proposalId} onChange={event=>setProposalId(event.target.value)}><option value="">Select proposal…</option>{asArray(data.proposals).map(proposal=><option key={proposal.id} value={proposal.id}>{proposal.name} ({proposal.itemsCount} items)</option>)}</select></label>
      <label className="pr-field">Beneficiary users / schools<input value={memberQuery} placeholder="Search beneficiaries…" onChange={event=>setMemberQuery(event.target.value)}/></label>
      <div className="pr-choose-tools"><span>{selectedMembers.length} selected</span><button type="button" className="pr-link" onClick={()=>setSelectedMembers([])}>Clear selection</button></div>
      <div className="pr-member-list">{filteredMembers.map(member=><label className="pr-member" key={member.id}><input type="checkbox" checked={selectedMembers.includes(member.id)} onChange={event=>setSelectedMembers(previous=>event.target.checked ? [...previous,member.id] : previous.filter(id=>id!==member.id))}/><span><strong>{member.name}</strong>{member.school && <small>{member.school}</small>}</span></label>)}{!filteredMembers.length && <p className="pr-muted">No available users match the search.</p>}</div>
      <p className="pr-muted">Each selected beneficiary receives the same proposal. To use different proposals, add the schools in separate selections.</p>
    </Sheet>}
    {sheet === "stage" && currentStage && <Sheet title={currentStage.title} subtitle={currentStage.team === "operations" ? "Operations · Direct execution" : "Operations · Technical follow-up"} onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button>{canStage && currentStage.key !== "final_closing" && <button className="pr-primary" disabled={busy} onClick={()=>save(async()=>api("/stages","PATCH",{schoolId,stageKey,status:stageStatus,notes:stageNotes}))}>{busy ? "Saving…" : "Save Status"}</button>}</>}>
      <p className="pr-muted">{currentStage.subtitle}</p>
      <label className="pr-field">Stage status<select value={stageStatus} disabled={!canStage || currentStage.key === "final_closing"} onChange={event=>setStageStatus(event.target.value)}>{PREPARING_STATES.map(status=><option key={status} value={status} disabled={currentStage.key === "final_closing" || (status === "completed" && !canCompleteStage(currentStage.key, schoolStages))}>{stateLabels[status]}</option>)}</select></label>
      {!canCompleteStage(currentStage.key, schoolStages) && <p className="pr-hint">Previous stages must be completed before this stage can be marked completed.</p>}
      {currentStage.key === "final_closing" && <p className="pr-hint">Use Open Closing to verify the checklist, approve and close, or reopen. Stage status is read-only here.</p>}
      {["installation","testing"].includes(currentStage.key) && <p className="pr-hint">Use Open Technical to complete the technical checkpoints, resolve issues, and record acceptance before marking this stage completed.</p>}
      <label className="pr-field">Notes / reference<textarea disabled={!canStage || currentStage.key === "final_closing"} maxLength={2000} rows={5} placeholder="Enter handover number, issues, or technical follow-up reference…" value={stageNotes} onChange={event=>setStageNotes(event.target.value)} /></label>
      <p className="pr-muted">Last updated {fmtDate(stageRow?.updated_at)}. Component quantities are managed in Components & QC. Packing and delivery records are in Open Delivery. File uploads are planned for a later phase.</p>
    </Sheet>}
  </div>;
}

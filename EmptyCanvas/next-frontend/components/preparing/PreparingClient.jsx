"use client";

import PreparingSelect from "./PreparingSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import ComponentsManifest from "./ComponentsManifest";
import PackingDelivery from "./PackingDelivery";
import ReturnsReplacements from "./ReturnsReplacements";
import TechnicalFollowUp from "./TechnicalFollowUp";
import FinalSchoolClosing from "./FinalSchoolClosing";
import ProjectDashboard from "./ProjectDashboard";
import ProjectKitCartons from "./ProjectKitCartons";
import ProjectWarehouseReceiving from "./ProjectWarehouseReceiving";
import ProjectMasterComponents from "./ProjectMasterComponents";
import ProjectTesting from "./ProjectTesting";
import ProjectProductionReceiving from "./ProjectProductionReceiving";
import { PREPARING_STAGES, PREPARING_STATES, canCompleteStage, schoolProgress } from "../../lib/preparing-workflow";
import { calculateProjectPreparationProgress } from "../../lib/preparing-project-progress.mjs";

const clean = value => String(value ?? "").trim();
const asArray = value => Array.isArray(value) ? value : [];
const EMPTY_DATA = { projects: [], schools: [], stages: [], proposals: [], members: [] };
const stateLabels = { not_started: "Not started", in_progress: "In progress", blocked: "Blocked", completed: "Completed" };
const fmtDate = value => { try { return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; } catch { return "—"; } };

function Ico({ name, size = 20 }) {
  const paths = {
    folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M3 12h18"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></>,
    back: <path d="M20 12H4m7-7-7 7 7 7"/>,
    check: <path d="m4 12 5 5L20 6"/>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    school: <><path d="M3 20h18M5 20V9l7-5 7 5v11"/><rect x="10" y="13" width="4" height="7"/><path d="M8 11h.01M16 11h.01"/></>,
    edit: <><path d="M13 5 19 11M4 20l4.5-.9L20 7.6a2 2 0 0 0-3-3L5.5 16z"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    refresh: <><path d="M20 7v6h-6"/><path d="M4 17v-6h6"/><path d="M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12-3"/></>,
    box: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M12 7v13M7 4h10"/></>,
    components: <><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M12 9v3M6.5 15v-3h11v3"/></>,
    chart: <><path d="M4 20V4M4 20h17M8 16v-4M13 16V7M18 16V9"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 11h6M9 15h6"/></>,
    truck: <><path d="M3 6h12v12H3zM15 10h4l3 4v4h-7"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    wrench: <><path d="M14 7a5 5 0 0 0-7 7L3 18l3 3 4-4a5 5 0 0 0 7-7l-4 4-3-3z"/></>,
    return: <><path d="m9 14-5-5 5-5M4 9h11a5 5 0 0 1 0 10h-3"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.folder}</svg>;
}
function Meter({ value = 0, max = 1 }) { return <div className="pr-meter"><span style={{ width: `${Math.min(100, Math.round(value * 100 / (max || 1)))}%` }} /></div>; }
// Percentages in this dashboard are calculated from persisted project quantities,
// not from the school delivery/closing workflow (which has its own 9 stages).
function StepAccessAvatars({ access, loading, unavailable }) {
  if (loading) return <span className="pr-step-access-placeholder" aria-label="Loading stage access">Checking access…</span>;
  if (unavailable || !access) return <span className="pr-step-access-placeholder" aria-label="Stage access unavailable">Access unavailable</span>;
  if (!access.count) return <span className="pr-step-access-placeholder" aria-label="No verified stage editors">No editors</span>;
  return <span className="pr-step-access-avatars" aria-label={`${access.count} ${access.count === 1 ? "user" : "users"} with stage edit access`}>
    {access.users.map(user => <span className="pr-step-access-avatar" key={user.id} title={user.name} aria-label={user.name}>
      {user.photoUrl ? <img src={user.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : null}
      <span className="pr-step-access-initials" aria-hidden="true">{clean(user.name).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?"}</span>
    </span>)}
    {access.count > access.users.length && <span className="pr-step-access-extra" title={`${access.count} users have access`}>+{access.count - access.users.length}</span>}
  </span>;
}
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
  const [projectFilter, setProjectFilter] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [actionProjectId, setActionProjectId] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [stageKey, setStageKey] = useState("");
  const [stageStatus, setStageStatus] = useState("not_started");
  const [stageNotes, setStageNotes] = useState("");
  const [folderMenu, setFolderMenu] = useState("");
  const longPressTimer = useRef(null);
  const longPressStart = useRef(null);
  const suppressFolderClick = useRef(false);
  const [showComponents, setShowComponents] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showReconciliation,setShowReconciliation] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showProjectCartons, setShowProjectCartons] = useState(false);
  const [showWarehouse, setShowWarehouse] = useState(false);
  const [showProjectTesting, setShowProjectTesting] = useState(false);
  const [showProduction, setShowProduction] = useState(false);
  const [showBoxDistribution, setShowBoxDistribution] = useState(false);
  const [showProjectBOM, setShowProjectBOM] = useState(false);
  const [projectSourceId, setProjectSourceId] = useState("");
  const [schoolView, setSchoolView] = useState("grid");
  const [projectStageData, setProjectStageData] = useState(null);
  const [projectStageLoading, setProjectStageLoading] = useState(false);
  const [projectStageError, setProjectStageError] = useState("");
  const [projectStageRevision, setProjectStageRevision] = useState(0);
  const [stepAccess, setStepAccess] = useState(null);
  const [stepAccessLoading, setStepAccessLoading] = useState(false);
  const [stepAccessError, setStepAccessError] = useState(false);

  // The AppShell header search is the single search control for projects,
  // schools, and the current school's workflow. Reset it on navigation.
  useEffect(() => {
    const input = document.querySelector(".classic-app-shell .main-header .system-header-search__input");
    if (!input) return undefined;
    const previousPlaceholder = input.placeholder;
    input.placeholder = schoolId ? "Search preparing stages..." : projectId ? "Search schools..." : "Search projects...";
    input.value = "";
    const onInput = event => setQuery(event.target.value || "");
    input.addEventListener("input", onInput);
    return () => {
      input.removeEventListener("input", onInput);
      input.placeholder = previousPlaceholder;
      input.value = "";
    };
  }, [projectId, schoolId]);
  const canCreate = featureAllowed(account, "preparing.create");
  const canManage = featureAllowed(account, "preparing.manage");
  const canStage = featureAllowed(account, "preparing.stage_update");
  const canClose = featureAllowed(account, "preparing.close");
  const canWarehouseReceive = featureAllowed(account, "preparing.warehouse_receive");
  const canWarehouseAllocate = featureAllowed(account, "preparing.warehouse_allocate");
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
  // Load read-only progress data for the four operational preparation stages.
  // No percentage is invented while a request is pending or has failed.
  useEffect(() => {
    if (!projectId || schoolId) { setProjectStageData(null); setProjectStageError(""); setProjectStageLoading(false); return; }
    let active = true;
    setProjectStageData(null); setProjectStageError(""); setProjectStageLoading(true);
    const suffix = `?projectId=${encodeURIComponent(projectId)}`;
    Promise.all([api(`/testing${suffix}`), api(`/warehouse${suffix}`), api(`/production${suffix}`)])
      .then(([testing, warehouse, production]) => {
        if (active) setProjectStageData({ testing, warehouse, production });
      }).catch(cause => { if (active) setProjectStageError(cause?.message || "Unable to load project progress."); })
      .finally(() => { if (active) setProjectStageLoading(false); });
    return () => { active = false; };
  }, [projectId, schoolId, projectSchools.length, projectStageRevision]);
  // These are real Users Center accounts with effective feature/page grants;
  // school beneficiaries must never be used as stage-user avatars.
  useEffect(() => {
    if (!projectId || schoolId) {
      setStepAccess(null); setStepAccessError(false); setStepAccessLoading(false);
      return;
    }
    const controller = new AbortController();
    setStepAccess(null); setStepAccessError(false); setStepAccessLoading(true);
    fetch("/next/api/projects-preparing/step-access", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.ok) throw new Error(json.error || "Access unavailable");
        return json.stages || {};
      })
      .then(users => { if (!controller.signal.aborted) setStepAccess(users); })
      .catch(() => { if (!controller.signal.aborted) setStepAccessError(true); })
      .finally(() => { if (!controller.signal.aborted) setStepAccessLoading(false); });
    return () => controller.abort();
  }, [projectId, schoolId, projectStageRevision]);
  const projectStageProgress = useMemo(() => projectStageData
    ? calculateProjectPreparationProgress({
      testing: projectStageData.testing, warehouse: projectStageData.warehouse, production: projectStageData.production })
    : null, [projectStageData]);
  const projectStepPercents = projectStageProgress?.stages ?? null;
  // Project Components is the Master BOM, not a preparation stage.
  const projectStepCards = [
    { key:"testing", icon:"shield", title:"Project Testing", subtitle:"01 · Components QC", detail:"Component testing and quality checks", open:()=>setShowProjectTesting(true) },
    { key:"warehouse", icon:"clipboard", title:"Warehouse Receiving", subtitle:"02 · Warehouse handover", detail:"Warehouse receiving and handover", open:()=>setShowWarehouse(true) },
    { key:"production", icon:"truck", title:"Production Receiving", subtitle:"03 · Production handover", detail:"Transfer tested stock into Production", open:()=>setShowProduction(true) },
    { key:"boxes", icon:"box", title:"Box Distribution", subtitle:"04 · Packing", detail:"Pack received units into project boxes", open:()=>setShowBoxDistribution(true) },
    { key:"cartons", icon:"folder", title:"Project Kit Cartons", subtitle:"05 · Carton preparation", detail:"Seal completed cartons and prepare allocation", open:()=>setShowProjectCartons(true) },
  ];
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
  // Match Proposals folders: open on click, actions on hold, right-click or keyboard.
  // Clearing the timer on movement avoids accidental menus while scrolling on touch devices.
  function cancelFolderHold() {
    if (longPressTimer.current !== null) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressStart.current = null;
  }
  function startFolderHold(event, key) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelFolderHold();
    suppressFolderClick.current = false;
    longPressStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressStart.current = null;
      suppressFolderClick.current = true;
      setFolderMenu(key);
    }, 550);
  }
  function moveFolderHold(event) {
    const start = longPressStart.current;
    if (start && start.pointerId === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) cancelFolderHold();
  }
  function folderContextMenu(event, key) {
    event.preventDefault();
    cancelFolderHold();
    suppressFolderClick.current = true;
    setFolderMenu(key);
  }
  function folderKeyDown(event, key) {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) folderContextMenu(event, key);
  }
  function openProjectFolder(id) { cancelFolderHold(); suppressFolderClick.current = false; setFolderMenu(""); setProjectId(id); setSchoolId(""); setWorkflowFilter("all"); setQuery(""); }
  function openSchoolFolder(id, view = "") {
    cancelFolderHold(); suppressFolderClick.current = false; setFolderMenu(""); setSchoolId(id); setQuery("");
    setShowComponents(view === "components"); setShowDelivery(view === "delivery");
    setShowTechnical(view === "technical"); setShowReconciliation(view === "returns"); setShowClosing(view === "closing"); setWorkflowFilter("all");
  }
  function renameProjectFolder(row) {
    cancelFolderHold(); suppressFolderClick.current = false; setFolderMenu("");
    setActionProjectId(row.id); setProjectName(row.name || ""); setSheet("rename_project");
  }
  function deleteProjectFolder(row) {
    cancelFolderHold(); suppressFolderClick.current = false; setFolderMenu("");
    setActionProjectId(row.id); setDeleteConfirmName(""); setSheet("delete_project");
  }
  useEffect(() => {
    if (!folderMenu) return;
    function closeOutside(event) { if (!event.target.closest?.(".pr-folder-card")) setFolderMenu(""); }
    function closeEscape(event) { if (event.key === "Escape") setFolderMenu(""); }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [folderMenu]);
  useEffect(() => () => { if (longPressTimer.current !== null) clearTimeout(longPressTimer.current); }, []);
  function openNewProject() { setProjectName(""); setProjectDescription(""); setProjectSourceId(""); setSheet("project"); }
  function openSchools() { setSelectedMembers([]); setMemberQuery(""); setSheet("schools"); }
  function openStage(stage) { const record = schoolStages.find(row => row.stage_key === stage.key); setStageKey(stage.key); setStageStatus(record?.status || "not_started"); setStageNotes(record?.notes || ""); setSheet("stage"); }
  function backToParent() {
    cancelFolderHold(); setFolderMenu("");
    if (school) { setSchoolId(""); setQuery(""); setShowComponents(false); setShowDelivery(false); setShowReconciliation(false); setShowTechnical(false); setShowClosing(false); return; }
    setProjectId(""); setQuery(""); setShowDashboard(false); setShowProjectCartons(false); setShowWarehouse(false); setShowProduction(false); setShowBoxDistribution(false); setShowProjectBOM(false);
  }
  const filteredMembers = asArray(data.members).filter(member => {
    const used = new Set(projectSchools.map(row => clean(row.beneficiary_id)));
    return !used.has(member.id) && `${member.name} ${member.school}`.toLowerCase().includes(memberQuery.toLowerCase());
  });
  const projectTabs = [
    { key: "all", label: "All Projects", count: totals.projects },
    { key: "active", label: "Active", count: projects.filter(row => { const summary=projectSummaries.get(row.id); return summary && summary.total > summary.closed; }).length },
    { key: "delivered", label: "Delivered", count: projects.filter(row => (projectSummaries.get(row.id)?.delivered || 0) > 0).length },
    { key: "closed", label: "Closed", count: projects.filter(row => { const summary=projectSummaries.get(row.id); return summary && summary.total > 0 && summary.closed === summary.total; }).length },
  ];
  const projectFiltered = projects.filter(row => {
    if (!`${row.name} ${row.description}`.toLowerCase().includes(query.toLowerCase())) return false;
    const summary = projectSummaries.get(row.id) || { total:0, closed:0, delivered:0 };
    if (projectFilter === "active") return summary.total > summary.closed;
    if (projectFilter === "delivered") return summary.delivered > 0;
    if (projectFilter === "closed") return summary.total > 0 && summary.closed === summary.total;
    return true;
  });
  const schoolFiltered = projectSchools.filter(row => `${row.beneficiary_name} ${row.school_label} ${row.proposal_name}`.toLowerCase().includes(query.toLowerCase()));
  const workflowTabs = [{ key:"all", label:"All stages", count:PREPARING_STAGES.length },
    { key:"operations", label:"Operations", count:PREPARING_STAGES.filter(stage=>stage.team === "operations").length },
    { key:"followup", label:"Technical follow-up", count:PREPARING_STAGES.filter(stage=>stage.team === "followup").length }];
  const visibleWorkflowStages = PREPARING_STAGES.map((stage, index)=>({stage,index})).filter(({stage}) =>
    (workflowFilter === "all" || stage.team === workflowFilter) &&
    `${stage.title} ${stage.team} ${stage.description || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const schoolPercent = progress ? Math.round(progress.completed * 100 / (progress.total || 1)) : 0;
  return <div className={`pr-root ${!project ? "pr-root--index" : school ? "pr-root--school" : "pr-root--project"}`}>
    <div className="pr-header">
      <div className="pr-headline">
        {project && <button type="button" className="pr-back" onClick={backToParent}><Ico name="back" size={18}/>{school ? project.name : "Projects"}</button>}
        <h1>{school ? school.beneficiary_name : project ? project.name : "Projects"}</h1>
      </div>
      <div className="pr-top-actions">
        {!project && canCreate && <button type="button" className="pr-primary pr-create-project" onClick={openNewProject}><Ico name="plus" size={18}/> New Project</button>}
        {project && !school && canManage && <button type="button" className="pr-primary" onClick={openSchools}><Ico name="plus" size={17}/> Add Schools</button>}
      </div>
    </div>
    {error && <div className="pr-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Ico name="close" size={16}/></button></div>}
    {!project && <div className="pr-index-controls">
      <div className="pr-project-tabs" role="group" aria-label="Filter project folders">
        {projectTabs.map(tab => <button key={tab.key} type="button" className={`pr-project-tab ${projectFilter === tab.key ? "is-active" : ""}`}
          aria-pressed={projectFilter === tab.key} onClick={() => setProjectFilter(tab.key)}>
          <span>{tab.label}</span><span className="pr-tab-count">{tab.count}</span>
        </button>)}
      </div>
    </div>}
    {project && !school && <section className="pr-summary-card pr-summary-card--project pr-summary-card--overview" aria-label="Project overview">
      <div className="pr-summary-lead pr-overview-lead">
        <span className="pr-overview-icon" aria-hidden="true"><Ico name="components" size={26}/></span>
        <div className="pr-overview-title"><strong>Project Overview</strong><span>Key project information and status.</span></div>
      </div>
      <div className="pr-summary-metrics">
        {[["Schools", projectSchools.length], ["Delivered", projectSummaries.get(project.id)?.delivered || 0], ["Closed", projectSummaries.get(project.id)?.closed || 0]].map(([name,count]) =>
          <div className="pr-summary-metric" key={name}><span className="pr-summary-metric-icon"><Ico name={name === "Schools" ? "school" : name === "Delivered" ? "truck" : "shield"} size={23}/></span><span className="pr-summary-metric-copy"><span>{name}</span><strong>{count}</strong></span></div>)}
      </div>
    </section>}
    {project && !school && <div className="pr-project-split" aria-label="Project components, schools and five preparation stages">
      <div className="pr-project-left-column">
        <button type="button" className="pr-project-components-card" onClick={()=>setShowProjectBOM(true)} aria-label="Open Project Components master bill of materials">
          <span className="pr-project-components-icon" aria-hidden="true"><Ico name="components" size={27}/></span>
          <span className="pr-project-components-copy"><strong>Project Components</strong><small>Master BOM · {project.source_proposal_name || "Custom project"}</small></span>
          <StepAccessAvatars access={stepAccess?.components} loading={stepAccessLoading} unavailable={stepAccessError}/>
          <span className="pr-project-components-arrow" aria-hidden="true"><Ico name="arrow" size={18}/></span>
        </button>
      <section className="pr-project-schools-panel" aria-label="Schools">
        <div className="pr-project-panel-heading pr-project-schools-heading">
          <div className="pr-project-panel-title"><h2>Schools</h2><span className="pr-section-count">{projectSchools.length} {projectSchools.length === 1 ? "school" : "schools"}</span></div>
          <div className="pr-project-schools-controls">
            <label className="pr-project-school-search"><Ico name="search" size={16}/><input type="search" aria-label="Search schools" placeholder="Search schools..." value={query} onChange={event=>setQuery(event.target.value)}/></label>
            <div className="pr-project-view-switch" role="group" aria-label="School folder view">
              <button type="button" aria-label="Grid view" aria-pressed={schoolView === "grid"} className={schoolView === "grid" ? "is-selected" : ""} onClick={()=>setSchoolView("grid")}>▦</button>
              <button type="button" aria-label="List view" aria-pressed={schoolView === "list"} className={schoolView === "list" ? "is-selected" : ""} onClick={()=>setSchoolView("list")}>☷</button>
            </div>
          </div>
        </div>
        <div className={`pr-folders pr-dashboard-schools ${schoolView === "list" ? "pr-dashboard-schools--list" : ""}`} aria-label="School folders">
          {schoolFiltered.map(row => {
            const rowProgress = schoolProgress(stages.filter(stage=>stage.school_id===row.id));
            const key = `school:${row.id}`;
            const menuOpen = folderMenu === key;
            return <article className={`pr-folder-card pr-folder-card--school ${menuOpen ? "is-menu-open" : ""}`} key={row.id}>
              <button type="button" className="pr-folder-main" onPointerDown={event=>startFolderHold(event,key)} onPointerMove={moveFolderHold}
                onPointerUp={cancelFolderHold} onPointerCancel={cancelFolderHold} onPointerLeave={cancelFolderHold}
                onContextMenu={event=>folderContextMenu(event,key)} onKeyDown={event=>folderKeyDown(event,key)}
                onClick={()=>{if(suppressFolderClick.current){suppressFolderClick.current=false;return;}openSchoolFolder(row.id);}}
                aria-label={`Open school ${row.beneficiary_name}. Press and hold for actions.`} aria-haspopup="menu" aria-expanded={menuOpen}>
                <span className="pr-folder-figure" aria-hidden="true"><span className="pr-folder-paper left"/><span className="pr-folder-paper middle"/><span className="pr-folder-paper right"/></span>
                <span className="pr-folder-copy"><strong>{row.beneficiary_name}</strong><em>{row.proposal_name}</em></span>
                <span className="pr-folder-foot"><Ico name="school" size={15}/>{rowProgress.completed} / {rowProgress.total} stages<span className="pr-folder-foot-date">{rowProgress.closed ? "Closed" : rowProgress.delivered ? "Delivered" : "Preparing"}</span></span>
              </button>
              <button type="button" className="pr-folder-menu-trigger" aria-label={`Actions for ${row.beneficiary_name}`} aria-haspopup="menu" aria-expanded={menuOpen}
                onClick={()=>{cancelFolderHold();suppressFolderClick.current=false;setFolderMenu(menuOpen ? "" : key);}}><Ico name="more" size={14}/></button>
              {menuOpen && <div className="pr-folder-menu" role="menu" aria-label={`${row.beneficiary_name} actions`}>
                <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id)}>Open School</button>
                <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"components")}>Components & QC</button>
                <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"delivery")}>Packing & Delivery</button>
                <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"technical")}>Technical Follow-up</button>
                <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"returns")}>Returns & Replacements</button>
                <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"closing")}>Final Closing</button>
              </div>}
            </article>;
          })}
          {canManage && <button type="button" className="pr-add-school-tile" onClick={openSchools}><span><Ico name="plus" size={28}/></span>Add School</button>}
          {!schoolFiltered.length && projectSchools.length > 0 && <div className="pr-dashboard-empty">No schools match your search.</div>}
          {!projectSchools.length && !canManage && <div className="pr-dashboard-empty">No schools assigned yet.</div>}
        </div>
      </section>
      </div>
      <section className="pr-project-steps-panel" aria-label="Project Steps">
        <div className="pr-project-panel-heading">
          <div className="pr-project-panel-title"><h2>Project Steps</h2><span className="pr-section-count">5 stages</span></div>
          <button type="button" className="pr-project-report-link" onClick={()=>setShowDashboard(true)} aria-label="Open Project Dashboard" title="Project Dashboard"><Ico name="chart" size={17}/> Reports</button>
        </div>
        <p className="pr-project-steps-subtitle">These five stages determine the overall project completion.</p>
        {projectStageError && <div className="pr-project-step-error" role="alert"><span>Progress unavailable: {projectStageError}</span><button type="button" onClick={()=>setProjectStageRevision(n=>n+1)}>Retry</button></div>}
        {projectStageLoading && <span className="pr-project-step-loading" role="status">Updating project stage progress…</span>}
        <ol className="pr-project-step-timeline">
          {projectStepCards.map((step,index) => {
            const value = projectStepPercents?.[index];
            const percent = value === null || value === undefined ? null : Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
            return <li key={step.key} className="pr-project-step-row">
              <span className="pr-project-step-index" aria-hidden="true">{index+1}</span>
              <button type="button" className="pr-project-step-card pr-project-step-card--kpi" onClick={step.open} aria-label={`Open ${step.title}${percent === null ? "" : `, ${percent}% complete`}`}>
                <span className="pr-step-kpi-top">
                  <span className="pr-step-kpi-stage-icon" aria-hidden="true"><Ico name={step.icon} size={19}/></span>
                  <span className="pr-step-kpi-title"><strong>{step.title}</strong><small>{step.subtitle}</small></span>
                  <StepAccessAvatars access={stepAccess?.[step.key]} loading={stepAccessLoading} unavailable={stepAccessError}/>
                  <span className="pr-step-kpi-arrow"><Ico name="arrow" size={17}/></span>
                </span>
                <strong className="pr-step-kpi-percent">{percent === null ? "—" : `${percent}%`}</strong>
                <span className="pr-step-kpi-track" role="progressbar" aria-label={`${step.title} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent === null ? undefined : percent} aria-valuetext={percent === null ? "Loading" : `${percent}%`}>
                  <span className="pr-step-kpi-fill" style={{ width: `${percent ?? 0}%` }}/>
                </span>
                <span className="pr-step-kpi-note">{percent === 100 ? "Stage completed" : step.detail}</span>
              </button>
            </li>;
          })}
        </ol>
      </section>
    </div>}
    {project && !school && showProjectBOM && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProjectBOM(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Project Components"><ProjectMasterComponents key={projectId} project={project} proposals={data.proposals} allowed={canManage} request={api} onClose={()=>{setShowProjectBOM(false);setProjectStageRevision(n=>n+1);reload().catch(err=>setError(err.message));}}/></section></div>}
    {project && !school && showWarehouse && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowWarehouse(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Project Warehouse Receiving"><ProjectWarehouseReceiving key={projectId} projectId={projectId} projectName={project.name} hasProjectProposal={!!project.source_proposal_id} canReceive={canWarehouseReceive} canAllocate={canWarehouseAllocate} request={api} onClose={()=>{setShowWarehouse(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showProjectTesting && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProjectTesting(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Project Testing"><ProjectTesting key={projectId} projectId={projectId} projectName={project.name} canTest={canStage} request={api} onClose={()=>{setShowProjectTesting(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showProduction && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProduction(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Production Receiving"><ProjectProductionReceiving key={projectId} projectId={projectId} projectName={project.name} stageRecords={stages} allowed={canStage} cartonsAllowed={canStage} request={api} onClose={()=>{setShowProduction(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showBoxDistribution && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowBoxDistribution(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Box Distribution"><ProjectProductionReceiving key={`${projectId}-boxes`} view="boxes" projectId={projectId} projectName={project.name} stageRecords={stages} allowed={canStage} cartonsAllowed={canStage} request={api} onClose={()=>{setShowBoxDistribution(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showProjectCartons && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProjectCartons(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Project Kit Cartons"><ProjectKitCartons key={projectId} projectId={projectId} projectName={project?.name||""} stageRecords={stages} allowed={canStage} request={api} onClose={()=>{setShowProjectCartons(false);setProjectStageRevision(n=>n+1);reload().catch(err=>setError(err.message));}}/></section></div>}
    {project && !school && showDashboard && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowDashboard(false);}}><section className="pr-components-sheet pr-report-sheet" role="dialog" aria-modal="true" aria-label="Master project dashboard"><ProjectDashboard key={projectId} projectId={projectId} request={api} onClose={()=>setShowDashboard(false)} onOpenSchool={id=>{setShowDashboard(false);setSchoolId(id);setWorkflowFilter("all");setShowComponents(false);setShowDelivery(false);setShowReconciliation(false);setShowTechnical(false);setShowClosing(false);}}/></section></div>}
    {school ? <>
      <section className="pr-summary-card pr-summary-card--school" aria-label="School progress overview">
        <div className="pr-summary-lead">
          <div className="pr-summary-ring" style={{"--pr-percent": `${schoolPercent}%`}} aria-label={`${schoolPercent}% school progress`}><span>{schoolPercent}%</span></div>
          <div className="pr-summary-title"><span className="pr-summary-overline">SCHOOL READINESS</span><strong>{progress.completed} <span>/ {progress.total} stages</span></strong><Meter value={progress.completed} max={progress.total}/></div>
        </div>
        <div className="pr-summary-school-details">
          <div className="pr-summary-source"><span>Linked proposal</span><strong title={school.proposal_name}>{school.proposal_name}</strong></div>
          <div className="pr-summary-milestones"><span><Ico name="truck" size={16}/> Delivery <b className={progress.delivered ? "is-done" : ""}>{progress.delivered ? "Delivered" : "Pending"}</b></span>
            <span><Ico name="shield" size={16}/> Closing <b className={progress.closed ? "is-done" : ""}>{progress.closed ? "Closed" : "Open"}</b></span></div>
        </div>
      </section>
      <div className="pr-section-heading pr-workspace-heading"><h2>Workspace</h2><span className="pr-section-count">{tools.length} tools</span></div>
      <div className="pr-tool-grid pr-school-tools" aria-label="School workspaces">{tools.map((tool,index) => <button className="pr-tool" type="button" key={tool.key} onClick={tool.open}>
        <span className="pr-tool-icon"><Ico name={tool.icon} size={21}/></span><span className="pr-tool-label"><strong>{tool.name}</strong><small>{String(index + 1).padStart(2,"0")} · Workspace</small></span><span className="pr-tool-arrow"><Ico name="arrow" size={18}/></span>
      </button>)}</div>
      {showComponents && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowComponents(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Components and QC"><ComponentsManifest key={school.id} schoolId={school.id} proposalName={school.proposal_name} allowed={canStage} request={api} onClose={()=>setShowComponents(false)}/></section></div>}
      {showDelivery && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowDelivery(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Packing and delivery"><PackingDelivery key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} proposalName={school.proposal_name} stageStatuses={schoolStages} allowed={canStage} request={api} onClose={()=>{setShowDelivery(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      {showTechnical && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowTechnical(false);setShowClosing(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Technical installation follow-up"><TechnicalFollowUp key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} allowed={canStage} request={api} onClose={()=>{setShowTechnical(false);setShowClosing(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      {showReconciliation && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowReconciliation(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Returns and replacements"><ReturnsReplacements key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} allowed={canStage} request={api} onOpenDelivery={()=>{setShowReconciliation(false);setShowDelivery(true);}} onClose={()=>{setShowReconciliation(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      {showClosing && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowClosing(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Final school closing"><FinalSchoolClosing key={school.id} schoolId={school.id} schoolName={school.beneficiary_name} stageStatuses={schoolStages} canEdit={canStage} canApprove={canClose} request={api} onClose={()=>{setShowClosing(false);reload().catch(err=>setError(err.message));}}/></section></div>}
      <div className="pr-workflow-top">
        <div className="pr-section-heading pr-workflow-heading"><h2>Preparing Workflow</h2><span className="pr-section-count">{progress.completed} / {progress.total} complete</span></div>
        <div className="pr-workflow-tabs" role="group" aria-label="Filter workflow stages">{workflowTabs.map(tab =>
          <button type="button" key={tab.key} className={`pr-workflow-tab ${workflowFilter === tab.key ? "is-active" : ""}`}
            aria-pressed={workflowFilter === tab.key} onClick={()=>setWorkflowFilter(tab.key)}>{tab.label}<span>{tab.count}</span></button>)}</div>
      </div>
      <div className="pr-stage-list">{visibleWorkflowStages.map(({stage,index}) => {
        const entry = schoolStages.find(row => row.stage_key === stage.key);
        const status = entry?.status || "not_started";
        return <button type="button" key={stage.key} className={`pr-stage ${status}`} onClick={() => openStage(stage)}>
          <span className="pr-stage-number">{status === "completed" ? <Ico name="check" size={19}/> : String(index + 1).padStart(2,"0")}</span>
          <span className="pr-stage-body"><strong>{stage.title}</strong><small>{stage.team === "operations" ? "Operations execution" : "Technical coordination"}</small>{entry?.notes && <em>{entry.notes}</em>}</span>
          <span className={`pr-status ${status}`}>{stateLabels[status]}</span><span className="pr-stage-arrow"><Ico name="arrow" size={18}/></span>
        </button>;
      })}</div>
    </> : !project ? <>
      <div className="pr-section-bar"><div><h2>{project ? "Schools" : "Project Folders"}</h2>{project && <span className="pr-section-count">{projectSchools.length} schools</span>}</div>{project ? null : <span className="pr-visible-count">{projectFiltered.length} {projectFiltered.length === 1 ? "folder" : "folders"}</span>}</div>
      <div className="pr-folders" aria-label={project ? "School folders" : "Project folders"}>
        {!project ? projectFiltered.map(row => {
          const summary = projectSummaries.get(row.id) || { total:0,closed:0,delivered:0 };
          const key = `project:${row.id}`;
          const menuOpen = folderMenu === key;
          return <article className={`pr-folder-card ${menuOpen ? "is-menu-open" : ""}`} key={row.id}>
            <button type="button" className="pr-folder-main" onPointerDown={event=>{if(canManage)startFolderHold(event,key);}} onPointerMove={moveFolderHold}
              onPointerUp={cancelFolderHold} onPointerCancel={cancelFolderHold} onPointerLeave={cancelFolderHold}
              onContextMenu={event=>{if(canManage)folderContextMenu(event,key);}} onKeyDown={event=>{if(canManage)folderKeyDown(event,key);}}
              onClick={()=>{ if(suppressFolderClick.current){suppressFolderClick.current=false;return;}openProjectFolder(row.id); }}
              aria-label={`Open project ${row.name}${canManage ? ". Press and hold for actions." : ""}`} aria-haspopup={canManage ? "menu" : undefined} aria-expanded={canManage ? menuOpen : undefined}>
              <span className="pr-folder-figure" aria-hidden="true"><span className="pr-folder-paper left"/><span className="pr-folder-paper middle"/><span className="pr-folder-paper right"/></span>
              <span className="pr-folder-copy"><strong>{row.name}</strong><em>{summary.closed} of {summary.total} closed</em></span>
              <span className="pr-folder-foot"><Ico name="folder" size={11}/>{summary.total} {summary.total === 1 ? "school" : "schools"}</span>
            </button>
            {canManage && <button type="button" className="pr-folder-menu-trigger" aria-label={`Actions for ${row.name}`} aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={()=>{cancelFolderHold();suppressFolderClick.current=false;setFolderMenu(menuOpen ? "" : key);}}><Ico name="more" size={14}/></button>}
            {menuOpen && canManage && <div className="pr-folder-menu" role="menu" aria-label={`${row.name} actions`}>
              <button type="button" role="menuitem" onClick={()=>renameProjectFolder(row)}><Ico name="edit" size={15}/> Rename</button>
              <button type="button" role="menuitem" className="pr-folder-menu-danger" onClick={()=>deleteProjectFolder(row)}><Ico name="trash" size={15}/> Delete</button>
            </div>}
          </article>;
        }) : schoolFiltered.map(row => {
          const progress = schoolProgress(stages.filter(stage=>stage.school_id===row.id));
          const key = `school:${row.id}`;
          const menuOpen = folderMenu === key;
          return <article className={`pr-folder-card pr-folder-card--school ${menuOpen ? "is-menu-open" : ""}`} key={row.id}>
            <button type="button" className="pr-folder-main" onPointerDown={event=>startFolderHold(event,key)} onPointerMove={moveFolderHold}
              onPointerUp={cancelFolderHold} onPointerCancel={cancelFolderHold} onPointerLeave={cancelFolderHold}
              onContextMenu={event=>folderContextMenu(event,key)} onKeyDown={event=>folderKeyDown(event,key)}
              onClick={()=>{ if(suppressFolderClick.current){suppressFolderClick.current=false;return;}openSchoolFolder(row.id); }}
              aria-label={`Open school ${row.beneficiary_name}. Press and hold for actions.`} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="pr-folder-figure" aria-hidden="true"><span className="pr-folder-paper left"/><span className="pr-folder-paper middle"/><span className="pr-folder-paper right"/></span>
              <span className="pr-folder-copy"><strong>{row.beneficiary_name}</strong><em>{row.proposal_name}</em></span>
              <span className="pr-folder-foot"><Ico name="school" size={15}/>{progress.completed} / {progress.total} stages <span className="pr-folder-foot-date">{progress.closed ? "Closed" : progress.delivered ? "Delivered" : "Preparing"}</span></span>
            </button>
            <button type="button" className="pr-folder-menu-trigger" aria-label={`Actions for ${row.beneficiary_name}`} aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={()=>{cancelFolderHold();suppressFolderClick.current=false;setFolderMenu(menuOpen ? "" : key);}}><Ico name="more" size={14}/></button>
            {menuOpen && <div className="pr-folder-menu" role="menu" aria-label={`${row.beneficiary_name} actions`}>
              <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id)}>Open School</button>
              <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"components")}>Components & QC</button>
              <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"delivery")}>Packing & Delivery</button>
              <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"technical")}>Technical Follow-up</button>
              <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"returns")}>Returns & Replacements</button>
              <button type="button" role="menuitem" onClick={()=>openSchoolFolder(row.id,"closing")}>Final Closing</button>
            </div>}
          </article>;
        })}
        {project && !projectSchools.length && <div className="pr-empty"><Ico name="school" size={36}/><h3>No schools assigned</h3>{canManage && <button className="pr-primary" onClick={openSchools}>Add Schools</button>}</div>}
        {!project && !projectFiltered.length && <div className="pr-empty"><Ico name="folder" size={36}/><h3>{projects.length ? "No matching projects" : "No project folders yet"}</h3>{canCreate && !projects.length && <button className="pr-primary" onClick={openNewProject}>Create first project</button>}</div>}
      </div>
    </> : null}
    {sheet === "project" && <Sheet title="New Project" onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button className="pr-primary" disabled={busy || projectName.trim().length < 2 || !projectSourceId} onClick={()=>save(async()=>api("", "POST", {action:"create_project", name:projectName, description:projectDescription, proposalId:projectSourceId}))}>{busy ? "Saving…" : "Save Project"}</button></> }>
      <label className="pr-field">Project name<input autoFocus maxLength={160} value={projectName} placeholder="30 June Schools" onChange={event=>setProjectName(event.target.value)}/></label>
      <label className="pr-field">Source Proposal<PreparingSelect required value={projectSourceId} onChange={event=>setProjectSourceId(event.target.value)}><option value="">Select project Proposal…</option>{asArray(data.proposals).map(row=><option key={row.id} value={row.id}>{row.name} ({row.itemsCount} components)</option>)}</PreparingSelect><span className="pr-form-meta">The selected Proposal creates the project's component list and warehouse required quantities immediately.</span></label>
      <label className="pr-field">Description<textarea rows={4} maxLength={1000} value={projectDescription} placeholder="STEAM Labs · 11 schools" onChange={event=>setProjectDescription(event.target.value)}/></label>
    </Sheet>}
    {sheet === "rename_project" && <Sheet title="Rename Project" onClose={()=>setSheet("")}
      footer={<><button type="button" className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button type="button" className="pr-primary" disabled={busy || projectName.trim().length < 2 || projectName.trim().length > 160 || projectName.trim() === projects.find(row=>row.id===actionProjectId)?.name} onClick={()=>save(async()=>api("", "PATCH", {action:"rename_project",projectId:actionProjectId,name:projectName,expectedName:projects.find(row=>row.id===actionProjectId)?.name}))}>{busy ? "Renaming…" : "Save Name"}</button></>}>
      <label className="pr-field">Project name<input autoFocus maxLength={160} value={projectName} onChange={event=>setProjectName(event.target.value)}/></label>
    </Sheet>}
    {sheet === "delete_project" && <Sheet title="Delete Project" onClose={()=>setSheet("")}
      footer={<><button type="button" className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button type="button" className="pr-primary pr-danger-button" disabled={busy || !actionProjectId || deleteConfirmName !== (projects.find(row=>row.id===actionProjectId)?.name || "")} onClick={()=>save(async()=>{await api("", "DELETE", {action:"delete_project",projectId:actionProjectId,confirmName:deleteConfirmName});setActionProjectId("");setDeleteConfirmName("");})}>{busy ? "Deleting…" : "Delete Project"}</button></>}>
      <div className="pr-delete-notice" role="alert"><Ico name="trash" size={20}/><div><strong>Remove this project from your workspace?</strong><p>Its folder will disappear from Projects. Schools, warehouse receipts, allocations, deliveries, and audit records will be preserved for recovery and compliance.</p></div></div>
      <label className="pr-field">Type the project name to confirm: <strong>{projects.find(row=>row.id===actionProjectId)?.name || ""}</strong><input autoComplete="off" autoFocus value={deleteConfirmName} onChange={event=>setDeleteConfirmName(event.target.value)} placeholder="Project name"/></label>
    </Sheet>}
    {sheet === "schools" && <Sheet title="Add Beneficiaries" onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button className="pr-primary" disabled={busy || !project?.source_proposal_id || !selectedMembers.length} onClick={()=>save(async()=>api("","POST",{action:"add_schools",projectId,beneficiaryIds:selectedMembers}))}>{busy ? "Adding…" : `Add ${selectedMembers.length} Schools`}</button></>}>
      {!project?.source_proposal_id && <p className="pr-hint" role="alert">Add a source Proposal to this project in Project Components before adding schools.</p>}
      <label className="pr-field">Beneficiary users / schools<input value={memberQuery} placeholder="Search beneficiaries…" onChange={event=>setMemberQuery(event.target.value)}/></label>
      <div className="pr-choose-tools"><span>{selectedMembers.length} selected</span><button type="button" className="pr-link" onClick={()=>setSelectedMembers([])}>Clear selection</button></div>
      <div className="pr-member-list">{filteredMembers.map(member=><label className="pr-member" key={member.id}><input type="checkbox" checked={selectedMembers.includes(member.id)} onChange={event=>setSelectedMembers(previous=>event.target.checked ? [...previous,member.id] : previous.filter(id=>id!==member.id))}/><span><strong>{member.name}</strong>{member.school && <small>{member.school}</small>}</span></label>)}{!filteredMembers.length && <p className="pr-muted">No available users match the search.</p>}</div>

    </Sheet>}
    {sheet === "stage" && currentStage && <Sheet title={currentStage.title} onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button>{canStage && currentStage.key !== "final_closing" && <button className="pr-primary" disabled={busy} onClick={()=>save(async()=>api("/stages","PATCH",{schoolId,stageKey,status:stageStatus,notes:stageNotes}))}>{busy ? "Saving…" : "Save Status"}</button>}</>}>
      <label className="pr-field">Stage status<PreparingSelect value={stageStatus} disabled={!canStage || currentStage.key === "final_closing"} onChange={event=>setStageStatus(event.target.value)}>{PREPARING_STATES.map(status=><option key={status} value={status} disabled={currentStage.key === "final_closing" || (status === "completed" && !canCompleteStage(currentStage.key, schoolStages))}>{stateLabels[status]}</option>)}</PreparingSelect></label>
      {!canCompleteStage(currentStage.key, schoolStages) && <p className="pr-hint">Previous stages must be completed before this stage can be marked completed.</p>}
      {currentStage.key === "final_closing" && <p className="pr-hint">Use Open Closing to verify the checklist, approve and close, or reopen. Stage status is read-only here.</p>}
      {["installation","testing"].includes(currentStage.key) && <p className="pr-hint">Use Open Technical to complete the technical checkpoints, resolve issues, and record acceptance before marking this stage completed.</p>}
      <label className="pr-field">Notes / reference<textarea disabled={!canStage || currentStage.key === "final_closing"} maxLength={2000} rows={5} placeholder="Enter handover number, issues, or technical follow-up reference…" value={stageNotes} onChange={event=>setStageNotes(event.target.value)} /></label>
      {stageRow?.updated_at && <span className="pr-form-meta">Updated {fmtDate(stageRow.updated_at)}</span>}
    </Sheet>}
  </div>;
}

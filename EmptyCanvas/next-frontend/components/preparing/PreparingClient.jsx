"use client";

import PreparingSelect from "./PreparingSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { featureAllowed } from "../../lib/feature-permissions-registry";
import { preparingStageAllowed, preparingStageReadable, preparingStagesGranular, preparingTabEditAllowed } from "../../lib/preparing-stage-access";
import { PREPARING_EDIT_TAB_LABELS } from "../../lib/preparing-tab-permissions.mjs";
import ComponentsManifest from "./ComponentsManifest";
import PackingDelivery from "./PackingDelivery";
import ReturnsReplacements from "./ReturnsReplacements";
import TechnicalFollowUp from "./TechnicalFollowUp";
import FinalSchoolClosing from "./FinalSchoolClosing";
import ProjectDashboard from "./ProjectDashboard";
import ProjectKitCartons from "./SchoolKitCartons";
import ProjectWarehouseReceiving from "./ProjectWarehouseReceiving";
import ProjectMasterComponents from "./ProjectMasterComponents";
import ProjectStageClosure from "./ProjectStageClosure";
import ProjectTesting from "./ProjectTesting";
import ProjectProductionIntake from "./ProjectProductionIntake";
import ProjectProductionReceiving from "./ProjectProductionReceiving";
import { PREPARING_STAGES, PREPARING_STATES, canCompleteStage, schoolProgress } from "../../lib/preparing-workflow";

const clean = value => String(value ?? "").trim();
const asArray = value => Array.isArray(value) ? value : [];
const EMPTY_DATA = { projects: [], schools: [], stages: [], proposals: [], members: [] };
const stateLabels = { not_started: "Not started", in_progress: "In progress", blocked: "Blocked", completed: "Completed" };
const fmtDate = value => { try { return value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; } catch { return "—"; } };

function Ico({ name, size = 20 }) {
  const paths = {
    folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M3 12h18"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    flask: <><path d="M9 3h6M10 3v6l-5.2 9a2 2 0 0 0 1.8 3h10.8a2 2 0 0 0 1.8-3L14 9V3"/><path d="M8 15h8"/></>,
    warehouse: <><path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M7 21v-8h10v8M7 16h10"/></>,
    package: <><path d="m12 2-9 5 9 5 9-5-9-5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/></>,
    packageCheck: <><path d="m3 7 9-5 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10"/><path d="m7.5 11.5 1.5 1.5 2.6-2.6"/></>,
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
function Sheet({ title, onClose, children, footer, className = "", icon, topBadgeIcon }) {
  return <div className="pr-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`pr-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      {topBadgeIcon && <span className="pr-sheet-floating-badge" aria-hidden="true"><Ico name={topBadgeIcon} size={38}/></span>}
      <header className="pr-sheet-head"><div className={icon ? "pr-sheet-title-with-icon" : undefined}>{icon && <span className="pr-sheet-title-icon"><Ico name={icon} size={21}/></span>}<h2>{title}</h2></div><button type="button" className="pr-icon" onClick={onClose} aria-label="Close"><Ico name="close"/></button></header>
      <div className="pr-sheet-body">{children}</div>{footer && <footer className="pr-sheet-foot">{footer}</footer>}
    </section>
  </div>;
}


// Search and multi-select live inside the expanded dropdown, not in a separate field.
function SchoolPicker({ members, selected, onChange, disabled, label }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef(null);
  const trigger = useRef(null);
  const search = useRef(null);
  const chosen = members.filter(member => selected.includes(member.id));
  const filtered = members.filter(member => `${clean(member.name)} ${clean(member.school)}`.toLowerCase().includes(query.trim().toLowerCase()));
  function close(restoreFocus = false) {
    setOpen(false); setQuery("");
    if (restoreFocus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function toggle(id) {
    onChange(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
  }
  return <div className="pr-school-picker" ref={root} onKeyDown={event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(true); }
  }}>
    <label className="pr-school-picker-label" htmlFor="pr-school-picker-trigger">{label}</label>
    <button type="button" id="pr-school-picker-trigger" ref={trigger} className={`pr-school-picker-trigger ${open ? "is-open" : ""}`} aria-expanded={open} aria-controls={open ? "pr-school-picker-menu" : undefined} disabled={disabled} onClick={()=>open ? close() : setOpen(true)}>
      <span className="pr-school-picker-icon"><Ico name="school" size={19}/></span>
      <span className="pr-school-picker-trigger-copy"><strong>{chosen.length ? `${chosen.length} ${chosen.length === 1 ? "school" : "schools"} selected` : "Select schools"}</strong><small>{members.length} available</small></span>
      <span className="pr-school-picker-chevron"><Ico name="arrow" size={17}/></span>
    </button>
    {open && <div className="pr-school-picker-menu" id="pr-school-picker-menu">
      <div className="pr-school-picker-search"><Ico name="search" size={18}/><input ref={search} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search schools…" aria-label="Search schools" disabled={disabled} autoComplete="off"/>{query && <button type="button" disabled={disabled} aria-label="Clear search" onClick={()=>{setQuery("");search.current?.focus();}}><Ico name="close" size={16}/></button>}</div>
      <div className="pr-school-picker-results" role="group" aria-label="Available schools">
        {filtered.map(member => <label key={member.id} className={`pr-school-picker-option ${selected.includes(member.id) ? "is-selected" : ""}`}>
          <span className="pr-school-option-icon"><Ico name="school" size={17}/></span>
          <span className="pr-school-option-copy"><strong>{member.name}</strong>{member.school && <small>{member.school}</small>}</span>
          <input type="checkbox" checked={selected.includes(member.id)} disabled={disabled} onChange={()=>toggle(member.id)} aria-label={`Select ${member.name}${member.school ? `, ${member.school}` : ""}`}/><span className="pr-school-option-check" aria-hidden="true"><Ico name="check" size={15}/></span>
        </label>)}
        {!filtered.length && <div className="pr-school-picker-empty"><Ico name="search" size={23}/><strong>{members.length ? "No matching schools" : "No available schools"}</strong><small>{members.length ? "Try another search." : "All eligible users may already be added."}</small></div>}
      </div>
      <div className="pr-school-picker-menu-foot"><span>{filtered.length} {filtered.length === 1 ? "result" : "results"}</span><button type="button" onClick={()=>close(true)}>Done <Ico name="check" size={14}/></button></div>
    </div>}
    {chosen.length > 0 && <section className="pr-school-selection" aria-label="Selected schools">
      <div className="pr-school-selection-head"><strong>Selected schools <span>{chosen.length}</span></strong><button type="button" disabled={disabled} onClick={()=>onChange([])}>Clear all</button></div>
      <div className="pr-school-selection-chips">{chosen.map(member=><button type="button" key={member.id} className="pr-school-selection-chip" disabled={disabled} onClick={()=>toggle(member.id)} aria-label={`Remove ${member.name}`}><span>{member.name}</span><Ico name="close" size={14}/></button>)}</div>
    </section>}
  </div>;
}

// Display the active folder path in the existing shared AppShell title.
// Portal keeps the shared header unchanged for other ERP pages and avoids a
// second, oversized project title inside this workspace.
function ProjectHeaderPath({ project, school, onProjects, onProject }) {
  const [titleContainer, setTitleContainer] = useState(null);
  useEffect(() => {
    const node = document.querySelector(".classic-app-shell .main-header .dash-title");
    setTitleContainer(node);
  }, []);
  if (!project || !titleContainer) return null;
  return createPortal(
    <nav className="pr-header-path pr-header-path--chevrons" aria-label="Project folder path">
      <button type="button" className="pr-header-path-segment pr-header-path-root" onClick={onProjects} title="All projects">
        <Ico name="folder" size={17}/><span className="pr-header-path-label">Projects Preparing</span>
      </button>
      {school ? (
        <button type="button" className="pr-header-path-segment pr-header-path-project" onClick={onProject} title={`Back to ${project.name}`}>
          <Ico name="layers" size={17}/><span className="pr-header-path-label">{project.name}</span>
        </button>
      ) : (
        <span className="pr-header-path-segment pr-header-path-current" title={project.name} aria-current="page">
          <Ico name="layers" size={17}/><span className="pr-header-path-label">{project.name}</span>
        </span>
      )}
      {school && <span className="pr-header-path-segment pr-header-path-current" title={school.beneficiary_name} aria-current="page">
        <Ico name="school" size={17}/><span className="pr-header-path-label">{school.beneficiary_name}</span>
      </span>}
    </nav>,
    titleContainer
  );
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
  const [projectTab, setProjectTab] = useState("overview");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [actionProjectId, setActionProjectId] = useState("");
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
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
  const [showProjectCartons, setShowProjectCartons] = useState(false);
  const [showWarehouse, setShowWarehouse] = useState(false);
  const [showIntake,setShowIntake]=useState(false);
  const [showProjectTesting, setShowProjectTesting] = useState(false);
  const [showProduction, setShowProduction] = useState(false);
  const [showBoxDistribution, setShowBoxDistribution] = useState(false);
  const [projectSourceId, setProjectSourceId] = useState("");
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
    input.placeholder = schoolId ? "Search preparing stages..." : projectId ? projectTab === "schools" ? "Search schools..." : "Search preparing..." : "Search projects...";
    input.value = "";
    const onInput = event => setQuery(event.target.value || "");
    input.addEventListener("input", onInput);
    return () => {
      input.removeEventListener("input", onInput);
      input.placeholder = previousPlaceholder;
      input.value = "";
    };
  }, [projectId, schoolId, projectTab]);
  const canCreate = featureAllowed(account, "preparing.create");
  const canManage = featureAllowed(account, "preparing.manage");
  const canStage = featureAllowed(account, "preparing.stage_update");
  const canClose = featureAllowed(account, "preparing.close");
  const canWarehouseReceive = featureAllowed(account, "preparing.warehouse_receive");
  const canWarehouseAllocate = featureAllowed(account, "preparing.warehouse_allocate");
  const stageGranular = preparingStagesGranular(account);
  const stagePermissions = Object.fromEntries(["intake", "testing", "warehouse", "production", "boxes", "cartons"].map(key => [key, preparingStageAllowed(account, key)]));
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
  // Load read-only progress data for the six operational preparation stages.
  // No percentage is invented while a request is pending or has failed.
  useEffect(() => {
    if (!projectId || schoolId) { setProjectStageData(null); setProjectStageError(""); setProjectStageLoading(false); return; }
    let active = true;
    setProjectStageData(null); setProjectStageError(""); setProjectStageLoading(true);
    const suffix = `?projectId=${encodeURIComponent(projectId)}`;
    api(`/progress${suffix}`)
      .then(({ progress, closures }) => {
        if (active) setProjectStageData({ ...progress, closures });
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
  const projectStageProgress = projectStageData;
  const projectStepPercents = projectStageProgress?.stages ?? null;
  const overallPercent = projectStageProgress?.overall ?? null;
  // Project Components is the Master BOM, not a preparation stage.
  const editTabs = stage => Object.fromEntries(
    Object.keys(PREPARING_EDIT_TAB_LABELS[stage]||{}).map(tab=>[tab,preparingTabEditAllowed(account,stage,tab)])
  );
  const projectStepCards = [
    { key:"intake", icon:"truck", title:"Production Receiving", subtitle:"01 · Component intake", detail:"Receive components before testing", open:()=>{if(preparingStageReadable(account, "intake"))setShowIntake(true);} },
    { key:"testing", icon:"flask", title:"Project Testing", subtitle:"02 · Components QC", detail:"Component testing and quality checks", open:()=>{if(preparingStageReadable(account, "testing"))setShowProjectTesting(true);} },
    { key:"warehouse", icon:"warehouse", title:"Warehouse Return", subtitle:"03 · Return tested components", detail:"Return tested components to the warehouse", open:()=>{if(preparingStageReadable(account, "warehouse"))setShowWarehouse(true);} },
    { key:"production", icon:"truck", title:"Operations Receiving", subtitle:"04 · Operations handover", detail:"Transfer warehouse stock into Operations", open:()=>{if(preparingStageReadable(account, "production"))setShowProduction(true);} },
    { key:"boxes", icon:"package", title:"Box Distribution", subtitle:"05 · Packing", detail:"Pack received units into project boxes", open:()=>{if(preparingStageReadable(account, "boxes"))setShowBoxDistribution(true);} },
    { key:"cartons", icon:"packageCheck", title:"Project Kit Cartons", subtitle:"06 · Carton preparation", detail:"Seal completed cartons and prepare allocation", open:()=>{if(preparingStageReadable(account, "cartons"))setShowProjectCartons(true);} },
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
    else if (event.key === "Enter" || event.key === " ") suppressFolderClick.current = false;
  }
  function openProjectFolder(id) { cancelFolderHold(); suppressFolderClick.current = false; setFolderMenu(""); setProjectId(id); setSchoolId(""); setProjectTab("overview"); setWorkflowFilter("all"); setQuery(""); }
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
  function switchProjectTab(nextTab) { setProjectTab(nextTab); setQuery(""); setFolderMenu(""); }
  function onProjectTabKeyDown(event, currentKey) {
    const keys = ["overview", "stages", "components", "schools"];
    let next = -1;
    if (event.key === "ArrowRight") next = (keys.indexOf(currentKey) + 1) % keys.length;
    if (event.key === "ArrowLeft") next = (keys.indexOf(currentKey) + keys.length - 1) % keys.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = keys.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const nextKey = keys[next];
    switchProjectTab(nextKey);
    document.getElementById(`pr-detail-tab-${nextKey}`)?.focus();
  }
  function openNewProject() { setProjectName(""); setProjectDescription(""); setProjectSourceId(""); setSheet("project"); }
  function openSchools() { setSelectedMembers([]); setError(""); setSheet("schools"); }
  function openStage(stage) { const record = schoolStages.find(row => row.stage_key === stage.key); setStageKey(stage.key); setStageStatus(record?.status || "not_started"); setStageNotes(record?.notes || ""); setSheet("stage"); }
  function goToProjectsIndex() {
    cancelFolderHold(); setFolderMenu("");
    setSchoolId(""); setProjectId(""); setProjectTab("overview"); setQuery("");
    setShowComponents(false); setShowDelivery(false); setShowReconciliation(false);
    setShowTechnical(false); setShowClosing(false);
    setShowProjectCartons(false); setShowWarehouse(false); setShowProjectTesting(false); setShowIntake(false);
    setShowProduction(false); setShowBoxDistribution(false);
  }
  function backToParent() {
    cancelFolderHold(); setFolderMenu("");
    if (school) { setSchoolId(""); setProjectTab("schools"); setQuery(""); setShowComponents(false); setShowDelivery(false); setShowReconciliation(false); setShowTechnical(false); setShowClosing(false); return; }
    setShowIntake(false); setProjectId(""); setProjectTab("overview"); setQuery(""); setShowProjectCartons(false); setShowWarehouse(false); setShowProduction(false); setShowBoxDistribution(false);
  }
  const usedBeneficiaryIds = new Set(projectSchools.map(row => clean(row.beneficiary_id)));
  const availableMembers = asArray(data.members).filter(member => !usedBeneficiaryIds.has(clean(member.id)));
  const projectTabs = [
    { key: "all", label: "All Projects", icon: "folder", count: totals.projects },
    { key: "active", label: "Active", icon: "play", count: projects.filter(row => { const summary=projectSummaries.get(row.id); return summary && summary.total > summary.closed; }).length },
    { key: "delivered", label: "Delivered", icon: "truck", count: projects.filter(row => (projectSummaries.get(row.id)?.delivered || 0) > 0).length },
    { key: "closed", label: "Closed", icon: "check", count: projects.filter(row => { const summary=projectSummaries.get(row.id); return summary && summary.total > 0 && summary.closed === summary.total; }).length },
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
    <ProjectHeaderPath project={project} school={school} onProjects={goToProjectsIndex} onProject={backToParent}/>
    {error && <div className="pr-alert" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Ico name="close" size={16}/></button></div>}
    {!project && <>
      <section className="pr-index-stats" aria-label="Project status overview">
        {[
          { key:"all", label:"Total Projects", icon:"folder", count:projectTabs[0].count },
          { key:"active", label:"Active", icon:"play", count:projectTabs[1].count },
          { key:"delivered", label:"Delivered", icon:"truck", count:projectTabs[2].count },
          { key:"closed", label:"Closed", icon:"check", count:projectTabs[3].count },
        ].map(stat => <button key={stat.key} type="button" className={`pr-index-stat pr-index-stat--${stat.key}`}
            onClick={()=>setProjectFilter(stat.key)} aria-pressed={projectFilter === stat.key} aria-label={`Show ${stat.label.toLowerCase()}: ${stat.count} projects`}>
          <span className="pr-index-stat-icon" aria-hidden="true"><Ico name={stat.icon} size={30}/></span>
          <span className="pr-index-stat-copy"><span>{stat.label}</span><strong>{stat.count}</strong></span>
        </button>)}
      </section>
      <div className="pr-index-controls pr-project-detail-tabs">
        <div className="pr-project-tabs" role="group" aria-label="Filter project folders">
          {projectTabs.map(tab => <button key={tab.key} type="button" className={`pr-project-tab pr-project-detail-tab ${projectFilter === tab.key ? "is-active" : ""}`}
            aria-pressed={projectFilter === tab.key} onClick={() => setProjectFilter(tab.key)}><Ico name={tab.icon} size={17}/>{tab.label}
          </button>)}
        </div>
      </div>
    </>}
    {project && !school && <>
      <nav className="pr-project-detail-tabs" role="tablist" aria-label="Project sections">
        {[
          {key:"overview",label:"Overview",icon:"grid"},
          {key:"stages",label:"Stages",icon:"clipboard"},
          {key:"components",label:"Components",icon:"components"},
          {key:"schools",label:"Schools",icon:"school"},
        ].map(tab => <button key={tab.key} id={`pr-detail-tab-${tab.key}`} role="tab" type="button"
          aria-selected={projectTab === tab.key} aria-controls={projectTab === tab.key ? `pr-detail-panel-${tab.key}` : undefined}
          tabIndex={projectTab === tab.key ? 0 : -1} onKeyDown={event=>onProjectTabKeyDown(event,tab.key)}
          className={`pr-project-detail-tab ${projectTab === tab.key ? "is-active" : ""}`}
          onClick={()=>switchProjectTab(tab.key)}><Ico name={tab.icon} size={17}/>{tab.label}</button>)}
      </nav>
      {projectTab === "overview" && <div id="pr-detail-panel-overview" role="tabpanel" aria-labelledby="pr-detail-tab-overview" className="pr-project-detail-overview">
        <div className="pr-project-detail-left">
          <section className="pr-summary-card pr-summary-card--project pr-summary-card--overview pr-project-overview-tile" aria-label="Project overview">
            <div className="pr-overview-intro">
              <div><h2>Project Overview</h2></div>
              <span className="pr-overview-parcels" aria-hidden="true"><span/><span/><span/></span>
            </div>
            <div className="pr-summary-metrics">
              {[["Schools", projectSchools.length], ["Delivered", projectSummaries.get(project.id)?.delivered || 0], ["Closed", projectSummaries.get(project.id)?.closed || 0]].map(([name,count]) =>
                <div className="pr-summary-metric" key={name}><span className="pr-summary-metric-icon"><Ico name={name === "Schools" ? "school" : name === "Delivered" ? "truck" : "shield"} size={23}/></span><span className="pr-summary-metric-copy"><span>{name}</span><strong>{count}</strong></span></div>)}
            </div>
          </section>
          <section className="pr-project-overall-card" aria-label="Overall preparation progress">
            <div className="pr-project-overall-head"><div><h2>Overall Progress</h2></div>
              <strong aria-label={overallPercent === null ? "Progress not available" : `${overallPercent}% complete`}>{overallPercent === null ? "—" : `${overallPercent}%`}</strong></div>
            <div className="pr-project-overall-track" role="progressbar" aria-label="Overall project completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overallPercent === null ? undefined : overallPercent} aria-valuetext={overallPercent === null ? "Unavailable" : `${overallPercent}%`}>
              <span style={{width:`${overallPercent ?? 0}%`}}/></div>
          </section>
        </div>
        <section className="pr-project-tab-pane pr-project-overview-reports" aria-label="Master Project Dashboard">
        <ProjectDashboard key={projectId} projectId={projectId} request={api} inline onOpenSchool={id=>{
          setSchoolId(id);setProjectTab("schools");setQuery("");setWorkflowFilter("all");
          setShowComponents(false);setShowDelivery(false);setShowReconciliation(false);
          setShowTechnical(false);setShowClosing(false);
        }}/>
        </section>
      </div>}
      {projectTab === "stages" && <section id="pr-detail-panel-stages" role="tabpanel" aria-labelledby="pr-detail-tab-stages" className="pr-project-steps-panel pr-project-steps-panel--detail pr-project-steps-panel--tab" aria-label="Project Steps">
          <div className="pr-project-panel-heading"><div className="pr-project-panel-title"><h2>Project Steps</h2></div></div>
          {projectStageError && <div className="pr-project-step-error" role="alert"><span>Progress unavailable: {projectStageError}</span><button type="button" onClick={()=>setProjectStageRevision(n=>n+1)}>Retry</button></div>}
          {projectStageLoading && <span className="pr-project-step-loading" role="status">Updating project stage progress…</span>}
          {stageGranular && !Object.values(stagePermissions).some(Boolean) && <p className="pr-project-stage-restricted" role="status">No project stages are assigned to your account. Ask your administrator to enable the appropriate stages in Users Center.</p>}
          <ol className="pr-project-step-timeline">
            {projectStepCards.map((step,index) => ({ ...step, index })).filter(step => !stageGranular || stagePermissions[step.key]).map(step => {
              const index = step.index;
              const value = projectStepPercents?.[index];
              const percent = value === null || value === undefined ? null : Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
              return <li key={step.key} className="pr-project-step-row">
                <span className="pr-project-step-index" aria-hidden="true">{index+1}</span>
                <button type="button" className="pr-project-step-card pr-project-step-card--kpi pr-project-step-card--compact" onClick={step.open} aria-label={`Open ${step.title}${percent === null ? "" : `, ${percent}% complete`}`}>
                  <span className="pr-step-kpi-top">
                    <span className={`pr-step-kpi-stage-icon pr-step-tone--${step.key}`} aria-hidden="true"><Ico name={step.icon} size={22}/></span>
                    <span className="pr-step-kpi-title"><strong>{step.title}</strong><small>{step.subtitle}{projectStageProgress?.closures?.[step.key] && <span className="pr-sc-badge"> · Closed</span>}</small></span>
                    <StepAccessAvatars access={stepAccess?.[step.key]} loading={stepAccessLoading} unavailable={stepAccessError}/>
                    <strong className="pr-step-kpi-percent">{percent === null ? "—" : `${percent}%`}</strong>
                    <span className="pr-step-kpi-arrow"><Ico name="arrow" size={17}/></span>
                  </span>
                  <span className="pr-step-kpi-track" role="progressbar" aria-label={`${step.title} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent === null ? undefined : percent} aria-valuetext={percent === null ? "Loading" : `${percent}%`}>
                    <span className="pr-step-kpi-fill" style={{ width: `${percent ?? 0}%` }}/>
                  </span>
                  <span className="pr-step-kpi-note">{percent === 100 ? "Stage completed" : step.detail}</span>
                </button>
              </li>;
            })}
          </ol>
      </section>}
      {projectTab === "components" && <section id="pr-detail-panel-components" role="tabpanel" aria-labelledby="pr-detail-tab-components" className="pr-project-tab-pane pr-project-tab-pane--components">
        <ProjectMasterComponents key={projectId} project={project} proposals={data.proposals} allowed={canManage} request={api} inline
          onChanged={()=>{setProjectStageRevision(value=>value+1);reload().catch(err=>setError(err.message));}}/>
      </section>}
      {projectTab === "schools" && <div id="pr-detail-panel-schools" role="tabpanel" aria-labelledby="pr-detail-tab-schools" className="pr-project-tab-pane pr-project-tab-pane--schools">
      <section className="pr-project-schools-panel pr-project-schools-panel--tab" aria-label="Schools">
        <div className="pr-folders pr-dashboard-schools" aria-label="School folders">
          {canManage && <button type="button" className="pr-add-school-tile" onClick={openSchools} aria-label="Add School">
            <span className="pr-index-add-icon" aria-hidden="true"><Ico name="plus" size={27}/></span>
            <strong>Add School</strong>
            <span className="pr-add-school-description">Add a school to this project</span>
          </button>}
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
          {!schoolFiltered.length && projectSchools.length > 0 && <div className="pr-dashboard-empty">No schools match your search.</div>}
          {!projectSchools.length && !canManage && <div className="pr-dashboard-empty">No schools assigned yet.</div>}
        </div>
      </section>
      </div>}

    </>}
    {project && !school && showWarehouse && preparingStageReadable(account, "warehouse") && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowWarehouse(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Project Warehouse Return"><ProjectWarehouseReceiving key={projectId} projectId={projectId} projectName={project.name} canReceive={stageGranular ? stagePermissions.warehouse : canWarehouseReceive} editTabs={editTabs("warehouse")} canAllocate={stageGranular ? stagePermissions.warehouse : canWarehouseAllocate} closurePanel={<ProjectStageClosure projectId={projectId} stage="warehouse" allowed={stagePermissions.warehouse} onClosed={()=>setProjectStageRevision(n=>n+1)}/>} request={api} onClose={()=>{setShowWarehouse(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showIntake && preparingStageReadable(account, "intake") && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowIntake(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Production Receiving"><ProjectProductionIntake key={`${projectId}-intake`} projectId={projectId} projectName={project.name} canTest={stagePermissions.intake} editTabs={editTabs("intake")} closurePanel={<ProjectStageClosure projectId={projectId} stage="intake" allowed={stagePermissions.intake} onClosed={()=>setProjectStageRevision(n=>n+1)}/>} request={api} onClose={()=>{setShowIntake(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showProjectTesting && preparingStageReadable(account, "testing") && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProjectTesting(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Project Testing"><ProjectTesting key={projectId} projectId={projectId} projectName={project.name} canTest={stagePermissions.testing} editTabs={editTabs("testing")} closurePanel={<ProjectStageClosure projectId={projectId} stage="testing" allowed={stagePermissions.testing} onClosed={()=>setProjectStageRevision(n=>n+1)}/>} request={api} onClose={()=>{setShowProjectTesting(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showProduction && preparingStageReadable(account, "production") && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProduction(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Operations Receiving"><ProjectProductionReceiving key={projectId} projectId={projectId} projectName={project.name} stageRecords={stages} allowed={stagePermissions.production} cartonsAllowed={stagePermissions.production} editTabs={editTabs("production")} closurePanel={<ProjectStageClosure projectId={projectId} stage="production" allowed={stagePermissions.production} onClosed={()=>setProjectStageRevision(n=>n+1)}/>} request={api} onClose={()=>{setShowProduction(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showBoxDistribution && preparingStageReadable(account, "boxes") && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowBoxDistribution(false);}}><section className="pr-components-sheet pr-warehouse-sheet" role="dialog" aria-modal="true" aria-label="Box Distribution"><ProjectProductionReceiving key={`${projectId}-boxes`} view="boxes" projectId={projectId} projectName={project.name} stageRecords={stages} allowed={stagePermissions.boxes} cartonsAllowed={stagePermissions.boxes} editTabs={editTabs("boxes")} closurePanel={<ProjectStageClosure projectId={projectId} stage="boxes" allowed={stagePermissions.boxes} onClosed={()=>setProjectStageRevision(n=>n+1)}/>} request={api} onClose={()=>{setShowBoxDistribution(false);setProjectStageRevision(n=>n+1);}}/></section></div>}
    {project && !school && showProjectCartons && preparingStageReadable(account, "cartons") && <div className="pr-components-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowProjectCartons(false);}}><section className="pr-components-sheet" role="dialog" aria-modal="true" aria-label="Project Kit Cartons"><ProjectKitCartons key={projectId} projectId={projectId} projectName={project?.name||""} stageRecords={stages} allowed={stagePermissions.cartons} editTabs={editTabs("cartons")} closurePanel={<ProjectStageClosure projectId={projectId} stage="cartons" allowed={stagePermissions.cartons} onClosed={()=>setProjectStageRevision(n=>n+1)}/>} request={api} onClose={()=>{setShowProjectCartons(false);setProjectStageRevision(n=>n+1);reload().catch(err=>setError(err.message));}}/></section></div>}
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
      <div className="pr-folders pr-index-folder-grid" aria-label="Project folders">
        {canCreate && <button type="button" className="pr-index-add-project" onClick={openNewProject}>
          <span className="pr-index-add-icon" aria-hidden="true"><Ico name="plus" size={42}/></span>
          <strong>Add New Project</strong>
          <span>Create a new project and start<br className="pr-index-add-break"/> its preparation workflow</span>
        </button>}
        {projectFiltered.map(row => {
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
            {menuOpen && canManage && <div className="pr-folder-menu" role="menu" aria-label={`${row.name} actions`}>
              <button type="button" role="menuitem" onClick={()=>renameProjectFolder(row)}><Ico name="edit" size={15}/> Rename</button>
              <button type="button" role="menuitem" className="pr-folder-menu-danger" onClick={()=>deleteProjectFolder(row)}><Ico name="trash" size={15}/> Delete</button>
            </div>}
          </article>;
        })}
        {!projectFiltered.length && <div className="pr-index-no-projects" role="status">
          {projects.length ? "No projects match this filter or search." : "No projects yet. Create your first project to get started."}
        </div>}
      </div>
    </> : null}
    {sheet === "project" && <Sheet title="New Project" className="pr-new-project-sheet" topBadgeIcon="plus" onClose={()=>setSheet("")}
      footer={<><button className="pr-secondary" onClick={()=>setSheet("")}>Cancel</button><button className="pr-primary pr-new-project-save" disabled={busy || projectName.trim().length < 2 || !projectSourceId} onClick={()=>save(async()=>api("", "POST", {action:"create_project", name:projectName, description:projectDescription, proposalId:projectSourceId}))}>{busy ? "Saving…" : "Save Project"}</button></> }>
      <label className="pr-field">Project name<input autoFocus maxLength={160} value={projectName} placeholder="30 June Schools" onChange={event=>setProjectName(event.target.value)}/></label>
      <label className="pr-field">Source Proposal<PreparingSelect required value={projectSourceId} onChange={event=>setProjectSourceId(event.target.value)}><option value="">Select project Proposal…</option>{asArray(data.proposals).map(row=><option key={row.id} value={row.id}>{row.name} ({row.itemsCount} components)</option>)}</PreparingSelect></label>
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
    {sheet === "schools" && <Sheet title="Add Schools" icon="school" className="pr-add-schools-sheet" onClose={()=>{if(!busy)setSheet("");}}
      footer={<><button type="button" className="pr-secondary" disabled={busy} onClick={()=>setSheet("")}>Cancel</button><button type="button" className="pr-primary" disabled={busy || !project?.source_proposal_id || !selectedMembers.length} onClick={()=>save(async()=>api("","POST",{action:"add_schools",projectId,beneficiaryIds:selectedMembers}))}><Ico name="plus" size={17}/>{busy ? "Adding…" : selectedMembers.length ? `Add ${selectedMembers.length} ${selectedMembers.length === 1 ? "School" : "Schools"}` : "Add Schools"}</button></> }>
      <div className="pr-school-project-context"><span className="pr-school-project-icon"><Ico name="layers" size={23}/></span><div><small>PROJECT</small><strong>{project?.name}</strong></div><span className="pr-school-project-count">{projectSchools.length} {projectSchools.length === 1 ? "school" : "schools"}</span></div>
      {!project?.source_proposal_id && <p className="pr-hint" role="alert">Add a source Proposal to this project in Project Components before adding schools.</p>}
      <SchoolPicker label="Beneficiary users / schools" members={availableMembers} selected={selectedMembers} onChange={setSelectedMembers} disabled={busy || !project?.source_proposal_id}/>
      {error && <p className="pr-school-save-error" role="alert">{error}</p>}
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

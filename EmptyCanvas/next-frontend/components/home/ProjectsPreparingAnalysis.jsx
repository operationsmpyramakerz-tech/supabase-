'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

const statuses = [
  { id: 'all', label: 'All projects' },
  { id: 'active', label: 'Active' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'closed', label: 'Closed' },
  { id: 'blocked', label: 'Needs attention' },
];

const number = (value) => Number(value || 0).toLocaleString('en-EG');
function ProgressBar({ value, label }) {
  return <div className="home-preparing-detail__progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <span style={{ width: `${value}%` }} />
  </div>;
}

function getProjectState(project) {
  if (!project.schools) return ['unassigned', 'No schools'];
  if (project.isClosed) return ['closed', 'Closed'];
  if (project.blocked) return ['blocked', 'Needs attention'];
  if (project.delivered) return ['delivered', 'Delivery in progress'];
  return ['active', 'Active'];
}

export default function ProjectsPreparingAnalysis({ summary }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const totals = summary.totals;
  const filtered = useMemo(() => (summary.projects || []).filter((project) =>
    filter === 'all' || (filter === 'active' && project.active) ||
    (filter === 'delivered' && project.delivered > 0) ||
    (filter === 'closed' && project.isClosed) ||
    (filter === 'blocked' && project.blocked > 0)
  ), [summary.projects, filter]);

  return <main className="home-preparing-detail" aria-label="Projects Preparing analysis">
    <div className="home-preparing-detail__header">
      <Link href="/home" className="home-preparing-detail__back">← Back to Home</Link>
      <span className="home-preparing-mini__eyebrow">PROJECTS PREPARING INSIGHTS</span>
      <h1>Projects Preparing analysis</h1>
      <p>Progress and workflow information for the schools enrolled in your preparation projects.</p>
      <Link className="home-preparing-detail__open" href="/projects-preparing">Open Projects Preparing <span aria-hidden="true">↗</span></Link>
    </div>

    <section className="home-preparing-detail__section" aria-label="Project summary">
      <div className="home-preparing-detail__section-title"><h2>Project status</h2><span>Current project totals</span></div>
      <div className="home-preparing-detail__kpis">
        <div><span>Total projects</span><strong>{number(totals.projects)}</strong></div>
        <div><span>Active projects</span><strong>{number(totals.active)}</strong></div>
        <div><span>Projects with deliveries</span><strong>{number(totals.delivered)}</strong></div>
        <div><span>Closed projects</span><strong>{number(totals.closed)}</strong></div>
      </div>
      {totals.unassigned > 0 && <p className="home-preparing-detail__note">{totals.unassigned} project(s) have no schools assigned yet and are not counted as Active or Closed.</p>}
    </section>

    <section className="home-preparing-detail__section" aria-label="School preparation progress">
      <div className="home-preparing-detail__section-title"><h2>Schools progress</h2><span>Based on the nine school workflow stages</span></div>
      <div className="home-preparing-detail__kpis">
        <div><span>Total schools</span><strong>{number(totals.schools)}</strong></div>
        <div><span>Delivered schools</span><strong>{number(totals.deliveredSchools)}</strong></div>
        <div><span>Closed schools</span><strong>{number(totals.closedSchools)}</strong></div>
        <div><span>Blocked schools</span><strong>{number(totals.blockedSchools)}</strong></div>
      </div>
      <div className="home-preparing-detail__overall"><div><span>Overall school workflow completion</span><strong>{totals.stagePercent}%</strong></div><ProgressBar value={totals.stagePercent} label="Overall school workflow completion" /><small>{number(totals.completedStages)} completed of {number(totals.totalStages)} school-stage steps</small></div>
    </section>

    <section className="home-preparing-detail__section" aria-label="Stage by stage analysis">
      <div className="home-preparing-detail__section-title"><h2>Workflow stage analysis</h2><span>Number of schools completing each stage</span></div>
      <div className="home-preparing-detail__stages">
        {summary.stages.map((stage, index) => <article key={stage.key} className="home-preparing-detail__stage">
          <div className="home-preparing-detail__stage-top"><span className="home-preparing-detail__stage-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{stage.title}</strong><small>{stage.team === 'operations' ? 'Operations' : 'Technical follow-up'}</small></div><b>{stage.percent}%</b></div>
          <ProgressBar value={stage.percent} label={`${stage.title} completion`} />
          <div className="home-preparing-detail__stage-foot"><span>{stage.completed} / {stage.total} completed</span><span>{stage.blocked} blocked · {stage.in_progress} in progress</span></div>
        </article>)}
      </div>
    </section>

    <section className="home-preparing-detail__section" aria-label="Project breakdown">
      <div className="home-preparing-detail__section-title"><h2>Project breakdown</h2><span>{filtered.length} shown of {summary.projects.length}</span></div>
      <div className="home-preparing-detail__filters" role="group" aria-label="Filter projects by status">
        {statuses.map((status) => <button key={status.id} type="button" className={filter === status.id ? 'is-active' : ''} aria-pressed={filter === status.id} onClick={() => setFilter(status.id)}>{status.label}</button>)}
      </div>
      <div className="home-preparing-detail__projects">
        {filtered.length ? filtered.map((project) => {
          const [state, label] = getProjectState(project);
          return <article className="home-preparing-detail__project" key={project.id}>
            <div className="home-preparing-detail__project-top"><div><h3>{project.name}</h3><span className={`home-preparing-detail__state home-preparing-detail__state--${state}`}>{label}</span></div><strong>{project.percent}%</strong></div>
            <ProgressBar value={project.percent} label={`${project.name} school workflow completion`} />
            <div className="home-preparing-detail__project-stats"><span>{project.schools} schools</span><span>{project.delivered} delivered</span><span>{project.closed} closed</span>{project.blocked ? <span className="is-warning">{project.blocked} blocked</span> : null}</div>
            {project.schoolRows.length ? <>
              <button className="home-preparing-detail__expand" type="button" aria-expanded={Boolean(expanded[project.id])} onClick={() => setExpanded((current) => ({ ...current, [project.id]: !current[project.id] }))}>{expanded[project.id] ? 'Hide schools' : 'View schools'} <span aria-hidden="true">{expanded[project.id] ? '−' : '+'}</span></button>
              {expanded[project.id] && <div className="home-preparing-detail__school-list">{project.schoolRows.map((school) => <div className="home-preparing-detail__school" key={school.id}>
                <div><strong>{school.name}</strong><small>{school.closed ? 'Closed' : school.blocked ? 'Blocked' : school.currentStage}</small></div>
                <span>{school.percent}%</span>
              </div>)}</div>}
            </> : null}
          </article>;
        }) : <div className="home-preparing-detail__empty">No projects match this filter.</div>}
      </div>
    </section>
    <p className="home-preparing-detail__disclaimer">Status follows the same school-stage completion rules as Projects Preparing. Delivery means the school delivery handover stage is completed; Closed means final school closing is completed. Projects with at least one delivered school are included in the Delivered count, even when they are also Active. These values are not contractual deadlines or SLA measurements.</p>
  </main>;
}

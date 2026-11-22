// Pure analysis of the exact Projects Preparing workspace snapshot.
// Project totals follow PreparingClient's projectTabs calculations; school
// workflow stages use preparing-workflow's canonical stage keys.
import { PREPARING_STAGES, schoolProgress } from './preparing-workflow.js';

const array = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = (completed, total) => total ? Math.round(100 * completed / total) : 0;
const alpha = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function analyzePreparingWorkspace(workspace = {}) {
  const projects = array(workspace.projects).filter((row) => row && !row.deleted_at);
  const projectIds = new Set(projects.map((row) => clean(row.id)).filter(Boolean));
  const schools = array(workspace.schools).filter((row) => projectIds.has(clean(row?.project_id)));
  const schoolIds = new Set(schools.map((row) => clean(row.id)));
  const stageKeys = new Set(PREPARING_STAGES.map((stage) => stage.key));
  const recordsBySchool = new Map();
  for (const row of array(workspace.stages)) {
    const id = clean(row?.school_id);
    if (!schoolIds.has(id) || !stageKeys.has(clean(row?.stage_key))) continue;
    if (!recordsBySchool.has(id)) recordsBySchool.set(id, new Map());
    recordsBySchool.get(id).set(clean(row.stage_key), row);
  }

  const schoolRows = schools.map((row) => {
    const records = [...(recordsBySchool.get(clean(row.id))?.values() || [])];
    const progress = schoolProgress(records);
    const blocked = records.some((stage) => stage?.status === 'blocked');
    const nextStage = PREPARING_STAGES.find((stage) => !records.some((record) => record.stage_key === stage.key && record.status === 'completed')) || null;
    return {
      id: clean(row.id),
      projectId: clean(row.project_id),
      name: clean(row.beneficiary_name || row.school_label || row.name) || 'Unnamed school',
      label: clean(row.school_label),
      completed: progress.completed,
      stageTotal: progress.total,
      percent: pct(progress.completed, progress.total),
      delivered: progress.delivered,
      closed: progress.closed,
      blocked,
      currentStage: nextStage?.title || 'All workflow stages completed',
    };
  });
  const schoolsByProject = new Map();
  for (const row of schoolRows) {
    if (!schoolsByProject.has(row.projectId)) schoolsByProject.set(row.projectId, []);
    schoolsByProject.get(row.projectId).push(row);
  }

  const projectRows = projects.map((row) => {
    const list = (schoolsByProject.get(clean(row.id)) || []).sort((a, b) => alpha(a.name, b.name));
    const schoolCount = list.length;
    const closed = list.filter((school) => school.closed).length;
    const delivered = list.filter((school) => school.delivered).length;
    const blocked = list.filter((school) => school.blocked).length;
    const completedStages = list.reduce((sum, school) => sum + school.completed, 0);
    const totalStages = list.reduce((sum, school) => sum + school.stageTotal, 0);
    return {
      id: clean(row.id),
      name: clean(row.name) || 'Unnamed project',
      createdAt: clean(row.created_at),
      schools: schoolCount,
      closed,
      delivered,
      blocked,
      active: schoolCount > closed,
      isClosed: schoolCount > 0 && schoolCount === closed,
      percent: pct(completedStages, totalStages),
      schoolRows: list,
    };
  }).sort((a, b) => alpha(a.name, b.name));

  const stages = PREPARING_STAGES.map((stage) => {
    const statusCounts = { completed: 0, in_progress: 0, blocked: 0, not_started: 0 };
    for (const school of schools) {
      const status = recordsBySchool.get(clean(school.id))?.get(stage.key)?.status;
      const key = Object.prototype.hasOwnProperty.call(statusCounts, status) ? status : 'not_started';
      statusCounts[key] += 1;
    }
    return {
      key: stage.key,
      title: stage.title,
      team: stage.team,
      ...statusCounts,
      total: schools.length,
      percent: pct(statusCounts.completed, schools.length),
    };
  });
  const completedStages = schoolRows.reduce((total, row) => total + n(row.completed), 0);
  const totalStages = schoolRows.reduce((total, row) => total + n(row.stageTotal), 0);
  return {
    totals: {
      projects: projectRows.length,
      active: projectRows.filter((row) => row.active).length,
      delivered: projectRows.filter((row) => row.delivered > 0).length,
      closed: projectRows.filter((row) => row.isClosed).length,
      unassigned: projectRows.filter((row) => row.schools === 0).length,
      schools: schoolRows.length,
      deliveredSchools: schoolRows.filter((row) => row.delivered).length,
      closedSchools: schoolRows.filter((row) => row.closed).length,
      blockedSchools: schoolRows.filter((row) => row.blocked).length,
      blockedProjects: projectRows.filter((row) => row.blocked > 0).length,
      stagePercent: pct(completedStages, totalStages),
      completedStages,
      totalStages,
    },
    stages,
    projects: projectRows,
  };
}

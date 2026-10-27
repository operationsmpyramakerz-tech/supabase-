// Phase 2D: authorization regression tests without a Supabase connection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const get = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const source = get('../lib/feature-permissions-registry.js');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS, isKnownFeature } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const enforced = grants => ({ featureAccess: { mode: 'enforced', grants } });
const grant = (allowed, scope='all') => ({allowed,scope});

test('Migrated Task Management keys are independently scoped, and nonmigrated profiles retain access', () => {
  const oldAccount = enforced({ 'orders.maintenance.view': grant(true) });
  assert.equal(featureAllowed(oldAccount, 'tasks.project_delete'), true);
  const account = enforced({'tasks.view': grant(true), 'tasks.project_create': grant(true), 'tasks.project_delete': grant(false)});
  assert.equal(featureAllowed(account,'tasks.view'),true);
  assert.equal(featureAllowed(account,'tasks.project_create'),true);
  assert.equal(featureAllowed(account,'tasks.project_edit'),false);
  assert.equal(featureAllowed(account,'tasks.project_delete'),false);
  assert.equal(featureAllowed(enforced({'tasks.view': grant(false)}),'tasks.view'),false);
});

test('Event module opt-in is independent: Team, Requests and Components', () => {
  const account = enforced({'events.team.view': grant(true), 'events.team.member_create': grant(true), 'events.team.member_delete': grant(false), 'events.requests.view':grant(false)});
  assert.equal(featureAllowed(account,'events.team.member_create'),true);
  assert.equal(featureAllowed(account,'events.team.member_delete'),false);
  assert.equal(featureAllowed(account,'events.requests.create'),false);
  assert.equal(featureAllowed(account,'events.components.create'),true); // not opted in
  assert.equal(featureAllowed(enforced({'events.components.view':grant(false)}),'events.components.upload'),false);
});

test('Phase 2D UI toggles are registered and can represent all guarded mutations', () => {
  for(const key of ['tasks.view','tasks.project_delete','tasks.assignment_work','tasks.workflow_save','events.requests.create','events.requests.cancel','events.requests.pdf','events.components.upload','events.team.member_delete','events.team.attendance_manage']) {
    assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(key), `Not displayed: ${key}`);
    assert.ok(isKnownFeature(key));
  }
  const modal = get('../components/users-center/UsersCenterDialogs.jsx');
  for(const marker of ['tasks.view','events.requests.view','events.components.view','events.team.view']) assert.ok(modal.includes(marker));
});

test('Every Task mutation is mapped to its own feature before the first write', () => {
  const route = get('../app/api/task-management/mutations-direct/route.js');
  const actions = ['ticket-create','ticket-update','ticket-archive','ticket-delete','ticket-mark-delivered','people-workflow-save','people-workflow-delete','people-workflow-archive','assignment-archive','assignment-delete','assignment-work','section-work','section-update'];
  for(const action of actions) assert.ok(route.includes(`"${action}": "tasks.`),`missing ${action}`);
  assert.ok(route.indexOf('featureGate(context, required)') < route.indexOf('createTaskManagementTicket(context, body)'));
  assert.ok(get('../lib/task-management-data.js').includes('}, "tasks.view");'));
  assert.ok(get('../app/api/task-management/upload-direct/route.js').includes('featureGate(context, "tasks.attachment_upload")'));
});

test('Event Request/Team/Component action maps are checked before any writes', () => {
  const requests = get('../app/api/events/mutations-direct/route.js');
  for(const key of ['events.requests.create','events.requests.edit','events.requests.workflow','events.requests.cancel','events.requests.archive','events.components.create','events.components.edit','events.components.delete','events.components.upload']) assert.ok(requests.includes(key));
  assert.ok(requests.indexOf('featureGate(gate, required)') < requests.indexOf('createEventRequest(body?.payload'));
  const team = get('../app/api/events/team/route.js');
  for(const key of ['events.team.member_create','events.team.member_edit','events.team.member_delete','events.team.attendance_manage','events.team.photo_upload']) assert.ok(team.includes(key));
  assert.ok(team.indexOf('featureGate(gate, required)') < team.indexOf('createEventTeamMember(body?.payload'));
  assert.ok(get('../app/api/events/pdf-direct/route.js').includes('"events.requests.pdf"'));
});

test('Denied user controls are hidden in task and event detail views', () => {
  const task = get('../components/task-management/ClassicTaskWorkflowDetails.jsx');
  assert.ok(task.includes('{onDelete?<button'));
  assert.ok(task.includes('{onArchive?<button'));
  assert.ok(task.includes('featurePermissions.assignment_delete?'));
  const events = get('../components/events/EventsDialogs.jsx');
  assert.ok(events.includes('{canEdit ? <button'));
  assert.ok(events.includes('{canCancel && status'));
  assert.ok(events.includes('{canExport?<button'));
  const team = get('../components/events/EventTeamClient.jsx');
  assert.ok(team.includes('{canDeleteMember ? <button'));
  const comp = get('../components/events/EventComponentsDialogs.jsx');
  assert.ok(comp.includes('{canUpload ? <label'));
});

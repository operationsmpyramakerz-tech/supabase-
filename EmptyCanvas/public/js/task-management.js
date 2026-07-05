(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const norm = (value) => String(value ?? '').trim().toLowerCase();
  const statusLabel = (value) => ({ not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }[value] || 'Not started');
  const statusIcon = (value) => ({ not_started: 'circle', in_progress: 'activity', completed: 'check-circle', cancelled: 'slash' }[value] || 'circle');
  const statusClass = (value) => `tm-status--${String(value || 'not_started').replace(/[^a-z_]/g, '')}`;
  const toDate = (value) => { try { return value ? new Date(value) : null; } catch { return null; } };
  const formatDate = (value) => { const date = toDate(value); return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
  const formatDateTime = (value) => { const date = toDate(value); return date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };

  const pathname = String(window.location?.pathname || '');
  const TASK_VIEW = /^\/task-management\/delegated-tasks(?:\/|$)/.test(pathname)
    ? 'delegated'
    : (/^\/task-management\/all-tasks(?:\/|$)/.test(pathname) ? 'all' : 'my');

  const VIEW_CONFIG = {
    all: {
      label: 'All Tasks',
      header: 'All Tasks',
      subtitle: 'All cross-department workflow tickets across the company.',
      emptyTitle: 'No tasks found',
      emptyText: 'No cross-department workflow tickets have been created yet.',
      toolbarNoun: 'task',
    },
    my: {
      label: 'My Tasks',
      header: 'My Tasks',
      subtitle: 'Tickets with workflow work assigned to your department.',
      emptyTitle: 'No tasks assigned to you',
      emptyText: 'You do not have any active workflow work assigned to your department yet.',
      toolbarNoun: 'assigned task',
    },
    delegated: {
      label: 'Delegated Tasks',
      header: 'Delegated Tasks',
      subtitle: 'Tickets you created and delegated to other departments.',
      emptyTitle: 'No delegated tasks found',
      emptyText: 'Create a task to start a workflow between departments.',
      toolbarNoun: 'delegated task',
    },
  };

  const state = {
    tickets: [],
    filtered: [],
    departments: [],
    activeStatus: 'all',
    query: '',
    selectedTicket: null,
    selectedSection: null,
    view: TASK_VIEW,
    currentUser: {},
  };

  const grid = $('tmTicketGrid');
  const searchInput = $('tmSearch');
  const tabs = $('tmTabs');
  const toolbarNote = $('tmToolbarNote');
  const formOverlay = $('tmTicketFormOverlay');
  const workflowOverlay = $('tmWorkflowOverlay');
  const updateOverlay = $('tmUpdateSectionOverlay');
  const form = $('tmTicketForm');
  const sectionsEditor = $('tmSectionEditorList');
  const formError = $('tmFormError');
  const updateForm = $('tmUpdateSectionForm');
  const updateError = $('tmUpdateSectionError');

  function hydrateIcons(root = document) {
    try { if (window.feather) window.feather.replace({ width: 18, height: 18 }); } catch {}
  }

  async function api(url, options = {}) {
    const init = { credentials: 'same-origin', headers: { ...(options.headers || {}) }, ...options };
    if (init.body && typeof init.body !== 'string') {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Request failed.');
    return payload;
  }

  function showToast(type, title, message) {
    try { if (window.UI && typeof window.UI.toast === 'function') return window.UI.toast(type, title, message); } catch {}
    window.alert(message || title);
  }

  function setOverlay(overlay, open) {
    if (!overlay) return;
    overlay.hidden = !open;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('tm-modal-open', open || !formOverlay.hidden || !workflowOverlay.hidden || !updateOverlay.hidden);
    if (open) window.setTimeout(() => overlay.querySelector('input, select, textarea, button')?.focus(), 40);
  }

  function renderLoading() {
    if (!grid) return;
    grid.innerHTML = '<div class="modern-loading" role="status"><div class="modern-loading__spinner" aria-hidden="true"></div><div class="modern-loading__text">Loading tasks <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span></div></div>';
  }

  function statusPill(status) {
    return `<span class="tm-status-pill ${statusClass(status)}"><i data-feather="${statusIcon(status)}"></i>${escapeHtml(statusLabel(status))}</span>`;
  }

  function ticketMatches(ticket) {
    if (state.activeStatus !== 'all' && ticket.status !== state.activeStatus) return false;
    if (!state.query) return true;
    const haystack = [
      ticket.ticketCode, ticket.title, ticket.description, ticket.createdByName,
      ...(ticket.sections || []).flatMap((section) => [section.department, section.request, section.details]),
    ].map(norm).join(' ');
    return haystack.includes(state.query);
  }

  function renderTickets() {
    if (!grid) return;
    state.filtered = (state.tickets || []).filter(ticketMatches);
    const noun = VIEW_CONFIG[state.view]?.toolbarNoun || 'task';
    if (toolbarNote) toolbarNote.textContent = `${state.filtered.length} ${noun}${state.filtered.length === 1 ? '' : 's'}`;

    if (!state.filtered.length) {
      grid.innerHTML = `
        <div class="tm-empty-state">
          <div class="tm-empty-state__icon"><i data-feather="git-branch"></i></div>
          <h2>${escapeHtml(VIEW_CONFIG[state.view].emptyTitle)}</h2>
          <p>${escapeHtml(VIEW_CONFIG[state.view].emptyText)}</p>
          ${state.view === 'delegated' ? '<button class="tm-btn tm-btn--primary" type="button" data-tm-new-ticket><i data-feather="plus"></i>Add Task</button>' : ''}
        </div>`;
      hydrateIcons(grid);
      return;
    }

    grid.innerHTML = state.filtered.map((ticket) => {
      const departments = [...new Set((ticket.sections || []).map((section) => section.department).filter(Boolean))].slice(0, 3);
      const extra = Math.max(0, (ticket.sections || []).length - departments.length);
      const progress = Math.max(0, Math.min(100, Number(ticket.progress) || 0));
      return `
        <article class="tm-ticket-card" role="button" tabindex="0" data-ticket-id="${escapeHtml(ticket.id)}" aria-label="Open ${escapeHtml(ticket.ticketCode)}">
          <div class="tm-ticket-card__top">
            <div class="tm-ticket-thumb"><i data-feather="git-branch"></i></div>
            <div class="tm-ticket-main"><div class="tm-ticket-code">${escapeHtml(ticket.ticketCode)}</div><h2>${escapeHtml(ticket.title)}</h2><p>${escapeHtml(ticket.createdByName || '—')} · ${escapeHtml(formatDate(ticket.createdAt))}</p></div>
            ${statusPill(ticket.status)}
          </div>
          <div class="tm-ticket-card__divider"></div>
          <div class="tm-ticket-route"><span class="tm-ticket-route__label">Execution route</span><div class="tm-department-chips">${departments.map((department) => `<span>${escapeHtml(department)}</span>`).join('')}${extra ? `<span class="tm-department-chips__more">+${extra}</span>` : ''}</div></div>
          <div class="tm-ticket-card__bottom"><div class="tm-progress"><div class="tm-progress__head"><span>${ticket.completedCount || 0}/${ticket.sectionsCount || 0} sections completed</span><b>${progress}%</b></div><div class="tm-progress__rail"><span style="width:${progress}%"></span></div></div><div class="tm-ticket-card__go"><i data-feather="arrow-right"></i></div></div>
        </article>`;
    }).join('');
    hydrateIcons(grid);
  }

  async function loadTickets({ preserve = true } = {}) {
    if (!preserve) renderLoading();
    try {
      const data = await api(`/api/task-management?view=${encodeURIComponent(state.view)}`);
      state.tickets = Array.isArray(data.tickets) ? data.tickets : [];
      renderTickets();
      if (state.selectedTicket?.id) {
        const selected = state.tickets.find((ticket) => String(ticket.id) === String(state.selectedTicket.id));
        if (selected) { state.selectedTicket = selected; renderWorkflow(selected); }
      }
    } catch (error) {
      grid.innerHTML = `<div class="tm-empty-state tm-empty-state--error"><div class="tm-empty-state__icon"><i data-feather="alert-circle"></i></div><h2>Could not load tasks</h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button class="tm-btn tm-btn--secondary" type="button" data-tm-retry>Retry</button></div>`;
      hydrateIcons(grid);
    }
  }

  function editorItems() {
    return [...(sectionsEditor?.querySelectorAll('[data-section-editor]') || [])];
  }

  function maxExecutionGroup() {
    return Math.max(0, ...editorItems().map((item) => Number(item.dataset.executionGroup) || 0));
  }

  function createSectionEditor(value = {}, { placement = 'series' } = {}) {
    const existingMax = maxExecutionGroup();
    const explicit = Number(value.executionGroup ?? value.execution_group ?? 0);
    const executionGroup = Math.max(1, explicit || (placement === 'parallel' && existingMax ? existingMax : existingMax + 1));
    const item = document.createElement('article');
    item.className = 'tm-section-editor';
    item.dataset.sectionEditor = 'true';
    item.dataset.executionGroup = String(executionGroup);
    item.innerHTML = `
      <div class="tm-section-editor__head">
        <span class="tm-section-number">1</span>
        <div class="tm-section-editor__heading"><b>Workflow section</b><small class="tm-section-stage-note">Stage ${executionGroup}</small></div>
        <div class="tm-section-editor__controls">
          <button type="button" class="tm-small-icon" data-tm-move="up" aria-label="Move section up"><i data-feather="chevron-up"></i></button>
          <button type="button" class="tm-small-icon" data-tm-move="down" aria-label="Move section down"><i data-feather="chevron-down"></i></button>
          <button type="button" class="tm-small-icon tm-small-icon--danger" data-tm-remove-section aria-label="Remove section"><i data-feather="trash-2"></i></button>
        </div>
      </div>
      <div class="tm-section-editor__fields">
        <label class="tm-field"><span>Responsible department <b>*</b></span><select class="tm-section-department" required><option value="">Select department</option>${state.departments.map((department) => `<option value="${escapeHtml(department)}" ${department === value.department ? 'selected' : ''}>${escapeHtml(department)}</option>`).join('')}</select></label>
        <label class="tm-field tm-field--wide"><span>Requested action <b>*</b></span><input class="tm-section-request" maxlength="4000" required placeholder="What should this department deliver?" value="${escapeHtml(value.request || '')}" /></label>
        <label class="tm-field tm-field--wide"><span>Implementation details</span><textarea class="tm-section-details" rows="2" maxlength="8000" placeholder="Optional notes, dependencies, or handover criteria.">${escapeHtml(value.details || '')}</textarea></label>
      </div>`;
    sectionsEditor.appendChild(item);
    renumberSectionEditors();
    hydrateIcons(item);
  }

  function renumberSectionEditors() {
    const items = editorItems();
    const normalizedGroups = new Map();
    let nextGroup = 1;
    items.forEach((item) => {
      const rawGroup = Math.max(1, Number(item.dataset.executionGroup) || 1);
      if (!normalizedGroups.has(rawGroup)) normalizedGroups.set(rawGroup, nextGroup++);
      item.dataset.executionGroup = String(normalizedGroups.get(rawGroup));
    });

    const groups = new Map();
    items.forEach((item) => {
      const group = Number(item.dataset.executionGroup) || 1;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    });

    items.forEach((item, index) => {
      const group = Number(item.dataset.executionGroup) || 1;
      const groupCount = groups.get(group)?.length || 1;
      const number = item.querySelector('.tm-section-number');
      const heading = item.querySelector('.tm-section-editor__heading b');
      const note = item.querySelector('.tm-section-stage-note');
      if (number) number.textContent = String(index + 1);
      if (heading) heading.textContent = `Stage ${group} · Section ${index + 1}`;
      if (note) note.textContent = groupCount > 1
        ? `Parallel stage · runs with ${groupCount - 1} other section${groupCount === 2 ? '' : 's'}`
        : (group === 1 ? 'First execution stage' : 'Series stage · starts after the previous stage');
    });
  }

  function openCreateForm() {
    if (state.view !== 'delegated') { showToast('info', 'Delegated Tasks only', 'Create new tasks from the Delegated Tasks page.'); return; }
    if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess.showViewOnlyNotice(); return; }
    form?.reset();
    if (formError) formError.textContent = '';
    if (sectionsEditor) sectionsEditor.innerHTML = '';
    createSectionEditor({}, { placement: 'series' });
    setOverlay(formOverlay, true);
    $('tmTitleInput')?.focus();
  }

  function collectSections() {
    return editorItems().map((item, index) => ({
      department: item.querySelector('.tm-section-department')?.value || '',
      request: item.querySelector('.tm-section-request')?.value || '',
      details: item.querySelector('.tm-section-details')?.value || '',
      executionGroup: Math.max(1, Number(item.dataset.executionGroup) || index + 1),
    }));
  }

  async function submitCreateForm(event) {
    event.preventDefault();
    if (state.view !== 'delegated') { showToast('info', 'Delegated Tasks only', 'Create new tasks from the Delegated Tasks page.'); return; }
    if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess.showViewOnlyNotice(); return; }
    const payload = {
      title: $('tmTitleInput')?.value.trim() || '',
      priority: $('tmPriorityInput')?.value || 'Normal',
      dueDate: $('tmDueDateInput')?.value || '',
      description: $('tmDescriptionInput')?.value.trim() || '',
      sections: collectSections(),
    };
    if (!payload.title) { if (formError) formError.textContent = 'Enter a task title.'; return; }
    if (!payload.sections.length || payload.sections.some((section) => !section.department.trim() || !section.request.trim())) {
      if (formError) formError.textContent = 'Every workflow section needs a department and a requested action.';
      return;
    }
    const submit = $('tmCreateTicketBtn');
    if (submit) { submit.disabled = true; submit.classList.add('is-loading'); }
    if (formError) formError.textContent = '';
    try {
      const data = await api('/api/task-management', { method: 'POST', body: payload });
      setOverlay(formOverlay, false);
      state.selectedTicket = data.ticket || null;
      await loadTickets();
      const created = state.tickets.find((ticket) => String(ticket.id) === String(data.ticket?.id)) || data.ticket;
      if (created) openWorkflow(created);
      showToast('success', 'Task created', 'The workflow stages are ready. Parallel sections start together; series stages unlock in order.');
    } catch (error) {
      if (formError) formError.textContent = error.message || 'Failed to create task.';
    } finally {
      if (submit) { submit.disabled = false; submit.classList.remove('is-loading'); }
    }
  }

  function openWorkflow(ticket) {
    state.selectedTicket = ticket;
    renderWorkflow(ticket);
    setOverlay(workflowOverlay, true);
  }

  function sectionActionAllowed(ticket, section) {
    const currentUser = state.currentUser || window.__tmCurrentUser || {};
    const myDepartment = norm(currentUser?.department || '');
    const isCreator = currentUser?.id && String(ticket.createdById || '') === String(currentUser.id);
    const isDepartment = myDepartment && myDepartment === norm(section.department || '');
    if (window.__tmIsPageAdmin) return true;
    if (state.view === 'delegated') return !!isCreator;
    if (state.view === 'all') return !!(isCreator || isDepartment);
    return !!isDepartment;
  }

  function orderedStages(sections = []) {
    const groups = new Map();
    (sections || []).forEach((section, index) => {
      const executionGroup = Math.max(1, Number(section.executionGroup ?? section.execution_group ?? section.sortOrder ?? index + 1) || index + 1);
      if (!groups.has(executionGroup)) groups.set(executionGroup, []);
      groups.get(executionGroup).push(section);
    });
    return [...groups.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([executionGroup, stageSections]) => ({
        executionGroup: Number(executionGroup),
        sections: stageSections.slice().sort((a, b) => (Number(a.sortOrder) - Number(b.sortOrder)) || Number(a.id) - Number(b.id)),
      }));
  }

  function renderWorkflowCard(ticket, section, stageNo, indexInStage, stageUnlocked) {
    const allowed = sectionActionAllowed(ticket, section);
    const canStart = stageUnlocked && section.status === 'not_started';
    const canComplete = stageUnlocked && (section.status === 'in_progress' || section.status === 'not_started');
    const waitingMessage = !stageUnlocked ? 'Waiting for the previous workflow stage' : '';
    return `
      <article class="tm-workflow-card ${statusClass(section.status)}" data-section-id="${escapeHtml(section.id)}">
        <div class="tm-workflow-card__top"><div class="tm-department-mark"><i data-feather="briefcase"></i></div><div class="tm-workflow-card__main"><span class="tm-workflow-card__kicker">Stage ${stageNo} · Section ${indexInStage + 1}</span><h3>${escapeHtml(section.department || 'Department')}</h3></div>${statusPill(section.status)}</div>
        <div class="tm-workflow-card__body"><span class="tm-workflow-card__label">Requested action</span><p>${escapeHtml(section.request || '—')}</p>${section.details ? `<div class="tm-workflow-card__details"><span>Details</span><p>${escapeHtml(section.details)}</p></div>` : ''}${section.completionNote ? `<div class="tm-workflow-card__note"><i data-feather="message-square"></i><div><span>Execution note${section.completedByName ? ` · ${escapeHtml(section.completedByName)}` : ''}</span><p>${escapeHtml(section.completionNote)}</p></div></div>` : ''}</div>
        <div class="tm-workflow-card__footer"><span>${waitingMessage || (section.completedAt ? `Completed ${escapeHtml(formatDateTime(section.completedAt))}` : (section.startedAt ? `Started ${escapeHtml(formatDateTime(section.startedAt))}` : 'Waiting to start'))}</span>${allowed && stageUnlocked ? `<div class="tm-workflow-card__actions">${canStart ? `<button type="button" class="tm-action-link" data-tm-section-status="in_progress" data-section-id="${escapeHtml(section.id)}"><i data-feather="play"></i>Start</button>` : ''}${canComplete ? `<button type="button" class="tm-action-link tm-action-link--complete" data-tm-section-status="completed" data-section-id="${escapeHtml(section.id)}"><i data-feather="check"></i>Complete</button>` : ''}<button type="button" class="tm-action-link" data-tm-edit-section="${escapeHtml(section.id)}"><i data-feather="edit-3"></i>Update</button></div>` : ''}</div>
      </article>`;
  }

  function renderWorkflow(ticket) {
    if (!ticket) return;
    $('tmWorkflowCode').textContent = ticket.ticketCode || 'TKT';
    $('tmWorkflowTitle').textContent = ticket.title || 'Task workflow';
    $('tmWorkflowSub').textContent = `${ticket.createdByName || '—'} · Created ${formatDate(ticket.createdAt)}`;
    const statusEl = $('tmWorkflowStatus');
    statusEl.className = `tm-status-pill ${statusClass(ticket.status)}`;
    statusEl.innerHTML = `<i data-feather="${statusIcon(ticket.status)}"></i>${escapeHtml(statusLabel(ticket.status))}`;
    $('tmWorkflowSummary').innerHTML = `<div><span>Objective</span><p>${escapeHtml(ticket.description || 'No additional context provided.')}</p></div><div><span>Priority</span><b class="tm-priority tm-priority--${escapeHtml(norm(ticket.priority || 'normal'))}">${escapeHtml(ticket.priority || 'Normal')}</b></div><div><span>Target date</span><b>${escapeHtml(formatDate(ticket.dueDate))}</b></div><div><span>Progress</span><b>${ticket.completedCount || 0}/${ticket.sectionsCount || 0} complete</b></div>`;

    const flow = $('tmWorkflowFlow');
    const stages = orderedStages(ticket.sections || []);
    flow.innerHTML = stages.map((stage, stageIndex) => {
      const stageNo = stageIndex + 1;
      const stageUnlocked = stages.slice(0, stageIndex).every((previousStage) => previousStage.sections.every((section) => section.status === 'completed'));
      const parallel = stage.sections.length > 1;
      return `
        <section class="tm-flow-stage ${stageIndex === 0 ? 'tm-flow-stage--first' : ''}" data-execution-group="${stage.executionGroup}">
          ${stageIndex > 0 ? '<div class="tm-flow-stage__connector" aria-hidden="true"><i data-feather="arrow-right"></i></div>' : ''}
          <div class="tm-flow-stage__content">
            <div class="tm-flow-stage__head"><span class="tm-flow-stage__number">${stageNo}</span><div><b>Stage ${stageNo}</b><small>${parallel ? `${stage.sections.length} parallel sections` : 'Series section'}</small></div></div>
            <div class="tm-flow-stage__cards">${stage.sections.map((section, indexInStage) => renderWorkflowCard(ticket, section, stageNo, indexInStage, stageUnlocked)).join('')}</div>
          </div>
        </section>`;
    }).join('') || '<div class="tm-empty-state"><h2>No workflow sections</h2><p>This task has no configured department sections.</p></div>';
    hydrateIcons(workflowOverlay);
  }

  function openSectionUpdate(sectionId, directStatus = '') {
    const ticket = state.selectedTicket;
    const section = (ticket?.sections || []).find((item) => String(item.id) === String(sectionId));
    if (!ticket || !section) return;
    state.selectedSection = section;
    $('tmUpdateSectionDepartment').textContent = section.department || 'Department';
    $('tmUpdateSectionTitle').textContent = 'Update workflow section';
    $('tmUpdateSectionRequest').textContent = section.request || '—';
    $('tmSectionStatusInput').value = directStatus || section.status || 'not_started';
    $('tmCompletionNoteInput').value = section.completionNote || '';
    if (updateError) updateError.textContent = '';
    setOverlay(updateOverlay, true);
  }

  async function submitSectionUpdate(event) {
    event.preventDefault();
    const section = state.selectedSection;
    if (!section) return;
    const submit = $('tmUpdateSectionSubmit');
    if (submit) submit.disabled = true;
    if (updateError) updateError.textContent = '';
    try {
      const data = await api(`/api/task-management/sections/${encodeURIComponent(section.id)}`, {
        method: 'PATCH',
        body: { view: state.view, status: $('tmSectionStatusInput').value, completionNote: $('tmCompletionNoteInput').value.trim() },
      });
      state.selectedTicket = data.ticket;
      setOverlay(updateOverlay, false);
      await loadTickets();
      const latest = state.tickets.find((ticket) => String(ticket.id) === String(data.ticket?.id)) || data.ticket;
      state.selectedTicket = latest;
      renderWorkflow(latest);
      showToast('success', 'Section updated', 'Workflow progress has been refreshed.');
    } catch (error) {
      if (updateError) updateError.textContent = error.message || 'Failed to update workflow section.';
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function setCreateButtonsVisible(visible) {
    ['tmNewTicketBtn', 'tmToolbarNewTicketBtn'].forEach((id) => {
      const button = $(id);
      if (!button) return;
      button.hidden = !visible;
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
      button.classList.toggle('is-visible', visible);
    });
  }

  function applyViewChrome() {
    const view = VIEW_CONFIG[state.view] || VIEW_CONFIG.my;
    document.title = `${view.label} | Task Management`;
    $('tmViewTitle')?.replaceChildren(document.createTextNode(view.header));
    const subtitle = $('tmViewSubtitle');
    if (subtitle) subtitle.textContent = view.subtitle;
    setCreateButtonsVisible(state.view === 'delegated');
  }

  async function init() {
    applyViewChrome();
    try {
      const meta = await api(`/api/task-management/meta?view=${encodeURIComponent(state.view)}`);
      state.departments = Array.isArray(meta.departments) ? meta.departments : [];
      state.currentUser = meta.currentUser || {};
      window.__tmCurrentUser = state.currentUser;
      window.__tmIsPageAdmin = !!meta.isPageAdmin;
    } catch {
      state.departments = [];
      state.currentUser = {};
    }
    await loadTickets({ preserve: false });
  }

  document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    $('tmAddParallelSectionBtn')?.addEventListener('click', () => createSectionEditor({}, { placement: 'parallel' }));
    $('tmAddSeriesSectionBtn')?.addEventListener('click', () => createSectionEditor({}, { placement: 'series' }));
    form?.addEventListener('submit', submitCreateForm);
    updateForm?.addEventListener('submit', submitSectionUpdate);
    searchInput?.addEventListener('input', () => { state.query = norm(searchInput.value); renderTickets(); });
    tabs?.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-status]'); if (!tab) return;
      state.activeStatus = tab.dataset.status || 'all';
      tabs.querySelectorAll('[data-status]').forEach((item) => {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderTickets();
    });
    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-tm-close]');
      if (close) {
        const which = close.dataset.tmClose;
        if (which === 'form') setOverlay(formOverlay, false);
        if (which === 'workflow') setOverlay(workflowOverlay, false);
        if (which === 'update') setOverlay(updateOverlay, false);
        return;
      }
      if (event.target.closest('[data-tm-new-ticket]')) { openCreateForm(); return; }
      if (event.target.closest('[data-tm-retry]')) { loadTickets({ preserve: false }); return; }
      const ticketCard = event.target.closest('[data-ticket-id]');
      if (ticketCard) {
        const ticket = state.tickets.find((item) => String(item.id) === String(ticketCard.dataset.ticketId));
        if (ticket) openWorkflow(ticket);
        return;
      }
      const statusAction = event.target.closest('[data-tm-section-status]');
      if (statusAction) { openSectionUpdate(statusAction.dataset.sectionId, statusAction.dataset.tmSectionStatus); return; }
      const editAction = event.target.closest('[data-tm-edit-section]');
      if (editAction) { openSectionUpdate(editAction.dataset.tmEditSection); return; }
      const remove = event.target.closest('[data-tm-remove-section]');
      if (remove) {
        const item = remove.closest('[data-section-editor]');
        if (editorItems().length <= 1) { if (formError) formError.textContent = 'A task needs at least one workflow section.'; return; }
        item?.remove();
        renumberSectionEditors();
        return;
      }
      const move = event.target.closest('[data-tm-move]');
      if (move) {
        const item = move.closest('[data-section-editor]');
        const direction = move.dataset.tmMove;
        if (direction === 'up' && item?.previousElementSibling) sectionsEditor.insertBefore(item, item.previousElementSibling);
        if (direction === 'down' && item?.nextElementSibling) sectionsEditor.insertBefore(item.nextElementSibling, item);
        renumberSectionEditors();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!updateOverlay.hidden) setOverlay(updateOverlay, false);
        else if (!workflowOverlay.hidden) setOverlay(workflowOverlay, false);
        else if (!formOverlay.hidden) setOverlay(formOverlay, false);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = document.activeElement?.closest?.('[data-ticket-id]');
      if (card) { event.preventDefault(); card.click(); }
    });
    init();
  });
})();

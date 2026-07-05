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

  const state = {
    tickets: [],
    filtered: [],
    departments: [],
    activeStatus: 'all',
    query: '',
    selectedTicket: null,
    selectedSection: null,
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
    grid.innerHTML = '<div class="modern-loading" role="status"><div class="modern-loading__spinner" aria-hidden="true"></div><div class="modern-loading__text">Loading tickets <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span></div></div>';
  }

  function statusPill(status) {
    return `<span class="tm-status-pill ${statusClass(status)}"><i data-feather="${statusIcon(status)}"></i>${escapeHtml(statusLabel(status))}</span>`;
  }

  function ticketMatches(ticket) {
    if (state.activeStatus !== 'all' && ticket.status !== state.activeStatus) return false;
    if (!state.query) return true;
    const haystack = [ticket.ticketCode, ticket.title, ticket.description, ticket.createdByName, ...(ticket.sections || []).flatMap((section) => [section.department, section.request, section.details])].map(norm).join(' ');
    return haystack.includes(state.query);
  }

  function renderTickets() {
    if (!grid) return;
    state.filtered = (state.tickets || []).filter(ticketMatches);
    toolbarNote.textContent = `${state.filtered.length} ticket${state.filtered.length === 1 ? '' : 's'}`;
    if (!state.filtered.length) {
      grid.innerHTML = `
        <div class="tm-empty-state">
          <div class="tm-empty-state__icon"><i data-feather="git-branch"></i></div>
          <h2>No tickets found</h2>
          <p>Create a ticket to start an ordered workflow between departments.</p>
          <button class="tm-btn tm-btn--primary" type="button" data-tm-new-ticket><i data-feather="plus"></i>Create Ticket</button>
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
      const data = await api('/api/task-management');
      state.tickets = Array.isArray(data.tickets) ? data.tickets : [];
      renderTickets();
      if (state.selectedTicket?.id) {
        const selected = state.tickets.find((ticket) => String(ticket.id) === String(state.selectedTicket.id));
        if (selected) { state.selectedTicket = selected; renderWorkflow(selected); }
      }
    } catch (error) {
      grid.innerHTML = `<div class="tm-empty-state tm-empty-state--error"><div class="tm-empty-state__icon"><i data-feather="alert-circle"></i></div><h2>Could not load tickets</h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button class="tm-btn tm-btn--secondary" type="button" data-tm-retry>Retry</button></div>`;
      hydrateIcons(grid);
    }
  }

  function createSectionEditor(value = {}) {
    const index = sectionsEditor.children.length + 1;
    const item = document.createElement('article');
    item.className = 'tm-section-editor';
    item.dataset.sectionEditor = 'true';
    item.innerHTML = `
      <div class="tm-section-editor__head"><span class="tm-section-number">${index}</span><div><b>Workflow section</b><small>Department action in this position</small></div><div class="tm-section-editor__controls"><button type="button" class="tm-small-icon" data-tm-move="up" aria-label="Move section up"><i data-feather="chevron-up"></i></button><button type="button" class="tm-small-icon" data-tm-move="down" aria-label="Move section down"><i data-feather="chevron-down"></i></button><button type="button" class="tm-small-icon tm-small-icon--danger" data-tm-remove-section aria-label="Remove section"><i data-feather="trash-2"></i></button></div></div>
      <div class="tm-section-editor__fields"><label class="tm-field"><span>Responsible department <b>*</b></span><select class="tm-section-department" required><option value="">Select department</option>${state.departments.map((department) => `<option value="${escapeHtml(department)}" ${department === value.department ? 'selected' : ''}>${escapeHtml(department)}</option>`).join('')}</select></label><label class="tm-field tm-field--wide"><span>Requested action <b>*</b></span><input class="tm-section-request" maxlength="4000" required placeholder="What should this department deliver?" value="${escapeHtml(value.request || '')}" /></label><label class="tm-field tm-field--wide"><span>Implementation details</span><textarea class="tm-section-details" rows="2" maxlength="8000" placeholder="Optional notes, dependencies, or handover criteria.">${escapeHtml(value.details || '')}</textarea></label></div>`;
    sectionsEditor.appendChild(item);
    renumberSectionEditors();
    hydrateIcons(item);
  }

  function renumberSectionEditors() {
    [...sectionsEditor.querySelectorAll('[data-section-editor]')].forEach((item, index) => { const no = item.querySelector('.tm-section-number'); if (no) no.textContent = String(index + 1); });
  }

  function openCreateForm() {
    if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess.showViewOnlyNotice(); return; }
    form.reset();
    formError.textContent = '';
    sectionsEditor.innerHTML = '';
    createSectionEditor();
    setOverlay(formOverlay, true);
    $('tmTitleInput').focus();
  }

  function collectSections() {
    return [...sectionsEditor.querySelectorAll('[data-section-editor]')].map((item) => ({
      department: item.querySelector('.tm-section-department')?.value || '',
      request: item.querySelector('.tm-section-request')?.value || '',
      details: item.querySelector('.tm-section-details')?.value || '',
    }));
  }

  async function submitCreateForm(event) {
    event.preventDefault();
    if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess.showViewOnlyNotice(); return; }
    const payload = { title: $('tmTitleInput').value.trim(), priority: $('tmPriorityInput').value, dueDate: $('tmDueDateInput').value, description: $('tmDescriptionInput').value.trim(), sections: collectSections() };
    if (!payload.title) { formError.textContent = 'Enter a ticket title.'; return; }
    if (!payload.sections.length || payload.sections.some((section) => !section.department.trim() || !section.request.trim())) { formError.textContent = 'Every workflow section needs a department and a requested action.'; return; }
    const submit = $('tmCreateTicketBtn');
    submit.disabled = true; submit.classList.add('is-loading'); formError.textContent = '';
    try {
      const data = await api('/api/task-management', { method: 'POST', body: payload });
      setOverlay(formOverlay, false);
      state.selectedTicket = data.ticket || null;
      await loadTickets();
      const created = state.tickets.find((ticket) => String(ticket.id) === String(data.ticket?.id)) || data.ticket;
      if (created) openWorkflow(created);
      showToast('success', 'Ticket created', 'The ordered department workflow is ready.');
    } catch (error) {
      formError.textContent = error.message || 'Failed to create ticket.';
    } finally { submit.disabled = false; submit.classList.remove('is-loading'); }
  }

  function openWorkflow(ticket) {
    state.selectedTicket = ticket;
    renderWorkflow(ticket);
    setOverlay(workflowOverlay, true);
  }

  function sectionActionAllowed(ticket, section) {
    const myDepartment = norm(window.__tmCurrentUser?.department || '');
    const isCreator = window.__tmCurrentUser?.id && String(ticket.createdById || '') === String(window.__tmCurrentUser.id);
    const isDepartment = myDepartment && myDepartment === norm(section.department || '');
    return !!(window.__tmIsPageAdmin || isCreator || isDepartment);
  }

  function renderWorkflow(ticket) {
    if (!ticket) return;
    $('tmWorkflowCode').textContent = ticket.ticketCode || 'TKT';
    $('tmWorkflowTitle').textContent = ticket.title || 'Ticket workflow';
    $('tmWorkflowSub').textContent = `${ticket.createdByName || '—'} · Created ${formatDate(ticket.createdAt)}`;
    const statusEl = $('tmWorkflowStatus');
    statusEl.className = `tm-status-pill ${statusClass(ticket.status)}`;
    statusEl.innerHTML = `<i data-feather="${statusIcon(ticket.status)}"></i>${escapeHtml(statusLabel(ticket.status))}`;
    $('tmWorkflowSummary').innerHTML = `<div><span>Objective</span><p>${escapeHtml(ticket.description || 'No additional context provided.')}</p></div><div><span>Priority</span><b class="tm-priority tm-priority--${escapeHtml(norm(ticket.priority || 'normal'))}">${escapeHtml(ticket.priority || 'Normal')}</b></div><div><span>Target date</span><b>${escapeHtml(formatDate(ticket.dueDate))}</b></div><div><span>Progress</span><b>${ticket.completedCount || 0}/${ticket.sectionsCount || 0} complete</b></div>`;
    const flow = $('tmWorkflowFlow');
    const sections = ticket.sections || [];
    flow.innerHTML = sections.map((section, index) => {
      const allowed = sectionActionAllowed(ticket, section);
      const previousSections = sections.slice(0, index);
      const isUnlocked = previousSections.every((previous) => previous.status === 'completed');
      const canStart = isUnlocked && section.status === 'not_started';
      const canComplete = isUnlocked && (section.status === 'in_progress' || section.status === 'not_started');
      const waitingMessage = !isUnlocked ? 'Waiting for the previous workflow section' : '';
      return `
        <div class="tm-flow-step ${index === 0 ? 'tm-flow-step--first' : ''}" data-section-id="${escapeHtml(section.id)}">
          <div class="tm-flow-connector" aria-hidden="true"><span>${index + 1}</span></div>
          <article class="tm-workflow-card ${statusClass(section.status)}">
            <div class="tm-workflow-card__top"><div class="tm-department-mark"><i data-feather="briefcase"></i></div><div class="tm-workflow-card__main"><span class="tm-workflow-card__kicker">Section ${index + 1}</span><h3>${escapeHtml(section.department || 'Department')}</h3></div>${statusPill(section.status)}</div>
            <div class="tm-workflow-card__body"><span class="tm-workflow-card__label">Requested action</span><p>${escapeHtml(section.request || '—')}</p>${section.details ? `<div class="tm-workflow-card__details"><span>Details</span><p>${escapeHtml(section.details)}</p></div>` : ''}${section.completionNote ? `<div class="tm-workflow-card__note"><i data-feather="message-square"></i><div><span>Execution note${section.completedByName ? ` · ${escapeHtml(section.completedByName)}` : ''}</span><p>${escapeHtml(section.completionNote)}</p></div></div>` : ''}</div>
            <div class="tm-workflow-card__footer"><span>${waitingMessage || (section.completedAt ? `Completed ${escapeHtml(formatDateTime(section.completedAt))}` : (section.startedAt ? `Started ${escapeHtml(formatDateTime(section.startedAt))}` : 'Waiting to start'))}</span>${allowed && isUnlocked ? `<div class="tm-workflow-card__actions">${canStart ? `<button type="button" class="tm-action-link" data-tm-section-status="in_progress" data-section-id="${escapeHtml(section.id)}"><i data-feather="play"></i>Start</button>` : ''}${canComplete ? `<button type="button" class="tm-action-link tm-action-link--complete" data-tm-section-status="completed" data-section-id="${escapeHtml(section.id)}"><i data-feather="check"></i>Complete</button>` : ''}<button type="button" class="tm-action-link" data-tm-edit-section="${escapeHtml(section.id)}"><i data-feather="edit-3"></i>Update</button></div>` : ''}</div>
          </article>
        </div>`;
    }).join('') || '<div class="tm-empty-state"><h2>No workflow sections</h2><p>This ticket has no configured department sections.</p></div>';
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
    updateError.textContent = '';
    setOverlay(updateOverlay, true);
  }

  async function submitSectionUpdate(event) {
    event.preventDefault();
    const section = state.selectedSection;
    if (!section) return;
    const submit = $('tmUpdateSectionSubmit');
    submit.disabled = true; updateError.textContent = '';
    try {
      const data = await api(`/api/task-management/sections/${encodeURIComponent(section.id)}`, { method: 'PATCH', body: { status: $('tmSectionStatusInput').value, completionNote: $('tmCompletionNoteInput').value.trim() } });
      state.selectedTicket = data.ticket;
      setOverlay(updateOverlay, false);
      await loadTickets();
      const latest = state.tickets.find((ticket) => String(ticket.id) === String(data.ticket?.id)) || data.ticket;
      state.selectedTicket = latest;
      renderWorkflow(latest);
      showToast('success', 'Section updated', 'Workflow progress has been refreshed.');
    } catch (error) { updateError.textContent = error.message || 'Failed to update section.'; }
    finally { submit.disabled = false; }
  }

  async function init() {
    try {
      const meta = await api('/api/task-management/meta');
      state.departments = Array.isArray(meta.departments) ? meta.departments : [];
      window.__tmCurrentUser = meta.currentUser || {};
      window.__tmIsPageAdmin = !!meta.isPageAdmin;
    } catch (error) {
      state.departments = [];
    }
    await loadTickets({ preserve: false });
  }

  document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    $('tmNewTicketBtn')?.addEventListener('click', openCreateForm);
    $('tmAddSectionBtn')?.addEventListener('click', () => createSectionEditor());
    form?.addEventListener('submit', submitCreateForm);
    updateForm?.addEventListener('submit', submitSectionUpdate);
    searchInput?.addEventListener('input', () => { state.query = norm(searchInput.value); renderTickets(); });
    tabs?.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-status]'); if (!tab) return;
      state.activeStatus = tab.dataset.status || 'all';
      tabs.querySelectorAll('[data-status]').forEach((item) => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', active ? 'true' : 'false'); });
      renderTickets();
    });
    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-tm-close]');
      if (close) { const which = close.dataset.tmClose; if (which === 'form') setOverlay(formOverlay, false); if (which === 'workflow') setOverlay(workflowOverlay, false); if (which === 'update') setOverlay(updateOverlay, false); return; }
      if (event.target.closest('[data-tm-new-ticket]')) { openCreateForm(); return; }
      if (event.target.closest('[data-tm-retry]')) { loadTickets({ preserve: false }); return; }
      const ticketCard = event.target.closest('[data-ticket-id]');
      if (ticketCard) { const ticket = state.tickets.find((item) => String(item.id) === String(ticketCard.dataset.ticketId)); if (ticket) openWorkflow(ticket); return; }
      const statusAction = event.target.closest('[data-tm-section-status]');
      if (statusAction) { openSectionUpdate(statusAction.dataset.sectionId, statusAction.dataset.tmSectionStatus); return; }
      const editAction = event.target.closest('[data-tm-edit-section]');
      if (editAction) { openSectionUpdate(editAction.dataset.tmEditSection); return; }
      const remove = event.target.closest('[data-tm-remove-section]');
      if (remove) { const item = remove.closest('[data-section-editor]'); if (sectionsEditor.children.length <= 1) { formError.textContent = 'A ticket needs at least one workflow section.'; return; } item?.remove(); renumberSectionEditors(); return; }
      const move = event.target.closest('[data-tm-move]');
      if (move) { const item = move.closest('[data-section-editor]'); const direction = move.dataset.tmMove; if (direction === 'up' && item?.previousElementSibling) sectionsEditor.insertBefore(item, item.previousElementSibling); if (direction === 'down' && item?.nextElementSibling) sectionsEditor.insertBefore(item.nextElementSibling, item); renumberSectionEditors(); return; }
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (!updateOverlay.hidden) setOverlay(updateOverlay, false); else if (!workflowOverlay.hidden) setOverlay(workflowOverlay, false); else if (!formOverlay.hidden) setOverlay(formOverlay, false); } });
    document.addEventListener('keydown', (event) => { if (event.key !== 'Enter' && event.key !== ' ') return; const card = document.activeElement?.closest?.('[data-ticket-id]'); if (card) { event.preventDefault(); card.click(); } });
    init();
  });
})();

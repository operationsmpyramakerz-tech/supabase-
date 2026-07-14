(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const norm = (value) => String(value ?? '').trim().toLowerCase();
  const statusLabel = (value) => ({ not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }[value] || 'Not started');
  const statusIcon = (value) => ({ not_started: 'circle', in_progress: 'activity', rejected: 'x-octagon', completed: 'check-circle', cancelled: 'slash' }[value] || 'circle');
  const statusClass = (value) => `tm-status--${String(value || 'not_started').replace(/[^a-z_]/g, '')}`;
  const sectionStatusLabel = (value) => ({ not_started: 'Not started', in_progress: 'In progress', rejected: 'Rejected', completed: 'Done', cancelled: 'Cancelled' }[value] || 'Not started');
  const toDate = (value) => { try { return value ? new Date(value) : null; } catch { return null; } };
  const formatDate = (value) => { const date = toDate(value); return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
  const formatDateTime = (value) => { const date = toDate(value); return date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };
  const pad2 = (value) => String(value).padStart(2, '0');
  const localDateKey = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const date = toDate(value);
    return date && !Number.isNaN(date.getTime()) ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` : '';
  };
  const dateFromKey = (key) => {
    const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };
  const todayKey = () => localDateKey(new Date());
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const safeNumber = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
  const newClientId = () => `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const formatBytes = (value) => {
    const bytes = Math.max(0, Number(value) || 0);
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const priorityKey = (value) => {
    const key = norm(value).replace(/[\s_-]+/g, '');
    if (key === 'urgent') return 'urgent';
    if (key === 'high') return 'high';
    if (key === 'low') return 'low';
    return 'normal';
  };
  const attachmentList = (value) => {
    const source = Array.isArray(value?.attachments)
      ? value.attachments
      : (Array.isArray(value) ? value : []);
    const list = source.filter((item) => item && typeof item === 'object' && item.url).map((item) => ({ ...item }));
    const legacy = value && !Array.isArray(value) && value.attachment?.url ? value.attachment : null;
    if (legacy && !list.some((item) => String(item.url) === String(legacy.url))) list.unshift({ ...legacy });
    const seen = new Set();
    return list.filter((item) => {
      const key = String(item.url || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const withAttachmentAliases = (target, attachments) => {
    const list = attachmentList(attachments);
    target.attachments = list.map((item) => ({ ...item }));
    target.attachment = target.attachments[0] ? { ...target.attachments[0] } : null;
    return target;
  };
  const attachmentNames = (value) => attachmentList(value).map((item) => item.name || 'Attachment');
  const attachmentCountLabel = (value) => {
    const files = attachmentList(value);
    if (!files.length) return '';
    return files.length === 1 ? (files[0].name || 'Attachment') : `${files.length} files`;
  };
  const renderAttachmentLinks = (value, emptyMessage = 'No files attached.') => {
    const files = attachmentList(value);
    if (!files.length) return `<div class="tm-section-details__empty"><i data-feather="paperclip"></i><span>${escapeHtml(emptyMessage)}</span></div>`;
    return `<div class="tm-section-details__files">${files.map((file) => `
      <a class="tm-section-details__file" href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer">
        <span class="tm-section-details__file-icon"><i data-feather="paperclip"></i></span>
        <span><b>${escapeHtml(file.name || 'Open attachment')}</b><small>${escapeHtml(formatBytes(file.size || file.sizeBytes || 0) || file.type || 'Attached file')}</small></span>
        <i data-feather="external-link"></i>
      </a>`).join('')}</div>`;
  };

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });

  const pathname = String(window.location?.pathname || '');
  const TASK_VIEW = /^\/task-management\/delegated-tasks(?:\/|$)/.test(pathname)
    ? 'delegated'
    : (/^\/task-management\/all-tasks(?:\/|$)/.test(pathname) ? 'all' : 'my');

  const VIEW_CONFIG = {
    all: {
      label: 'All Tasks', header: 'All Tasks', subtitle: 'All cross-department workflow tickets across the company.',
      emptyTitle: 'No tasks found', emptyText: 'No cross-department workflow tickets have been created yet.', toolbarNoun: 'task',
    },
    my: {
      label: 'My Tasks', header: 'My Tasks', subtitle: 'Tickets with workflow work assigned to your department.',
      emptyTitle: 'No tasks assigned to you', emptyText: 'You do not have any active workflow work assigned to your department yet.', toolbarNoun: 'assigned task',
    },
    delegated: {
      label: 'Delegated Tasks', header: 'Delegated Tasks', subtitle: 'Tickets you created and delegated to other departments.',
      emptyTitle: 'No delegated tasks found', emptyText: 'Create a project to start a workflow between departments.', toolbarNoun: 'delegated task',
    },
  };

  const state = {
    tickets: [],
    filtered: [],
    departments: [],
    activeStatus: 'all',
    activeDepartment: 'all',
    query: '',
    selectedTicket: null,
    selectedSection: null,
    readonlySection: null,
    readonlyAssignment: null,
    view: TASK_VIEW,
    currentUser: {},
    editingBlockId: null,
    startingProject: false,
    blockDraftAttachments: [],
    blockUploadPending: false,
    drag: null,
    pan: null,
    pinch: null,
    pendingBlockPress: null,
    builder: {
      mode: 'create',
      ticketId: '',
      adminPassword: '',
      nodes: [],
      edges: [],
      connecting: false,
      connectFrom: null,
      selectedEdgeKey: '',
      zoom: 1,
      canvas: { width: 1280, height: 900 },
      meta: { title: '', priority: 'Normal', dueDate: '', description: '' },
    },
    pendingEditTicket: null,
    pendingDeleteTicket: null,
    pendingAdminAction: 'edit',
    accessLevel: 'view',
    workSection: null,
    workAssignment: null,
    workTargetType: 'section',
    workFile: null,
    workFileUploadPending: false,
    rejectedReasonDraft: '',
    teamMembers: [],
    peopleWorkflowCache: new Map(),
    peopleWorkflowLoads: new Map(),
    viewer: { zoom: 1, offsetX: 0, offsetY: 0, pan: null, pinch: null, width: 980, height: 650, bounds: null, manual: false },
    calendar: { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDate: todayKey() },
  };

  const grid = $('tmTicketGrid');
  const calendarGrid = $('tmCalendarGrid');
  const calendarMonth = $('tmCalendarMonth');
  const agendaDayTasks = $('tmAgendaDayTasks');
  const searchInput = $('tmSearch');
  const tabs = $('tmTabs');
  const departmentFilter = $('tmDepartmentFilter');
  const departmentFilterBtn = $('tmDepartmentFilterBtn');
  const departmentFilterPanel = $('tmDepartmentFilterPanel');
  const departmentFilterDot = $('tmDepartmentFilterDot');
  const builderOverlay = $('tmBuilderOverlay');
  const metaOverlay = $('tmTicketMetaOverlay');
  const blockOverlay = $('tmBlockEditorOverlay');
  const workflowOverlay = $('tmWorkflowOverlay');
  const sectionDetailsOverlay = $('tmSectionDetailsOverlay');
  const adminOverlay = $('tmAdminVerifyOverlay');
  const updateOverlay = $('tmUpdateSectionOverlay');
  const workPageOverlay = $('tmWorkPageOverlay');
  const rejectReasonOverlay = $('tmRejectReasonOverlay');
  const metaForm = $('tmTicketMetaForm');
  const blockForm = $('tmBlockEditorForm');
  const adminForm = $('tmAdminVerifyForm');
  const updateForm = $('tmUpdateSectionForm');
  const workPageForm = $('tmWorkPageForm');
  const rejectReasonForm = $('tmRejectReasonForm');
  const updateError = $('tmUpdateSectionError');
  const builderBoard = $('tmBuilderBoard');
  const builderArrows = $('tmBuilderArrows');
  const builderCanvasWrap = $('tmBuilderCanvasWrap');
  const workflowCanvasWrap = $('tmWorkflowCanvasWrap');
  const workflowStage = $('tmWorkflowStage');
  const modernSelectControllers = new Set();
  let modernSelectCounter = 0;

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

  function isOverlayOpen(overlay) { return !!overlay && !overlay.hidden; }

  function syncModalState() {
    const modalOpen = [builderOverlay, metaOverlay, blockOverlay, workflowOverlay, sectionDetailsOverlay, adminOverlay, updateOverlay, workPageOverlay, rejectReasonOverlay].some(isOverlayOpen);
    document.body.classList.toggle('tm-modal-open', modalOpen);
  }

  function setOverlay(overlay, open) {
    if (!overlay) return;
    overlay.hidden = !open;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    syncModalState();
    if (open) window.setTimeout(() => overlay.querySelector('input:not(.tm-select__native), textarea, .tm-select__button, button')?.focus(), 45);
  }

  function renderLoading() {
    if (!grid) return;
    grid.innerHTML = '<div class="modern-loading" role="status"><div class="modern-loading__spinner" aria-hidden="true"></div><div class="modern-loading__text">Loading projects <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span></div></div>';
  }

  function statusPill(status) {
    return `<span class="tm-status-pill ${statusClass(status)}"><i data-feather="${statusIcon(status)}"></i>${escapeHtml(statusLabel(status))}</span>`;
  }

  function ticketMatches(ticket) {
    if (state.activeStatus !== 'all' && ticket.status !== state.activeStatus) return false;
    if (state.activeDepartment !== 'all') {
      const matchesDepartment = (ticket.sections || []).some((section) => norm(section.department) === state.activeDepartment);
      if (!matchesDepartment) return false;
    }
    if (!state.query) return true;
    const haystack = [
      ticket.ticketCode, ticket.title, ticket.description, ticket.createdByName,
      ...(ticket.sections || []).flatMap((section) => [section.department, section.request, section.details, section.deliveryDate, ...attachmentNames(section)]),
    ].map(norm).join(' ');
    return haystack.includes(state.query);
  }

  function availableDepartments() {
    const names = new Map();
    const add = (value) => {
      const label = String(value || '').trim();
      const key = norm(label);
      if (key && !names.has(key)) names.set(key, label);
    };
    (state.departments || []).forEach(add);
    (state.tickets || []).forEach((ticket) => (ticket.sections || []).forEach((section) => add(section.department)));
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }));
  }

  function closeDepartmentFilter({ focus = false } = {}) {
    if (!departmentFilter || !departmentFilterPanel || !departmentFilterBtn) return;
    departmentFilter.classList.remove('is-open');
    departmentFilterPanel.hidden = true;
    departmentFilterBtn.setAttribute('aria-expanded', 'false');
    if (focus) departmentFilterBtn.focus();
  }

  function toggleDepartmentFilter(force) {
    if (!departmentFilter || !departmentFilterPanel || !departmentFilterBtn) return;
    const open = typeof force === 'boolean' ? force : departmentFilterPanel.hidden;
    if (!open) { closeDepartmentFilter(); return; }
    renderDepartmentFilter();
    departmentFilter.classList.add('is-open');
    departmentFilterPanel.hidden = false;
    departmentFilterBtn.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => departmentFilterPanel.querySelector('[data-tm-department].is-active, [data-tm-department]')?.focus());
  }

  function renderDepartmentFilter() {
    if (!departmentFilter || !departmentFilterPanel || !departmentFilterBtn) return;
    const departments = availableDepartments();
    if (state.activeDepartment !== 'all' && !departments.some(([key]) => key === state.activeDepartment)) state.activeDepartment = 'all';
    const statusTickets = (state.tickets || []).filter((ticket) => state.activeStatus === 'all' || ticket.status === state.activeStatus);
    const countFor = (departmentKey) => statusTickets.filter((ticket) => (ticket.sections || []).some((section) => norm(section.department) === departmentKey)).length;
    const total = statusTickets.length;
    const active = state.activeDepartment !== 'all';
    departmentFilter.classList.toggle('is-filtered', active);
    if (departmentFilterDot) departmentFilterDot.hidden = !active;
    departmentFilterBtn.setAttribute('aria-label', active ? 'Department filter is active' : 'Filter projects by department');
    departmentFilterPanel.innerHTML = `
      <div class="tm-department-filter__panel-head">
        <div><div class="tm-department-filter__panel-title">Filter by department</div><div class="tm-department-filter__panel-sub">${total} project${total === 1 ? '' : 's'} in this status</div></div>
        ${active ? '<button type="button" class="tm-department-filter__clear" data-tm-clear-department>Clear</button>' : ''}
      </div>
      <div class="tm-department-filter__options">
        <button type="button" class="tm-department-filter__option${state.activeDepartment === 'all' ? ' is-active' : ''}" data-tm-department="all" role="menuitemradio" aria-checked="${state.activeDepartment === 'all'}">
          <span class="tm-department-filter__option-icon"><i data-feather="layers"></i></span>
          <span class="tm-department-filter__option-body"><b>All departments</b><small>${total} project${total === 1 ? '' : 's'}</small></span>
          <span class="tm-department-filter__option-check"><i data-feather="check"></i></span>
        </button>
        ${departments.map(([key, label]) => {
          const count = countFor(key);
          const selected = state.activeDepartment === key;
          return `<button type="button" class="tm-department-filter__option${selected ? ' is-active' : ''}" data-tm-department="${escapeHtml(key)}" role="menuitemradio" aria-checked="${selected}">
            <span class="tm-department-filter__option-icon"><i data-feather="briefcase"></i></span>
            <span class="tm-department-filter__option-body"><b>${escapeHtml(label)}</b><small>${count} project${count === 1 ? '' : 's'}</small></span>
            <span class="tm-department-filter__option-check"><i data-feather="check"></i></span>
          </button>`;
        }).join('') || '<div class="tm-department-filter__empty">No departments are available yet.</div>'}
      </div>`;
    hydrateIcons(departmentFilterPanel);
  }

  function ticketsOnDate(dateKey) {
    return (state.tickets || []).filter((ticket) => localDateKey(ticket.dueDate) === dateKey);
  }

  function renderAgendaTask(ticket) {
    const progress = Math.max(0, Math.min(100, Number(ticket.progress) || 0));
    return `<button type="button" class="tm-agenda-task" data-ticket-id="${escapeHtml(ticket.id)}" aria-label="Open ${escapeHtml(ticket.ticketCode)}">
      <span class="tm-agenda-task__priority tm-agenda-task__priority--${escapeHtml(priorityKey(ticket.priority))}"></span>
      <span class="tm-agenda-task__body"><small>${escapeHtml(ticket.ticketCode)}</small><b>${escapeHtml(ticket.title)}</b><span>${escapeHtml(statusLabel(ticket.status))} · ${ticket.completedCount || 0}/${ticket.sectionsCount || 0} complete</span></span>
      <span class="tm-agenda-task__progress"><i style="--tm-agenda-progress:${progress}%"></i><b>${progress}%</b></span>
      <i data-feather="chevron-right"></i>
    </button>`;
  }

  function renderAgenda() {
    if (!calendarGrid || !agendaDayTasks) return;
    const monthDate = state.calendar.month instanceof Date && !Number.isNaN(state.calendar.month.getTime())
      ? state.calendar.month : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    if (calendarMonth) calendarMonth.textContent = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const counts = new Map();
    (state.tickets || []).forEach((ticket) => {
      const key = localDateKey(ticket.dueDate);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    const firstDayMondayIndex = (new Date(year, month, 1).getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - firstDayMondayIndex);
    const today = todayKey();
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      const key = localDateKey(date);
      const count = counts.get(key) || 0;
      const otherMonth = date.getMonth() !== month;
      const selected = key === state.calendar.selectedDate;
      const classes = ['tm-calendar-day'];
      if (otherMonth) classes.push('is-outside');
      if (count) classes.push('has-tasks');
      if (selected) classes.push('is-selected');
      if (key === today) classes.push('is-today');
      cells.push(`<button type="button" class="${classes.join(' ')}" data-tm-calendar-day="${key}" aria-label="${escapeHtml(date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${count ? `, ${count} task${count === 1 ? '' : 's'}` : ', no tasks'}" aria-selected="${selected ? 'true' : 'false'}">
        <span>${date.getDate()}</span>${count ? `<b>${count}</b>` : ''}
      </button>`);
    }
    calendarGrid.innerHTML = cells.join('');

    const selectedKey = state.calendar.selectedDate || today;
    const selectedDate = dateFromKey(selectedKey) || new Date();
    const dayTickets = ticketsOnDate(selectedKey);
    const isToday = selectedKey === today;
    const dayNumber = $('tmAgendaDayNumber');
    const dayName = $('tmAgendaDayName');
    const dayKicker = $('tmAgendaDayKicker');
    const dayTitle = $('tmAgendaDayTitle');
    const dayCount = $('tmAgendaDayCount');
    if (dayNumber) dayNumber.textContent = String(selectedDate.getDate());
    if (dayName) dayName.textContent = selectedDate.toLocaleDateString(undefined, { weekday: 'long' });
    if (dayKicker) dayKicker.textContent = isToday ? 'Today' : selectedDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    if (dayTitle) dayTitle.textContent = isToday ? 'Today tasks' : `Tasks on ${selectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    if (dayCount) dayCount.textContent = String(dayTickets.length);
    agendaDayTasks.innerHTML = dayTickets.length
      ? dayTickets.map(renderAgendaTask).join('')
      : `<div class="tm-agenda-empty"><i data-feather="calendar"></i><b>No tasks on this date</b><span>Select a dark calendar day to view its scheduled tasks.</span></div>`;
    hydrateIcons(calendarGrid);
    hydrateIcons(agendaDayTasks);
  }

  function renderTickets() {
    if (!grid) return;
    renderAgenda();
    state.filtered = (state.tickets || []).filter(ticketMatches);
    renderDepartmentFilter();

    if (!state.filtered.length) {
      grid.innerHTML = `
        <div class="tm-empty-state">
          <div class="tm-empty-state__icon"><i data-feather="git-branch"></i></div>
          <h2>${escapeHtml(VIEW_CONFIG[state.view].emptyTitle)}</h2>
          <p>${escapeHtml(VIEW_CONFIG[state.view].emptyText)}</p>
          ${state.view === 'delegated' ? '<button class="tm-btn tm-btn--primary" type="button" data-tm-new-ticket><i data-feather="plus"></i>Add Project</button>' : ''}
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
            <div class="tm-ticket-thumb tm-ticket-thumb--${escapeHtml(priorityKey(ticket.priority))}" title="${escapeHtml(ticket.priority || 'Normal')} priority"><i data-feather="git-branch"></i></div>
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
      state.tickets.forEach(attachCachedPeopleWorkflows);
      renderTickets();
      if (state.selectedTicket?.id && isOverlayOpen(workflowOverlay)) {
        const selected = state.tickets.find((ticket) => String(ticket.id) === String(state.selectedTicket.id));
        if (selected) { state.selectedTicket = selected; renderWorkflow(selected); }
      }
    } catch (error) {
      grid.innerHTML = `<div class="tm-empty-state tm-empty-state--error"><div class="tm-empty-state__icon"><i data-feather="alert-circle"></i></div><h2>Could not load projects</h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button class="tm-btn tm-btn--secondary" type="button" data-tm-retry>Retry</button></div>`;
      hydrateIcons(grid);
    }
  }

  function closeModernSelects(except = null) {
    modernSelectControllers.forEach((controller) => {
      if (controller !== except) controller.close();
    });
  }

  function enhanceModernSelect(select) {
    if (!select) return null;
    const existing = select.__tmModernSelect;
    if (existing) { existing.refresh(); return existing; }

    modernSelectCounter += 1;
    const listId = `tmModernSelectList-${modernSelectCounter}`;
    const shell = document.createElement('div');
    shell.className = 'tm-select';
    select.parentNode.insertBefore(shell, select);
    shell.appendChild(select);
    select.classList.add('tm-select__native');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;

    const trigger = document.createElement('div');
    trigger.className = 'tm-select__button';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', listId);
    trigger.innerHTML = '<span class="tm-select__value"></span><span class="tm-select__chevron"><i data-feather="chevron-down"></i></span>';

    const menu = document.createElement('div');
    menu.className = 'tm-select__menu';
    menu.id = listId;
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    shell.append(trigger, menu);

    const controller = {
      select, shell, trigger, menu,
      refresh() {
        const options = [...select.options];
        const selected = options.find((option) => option.selected) || options[0];
        const value = trigger.querySelector('.tm-select__value');
        const isPriority = select.dataset.tmPrioritySelect === 'true' || select.id === 'tmMetaPriorityInput';
        shell.classList.toggle('tm-select--priority', isPriority);
        const selectedPriority = priorityKey(selected?.value || selected?.textContent || 'normal');
        if (value) {
          value.innerHTML = isPriority
            ? `<span class="tm-priority-marker tm-priority-marker--${selectedPriority}" aria-hidden="true"></span><span>${escapeHtml(selected?.textContent?.trim() || 'Select')}</span>`
            : escapeHtml(selected?.textContent?.trim() || 'Select');
        }
        trigger.dataset.priority = isPriority ? selectedPriority : '';
        trigger.classList.toggle('is-placeholder', !selected?.value);
        trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
        trigger.tabIndex = select.disabled ? -1 : 0;
        menu.innerHTML = options.map((option, index) => {
          const optionPriority = priorityKey(option.value || option.textContent || 'normal');
          return `
          <div class="tm-select__option${option.selected ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}${isPriority ? ` tm-select__option--priority tm-select__option--${optionPriority}` : ''}" role="option" tabindex="-1" data-tm-select-index="${index}" aria-selected="${option.selected}" aria-disabled="${option.disabled}">
            <span class="tm-select__option-main">${isPriority ? `<span class="tm-priority-marker tm-priority-marker--${optionPriority}" aria-hidden="true"></span>` : ''}<span>${escapeHtml(option.textContent?.trim() || '')}</span></span><i data-feather="check"></i>
          </div>`;
        }).join('');
        hydrateIcons(shell);
      },
      open() {
        if (select.disabled) return;
        closeModernSelects(controller);
        controller.refresh();
        const rect = trigger.getBoundingClientRect();
        shell.classList.toggle('is-dropup', (window.innerHeight - rect.bottom) < 250 && rect.top > 250);
        shell.classList.add('is-open');
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(() => menu.querySelector('.tm-select__option.is-selected, .tm-select__option:not(.is-disabled)')?.focus());
      },
      close({ focus = false } = {}) {
        shell.classList.remove('is-open', 'is-dropup');
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (focus) trigger.focus();
      },
      toggle() {
        if (menu.hidden) controller.open(); else controller.close();
      },
    };

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      controller.toggle();
    });
    trigger.addEventListener('keydown', (event) => {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        controller.open();
      }
    });
    menu.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const optionEl = event.target.closest('[data-tm-select-index]');
      if (!optionEl) return;
      const option = select.options[Number(optionEl.dataset.tmSelectIndex)];
      if (!option || option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      controller.refresh();
      controller.close({ focus: true });
    });
    menu.addEventListener('keydown', (event) => {
      const items = [...menu.querySelectorAll('.tm-select__option:not(.is-disabled)')];
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); controller.close({ focus: true }); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        items[(index + delta + items.length) % items.length]?.focus();
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        document.activeElement?.click?.();
      }
    });
    select.addEventListener('change', () => controller.refresh());
    select.__tmModernSelect = controller;
    modernSelectControllers.add(controller);
    controller.refresh();
    return controller;
  }

  function enhanceAllModernSelects(root = document) {
    root.querySelectorAll?.('.tm-field select').forEach((select) => enhanceModernSelect(select));
  }

  function refreshModernSelect(select) {
    return enhanceModernSelect(select)?.refresh();
  }

  // ---------------------------------------------------------------------------
  // Visual workflow builder
  // ---------------------------------------------------------------------------
  function resetBuilder() {
    state.builder = {
      mode: 'create',
      ticketId: '',
      adminPassword: '',
      nodes: [],
      edges: [],
      connecting: false,
      connectFrom: null,
      selectedEdgeKey: '',
      zoom: 1,
      canvas: { width: 1280, height: 900 },
      meta: { title: '', priority: 'Normal', dueDate: '', description: '' },
      contextSectionId: '',
      returnToWorkPage: false,
      returnToSectionDetails: false,
    };
    state.pendingEditTicket = null;
    state.editingBlockId = null;
    state.startingProject = false;
    state.blockDraftAttachments = [];
    state.blockUploadPending = false;
    state.drag = null;
    state.pan = null;
    state.pinch = null;
    clearPendingBlockPress();
    syncBuilderModeLabels();
  }

  function syncBuilderModeLabels() {
    const peopleMode = state.builder?.mode === 'people';
    const editing = state.builder?.mode === 'edit';
    const title = $('tmBuilderTitle');
    const saveLabel = $('tmSaveWorkflowLabel');
    const addLabel = $('tmAddBlockBtn')?.querySelector('span');
    const detailsButton = $('tmTaskDetailsBtn');
    const ownerLabel = $('tmBlockOwnerLabel');
    const requestLabel = $('tmBlockRequestLabel');
    if (title) title.textContent = peopleMode ? 'Team Task Workflow' : (editing ? 'Edit Project Workflow' : 'Create Project Workflow');
    if (saveLabel) saveLabel.textContent = peopleMode ? 'Save Team Workflow' : (editing ? 'Save Changes' : 'Create Project');
    if (addLabel) addLabel.textContent = peopleMode ? 'Add Person Task' : 'Add Block';
    if (detailsButton) detailsButton.hidden = peopleMode;
    if (ownerLabel) ownerLabel.innerHTML = peopleMode ? 'Responsible team member <b>*</b>' : 'Responsible department <b>*</b>';
    if (requestLabel) requestLabel.innerHTML = peopleMode ? 'Assigned task <b>*</b>' : 'Requested action <b>*</b>';
    builderBoard?.classList.toggle('is-people-mode', peopleMode);
    builderOverlay?.classList.toggle('is-people-mode', peopleMode);
    const empty = $('tmBuilderEmpty');
    if (empty && peopleMode) empty.innerHTML = '<i data-feather="git-branch"></i><b>Your team workflow canvas is ready</b><span>Add person tasks vertically, then connect each card from its bottom point to the next card’s top point.</span>';
    else if (empty) empty.innerHTML = '<i data-feather="git-branch"></i><b>Your workflow canvas is ready</b><span>Use <strong>Add Block</strong> to create a department task, then click a block’s output point and another block’s input point to connect the execution path.</span>';
    hydrateIcons(empty || document);
  }

  function builderZoom() {
    return clamp(safeNumber(state.builder?.zoom, 1), 0.4, 1.8);
  }

  function nextBlockPosition() {
    const count = state.builder.nodes.length;
    const zoom = builderZoom();
    const visibleCenterX = (safeNumber(builderCanvasWrap?.scrollLeft) + Math.max(620, safeNumber(builderCanvasWrap?.clientWidth, 920)) / 2) / zoom;
    const visibleCenterY = (safeNumber(builderCanvasWrap?.scrollTop) + Math.max(360, safeNumber(builderCanvasWrap?.clientHeight, 560)) / 2) / zoom;
    if (state.builder.mode === 'people') {
      return {
        x: Math.max(70, Math.round(visibleCenterX - 150)),
        y: Math.max(80, Math.round(visibleCenterY - 86 + count * 190)),
      };
    }
    const column = count % 3;
    const row = Math.floor(count / 3);
    return {
      x: Math.max(70, Math.round(visibleCenterX - 150 + (column - 1) * 330)),
      y: Math.max(80, Math.round(visibleCenterY - 86 + row * 230)),
    };
  }

  function arrangePeopleNodesVertically(nodes = [], edges = []) {
    if (!nodes.length) return nodes;
    const ids = new Set(nodes.map((node) => String(node.id)));
    const incoming = new Map([...ids].map((id) => [id, 0]));
    const outgoing = new Map([...ids].map((id) => [id, []]));
    (edges || []).forEach((edge) => {
      const from = String(edge.from || '');
      const to = String(edge.to || '');
      if (!ids.has(from) || !ids.has(to) || from === to) return;
      outgoing.get(from).push(to);
      incoming.set(to, (incoming.get(to) || 0) + 1);
    });
    const rank = new Map([...ids].map((id) => [id, 0]));
    const queue = [...ids].filter((id) => incoming.get(id) === 0);
    let processed = 0;
    while (queue.length) {
      const id = queue.shift();
      processed += 1;
      (outgoing.get(id) || []).forEach((to) => {
        rank.set(to, Math.max(rank.get(to) || 0, (rank.get(id) || 0) + 1));
        incoming.set(to, incoming.get(to) - 1);
        if (incoming.get(to) === 0) queue.push(to);
      });
    }
    if (processed !== nodes.length) nodes.forEach((node, index) => rank.set(String(node.id), index));
    const layers = new Map();
    nodes.forEach((node) => {
      const level = rank.get(String(node.id)) || 0;
      if (!layers.has(level)) layers.set(level, []);
      layers.get(level).push(node);
    });
    const centerX = 640;
    const cardWidth = 300;
    const gapX = 40;
    const gapY = 205;
    [...layers.entries()].sort((a, b) => a[0] - b[0]).forEach(([level, layer]) => {
      const ordered = layer.slice().sort((a, b) => (safeNumber(a.y) - safeNumber(b.y)) || (safeNumber(a.x) - safeNumber(b.x)));
      const totalWidth = ordered.length * cardWidth + Math.max(0, ordered.length - 1) * gapX;
      const startX = Math.max(70, centerX - totalWidth / 2);
      ordered.forEach((node, index) => {
        node.x = startX + index * (cardWidth + gapX);
        node.y = 80 + level * gapY;
      });
    });
    return nodes;
  }

  function addBuilderNode() {
    const position = nextBlockPosition();
    state.builder.nodes.push({ id: newClientId(), department: '', assigneeId: '', request: '', details: '', deliveryDate: '', attachments: [], attachment: null, x: position.x, y: position.y });
    renderBuilder();
    updateBuilderStatus(state.builder.mode === 'people'
      ? 'New person task added. Use Edit to choose the team member and assigned task.'
      : 'New block added. Use Edit to set its department and requested action.');
  }

  function findBuilderNode(id) {
    return state.builder.nodes.find((node) => String(node.id) === String(id)) || null;
  }

  function edgeKey(edge) { return `${String(edge.from)}::${String(edge.to)}`; }

  // Number blocks from the dependency graph, not from the order in which they were added.
  // A serial path becomes 1 → 2 → 3. Nodes in the same dependency level are parallel
  // and become 2.1 / 2.2, ordered by their visual placement in the canvas.
  function workflowNumbering(nodes = [], edges = []) {
    const records = (nodes || []).map((node, index) => ({ node, id: String(node?.id || ''), index }));
    const recordById = new Map(records.filter((record) => record.id).map((record) => [record.id, record]));
    const outgoing = new Map(records.map((record) => [record.id, []]));
    const incoming = new Map(records.map((record) => [record.id, 0]));

    (edges || []).forEach((edge) => {
      const from = String(edge?.from ?? edge?.fromSectionId ?? edge?.from_section_id ?? '');
      const to = String(edge?.to ?? edge?.toSectionId ?? edge?.to_section_id ?? '');
      if (!recordById.has(from) || !recordById.has(to) || from === to) return;
      outgoing.get(from).push(to);
      incoming.set(to, (incoming.get(to) || 0) + 1);
    });

    const rank = new Map(records.map((record) => [record.id, 1]));
    const queue = records
      .filter((record) => incoming.get(record.id) === 0)
      .sort((a, b) => (safeNumber(a.node?.x) - safeNumber(b.node?.x)) || (safeNumber(a.node?.y) - safeNumber(b.node?.y)) || (a.index - b.index))
      .map((record) => record.id);
    let processed = 0;

    while (queue.length) {
      const id = queue.shift();
      processed += 1;
      (outgoing.get(id) || []).forEach((nextId) => {
        rank.set(nextId, Math.max(rank.get(nextId) || 1, (rank.get(id) || 1) + 1));
        incoming.set(nextId, (incoming.get(nextId) || 0) - 1);
        if (incoming.get(nextId) === 0) queue.push(nextId);
      });
    }

    // A circular workflow cannot be saved, but keep every temporary block labelled while editing.
    if (processed !== records.length) records.forEach((record, index) => rank.set(record.id, index + 1));

    const layers = new Map();
    records.forEach((record) => {
      const level = rank.get(record.id) || 1;
      if (!layers.has(level)) layers.set(level, []);
      layers.get(level).push(record);
    });

    const labels = new Map();
    [...layers.entries()].sort((a, b) => a[0] - b[0]).forEach(([level, layer]) => {
      layer
        .slice()
        .sort((a, b) => (safeNumber(a.node?.y) - safeNumber(b.node?.y)) || (safeNumber(a.node?.x) - safeNumber(b.node?.x)) || (a.index - b.index))
        .forEach((record, index) => labels.set(record.id, layer.length === 1 ? String(level) : `${level}.${index + 1}`));
    });
    return labels;
  }

  function orderedBuilderNodes() {
    const labels = workflowNumbering(state.builder.nodes, state.builder.edges);
    const labelParts = (label) => String(label || '').split('.').map((part) => safeNumber(part, 0));
    return state.builder.nodes.slice().sort((a, b) => {
      const aa = labelParts(labels.get(String(a.id)));
      const bb = labelParts(labels.get(String(b.id)));
      if (aa[0] !== bb[0]) return aa[0] - bb[0];
      return (aa[1] || 0) - (bb[1] || 0);
    });
  }

  function nodeVisualSize(node, defaults = {}) {
    return {
      width: Math.max(1, safeNumber(node?._visualWidth, safeNumber(defaults.width, 300))),
      height: Math.max(1, safeNumber(node?._visualHeight, safeNumber(defaults.height, 138))),
    };
  }

  function measureBuilderNodes() {
    if (!builderBoard) return;
    state.builder.nodes.forEach((node) => {
      const element = [...builderBoard.querySelectorAll('[data-builder-block]')]
        .find((item) => String(item.dataset.builderBlock) === String(node.id));
      if (!element) return;
      node._visualWidth = Math.max(1, element.offsetWidth || 300);
      node._visualHeight = Math.max(1, element.offsetHeight || 138);
    });
  }

  function renderBuilder() {
    if (!builderBoard) return;
    const empty = $('tmBuilderEmpty');
    if (empty) empty.hidden = state.builder.nodes.length > 0;
    builderBoard.classList.toggle('is-awaiting-target', !!state.builder.connecting && !!state.builder.connectFrom);

    builderBoard.querySelectorAll('[data-builder-block]').forEach((node) => node.remove());
    const labels = workflowNumbering(state.builder.nodes, state.builder.edges);
    const peopleMode = state.builder.mode === 'people';
    builderBoard.classList.toggle('is-people-mode', peopleMode);
    state.builder.nodes.forEach((node) => {
      const block = document.createElement('article');
      const isSource = state.builder.connecting && state.builder.connectFrom === node.id;
      block.className = `tm-builder-block${peopleMode ? ' tm-builder-block--people' : ''}${isSource ? ' is-connect-source' : ''}`;
      block.dataset.builderBlock = node.id;
      block.style.left = `${Math.max(16, safeNumber(node.x, 60))}px`;
      block.style.top = `${Math.max(16, safeNumber(node.y, 80))}px`;
      const number = labels.get(String(node.id)) || '—';
      block.innerHTML = `
        <div class="tm-builder-block__head" data-tm-drag-handle>
          <div class="tm-builder-block__number">${escapeHtml(number)}</div>
          <div class="tm-builder-block__title"><b>${escapeHtml(node.department || (state.builder.mode === 'people' ? 'Person Task' : 'Workflow Block'))}</b>${node.department ? '' : '<small>Needs configuration</small>'}</div>
          <div class="tm-builder-block__actions">
            <button type="button" class="tm-builder-icon-btn" data-tm-edit-block="${escapeHtml(node.id)}" aria-label="Edit block"><i data-feather="edit-3"></i></button>
            <button type="button" class="tm-builder-icon-btn tm-builder-icon-btn--danger" data-tm-delete-block="${escapeHtml(node.id)}" aria-label="Delete block"><i data-feather="trash-2"></i></button>
          </div>
        </div>
        <div class="tm-builder-block__body">
          <span class="tm-builder-block__label">${state.builder.mode === 'people' ? 'Assigned task' : 'Requested action'}</span>
          <strong>${escapeHtml(node.request || 'Click Edit to configure this block')}</strong>
          ${(node.deliveryDate || attachmentList(node).length) ? `<div class="tm-builder-block__meta">${node.deliveryDate ? `<span class="tm-builder-block__delivery"><i data-feather="calendar"></i>${escapeHtml(formatDate(node.deliveryDate))}</span>` : ''}${attachmentList(node).length ? `<span class="tm-builder-block__attachment"><i data-feather="paperclip"></i>${escapeHtml(attachmentCountLabel(node))}</span>` : ''}</div>` : ''}
        </div>
        <button type="button" class="tm-builder-socket ${peopleMode ? 'tm-builder-socket--top' : 'tm-builder-socket--in'}" data-tm-socket="in" data-tm-socket-node="${escapeHtml(node.id)}" aria-label="Connect an incoming arrow to this block" title="Incoming connection"></button>
        <button type="button" class="tm-builder-socket ${peopleMode ? 'tm-builder-socket--bottom' : 'tm-builder-socket--out'}" data-tm-socket="out" data-tm-socket-node="${escapeHtml(node.id)}" aria-label="Start an arrow from this block" title="Start connection"></button>`;
      builderBoard.appendChild(block);
    });
    measureBuilderNodes();
    renderBuilderArrows();
    hydrateIcons(builderBoard);
    updateBuilderToolbar();
  }

  function getBoardDimensions(nodes = [], minimum = {}) {
    const minWidth = Math.max(980, safeNumber(minimum.width, 980));
    const minHeight = Math.max(650, safeNumber(minimum.height, 650));
    const maxX = Math.max(minWidth, ...nodes.map((node) => safeNumber(node.x, 0) + nodeVisualSize(node).width + 90));
    const maxY = Math.max(minHeight, ...nodes.map((node) => safeNumber(node.y, 0) + nodeVisualSize(node).height + 110));
    return { width: Math.ceil(maxX), height: Math.ceil(maxY) };
  }

  function pathGeometry(from, to, { blockWidth = 300, blockHeight = 138, orientation = 'horizontal' } = {}) {
    const fromSize = nodeVisualSize(from, { width: blockWidth, height: blockHeight });
    const toSize = nodeVisualSize(to, { width: blockWidth, height: blockHeight });
    if (orientation === 'vertical') {
      const sx = safeNumber(from.x) + (fromSize.width / 2);
      const sy = safeNumber(from.y) + fromSize.height;
      const tx = safeNumber(to.x) + (toSize.width / 2);
      const ty = safeNumber(to.y);
      const verticalDistance = Math.max(78, Math.abs(ty - sy) * 0.48);
      const direction = ty >= sy ? 1 : -1;
      return {
        sx, sy, tx, ty,
        c1x: sx,
        c1y: sy + (verticalDistance * direction),
        c2x: tx,
        c2y: ty - (verticalDistance * direction),
        orientation,
      };
    }
    const sx = safeNumber(from.x) + fromSize.width;
    const sy = safeNumber(from.y) + (fromSize.height / 2);
    const tx = safeNumber(to.x);
    const ty = safeNumber(to.y) + (toSize.height / 2);
    const horizontalDistance = Math.max(95, Math.abs(tx - sx) * 0.48);
    const direction = tx >= sx ? 1 : -1;
    return {
      sx, sy, tx, ty,
      c1x: sx + (horizontalDistance * direction),
      c1y: sy,
      c2x: tx - (horizontalDistance * direction),
      c2y: ty,
      orientation,
    };
  }

  function pathBetween(from, to, options = {}) {
    const geometry = pathGeometry(from, to, options);
    return `M ${geometry.sx} ${geometry.sy} C ${geometry.c1x} ${geometry.c1y}, ${geometry.c2x} ${geometry.c2y}, ${geometry.tx} ${geometry.ty}`;
  }

  function cubicPointAtMidpoint(from, to, options = {}) {
    const { sx, sy, tx, ty, c1x, c1y, c2x, c2y } = pathGeometry(from, to, options);
    const t = 0.5;
    const mt = 1 - t;
    return {
      x: (mt ** 3 * sx) + (3 * mt ** 2 * t * c1x) + (3 * mt * t ** 2 * c2x) + (t ** 3 * tx),
      y: (mt ** 3 * sy) + (3 * mt ** 2 * t * c1y) + (3 * mt * t ** 2 * c2y) + (t ** 3 * ty),
    };
  }

  function renderArrowLayer(svg, edges, getNode, dimensions, className = 'tm-builder-arrow', options = {}) {
    if (!svg) return;
    const markerId = options.markerId || (className === 'tm-builder-arrow' ? 'tmBuilderArrowHead' : 'tmWorkflowArrowHead');
    const interactive = !!options.interactive;
    const selectedEdgeKey = String(options.selectedEdgeKey || '');
    svg.setAttribute('width', String(dimensions.width));
    svg.setAttribute('height', String(dimensions.height));
    svg.setAttribute('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
    const markerMarkup = `<marker id="${markerId}" markerWidth="6.5" markerHeight="6.5" refX="5.5" refY="2.45" orient="auto"><path d="M0,0 L0,4.9 L5.8,2.45 z" class="tm-arrow-marker" /></marker>`;
    svg.innerHTML = `<defs>${markerMarkup}</defs>${(edges || []).map((edge) => {
      const from = getNode(edge.from ?? edge.fromSectionId ?? edge.from_section_id);
      const to = getNode(edge.to ?? edge.toSectionId ?? edge.to_section_id);
      if (!from || !to) return '';
      const key = edgeKey({ from: edge.from ?? edge.fromSectionId ?? edge.from_section_id, to: edge.to ?? edge.toSectionId ?? edge.to_section_id });
      const selectedClass = selectedEdgeKey && selectedEdgeKey === key ? ' is-selected' : '';
      const interactiveAttr = interactive ? ` data-tm-builder-edge="${escapeHtml(key)}"` : '';
      return `<path class="${className}${selectedClass}" d="${pathBetween(from, to, options)}" marker-end="url(#${markerId})"${interactiveAttr}></path>`;
    }).join('')}`;
  }

  function renderBuilderArrows() {
    if (!builderArrows || !builderBoard) return;
    const dimensions = getBoardDimensions(state.builder.nodes, state.builder.canvas || {});
    state.builder.canvas.width = Math.max(safeNumber(state.builder.canvas?.width, 1280), dimensions.width);
    state.builder.canvas.height = Math.max(safeNumber(state.builder.canvas?.height, 900), dimensions.height);
    builderBoard.style.width = `${dimensions.width}px`;
    builderBoard.style.height = `${dimensions.height}px`;
    builderBoard.style.zoom = String(builderZoom());
    renderArrowLayer(builderArrows, state.builder.edges, (id) => findBuilderNode(id), dimensions, 'tm-builder-arrow', {
      interactive: true,
      selectedEdgeKey: state.builder.selectedEdgeKey,
      markerId: 'tmBuilderArrowHead',
      orientation: state.builder.mode === 'people' ? 'vertical' : 'horizontal',
    });
    renderBuilderEdgeDeleteControl();
  }

  function renderBuilderEdgeDeleteControl() {
    if (!builderBoard) return;
    builderBoard.querySelectorAll('[data-builder-edge-delete]').forEach((element) => element.remove());
    const selectedKey = String(state.builder.selectedEdgeKey || '');
    if (!selectedKey) return;
    const edge = state.builder.edges.find((item) => edgeKey(item) === selectedKey);
    const from = edge ? findBuilderNode(edge.from) : null;
    const to = edge ? findBuilderNode(edge.to) : null;
    if (!edge || !from || !to) {
      state.builder.selectedEdgeKey = '';
      return;
    }
    const midpoint = cubicPointAtMidpoint(from, to, { orientation: state.builder.mode === 'people' ? 'vertical' : 'horizontal' });
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tm-builder-edge-delete';
    button.dataset.builderEdgeDelete = selectedKey;
    button.setAttribute('aria-label', 'Delete selected arrow');
    button.setAttribute('title', 'Delete arrow');
    button.style.left = `${Math.round(midpoint.x)}px`;
    button.style.top = `${Math.round(midpoint.y)}px`;
    button.innerHTML = '<i data-feather="x"></i>';
    builderBoard.appendChild(button);
    hydrateIcons(button);
  }

  function paintBuilderNodePositions() {
    if (!builderBoard) return;
    state.builder.nodes.forEach((node) => {
      const block = [...builderBoard.querySelectorAll('[data-builder-block]')].find((item) => String(item.dataset.builderBlock) === String(node.id));
      if (!block) return;
      block.style.left = `${safeNumber(node.x, 60)}px`;
      block.style.top = `${safeNumber(node.y, 80)}px`;
    });
  }

  function expandBuilderCanvas({ left = 0, top = 0, right = 0, bottom = 0 } = {}) {
    const shiftX = Math.max(0, Math.ceil(safeNumber(left, 0)));
    const shiftY = Math.max(0, Math.ceil(safeNumber(top, 0)));
    const growRight = Math.max(0, Math.ceil(safeNumber(right, 0)));
    const growBottom = Math.max(0, Math.ceil(safeNumber(bottom, 0)));
    if (!(shiftX || shiftY || growRight || growBottom)) return;

    if (shiftX || shiftY) {
      state.builder.nodes.forEach((node) => {
        node.x = safeNumber(node.x) + shiftX;
        node.y = safeNumber(node.y) + shiftY;
      });
      if (state.drag) {
        state.drag.startX += shiftX;
        state.drag.startY += shiftY;
      }
      if (state.pendingBlockPress) {
        state.pendingBlockPress.startX += shiftX;
        state.pendingBlockPress.startY += shiftY;
      }
    }

    state.builder.canvas.width = Math.max(1280, safeNumber(state.builder.canvas?.width, 1280) + shiftX + growRight);
    state.builder.canvas.height = Math.max(900, safeNumber(state.builder.canvas?.height, 900) + shiftY + growBottom);
    renderBuilderArrows();
    paintBuilderNodePositions();
    if (builderCanvasWrap) {
      if (shiftX) builderCanvasWrap.scrollLeft += shiftX * builderZoom();
      if (shiftY) builderCanvasWrap.scrollTop += shiftY * builderZoom();
    }
  }

  function ensureBuilderRoomForNode(node) {
    if (!node) return;
    const margin = 180;
    const blockSize = nodeVisualSize(node, { width: 300, height: 138 });
    const blockWidth = blockSize.width;
    const blockHeight = blockSize.height;
    const canvas = state.builder.canvas || { width: 1280, height: 900 };
    const left = safeNumber(node.x) < margin ? (margin - safeNumber(node.x) + 560) : 0;
    const top = safeNumber(node.y) < margin ? (margin - safeNumber(node.y) + 420) : 0;
    if (left || top) expandBuilderCanvas({ left, top });

    const activeCanvas = state.builder.canvas || canvas;
    const right = safeNumber(node.x) + blockWidth + margin > safeNumber(activeCanvas.width, 1280)
      ? safeNumber(node.x) + blockWidth + margin - safeNumber(activeCanvas.width, 1280) + 560
      : 0;
    const bottom = safeNumber(node.y) + blockHeight + margin > safeNumber(activeCanvas.height, 900)
      ? safeNumber(node.y) + blockHeight + margin - safeNumber(activeCanvas.height, 900) + 420
      : 0;
    if (right || bottom) expandBuilderCanvas({ right, bottom });
  }

  function ensureBuilderPanRoom(pan, nextLeft, nextTop) {
    if (!builderCanvasWrap || !builderBoard || !pan) return;
    const edge = 120;
    const maxLeft = Math.max(0, builderBoard.scrollWidth - builderCanvasWrap.clientWidth);
    const maxTop = Math.max(0, builderBoard.scrollHeight - builderCanvasWrap.clientHeight);
    let left = 0; let top = 0; let right = 0; let bottom = 0;
    if (nextLeft < edge) left = 700;
    if (nextTop < edge) top = 520;
    if (nextLeft > maxLeft - edge) right = 700;
    if (nextTop > maxTop - edge) bottom = 520;
    if (!(left || top || right || bottom)) return;
    expandBuilderCanvas({ left, top, right, bottom });
    pan.startScrollLeft += left * builderZoom();
    pan.startScrollTop += top * builderZoom();
  }

  function updateBuilderToolbar() {
    const zoom = builderZoom();
    const label = $('tmZoomLabel');
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    const zoomOut = $('tmZoomOutBtn');
    const zoomIn = $('tmZoomInBtn');
    if (zoomOut) zoomOut.disabled = zoom <= 0.4;
    if (zoomIn) zoomIn.disabled = zoom >= 1.8;
  }

  function updateBuilderStatus(message = '') {
    const el = $('tmBuilderStatus');
    if (!el) return;
    if (message) { el.textContent = message; return; }
    if (!state.builder.nodes.length) { el.textContent = 'Add a block to begin designing the workflow.'; return; }
    if (state.builder.connecting && state.builder.connectFrom) { el.textContent = 'Now click the input point on the destination block.'; return; }
    el.textContent = `${state.builder.nodes.length} block${state.builder.nodes.length === 1 ? '' : 's'} · ${state.builder.edges.length} arrow${state.builder.edges.length === 1 ? '' : 's'}`;
  }

  function openCreateBuilder() {
    if (state.view !== 'delegated') { showToast('info', 'Delegated Tasks only', 'Create new projects from the Delegated Tasks page.'); return; }
    if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess.showViewOnlyNotice(); return; }
    resetBuilder();
    state.builder.mode = 'create';
    syncBuilderModeLabels();
    state.startingProject = true;
    openTicketMeta({ initial: true });
  }

  function setBuilderZoom(value, { clientX, clientY, announce = true } = {}) {
    if (!builderCanvasWrap) return;
    const oldZoom = builderZoom();
    const nextZoom = clamp(safeNumber(value, oldZoom), 0.4, 1.8);
    if (Math.abs(nextZoom - oldZoom) < 0.001) return;
    const rect = builderCanvasWrap.getBoundingClientRect();
    const localX = clamp(safeNumber(clientX, rect.left + (rect.width / 2)) - rect.left, 0, rect.width);
    const localY = clamp(safeNumber(clientY, rect.top + (rect.height / 2)) - rect.top, 0, rect.height);
    const worldX = (safeNumber(builderCanvasWrap.scrollLeft) + localX) / oldZoom;
    const worldY = (safeNumber(builderCanvasWrap.scrollTop) + localY) / oldZoom;
    state.builder.zoom = nextZoom;
    renderBuilderArrows();
    window.requestAnimationFrame(() => {
      builderCanvasWrap.scrollLeft = Math.max(0, (worldX * nextZoom) - localX);
      builderCanvasWrap.scrollTop = Math.max(0, (worldY * nextZoom) - localY);
    });
    updateBuilderToolbar();
    if (announce) updateBuilderStatus(`Canvas zoom ${Math.round(nextZoom * 100)}%.`);
  }

  function builderContentBounds() {
    const nodes = Array.isArray(state.builder?.nodes) ? state.builder.nodes : [];
    if (!nodes.length) return null;
    const padding = 34;
    const minX = Math.min(...nodes.map((node) => safeNumber(node.x, 0))) - padding;
    const minY = Math.min(...nodes.map((node) => safeNumber(node.y, 0))) - padding;
    const maxX = Math.max(...nodes.map((node) => safeNumber(node.x, 0) + nodeVisualSize(node, { width: 300, height: 138 }).width)) + padding;
    const maxY = Math.max(...nodes.map((node) => safeNumber(node.y, 0) + nodeVisualSize(node, { width: 300, height: 138 }).height)) + padding;
    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  function fitBuilderToContent({ announce = false } = {}) {
    if (!builderCanvasWrap || !builderBoard) return;
    const bounds = builderContentBounds();
    if (!bounds) {
      state.builder.zoom = 1;
      renderBuilderArrows();
      builderCanvasWrap.scrollLeft = 0;
      builderCanvasWrap.scrollTop = 0;
      updateBuilderToolbar();
      return;
    }
    const viewportWidth = Math.max(1, builderCanvasWrap.clientWidth || 1);
    const viewportHeight = Math.max(1, builderCanvasWrap.clientHeight || 1);
    const margin = 42;
    const nextZoom = clamp(Math.min(
      (viewportWidth - margin * 2) / bounds.width,
      (viewportHeight - margin * 2) / bounds.height,
      1
    ), 0.4, 1.8);
    state.builder.zoom = nextZoom;
    renderBuilderArrows();
    window.requestAnimationFrame(() => {
      const centerX = ((bounds.minX + bounds.maxX) / 2) * nextZoom;
      const centerY = ((bounds.minY + bounds.maxY) / 2) * nextZoom;
      builderCanvasWrap.scrollLeft = Math.max(0, centerX - viewportWidth / 2);
      builderCanvasWrap.scrollTop = Math.max(0, centerY - viewportHeight / 2);
      updateBuilderToolbar();
      if (announce) updateBuilderStatus(`Canvas fitted to ${Math.round(nextZoom * 100)}%.`);
    });
  }

  function selectBuilderSocket(direction, nodeId) {
    const node = findBuilderNode(nodeId);
    if (!node) return;
    if (direction === 'out') {
      if (state.builder.connecting && String(state.builder.connectFrom) === String(node.id)) {
        state.builder.connecting = false;
        state.builder.connectFrom = null;
        renderBuilder();
        updateBuilderStatus('Connection cancelled.');
        return;
      }
      state.builder.connecting = true;
      state.builder.connectFrom = node.id;
      state.builder.selectedEdgeKey = '';
      renderBuilder();
      updateBuilderStatus();
      return;
    }

    if (!state.builder.connecting || !state.builder.connectFrom) {
      showToast('info', 'Select a source first', 'Click the right connection point on the source block, then this input point.');
      return;
    }
    if (String(state.builder.connectFrom) === String(node.id)) {
      showToast('info', 'Choose another block', 'An arrow must connect two different blocks.');
      return;
    }
    const candidate = { from: state.builder.connectFrom, to: node.id };
    if (state.builder.edges.some((edge) => edgeKey(edge) === edgeKey(candidate))) {
      showToast('info', 'Arrow already exists', 'These blocks are already connected.');
      return;
    }
    const draftEdges = [...state.builder.edges, candidate];
    if (workflowHasCycle(state.builder.nodes, draftEdges)) {
      showToast('error', 'Circular workflow not allowed', 'The new arrow would create a loop. Choose a different direction.');
      return;
    }
    state.builder.edges = draftEdges;
    state.builder.connecting = false;
    state.builder.connectFrom = null;
    state.builder.selectedEdgeKey = edgeKey(candidate);
    renderBuilder();
    updateBuilderStatus('Arrow added. Click the arrow to show its delete button.');
  }

  function selectBuilderEdge(key) {
    if (!state.builder.edges.some((edge) => edgeKey(edge) === key)) return;
    state.builder.selectedEdgeKey = key;
    renderBuilderArrows();
    updateBuilderStatus('Arrow selected. Use the floating × button to delete it.');
  }

  function deleteBuilderEdge(key) {
    const before = state.builder.edges.length;
    state.builder.edges = state.builder.edges.filter((edge) => edgeKey(edge) !== key);
    if (state.builder.edges.length === before) return;
    state.builder.selectedEdgeKey = '';
    state.builder.connecting = false;
    state.builder.connectFrom = null;
    renderBuilder();
    updateBuilderStatus('Arrow removed.');
  }

  function deleteBuilderNode(nodeId) {
    const node = findBuilderNode(nodeId);
    if (!node) return;
    state.builder.nodes = state.builder.nodes.filter((item) => String(item.id) !== String(nodeId));
    state.builder.edges = state.builder.edges.filter((edge) => String(edge.from) !== String(nodeId) && String(edge.to) !== String(nodeId));
    if (String(state.builder.connectFrom) === String(nodeId)) state.builder.connectFrom = null;
    if (state.builder.selectedEdgeKey && !state.builder.edges.some((edge) => edgeKey(edge) === state.builder.selectedEdgeKey)) state.builder.selectedEdgeKey = '';
    renderBuilder();
    updateBuilderStatus('Block removed together with any connected arrows.');
  }

  function openTicketMeta(options = {}) {
    const initial = !!options?.initial;
    if (initial) state.startingProject = true;
    const meta = state.builder.meta;
    $('tmMetaTitleInput').value = meta.title || '';
    $('tmMetaPriorityInput').value = meta.priority || 'Normal';
    refreshModernSelect($('tmMetaPriorityInput'));
    $('tmMetaDueDateInput').value = meta.dueDate || '';
    $('tmMetaDescriptionInput').value = meta.description || '';
    const submitLabel = $('tmMetaSubmitLabel');
    if (submitLabel) submitLabel.textContent = state.startingProject ? 'Continue to Workflow' : 'Save Project Details';
    $('tmMetaError').textContent = '';
    setOverlay(metaOverlay, true);
  }

  function saveTicketMeta(event) {
    event.preventDefault();
    const title = $('tmMetaTitleInput').value.trim();
    const priority = $('tmMetaPriorityInput').value.trim();
    const dueDate = $('tmMetaDueDateInput').value || '';
    if (!title) { $('tmMetaError').textContent = 'Enter a project title.'; return; }
    if (!priority) { $('tmMetaError').textContent = 'Select a project priority.'; return; }
    if (!dueDate) { $('tmMetaError').textContent = 'Select a target date.'; return; }
    state.builder.meta = {
      title,
      priority,
      dueDate,
      description: $('tmMetaDescriptionInput').value.trim(),
    };
    const continueToBuilder = state.startingProject;
    state.startingProject = false;
    $('tmMetaError').textContent = '';
    setOverlay(metaOverlay, false);
    if (continueToBuilder) {
      setOverlay(builderOverlay, true);
      window.requestAnimationFrame(() => {
        renderBuilder();
        fitBuilderToContent();
        window.setTimeout(() => $('tmAddBlockBtn')?.focus(), 60);
      });
    }
    updateBuilderStatus(`Project details saved for “${title}”.`);
  }

  function renderBlockAttachmentPreview() {
    const preview = $('tmBlockAttachmentPreview');
    const attachments = attachmentList(state.blockDraftAttachments);
    if (!preview) return;
    if (!attachments.length) {
      preview.hidden = true;
      preview.innerHTML = '';
      return;
    }
    preview.hidden = false;
    preview.innerHTML = attachments.map((attachment, index) => `
      <div class="tm-upload-file">
        <span class="tm-upload-file__icon"><i data-feather="file-text"></i></span>
        <span class="tm-upload-file__info"><b>${escapeHtml(attachment.name || 'Attachment')}</b><small>${escapeHtml([attachment.type || '', formatBytes(attachment.size)].filter(Boolean).join(' · ') || 'Uploaded file')}</small></span>
        <a class="tm-upload-file__open" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(attachment.name || 'attachment')}"><i data-feather="external-link"></i></a>
        <button class="tm-upload-file__remove" type="button" data-tm-remove-attachment data-tm-attachment-index="${index}" aria-label="Remove ${escapeHtml(attachment.name || 'attachment')}"><i data-feather="trash-2"></i></button>
      </div>`).join('');
    hydrateIcons(preview);
  }

  async function uploadBlockAttachments(files) {
    const errorEl = $('tmBlockEditorError');
    const input = $('tmBlockAttachmentInput');
    const progress = $('tmBlockAttachmentProgress');
    const progressLabel = progress?.querySelector('b');
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!selectedFiles.length) return;
    const tooLarge = selectedFiles.find((file) => file.size > 10 * 1024 * 1024);
    if (tooLarge) {
      if (errorEl) errorEl.textContent = `“${tooLarge.name}” is larger than 10 MB.`;
      if (input) input.value = '';
      return;
    }
    const existing = attachmentList(state.blockDraftAttachments);
    if (existing.length + selectedFiles.length > 20) {
      if (errorEl) errorEl.textContent = 'A workflow block can contain up to 20 attachments.';
      if (input) input.value = '';
      return;
    }
    state.blockUploadPending = true;
    if (errorEl) errorEl.textContent = '';
    if (input) input.disabled = true;
    if (progress) progress.hidden = false;
    const uploaded = [];
    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        if (progressLabel) progressLabel.textContent = `Uploading ${index + 1} of ${selectedFiles.length}…`;
        const dataUrl = await readFileAsDataUrl(file);
        const result = await api(`/api/task-management/upload?view=${encodeURIComponent(state.view)}`, {
          method: 'POST',
          body: { dataUrl, filename: file.name, mime: file.type || '', size: file.size },
        });
        if (result.file?.url) uploaded.push(result.file);
      }
      state.blockDraftAttachments = attachmentList([...existing, ...uploaded]);
      renderBlockAttachmentPreview();
    } catch (error) {
      state.blockDraftAttachments = attachmentList([...existing, ...uploaded]);
      renderBlockAttachmentPreview();
      if (errorEl) errorEl.textContent = error.message || 'Failed to upload one or more attachments.';
    } finally {
      state.blockUploadPending = false;
      if (input) { input.disabled = false; input.value = ''; }
      if (progress) progress.hidden = true;
      if (progressLabel) progressLabel.textContent = 'Uploading attachments…';
    }
  }

  function openBlockEditor(nodeId) {
    const node = findBuilderNode(nodeId);
    if (!node) return;
    state.editingBlockId = node.id;
    state.blockDraftAttachments = attachmentList(node);
    state.blockUploadPending = false;
    const peopleMode = state.builder.mode === 'people';
    $('tmBlockEditorKicker').textContent = peopleMode
      ? `Team task ${workflowNumbering(state.builder.nodes, state.builder.edges).get(String(node.id)) || '—'}`
      : `Workflow block ${workflowNumbering(state.builder.nodes, state.builder.edges).get(String(node.id)) || '—'}`;
    $('tmBlockEditorTitle').textContent = peopleMode ? 'Edit Person Task' : 'Edit Block';
    syncBuilderModeLabels();
    const select = $('tmBlockDepartmentInput');
    if (peopleMode) {
      select.innerHTML = `<option value="">Select team member</option>${state.teamMembers.map((member) => {
        const id = String(member.id || member.name || '');
        const selected = id && id === String(node.assigneeId || '');
        return `<option value="${escapeHtml(id)}" ${selected ? 'selected' : ''}>${escapeHtml(member.name || 'Team member')}${member.position ? ` · ${escapeHtml(member.position)}` : ''}</option>`;
      }).join('')}`;
    } else {
      select.innerHTML = `<option value="">Select department</option>${state.departments.map((department) => `<option value="${escapeHtml(department)}" ${department === node.department ? 'selected' : ''}>${escapeHtml(department)}</option>`).join('')}`;
    }
    refreshModernSelect(select);
    $('tmBlockDeliveryDateInput').value = node.deliveryDate || '';
    $('tmBlockRequestInput').value = node.request || '';
    $('tmBlockRequestInput').placeholder = peopleMode ? 'What should this team member deliver?' : 'What should this department deliver?';
    $('tmBlockDetailsInput').value = node.details || '';
    const attachmentInput = $('tmBlockAttachmentInput');
    if (attachmentInput) attachmentInput.value = '';
    renderBlockAttachmentPreview();
    $('tmBlockEditorError').textContent = '';
    setOverlay(blockOverlay, true);
  }

  function saveBlockEditor(event) {
    event.preventDefault();
    const node = findBuilderNode(state.editingBlockId);
    if (!node) return;
    if (state.blockUploadPending) { $('tmBlockEditorError').textContent = 'Wait until the attachment finishes uploading.'; return; }
    const ownerValue = $('tmBlockDepartmentInput').value.trim();
    const request = $('tmBlockRequestInput').value.trim();
    const deliveryDate = $('tmBlockDeliveryDateInput').value || '';
    const peopleMode = state.builder.mode === 'people';
    if (!ownerValue || !request || !deliveryDate) {
      $('tmBlockEditorError').textContent = peopleMode
        ? 'Responsible team member, assigned task, and delivery date are required.'
        : 'Responsible department, requested action, and delivery date are required.';
      return;
    }
    if (peopleMode) {
      const member = state.teamMembers.find((item) => String(item.id || item.name || '') === ownerValue);
      node.assigneeId = ownerValue;
      node.department = member?.name || ownerValue;
    } else {
      node.department = ownerValue;
      node.assigneeId = '';
    }
    node.request = request;
    node.details = $('tmBlockDetailsInput').value.trim();
    node.deliveryDate = deliveryDate;
    withAttachmentAliases(node, state.blockDraftAttachments);
    $('tmBlockEditorError').textContent = '';
    setOverlay(blockOverlay, false);
    renderBuilder();
    updateBuilderStatus(peopleMode ? 'Person task details saved.' : 'Block details saved.');
  }

  function workflowHasCycle(nodes, edges) {
    const ids = new Set((nodes || []).map((node) => String(node.id)));
    const incoming = new Map([...ids].map((id) => [id, 0]));
    const outgoing = new Map([...ids].map((id) => [id, []]));
    (edges || []).forEach((edge) => {
      const from = String(edge.from ?? edge.fromSectionId ?? edge.from_section_id ?? '');
      const to = String(edge.to ?? edge.toSectionId ?? edge.to_section_id ?? '');
      if (!ids.has(from) || !ids.has(to) || from === to) return;
      outgoing.get(from).push(to);
      incoming.set(to, (incoming.get(to) || 0) + 1);
    });
    const queue = [...ids].filter((id) => incoming.get(id) === 0);
    let processed = 0;
    while (queue.length) {
      const id = queue.shift();
      processed += 1;
      (outgoing.get(id) || []).forEach((to) => {
        incoming.set(to, incoming.get(to) - 1);
        if (incoming.get(to) === 0) queue.push(to);
      });
    }
    return processed !== ids.size;
  }

  function saveWorkflowBuilder() {
    const peopleMode = state.builder.mode === 'people';
    if (!peopleMode && state.view !== 'delegated' && state.builder.mode !== 'edit') return;
    if (!state.builder.nodes.length) {
      showToast('info', peopleMode ? 'Add a person task' : 'Add a block', peopleMode
        ? 'Create at least one person task before saving the team workflow.'
        : 'Create at least one workflow block before saving the project.');
      return;
    }
    if (!peopleMode && (!state.builder.meta.title.trim() || !state.builder.meta.priority || !state.builder.meta.dueDate)) {
      openTicketMeta();
      $('tmMetaError').textContent = 'Project title, priority, and target date are required.';
      return;
    }
    const invalid = state.builder.nodes.find((node) => {
      const owner = peopleMode ? String(node.assigneeId || '').trim() : String(node.department || '').trim();
      return !owner || !String(node.request || '').trim() || !String(node.deliveryDate || '').trim();
    });
    if (invalid) {
      openBlockEditor(invalid.id);
      $('tmBlockEditorError').textContent = peopleMode
        ? 'Responsible team member, assigned task, and delivery date are required for every block.'
        : 'Responsible department, requested action, and delivery date are required for every block.';
      return;
    }
    if (workflowHasCycle(state.builder.nodes, state.builder.edges)) {
      showToast('error', 'Circular workflow not allowed', 'Remove a circular arrow before saving the workflow.');
      return;
    }

    const editing = state.builder.mode === 'edit' && !!state.builder.ticketId;
    const button = $('tmSaveWorkflowBtn');
    if (button) { button.disabled = true; button.classList.add('is-loading'); }

    if (peopleMode) {
      const sectionId = state.builder.contextSectionId;
      const payload = {
        view: state.view,
        assignments: orderedBuilderNodes().map((node, index) => ({
          clientId: node.id,
          assigneeId: node.assigneeId,
          assigneeName: node.department,
          task: node.request,
          details: node.details || '',
          deliveryDate: node.deliveryDate,
          attachments: attachmentList(node),
          attachment: attachmentList(node)[0] || null,
          sortOrder: index + 1,
          canvasX: Math.round(safeNumber(node.x, 60)),
          canvasY: Math.round(safeNumber(node.y, 80)),
        })),
        edges: state.builder.edges.map((edge) => ({ from: edge.from, to: edge.to })),
      };
      api(`/api/task-management/sections/${encodeURIComponent(sectionId)}/people-workflow`, { method: 'PUT', body: payload })
        .then(async (data) => {
          const reopenWork = !!state.builder.returnToWorkPage;
          const reopenDetails = !!state.builder.returnToSectionDetails;
          const workflow = { assignments: Array.isArray(data.assignments) ? data.assignments : [], edges: Array.isArray(data.edges) ? data.edges : [] };
          state.peopleWorkflowCache.set(String(sectionId), workflow);
          setOverlay(builderOverlay, false);
          if (state.workSection) state.workSection.peopleWorkflowCount = workflow.assignments.length;
          if (state.readonlySection) state.readonlySection.peopleWorkflow = workflow;
          await loadTickets();
          const latestTicket = state.tickets.find((ticket) => String(ticket.id) === String(state.selectedTicket?.id)) || state.selectedTicket;
          if (latestTicket) {
            attachCachedPeopleWorkflows(latestTicket);
            state.selectedTicket = latestTicket;
            state.readonlySection = (latestTicket.sections || []).find((item) => String(item.id) === String(sectionId)) || state.readonlySection;
            state.workSection = state.readonlySection;
            renderWorkflow(latestTicket);
          }
          showToast('success', 'Team workflow saved', 'The section work was distributed to people inside your department.');
          resetBuilder();
          if (reopenDetails && state.readonlySection) openReadonlySectionDetails(sectionId);
          else if (reopenWork && state.readonlySection) openWorkPage();
        })
        .catch((error) => showToast('error', 'Could not save team workflow', error.message || 'Please try again.'))
        .finally(() => { if (button) { button.disabled = false; button.classList.remove('is-loading'); } });
      return;
    }

    const payload = {
      view: state.view,
      adminPassword: editing ? (state.builder.adminPassword || '') : undefined,
      title: state.builder.meta.title,
      priority: state.builder.meta.priority,
      dueDate: state.builder.meta.dueDate,
      description: state.builder.meta.description || '',
      sections: orderedBuilderNodes().map((node, index) => ({
        clientId: node.id,
        department: node.department,
        request: node.request,
        details: node.details || '',
        deliveryDate: node.deliveryDate,
        attachments: attachmentList(node),
        attachment: attachmentList(node)[0] || null,
        sortOrder: index + 1,
        canvasX: Math.round(safeNumber(node.x, 60)),
        canvasY: Math.round(safeNumber(node.y, 80)),
      })),
      edges: state.builder.edges.map((edge) => ({ from: edge.from, to: edge.to })),
    };

    const url = editing
      ? `/api/task-management/${encodeURIComponent(state.builder.ticketId)}`
      : '/api/task-management';
    api(url, { method: editing ? 'PUT' : 'POST', body: payload })
      .then(async (data) => {
        setOverlay(builderOverlay, false);
        state.selectedTicket = data.ticket || null;
        await loadTickets();
        const saved = state.tickets.find((ticket) => String(ticket.id) === String(data.ticket?.id)) || data.ticket;
        if (saved) openWorkflow(saved);
        showToast('success', editing ? 'Project updated' : 'Project created', editing ? 'The project workflow changes were saved.' : 'The project workflow is ready and arrows now control the execution sequence.');
        resetBuilder();
      })
      .catch((error) => showToast('error', editing ? 'Could not update project' : 'Could not create project', error.message || 'Please try again.'))
      .finally(() => { if (button) { button.disabled = false; button.classList.remove('is-loading'); } });
  }

  function clearPendingBlockPress() {
    if (!state.pendingBlockPress) return;
    if (state.pendingBlockPress.timer) window.clearTimeout(state.pendingBlockPress.timer);
    state.pendingBlockPress = null;
  }

  function beginBlockDrag(gesture) {
    if (!gesture || state.drag) return;
    const node = findBuilderNode(gesture.nodeId);
    if (!node) return;
    clearPendingBlockPress();
    state.drag = {
      nodeId: gesture.nodeId,
      pointerId: gesture.pointerId,
      startClientX: gesture.startClientX,
      startClientY: gesture.startClientY,
      startX: safeNumber(node.x),
      startY: safeNumber(node.y),
    };
    try { builderBoard?.setPointerCapture?.(gesture.pointerId); } catch {}
    const element = [...(builderBoard?.querySelectorAll('[data-builder-block]') || [])]
      .find((item) => String(item.dataset.builderBlock) === String(gesture.nodeId));
    element?.classList.add('is-dragging');
    document.body.classList.add('tm-builder-dragging');
  }

  function queueBlockDrag(event, nodeId) {
    if (event.button !== 0 || event.isPrimary === false || state.builder.connecting || state.pinch) return;
    if (event.target.closest('[data-tm-edit-block],[data-tm-delete-block],[data-tm-socket],[data-builder-edge-delete]')) return;
    const node = findBuilderNode(nodeId);
    if (!node) return;
    event.preventDefault();
    clearPendingBlockPress();
    const gesture = {
      nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: safeNumber(node.x),
      startY: safeNumber(node.y),
      timer: null,
    };
    gesture.timer = window.setTimeout(() => {
      if (state.pendingBlockPress === gesture) beginBlockDrag(gesture);
    }, 160);
    state.pendingBlockPress = gesture;
  }

  function moveBlockDrag(event) {
    const pending = state.pendingBlockPress;
    if (pending && event.pointerId === pending.pointerId) {
      const dx = event.clientX - pending.startClientX;
      const dy = event.clientY - pending.startClientY;
      if (Math.hypot(dx, dy) >= 6) beginBlockDrag(pending);
    }

    if (!state.drag || event.pointerId !== state.drag.pointerId) return false;
    const node = findBuilderNode(state.drag.nodeId);
    if (!node) return false;
    event.preventDefault();
    const zoom = builderZoom();
    node.x = state.drag.startX + ((event.clientX - state.drag.startClientX) / zoom);
    node.y = state.drag.startY + ((event.clientY - state.drag.startClientY) / zoom);
    ensureBuilderRoomForNode(node);
    const element = [...(builderBoard?.querySelectorAll('[data-builder-block]') || [])]
      .find((item) => String(item.dataset.builderBlock) === String(node.id));
    if (element) { element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; }
    renderBuilderArrows();
    return true;
  }

  function endBlockDrag(event) {
    const pending = state.pendingBlockPress;
    if (pending && (!event || event.pointerId === pending.pointerId)) clearPendingBlockPress();
    if (!state.drag || (event && event.pointerId !== state.drag.pointerId)) return false;
    const element = [...(builderBoard?.querySelectorAll('[data-builder-block]') || [])]
      .find((item) => String(item.dataset.builderBlock) === String(state.drag.nodeId));
    element?.classList.remove('is-dragging');
    try { builderBoard?.releasePointerCapture?.(state.drag.pointerId); } catch {}
    state.drag = null;
    document.body.classList.remove('tm-builder-dragging');
    return true;
  }

  function startCanvasPan(event) {
    if (event.button !== 0 || event.isPrimary === false || state.builder.connecting || state.drag || state.pendingBlockPress || state.pinch) return;
    if (event.target.closest('[data-builder-block],[data-builder-edge-delete],[data-tm-builder-edge]')) return;
    event.preventDefault();
    state.pan = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: safeNumber(builderCanvasWrap?.scrollLeft),
      startScrollTop: safeNumber(builderCanvasWrap?.scrollTop),
    };
    builderCanvasWrap?.classList.add('is-panning');
    try { builderCanvasWrap?.setPointerCapture?.(event.pointerId); } catch {}
  }

  function moveCanvasPan(event) {
    const pan = state.pan;
    if (!pan || event.pointerId !== pan.pointerId || !builderCanvasWrap) return false;
    event.preventDefault();
    let nextLeft = pan.startScrollLeft - (event.clientX - pan.startClientX);
    let nextTop = pan.startScrollTop - (event.clientY - pan.startClientY);
    ensureBuilderPanRoom(pan, nextLeft, nextTop);
    nextLeft = pan.startScrollLeft - (event.clientX - pan.startClientX);
    nextTop = pan.startScrollTop - (event.clientY - pan.startClientY);
    builderCanvasWrap.scrollLeft = Math.max(0, nextLeft);
    builderCanvasWrap.scrollTop = Math.max(0, nextTop);
    return true;
  }

  function endCanvasPan(event) {
    if (!state.pan || (event && event.pointerId !== state.pan.pointerId)) return false;
    try { builderCanvasWrap?.releasePointerCapture?.(state.pan.pointerId); } catch {}
    builderCanvasWrap?.classList.remove('is-panning');
    state.pan = null;
    return true;
  }

  function handleBuilderWheel(event) {
    if (!isOverlayOpen(builderOverlay) || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const factor = Math.exp(-safeNumber(event.deltaY) * 0.0018);
    setBuilderZoom(builderZoom() * factor, { clientX: event.clientX, clientY: event.clientY, announce: false });
  }

  function touchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
  }

  function touchMidpoint(touches) {
    return {
      clientX: (touches[0].clientX + touches[1].clientX) / 2,
      clientY: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  function handleBuilderTouchStart(event) {
    if (!isOverlayOpen(builderOverlay) || event.touches.length !== 2) return;
    event.preventDefault();
    clearPendingBlockPress();
    endBlockDrag();
    endCanvasPan();
    state.pinch = {
      startDistance: Math.max(1, touchDistance(event.touches)),
      startZoom: builderZoom(),
    };
    builderCanvasWrap?.classList.add('is-pinching');
  }

  function handleBuilderTouchMove(event) {
    if (!state.pinch || event.touches.length < 2) return;
    event.preventDefault();
    const distance = touchDistance(event.touches);
    if (!distance) return;
    const midpoint = touchMidpoint(event.touches);
    const zoom = state.pinch.startZoom * (distance / state.pinch.startDistance);
    setBuilderZoom(zoom, { ...midpoint, announce: false });
  }

  function handleBuilderTouchEnd(event) {
    if (!state.pinch || event.touches.length >= 2) return;
    state.pinch = null;
    builderCanvasWrap?.classList.remove('is-pinching');
    updateBuilderStatus(`Canvas zoom ${Math.round(builderZoom() * 100)}%.`);
  }

  // ---------------------------------------------------------------------------
  // Saved workflow viewer
  // ---------------------------------------------------------------------------
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

  function isMyDepartmentSection(section) {
    const myDepartment = norm((state.currentUser || window.__tmCurrentUser || {}).department || '');
    return !!(myDepartment && myDepartment === norm(section?.department || ''));
  }

  function accessLevel() {
    if (window.__tmIsPageAdmin) return 'admin';
    return norm(state.accessLevel || window.__tmAccessLevel || 'view');
  }

  function canEditDepartmentWork() {
    return state.view === 'my' && ['edit', 'admin'].includes(accessLevel());
  }

  function isCurrentUserAssignment(assignment) {
    const current = state.currentUser || window.__tmCurrentUser || {};
    const currentId = String(current?.id || '').trim();
    const assigneeId = String(assignment?.assigneeId || '').trim();
    if (currentId && assigneeId) return currentId === assigneeId;
    return !!(norm(current?.name || '') && norm(current?.name || '') === norm(assignment?.assigneeName || ''));
  }

  function canEditTeamTask(assignment) {
    if (state.view !== 'my' || !assignment) return false;
    if (accessLevel() === 'admin') return true;
    return accessLevel() === 'view' && isCurrentUserAssignment(assignment);
  }

  function canOpenTeamTask(assignment) {
    if (state.view !== 'my' || !assignment) return false;
    if (['edit', 'admin'].includes(accessLevel())) return true;
    return isCurrentUserAssignment(assignment);
  }

  function canEditCurrentWorkTarget() {
    return state.workTargetType === 'assignment'
      ? canEditTeamTask(state.workAssignment)
      : canEditDepartmentWork();
  }

  // Backward-compatible alias used by the existing department workflow builder.
  function canEditMyTaskWork() {
    return canEditDepartmentWork();
  }

  function cachedPeopleWorkflow(sectionId) {
    return state.peopleWorkflowCache.get(String(sectionId || '')) || null;
  }

  function attachCachedPeopleWorkflows(ticket) {
    if (!ticket || state.view !== 'my') return ticket;
    (ticket.sections || []).forEach((section) => {
      const cached = cachedPeopleWorkflow(section.id);
      if (cached) section.peopleWorkflow = cached;
    });
    return ticket;
  }

  async function hydratePeopleWorkflows(ticket) {
    if (!ticket || state.view !== 'my') return;
    const ownedSections = (ticket.sections || []).filter(isMyDepartmentSection);
    await Promise.all(ownedSections.map(async (section) => {
      const sectionId = String(section.id || '');
      if (!sectionId) return;
      const cached = cachedPeopleWorkflow(sectionId);
      if (cached) {
        section.peopleWorkflow = cached;
        return;
      }
      let request = state.peopleWorkflowLoads.get(sectionId);
      if (!request) {
        request = api(`/api/task-management/sections/${encodeURIComponent(sectionId)}/people-workflow?view=${encodeURIComponent(state.view)}`)
          .then((data) => ({ assignments: Array.isArray(data.assignments) ? data.assignments : [], edges: Array.isArray(data.edges) ? data.edges : [] }))
          .catch((error) => {
            console.warn('[task-management] team workflow preview unavailable:', error?.message || error);
            return null;
          })
          .finally(() => state.peopleWorkflowLoads.delete(sectionId));
        state.peopleWorkflowLoads.set(sectionId, request);
      }
      const workflow = await request;
      if (!workflow) return;
      state.peopleWorkflowCache.set(sectionId, workflow);
      section.peopleWorkflow = workflow;
    }));
    if (state.selectedTicket && String(state.selectedTicket.id) === String(ticket.id) && isOverlayOpen(workflowOverlay)) {
      attachCachedPeopleWorkflows(state.selectedTicket);
      renderWorkflow(state.selectedTicket);
      if (!state.viewer.manual) window.requestAnimationFrame(() => fitViewerToContent());
    }
  }

  function deriveLegacyEdges(sections = []) {
    const groups = new Map();
    (sections || []).forEach((section, index) => {
      const group = Math.max(1, safeNumber(section.executionGroup ?? section.execution_group ?? section.sortOrder, index + 1));
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(section);
    });
    const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0]);
    const edges = [];
    for (let i = 0; i < ordered.length - 1; i += 1) {
      ordered[i][1].forEach((from) => ordered[i + 1][1].forEach((to) => edges.push({ from: from.id, to: to.id })));
    }
    return edges;
  }

  function ticketEdges(ticket) {
    const raw = Array.isArray(ticket?.edges) ? ticket.edges : [];
    const valid = raw.map((edge) => ({
      from: String(edge.from ?? edge.fromSectionId ?? edge.from_section_id ?? ''),
      to: String(edge.to ?? edge.toSectionId ?? edge.to_section_id ?? ''),
    })).filter((edge) => edge.from && edge.to && edge.from !== edge.to);
    return valid.length ? valid : deriveLegacyEdges(ticket?.sections || []);
  }

  function graphLayout(ticket) {
    const sections = (ticket?.sections || []).slice();
    const edges = ticketEdges(ticket);
    const ids = new Set(sections.map((section) => String(section.id)));
    const outgoing = new Map(sections.map((section) => [String(section.id), []]));
    const incoming = new Map(sections.map((section) => [String(section.id), []]));
    edges.forEach((edge) => {
      if (!ids.has(edge.from) || !ids.has(edge.to)) return;
      outgoing.get(edge.from).push(edge.to);
      incoming.get(edge.to).push(edge.from);
    });

    const indegree = new Map(sections.map((section) => [String(section.id), (incoming.get(String(section.id)) || []).length]));
    const queue = sections.filter((section) => indegree.get(String(section.id)) === 0).map((section) => String(section.id));
    const rank = new Map(sections.map((section) => [String(section.id), 0]));
    let processed = 0;
    while (queue.length) {
      const id = queue.shift();
      processed += 1;
      (outgoing.get(id) || []).forEach((to) => {
        rank.set(to, Math.max(rank.get(to) || 0, (rank.get(id) || 0) + 1));
        indegree.set(to, (indegree.get(to) || 0) - 1);
        if (indegree.get(to) === 0) queue.push(to);
      });
    }
    if (processed !== sections.length) {
      sections.forEach((section, index) => rank.set(String(section.id), Math.max(0, safeNumber(section.executionGroup, index + 1) - 1)));
    }

    const layers = new Map();
    sections.forEach((section) => {
      const layer = rank.get(String(section.id)) || 0;
      if (!layers.has(layer)) layers.set(layer, []);
      layers.get(layer).push(section);
    });
    const sortedLayers = [...layers.entries()].sort((a, b) => a[0] - b[0]);
    const fallbackPosition = new Map();
    sortedLayers.forEach(([layer, layerSections]) => {
      layerSections.forEach((section, index) => fallbackPosition.set(String(section.id), { x: 64 + layer * 355, y: 74 + index * 242 }));
    });

    const positionedNodes = sections.map((section) => {
      const fallback = fallbackPosition.get(String(section.id)) || { x: 64, y: 74 };
      const hasPosition = Number.isFinite(Number(section.canvasX)) && Number.isFinite(Number(section.canvasY)) && Number(section.canvasX) > 0 && Number(section.canvasY) > 0;
      return {
        ...section,
        x: hasPosition ? safeNumber(section.canvasX) : fallback.x,
        y: hasPosition ? safeNumber(section.canvasY) : fallback.y,
        dependencies: incoming.get(String(section.id)) || [],
      };
    });
    // The builder can pan endlessly and may shift its internal origin. Normalize
    // the stored coordinates only for the read-only viewer so every ticket opens
    // focused around its workflow instead of starting far away on a huge canvas.
    const minX = positionedNodes.length ? Math.min(...positionedNodes.map((node) => safeNumber(node.x))) : 0;
    const minY = positionedNodes.length ? Math.min(...positionedNodes.map((node) => safeNumber(node.y))) : 0;
    const nodes = positionedNodes.map((node) => ({
      ...node,
      x: safeNumber(node.x) - minX + 64,
      y: safeNumber(node.y) - minY + 64,
    }));
    const labels = workflowNumbering(nodes, edges);
    return { nodes: nodes.map((node) => ({ ...node, workflowNumber: labels.get(String(node.id)) || '—' })), edges };
  }

  function isSectionUnlocked(ticket, section) {
    const edges = ticketEdges(ticket);
    const predecessorIds = edges.filter((edge) => String(edge.to) === String(section.id)).map((edge) => String(edge.from));
    if (predecessorIds.length) {
      return predecessorIds.every((id) => (ticket.sections || []).find((item) => String(item.id) === id)?.status === 'completed');
    }
    const currentGroup = Math.max(1, safeNumber(section.executionGroup ?? section.execution_group ?? section.sortOrder, 1));
    return !(ticket.sections || []).some((item) => Math.max(1, safeNumber(item.executionGroup ?? item.execution_group ?? item.sortOrder, 1)) < currentGroup && item.status !== 'completed');
  }

  function completedTeamSubmissionMarkup(teamWorkflow) {
    const completed = (Array.isArray(teamWorkflow?.assignments) ? teamWorkflow.assignments : [])
      .filter((assignment) => assignment?.status === 'completed')
      .filter((assignment) => assignment.workReport || assignment.workLink || assignment.workFile?.url);
    if (!completed.length) return '';
    return `<div class="tm-team-submissions">
      <span class="tm-team-submissions__label"><i data-feather="users"></i>Completed team work</span>
      ${completed.map((assignment) => {
        const file = assignment.workFile?.url
          ? `<a href="${escapeHtml(assignment.workFile.url)}" target="_blank" rel="noopener noreferrer"><i data-feather="file"></i><span>${escapeHtml(assignment.workFile.name || 'Work file')}</span></a>`
          : '';
        const link = assignment.workLink
          ? `<a href="${escapeHtml(assignment.workLink)}" target="_blank" rel="noopener noreferrer"><i data-feather="link"></i><span>Work link</span></a>`
          : '';
        return `<div class="tm-team-submission">
          <b>${escapeHtml(assignment.assigneeName || 'Team member')}</b>
          ${assignment.workReport ? `<p>${escapeHtml(assignment.workReport)}</p>` : ''}
          ${(file || link) ? `<div class="tm-team-submission__files">${file}${link}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderWorkflowCard(ticket, section, nodeIndex) {
    const unlocked = isSectionUnlocked(ticket, section);
    const belongsToMyDepartment = state.view === 'my' && isMyDepartmentSection(section);
    const departmentOwner = belongsToMyDepartment && canEditDepartmentWork();
    const teamWorkflow = section.peopleWorkflow || cachedPeopleWorkflow(section.id);
    const hasTeamTasks = belongsToMyDepartment && Array.isArray(teamWorkflow?.assignments) && teamWorkflow.assignments.length > 0;
    const teamSubmissions = hasTeamTasks ? completedTeamSubmissionMarkup(teamWorkflow) : '';
    const interactive = state.view !== 'my' || belongsToMyDepartment;
    const footerText = !unlocked
      ? 'Waiting for connected prerequisite blocks'
      : (section.completedAt ? `Done ${formatDateTime(section.completedAt)}` : (section.startedAt ? `Started ${formatDateTime(section.startedAt)}` : 'Waiting to start'));
    const number = section.workflowNumber || String(nodeIndex + 1);
    const interactiveAttrs = interactive
      ? ` data-tm-open-section="${escapeHtml(section.id)}" role="button" tabindex="0" aria-label="Open task details for ${escapeHtml(section.department || 'department')}"`
      : ' role="group" tabindex="-1" aria-disabled="true"';
    const mineClass = departmentOwner ? ' tm-workflow-card--mine' : (state.view === 'my' ? ' tm-workflow-card--other-department' : '');
    const teamClass = hasTeamTasks ? ' tm-workflow-card--has-team' : '';
    return `
      <article class="tm-workflow-card tm-builder-block tm-builder-block--viewer${interactive ? ' tm-workflow-card--interactive' : ''}${mineClass}${teamClass} ${statusClass(section.status)}" data-section-id="${escapeHtml(section.id)}"${interactiveAttrs} style="left:${Math.round(section.x)}px;top:${Math.round(section.y)}px;">
        <div class="tm-builder-block__head tm-workflow-card__top">
          <div class="tm-builder-block__number">${escapeHtml(number)}</div>
          <div class="tm-builder-block__title"><b>${escapeHtml(section.department || 'Department')}</b><small>${belongsToMyDepartment ? 'Your department section' : `Workflow block ${escapeHtml(number)}`}</small></div>
          <span class="tm-status-pill ${statusClass(section.status)}"><i data-feather="${statusIcon(section.status)}"></i>${escapeHtml(sectionStatusLabel(section.status))}</span>
        </div>
        <div class="tm-builder-block__body tm-workflow-card__body">
          <span class="tm-builder-block__label">Requested action</span>
          <strong>${escapeHtml(section.request || '—')}</strong>
          ${(section.deliveryDate || attachmentList(section).length) ? `<div class="tm-builder-block__meta">${section.deliveryDate ? `<span class="tm-builder-block__delivery"><i data-feather="calendar"></i>${escapeHtml(formatDate(section.deliveryDate))}</span>` : ''}${attachmentList(section).length ? `<span class="tm-builder-block__attachment tm-workflow-card__attachment"><i data-feather="paperclip"></i><span>${escapeHtml(attachmentCountLabel(section))}</span></span>` : ''}</div>` : ''}
          ${section.details ? `<div class="tm-workflow-card__details"><span>Implementation details</span><p>${escapeHtml(section.details)}</p></div>` : ''}
          ${section.workReport ? `<div class="tm-workflow-card__note"><i data-feather="file-text"></i><div><span>Work report${section.completedByName ? ` · ${escapeHtml(section.completedByName)}` : ''}</span><p>${escapeHtml(section.workReport)}</p></div></div>` : (section.completionNote ? `<div class="tm-workflow-card__note"><i data-feather="message-square"></i><div><span>Execution note</span><p>${escapeHtml(section.completionNote)}</p></div></div>` : '')}
          ${section.status === 'rejected' && section.rejectionReason ? `<div class="tm-workflow-card__rejection"><i data-feather="alert-circle"></i><span>${escapeHtml(section.rejectionReason)}</span></div>` : ''}
          ${teamSubmissions}
        </div>
        <div class="tm-workflow-card__footer"><span>${escapeHtml(footerText)}</span>${belongsToMyDepartment ? `<span class="tm-workflow-card__mine-label"><i data-feather="${departmentOwner ? 'mouse-pointer' : 'eye'}"></i>${departmentOwner ? 'Open department task' : 'View department task'}</span>` : ''}</div>
        ${hasTeamTasks ? '<span class="tm-team-anchor tm-team-anchor--top" aria-hidden="true"></span><span class="tm-team-anchor tm-team-anchor--bottom" aria-hidden="true"></span>' : ''}
      </article>`;
  }

  function buildTeamViewerLayout(section, parentNode) {
    const workflow = section?.peopleWorkflow || cachedPeopleWorkflow(section?.id);
    const assignments = Array.isArray(workflow?.assignments) ? workflow.assignments : [];
    if (!assignments.length || !parentNode) return { nodes: [], edges: [] };

    const sourceEdges = Array.isArray(workflow?.edges) ? workflow.edges : [];
    const assignmentById = new Map(assignments.map((assignment) => [String(assignment.id), assignment]));
    const incoming = new Map(assignments.map((assignment) => [String(assignment.id), 0]));
    const outgoing = new Map(assignments.map((assignment) => [String(assignment.id), []]));
    sourceEdges.forEach((edge) => {
      const from = String(edge.from || '');
      const to = String(edge.to || '');
      if (!assignmentById.has(from) || !assignmentById.has(to) || from === to) return;
      outgoing.get(from).push(to);
      incoming.set(to, (incoming.get(to) || 0) + 1);
    });
    const initialIncoming = new Map(incoming);
    const rank = new Map(assignments.map((assignment) => [String(assignment.id), 0]));
    const queue = assignments
      .filter((assignment) => (incoming.get(String(assignment.id)) || 0) === 0)
      .sort((a, b) => safeNumber(a.sortOrder, 0) - safeNumber(b.sortOrder, 0))
      .map((assignment) => String(assignment.id));
    let processed = 0;
    while (queue.length) {
      const id = queue.shift();
      processed += 1;
      (outgoing.get(id) || []).forEach((nextId) => {
        rank.set(nextId, Math.max(rank.get(nextId) || 0, (rank.get(id) || 0) + 1));
        incoming.set(nextId, (incoming.get(nextId) || 0) - 1);
        if (incoming.get(nextId) === 0) queue.push(nextId);
      });
    }
    if (processed !== assignments.length) {
      assignments.forEach((assignment, index) => rank.set(String(assignment.id), Math.max(0, safeNumber(assignment.executionGroup, index + 1) - 1)));
    }

    const layers = new Map();
    assignments.forEach((assignment) => {
      const level = rank.get(String(assignment.id)) || 0;
      if (!layers.has(level)) layers.set(level, []);
      layers.get(level).push(assignment);
    });

    const cardWidth = 246;
    const cardHeight = 166;
    const horizontalGap = 34;
    const verticalGap = 78;
    const parentSize = nodeVisualSize(parentNode, { width: 300, height: 138 });
    const parentCenter = safeNumber(parentNode.x) + (parentSize.width / 2);
    const startY = safeNumber(parentNode.y) + parentSize.height + 92;
    const nodes = [];
    const viewerIdByAssignmentId = new Map();

    [...layers.entries()].sort((a, b) => a[0] - b[0]).forEach(([level, layer]) => {
      const ordered = layer.slice().sort((a, b) => (safeNumber(a.sortOrder, 0) - safeNumber(b.sortOrder, 0)) || String(a.assigneeName || '').localeCompare(String(b.assigneeName || '')));
      const layerWidth = (ordered.length * cardWidth) + (Math.max(0, ordered.length - 1) * horizontalGap);
      const startX = Math.max(28, parentCenter - (layerWidth / 2));
      ordered.forEach((assignment, index) => {
        const viewerId = `team-${section.id}-${assignment.id}`;
        viewerIdByAssignmentId.set(String(assignment.id), viewerId);
        nodes.push({
          ...assignment,
          id: viewerId,
          assignmentId: String(assignment.id),
          parentSectionId: String(section.id),
          x: startX + index * (cardWidth + horizontalGap),
          y: startY + level * (cardHeight + verticalGap),
          _visualWidth: cardWidth,
          _visualHeight: cardHeight,
          workflowNumber: `${section.workflowNumber || ''}${section.workflowNumber ? '.' : ''}${safeNumber(assignment.sortOrder, index + 1) || index + 1}`,
        });
      });
    });

    const edges = [];
    const roots = assignments.filter((assignment) => (initialIncoming.get(String(assignment.id)) || 0) === 0);
    (roots.length ? roots : assignments.slice(0, 1)).forEach((assignment) => {
      const to = viewerIdByAssignmentId.get(String(assignment.id));
      if (to) edges.push({ from: String(section.id), to, kind: 'parent' });
    });
    sourceEdges.forEach((edge) => {
      const from = viewerIdByAssignmentId.get(String(edge.from || ''));
      const to = viewerIdByAssignmentId.get(String(edge.to || ''));
      if (from && to) edges.push({ from, to, kind: 'team' });
    });
    return { nodes, edges };
  }

  function renderTeamTaskCard(node) {
    const attachment = attachmentList(node).length
      ? `<span class="tm-team-task-card__attachment"><i data-feather="paperclip"></i><span>${escapeHtml(attachmentCountLabel(node))}</span></span>`
      : '';
    const openable = canOpenTeamTask(node);
    const editable = canEditTeamTask(node);
    const attrs = openable
      ? ` data-tm-open-team-task="${escapeHtml(node.assignmentId)}" data-parent-section-id="${escapeHtml(node.parentSectionId)}" role="button" tabindex="0" aria-label="${editable ? 'Open' : 'View'} work page for ${escapeHtml(node.assigneeName || 'team member')}"`
      : ' role="group" tabindex="-1" aria-disabled="true"';
    const accessClass = openable ? ' tm-team-task-card--interactive' : ' tm-team-task-card--locked';
    const ownClass = accessLevel() === 'view' && isCurrentUserAssignment(node) ? ' tm-team-task-card--mine' : '';
    return `
      <article class="tm-team-task-card${accessClass}${ownClass} ${statusClass(node.status)}" data-team-task-id="${escapeHtml(node.assignmentId)}"${attrs} style="left:${Math.round(node.x)}px;top:${Math.round(node.y)}px;">
        <span class="tm-team-anchor tm-team-anchor--top" aria-hidden="true"></span>
        <div class="tm-team-task-card__head">
          <span class="tm-team-task-card__number">${escapeHtml(node.workflowNumber || '•')}</span>
          <div><b>${escapeHtml(node.assigneeName || 'Team member')}</b><small>Assigned person task</small></div>
          <span class="tm-status-pill ${statusClass(node.status)}"><i data-feather="${statusIcon(node.status)}"></i>${escapeHtml(sectionStatusLabel(node.status))}</span>
        </div>
        <div class="tm-team-task-card__body">
          <span>Assigned task</span>
          <strong>${escapeHtml(node.task || 'No task details')}</strong>
          <div class="tm-team-task-card__meta"><span><i data-feather="calendar"></i>${escapeHtml(formatDate(node.deliveryDate))}</span>${attachment}</div>
        </div>
        ${openable ? `<div class="tm-team-task-card__footer"><button type="button" class="tm-team-task-card__open"><i data-feather="${editable ? 'briefcase' : 'eye'}"></i><span>View Task Details</span></button><i data-feather="arrow-right"></i></div>` : ''}
        <span class="tm-team-anchor tm-team-anchor--bottom" aria-hidden="true"></span>
      </article>`;
  }

  function openReadonlySectionDetails(sectionId) {
    const ticket = state.selectedTicket;
    state.readonlyAssignment = null;
    const section = (ticket?.sections || []).find((item) => String(item.id) === String(sectionId));
    if (!ticket || !section || !sectionDetailsOverlay) return;
    if (state.view === 'my' && !isMyDepartmentSection(section)) return;
    state.readonlySection = section;

    const layoutSection = graphLayout(ticket).nodes.find((item) => String(item.id) === String(section.id));
    const number = layoutSection?.workflowNumber || '—';
    const department = section.department || 'Department';
    const attachment = renderAttachmentLinks(section, 'No project files attached to this task.');
    const workFile = section.workFile?.url
      ? `<a class="tm-section-details__file" href="${escapeHtml(section.workFile.url)}" target="_blank" rel="noopener noreferrer"><span class="tm-section-details__file-icon"><i data-feather="file"></i></span><span><b>${escapeHtml(section.workFile.name || 'Open work file')}</b><small>${escapeHtml(formatBytes(section.workFile.size || 0) || 'Work file')}</small></span><i data-feather="external-link"></i></a>`
      : '';
    const workLink = section.workLink
      ? `<a class="tm-section-details__file" href="${escapeHtml(section.workLink)}" target="_blank" rel="noopener noreferrer"><span class="tm-section-details__file-icon"><i data-feather="link"></i></span><span><b>Open work link</b><small>${escapeHtml(section.workLink)}</small></span><i data-feather="external-link"></i></a>`
      : '';
    const teamWorkflow = section.peopleWorkflow || cachedPeopleWorkflow(section.id);
    const teamWork = completedTeamSubmissionMarkup(teamWorkflow);

    const kicker = $('tmSectionDetailsKicker');
    const title = $('tmSectionDetailsTitle');
    const status = $('tmSectionDetailsStatus');
    const body = $('tmSectionDetailsBody');
    const subtitle = $('tmSectionDetailsSub');
    if (kicker) kicker.textContent = `Workflow block ${number}`;
    if (title) title.textContent = department;
    if (subtitle) subtitle.textContent = 'Read-only department task information and attached files.';
    if (status) {
      status.className = `tm-status-pill ${statusClass(section.status)}`;
      status.innerHTML = `<i data-feather="${statusIcon(section.status)}"></i>${escapeHtml(sectionStatusLabel(section.status))}`;
    }
    if (body) {
      body.innerHTML = `
        <div class="tm-section-details__grid">
          <div class="tm-section-details__item"><span>Project</span><b>${escapeHtml(ticket.title || '—')}</b></div>
          <div class="tm-section-details__item"><span>Delivery date</span><b>${escapeHtml(formatDate(section.deliveryDate))}</b></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Requested action</span><p>${escapeHtml(section.request || 'No requested action provided.')}</p></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Implementation details</span><p>${escapeHtml(section.details || 'No implementation details provided.')}</p></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Project files</span>${attachment}</div>
          ${(section.workReport || section.completionNote) ? `<div class="tm-section-details__item tm-section-details__item--wide"><span>Work report</span><p>${escapeHtml(section.workReport || section.completionNote)}</p></div>` : ''}
          ${(workFile || workLink) ? `<div class="tm-section-details__item tm-section-details__item--wide"><span>Work files and links</span><div class="tm-section-details__files">${workFile}${workLink}</div></div>` : ''}
          ${section.rejectionReason ? `<div class="tm-section-details__item tm-section-details__item--wide tm-section-details__item--rejected"><span>Rejected reason</span><p>${escapeHtml(section.rejectionReason)}</p></div>` : ''}
          ${teamWork ? `<div class="tm-section-details__item tm-section-details__item--wide"><span>Completed team work</span>${teamWork}</div>` : ''}
        </div>`;
    }
    const isOwnMyTask = state.view === 'my' && isMyDepartmentSection(section);
    const canManageDepartment = isOwnMyTask && canEditDepartmentWork();
    const openWorkButton = $('tmOpenWorkPageBtn');
    if (openWorkButton) openWorkButton.hidden = !canManageDepartment;
    const assignTeamButton = $('tmOpenPeopleWorkflowBtn');
    if (assignTeamButton) {
      assignTeamButton.hidden = !canManageDepartment;
      assignTeamButton.disabled = false;
      assignTeamButton.title = 'Assign this department section to team members';
    }
    hydrateIcons(sectionDetailsOverlay);
    setOverlay(sectionDetailsOverlay, true);
  }

  function openTeamTaskDetails(assignmentId, sectionId = '') {
    const found = findPeopleAssignment(assignmentId, sectionId);
    if (!found || !canOpenTeamTask(found.assignment) || !sectionDetailsOverlay) return;

    const assignment = { ...found.assignment, sectionId: found.section.id };
    state.readonlySection = found.section;
    state.readonlyAssignment = assignment;

    const attachment = renderAttachmentLinks(assignment, 'No files attached to this team-member task.');

    const kicker = $('tmSectionDetailsKicker');
    const title = $('tmSectionDetailsTitle');
    const subtitle = $('tmSectionDetailsSub');
    const status = $('tmSectionDetailsStatus');
    const body = $('tmSectionDetailsBody');
    if (kicker) kicker.textContent = `Team task ${assignment.sortOrder || '—'}`;
    if (title) title.textContent = assignment.assigneeName || 'Team member task';
    if (subtitle) subtitle.textContent = 'Read the task details assigned by your department manager, then open the work page to submit your progress.';
    if (status) {
      status.className = `tm-status-pill ${statusClass(assignment.status)}`;
      status.innerHTML = `<i data-feather="${statusIcon(assignment.status)}"></i>${escapeHtml(sectionStatusLabel(assignment.status))}`;
    }
    if (body) {
      body.innerHTML = `
        <div class="tm-section-details__grid">
          <div class="tm-section-details__item"><span>Assigned to</span><b>${escapeHtml(assignment.assigneeName || '—')}</b></div>
          <div class="tm-section-details__item"><span>Delivery date</span><b>${escapeHtml(formatDate(assignment.deliveryDate))}</b></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Assigned task</span><p>${escapeHtml(assignment.task || 'No assigned task provided.')}</p></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Task details</span><p>${escapeHtml(assignment.details || 'No additional task details provided.')}</p></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Task files</span>${attachment}</div>
        </div>`;
    }

    const assignTeamButton = $('tmOpenPeopleWorkflowBtn');
    if (assignTeamButton) assignTeamButton.hidden = true;
    const openWorkButton = $('tmOpenWorkPageBtn');
    if (openWorkButton) {
      const editable = canEditTeamTask(assignment);
      openWorkButton.hidden = !editable;
      openWorkButton.disabled = !editable;
      openWorkButton.title = editable ? 'Open the work data-entry page for this assigned task' : '';
      const label = openWorkButton.querySelector('span');
      if (label) label.textContent = 'Open Work Page';
    }

    hydrateIcons(sectionDetailsOverlay);
    setOverlay(sectionDetailsOverlay, true);
  }

  function viewerZoom() {
    return clamp(safeNumber(state.viewer?.zoom, 1), 0.25, 1.8);
  }

  function updateViewerZoomControls() {
    const zoom = viewerZoom();
    const label = $('tmViewerZoomLabel');
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
    const out = $('tmViewerZoomOutBtn');
    const inside = $('tmViewerZoomInBtn');
    if (out) out.disabled = zoom <= 0.25;
    if (inside) inside.disabled = zoom >= 1.8;
  }

  function applyViewerTransform() {
    if (!workflowCanvasWrap || !workflowStage) return;
    const board = $('tmWorkflowFlow');
    if (!board) return;
    const zoom = viewerZoom();
    const offsetX = safeNumber(state.viewer?.offsetX, 0);
    const offsetY = safeNumber(state.viewer?.offsetY, 0);
    board.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${zoom})`;
    board.style.transformOrigin = '0 0';
    // The workflow board is absolutely positioned. Keep the stage as a full-size
    // viewport layer and never clip the board; otherwise some browsers resolve the
    // old 100% stage height to zero and the complete workflow disappears.
    workflowStage.style.position = 'absolute';
    workflowStage.style.inset = '0';
    workflowStage.style.overflow = 'visible';
    board.style.visibility = 'visible';
    board.style.opacity = '1';
    updateViewerZoomControls();
  }

  function applyViewerZoom(value = state.viewer.zoom, { clientX, clientY, manual = true } = {}) {
    if (!workflowCanvasWrap) return;
    const oldZoom = viewerZoom();
    const nextZoom = clamp(safeNumber(value, oldZoom), 0.25, 1.8);
    const rect = workflowCanvasWrap.getBoundingClientRect();
    const localX = clamp(safeNumber(clientX, rect.left + rect.width / 2) - rect.left, 0, rect.width);
    const localY = clamp(safeNumber(clientY, rect.top + rect.height / 2) - rect.top, 0, rect.height);
    const contentX = (localX - safeNumber(state.viewer.offsetX, 0)) / oldZoom;
    const contentY = (localY - safeNumber(state.viewer.offsetY, 0)) / oldZoom;
    state.viewer.zoom = nextZoom;
    state.viewer.offsetX = localX - contentX * nextZoom;
    state.viewer.offsetY = localY - contentY * nextZoom;
    if (manual) state.viewer.manual = true;
    applyViewerTransform();
  }

  function workflowContentBounds(nodes = []) {
    if (!nodes.length) return { minX: 0, minY: 0, maxX: 980, maxY: 650, width: 980, height: 650 };
    const padding = 34;
    const minX = Math.min(...nodes.map((node) => safeNumber(node.x, 0))) - padding;
    const minY = Math.min(...nodes.map((node) => safeNumber(node.y, 0))) - padding;
    const maxX = Math.max(...nodes.map((node) => safeNumber(node.x, 0) + nodeVisualSize(node).width)) + padding;
    const maxY = Math.max(...nodes.map((node) => safeNumber(node.y, 0) + nodeVisualSize(node).height)) + padding;
    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  function fitViewerToContent({ keepManual = false } = {}) {
    if (!workflowCanvasWrap) return;
    const bounds = state.viewer?.bounds || workflowContentBounds([]);
    const measuredWidth = workflowCanvasWrap.clientWidth || 0;
    const measuredHeight = workflowCanvasWrap.clientHeight || 0;
    // Wait until the overlay has a real layout box before calculating Zoom Fit.
    // A zero-size measurement can translate the board completely outside view.
    if (measuredWidth < 2 || measuredHeight < 2) {
      window.requestAnimationFrame(() => fitViewerToContent({ keepManual }));
      return;
    }
    const viewportWidth = measuredWidth;
    const viewportHeight = measuredHeight;
    const margin = viewportWidth < 640 ? 22 : 38;
    const zoom = clamp(Math.min(
      (viewportWidth - margin * 2) / Math.max(1, bounds.width),
      (viewportHeight - margin * 2) / Math.max(1, bounds.height),
      1
    ), 0.25, 1.8);
    state.viewer.zoom = zoom;
    state.viewer.offsetX = (viewportWidth - bounds.width * zoom) / 2 - bounds.minX * zoom;
    state.viewer.offsetY = (viewportHeight - bounds.height * zoom) / 2 - bounds.minY * zoom;
    state.viewer.pan = null;
    state.viewer.pinch = null;
    if (!keepManual) state.viewer.manual = false;
    applyViewerTransform();
  }

  function resetViewerCanvas() {
    state.viewer.manual = false;
    fitViewerToContent();
  }

  function startViewerPan(event) {
    if (!workflowCanvasWrap || !isOverlayOpen(workflowOverlay)) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('button, a, [data-tm-open-section], [data-tm-open-team-task]')) return;
    state.viewer.pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: safeNumber(state.viewer.offsetX, 0),
      startOffsetY: safeNumber(state.viewer.offsetY, 0),
      moved: false,
    };
    workflowCanvasWrap.classList.add('is-panning');
    try { workflowCanvasWrap.setPointerCapture(event.pointerId); } catch {}
  }

  function moveViewerPan(event) {
    const pan = state.viewer.pan;
    if (!pan || (pan.pointerId != null && event.pointerId !== pan.pointerId) || !workflowCanvasWrap) return false;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) pan.moved = true;
    state.viewer.offsetX = pan.startOffsetX + dx;
    state.viewer.offsetY = pan.startOffsetY + dy;
    state.viewer.manual = true;
    applyViewerTransform();
    if (pan.moved) event.preventDefault();
    return true;
  }

  function endViewerPan(event) {
    const pan = state.viewer.pan;
    if (!pan || (event?.pointerId != null && pan.pointerId != null && event.pointerId !== pan.pointerId)) return false;
    try { workflowCanvasWrap?.releasePointerCapture?.(pan.pointerId); } catch {}
    state.viewer.pan = null;
    workflowCanvasWrap?.classList.remove('is-panning');
    return true;
  }

  function handleViewerWheel(event) {
    if (!isOverlayOpen(workflowOverlay) || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    applyViewerZoom(viewerZoom() + (event.deltaY < 0 ? 0.1 : -0.1), { clientX: event.clientX, clientY: event.clientY, manual: true });
  }

  function handleViewerTouchStart(event) {
    if (!isOverlayOpen(workflowOverlay) || event.touches.length !== 2) return;
    event.preventDefault();
    endViewerPan();
    state.viewer.pinch = { startDistance: Math.max(1, touchDistance(event.touches)), startZoom: viewerZoom() };
    state.viewer.manual = true;
    workflowCanvasWrap?.classList.add('is-pinching');
  }

  function handleViewerTouchMove(event) {
    if (!state.viewer.pinch || event.touches.length < 2) return;
    event.preventDefault();
    const distance = touchDistance(event.touches);
    const midpoint = touchMidpoint(event.touches);
    applyViewerZoom(state.viewer.pinch.startZoom * (distance / state.viewer.pinch.startDistance), { ...midpoint, manual: true });
  }

  function handleViewerTouchEnd(event) {
    if (!state.viewer.pinch || event.touches.length >= 2) return;
    state.viewer.pinch = null;
    workflowCanvasWrap?.classList.remove('is-pinching');
  }

  function renderWorkflow(ticket) {
    if (!ticket) return;
    attachCachedPeopleWorkflows(ticket);
    $('tmWorkflowCode').textContent = ticket.ticketCode || 'TKT';
    $('tmWorkflowTitle').textContent = ticket.title || 'Project workflow';
    $('tmWorkflowSub').textContent = `${ticket.createdByName || '—'} · Created ${formatDate(ticket.createdAt)}`;
    const statusEl = $('tmWorkflowStatus');
    statusEl.className = `tm-status-pill ${statusClass(ticket.status)}`;
    statusEl.innerHTML = `<i data-feather="${statusIcon(ticket.status)}"></i>${escapeHtml(statusLabel(ticket.status))}`;
    const editButton = $('tmEditProjectBtn');
    if (editButton) editButton.hidden = state.view === 'my';
    const deleteButton = $('tmDeleteProjectBtn');
    if (deleteButton) deleteButton.hidden = state.view !== 'delegated';
    $('tmWorkflowSummary').innerHTML = `<div><span>Objective</span><p>${escapeHtml(ticket.description || 'No additional context provided.')}</p></div><div><span>Priority</span><b class="tm-priority tm-priority--${escapeHtml(norm(ticket.priority || 'normal'))}">${escapeHtml(ticket.priority || 'Normal')}</b></div><div><span>Target date</span><b>${escapeHtml(formatDate(ticket.dueDate))}</b></div><div><span>Progress</span><b>${ticket.completedCount || 0}/${ticket.sectionsCount || 0} complete</b></div>`;

    const flow = $('tmWorkflowFlow');
    const { nodes, edges } = graphLayout(ticket);
    flow.innerHTML = `<svg class="tm-connection-layer tm-workflow-arrows" id="tmWorkflowArrows" aria-hidden="true"></svg><svg class="tm-connection-layer tm-team-workflow-arrows" id="tmTeamWorkflowArrows" aria-hidden="true"></svg>${nodes.map((section, index) => renderWorkflowCard(ticket, section, index)).join('') || '<div class="tm-empty-state"><h2>No workflow sections</h2><p>This task has no configured department sections.</p></div>'}`;

    nodes.forEach((node) => {
      const card = flow.querySelector(`[data-section-id="${CSS.escape(String(node.id))}"]`);
      if (!card) return;
      node._visualWidth = Math.max(1, card.offsetWidth || 300);
      node._visualHeight = Math.max(1, card.offsetHeight || 138);
    });

    const teamNodes = [];
    const teamEdges = [];
    if (state.view === 'my') {
      nodes.filter(isMyDepartmentSection).forEach((section) => {
        const layout = buildTeamViewerLayout(section, section);
        teamNodes.push(...layout.nodes);
        teamEdges.push(...layout.edges);
      });
    }
    if (teamNodes.length) flow.insertAdjacentHTML('beforeend', teamNodes.map(renderTeamTaskCard).join(''));
    teamNodes.forEach((node) => {
      const card = flow.querySelector(`[data-team-task-id="${CSS.escape(String(node.assignmentId))}"]`);
      if (!card) return;
      node._visualWidth = Math.max(1, card.offsetWidth || 246);
      node._visualHeight = Math.max(1, card.offsetHeight || 166);
    });

    const dimensions = getBoardDimensions([...nodes, ...teamNodes], { width: 980, height: 650 });
    state.viewer.width = dimensions.width;
    state.viewer.height = dimensions.height;
    state.viewer.bounds = workflowContentBounds([...nodes, ...teamNodes]);
    flow.style.width = `${dimensions.width}px`;
    flow.style.height = `${dimensions.height}px`;
    renderArrowLayer($('tmWorkflowArrows'), edges, (id) => nodes.find((node) => String(node.id) === String(id)), dimensions, 'tm-workflow-arrow', { markerId: 'tmWorkflowArrowHead', orientation: 'horizontal' });
    const verticalNodes = new Map([...nodes, ...teamNodes].map((node) => [String(node.id), node]));
    renderArrowLayer($('tmTeamWorkflowArrows'), teamEdges, (id) => verticalNodes.get(String(id)), dimensions, 'tm-workflow-arrow tm-workflow-arrow--team', { markerId: 'tmTeamWorkflowArrowHead', orientation: 'vertical' });
    applyViewerTransform();
    if (!state.viewer.manual && isOverlayOpen(workflowOverlay)) window.requestAnimationFrame(() => fitViewerToContent());
    hydrateIcons(workflowOverlay);
  }

  function openWorkflow(ticket) {
    state.selectedTicket = attachCachedPeopleWorkflows(ticket);
    state.viewer = { zoom: 1, offsetX: 0, offsetY: 0, pan: null, pinch: null, width: 980, height: 650, bounds: null, manual: false };
    setOverlay(workflowOverlay, true);
    window.requestAnimationFrame(() => {
      renderWorkflow(ticket);
      window.requestAnimationFrame(() => fitViewerToContent());
    });
    hydratePeopleWorkflows(ticket);
  }

  function openEditBuilder(ticket, adminPassword = '') {
    if (!ticket) return;
    const fallbackNodes = graphLayout(ticket).nodes || [];
    const fallbackById = new Map(fallbackNodes.map((node) => [String(node.id), node]));
    resetBuilder();
    state.builder.mode = 'edit';
    state.builder.ticketId = String(ticket.id || '');
    state.builder.adminPassword = adminPassword || '';
    state.builder.meta = {
      title: ticket.title || '',
      priority: ticket.priority || '',
      dueDate: ticket.dueDate || '',
      description: ticket.description || '',
    };
    state.builder.nodes = (ticket.sections || []).map((section) => {
      const fallback = fallbackById.get(String(section.id)) || { x: 64, y: 64 };
      const hasPosition = Number(section.canvasX) > 0 && Number(section.canvasY) > 0;
      return {
        id: String(section.id),
        department: section.department || '',
        request: section.request || '',
        details: section.details || '',
        deliveryDate: section.deliveryDate || '',
        attachments: attachmentList(section),
        attachment: attachmentList(section)[0] || null,
        x: hasPosition ? safeNumber(section.canvasX, fallback.x) : safeNumber(fallback.x, 64),
        y: hasPosition ? safeNumber(section.canvasY, fallback.y) : safeNumber(fallback.y, 64),
      };
    });
    state.builder.edges = ticketEdges(ticket).map((edge) => ({ from: String(edge.from), to: String(edge.to) }));
    const dimensions = getBoardDimensions(state.builder.nodes, { width: 1280, height: 900 });
    state.builder.canvas = { width: dimensions.width, height: dimensions.height };
    syncBuilderModeLabels();
    setOverlay(adminOverlay, false);
    setOverlay(workflowOverlay, false);
    setOverlay(builderOverlay, true);
    window.requestAnimationFrame(() => {
      renderBuilder();
      window.requestAnimationFrame(() => {
        measureBuilderNodes();
        renderBuilderArrows();
        fitBuilderToContent();
      });
    });
  }

  function setAdminVerifyMode(action = 'edit') {
    const isDelete = action === 'delete';
    state.pendingAdminAction = isDelete ? 'delete' : 'edit';
    const title = $('tmAdminVerifyTitle');
    const description = $('tmAdminVerifyDescription');
    const label = $('tmAdminVerifySubmitLabel');
    const submit = $('tmAdminVerifySubmit');
    if (title) title.textContent = isDelete ? 'Delete project' : 'Edit project workflow';
    if (description) description.textContent = isDelete
      ? 'Enter the admin password before opening the final delete confirmation.'
      : 'Enter the admin password to continue editing this project.';
    if (label) label.textContent = isDelete ? 'Verify & Delete' : 'Verify & Edit';
    submit?.classList.toggle('tm-btn--danger', isDelete);
    hydrateIcons(adminOverlay);
  }

  function openAdminVerification(ticket, action = 'edit') {
    if (!ticket) return;
    state.pendingEditTicket = action === 'edit' ? ticket : null;
    state.pendingDeleteTicket = action === 'delete' ? ticket : null;
    setAdminVerifyMode(action);
    const input = $('tmAdminPasswordInput');
    const error = $('tmAdminVerifyError');
    if (input) input.value = '';
    if (error) error.textContent = '';
    setOverlay(adminOverlay, true);
    window.requestAnimationFrame(() => input?.focus());
  }

  function requestProjectEdit() {
    const ticket = state.selectedTicket;
    if (!ticket) return;
    if (window.__tmIsPageAdmin) {
      openEditBuilder(ticket, '');
      return;
    }
    openAdminVerification(ticket, 'edit');
  }

  async function confirmAndDeleteProject(ticket, adminPassword = '') {
    if (!ticket || state.view !== 'delegated') return;
    const confirmed = window.OpsDeleteConfirm
      ? await window.OpsDeleteConfirm.confirm({
          title: 'Delete project?',
          itemType: 'project',
          itemName: ticket.title || ticket.ticketCode || 'this project',
          message: `You’re going to permanently delete “${ticket.title || ticket.ticketCode || 'this project'}”, including its workflow blocks, arrows, team assignments, reports, and files. This action cannot be undone.`,
          cancelLabel: 'No, keep it.',
          confirmLabel: 'Yes, Delete!',
        })
      : window.confirm(`Delete ${ticket.title || ticket.ticketCode || 'this project'} permanently?`);
    if (!confirmed) return;

    const button = $('tmDeleteProjectBtn');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    try {
      await api(`/api/task-management/${encodeURIComponent(ticket.id)}`, {
        method: 'DELETE',
        body: { view: state.view, adminPassword },
      });
      setOverlay(adminOverlay, false);
      setOverlay(workflowOverlay, false);
      state.pendingDeleteTicket = null;
      state.pendingEditTicket = null;
      state.selectedTicket = null;
      state.tickets = (state.tickets || []).filter((item) => String(item.id) !== String(ticket.id));
      renderTickets();
      showToast('success', 'Project deleted', 'The project and its workflow were deleted successfully.');
    } catch (err) {
      showToast('error', 'Delete failed', err.message || 'Failed to delete the project.');
    } finally {
      if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  }

  function requestProjectDelete() {
    const ticket = state.selectedTicket;
    if (!ticket || state.view !== 'delegated') return;
    if (window.__tmIsPageAdmin) {
      confirmAndDeleteProject(ticket, '');
      return;
    }
    openAdminVerification(ticket, 'delete');
  }

  async function verifyProjectEditAccess(event) {
    event.preventDefault();
    const action = state.pendingAdminAction === 'delete' ? 'delete' : 'edit';
    const ticket = action === 'delete'
      ? (state.pendingDeleteTicket || state.selectedTicket)
      : (state.pendingEditTicket || state.selectedTicket);
    if (!ticket) return;
    const password = $('tmAdminPasswordInput')?.value || '';
    const error = $('tmAdminVerifyError');
    const submit = $('tmAdminVerifySubmit');
    if (!password.trim()) {
      if (error) error.textContent = 'Enter the admin password.';
      return;
    }
    if (submit) submit.disabled = true;
    if (error) error.textContent = '';
    try {
      await api('/api/task-management/admin/verify', {
        method: 'POST',
        body: { view: state.view, adminPassword: password },
      });
      setOverlay(adminOverlay, false);
      if (action === 'delete') {
        state.pendingDeleteTicket = null;
        await confirmAndDeleteProject(ticket, password);
      } else {
        state.pendingEditTicket = null;
        openEditBuilder(ticket, password);
      }
    } catch (err) {
      if (error) error.textContent = err.message || 'Invalid admin password.';
    } finally {
      if (submit) submit.disabled = false;
    }
  }


  function renderWorkFilePreview() {
    const preview = $('tmWorkFilePreview');
    if (!preview) return;
    const file = state.workFile;
    if (!file?.url) {
      preview.hidden = true;
      preview.innerHTML = '';
      return;
    }
    preview.hidden = false;
    preview.innerHTML = `
      <span class="tm-upload-file__icon"><i data-feather="file-text"></i></span>
      <span class="tm-upload-file__info"><b>${escapeHtml(file.name || 'Work file')}</b><small>${escapeHtml([file.type || '', formatBytes(file.size)].filter(Boolean).join(' · ') || 'Uploaded work file')}</small></span>
      <a class="tm-upload-file__open" href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open work file"><i data-feather="external-link"></i></a>
      ${canEditCurrentWorkTarget() ? '<button class="tm-upload-file__remove" type="button" data-tm-remove-work-file aria-label="Remove work file"><i data-feather="trash-2"></i></button>' : ''}`;
    hydrateIcons(preview);
  }

  function updateRejectedReasonPreview() {
    const preview = $('tmRejectedReasonPreview');
    const button = $('tmRejectedReasonBtn');
    const reason = String(state.rejectedReasonDraft || '').trim();
    if (preview) preview.textContent = reason || 'No rejected reason';
    if (button) button.classList.toggle('has-value', !!reason);
  }

  function applyWorkPagePermissions() {
    const editable = canEditCurrentWorkTarget();
    ['tmWorkStatusInput', 'tmWorkReportInput', 'tmWorkFileInput', 'tmWorkLinkInput'].forEach((id) => {
      const input = $(id);
      if (input) input.disabled = !editable;
    });
    const rejectButton = $('tmRejectedReasonBtn');
    if (rejectButton) rejectButton.disabled = !editable;
    const saveButton = $('tmSaveWorkBtn');
    if (saveButton) saveButton.hidden = !editable;
    const note = $('tmWorkPermissionNote');
    if (note) {
      note.hidden = editable;
      const message = note.querySelector('span');
      if (message) {
        message.textContent = state.workTargetType === 'assignment'
          ? 'This team-member task is read-only for your access level.'
          : 'Department tasks can be updated only by users with Edit or Admin access.';
      }
    }
    refreshModernSelect($('tmWorkStatusInput'));
  }

  function configureWorkPage(target, { type = 'section' } = {}) {
    const isAssignment = type === 'assignment';
    state.workTargetType = isAssignment ? 'assignment' : 'section';
    state.workAssignment = isAssignment ? target : null;
    state.workSection = isAssignment
      ? (state.selectedTicket?.sections || []).find((section) => String(section.id) === String(target?.sectionId || target?.parentSectionId || '')) || null
      : target;
    const current = isAssignment ? state.workAssignment : state.workSection;
    if (!current) return false;

    state.workFile = current.workFile ? { ...current.workFile } : null;
    state.workFileUploadPending = false;
    state.rejectedReasonDraft = current.rejectionReason || '';
    state.workPreviousStatus = current.status || 'not_started';

    const kicker = $('tmWorkPageKicker');
    const title = $('tmWorkPageTitle');
    const sub = $('tmWorkPageSub');
    if (kicker) kicker.textContent = isAssignment ? 'Team member work' : 'Department work';
    if (title) title.textContent = 'Work Page';
    if (sub) {
      sub.textContent = isAssignment
        ? 'Update the assigned work status, report, and files.'
        : 'Update the department task status, report, and files.';
    }
    const summary = $('tmWorkPageSummary');
    if (summary) {
      summary.innerHTML = '';
      summary.hidden = true;
      summary.setAttribute('aria-hidden', 'true');
    }

    $('tmWorkStatusInput').value = current.status || 'not_started';
    refreshModernSelect($('tmWorkStatusInput'));
    $('tmWorkReportInput').value = current.workReport || current.completionNote || '';
    $('tmWorkLinkInput').value = current.workLink || '';
    $('tmWorkPageError').textContent = '';
    const fileInput = $('tmWorkFileInput');
    if (fileInput) fileInput.value = '';
    renderWorkFilePreview();
    updateRejectedReasonPreview();
    applyWorkPagePermissions();
    hydrateIcons(workPageOverlay);
    return true;
  }

  function openWorkPage() {
    const section = state.readonlySection;
    if (!section || !state.selectedTicket || state.view !== 'my' || !isMyDepartmentSection(section) || !canEditDepartmentWork()) return;
    if (!configureWorkPage(section, { type: 'section' })) return;
    setOverlay(sectionDetailsOverlay, false);
    setOverlay(workPageOverlay, true);
  }

  function openWorkPageFromDetails() {
    if (state.readonlyAssignment) {
      openTeamWorkPage(state.readonlyAssignment.id, state.readonlyAssignment.sectionId || state.readonlySection?.id || '');
      return;
    }
    openWorkPage();
  }

  function findPeopleAssignment(assignmentId, sectionId = '') {
    const wanted = String(assignmentId || '');
    const sections = state.selectedTicket?.sections || [];
    for (const section of sections) {
      if (sectionId && String(section.id) !== String(sectionId)) continue;
      const workflow = section.peopleWorkflow || cachedPeopleWorkflow(section.id);
      const assignment = (workflow?.assignments || []).find((item) => String(item.id) === wanted);
      if (assignment) return { section, assignment, workflow };
    }
    return null;
  }

  function openTeamWorkPage(assignmentId, sectionId = '') {
    const found = findPeopleAssignment(assignmentId, sectionId);
    if (!found || !canOpenTeamTask(found.assignment)) return;
    state.readonlySection = found.section;
    state.readonlyAssignment = { ...found.assignment, sectionId: found.section.id };
    if (!configureWorkPage({ ...found.assignment, sectionId: found.section.id }, { type: 'assignment' })) return;
    setOverlay(sectionDetailsOverlay, false);
    setOverlay(workPageOverlay, true);
  }

  function openRejectedReason() {
    if (!canEditCurrentWorkTarget()) return;
    $('tmRejectReasonInput').value = state.rejectedReasonDraft || '';
    $('tmRejectReasonError').textContent = '';
    setOverlay(rejectReasonOverlay, true);
  }

  function saveRejectedReason(event) {
    event.preventDefault();
    const reason = $('tmRejectReasonInput').value.trim();
    if (!reason) {
      $('tmRejectReasonError').textContent = 'Rejected reason is required.';
      return;
    }
    state.rejectedReasonDraft = reason;
    $('tmRejectReasonError').textContent = '';
    updateRejectedReasonPreview();
    setOverlay(rejectReasonOverlay, false);
  }

  async function uploadWorkFile(file) {
    const errorEl = $('tmWorkPageError');
    const input = $('tmWorkFileInput');
    const progress = $('tmWorkFileProgress');
    if (!file || !canEditCurrentWorkTarget()) return;
    if (file.size > 10 * 1024 * 1024) {
      if (errorEl) errorEl.textContent = 'The work file must be 10 MB or less.';
      if (input) input.value = '';
      return;
    }
    state.workFileUploadPending = true;
    if (errorEl) errorEl.textContent = '';
    if (input) input.disabled = true;
    if (progress) progress.hidden = false;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await api(`/api/task-management/upload?view=${encodeURIComponent(state.view)}`, {
        method: 'POST',
        body: { dataUrl, filename: file.name, mime: file.type || '', size: file.size },
      });
      state.workFile = result.file || null;
      renderWorkFilePreview();
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message || 'Failed to upload work file.';
    } finally {
      state.workFileUploadPending = false;
      if (input) { input.disabled = !canEditCurrentWorkTarget(); input.value = ''; }
      if (progress) progress.hidden = true;
    }
  }

  async function submitWorkPage(event) {
    event.preventDefault();
    if (!canEditCurrentWorkTarget()) {
      showToast('info', 'Read-only access', 'You can review this work page, but you cannot change its information.');
      return;
    }
    const isAssignment = state.workTargetType === 'assignment';
    const target = isAssignment ? state.workAssignment : state.workSection;
    if (!target) return;
    const status = $('tmWorkStatusInput').value || 'not_started';
    const report = $('tmWorkReportInput').value.trim();
    const workLink = $('tmWorkLinkInput').value.trim();
    const errorEl = $('tmWorkPageError');
    if (state.workFileUploadPending) {
      errorEl.textContent = 'Wait until the work file finishes uploading.';
      return;
    }
    if (status === 'rejected' && !String(state.rejectedReasonDraft || '').trim()) {
      errorEl.textContent = 'Enter the rejected reason before saving.';
      openRejectedReason();
      return;
    }
    if (workLink && !/^https?:\/\//i.test(workLink)) {
      errorEl.textContent = 'Work link must start with http:// or https://.';
      return;
    }
    const button = $('tmSaveWorkBtn');
    if (button) button.disabled = true;
    errorEl.textContent = '';
    try {
      const endpoint = isAssignment
        ? `/api/task-management/assignments/${encodeURIComponent(target.id)}/work`
        : `/api/task-management/sections/${encodeURIComponent(target.id)}/work`;
      const data = await api(endpoint, {
        method: 'PATCH',
        body: {
          view: state.view,
          status,
          workReport: report,
          rejectionReason: status === 'rejected' ? state.rejectedReasonDraft : '',
          workLink,
          workFile: state.workFile || null,
        },
      });

      setOverlay(workPageOverlay, false);
      if (isAssignment) {
        const sectionId = String(data.sectionId || state.workSection?.id || target.sectionId || '');
        const workflow = {
          assignments: Array.isArray(data.assignments) ? data.assignments : [],
          edges: Array.isArray(data.edges) ? data.edges : [],
        };
        if (sectionId) state.peopleWorkflowCache.set(sectionId, workflow);
        const section = (state.selectedTicket?.sections || []).find((item) => String(item.id) === sectionId);
        if (section) section.peopleWorkflow = workflow;
        state.workAssignment = (workflow.assignments || []).find((item) => String(item.id) === String(target.id)) || data.assignment || null;
        state.workTargetType = 'section';
        renderWorkflow(state.selectedTicket);
        showToast('success', 'Team work saved', status === 'completed'
          ? 'The completed work is now visible in the department section.'
          : 'Your team-member task was updated. Its work details stay private until it is marked Done.');
      } else {
        await loadTickets();
        const latest = state.tickets.find((ticket) => String(ticket.id) === String(data.ticket?.id)) || data.ticket;
        state.selectedTicket = latest;
        state.workSection = (latest?.sections || []).find((item) => String(item.id) === String(target.id)) || data.section || null;
        state.readonlySection = state.workSection;
        state.workTargetType = 'section';
        renderWorkflow(latest);
        showToast('success', 'Department work saved', 'The task status, report, and work files were updated.');
      }
    } catch (error) {
      errorEl.textContent = error.message || 'Failed to save task work.';
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function openPeopleWorkflow() {
    const section = state.readonlySection || state.workSection;
    if (!section || state.view !== 'my') return;
    if (!canEditMyTaskWork()) {
      showToast('info', 'View-only access', 'Edit or Admin access is required to assign work to team members.');
      return;
    }
    const button = $('tmOpenPeopleWorkflowBtn');
    if (button) button.disabled = true;
    try {
      const data = await api(`/api/task-management/sections/${encodeURIComponent(section.id)}/people-workflow?view=${encodeURIComponent(state.view)}`);
      const returnToSectionDetails = isOverlayOpen(sectionDetailsOverlay);
      const returnToWorkPage = isOverlayOpen(workPageOverlay);
      resetBuilder();
      state.builder.mode = 'people';
      state.builder.contextSectionId = String(section.id);
      state.builder.returnToWorkPage = returnToWorkPage;
      state.builder.returnToSectionDetails = returnToSectionDetails;
      state.teamMembers = Array.isArray(data.members) ? data.members : [];
      state.builder.nodes = (data.assignments || []).map((assignment) => ({
        id: String(assignment.id),
        assigneeId: String(assignment.assigneeId || ''),
        department: assignment.assigneeName || '',
        request: assignment.task || '',
        details: assignment.details || '',
        deliveryDate: assignment.deliveryDate || '',
        attachments: attachmentList(assignment),
        attachment: attachmentList(assignment)[0] || null,
        x: safeNumber(assignment.canvasX, 80),
        y: safeNumber(assignment.canvasY, 80),
      }));
      state.builder.edges = (data.edges || []).map((edge) => ({ from: String(edge.from), to: String(edge.to) }));
      arrangePeopleNodesVertically(state.builder.nodes, state.builder.edges);
      const dimensions = getBoardDimensions(state.builder.nodes, { width: 1280, height: 900 });
      state.builder.canvas = { width: dimensions.width, height: dimensions.height };
      syncBuilderModeLabels();
      setOverlay(sectionDetailsOverlay, false);
      setOverlay(workPageOverlay, false);
      setOverlay(builderOverlay, true);
      window.requestAnimationFrame(() => {
        renderBuilder();
        fitBuilderToContent();
      });
    } catch (error) {
      showToast('error', 'Could not open team workflow', error.message || 'Please try again.');
    } finally {
      if (button) button.disabled = !canEditMyTaskWork();
    }
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
    refreshModernSelect($('tmSectionStatusInput'));
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
      state.accessLevel = String(meta.accessLevel || (meta.isPageAdmin ? 'admin' : 'view')).toLowerCase();
      window.__tmCurrentUser = state.currentUser;
      window.__tmIsPageAdmin = !!meta.isPageAdmin;
      window.__tmAccessLevel = state.accessLevel;
    } catch {
      state.departments = [];
      state.currentUser = {};
      state.accessLevel = 'view';
    }
    renderDepartmentFilter();
    await loadTickets({ preserve: false });
  }

  document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    enhanceAllModernSelects();
    renderDepartmentFilter();
    metaForm?.addEventListener('submit', saveTicketMeta);
    blockForm?.addEventListener('submit', saveBlockEditor);
    adminForm?.addEventListener('submit', verifyProjectEditAccess);
    updateForm?.addEventListener('submit', submitSectionUpdate);
    workPageForm?.addEventListener('submit', submitWorkPage);
    rejectReasonForm?.addEventListener('submit', saveRejectedReason);
    $('tmAddBlockBtn')?.addEventListener('click', addBuilderNode);
    $('tmZoomOutBtn')?.addEventListener('click', () => setBuilderZoom(builderZoom() - 0.1));
    $('tmZoomResetBtn')?.addEventListener('click', () => setBuilderZoom(1));
    $('tmZoomInBtn')?.addEventListener('click', () => setBuilderZoom(builderZoom() + 0.1));
    $('tmTaskDetailsBtn')?.addEventListener('click', openTicketMeta);
    $('tmSaveWorkflowBtn')?.addEventListener('click', saveWorkflowBuilder);
    $('tmEditProjectBtn')?.addEventListener('click', requestProjectEdit);
    $('tmDeleteProjectBtn')?.addEventListener('click', requestProjectDelete);
    $('tmOpenWorkPageBtn')?.addEventListener('click', openWorkPageFromDetails);
    $('tmOpenPeopleWorkflowBtn')?.addEventListener('click', openPeopleWorkflow);
    $('tmRejectedReasonBtn')?.addEventListener('click', openRejectedReason);
    $('tmBlockAttachmentInput')?.addEventListener('change', (event) => uploadBlockAttachments(event.target.files));
    $('tmWorkFileInput')?.addEventListener('change', (event) => uploadWorkFile(event.target.files?.[0]));
    $('tmWorkStatusInput')?.addEventListener('change', (event) => {
      if (event.target.value === 'rejected' && canEditCurrentWorkTarget()) openRejectedReason();
    });
    $('tmViewerZoomOutBtn')?.addEventListener('click', () => applyViewerZoom(viewerZoom() - 0.1));
    $('tmViewerZoomResetBtn')?.addEventListener('click', () => fitViewerToContent());
    $('tmViewerZoomInBtn')?.addEventListener('click', () => applyViewerZoom(viewerZoom() + 0.1));
    searchInput?.addEventListener('input', () => { state.query = norm(searchInput.value); renderTickets(); });
    departmentFilterBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleDepartmentFilter();
    });
    departmentFilterPanel?.addEventListener('click', (event) => {
      const clear = event.target.closest('[data-tm-clear-department]');
      const option = event.target.closest('[data-tm-department]');
      if (!clear && !option) return;
      event.preventDefault();
      event.stopPropagation();
      state.activeDepartment = clear ? 'all' : (option.dataset.tmDepartment || 'all');
      closeDepartmentFilter();
      renderTickets();
    });

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

    builderBoard?.addEventListener('pointerdown', (event) => {
      const block = event.target.closest('[data-builder-block]');
      if (block) queueBlockDrag(event, block.dataset.builderBlock);
    });
    builderArrows?.addEventListener('pointerdown', (event) => {
      if (event.target.closest('[data-tm-builder-edge]')) event.stopPropagation();
    });
    builderArrows?.addEventListener('click', (event) => {
      const arrow = event.target.closest('[data-tm-builder-edge]');
      if (!arrow) return;
      event.preventDefault();
      event.stopPropagation();
      selectBuilderEdge(arrow.dataset.tmBuilderEdge);
    });
    builderCanvasWrap?.addEventListener('pointerdown', startCanvasPan);
    builderCanvasWrap?.addEventListener('wheel', handleBuilderWheel, { passive: false });
    builderCanvasWrap?.addEventListener('touchstart', handleBuilderTouchStart, { passive: false });
    builderCanvasWrap?.addEventListener('touchmove', handleBuilderTouchMove, { passive: false });
    builderCanvasWrap?.addEventListener('touchend', handleBuilderTouchEnd, { passive: false });
    builderCanvasWrap?.addEventListener('touchcancel', handleBuilderTouchEnd, { passive: false });
    workflowCanvasWrap?.addEventListener('pointerdown', startViewerPan);
    workflowCanvasWrap?.addEventListener('wheel', handleViewerWheel, { passive: false });
    workflowCanvasWrap?.addEventListener('touchstart', handleViewerTouchStart, { passive: false });
    workflowCanvasWrap?.addEventListener('touchmove', handleViewerTouchMove, { passive: false });
    workflowCanvasWrap?.addEventListener('touchend', handleViewerTouchEnd, { passive: false });
    workflowCanvasWrap?.addEventListener('touchcancel', handleViewerTouchEnd, { passive: false });
    window.addEventListener('resize', () => {
      if (isOverlayOpen(workflowOverlay) && !state.viewer.manual) window.requestAnimationFrame(() => fitViewerToContent());
    }, { passive: true });

    document.addEventListener('pointermove', (event) => {
      if (moveBlockDrag(event)) return;
      if (moveCanvasPan(event)) return;
      moveViewerPan(event);
    });
    document.addEventListener('pointerup', (event) => {
      if (endBlockDrag(event)) return;
      if (endCanvasPan(event)) return;
      endViewerPan(event);
    });
    document.addEventListener('pointercancel', (event) => {
      if (endBlockDrag(event)) return;
      if (endCanvasPan(event)) return;
      endViewerPan(event);
    });

    document.addEventListener('click', async (event) => {
      const calendarToday = event.target.closest('[data-tm-calendar-today]');
      if (calendarToday) {
        const now = new Date();
        state.calendar.month = new Date(now.getFullYear(), now.getMonth(), 1);
        state.calendar.selectedDate = todayKey();
        renderAgenda();
        return;
      }
      const calendarNav = event.target.closest('[data-tm-calendar-nav]');
      if (calendarNav) {
        const direction = calendarNav.dataset.tmCalendarNav === 'prev' ? -1 : 1;
        const current = state.calendar.month;
        state.calendar.month = new Date(current.getFullYear(), current.getMonth() + direction, 1);
        renderAgenda();
        return;
      }
      const calendarDay = event.target.closest('[data-tm-calendar-day]');
      if (calendarDay) {
        const key = calendarDay.dataset.tmCalendarDay || todayKey();
        const date = dateFromKey(key);
        state.calendar.selectedDate = key;
        if (date) state.calendar.month = new Date(date.getFullYear(), date.getMonth(), 1);
        renderAgenda();
        return;
      }
      const datePickerButton = event.target.closest('[data-tm-date-picker]');
      if (datePickerButton) {
        event.preventDefault();
        const input = $(datePickerButton.dataset.tmDatePicker);
        try { if (typeof input?.showPicker === 'function') input.showPicker(); else input?.focus(); } catch { input?.focus(); }
        return;
      }
      if (!event.target.closest('#tmDepartmentFilter')) closeDepartmentFilter();
      if (!event.target.closest('.tm-select')) closeModernSelects();
      const close = event.target.closest('[data-tm-close]');
      if (close) {
        const which = close.dataset.tmClose;
        if (which === 'builder') {
          const peopleMode = state.builder?.mode === 'people';
          const returnToWork = peopleMode && state.builder?.returnToWorkPage && !!(state.workSection || state.readonlySection);
          const returnToDetails = peopleMode && state.builder?.returnToSectionDetails && !!state.readonlySection;
          const sectionId = state.readonlySection?.id || state.workSection?.id || '';
          clearPendingBlockPress();
          endBlockDrag();
          endCanvasPan();
          setOverlay(builderOverlay, false);
          if (peopleMode) resetBuilder();
          if (returnToDetails && sectionId) openReadonlySectionDetails(sectionId);
          else if (returnToWork && state.readonlySection) openWorkPage();
        }
        if (which === 'meta') {
          setOverlay(metaOverlay, false);
          if (state.startingProject) { state.startingProject = false; resetBuilder(); }
        }
        if (which === 'block') {
          state.blockDraftAttachments = [];
          state.blockUploadPending = false;
          setOverlay(blockOverlay, false);
        }
        if (which === 'workflow') setOverlay(workflowOverlay, false);
        if (which === 'section-details') { state.readonlySection = null; state.readonlyAssignment = null; setOverlay(sectionDetailsOverlay, false); }
        if (which === 'work-page') { state.workSection = null; state.workAssignment = null; state.workTargetType = 'section'; state.workFile = null; setOverlay(workPageOverlay, false); }
        if (which === 'reject-reason') {
          if ($('tmWorkStatusInput')?.value === 'rejected' && !String(state.rejectedReasonDraft || '').trim()) {
            $('tmWorkStatusInput').value = state.workPreviousStatus || 'not_started';
            refreshModernSelect($('tmWorkStatusInput'));
          }
          setOverlay(rejectReasonOverlay, false);
        }
        if (which === 'admin') { state.pendingEditTicket = null; state.pendingDeleteTicket = null; setAdminVerifyMode('edit'); setOverlay(adminOverlay, false); }
        if (which === 'update') setOverlay(updateOverlay, false);
        return;
      }
      if (event.target.closest('[data-tm-new-ticket]')) { openCreateBuilder(); return; }
      if (event.target.closest('[data-tm-retry]')) { loadTickets({ preserve: false }); return; }

      const removeAttachment = event.target.closest('[data-tm-remove-attachment]');
      if (removeAttachment) {
        const index = Number(removeAttachment.dataset.tmAttachmentIndex);
        const attachments = attachmentList(state.blockDraftAttachments);
        const attachment = attachments[index];
        if (!attachment) return;
        const attachmentName = attachment.name || 'this attachment';
        const confirmed = window.OpsDeleteConfirm
          ? await window.OpsDeleteConfirm.confirm({ title: 'Delete attachment?', itemType: 'attachment', itemName: attachmentName, message: `You’re going to remove “${attachmentName}” from this workflow block. This action cannot be undone after saving.` })
          : window.confirm(`Delete “${attachmentName}”?`);
        if (!confirmed) return;
        attachments.splice(index, 1);
        state.blockDraftAttachments = attachments;
        renderBlockAttachmentPreview();
        return;
      }

      const removeWorkFile = event.target.closest('[data-tm-remove-work-file]');
      if (removeWorkFile) {
        const fileName = state.workFile?.name || 'this work file';
        const confirmed = window.OpsDeleteConfirm
          ? await window.OpsDeleteConfirm.confirm({ title: 'Delete work file?', itemType: 'work file', itemName: fileName, message: `You’re going to remove “${fileName}” from this work report. This action cannot be undone after saving.` })
          : window.confirm(`Delete “${fileName}”?`);
        if (!confirmed) return;
        state.workFile = null;
        renderWorkFilePreview();
        return;
      }

      const editBlock = event.target.closest('[data-tm-edit-block]');
      if (editBlock) { openBlockEditor(editBlock.dataset.tmEditBlock); return; }
      const deleteBlock = event.target.closest('[data-tm-delete-block]');
      if (deleteBlock) {
        const node = state.builder.nodes.find((item) => String(item.id) === String(deleteBlock.dataset.tmDeleteBlock));
        const ok = window.OpsDeleteConfirm ? await window.OpsDeleteConfirm.confirm({ title: 'Delete workflow block?', itemType: 'workflow block', itemName: node?.department || `Block ${state.builder.nodes.indexOf(node) + 1}`, message: 'You’re going to remove this workflow block and every arrow connected to it. This action cannot be undone after the project is saved.' }) : window.confirm('Delete this workflow block?');
        if (ok) deleteBuilderNode(deleteBlock.dataset.tmDeleteBlock);
        return;
      }
      const socket = event.target.closest('[data-tm-socket]');
      if (socket) {
        event.preventDefault();
        selectBuilderSocket(socket.dataset.tmSocket, socket.dataset.tmSocketNode);
        return;
      }
      const deleteEdge = event.target.closest('[data-builder-edge-delete]');
      if (deleteEdge) {
        const ok = window.OpsDeleteConfirm ? await window.OpsDeleteConfirm.confirm({ title: 'Delete workflow arrow?', itemType: 'workflow arrow', message: 'You’re going to remove this connection between the two workflow blocks. This action cannot be undone after the project is saved.' }) : window.confirm('Delete this workflow arrow?');
        if (ok) deleteBuilderEdge(deleteEdge.dataset.builderEdgeDelete);
        return;
      }

      const statusAction = event.target.closest('[data-tm-section-status]');
      if (statusAction) { openSectionUpdate(statusAction.dataset.sectionId, statusAction.dataset.tmSectionStatus); return; }
      const editAction = event.target.closest('[data-tm-edit-section]');
      if (editAction) { openSectionUpdate(editAction.dataset.tmEditSection); return; }

      const teamTaskCard = event.target.closest('[data-tm-open-team-task]');
      if (teamTaskCard && !event.target.closest('a')) {
        openTeamTaskDetails(teamTaskCard.dataset.tmOpenTeamTask, teamTaskCard.dataset.parentSectionId || '');
        return;
      }

      const sectionCard = event.target.closest('[data-tm-open-section]');
      if (sectionCard && !event.target.closest('a, button')) {
        openReadonlySectionDetails(sectionCard.dataset.tmOpenSection);
        return;
      }

      const ticketCard = event.target.closest('[data-ticket-id]');
      if (ticketCard) {
        const ticket = state.tickets.find((item) => String(item.id) === String(ticketCard.dataset.ticketId));
        if (ticket) openWorkflow(ticket);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const openSelect = [...modernSelectControllers].find((controller) => !controller.menu.hidden);
        if (openSelect) { openSelect.close({ focus: true }); return; }
        if (departmentFilterPanel && !departmentFilterPanel.hidden) { closeDepartmentFilter({ focus: true }); return; }
        if (isOverlayOpen(rejectReasonOverlay)) setOverlay(rejectReasonOverlay, false);
        else if (isOverlayOpen(workPageOverlay)) { state.workSection = null; state.workAssignment = null; state.workTargetType = 'section'; setOverlay(workPageOverlay, false); }
        else if (isOverlayOpen(sectionDetailsOverlay)) { state.readonlySection = null; state.readonlyAssignment = null; setOverlay(sectionDetailsOverlay, false); }
        else if (isOverlayOpen(updateOverlay)) setOverlay(updateOverlay, false);
        else if (isOverlayOpen(adminOverlay)) { state.pendingEditTicket = null; state.pendingDeleteTicket = null; setAdminVerifyMode('edit'); setOverlay(adminOverlay, false); }
        else if (isOverlayOpen(blockOverlay)) setOverlay(blockOverlay, false);
        else if (isOverlayOpen(metaOverlay)) {
          setOverlay(metaOverlay, false);
          if (state.startingProject) { state.startingProject = false; resetBuilder(); }
        }
        else if (isOverlayOpen(workflowOverlay)) setOverlay(workflowOverlay, false);
        else if (isOverlayOpen(builderOverlay) && state.builder.connecting) {
          state.builder.connecting = false;
          state.builder.connectFrom = null;
          renderBuilder();
          updateBuilderStatus('Connection cancelled.');
        }
        else if (isOverlayOpen(builderOverlay)) {
          const peopleMode = state.builder?.mode === 'people';
          const returnToWork = peopleMode && state.builder?.returnToWorkPage && !!(state.workSection || state.readonlySection);
          const returnToDetails = peopleMode && state.builder?.returnToSectionDetails && !!state.readonlySection;
          const sectionId = state.readonlySection?.id || state.workSection?.id || '';
          setOverlay(builderOverlay, false);
          if (peopleMode) resetBuilder();
          if (returnToDetails && sectionId) openReadonlySectionDetails(sectionId);
          else if (returnToWork && state.readonlySection) openWorkPage();
        }
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const teamTaskCard = document.activeElement?.closest?.('[data-tm-open-team-task]');
        if (teamTaskCard && isOverlayOpen(workflowOverlay) && !isOverlayOpen(workPageOverlay)) {
          event.preventDefault();
          openTeamTaskDetails(teamTaskCard.dataset.tmOpenTeamTask, teamTaskCard.dataset.parentSectionId || '');
          return;
        }
        const sectionCard = document.activeElement?.closest?.('[data-tm-open-section]');
        if (sectionCard && isOverlayOpen(workflowOverlay) && !isOverlayOpen(sectionDetailsOverlay)) {
          event.preventDefault();
          openReadonlySectionDetails(sectionCard.dataset.tmOpenSection);
          return;
        }
        const card = document.activeElement?.closest?.('[data-ticket-id]');
        if (card) { event.preventDefault(); card.click(); }
      }
    });
    init();
  });
})();

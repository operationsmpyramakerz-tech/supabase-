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
    view: TASK_VIEW,
    currentUser: {},
    editingBlockId: null,
    startingProject: false,
    blockDraftAttachment: null,
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
  };

  const grid = $('tmTicketGrid');
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
  const metaForm = $('tmTicketMetaForm');
  const blockForm = $('tmBlockEditorForm');
  const adminForm = $('tmAdminVerifyForm');
  const updateForm = $('tmUpdateSectionForm');
  const updateError = $('tmUpdateSectionError');
  const builderBoard = $('tmBuilderBoard');
  const builderArrows = $('tmBuilderArrows');
  const builderCanvasWrap = $('tmBuilderCanvasWrap');
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
    const modalOpen = [builderOverlay, metaOverlay, blockOverlay, workflowOverlay, sectionDetailsOverlay, adminOverlay, updateOverlay].some(isOverlayOpen);
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
      ...(ticket.sections || []).flatMap((section) => [section.department, section.request, section.details, section.deliveryDate, section.attachment?.name]),
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

  function renderTickets() {
    if (!grid) return;
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
        if (value) value.textContent = selected?.textContent?.trim() || 'Select';
        trigger.classList.toggle('is-placeholder', !selected?.value);
        trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
        trigger.tabIndex = select.disabled ? -1 : 0;
        menu.innerHTML = options.map((option, index) => `
          <div class="tm-select__option${option.selected ? ' is-selected' : ''}${option.disabled ? ' is-disabled' : ''}" role="option" tabindex="-1" data-tm-select-index="${index}" aria-selected="${option.selected}" aria-disabled="${option.disabled}">
            <span>${escapeHtml(option.textContent?.trim() || '')}</span><i data-feather="check"></i>
          </div>`).join('');
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
    };
    state.pendingEditTicket = null;
    state.editingBlockId = null;
    state.startingProject = false;
    state.blockDraftAttachment = null;
    state.blockUploadPending = false;
    state.drag = null;
    state.pan = null;
    state.pinch = null;
    clearPendingBlockPress();
    syncBuilderModeLabels();
  }

  function syncBuilderModeLabels() {
    const editing = state.builder?.mode === 'edit';
    const title = $('tmBuilderTitle');
    const saveLabel = $('tmSaveWorkflowLabel');
    if (title) title.textContent = editing ? 'Edit Project Workflow' : 'Create Project Workflow';
    if (saveLabel) saveLabel.textContent = editing ? 'Save Changes' : 'Create Project';
  }

  function builderZoom() {
    return clamp(safeNumber(state.builder?.zoom, 1), 0.4, 1.8);
  }

  function nextBlockPosition() {
    const count = state.builder.nodes.length;
    const column = count % 3;
    const row = Math.floor(count / 3);
    const zoom = builderZoom();
    const visibleCenterX = (safeNumber(builderCanvasWrap?.scrollLeft) + Math.max(620, safeNumber(builderCanvasWrap?.clientWidth, 920)) / 2) / zoom;
    const visibleCenterY = (safeNumber(builderCanvasWrap?.scrollTop) + Math.max(360, safeNumber(builderCanvasWrap?.clientHeight, 560)) / 2) / zoom;
    return {
      x: Math.max(70, Math.round(visibleCenterX - 150 + (column - 1) * 330)),
      y: Math.max(80, Math.round(visibleCenterY - 86 + row * 230)),
    };
  }

  function addBuilderNode() {
    const position = nextBlockPosition();
    state.builder.nodes.push({ id: newClientId(), department: '', request: '', details: '', deliveryDate: '', attachment: null, x: position.x, y: position.y });
    renderBuilder();
    updateBuilderStatus('New block added. Use Edit to set its department and requested action.');
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
    state.builder.nodes.forEach((node) => {
      const block = document.createElement('article');
      const isSource = state.builder.connecting && state.builder.connectFrom === node.id;
      block.className = `tm-builder-block${isSource ? ' is-connect-source' : ''}`;
      block.dataset.builderBlock = node.id;
      block.style.left = `${Math.max(16, safeNumber(node.x, 60))}px`;
      block.style.top = `${Math.max(16, safeNumber(node.y, 80))}px`;
      const number = labels.get(String(node.id)) || '—';
      block.innerHTML = `
        <div class="tm-builder-block__head" data-tm-drag-handle>
          <div class="tm-builder-block__number">${escapeHtml(number)}</div>
          <div class="tm-builder-block__title"><b>${escapeHtml(node.department || 'Workflow Block')}</b>${node.department ? '' : '<small>Needs configuration</small>'}</div>
          <div class="tm-builder-block__actions">
            <button type="button" class="tm-builder-icon-btn" data-tm-edit-block="${escapeHtml(node.id)}" aria-label="Edit block"><i data-feather="edit-3"></i></button>
            <button type="button" class="tm-builder-icon-btn tm-builder-icon-btn--danger" data-tm-delete-block="${escapeHtml(node.id)}" aria-label="Delete block"><i data-feather="trash-2"></i></button>
          </div>
        </div>
        <div class="tm-builder-block__body">
          <span class="tm-builder-block__label">Requested action</span>
          <strong>${escapeHtml(node.request || 'Click Edit to configure this block')}</strong>
          ${(node.deliveryDate || node.attachment?.url) ? `<div class="tm-builder-block__meta">${node.deliveryDate ? `<span class="tm-builder-block__delivery"><i data-feather="calendar"></i>${escapeHtml(formatDate(node.deliveryDate))}</span>` : ''}${node.attachment?.url ? `<span class="tm-builder-block__attachment"><i data-feather="paperclip"></i>${escapeHtml(node.attachment.name || 'Attachment')}</span>` : ''}</div>` : ''}
        </div>
        <button type="button" class="tm-builder-socket tm-builder-socket--in" data-tm-socket="in" data-tm-socket-node="${escapeHtml(node.id)}" aria-label="Connect an incoming arrow to this block" title="Incoming connection"></button>
        <button type="button" class="tm-builder-socket tm-builder-socket--out" data-tm-socket="out" data-tm-socket-node="${escapeHtml(node.id)}" aria-label="Start an arrow from this block" title="Start connection"></button>`;
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

  function pathGeometry(from, to, { blockWidth = 300, blockHeight = 138 } = {}) {
    const fromSize = nodeVisualSize(from, { width: blockWidth, height: blockHeight });
    const toSize = nodeVisualSize(to, { width: blockWidth, height: blockHeight });
    const sx = safeNumber(from.x) + fromSize.width;
    const sy = safeNumber(from.y) + (fromSize.height / 2);
    const tx = safeNumber(to.x);
    const ty = safeNumber(to.y) + (toSize.height / 2);
    const horizontalDistance = Math.max(95, Math.abs(tx - sx) * 0.48);
    const direction = tx >= sx ? 1 : -1;
    const c1x = sx + (horizontalDistance * direction);
    const c2x = tx - (horizontalDistance * direction);
    return { sx, sy, tx, ty, c1x, c2x };
  }

  function pathBetween(from, to, options = {}) {
    const { sx, sy, tx, ty, c1x, c2x } = pathGeometry(from, to, options);
    return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
  }

  function cubicPointAtMidpoint(from, to) {
    const { sx, sy, tx, ty, c1x, c2x } = pathGeometry(from, to);
    const t = 0.5;
    const mt = 1 - t;
    return {
      x: (mt ** 3 * sx) + (3 * mt ** 2 * t * c1x) + (3 * mt * t ** 2 * c2x) + (t ** 3 * tx),
      y: (mt ** 3 * sy) + (3 * mt ** 2 * t * sy) + (3 * mt * t ** 2 * ty) + (t ** 3 * ty),
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
      return `<path class="${className}${selectedClass}" d="${pathBetween(from, to)}" marker-end="url(#${markerId})"${interactiveAttr}></path>`;
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
    const midpoint = cubicPointAtMidpoint(from, to);
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
      renderBuilder();
      setOverlay(builderOverlay, true);
      window.setTimeout(() => $('tmAddBlockBtn')?.focus(), 60);
    }
    updateBuilderStatus(`Project details saved for “${title}”.`);
  }

  function renderBlockAttachmentPreview() {
    const preview = $('tmBlockAttachmentPreview');
    const attachment = state.blockDraftAttachment;
    if (!preview) return;
    if (!attachment?.url) {
      preview.hidden = true;
      preview.innerHTML = '';
      return;
    }
    preview.hidden = false;
    preview.innerHTML = `
      <span class="tm-upload-file__icon"><i data-feather="file-text"></i></span>
      <span class="tm-upload-file__info"><b>${escapeHtml(attachment.name || 'Attachment')}</b><small>${escapeHtml([attachment.type || '', formatBytes(attachment.size)].filter(Boolean).join(' · ') || 'Uploaded file')}</small></span>
      <a class="tm-upload-file__open" href="${escapeHtml(attachment.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open attachment"><i data-feather="external-link"></i></a>
      <button class="tm-upload-file__remove" type="button" data-tm-remove-attachment aria-label="Remove attachment"><i data-feather="trash-2"></i></button>`;
    hydrateIcons(preview);
  }

  async function uploadBlockAttachment(file) {
    const errorEl = $('tmBlockEditorError');
    const input = $('tmBlockAttachmentInput');
    const progress = $('tmBlockAttachmentProgress');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      if (errorEl) errorEl.textContent = 'The attachment must be 10 MB or less.';
      if (input) input.value = '';
      return;
    }
    state.blockUploadPending = true;
    if (errorEl) errorEl.textContent = '';
    if (input) input.disabled = true;
    if (progress) progress.hidden = false;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await api('/api/task-management/upload', {
        method: 'POST',
        body: { dataUrl, filename: file.name, mime: file.type || '', size: file.size },
      });
      state.blockDraftAttachment = result.file || null;
      renderBlockAttachmentPreview();
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message || 'Failed to upload attachment.';
    } finally {
      state.blockUploadPending = false;
      if (input) { input.disabled = false; input.value = ''; }
      if (progress) progress.hidden = true;
    }
  }

  function openBlockEditor(nodeId) {
    const node = findBuilderNode(nodeId);
    if (!node) return;
    state.editingBlockId = node.id;
    state.blockDraftAttachment = node.attachment ? { ...node.attachment } : null;
    state.blockUploadPending = false;
    $('tmBlockEditorKicker').textContent = `Workflow block ${workflowNumbering(state.builder.nodes, state.builder.edges).get(String(node.id)) || '—'}`;
    const select = $('tmBlockDepartmentInput');
    select.innerHTML = `<option value="">Select department</option>${state.departments.map((department) => `<option value="${escapeHtml(department)}" ${department === node.department ? 'selected' : ''}>${escapeHtml(department)}</option>`).join('')}`;
    refreshModernSelect(select);
    $('tmBlockDeliveryDateInput').value = node.deliveryDate || '';
    $('tmBlockRequestInput').value = node.request || '';
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
    const department = $('tmBlockDepartmentInput').value.trim();
    const request = $('tmBlockRequestInput').value.trim();
    const deliveryDate = $('tmBlockDeliveryDateInput').value || '';
    if (!department || !request || !deliveryDate) { $('tmBlockEditorError').textContent = 'Responsible department, requested action, and delivery date are required.'; return; }
    node.department = department;
    node.request = request;
    node.details = $('tmBlockDetailsInput').value.trim();
    node.deliveryDate = deliveryDate;
    node.attachment = state.blockDraftAttachment ? { ...state.blockDraftAttachment } : null;
    $('tmBlockEditorError').textContent = '';
    setOverlay(blockOverlay, false);
    renderBuilder();
    updateBuilderStatus('Block details saved.');
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
    if (state.view !== 'delegated' && state.builder.mode !== 'edit') return;
    if (!state.builder.nodes.length) { showToast('info', 'Add a block', 'Create at least one workflow block before saving the project.'); return; }
    if (!state.builder.meta.title.trim() || !state.builder.meta.priority || !state.builder.meta.dueDate) {
      openTicketMeta();
      $('tmMetaError').textContent = 'Project title, priority, and target date are required.';
      return;
    }
    const invalid = state.builder.nodes.find((node) => !String(node.department || '').trim() || !String(node.request || '').trim() || !String(node.deliveryDate || '').trim());
    if (invalid) { openBlockEditor(invalid.id); $('tmBlockEditorError').textContent = 'Responsible department, requested action, and delivery date are required for every block.'; return; }
    if (workflowHasCycle(state.builder.nodes, state.builder.edges)) { showToast('error', 'Circular workflow not allowed', 'Remove a circular arrow before saving the project.'); return; }

    const editing = state.builder.mode === 'edit' && !!state.builder.ticketId;
    const button = $('tmSaveWorkflowBtn');
    if (button) { button.disabled = true; button.classList.add('is-loading'); }
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
        attachment: node.attachment || null,
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

  function renderWorkflowCard(ticket, section, nodeIndex) {
    const allowed = sectionActionAllowed(ticket, section);
    const unlocked = isSectionUnlocked(ticket, section);
    const canStart = unlocked && section.status === 'not_started';
    const canComplete = unlocked && (section.status === 'in_progress' || section.status === 'not_started');
    const canManage = state.view === 'my' && allowed && unlocked;
    const footerText = !unlocked
      ? 'Waiting for connected prerequisite blocks'
      : (section.completedAt ? `Completed ${formatDateTime(section.completedAt)}` : (section.startedAt ? `Started ${formatDateTime(section.startedAt)}` : 'Waiting to start'));
    const number = section.workflowNumber || String(nodeIndex + 1);
    return `
      <article class="tm-workflow-card tm-builder-block tm-builder-block--viewer tm-workflow-card--interactive ${statusClass(section.status)}" data-section-id="${escapeHtml(section.id)}" data-tm-open-section="${escapeHtml(section.id)}" role="button" tabindex="0" aria-label="Open task details for ${escapeHtml(section.department || 'department')}" style="left:${Math.round(section.x)}px;top:${Math.round(section.y)}px;">
        <div class="tm-builder-block__head tm-workflow-card__top">
          <div class="tm-builder-block__number">${escapeHtml(number)}</div>
          <div class="tm-builder-block__title"><b>${escapeHtml(section.department || 'Department')}</b><small>Workflow block ${escapeHtml(number)}</small></div>
          ${statusPill(section.status)}
        </div>
        <div class="tm-builder-block__body tm-workflow-card__body">
          <span class="tm-builder-block__label">Requested action</span>
          <strong>${escapeHtml(section.request || '—')}</strong>
          ${(section.deliveryDate || section.attachment?.url) ? `<div class="tm-builder-block__meta">${section.deliveryDate ? `<span class="tm-builder-block__delivery"><i data-feather="calendar"></i>${escapeHtml(formatDate(section.deliveryDate))}</span>` : ''}${section.attachment?.url ? `<a class="tm-builder-block__attachment tm-workflow-card__attachment" href="${escapeHtml(section.attachment.url)}" target="_blank" rel="noopener noreferrer"><i data-feather="paperclip"></i><span>${escapeHtml(section.attachment.name || 'Open attachment')}</span><i data-feather="external-link"></i></a>` : ''}</div>` : ''}
          ${section.details ? `<div class="tm-workflow-card__details"><span>Implementation details</span><p>${escapeHtml(section.details)}</p></div>` : ''}
          ${section.completionNote ? `<div class="tm-workflow-card__note"><i data-feather="message-square"></i><div><span>Execution note${section.completedByName ? ` · ${escapeHtml(section.completedByName)}` : ''}</span><p>${escapeHtml(section.completionNote)}</p></div></div>` : ''}
        </div>
        <div class="tm-workflow-card__footer"><span>${escapeHtml(footerText)}</span>${canManage ? `<div class="tm-workflow-card__actions">${canStart ? `<button type="button" class="tm-action-link" data-tm-section-status="in_progress" data-section-id="${escapeHtml(section.id)}"><i data-feather="play"></i>Start</button>` : ''}${canComplete ? `<button type="button" class="tm-action-link tm-action-link--complete" data-tm-section-status="completed" data-section-id="${escapeHtml(section.id)}"><i data-feather="check"></i>Complete</button>` : ''}<button type="button" class="tm-action-link" data-tm-edit-section="${escapeHtml(section.id)}"><i data-feather="edit-3"></i>Update</button></div>` : ''}</div>
      </article>`;
  }

  function openReadonlySectionDetails(sectionId) {
    const ticket = state.selectedTicket;
    const section = (ticket?.sections || []).find((item) => String(item.id) === String(sectionId));
    if (!ticket || !section || !sectionDetailsOverlay) return;
    state.readonlySection = section;

    const layoutSection = graphLayout(ticket).nodes.find((item) => String(item.id) === String(section.id));
    const number = layoutSection?.workflowNumber || '—';
    const department = section.department || 'Department';
    const attachment = section.attachment?.url
      ? `<a class="tm-section-details__file" href="${escapeHtml(section.attachment.url)}" target="_blank" rel="noopener noreferrer"><span class="tm-section-details__file-icon"><i data-feather="paperclip"></i></span><span><b>${escapeHtml(section.attachment.name || 'Open attachment')}</b><small>${escapeHtml(formatBytes(section.attachment.size || section.attachment.sizeBytes || 0) || 'Attached file')}</small></span><i data-feather="external-link"></i></a>`
      : '<div class="tm-section-details__empty"><i data-feather="paperclip"></i><span>No files attached to this task.</span></div>';

    const kicker = $('tmSectionDetailsKicker');
    const title = $('tmSectionDetailsTitle');
    const status = $('tmSectionDetailsStatus');
    const body = $('tmSectionDetailsBody');
    if (kicker) kicker.textContent = `Workflow block ${number}`;
    if (title) title.textContent = department;
    if (status) {
      status.className = `tm-status-pill ${statusClass(section.status)}`;
      status.innerHTML = `<i data-feather="${statusIcon(section.status)}"></i>${escapeHtml(statusLabel(section.status))}`;
    }
    if (body) {
      body.innerHTML = `
        <div class="tm-section-details__grid">
          <div class="tm-section-details__item"><span>Project</span><b>${escapeHtml(ticket.title || '—')}</b></div>
          <div class="tm-section-details__item"><span>Delivery date</span><b>${escapeHtml(formatDate(section.deliveryDate))}</b></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Requested action</span><p>${escapeHtml(section.request || 'No requested action provided.')}</p></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Implementation details</span><p>${escapeHtml(section.details || 'No implementation details provided.')}</p></div>
          <div class="tm-section-details__item tm-section-details__item--wide"><span>Files</span>${attachment}</div>
          ${section.completionNote ? `<div class="tm-section-details__item tm-section-details__item--wide"><span>Execution note${section.completedByName ? ` · ${escapeHtml(section.completedByName)}` : ''}</span><p>${escapeHtml(section.completionNote)}</p></div>` : ''}
        </div>`;
    }
    hydrateIcons(sectionDetailsOverlay);
    setOverlay(sectionDetailsOverlay, true);
  }

  function renderWorkflow(ticket) {
    if (!ticket) return;
    $('tmWorkflowCode').textContent = ticket.ticketCode || 'TKT';
    $('tmWorkflowTitle').textContent = ticket.title || 'Project workflow';
    $('tmWorkflowSub').textContent = `${ticket.createdByName || '—'} · Created ${formatDate(ticket.createdAt)}`;
    const statusEl = $('tmWorkflowStatus');
    statusEl.className = `tm-status-pill ${statusClass(ticket.status)}`;
    statusEl.innerHTML = `<i data-feather="${statusIcon(ticket.status)}"></i>${escapeHtml(statusLabel(ticket.status))}`;
    $('tmWorkflowSummary').innerHTML = `<div><span>Objective</span><p>${escapeHtml(ticket.description || 'No additional context provided.')}</p></div><div><span>Priority</span><b class="tm-priority tm-priority--${escapeHtml(norm(ticket.priority || 'normal'))}">${escapeHtml(ticket.priority || 'Normal')}</b></div><div><span>Target date</span><b>${escapeHtml(formatDate(ticket.dueDate))}</b></div><div><span>Progress</span><b>${ticket.completedCount || 0}/${ticket.sectionsCount || 0} complete</b></div>`;

    const flow = $('tmWorkflowFlow');
    const { nodes, edges } = graphLayout(ticket);
    flow.innerHTML = `<svg class="tm-connection-layer tm-workflow-arrows" id="tmWorkflowArrows" aria-hidden="true"></svg>${nodes.map((section, index) => renderWorkflowCard(ticket, section, index)).join('') || '<div class="tm-empty-state"><h2>No workflow sections</h2><p>This task has no configured department sections.</p></div>'}`;
    nodes.forEach((node) => {
      const card = flow.querySelector(`[data-section-id="${CSS.escape(String(node.id))}"]`);
      if (!card) return;
      node._visualWidth = Math.max(1, card.offsetWidth || 300);
      node._visualHeight = Math.max(1, card.offsetHeight || 172);
    });
    const dimensions = getBoardDimensions(nodes);
    flow.style.width = `${dimensions.width}px`;
    flow.style.height = `${dimensions.height}px`;
    renderArrowLayer($('tmWorkflowArrows'), edges, (id) => nodes.find((node) => String(node.id) === String(id)), dimensions, 'tm-workflow-arrow', { markerId: 'tmWorkflowArrowHead' });
    hydrateIcons(workflowOverlay);
  }

  function openWorkflow(ticket) {
    state.selectedTicket = ticket;
    renderWorkflow(ticket);
    setOverlay(workflowOverlay, true);
    window.requestAnimationFrame(() => renderWorkflow(ticket));
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
        attachment: section.attachment ? { ...section.attachment } : null,
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
        if (builderCanvasWrap) {
          builderCanvasWrap.scrollLeft = 0;
          builderCanvasWrap.scrollTop = 0;
        }
      });
    });
  }

  function requestProjectEdit() {
    const ticket = state.selectedTicket;
    if (!ticket) return;
    if (window.__tmIsPageAdmin) {
      openEditBuilder(ticket, '');
      return;
    }
    state.pendingEditTicket = ticket;
    const input = $('tmAdminPasswordInput');
    const error = $('tmAdminVerifyError');
    if (input) input.value = '';
    if (error) error.textContent = '';
    setOverlay(adminOverlay, true);
  }

  async function verifyProjectEditAccess(event) {
    event.preventDefault();
    const ticket = state.pendingEditTicket || state.selectedTicket;
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
      state.pendingEditTicket = null;
      openEditBuilder(ticket, password);
    } catch (err) {
      if (error) error.textContent = err.message || 'Invalid admin password.';
    } finally {
      if (submit) submit.disabled = false;
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
      window.__tmCurrentUser = state.currentUser;
      window.__tmIsPageAdmin = !!meta.isPageAdmin;
    } catch {
      state.departments = [];
      state.currentUser = {};
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
    $('tmAddBlockBtn')?.addEventListener('click', addBuilderNode);
    $('tmZoomOutBtn')?.addEventListener('click', () => setBuilderZoom(builderZoom() - 0.1));
    $('tmZoomResetBtn')?.addEventListener('click', () => setBuilderZoom(1));
    $('tmZoomInBtn')?.addEventListener('click', () => setBuilderZoom(builderZoom() + 0.1));
    $('tmTaskDetailsBtn')?.addEventListener('click', openTicketMeta);
    $('tmSaveWorkflowBtn')?.addEventListener('click', saveWorkflowBuilder);
    $('tmEditProjectBtn')?.addEventListener('click', requestProjectEdit);
    $('tmBlockAttachmentInput')?.addEventListener('change', (event) => uploadBlockAttachment(event.target.files?.[0]));
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
    document.addEventListener('pointermove', (event) => {
      if (moveBlockDrag(event)) return;
      moveCanvasPan(event);
    });
    document.addEventListener('pointerup', (event) => {
      if (endBlockDrag(event)) return;
      endCanvasPan(event);
    });
    document.addEventListener('pointercancel', (event) => {
      if (endBlockDrag(event)) return;
      endCanvasPan(event);
    });

    document.addEventListener('click', (event) => {
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
          clearPendingBlockPress();
          endBlockDrag();
          endCanvasPan();
          setOverlay(builderOverlay, false);
        }
        if (which === 'meta') {
          setOverlay(metaOverlay, false);
          if (state.startingProject) { state.startingProject = false; resetBuilder(); }
        }
        if (which === 'block') {
          state.blockDraftAttachment = null;
          state.blockUploadPending = false;
          setOverlay(blockOverlay, false);
        }
        if (which === 'workflow') setOverlay(workflowOverlay, false);
        if (which === 'section-details') { state.readonlySection = null; setOverlay(sectionDetailsOverlay, false); }
        if (which === 'admin') { state.pendingEditTicket = null; setOverlay(adminOverlay, false); }
        if (which === 'update') setOverlay(updateOverlay, false);
        return;
      }
      if (event.target.closest('[data-tm-new-ticket]')) { openCreateBuilder(); return; }
      if (event.target.closest('[data-tm-retry]')) { loadTickets({ preserve: false }); return; }

      const removeAttachment = event.target.closest('[data-tm-remove-attachment]');
      if (removeAttachment) {
        state.blockDraftAttachment = null;
        renderBlockAttachmentPreview();
        return;
      }

      const editBlock = event.target.closest('[data-tm-edit-block]');
      if (editBlock) { openBlockEditor(editBlock.dataset.tmEditBlock); return; }
      const deleteBlock = event.target.closest('[data-tm-delete-block]');
      if (deleteBlock) { deleteBuilderNode(deleteBlock.dataset.tmDeleteBlock); return; }
      const socket = event.target.closest('[data-tm-socket]');
      if (socket) {
        event.preventDefault();
        selectBuilderSocket(socket.dataset.tmSocket, socket.dataset.tmSocketNode);
        return;
      }
      const deleteEdge = event.target.closest('[data-builder-edge-delete]');
      if (deleteEdge) { deleteBuilderEdge(deleteEdge.dataset.builderEdgeDelete); return; }

      const statusAction = event.target.closest('[data-tm-section-status]');
      if (statusAction) { openSectionUpdate(statusAction.dataset.sectionId, statusAction.dataset.tmSectionStatus); return; }
      const editAction = event.target.closest('[data-tm-edit-section]');
      if (editAction) { openSectionUpdate(editAction.dataset.tmEditSection); return; }

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
        if (isOverlayOpen(sectionDetailsOverlay)) { state.readonlySection = null; setOverlay(sectionDetailsOverlay, false); }
        else if (isOverlayOpen(updateOverlay)) setOverlay(updateOverlay, false);
        else if (isOverlayOpen(adminOverlay)) { state.pendingEditTicket = null; setOverlay(adminOverlay, false); }
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
        else if (isOverlayOpen(builderOverlay)) setOverlay(builderOverlay, false);
      }
      if (event.key === 'Enter' || event.key === ' ') {
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

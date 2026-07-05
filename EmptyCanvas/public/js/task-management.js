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
      emptyTitle: 'No delegated tasks found', emptyText: 'Create a task to start a workflow between departments.', toolbarNoun: 'delegated task',
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
    editingBlockId: null,
    drag: null,
    builder: {
      nodes: [],
      edges: [],
      connecting: false,
      connectFrom: null,
      meta: { title: '', priority: 'Normal', dueDate: '', description: '' },
    },
  };

  const grid = $('tmTicketGrid');
  const searchInput = $('tmSearch');
  const tabs = $('tmTabs');
  const toolbarNote = $('tmToolbarNote');
  const builderOverlay = $('tmBuilderOverlay');
  const metaOverlay = $('tmTicketMetaOverlay');
  const blockOverlay = $('tmBlockEditorOverlay');
  const workflowOverlay = $('tmWorkflowOverlay');
  const updateOverlay = $('tmUpdateSectionOverlay');
  const metaForm = $('tmTicketMetaForm');
  const blockForm = $('tmBlockEditorForm');
  const updateForm = $('tmUpdateSectionForm');
  const updateError = $('tmUpdateSectionError');
  const builderBoard = $('tmBuilderBoard');
  const builderArrows = $('tmBuilderArrows');

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
    const modalOpen = [builderOverlay, metaOverlay, blockOverlay, workflowOverlay, updateOverlay].some(isOverlayOpen);
    document.body.classList.toggle('tm-modal-open', modalOpen);
  }

  function setOverlay(overlay, open) {
    if (!overlay) return;
    overlay.hidden = !open;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    syncModalState();
    if (open) window.setTimeout(() => overlay.querySelector('input, select, textarea, button')?.focus(), 45);
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
      if (state.selectedTicket?.id && isOverlayOpen(workflowOverlay)) {
        const selected = state.tickets.find((ticket) => String(ticket.id) === String(state.selectedTicket.id));
        if (selected) { state.selectedTicket = selected; renderWorkflow(selected); }
      }
    } catch (error) {
      grid.innerHTML = `<div class="tm-empty-state tm-empty-state--error"><div class="tm-empty-state__icon"><i data-feather="alert-circle"></i></div><h2>Could not load tasks</h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button class="tm-btn tm-btn--secondary" type="button" data-tm-retry>Retry</button></div>`;
      hydrateIcons(grid);
    }
  }

  // ---------------------------------------------------------------------------
  // Visual workflow builder
  // ---------------------------------------------------------------------------
  function resetBuilder() {
    state.builder = {
      nodes: [],
      edges: [],
      connecting: false,
      connectFrom: null,
      meta: { title: '', priority: 'Normal', dueDate: '', description: '' },
    };
    state.editingBlockId = null;
    state.drag = null;
  }

  function nextBlockPosition() {
    const count = state.builder.nodes.length;
    const column = count % 4;
    const row = Math.floor(count / 4);
    return { x: 70 + column * 340, y: 90 + row * 255 };
  }

  function addBuilderNode() {
    const position = nextBlockPosition();
    state.builder.nodes.push({ id: newClientId(), department: '', request: '', details: '', x: position.x, y: position.y });
    renderBuilder();
    updateBuilderStatus('New block added. Use Edit to set its department and requested action.');
  }

  function findBuilderNode(id) {
    return state.builder.nodes.find((node) => String(node.id) === String(id)) || null;
  }

  function edgeKey(edge) { return `${String(edge.from)}::${String(edge.to)}`; }

  function renderBuilder() {
    if (!builderBoard) return;
    const empty = $('tmBuilderEmpty');
    if (empty) empty.hidden = state.builder.nodes.length > 0;

    builderBoard.querySelectorAll('[data-builder-block]').forEach((node) => node.remove());
    state.builder.nodes.forEach((node, index) => {
      const block = document.createElement('article');
      const isSource = state.builder.connecting && state.builder.connectFrom === node.id;
      block.className = `tm-builder-block${isSource ? ' is-connect-source' : ''}`;
      block.dataset.builderBlock = node.id;
      block.style.left = `${Math.max(16, safeNumber(node.x, 60))}px`;
      block.style.top = `${Math.max(16, safeNumber(node.y, 80))}px`;
      block.innerHTML = `
        <div class="tm-builder-block__head" data-tm-drag-handle>
          <div class="tm-builder-block__number">${index + 1}</div>
          <div class="tm-builder-block__title"><b>${escapeHtml(node.department || 'Workflow Block')}</b><small>${node.department ? 'Department section' : 'Needs configuration'}</small></div>
          <div class="tm-builder-block__actions">
            <button type="button" class="tm-builder-icon-btn" data-tm-edit-block="${escapeHtml(node.id)}" aria-label="Edit block"><i data-feather="edit-3"></i></button>
            <button type="button" class="tm-builder-icon-btn tm-builder-icon-btn--danger" data-tm-delete-block="${escapeHtml(node.id)}" aria-label="Delete block"><i data-feather="trash-2"></i></button>
          </div>
        </div>
        <button type="button" class="tm-builder-block__body" data-tm-connect-node="${escapeHtml(node.id)}" aria-label="${state.builder.connecting ? 'Select workflow block for arrow' : 'Workflow block'}">
          <span class="tm-builder-block__label">Requested action</span>
          <strong>${escapeHtml(node.request || 'Click Edit to configure this block')}</strong>
          ${node.details ? `<span class="tm-builder-block__details">${escapeHtml(node.details)}</span>` : '<span class="tm-builder-block__details tm-builder-block__details--empty">No implementation details</span>'}
        </button>
        <span class="tm-builder-socket tm-builder-socket--in" aria-hidden="true"></span><span class="tm-builder-socket tm-builder-socket--out" aria-hidden="true"></span>`;
      builderBoard.appendChild(block);
    });
    renderBuilderArrows();
    hydrateIcons(builderBoard);
    updateBuilderToolbar();
  }

  function getBoardDimensions(nodes = []) {
    const maxX = Math.max(980, ...nodes.map((node) => safeNumber(node.x, 0) + 310));
    const maxY = Math.max(650, ...nodes.map((node) => safeNumber(node.y, 0) + 220));
    return { width: Math.ceil(maxX + 80), height: Math.ceil(maxY + 80) };
  }

  function pathBetween(from, to, { blockWidth = 300, blockHeight = 172 } = {}) {
    const sx = safeNumber(from.x) + blockWidth;
    const sy = safeNumber(from.y) + (blockHeight / 2);
    const tx = safeNumber(to.x);
    const ty = safeNumber(to.y) + (blockHeight / 2);
    const horizontalDistance = Math.max(95, Math.abs(tx - sx) * 0.48);
    const direction = tx >= sx ? 1 : -1;
    const c1x = sx + (horizontalDistance * direction);
    const c2x = tx - (horizontalDistance * direction);
    return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
  }

  function renderArrowLayer(svg, edges, getNode, dimensions, className = 'tm-builder-arrow') {
    if (!svg) return;
    svg.setAttribute('width', String(dimensions.width));
    svg.setAttribute('height', String(dimensions.height));
    svg.setAttribute('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
    svg.innerHTML = `<defs><marker id="tmArrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3.7" orient="auto"><path d="M0,0 L0,7.4 L8.8,3.7 z" class="tm-arrow-marker" /></marker></defs>${(edges || []).map((edge) => {
      const from = getNode(edge.from ?? edge.fromSectionId ?? edge.from_section_id);
      const to = getNode(edge.to ?? edge.toSectionId ?? edge.to_section_id);
      if (!from || !to) return '';
      return `<path class="${className}" d="${pathBetween(from, to)}" marker-end="url(#tmArrowHead)"></path>`;
    }).join('')}`;
  }

  function renderBuilderArrows() {
    if (!builderArrows) return;
    const dimensions = getBoardDimensions(state.builder.nodes);
    builderBoard.style.width = `${dimensions.width}px`;
    builderBoard.style.height = `${dimensions.height}px`;
    renderArrowLayer(builderArrows, state.builder.edges, (id) => findBuilderNode(id), dimensions, 'tm-builder-arrow');
  }

  function updateBuilderToolbar() {
    const arrowButton = $('tmAddArrowBtn');
    const undoButton = $('tmUndoArrowBtn');
    if (arrowButton) {
      arrowButton.classList.toggle('is-active', state.builder.connecting);
      arrowButton.setAttribute('aria-pressed', state.builder.connecting ? 'true' : 'false');
    }
    if (undoButton) undoButton.disabled = !state.builder.edges.length;
  }

  function updateBuilderStatus(message = '') {
    const el = $('tmBuilderStatus');
    if (!el) return;
    if (message) { el.textContent = message; return; }
    if (!state.builder.nodes.length) { el.textContent = 'Add a block to begin designing the workflow.'; return; }
    if (state.builder.connecting && state.builder.connectFrom) { el.textContent = 'Now select the destination block to create the arrow.'; return; }
    if (state.builder.connecting) { el.textContent = 'Select the source block for the new arrow.'; return; }
    el.textContent = `${state.builder.nodes.length} block${state.builder.nodes.length === 1 ? '' : 's'} · ${state.builder.edges.length} arrow${state.builder.edges.length === 1 ? '' : 's'}`;
  }

  function openCreateBuilder() {
    if (state.view !== 'delegated') { showToast('info', 'Delegated Tasks only', 'Create new tasks from the Delegated Tasks page.'); return; }
    if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess.showViewOnlyNotice(); return; }
    resetBuilder();
    renderBuilder();
    updateBuilderStatus();
    setOverlay(builderOverlay, true);
  }

  function toggleArrowMode() {
    if (state.builder.nodes.length < 2) { showToast('info', 'Add blocks first', 'Create at least two blocks before adding a workflow arrow.'); return; }
    state.builder.connecting = !state.builder.connecting;
    state.builder.connectFrom = null;
    renderBuilder();
    updateBuilderStatus();
  }

  function selectArrowNode(nodeId) {
    if (!state.builder.connecting) return;
    const target = findBuilderNode(nodeId);
    if (!target) return;
    if (!state.builder.connectFrom) {
      state.builder.connectFrom = target.id;
      renderBuilder();
      updateBuilderStatus();
      return;
    }
    if (String(state.builder.connectFrom) === String(target.id)) {
      showToast('info', 'Choose another block', 'An arrow must connect two different blocks.');
      return;
    }
    const candidate = { from: state.builder.connectFrom, to: target.id };
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
    renderBuilder();
    updateBuilderStatus('Arrow added. It will unlock the target block after the source block is completed.');
  }

  function deleteBuilderNode(nodeId) {
    const node = findBuilderNode(nodeId);
    if (!node) return;
    state.builder.nodes = state.builder.nodes.filter((item) => String(item.id) !== String(nodeId));
    state.builder.edges = state.builder.edges.filter((edge) => String(edge.from) !== String(nodeId) && String(edge.to) !== String(nodeId));
    if (String(state.builder.connectFrom) === String(nodeId)) state.builder.connectFrom = null;
    renderBuilder();
    updateBuilderStatus('Block removed together with any connected arrows.');
  }

  function undoLastArrow() {
    if (!state.builder.edges.length) return;
    state.builder.edges.pop();
    state.builder.connecting = false;
    state.builder.connectFrom = null;
    renderBuilder();
    updateBuilderStatus('Last arrow removed.');
  }

  function openTicketMeta() {
    const meta = state.builder.meta;
    $('tmMetaTitleInput').value = meta.title || '';
    $('tmMetaPriorityInput').value = meta.priority || 'Normal';
    $('tmMetaDueDateInput').value = meta.dueDate || '';
    $('tmMetaDescriptionInput').value = meta.description || '';
    $('tmMetaError').textContent = '';
    setOverlay(metaOverlay, true);
  }

  function saveTicketMeta(event) {
    event.preventDefault();
    const title = $('tmMetaTitleInput').value.trim();
    if (!title) { $('tmMetaError').textContent = 'Enter a task title.'; return; }
    state.builder.meta = {
      title,
      priority: $('tmMetaPriorityInput').value || 'Normal',
      dueDate: $('tmMetaDueDateInput').value || '',
      description: $('tmMetaDescriptionInput').value.trim(),
    };
    $('tmMetaError').textContent = '';
    setOverlay(metaOverlay, false);
    updateBuilderStatus(`Task details saved for “${title}”.`);
  }

  function openBlockEditor(nodeId) {
    const node = findBuilderNode(nodeId);
    if (!node) return;
    state.editingBlockId = node.id;
    $('tmBlockEditorKicker').textContent = `Workflow block ${state.builder.nodes.findIndex((item) => item.id === node.id) + 1}`;
    const select = $('tmBlockDepartmentInput');
    select.innerHTML = `<option value="">Select department</option>${state.departments.map((department) => `<option value="${escapeHtml(department)}" ${department === node.department ? 'selected' : ''}>${escapeHtml(department)}</option>`).join('')}`;
    $('tmBlockRequestInput').value = node.request || '';
    $('tmBlockDetailsInput').value = node.details || '';
    $('tmBlockEditorError').textContent = '';
    setOverlay(blockOverlay, true);
  }

  function saveBlockEditor(event) {
    event.preventDefault();
    const node = findBuilderNode(state.editingBlockId);
    if (!node) return;
    const department = $('tmBlockDepartmentInput').value.trim();
    const request = $('tmBlockRequestInput').value.trim();
    if (!department || !request) { $('tmBlockEditorError').textContent = 'Responsible department and requested action are required.'; return; }
    node.department = department;
    node.request = request;
    node.details = $('tmBlockDetailsInput').value.trim();
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
    if (state.view !== 'delegated') return;
    if (!state.builder.nodes.length) { showToast('info', 'Add a block', 'Create at least one workflow block before saving the task.'); return; }
    if (!state.builder.meta.title.trim()) { openTicketMeta(); $('tmMetaError').textContent = 'Add task details before creating the workflow.'; return; }
    const invalid = state.builder.nodes.find((node) => !String(node.department || '').trim() || !String(node.request || '').trim());
    if (invalid) { openBlockEditor(invalid.id); $('tmBlockEditorError').textContent = 'Configure this block before creating the task.'; return; }
    if (workflowHasCycle(state.builder.nodes, state.builder.edges)) { showToast('error', 'Circular workflow not allowed', 'Remove a circular arrow before saving the task.'); return; }

    const button = $('tmSaveWorkflowBtn');
    if (button) { button.disabled = true; button.classList.add('is-loading'); }
    const payload = {
      title: state.builder.meta.title,
      priority: state.builder.meta.priority || 'Normal',
      dueDate: state.builder.meta.dueDate || '',
      description: state.builder.meta.description || '',
      sections: state.builder.nodes.map((node, index) => ({
        clientId: node.id,
        department: node.department,
        request: node.request,
        details: node.details || '',
        sortOrder: index + 1,
        canvasX: Math.round(safeNumber(node.x, 60)),
        canvasY: Math.round(safeNumber(node.y, 80)),
      })),
      edges: state.builder.edges.map((edge) => ({ from: edge.from, to: edge.to })),
    };

    api('/api/task-management', { method: 'POST', body: payload })
      .then(async (data) => {
        setOverlay(builderOverlay, false);
        state.selectedTicket = data.ticket || null;
        await loadTickets();
        const created = state.tickets.find((ticket) => String(ticket.id) === String(data.ticket?.id)) || data.ticket;
        if (created) openWorkflow(created);
        showToast('success', 'Task created', 'The block workflow is ready and arrows now control the execution sequence.');
      })
      .catch((error) => showToast('error', 'Could not create task', error.message || 'Please try again.'))
      .finally(() => { if (button) { button.disabled = false; button.classList.remove('is-loading'); } });
  }

  function startBlockDrag(event, nodeId) {
    if (event.button !== 0 || state.builder.connecting || event.target.closest('button')) return;
    const node = findBuilderNode(nodeId);
    if (!node) return;
    event.preventDefault();
    state.drag = {
      nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: safeNumber(node.x),
      startY: safeNumber(node.y),
    };
    document.body.classList.add('tm-builder-dragging');
  }

  function moveBlockDrag(event) {
    if (!state.drag) return;
    const node = findBuilderNode(state.drag.nodeId);
    if (!node) return;
    node.x = clamp(state.drag.startX + (event.clientX - state.drag.startClientX), 20, 3600);
    node.y = clamp(state.drag.startY + (event.clientY - state.drag.startClientY), 20, 2600);
    const element = [...(builderBoard?.querySelectorAll('[data-builder-block]') || [])]
      .find((item) => String(item.dataset.builderBlock) === String(node.id));
    if (element) { element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; }
    renderBuilderArrows();
  }

  function endBlockDrag() {
    if (!state.drag) return;
    state.drag = null;
    document.body.classList.remove('tm-builder-dragging');
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

    const nodes = sections.map((section) => {
      const fallback = fallbackPosition.get(String(section.id)) || { x: 64, y: 74 };
      const hasPosition = Number.isFinite(Number(section.canvasX)) && Number.isFinite(Number(section.canvasY)) && Number(section.canvasX) > 0 && Number(section.canvasY) > 0;
      return {
        ...section,
        x: hasPosition ? safeNumber(section.canvasX) : fallback.x,
        y: hasPosition ? safeNumber(section.canvasY) : fallback.y,
        dependencies: incoming.get(String(section.id)) || [],
      };
    });
    return { nodes, edges };
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
    const footerText = !unlocked
      ? 'Waiting for connected prerequisite blocks'
      : (section.completedAt ? `Completed ${formatDateTime(section.completedAt)}` : (section.startedAt ? `Started ${formatDateTime(section.startedAt)}` : 'Waiting to start'));
    return `
      <article class="tm-workflow-card ${statusClass(section.status)}" data-section-id="${escapeHtml(section.id)}" style="left:${Math.round(section.x)}px;top:${Math.round(section.y)}px;">
        <div class="tm-workflow-card__top"><div class="tm-department-mark"><i data-feather="briefcase"></i></div><div class="tm-workflow-card__main"><span class="tm-workflow-card__kicker">Workflow block ${nodeIndex + 1}</span><h3>${escapeHtml(section.department || 'Department')}</h3></div>${statusPill(section.status)}</div>
        <div class="tm-workflow-card__body"><span class="tm-workflow-card__label">Requested action</span><p>${escapeHtml(section.request || '—')}</p>${section.details ? `<div class="tm-workflow-card__details"><span>Details</span><p>${escapeHtml(section.details)}</p></div>` : ''}${section.completionNote ? `<div class="tm-workflow-card__note"><i data-feather="message-square"></i><div><span>Execution note${section.completedByName ? ` · ${escapeHtml(section.completedByName)}` : ''}</span><p>${escapeHtml(section.completionNote)}</p></div></div>` : ''}</div>
        <div class="tm-workflow-card__footer"><span>${escapeHtml(footerText)}</span>${allowed && unlocked ? `<div class="tm-workflow-card__actions">${canStart ? `<button type="button" class="tm-action-link" data-tm-section-status="in_progress" data-section-id="${escapeHtml(section.id)}"><i data-feather="play"></i>Start</button>` : ''}${canComplete ? `<button type="button" class="tm-action-link tm-action-link--complete" data-tm-section-status="completed" data-section-id="${escapeHtml(section.id)}"><i data-feather="check"></i>Complete</button>` : ''}<button type="button" class="tm-action-link" data-tm-edit-section="${escapeHtml(section.id)}"><i data-feather="edit-3"></i>Update</button></div>` : ''}</div>
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
    const { nodes, edges } = graphLayout(ticket);
    const dimensions = getBoardDimensions(nodes);
    flow.style.width = `${dimensions.width}px`;
    flow.style.height = `${dimensions.height}px`;
    flow.innerHTML = `<svg class="tm-connection-layer tm-workflow-arrows" id="tmWorkflowArrows" aria-hidden="true"></svg>${nodes.map((section, index) => renderWorkflowCard(ticket, section, index)).join('') || '<div class="tm-empty-state"><h2>No workflow sections</h2><p>This task has no configured department sections.</p></div>'}`;
    renderArrowLayer($('tmWorkflowArrows'), edges, (id) => nodes.find((node) => String(node.id) === String(id)), dimensions, 'tm-workflow-arrow');
    hydrateIcons(workflowOverlay);
  }

  function openWorkflow(ticket) {
    state.selectedTicket = ticket;
    renderWorkflow(ticket);
    setOverlay(workflowOverlay, true);
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
    metaForm?.addEventListener('submit', saveTicketMeta);
    blockForm?.addEventListener('submit', saveBlockEditor);
    updateForm?.addEventListener('submit', submitSectionUpdate);
    $('tmAddBlockBtn')?.addEventListener('click', addBuilderNode);
    $('tmAddArrowBtn')?.addEventListener('click', toggleArrowMode);
    $('tmUndoArrowBtn')?.addEventListener('click', undoLastArrow);
    $('tmTaskDetailsBtn')?.addEventListener('click', openTicketMeta);
    $('tmSaveWorkflowBtn')?.addEventListener('click', saveWorkflowBuilder);
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

    builderBoard?.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('[data-tm-drag-handle]');
      if (!handle) return;
      const block = handle.closest('[data-builder-block]');
      if (block) startBlockDrag(event, block.dataset.builderBlock);
    });
    document.addEventListener('pointermove', moveBlockDrag);
    document.addEventListener('pointerup', endBlockDrag);
    document.addEventListener('pointercancel', endBlockDrag);

    document.addEventListener('click', (event) => {
      const close = event.target.closest('[data-tm-close]');
      if (close) {
        const which = close.dataset.tmClose;
        if (which === 'builder') setOverlay(builderOverlay, false);
        if (which === 'meta') setOverlay(metaOverlay, false);
        if (which === 'block') setOverlay(blockOverlay, false);
        if (which === 'workflow') setOverlay(workflowOverlay, false);
        if (which === 'update') setOverlay(updateOverlay, false);
        return;
      }
      if (event.target.closest('[data-tm-new-ticket]')) { openCreateBuilder(); return; }
      if (event.target.closest('[data-tm-retry]')) { loadTickets({ preserve: false }); return; }

      const editBlock = event.target.closest('[data-tm-edit-block]');
      if (editBlock) { openBlockEditor(editBlock.dataset.tmEditBlock); return; }
      const deleteBlock = event.target.closest('[data-tm-delete-block]');
      if (deleteBlock) { deleteBuilderNode(deleteBlock.dataset.tmDeleteBlock); return; }
      const connectNode = event.target.closest('[data-tm-connect-node]');
      if (connectNode) { selectArrowNode(connectNode.dataset.tmConnectNode); return; }

      const statusAction = event.target.closest('[data-tm-section-status]');
      if (statusAction) { openSectionUpdate(statusAction.dataset.sectionId, statusAction.dataset.tmSectionStatus); return; }
      const editAction = event.target.closest('[data-tm-edit-section]');
      if (editAction) { openSectionUpdate(editAction.dataset.tmEditSection); return; }

      const ticketCard = event.target.closest('[data-ticket-id]');
      if (ticketCard) {
        const ticket = state.tickets.find((item) => String(item.id) === String(ticketCard.dataset.ticketId));
        if (ticket) openWorkflow(ticket);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (isOverlayOpen(updateOverlay)) setOverlay(updateOverlay, false);
        else if (isOverlayOpen(blockOverlay)) setOverlay(blockOverlay, false);
        else if (isOverlayOpen(metaOverlay)) setOverlay(metaOverlay, false);
        else if (isOverlayOpen(workflowOverlay)) setOverlay(workflowOverlay, false);
        else if (isOverlayOpen(builderOverlay)) setOverlay(builderOverlay, false);
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const card = document.activeElement?.closest?.('[data-ticket-id]');
        if (card) { event.preventDefault(); card.click(); }
      }
    });
    init();
  });
})();

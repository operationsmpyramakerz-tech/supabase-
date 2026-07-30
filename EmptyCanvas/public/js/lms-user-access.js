(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const uid = () => `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const LABELS = {
    supervisor: 'Supervisor',
    team_leader: 'Team Leader',
    instructor: 'Instructor',
    co_instructor: 'Co-Instructor',
    school_coordinator: 'School Coordinator',
    students: 'Students',
    parents: 'Parents',
  };

  const state = {
    nodes: [],
    edges: [],
    connectingFrom: '',
    drag: null,
    pan: null,
    pinch: null,
    zoom: 1,
    canvas: { width: 5000, height: 3600 },
    selectedSchool: null,
    schools: [],
  };

  const overlay = $('lmsBuilderOverlay');
  const pickerOverlay = $('lmsSchoolPickerOverlay');
  const board = $('lmsBuilderBoard');
  const arrows = $('lmsBuilderArrows');
  const wrap = $('lmsBuilderCanvasWrap');
  const menu = $('lmsAddBlockMenu');
  const status = $('lmsBuilderStatus');
  const schoolSelect = $('lmsSchoolSelect');
  const pickerError = $('lmsSchoolPickerError');

  function iconify(root = document) {
    if (window.feather) window.feather.replace({ root });
  }

  function label(kind) {
    return LABELS[kind] || 'Block';
  }

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function setModalOpen(open) {
    document.body.classList.toggle('tm-modal-open', !!open);
  }

  function openPicker() {
    pickerOverlay.hidden = false;
    pickerOverlay.setAttribute('aria-hidden', 'false');
    setModalOpen(true);
    if (pickerError) pickerError.textContent = '';
    loadSchools();
  }

  function closePicker() {
    pickerOverlay.hidden = true;
    pickerOverlay.setAttribute('aria-hidden', 'true');
    if (overlay.hidden) setModalOpen(false);
  }

  function openBuilder() {
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    setModalOpen(true);
    menu.hidden = true;
    applyCanvasDimensions();
    window.requestAnimationFrame(() => {
      centerCanvas();
      wrap?.focus();
    });
  }

  function closeBuilder() {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    menu.hidden = true;
    setModalOpen(false);
  }

  async function loadSchools() {
    if (!schoolSelect) return;
    schoolSelect.disabled = true;
    schoolSelect.innerHTML = '<option value="">Loading schools...</option>';
    try {
      const response = await fetch('/api/lms/structures/schools', { credentials: 'include', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load schools.');
      state.schools = Array.isArray(data.schools) ? data.schools : [];
      schoolSelect.innerHTML = '<option value="">Select a school...</option>' + state.schools
        .map((school) => `<option value="${esc(school.id)}">${esc(school.name)}</option>`)
        .join('');
      if (!state.schools.length && pickerError) pickerError.textContent = 'No schools are available. Add a school from the Schools page first.';
    } catch (error) {
      state.schools = [];
      schoolSelect.innerHTML = '<option value="">Schools could not be loaded</option>';
      if (pickerError) pickerError.textContent = error.message || 'Unable to load schools.';
    } finally {
      schoolSelect.disabled = false;
      iconify(pickerOverlay);
    }
  }

  function continueToBuilder() {
    const schoolId = String(schoolSelect?.value || '').trim();
    const school = state.schools.find((item) => String(item.id) === schoolId);
    if (!school) {
      if (pickerError) pickerError.textContent = 'Choose a school to continue.';
      schoolSelect?.focus();
      return;
    }
    state.selectedSchool = school;
    state.nodes = [];
    state.edges = [];
    state.connectingFrom = '';
    state.zoom = 1;
    state.canvas = { width: 5000, height: 3600 };
    const nameInput = $('lmsStructureName');
    if (nameInput) nameInput.value = `${school.name} Structure`;
    const title = $('lmsBuilderTitle');
    if (title) title.textContent = `${school.name} Structure`;
    setStatus(`Building the learning structure for ${school.name}.`);
    closePicker();
    render();
    updateZoomUi();
    openBuilder();
  }

  function applyCanvasDimensions() {
    if (!board) return;
    board.style.width = `${state.canvas.width}px`;
    board.style.height = `${state.canvas.height}px`;
    board.style.minWidth = `${state.canvas.width}px`;
    board.style.minHeight = `${state.canvas.height}px`;
    board.style.zoom = String(state.zoom);
  }

  function centerCanvas() {
    if (!wrap) return;
    const targetX = (state.canvas.width * state.zoom - wrap.clientWidth) / 2;
    const targetY = (state.canvas.height * state.zoom - wrap.clientHeight) / 2;
    wrap.scrollLeft = Math.max(0, targetX);
    wrap.scrollTop = Math.max(0, targetY);
  }

  function visibleWorldCenter() {
    return {
      x: (safeNumber(wrap?.scrollLeft) + Math.max(1, safeNumber(wrap?.clientWidth, 900)) / 2) / state.zoom,
      y: (safeNumber(wrap?.scrollTop) + Math.max(1, safeNumber(wrap?.clientHeight, 560)) / 2) / state.zoom,
    };
  }

  function nextPosition() {
    const center = visibleWorldCenter();
    const index = state.nodes.length;
    return {
      x: Math.max(80, Math.round(center.x - 150 + ((index % 3) - 1) * 340)),
      y: Math.max(80, Math.round(center.y - 80 + Math.floor(index / 3) * 210)),
    };
  }

  function addNode(kind) {
    if (!Object.prototype.hasOwnProperty.call(LABELS, kind)) return;
    const position = nextPosition();
    state.nodes.push({ id: uid(), kind, x: position.x, y: position.y });
    menu.hidden = true;
    ensureCanvasForPoint(position.x + 380, position.y + 220);
    render();
    setStatus(`${label(kind)} block added. Use Edit to configure it.`);
  }

  function edgeKey(from, to) {
    return `${from}::${to}`;
  }

  function toggleConnection(id, side) {
    if (side === 'out') {
      state.connectingFrom = state.connectingFrom === id ? '' : id;
      render();
      setStatus(state.connectingFrom ? 'Select the input point on another block.' : 'Connection cancelled.');
      return;
    }
    if (!state.connectingFrom || state.connectingFrom === id) return;
    if (!state.edges.some((edge) => edgeKey(edge.from, edge.to) === edgeKey(state.connectingFrom, id))) {
      state.edges.push({ from: state.connectingFrom, to: id });
    }
    state.connectingFrom = '';
    render();
    setStatus('Blocks connected.');
  }

  function render() {
    if (!board) return;
    applyCanvasDimensions();
    board.classList.toggle('is-awaiting-target', !!state.connectingFrom);
    board.querySelectorAll('[data-lms-node]').forEach((element) => element.remove());
    const empty = $('lmsBuilderEmpty');
    if (empty) empty.hidden = state.nodes.length > 0;

    state.nodes.forEach((node, index) => {
      const element = document.createElement('article');
      element.className = `tm-builder-block lms-builder-block${state.connectingFrom === node.id ? ' is-connect-source' : ''}`;
      element.dataset.lmsNode = node.id;
      element.dataset.kind = node.kind;
      element.style.left = `${node.x}px`;
      element.style.top = `${node.y}px`;
      element.innerHTML = `
        <div class="tm-builder-block__head" data-drag-handle>
          <div class="tm-builder-block__number">${index + 1}</div>
          <div class="tm-builder-block__title"><b>${esc(label(node.kind))}</b><small>Needs configuration</small></div>
          <div class="tm-builder-block__actions">
            <button type="button" class="tm-builder-icon-btn" data-edit-node="${esc(node.id)}" aria-label="Edit block"><i data-feather="edit-3"></i></button>
            <button type="button" class="tm-builder-icon-btn tm-builder-icon-btn--danger" data-delete-node="${esc(node.id)}" aria-label="Delete block"><i data-feather="trash-2"></i></button>
          </div>
        </div>
        <div class="tm-builder-block__body">
          <span class="lms-builder-block__type">${esc(label(node.kind))}</span>
          <strong>Click Edit to configure this block</strong>
          <span class="lms-builder-block__hint">Details will be added in the next development step.</span>
        </div>
        <button type="button" class="tm-builder-socket tm-builder-socket--in" data-socket="in" data-node="${esc(node.id)}" aria-label="Incoming connection"></button>
        <button type="button" class="tm-builder-socket tm-builder-socket--out" data-socket="out" data-node="${esc(node.id)}" aria-label="Outgoing connection"></button>`;
      board.appendChild(element);
    });
    drawEdges();
    iconify(board);
  }

  function socketCenter(element, side) {
    const boardRect = board.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      x: ((side === 'out' ? rect.right : rect.left) - boardRect.left) / state.zoom,
      y: (rect.top - boardRect.top + rect.height / 2) / state.zoom,
    };
  }

  function drawEdges() {
    if (!arrows) return;
    arrows.setAttribute('width', String(state.canvas.width));
    arrows.setAttribute('height', String(state.canvas.height));
    arrows.setAttribute('viewBox', `0 0 ${state.canvas.width} ${state.canvas.height}`);
    arrows.innerHTML = '<defs><marker id="lmsArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#d06a2b"/></marker></defs>';
    state.edges.forEach((edge) => {
      const from = board.querySelector(`[data-lms-node="${CSS.escape(edge.from)}"]`);
      const to = board.querySelector(`[data-lms-node="${CSS.escape(edge.to)}"]`);
      if (!from || !to) return;
      const p1 = socketCenter(from, 'out');
      const p2 = socketCenter(to, 'in');
      const dx = Math.max(70, Math.abs(p2.x - p1.x) * 0.5);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`);
      path.setAttribute('class', 'tm-builder-arrow');
      path.setAttribute('marker-end', 'url(#lmsArrow)');
      arrows.appendChild(path);
    });
  }

  function ensureCanvasForPoint(x, y) {
    let changed = false;
    if (x > state.canvas.width - 500) { state.canvas.width += 2200; changed = true; }
    if (y > state.canvas.height - 500) { state.canvas.height += 1600; changed = true; }
    if (changed) applyCanvasDimensions();
  }

  function shiftOriginIfNeeded(node) {
    const margin = 300;
    let shiftX = node.x < margin ? 1800 : 0;
    let shiftY = node.y < margin ? 1300 : 0;
    if (!shiftX && !shiftY) return;
    state.nodes.forEach((item) => { item.x += shiftX; item.y += shiftY; });
    state.canvas.width += shiftX;
    state.canvas.height += shiftY;
    if (wrap) {
      wrap.scrollLeft += shiftX * state.zoom;
      wrap.scrollTop += shiftY * state.zoom;
    }
    node.x += 0;
    node.y += 0;
    applyCanvasDimensions();
  }

  function updateZoomUi() {
    const labelElement = $('lmsZoomLabel');
    if (labelElement) labelElement.textContent = `${Math.round(state.zoom * 100)}%`;
    const out = $('lmsZoomOutBtn');
    const inside = $('lmsZoomInBtn');
    if (out) out.disabled = state.zoom <= 0.35;
    if (inside) inside.disabled = state.zoom >= 2;
  }

  function setZoom(value, clientX, clientY) {
    if (!wrap) return;
    const oldZoom = state.zoom;
    const nextZoom = clamp(safeNumber(value, oldZoom), 0.35, 2);
    if (Math.abs(nextZoom - oldZoom) < 0.001) return;
    const rect = wrap.getBoundingClientRect();
    const localX = clamp(safeNumber(clientX, rect.left + rect.width / 2) - rect.left, 0, rect.width);
    const localY = clamp(safeNumber(clientY, rect.top + rect.height / 2) - rect.top, 0, rect.height);
    const worldX = (wrap.scrollLeft + localX) / oldZoom;
    const worldY = (wrap.scrollTop + localY) / oldZoom;
    state.zoom = nextZoom;
    applyCanvasDimensions();
    window.requestAnimationFrame(() => {
      wrap.scrollLeft = Math.max(0, worldX * nextZoom - localX);
      wrap.scrollTop = Math.max(0, worldY * nextZoom - localY);
      drawEdges();
    });
    updateZoomUi();
  }

  function startPan(event) {
    if (event.button !== 0 || state.drag || state.pinch || event.target.closest('[data-lms-node],button,input,select')) return;
    event.preventDefault();
    state.pan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: wrap.scrollLeft,
      top: wrap.scrollTop,
    };
    wrap.classList.add('is-panning');
    wrap.setPointerCapture?.(event.pointerId);
  }

  function movePan(event) {
    if (!state.pan || event.pointerId !== state.pan.pointerId) return;
    event.preventDefault();
    wrap.scrollLeft = Math.max(0, state.pan.left - (event.clientX - state.pan.startX));
    wrap.scrollTop = Math.max(0, state.pan.top - (event.clientY - state.pan.startY));
  }

  function endPan(event) {
    if (!state.pan || (event && event.pointerId !== state.pan.pointerId)) return;
    wrap.releasePointerCapture?.(state.pan.pointerId);
    wrap.classList.remove('is-panning');
    state.pan = null;
  }

  function touchDistance(touches) {
    return Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
  }

  function touchMidpoint(touches) {
    return { clientX: (touches[0].clientX + touches[1].clientX) / 2, clientY: (touches[0].clientY + touches[1].clientY) / 2 };
  }

  async function saveStructure() {
    const name = $('lmsStructureName').value.trim() || `${state.selectedSchool?.name || 'Untitled'} Structure`;
    if (!state.selectedSchool?.id) { setStatus('Choose a school before saving.'); return; }
    if (!state.nodes.length) { setStatus('Add at least one block before saving.'); return; }
    const button = $('lmsSaveStructureBtn');
    button.disabled = true;
    try {
      const response = await fetch('/api/lms/structures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          schoolId: state.selectedSchool.id,
          schoolName: state.selectedSchool.name,
          nodes: state.nodes.map(({ id, kind, x, y }) => ({ clientId: id, kind, x, y })),
          edges: state.edges,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to save structure.');
      setStatus('Structure saved successfully.');
    } catch (error) {
      setStatus(error.message || 'Unable to save structure.');
    } finally {
      button.disabled = false;
    }
  }

  $('lmsAddStructureBtn')?.addEventListener('click', openPicker);
  $('lmsContinueToBuilderBtn')?.addEventListener('click', continueToBuilder);
  document.querySelectorAll('[data-lms-close="school-picker"]').forEach((button) => button.addEventListener('click', closePicker));
  document.querySelectorAll('[data-lms-close="builder"]').forEach((button) => button.addEventListener('click', closeBuilder));
  $('lmsAddBlockBtn')?.addEventListener('click', (event) => { event.stopPropagation(); menu.hidden = !menu.hidden; });
  menu?.addEventListener('click', (event) => { const button = event.target.closest('[data-add-kind]'); if (button) addNode(button.dataset.addKind); });
  document.addEventListener('click', (event) => { if (!event.target.closest('#lmsAddBlockWrap')) menu.hidden = true; });
  $('lmsSaveStructureBtn')?.addEventListener('click', saveStructure);

  board?.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-delete-node]');
    if (remove) {
      const id = remove.dataset.deleteNode;
      state.nodes = state.nodes.filter((node) => node.id !== id);
      state.edges = state.edges.filter((edge) => edge.from !== id && edge.to !== id);
      render();
      return;
    }
    const edit = event.target.closest('[data-edit-node]');
    if (edit) {
      const node = state.nodes.find((item) => item.id === edit.dataset.editNode);
      setStatus(`${label(node?.kind)} edit form will be added in the next step.`);
      return;
    }
    const socket = event.target.closest('[data-socket]');
    if (socket) toggleConnection(socket.dataset.node, socket.dataset.socket);
  });

  board?.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || event.target.closest('button')) return;
    const element = handle.closest('[data-lms-node]');
    const node = state.nodes.find((item) => item.id === element.dataset.lmsNode);
    if (!node) return;
    state.drag = { id: node.id, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, pointerId: event.pointerId };
    element.classList.add('is-dragging');
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  board?.addEventListener('pointermove', (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    const node = state.nodes.find((item) => item.id === state.drag.id);
    if (!node) return;
    node.x = state.drag.x + (event.clientX - state.drag.startX) / state.zoom;
    node.y = state.drag.y + (event.clientY - state.drag.startY) / state.zoom;
    shiftOriginIfNeeded(node);
    ensureCanvasForPoint(node.x + 420, node.y + 260);
    const element = board.querySelector(`[data-lms-node="${CSS.escape(node.id)}"]`);
    if (element) { element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; }
    drawEdges();
  });

  function endDrag(event) {
    if (!state.drag || (event && state.drag.pointerId !== event.pointerId)) return;
    const element = board.querySelector(`[data-lms-node="${CSS.escape(state.drag.id)}"]`);
    element?.classList.remove('is-dragging');
    state.drag = null;
  }
  board?.addEventListener('pointerup', endDrag);
  board?.addEventListener('pointercancel', endDrag);

  wrap?.addEventListener('pointerdown', startPan);
  wrap?.addEventListener('pointermove', movePan);
  wrap?.addEventListener('pointerup', endPan);
  wrap?.addEventListener('pointercancel', endPan);
  wrap?.addEventListener('wheel', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(state.zoom * Math.exp(-event.deltaY * 0.0018), event.clientX, event.clientY);
  }, { passive: false });
  wrap?.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    state.pinch = { distance: Math.max(1, touchDistance(event.touches)), zoom: state.zoom };
    wrap.classList.add('is-pinching');
  }, { passive: false });
  wrap?.addEventListener('touchmove', (event) => {
    if (!state.pinch || event.touches.length < 2) return;
    event.preventDefault();
    const midpoint = touchMidpoint(event.touches);
    setZoom(state.pinch.zoom * touchDistance(event.touches) / state.pinch.distance, midpoint.clientX, midpoint.clientY);
  }, { passive: false });
  wrap?.addEventListener('touchend', (event) => {
    if (!state.pinch || event.touches.length >= 2) return;
    state.pinch = null;
    wrap.classList.remove('is-pinching');
  });

  $('lmsZoomInBtn')?.addEventListener('click', () => setZoom(state.zoom + 0.1));
  $('lmsZoomOutBtn')?.addEventListener('click', () => setZoom(state.zoom - 0.1));
  $('lmsZoomResetBtn')?.addEventListener('click', () => { state.zoom = 1; applyCanvasDimensions(); updateZoomUi(); centerCanvas(); drawEdges(); });

  window.addEventListener('resize', drawEdges);
  iconify();
  render();
  updateZoomUi();
})();

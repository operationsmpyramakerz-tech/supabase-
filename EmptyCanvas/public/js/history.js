(function(){
  'use strict';

  const PAGE_SIZE = 50;
  const state = {
    allRows: [],
    rows: [],
    loading: false,
    visibleLimit: PAGE_SIZE,
    filters: { page: '', actor: '', date: '' },
  };

  const creatorProfileCache = new Map();
  let creatorProfilePopover = null;
  let creatorProfileListenersBound = false;

  function $(id){ return document.getElementById(id); }

  function escapeHTML(value){
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function formatDateTime(value){
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function formatShortDate(value){
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  function formatShortTime(value){
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }

  function formatCardDateTime(value){
    if (!value) return '—';
    const date = formatShortDate(value);
    const time = formatShortTime(value);
    return time && time !== '—' ? `${date} - ${time}` : date;
  }

  function entityLabelForCard(row){
    const label = String(row?.entityLabel || row?.entityId || '').trim();
    if (label) return label;
    const action = String(row?.actionLabel || '').toLowerCase();
    const actor = String(row?.actorName || '').trim();
    if ((action.includes('signed out') || action.includes('signed in')) && actor) return actor;
    return '—';
  }

  function dateKey(value){
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function iconFor(row){
    const method = String(row.method || '').toUpperCase();
    const action = String(row.actionLabel || '').toLowerCase();
    if (action.includes('delete') || action.includes('reject')) return 'trash-2';
    if (action.includes('approve')) return 'check-circle';
    if (action.includes('upload')) return 'upload';
    if (action.includes('archive')) return 'archive';
    if (method === 'POST') return 'plus-circle';
    if (method === 'PATCH' || method === 'PUT') return 'edit-3';
    return 'activity';
  }

  function setLoading(isLoading){
    state.loading = !!isLoading;
    const btn = $('historyRefreshBtn');
    if (btn) btn.classList.toggle('is-loading', state.loading);
    const deleteBtn = $('historyDeleteBtn');
    if (deleteBtn) deleteBtn.classList.toggle('is-loading', state.loading);
  }

  function renderEmpty(message, icon='inbox'){
    const list = $('historyList');
    if (!list) return;
    list.innerHTML = `<div class="history-empty"><i data-feather="${escapeHTML(icon)}"></i><span>${escapeHTML(message)}</span></div>`;
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function choiceRefs(type){
    const prefix = type === 'actor' ? 'historyActorFilter' : 'historyPageFilter';
    return {
      input: $(prefix),
      button: $(`${prefix}Button`),
      menu: $(`${prefix}Menu`),
      fallback: type === 'actor' ? 'All users' : 'All pages',
    };
  }

  function updateChoiceLabel(type){
    const refs = choiceRefs(type);
    const label = refs.button?.querySelector('.history-choice-label');
    if (label) label.textContent = refs.input?.value || refs.fallback;
  }

  function closeChoiceMenus(exceptType){
    ['page', 'actor'].forEach((type) => {
      if (type === exceptType) return;
      const refs = choiceRefs(type);
      if (refs.menu) refs.menu.hidden = true;
      refs.button?.classList.remove('is-open');
    });
  }

  function setChoiceOptions(type, values, fallbackLabel){
    const refs = choiceRefs(type);
    if (!refs.input || !refs.menu) return;
    const current = refs.input.value || '';
    const unique = Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
    refs.menu.innerHTML = [
      `<button type="button" class="history-choice-option" data-history-choice-type="${escapeHTML(type)}" data-history-choice-value=""><span>${escapeHTML(fallbackLabel)}</span><i data-feather="check"></i></button>`,
      ...unique.map((value) => `<button type="button" class="history-choice-option" data-history-choice-type="${escapeHTML(type)}" data-history-choice-value="${escapeHTML(value)}"><span>${escapeHTML(value)}</span><i data-feather="check"></i></button>`),
    ].join('');
    if (current && unique.includes(current)) refs.input.value = current;
    else if (current && !unique.includes(current)) refs.input.value = '';
    updateChoiceLabel(type);
    updateChoiceSelected(type);
  }

  function updateChoiceSelected(type){
    const refs = choiceRefs(type);
    if (!refs.menu || !refs.input) return;
    const current = refs.input.value || '';
    refs.menu.querySelectorAll('[data-history-choice-value]').forEach((option) => {
      option.classList.toggle('is-selected', String(option.dataset.historyChoiceValue || '') === current);
    });
  }

  function toggleChoice(type){
    const refs = choiceRefs(type);
    if (!refs.menu || !refs.button) return;
    const willOpen = refs.menu.hidden;
    closeChoiceMenus(willOpen ? type : undefined);
    refs.menu.hidden = !willOpen;
    refs.button.classList.toggle('is-open', willOpen);
    if (willOpen) updateChoiceSelected(type);
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function setChoiceValue(type, value){
    const refs = choiceRefs(type);
    if (!refs.input) return;
    refs.input.value = String(value || '');
    updateChoiceLabel(type);
    updateChoiceSelected(type);
    closeChoiceMenus();
  }

  function syncFilterOptions(){
    const rows = state.allRows || [];
    setChoiceOptions('page', rows.map((row) => row.pageName || 'System'), 'All pages');
    setChoiceOptions('actor', rows.map((row) => row.actorName || 'System'), 'All users');
  }

  function updateActiveFilterText(){
    const el = $('historyActiveFilters');
    if (!el) return;
    const parts = [];
    if (state.filters.page) parts.push(`Page: ${state.filters.page}`);
    if (state.filters.actor) parts.push(`User: ${state.filters.actor}`);
    if (state.filters.date) parts.push(`Date: ${formatShortDate(state.filters.date)}`);
    el.textContent = parts.length ? parts.join(' • ') : 'No filters applied';
  }

  function applyFiltersFromControls(){
    state.filters = {
      page: String($('historyPageFilter')?.value || '').trim(),
      actor: String($('historyActorFilter')?.value || '').trim(),
      date: String($('historyDateFilter')?.value || '').trim(),
    };
    const rows = state.allRows || [];
    state.rows = rows.filter((row) => {
      if (state.filters.page && String(row.pageName || '') !== state.filters.page) return false;
      if (state.filters.actor && String(row.actorName || '') !== state.filters.actor) return false;
      if (state.filters.date && dateKey(row.createdAt) !== state.filters.date) return false;
      return true;
    });
    state.visibleLimit = PAGE_SIZE;
    updateActiveFilterText();
    renderRows();
  }

  function clearFilters(){
    ['historyPageFilter','historyActorFilter','historyDateFilter'].forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });
    applyFiltersFromControls();
  }

  function renderRows(){
    const list = $('historyList');
    const count = $('historyCount');
    if (!list) return;
    const rows = state.rows || [];
    if (count) count.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) return renderEmpty('No history records found.', 'clock');

    const visibleLimit = Math.max(PAGE_SIZE, Number(state.visibleLimit) || PAGE_SIZE);
    const visibleRows = rows.slice(0, visibleLimit);
    const canShowMore = rows.length > visibleRows.length;

    const cards = visibleRows.map((row) => `
      <div class="history-row" aria-label="${escapeHTML(row.actionLabel || 'history action')}">
        <span class="history-row-icon"><i data-feather="${escapeHTML(iconFor(row))}"></i></span>
        <span class="history-row-main">
          <span class="history-row-title">${escapeHTML(row.actionLabel || 'Action')}</span>
          <span class="history-row-entity">${escapeHTML(entityLabelForCard(row))}</span>
        </span>
        <span class="history-row-meta">
          <span class="history-row-date">${escapeHTML(formatCardDateTime(row.createdAt))}</span>
          <span class="history-page-chip">
            <span class="history-page-pill">${escapeHTML(row.pageName || 'System')}</span>
            <button type="button" class="history-person-btn" data-history-creator data-creator-id="${escapeHTML(row.actorId || '')}" data-creator-name="${escapeHTML(row.actorName || 'User')}" aria-label="Created by ${escapeHTML(row.actorName || 'User')}" title="Created by ${escapeHTML(row.actorName || 'User')}">
              <i data-feather="user"></i>
            </button>
          </span>
        </span>
      </div>
    `).join('');

    list.innerHTML = cards + (canShowMore ? `
      <button type="button" class="history-show-more" id="historyShowMoreBtn">
        <i data-feather="chevrons-down"></i>
        <span>Show more</span>
      </button>
    ` : '');
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  async function loadHistory(){
    setLoading(true);
    const list = $('historyList');
    if (list) list.innerHTML = '<div class="history-empty history-loading"><i data-feather="loader"></i><span>Loading history...</span></div>';
    try { if (window.feather) window.feather.replace(); } catch {}
    try {
      const params = new URLSearchParams({ limit: '1000' });
      const res = await fetch(`/api/history?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to load history.');
      state.allRows = Array.isArray(data.rows) ? data.rows : [];
      syncFilterOptions();
      applyFiltersFromControls();
    } catch (error) {
      console.error('History load failed:', error);
      state.allRows = [];
      state.rows = [];
      syncFilterOptions();
      updateActiveFilterText();
      renderEmpty(error.message || 'Failed to load history.', 'alert-triangle');
    } finally {
      setLoading(false);
    }
  }

  function showHistoryToast(message = '', variant = 'success') {
    const clean = String(message || '').trim();
    if (!clean) return;
    let toast = document.getElementById('historyToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'historyToast';
      toast.className = 'history-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.className = `history-toast history-toast--${variant || 'success'} is-visible`;
    toast.innerHTML = `<i data-feather="${variant === 'danger' ? 'alert-circle' : 'check-circle'}"></i><span>${escapeHTML(clean)}</span>`;
    try { if (window.feather) window.feather.replace(); } catch {}
    window.clearTimeout(showHistoryToast._timer);
    showHistoryToast._timer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2800);
  }

  function setClearHistoryError(message = ''){
    const el = $('historyClearError');
    if (!el) return;
    const clean = String(message || '').trim();
    el.textContent = clean;
    el.hidden = !clean;
  }

  function setClearHistorySubmitting(isSubmitting){
    const btn = $('historyClearConfirmBtn');
    if (!btn) return;
    btn.disabled = !!isSubmitting;
    btn.classList.toggle('is-loading', !!isSubmitting);
    const label = btn.querySelector('span');
    if (label) label.textContent = isSubmitting ? 'Deleting...' : 'Delete history';
  }

  function openClearHistoryModal(){
    const modal = $('historyClearModal');
    if (!modal) return;
    setClearHistoryError('');
    setClearHistorySubmitting(false);
    const input = $('historyClearPassword');
    if (input) input.value = '';
    modal.hidden = false;
    document.body.classList.add('history-modal-open');
    try { if (window.feather) window.feather.replace(); } catch {}
    setTimeout(() => { try { input?.focus({ preventScroll: true }); } catch {} }, 60);
  }

  function closeClearHistoryModal(){
    const modal = $('historyClearModal');
    if (modal) modal.hidden = true;
    setClearHistoryError('');
    setClearHistorySubmitting(false);
    document.body.classList.remove('history-modal-open');
  }

  async function clearAllHistory(){
    const cleanPassword = String($('historyClearPassword')?.value || '').trim();
    if (!cleanPassword) {
      setClearHistoryError('Admin password is required.');
      return;
    }
    setLoading(true);
    setClearHistorySubmitting(true);
    setClearHistoryError('');
    try {
      const res = await fetch('/api/history/clear', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: cleanPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to delete history.');
      state.allRows = [];
      state.rows = [];
      state.visibleLimit = PAGE_SIZE;
      syncFilterOptions();
      updateActiveFilterText();
      renderRows();
      closeClearHistoryModal();
      showHistoryToast('History records deleted successfully.');
    } catch (error) {
      console.error('Clear history failed:', error);
      setClearHistoryError(error.message || 'Failed to delete history.');
      showHistoryToast(error.message || 'Failed to delete history.', 'danger');
    } finally {
      setLoading(false);
      setClearHistorySubmitting(false);
    }
  }

  function creatorInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
    return (first + last).toUpperCase() || 'U';
  }

  function safeHttpUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.href;
    } catch { return ''; }
  }

  function creatorUrlHost(url) {
    const clean = safeHttpUrl(url);
    if (!clean) return '';
    try { return new URL(clean).hostname.replace(/^www\./i, ''); }
    catch { return ''; }
  }

  function creatorProfileFileCards(files) {
    const list = (Array.isArray(files) ? files : [])
      .map((file, index) => ({
        name: String(file?.name || '').trim() || `File ${index + 1}`,
        url: safeHttpUrl(file?.url),
      }))
      .filter((file) => file.name || file.url);

    if (!list.length) {
      return `<div class="creator-profile-empty"><i data-feather="folder"></i><span>No files or media.</span></div>`;
    }

    return list.map((file) => {
      const host = creatorUrlHost(file.url);
      const body = `
        <span class="creator-profile-file-icon"><i data-feather="paperclip"></i></span>
        <span class="creator-profile-file-body">
          <span class="creator-profile-file-name">${escapeHTML(file.name || host || 'File')}</span>
          ${host ? `<span class="creator-profile-file-host">${escapeHTML(host)}</span>` : ''}
        </span>
        ${file.url ? '<span class="creator-profile-file-open"><i data-feather="external-link"></i></span>' : ''}
      `;
      return file.url
        ? `<a class="creator-profile-file" href="${escapeHTML(file.url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
        : `<div class="creator-profile-file creator-profile-file--disabled">${body}</div>`;
    }).join('');
  }

  const CREATOR_PROFILE_FIELD_ORDER = [
    { label: 'Name', aliases: ['Name'], value: (profile) => profile?.name || profile?.username },
    { label: 'Department', aliases: ['Department'], value: (profile) => profile?.department },
    { label: 'Position', aliases: ['Position'], value: (profile) => profile?.position },
    { label: 'Phone', aliases: ['Phone', 'Mobile', 'Phone Number'], value: (profile) => profile?.phone },
    { label: 'Email', aliases: ['Email', 'E-mail'], value: (profile) => profile?.email },
    { label: 'Employee Code', aliases: ['Employee Code', 'Employee ID', 'Code'], value: (profile) => profile?.employeeCode },
  ];

  function creatorProfileFieldKey(label) {
    return String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function creatorProfileValueFromTopLevel(profile, getter) {
    const value = typeof getter === 'function' ? getter(profile || {}) : '';
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function creatorProfileValueFromFields(profile, aliases) {
    const wanted = new Set((aliases || []).map(creatorProfileFieldKey));
    const fields = Array.isArray(profile?.fields) ? profile.fields : [];
    const found = fields.find((field) => {
      if (field?.type === 'files') return false;
      const key = creatorProfileFieldKey(field?.label);
      if (!wanted.has(key)) return false;
      return String(field?.value ?? '').trim();
    });
    return found ? String(found.value ?? '').trim() : '';
  }

  function creatorProfileFieldsMarkup(profile) {
    const fields = CREATOR_PROFILE_FIELD_ORDER
      .map((field) => {
        const fromTopLevel = creatorProfileValueFromTopLevel(profile, field.value);
        const fromFields = creatorProfileValueFromFields(profile, field.aliases);
        return { label: field.label, value: fromTopLevel || fromFields };
      })
      .filter((field) => String(field.value || '').trim());

    if (!fields.length) {
      return `<div class="creator-profile-empty creator-profile-empty--fields"><i data-feather="info"></i><span>No profile details available.</span></div>`;
    }

    return fields.map((field) => `
      <div class="creator-profile-field">
        <span>${escapeHTML(field.label)}</span>
        <strong>${escapeHTML(field.value)}</strong>
      </div>
    `).join('');
  }

  function renderCreatorProfileContent(profile, fallbackName = '', mode = 'ready') {
    const name = String(profile?.name || fallbackName || 'Creator').trim() || 'Creator';
    const position = String(profile?.position || '').trim();
    const department = String(profile?.department || '').trim();
    const subtitle = [position, department].filter(Boolean).join(' • ') || 'Team member';
    const photo = safeHttpUrl(profile?.photoUrl);
    const avatar = photo
      ? `<img src="${escapeHTML(photo)}" alt="${escapeHTML(name)}" decoding="async" />`
      : `<span>${escapeHTML(creatorInitials(name))}</span>`;
    const loading = mode === 'loading';
    const error = mode === 'error';

    return `
      <div class="creator-profile-window history-creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile">
        <button type="button" class="creator-profile-close" aria-label="Close" title="Close"><span class="creator-profile-close-x" aria-hidden="true">&times;</span></button>
        <div class="creator-profile-head">
          <div class="creator-profile-avatar ${photo ? 'has-image' : ''}">${avatar}</div>
          <div class="creator-profile-title-wrap">
            <div class="creator-profile-kicker">Created by</div>
            <div class="creator-profile-name">${escapeHTML(name)}</div>
            <div class="creator-profile-subtitle">${escapeHTML(subtitle)}</div>
          </div>
        </div>
        ${loading ? `
          <div class="creator-profile-state"><i class="loading-icon" data-feather="loader"></i><span>Loading user details...</span></div>
        ` : error ? `
          <div class="creator-profile-state creator-profile-state--error"><i data-feather="alert-circle"></i><span>Could not load this user details.</span></div>
        ` : `
          <div class="creator-profile-section-title">Profile details</div>
          <div class="creator-profile-fields">${creatorProfileFieldsMarkup(profile)}</div>
          <div class="creator-profile-section-title creator-profile-section-title--files">Files &amp; media</div>
          <div class="creator-profile-files">${creatorProfileFileCards(profile?.filesMedia)}</div>
        `}
      </div>
    `;
  }

  function ensureCreatorProfilePopover() {
    if (creatorProfilePopover) return creatorProfilePopover;
    creatorProfilePopover = document.createElement('div');
    creatorProfilePopover.className = 'creator-profile-popover history-creator-profile-popover';
    creatorProfilePopover.setAttribute('aria-hidden', 'true');
    document.body.appendChild(creatorProfilePopover);

    creatorProfilePopover.addEventListener('click', (event) => {
      if (event.target.closest('.creator-profile-close')) closeCreatorProfilePopover();
    });

    if (!creatorProfileListenersBound) {
      creatorProfileListenersBound = true;
      document.addEventListener('pointerdown', (event) => {
        if (!creatorProfilePopover?.classList.contains('is-open')) return;
        if (creatorProfilePopover.contains(event.target)) return;
        if (event.target.closest?.('[data-history-creator]')) return;
        closeCreatorProfilePopover();
      }, true);
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeCreatorProfilePopover();
      });
      window.addEventListener('resize', closeCreatorProfilePopover);
    }
    return creatorProfilePopover;
  }

  function closeCreatorProfilePopover() {
    if (!creatorProfilePopover) return;
    creatorProfilePopover.classList.remove('is-open');
    creatorProfilePopover.setAttribute('aria-hidden', 'true');
    creatorProfilePopover.style.left = '';
    creatorProfilePopover.style.top = '';
  }

  function positionCreatorProfilePopover(anchor) {
    const pop = ensureCreatorProfilePopover();
    if (!anchor) return;
    const margin = 14;
    const rect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const width = popRect.width || 360;
    const height = popRect.height || 420;
    let left = rect.right - width;
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin));
    let top = rect.bottom + 10;
    if (top + height > window.innerHeight - margin) top = rect.top - height - 10;
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  async function openCreatorProfilePopover(anchor, userId, fallbackName = '') {
    const pop = ensureCreatorProfilePopover();
    const cleanId = String(userId || '').trim();
    const cleanName = String(fallbackName || '').trim() || 'Creator';
    pop.innerHTML = renderCreatorProfileContent({ name: cleanName }, cleanName, 'loading');
    pop.classList.add('is-open');
    pop.setAttribute('aria-hidden', 'false');
    if (window.feather) window.feather.replace();
    requestAnimationFrame(() => positionCreatorProfilePopover(anchor));

    if (!cleanId) {
      pop.innerHTML = renderCreatorProfileContent({ name: cleanName, fields: [], filesMedia: [] }, cleanName, 'error');
      if (window.feather) window.feather.replace();
      requestAnimationFrame(() => positionCreatorProfilePopover(anchor));
      return;
    }

    try {
      let profile = creatorProfileCache.get(cleanId);
      if (!profile) {
        const res = await fetch(`/api/team-members/${encodeURIComponent(cleanId)}/public`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
        profile = json;
        creatorProfileCache.set(cleanId, profile);
      }
      pop.innerHTML = renderCreatorProfileContent(profile, cleanName, 'ready');
    } catch (error) {
      pop.innerHTML = renderCreatorProfileContent({ name: cleanName }, cleanName, 'error');
    }
    if (window.feather) window.feather.replace();
    requestAnimationFrame(() => positionCreatorProfilePopover(anchor));
  }

  function detailItem(label, value){
    return `<div class="history-detail-item"><div class="history-detail-label">${escapeHTML(label)}</div><div class="history-detail-value">${escapeHTML(value || '—')}</div></div>`;
  }

  function jsonBlock(label, value){
    let pretty = '{}';
    try { pretty = JSON.stringify(value || {}, null, 2); } catch { pretty = String(value || '{}'); }
    return `<div class="history-detail-item" style="grid-column:1/-1"><div class="history-detail-label">${escapeHTML(label)}</div><pre class="history-json">${escapeHTML(pretty)}</pre></div>`;
  }

  function openDetails(row){
    const modal = $('historyModal');
    const title = $('historyModalTitle');
    const body = $('historyModalBody');
    if (!modal || !title || !body) return;
    title.textContent = row.actionLabel || 'History details';
    body.innerHTML = `
      <div class="history-detail-grid">
        ${detailItem('User', row.actorName)}
        ${detailItem('Page', row.pageName)}
        ${detailItem('Date & time', formatDateTime(row.createdAt))}
        ${detailItem('Action', row.actionLabel)}
        ${detailItem('Entity type', row.entityType)}
        ${detailItem('Entity', row.entityLabel || row.entityId)}
        ${detailItem('Department', row.actorDepartment)}
        ${detailItem('Position', row.actorPosition)}
        ${jsonBlock('Extra details', row.details)}
      </div>
    `;
    modal.hidden = false;
    document.body.classList.add('history-modal-open');
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function closeDetails(){
    const modal = $('historyModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('history-modal-open');
  }

  function openFilterModal(){
    const modal = $('historyFilterModal');
    if (!modal) return;
    syncFilterOptions();
    if ($('historyPageFilter')) $('historyPageFilter').value = state.filters.page || '';
    if ($('historyActorFilter')) $('historyActorFilter').value = state.filters.actor || '';
    if ($('historyDateFilter')) $('historyDateFilter').value = state.filters.date || '';
    updateChoiceLabel('page');
    updateChoiceLabel('actor');
    updateChoiceSelected('page');
    updateChoiceSelected('actor');
    modal.hidden = false;
    document.body.classList.add('history-modal-open');
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function closeFilterModal(){
    const modal = $('historyFilterModal');
    if (modal) modal.hidden = true;
    closeChoiceMenus();
    document.body.classList.remove('history-modal-open');
  }

  document.addEventListener('click', (event) => {
    const choiceToggle = event.target.closest('[data-history-choice-toggle]');
    if (choiceToggle) {
      toggleChoice(choiceToggle.dataset.historyChoiceToggle);
      return;
    }

    const choiceOption = event.target.closest('[data-history-choice-type][data-history-choice-value]');
    if (choiceOption) {
      setChoiceValue(choiceOption.dataset.historyChoiceType, choiceOption.dataset.historyChoiceValue || '');
      return;
    }

    if (!event.target.closest('.history-choice-field')) closeChoiceMenus();

    const creatorBtn = event.target.closest('[data-history-creator]');
    if (creatorBtn) {
      event.preventDefault();
      event.stopPropagation();
      openCreatorProfilePopover(creatorBtn, creatorBtn.dataset.creatorId, creatorBtn.dataset.creatorName);
      return;
    }

    const showMoreBtn = event.target.closest('#historyShowMoreBtn');
    if (showMoreBtn) {
      event.preventDefault();
      state.visibleLimit = Math.max(PAGE_SIZE, Number(state.visibleLimit) || PAGE_SIZE) + PAGE_SIZE;
      renderRows();
      return;
    }

    if (event.target.closest('[data-history-close]')) closeDetails();
    if (event.target.closest('[data-history-filter-close]')) closeFilterModal();
    if (event.target.closest('[data-history-clear-close]')) closeClearHistoryModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDetails();
      closeFilterModal();
      closeClearHistoryModal();
      return;
    }
  });

  $('historyRefreshBtn')?.addEventListener('click', loadHistory);
  $('historyDeleteBtn')?.addEventListener('click', openClearHistoryModal);
  $('historyClearConfirmBtn')?.addEventListener('click', clearAllHistory);
  $('historyClearPassword')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      clearAllHistory();
    }
  });
  $('historyFilterOpenBtn')?.addEventListener('click', openFilterModal);
  $('historyApplyFilters')?.addEventListener('click', () => { applyFiltersFromControls(); closeFilterModal(); });
  $('historyClearFilters')?.addEventListener('click', () => { clearFilters(); closeFilterModal(); });
  $('historyDateFilter')?.addEventListener('click', (event) => {
    try {
      if (typeof event.currentTarget.showPicker === 'function') event.currentTarget.showPicker();
    } catch {}
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadHistory);
  else loadHistory();
})();

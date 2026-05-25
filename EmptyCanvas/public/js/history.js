(function(){
  'use strict';

  const state = {
    allRows: [],
    rows: [],
    loading: false,
    filters: { page: '', actor: '', date: '' },
  };

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
  }

  function renderEmpty(message, icon='inbox'){
    const list = $('historyList');
    if (!list) return;
    list.innerHTML = `<div class="history-empty"><i data-feather="${escapeHTML(icon)}"></i><span>${escapeHTML(message)}</span></div>`;
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function setSelectOptions(select, values, fallbackLabel){
    if (!select) return;
    const current = select.value || '';
    const unique = Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="">${escapeHTML(fallbackLabel)}</option>` + unique.map((value) => (
      `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
    )).join('');
    if (current && unique.includes(current)) select.value = current;
  }

  function syncFilterOptions(){
    const rows = state.allRows || [];
    setSelectOptions($('historyPageFilter'), rows.map((row) => row.pageName || 'System'), 'All pages');
    setSelectOptions($('historyActorFilter'), rows.map((row) => row.actorName || 'System'), 'All users');

    const dates = Array.from(new Set(rows.map((row) => dateKey(row.createdAt)).filter(Boolean))).sort().reverse();
    const dateSelect = $('historyDateFilter');
    if (dateSelect) {
      const current = dateSelect.value || '';
      dateSelect.innerHTML = '<option value="">All dates</option>' + dates.map((value) => {
        const label = formatShortDate(value);
        return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
      }).join('');
      if (current && dates.includes(current)) dateSelect.value = current;
    }
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

    list.innerHTML = rows.map((row, index) => `
      <button type="button" class="history-row" data-history-index="${index}">
        <span class="history-row-icon"><i data-feather="${escapeHTML(iconFor(row))}"></i></span>
        <span class="history-row-main">
          <span class="history-row-title">${escapeHTML(row.actionLabel || 'Action')}</span>
          <span class="history-row-sub">
            <b>${escapeHTML(row.actorName || 'System')}</b>
            <span>•</span>
            <span>${escapeHTML(row.pageName || 'System')}</span>
            ${row.entityLabel ? `<span>•</span><span>${escapeHTML(row.entityLabel)}</span>` : ''}
          </span>
        </span>
        <span class="history-row-meta">
          <span>${escapeHTML(formatShortDate(row.createdAt))}</span>
          <span class="history-page-pill">${escapeHTML(row.pageName || 'System')}</span>
        </span>
      </button>
    `).join('');
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  async function loadHistory(){
    setLoading(true);
    const list = $('historyList');
    if (list) list.innerHTML = '<div class="history-empty history-loading"><i data-feather="loader"></i><span>Loading history...</span></div>';
    try { if (window.feather) window.feather.replace(); } catch {}
    try {
      const params = new URLSearchParams({ limit: '200' });
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
    modal.hidden = false;
    document.body.classList.add('history-modal-open');
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function closeFilterModal(){
    const modal = $('historyFilterModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('history-modal-open');
  }

  document.addEventListener('click', (event) => {
    const rowBtn = event.target.closest('[data-history-index]');
    if (rowBtn) {
      const idx = Number(rowBtn.dataset.historyIndex);
      if (Number.isFinite(idx) && state.rows[idx]) openDetails(state.rows[idx]);
      return;
    }
    if (event.target.closest('[data-history-close]')) closeDetails();
    if (event.target.closest('[data-history-filter-close]')) closeFilterModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDetails();
      closeFilterModal();
    }
  });

  $('historyRefreshBtn')?.addEventListener('click', loadHistory);
  $('historyFilterOpenBtn')?.addEventListener('click', openFilterModal);
  $('historyApplyFilters')?.addEventListener('click', () => { applyFiltersFromControls(); closeFilterModal(); });
  $('historyClearFilters')?.addEventListener('click', () => { clearFilters(); closeFilterModal(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadHistory);
  else loadHistory();
})();

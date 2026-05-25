(function(){
  'use strict';

  const state = { rows: [], loading: false };

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
    list.innerHTML = `<div class="history-empty"><i data-feather="${icon}"></i><span>${escapeHTML(message)}</span></div>`;
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function renderRows(){
    const list = $('historyList');
    const count = $('historyCount');
    if (!list) return;
    const rows = state.rows || [];
    if (count) count.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) return renderEmpty('No history records yet.', 'clock');

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

  function buildQuery(){
    const params = new URLSearchParams();
    params.set('limit', '120');
    const page = String($('historyPageFilter')?.value || '').trim();
    const actor = String($('historyActorFilter')?.value || '').trim();
    const action = String($('historyActionFilter')?.value || '').trim();
    if (page) params.set('page', page);
    if (actor) params.set('actor', actor);
    if (action) params.set('action', action);
    return params.toString();
  }

  async function loadHistory(){
    setLoading(true);
    const list = $('historyList');
    if (list) list.innerHTML = '<div class="history-empty history-loading"><i data-feather="loader"></i><span>Loading history...</span></div>';
    try { if (window.feather) window.feather.replace(); } catch {}
    try {
      const res = await fetch(`/api/history?${buildQuery()}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to load history.');
      state.rows = Array.isArray(data.rows) ? data.rows : [];
      renderRows();
    } catch (error) {
      console.error('History load failed:', error);
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
        ${detailItem('Method', row.method)}
        ${detailItem('Endpoint', row.path)}
        ${detailItem('Status', row.statusCode ? String(row.statusCode) : '—')}
        ${detailItem('Entity type', row.entityType)}
        ${detailItem('Entity', row.entityLabel || row.entityId)}
        ${detailItem('Department', row.actorDepartment)}
        ${detailItem('Position', row.actorPosition)}
        ${jsonBlock('Request details', row.requestBody)}
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

  document.addEventListener('click', (event) => {
    const rowBtn = event.target.closest('[data-history-index]');
    if (rowBtn) {
      const idx = Number(rowBtn.dataset.historyIndex);
      if (Number.isFinite(idx) && state.rows[idx]) openDetails(state.rows[idx]);
      return;
    }
    if (event.target.closest('[data-history-close]')) closeDetails();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetails();
    if (event.key === 'Enter' && ['historyPageFilter','historyActorFilter','historyActionFilter'].includes(event.target?.id)) loadHistory();
  });

  $('historyRefreshBtn')?.addEventListener('click', loadHistory);
  $('historyApplyFilters')?.addEventListener('click', loadHistory);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadHistory);
  else loadHistory();
})();

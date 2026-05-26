(function(){
  'use strict';

  const state = {
    tables: [],
    selected: null,
    pendingPassword: '',
    loading: false,
    deleting: false,
  };

  function $(id){ return document.getElementById(id); }

  function escapeHTML(value){
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function setLoading(isLoading){
    state.loading = !!isLoading;
    const btn = $('backupRefreshBtn');
    if (btn) btn.classList.toggle('is-loading', state.loading);
  }

  function renderEmpty(message, icon = 'database'){
    const grid = $('backupGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="backup-empty"><i data-feather="${escapeHTML(icon)}"></i><span>${escapeHTML(message)}</span></div>`;
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function showToast(message = '', variant = 'success'){
    const clean = String(message || '').trim();
    if (!clean) return;
    let toast = $('backupToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'backupToast';
      toast.className = 'backup-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.className = `backup-toast backup-toast--${variant || 'success'} is-visible`;
    toast.innerHTML = `<i data-feather="${variant === 'danger' ? 'alert-circle' : 'check-circle'}"></i><span>${escapeHTML(clean)}</span>`;
    try { if (window.feather) window.feather.replace(); } catch {}
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function renderTables(){
    const grid = $('backupGrid');
    const count = $('backupCount');
    if (!grid) return;
    const tables = Array.isArray(state.tables) ? state.tables : [];
    if (count) count.textContent = `${tables.length} table${tables.length === 1 ? '' : 's'}`;
    if (!tables.length) return renderEmpty('No backup tables found.', 'database');

    grid.innerHTML = tables.map((item) => `
      <article class="backup-table-card" data-backup-key="${escapeHTML(item.key)}">
        <div class="backup-table-head">
          <span class="backup-card-icon"><i data-feather="${escapeHTML(item.icon || 'database')}"></i></span>
          <div>
            <h3 class="backup-card-title">${escapeHTML(item.pageName || 'Database')}</h3>
            <span class="backup-card-module">${escapeHTML(item.moduleName || 'System')}</span>
          </div>
        </div>
        <p class="backup-card-desc">${escapeHTML(item.description || 'Download or delete this table data.')}</p>
        <div class="backup-table-name" title="${escapeHTML(item.tableName || '')}"><i data-feather="database"></i><code>${escapeHTML(item.tableName || 'table')}</code></div>
        <div class="backup-card-actions">
          <a class="backup-download-btn" href="/api/backup/tables/${encodeURIComponent(item.key)}/download" download>
            <i data-feather="download"></i><span>Back up CSV</span>
          </a>
          <button type="button" class="backup-delete-btn" data-backup-delete="${escapeHTML(item.key)}">
            <i data-feather="trash-2"></i><span>Delete data</span>
          </button>
        </div>
      </article>
    `).join('');
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  async function loadTables(){
    setLoading(true);
    renderEmpty('Loading backup tables...', 'loader');
    try {
      const res = await fetch('/api/backup/tables', { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to load backup tables.');
      state.tables = Array.isArray(data.tables) ? data.tables : [];
      renderTables();
    } catch (error) {
      console.error('Backup tables load failed:', error);
      state.tables = [];
      renderEmpty(error.message || 'Failed to load backup tables.', 'alert-triangle');
      showToast(error.message || 'Failed to load backup tables.', 'danger');
    } finally {
      setLoading(false);
    }
  }

  function findTable(key){
    return (state.tables || []).find((item) => String(item.key) === String(key)) || null;
  }

  function setDeleteError(message = ''){
    const el = $('backupDeleteError');
    if (!el) return;
    const clean = String(message || '').trim();
    el.textContent = clean;
    el.hidden = !clean;
  }

  function setDeleting(isDeleting){
    state.deleting = !!isDeleting;
    const btn = $('backupFinalConfirmBtn');
    if (btn) {
      btn.disabled = state.deleting;
      btn.classList.toggle('is-loading', state.deleting);
      const label = btn.querySelector('span');
      if (label) label.textContent = state.deleting ? 'Deleting...' : 'Confirm';
    }
  }

  function openDeleteModal(key){
    const item = findTable(key);
    if (!item) return;
    state.selected = item;
    state.pendingPassword = '';
    setDeleteError('');
    const title = $('backupDeleteTitle');
    const copy = $('backupDeleteCopy');
    const input = $('backupDeletePassword');
    if (title) title.textContent = `Delete ${item.pageName || item.tableName}?`;
    if (copy) copy.textContent = `This will permanently delete all data from the "${item.tableName}" Supabase table. Download a CSV back up first if needed.`;
    if (input) input.value = '';
    const modal = $('backupDeleteModal');
    if (modal) modal.hidden = false;
    document.body.classList.add('backup-modal-open');
    try { if (window.feather) window.feather.replace(); } catch {}
    setTimeout(() => { try { input?.focus({ preventScroll:true }); } catch {} }, 60);
  }

  function closeDeleteModal(){
    const modal = $('backupDeleteModal');
    if (modal) modal.hidden = true;
    setDeleteError('');
    const finalModal = $('backupFinalModal');
    if (!finalModal || finalModal.hidden) document.body.classList.remove('backup-modal-open');
  }

  function openFinalModal(){
    const password = String($('backupDeletePassword')?.value || '').trim();
    if (!password) {
      setDeleteError('Admin password is required.');
      return;
    }
    state.pendingPassword = password;
    setDeleteError('');
    const deleteModal = $('backupDeleteModal');
    if (deleteModal) deleteModal.hidden = true;
    const item = state.selected || {};
    const title = $('backupFinalTitle');
    const copy = $('backupFinalCopy');
    if (title) title.textContent = `Delete ${item.pageName || 'table data'}?`;
    if (copy) copy.textContent = `Confirm deleting all rows from "${item.tableName || 'this table'}". This action cannot be undone.`;
    const finalModal = $('backupFinalModal');
    if (finalModal) finalModal.hidden = false;
    document.body.classList.add('backup-modal-open');
    setDeleting(false);
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  function closeFinalModal(){
    const modal = $('backupFinalModal');
    if (modal) modal.hidden = true;
    state.pendingPassword = '';
    setDeleting(false);
    const firstModal = $('backupDeleteModal');
    if (!firstModal || firstModal.hidden) document.body.classList.remove('backup-modal-open');
  }

  async function confirmDelete(){
    const item = state.selected;
    const password = String(state.pendingPassword || '').trim();
    if (!item || !password) {
      closeFinalModal();
      if (item) openDeleteModal(item.key);
      setDeleteError('Admin password is required.');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/backup/tables/${encodeURIComponent(item.key)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to delete table data.');
      closeFinalModal();
      state.selected = null;
      showToast('Table data deleted successfully.');
      await loadTables();
    } catch (error) {
      console.error('Backup delete failed:', error);
      closeFinalModal();
      if (item) openDeleteModal(item.key);
      setDeleteError(error.message || 'Failed to delete table data.');
      showToast(error.message || 'Failed to delete table data.', 'danger');
    } finally {
      setDeleting(false);
    }
  }

  function bindEvents(){
    $('backupRefreshBtn')?.addEventListener('click', loadTables);
    document.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest?.('[data-backup-delete]');
      if (deleteBtn) {
        event.preventDefault();
        openDeleteModal(deleteBtn.dataset.backupDelete || '');
        return;
      }
      if (event.target.closest?.('[data-backup-delete-close]')) {
        event.preventDefault();
        closeDeleteModal();
        return;
      }
      if (event.target.closest?.('[data-backup-final-close]')) {
        event.preventDefault();
        closeFinalModal();
        return;
      }
    });
    $('backupDeleteNextBtn')?.addEventListener('click', openFinalModal);
    $('backupFinalConfirmBtn')?.addEventListener('click', confirmDelete);
    $('backupDeletePassword')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') openFinalModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const finalModal = $('backupFinalModal');
      const deleteModal = $('backupDeleteModal');
      if (finalModal && !finalModal.hidden) closeFinalModal();
      else if (deleteModal && !deleteModal.hidden) closeDeleteModal();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadTables();
    try { if (window.feather) window.feather.replace(); } catch {}
  });
})();

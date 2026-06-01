(function(){
  'use strict';

  const state = {
    tables: [],
    selected: null,
    importSelected: null,
    deleteMode: 'table',
    pendingPassword: '',
    loading: false,
    deleting: false,
    importing: false,
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
    showToast._timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3000);
  }

  function renderTables(){
    const grid = $('backupGrid');
    const count = $('backupCount');
    if (!grid) return;
    const tables = Array.isArray(state.tables) ? state.tables : [];
    if (count) count.textContent = `${tables.length} table${tables.length === 1 ? '' : 's'}`;
    if (!tables.length) return renderEmpty('No database tables found.', 'database');

    grid.innerHTML = tables.map((item) => `
      <article class="backup-table-card" data-backup-key="${escapeHTML(item.key)}">
        <div class="backup-table-head">
          <span class="backup-card-icon"><i data-feather="${escapeHTML(item.icon || 'database')}"></i></span>
          <div class="backup-card-meta">
            <h3 class="backup-card-title">${escapeHTML(item.pageName || 'Database')}</h3>
            <span class="backup-card-module">${escapeHTML(item.moduleName || 'System')}</span>
          </div>
        </div>
        <div class="backup-table-name" title="${escapeHTML(item.tableName || '')}"><i data-feather="database"></i><code>${escapeHTML(item.tableName || 'table')}</code></div>
        <div class="backup-card-actions">
          <a class="backup-download-btn" href="/api/backup/tables/${encodeURIComponent(item.key)}/download" download>
            <i data-feather="download"></i><span>Export</span>
          </a>
          <button type="button" class="backup-import-btn" data-backup-import="${escapeHTML(item.key)}">
            <i data-feather="upload"></i><span>Import</span>
          </button>
          <button type="button" class="backup-delete-btn" data-backup-delete="${escapeHTML(item.key)}">
            <i data-feather="trash-2"></i><span>Delete</span>
          </button>
        </div>
      </article>
    `).join('');
    try { if (window.feather) window.feather.replace(); } catch {}
  }

  async function loadTables(){
    setLoading(true);
    renderEmpty('Loading database tables...', 'loader');
    try {
      const res = await fetch('/api/backup/tables', { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to load database tables.');
      state.tables = Array.isArray(data.tables) ? data.tables : [];
      renderTables();
    } catch (error) {
      console.error('Database tables load failed:', error);
      state.tables = [];
      renderEmpty(error.message || 'Failed to load database tables.', 'alert-triangle');
      showToast(error.message || 'Failed to load database tables.', 'danger');
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

  function setImportError(message = ''){
    const el = $('backupImportError');
    if (!el) return;
    const clean = String(message || '').trim();
    el.textContent = clean;
    el.hidden = !clean;
  }

  function setDeleting(isDeleting, labelText = ''){
    state.deleting = !!isDeleting;
    const btn = $('backupFinalConfirmBtn');
    if (btn) {
      btn.disabled = state.deleting;
      btn.classList.toggle('is-loading', state.deleting);
      const label = btn.querySelector('span');
      if (label) label.textContent = state.deleting ? (labelText || 'Deleting...') : 'Confirm';
    }
  }

  function setImporting(isImporting, labelText = ''){
    state.importing = !!isImporting;
    const btn = $('backupImportConfirmBtn');
    if (btn) {
      btn.disabled = state.importing;
      btn.classList.toggle('is-loading', state.importing);
      const label = btn.querySelector('span');
      if (label) label.textContent = state.importing ? (labelText || 'Importing...') : 'Import CSV';
    }
  }

  function openDeleteModal(key){
    const item = findTable(key);
    if (!item) return;
    state.selected = item;
    state.deleteMode = 'table';
    state.pendingPassword = '';
    setDeleteError('');
    const title = $('backupDeleteTitle');
    const copy = $('backupDeleteCopy');
    const input = $('backupDeletePassword');
    if (title) title.textContent = `Delete ${item.pageName || item.tableName}?`;
    if (copy) copy.textContent = `A CSV export will download first, then all rows in "${item.tableName}" will be deleted.`;
    if (input) input.value = '';
    const modal = $('backupDeleteModal');
    if (modal) modal.hidden = false;
    document.body.classList.add('backup-modal-open');
    try { if (window.feather) window.feather.replace(); } catch {}
    setTimeout(() => { try { input?.focus({ preventScroll:true }); } catch {} }, 60);
  }

  function openDeleteAllModal(){
    state.selected = { key: '__all__', pageName: 'all system data', tableName: 'all database tables', isAll: true };
    state.deleteMode = 'all';
    state.pendingPassword = '';
    setDeleteError('');
    const title = $('backupDeleteTitle');
    const copy = $('backupDeleteCopy');
    const input = $('backupDeletePassword');
    if (title) title.textContent = 'Delete all data?';
    if (copy) copy.textContent = 'A ZIP export containing CSV files will download first, then all table rows will be deleted.';
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
    const importModal = $('backupImportModal');
    if ((!finalModal || finalModal.hidden) && (!importModal || importModal.hidden)) document.body.classList.remove('backup-modal-open');
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
    if (item.isAll || state.deleteMode === 'all') {
      if (title) title.textContent = 'Confirm delete all data?';
      if (copy) copy.textContent = 'The system will download a full ZIP export first. After that, all rows from all database tables will be deleted.';
    } else {
      if (title) title.textContent = `Confirm delete ${item.pageName || 'table data'}?`;
      if (copy) copy.textContent = `The system will download a CSV backup first. After that, all rows from "${item.tableName || 'this table'}" will be deleted.`;
    }
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
    state.deleteMode = 'table';
    setDeleting(false);
    const firstModal = $('backupDeleteModal');
    const importModal = $('backupImportModal');
    if ((!firstModal || firstModal.hidden) && (!importModal || importModal.hidden)) document.body.classList.remove('backup-modal-open');
  }

  function filenameFromResponse(res, fallback){
    const cd = String(res.headers.get('Content-Disposition') || '');
    const utf = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf?.[1]) {
      try { return decodeURIComponent(utf[1].replace(/["']/g, '')); } catch {}
    }
    const normal = cd.match(/filename="?([^";]+)"?/i);
    return normal?.[1] || fallback;
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'database-export.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
      link.remove();
    }, 1200);
  }

  async function exportBeforeDelete(isAll, item){
    const url = isAll ? '/api/backup/export-all' : `/api/backup/tables/${encodeURIComponent(item.key)}/download`;
    const fallback = isAll ? `database-export-${Date.now()}.zip` : `${item.tableName || 'table'}-${Date.now()}.csv`;
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || 'Export failed, so delete was stopped.');
    }
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error('Export file is empty, so delete was stopped.');
    downloadBlob(blob, filenameFromResponse(res, fallback));
    await new Promise((resolve) => setTimeout(resolve, 450));
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
    setDeleting(true, 'Exporting...');
    try {
      const isAll = !!item.isAll || state.deleteMode === 'all';
      await exportBeforeDelete(isAll, item);
      setDeleting(true, 'Deleting...');
      const url = isAll ? '/api/backup/delete-all' : `/api/backup/tables/${encodeURIComponent(item.key)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to delete data.');
      closeFinalModal();
      state.selected = null;
      state.deleteMode = 'table';
      showToast(isAll ? 'Export downloaded and all data deleted.' : 'CSV downloaded and table data deleted.');
      await loadTables();
    } catch (error) {
      console.error('Backup delete failed:', error);
      closeFinalModal();
      if (item?.isAll || state.deleteMode === 'all') openDeleteAllModal();
      else if (item) openDeleteModal(item.key);
      setDeleteError(error.message || 'Failed to delete data.');
      showToast(error.message || 'Failed to delete data.', 'danger');
    } finally {
      setDeleting(false);
    }
  }

  function openImportModal(key){
    const item = findTable(key);
    if (!item) return;
    state.importSelected = item;
    setImportError('');
    setImporting(false);
    const title = $('backupImportTitle');
    const table = $('backupImportTable');
    const file = $('backupImportFile');
    const password = $('backupImportPassword');
    if (title) title.textContent = `Import ${item.pageName || item.tableName}`;
    if (table) table.textContent = item.tableName || '';
    if (file) file.value = '';
    if (password) password.value = '';
    const modal = $('backupImportModal');
    if (modal) modal.hidden = false;
    document.body.classList.add('backup-modal-open');
    try { if (window.feather) window.feather.replace(); } catch {}
    setTimeout(() => { try { file?.focus({ preventScroll:true }); } catch {} }, 60);
  }

  function closeImportModal(){
    const modal = $('backupImportModal');
    if (modal) modal.hidden = true;
    state.importSelected = null;
    setImportError('');
    setImporting(false);
    const deleteModal = $('backupDeleteModal');
    const finalModal = $('backupFinalModal');
    if ((!deleteModal || deleteModal.hidden) && (!finalModal || finalModal.hidden)) document.body.classList.remove('backup-modal-open');
  }

  async function readCsvFile(file){
    if (!file) throw new Error('Choose a CSV file first.');
    const name = String(file.name || '').toLowerCase();
    if (name && !name.endsWith('.csv')) throw new Error('Only CSV files are allowed.');
    if (file.size > 25 * 1024 * 1024) throw new Error('CSV file is too large. Maximum size is 25 MB.');
    return await file.text();
  }

  async function confirmImport(){
    const item = state.importSelected;
    const file = $('backupImportFile')?.files?.[0] || null;
    const password = String($('backupImportPassword')?.value || '').trim();
    if (!item) return;
    if (!file) return setImportError('Choose a CSV file first.');
    if (!password) return setImportError('Admin password is required.');

    setImportError('');
    setImporting(true, 'Reading...');
    try {
      const csvText = await readCsvFile(file);
      setImporting(true, 'Validating...');
      const res = await fetch(`/api/backup/tables/${encodeURIComponent(item.key)}/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: password, filename: file.name || '', csvText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Failed to import CSV data.');
      closeImportModal();
      showToast(`Imported ${Number(data.importedRows || 0).toLocaleString()} row${Number(data.importedRows || 0) === 1 ? '' : 's'} into ${data.tableName || item.tableName}.`);
      await loadTables();
    } catch (error) {
      console.error('Backup import failed:', error);
      setImportError(error.message || 'Failed to import CSV data.');
      showToast(error.message || 'Failed to import CSV data.', 'danger');
    } finally {
      setImporting(false);
    }
  }

  function bindEvents(){
    document.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest?.('[data-backup-delete]');
      if (deleteBtn) {
        event.preventDefault();
        openDeleteModal(deleteBtn.dataset.backupDelete || '');
        return;
      }
      const importBtn = event.target.closest?.('[data-backup-import]');
      if (importBtn) {
        event.preventDefault();
        openImportModal(importBtn.dataset.backupImport || '');
        return;
      }
      if (event.target.closest?.('[data-backup-delete-all]')) {
        event.preventDefault();
        openDeleteAllModal();
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
      if (event.target.closest?.('[data-backup-import-close]')) {
        event.preventDefault();
        closeImportModal();
      }
    });
    $('backupDeleteNextBtn')?.addEventListener('click', openFinalModal);
    $('backupFinalConfirmBtn')?.addEventListener('click', confirmDelete);
    $('backupImportConfirmBtn')?.addEventListener('click', confirmImport);
    $('backupDeletePassword')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') openFinalModal();
    });
    $('backupImportPassword')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') confirmImport();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const importModal = $('backupImportModal');
      const finalModal = $('backupFinalModal');
      const deleteModal = $('backupDeleteModal');
      if (importModal && !importModal.hidden) closeImportModal();
      else if (finalModal && !finalModal.hidden) closeFinalModal();
      else if (deleteModal && !deleteModal.hidden) closeDeleteModal();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    loadTables();
    try { if (window.feather) window.feather.replace(); } catch {}
  });
})();

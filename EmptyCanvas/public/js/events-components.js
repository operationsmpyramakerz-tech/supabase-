(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { components: [], editingId: '', loading: false, query: '' };
  const els = {
    body: $('#eventComponentsTableBody'), total: $('#eventComponentsTotalCount'), active: $('#eventComponentsActiveCount'), inactive: $('#eventComponentsInactiveCount'),
    search: $('#eventComponentsSearchInput'), refresh: $('#eventComponentRefreshBtn'), add: $('#eventComponentAddBtn'),
    modal: $('#eventComponentModal'), form: $('#eventComponentForm'), close: $('#eventComponentModalClose'), cancel: $('#eventComponentModalCancel'), error: $('#eventComponentFormError'),
    title: $('#eventComponentModalTitle'), subtitle: $('#eventComponentModalSubtitle'), save: $('#eventComponentSaveBtn'),
    name: $('#eventComponentName'), category: $('#eventComponentCategory'), quantity: $('#eventComponentDefaultQuantity'), unit: $('#eventComponentUnit'), description: $('#eventComponentDescription'), activeBox: $('#eventComponentActive'),
  };
  const categoryLabels = { project: 'Project Resource', marketing_material: 'Marketing Material', venue_equipment: 'Venue Equipment', other: 'Other' };
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function icons() { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) { try { if (window.UI?.toast) return window.UI.toast(type, title, message); } catch {} if (type === 'error') window.alert(`${title}: ${message}`); }
  function isAdmin() { return !!window.OpsPageAccess?.isAdmin?.(); }
  function formatDate(value) { const d = new Date(value || ''); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  function filtered() { const q = String(state.query || '').trim().toLowerCase(); return state.components.filter((row) => !q || [row.name, row.category, row.description, row.unit].join(' ').toLowerCase().includes(q)); }
  function stats() { const all = state.components || []; if (els.total) els.total.textContent = String(all.length); if (els.active) els.active.textContent = String(all.filter((row) => row.isActive).length); if (els.inactive) els.inactive.textContent = String(all.filter((row) => !row.isActive).length); }
  function render() {
    if (!els.body) return;
    if (state.loading) { els.body.innerHTML = '<tr><td colspan="7"><div class="events-loading"><span></span> Loading event components...</div></td></tr>'; return; }
    const list = filtered();
    if (!list.length) { els.body.innerHTML = '<tr><td colspan="7"><div class="events-empty"><i data-feather="layers"></i><span>No event components found.</span></div></td></tr>'; icons(); return; }
    const admin = isAdmin();
    els.body.innerHTML = list.map((row) => `<tr><td><strong class="events-table-title" title="${escapeHTML(row.name)}">${escapeHTML(row.name)}</strong>${row.description ? `<div class="events-description-cell">${escapeHTML(row.description)}</div>` : ''}</td><td><span class="events-category">${escapeHTML(categoryLabels[row.category] || 'Other')}</span></td><td>${escapeHTML(row.defaultQuantity ?? 1)}</td><td>${escapeHTML(row.unit || 'pcs')}</td><td>${row.isActive ? '<span class="events-status events-status--approved">Active</span>' : '<span class="events-status events-status--cancelled">Inactive</span>'}</td><td>${escapeHTML(formatDate(row.updatedAt || row.createdAt))}</td><td>${admin ? `<div class="events-action-row"><button class="events-action-btn" data-edit-component="${escapeHTML(row.id)}" type="button"><i data-feather="edit-3"></i><span>Edit</span></button><button class="events-action-btn events-action-btn--danger" data-delete-component="${escapeHTML(row.id)}" type="button"><i data-feather="trash-2"></i></button></div>` : '—'}</td></tr>`).join('');
    icons();
  }
  async function load({ silent = false } = {}) {
    if (!silent) { state.loading = true; render(); }
    try {
      const response = await fetch(`/api/events/components?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event components.');
      state.components = Array.isArray(data.components) ? data.components : [];
      state.loading = false; stats(); render();
    } catch (error) {
      state.loading = false;
      if (els.body) els.body.innerHTML = `<tr><td colspan="7"><div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event components.')}</span></div></td></tr>`;
      icons(); toast('error', 'Event Components', error?.message || 'Could not load event components.');
    }
  }
  function syncAdminUi() { if (els.add) els.add.hidden = !isAdmin(); render(); }
  function resetForm(component = null) {
    state.editingId = component?.id || '';
    if (els.title) els.title.textContent = component ? 'Edit Event Component' : 'Add Event Component';
    if (els.subtitle) els.subtitle.textContent = component ? 'Update the reusable catalog record.' : 'Create a reusable item for future event requests.';
    if (els.name) els.name.value = component?.name || '';
    if (els.category) els.category.value = component?.category || 'project';
    if (els.quantity) els.quantity.value = component?.defaultQuantity ?? 1;
    if (els.unit) els.unit.value = component?.unit || 'pcs';
    if (els.description) els.description.value = component?.description || '';
    if (els.activeBox) els.activeBox.checked = component?.isActive !== false;
    if (els.error) els.error.textContent = '';
    if (els.save) { els.save.disabled = false; const label = els.save.querySelector('span'); if (label) label.textContent = component ? 'Save Changes' : 'Save Component'; }
  }
  function openModal(id = '') {
    if (!isAdmin()) { toast('info', 'Event Components', 'Events Admin access is required to manage the catalog.'); return; }
    const component = id ? state.components.find((row) => row.id === id) : null;
    resetForm(component || null); if (els.modal) { els.modal.hidden = false; els.modal.setAttribute('aria-hidden', 'false'); } icons(); setTimeout(() => els.name?.focus(), 20);
  }
  function closeModal() { if (els.modal) { els.modal.hidden = true; els.modal.setAttribute('aria-hidden', 'true'); } }
  async function save(event) {
    event.preventDefault();
    if (!isAdmin()) return;
    const name = String(els.name?.value || '').trim();
    if (!name) { if (els.error) els.error.textContent = 'Component name is required.'; els.name?.focus(); return; }
    const body = { name, category: els.category?.value || 'other', defaultQuantity: Number(els.quantity?.value || 0), unit: String(els.unit?.value || '').trim() || 'pcs', description: String(els.description?.value || '').trim(), isActive: !!els.activeBox?.checked };
    if (els.error) els.error.textContent = '';
    if (els.save) { els.save.disabled = true; const label = els.save.querySelector('span'); if (label) label.textContent = 'Saving...'; }
    try {
      const target = state.editingId ? `/api/events/components/${encodeURIComponent(state.editingId)}` : '/api/events/components';
      const response = await fetch(target, { method: state.editingId ? 'PATCH' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save event component.');
      toast('success', 'Event Components', state.editingId ? 'Component updated.' : 'Component added.'); closeModal(); load({ silent: true });
    } catch (error) {
      if (els.error) els.error.textContent = error?.message || 'Could not save component.';
      if (els.save) { els.save.disabled = false; const label = els.save.querySelector('span'); if (label) label.textContent = state.editingId ? 'Save Changes' : 'Save Component'; }
    }
  }
  async function remove(id) {
    if (!isAdmin() || !id) return;
    const component = state.components.find((row) => row.id === id);
    if (!window.confirm(`Delete “${component?.name || 'this component'}”? Existing event requests will keep their saved snapshot.`)) return;
    try {
      const response = await fetch(`/api/events/components/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to delete event component.');
      toast('success', 'Event Components', 'Component deleted.'); load({ silent: true });
    } catch (error) { toast('error', 'Event Components', error?.message || 'Could not delete component.'); }
  }
  function bind() {
    els.search?.addEventListener('input', (event) => { state.query = event.target.value; render(); });
    els.refresh?.addEventListener('click', () => load()); els.add?.addEventListener('click', () => openModal());
    els.body?.addEventListener('click', (event) => { const edit = event.target.closest('[data-edit-component]'); const del = event.target.closest('[data-delete-component]'); if (edit) openModal(edit.dataset.editComponent); if (del) remove(del.dataset.deleteComponent); });
    els.close?.addEventListener('click', closeModal); els.cancel?.addEventListener('click', closeModal); els.modal?.addEventListener('click', (event) => { if (event.target === els.modal) closeModal(); }); els.form?.addEventListener('submit', save);
    window.addEventListener('ops:userinfo', () => { syncAdminUi(); }); setTimeout(syncAdminUi, 650);
  }
  document.addEventListener('DOMContentLoaded', () => { bind(); icons(); load(); });
})();

(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const state = {
    components: [],
    editingId: '',
    loading: false,
    query: '',
    createAuthorized: false,
  };

  const els = {
    body: $('#eventComponentsTableBody'),
    total: $('#eventComponentsTotalCount'),
    active: $('#eventComponentsActiveCount'),
    inactive: $('#eventComponentsInactiveCount'),
    search: $('#eventComponentsSearchInput'),
    refresh: $('#eventComponentRefreshBtn'),
    add: $('#eventComponentAddBtn'),
    modal: $('#eventComponentModal'),
    form: $('#eventComponentForm'),
    close: $('#eventComponentModalClose'),
    cancel: $('#eventComponentModalCancel'),
    error: $('#eventComponentFormError'),
    title: $('#eventComponentModalTitle'),
    subtitle: $('#eventComponentModalSubtitle'),
    save: $('#eventComponentSaveBtn'),
    name: $('#eventComponentName'),
    category: $('#eventComponentCategory'),
    quantity: $('#eventComponentDefaultQuantity'),
    unit: $('#eventComponentUnit'),
    description: $('#eventComponentDescription'),
    activeBox: $('#eventComponentActive'),
    adminModal: $('#eventComponentAdminModal'),
    adminForm: $('#eventComponentAdminForm'),
    adminClose: $('#eventComponentAdminClose'),
    adminCancel: $('#eventComponentAdminCancel'),
    adminPassword: $('#eventComponentAdminPassword'),
    adminError: $('#eventComponentAdminError'),
    adminConfirm: $('#eventComponentAdminConfirm'),
  };

  const categoryLabels = {
    project: 'Project Resource',
    marketing_material: 'Marketing Material',
    venue_equipment: 'Venue Equipment',
    other: 'Other',
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function icons() {
    try { window.feather?.replace({ width: 16, height: 16 }); } catch {}
  }

  function toast(type, title, message) {
    try {
      if (window.UI?.toast) return window.UI.toast(type, title, message);
    } catch {}
    if (type === 'error') window.alert(`${title}: ${message}`);
  }

  function isAdmin() {
    return !!window.OpsPageAccess?.isAdmin?.();
  }

  function isViewOnly() {
    return !!window.OpsPageAccess?.isViewOnly?.();
  }

  function canCreate() {
    return isAdmin() || state.createAuthorized;
  }

  function formatDate(value) {
    const d = new Date(value || '');
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function filtered() {
    const q = String(state.query || '').trim().toLowerCase();
    return state.components.filter((row) => !q || [row.name, row.category, row.description, row.unit]
      .join(' ')
      .toLowerCase()
      .includes(q));
  }

  function stats() {
    const all = state.components || [];
    if (els.total) els.total.textContent = String(all.length);
    if (els.active) els.active.textContent = String(all.filter((row) => row.isActive).length);
    if (els.inactive) els.inactive.textContent = String(all.filter((row) => !row.isActive).length);
  }

  function render() {
    if (!els.body) return;
    if (state.loading) {
      els.body.innerHTML = '<tr><td colspan="7"><div class="events-loading"><span></span> Loading event components...</div></td></tr>';
      return;
    }

    const list = filtered();
    if (!list.length) {
      els.body.innerHTML = '<tr><td colspan="7"><div class="events-empty"><i data-feather="layers"></i><span>No event components found.</span></div></td></tr>';
      icons();
      return;
    }

    const admin = isAdmin();
    els.body.innerHTML = list.map((row) => `
      <tr>
        <td>
          <strong class="events-table-title" title="${escapeHTML(row.name)}">${escapeHTML(row.name)}</strong>
          ${row.description ? `<div class="events-description-cell">${escapeHTML(row.description)}</div>` : ''}
        </td>
        <td><span class="events-category">${escapeHTML(categoryLabels[row.category] || 'Other')}</span></td>
        <td>${escapeHTML(row.defaultQuantity ?? 1)}</td>
        <td>${escapeHTML(row.unit || 'pcs')}</td>
        <td>${row.isActive ? '<span class="events-status events-status--approved">Active</span>' : '<span class="events-status events-status--cancelled">Inactive</span>'}</td>
        <td>${escapeHTML(formatDate(row.updatedAt || row.createdAt))}</td>
        <td>${admin ? `<div class="events-action-row"><button class="events-action-btn" data-edit-component="${escapeHTML(row.id)}" type="button"><i data-feather="edit-3"></i><span>Edit</span></button><button class="events-action-btn events-action-btn--danger" data-delete-component="${escapeHTML(row.id)}" type="button"><i data-feather="trash-2"></i></button></div>` : '—'}</td>
      </tr>
    `).join('');
    icons();
  }

  async function load({ silent = false } = {}) {
    if (!silent) {
      state.loading = true;
      render();
    }

    try {
      const response = await fetch(`/api/events/components?_ts=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event components.');
      state.components = Array.isArray(data.components) ? data.components : [];
      state.loading = false;
      stats();
      render();
    } catch (error) {
      state.loading = false;
      if (els.body) {
        els.body.innerHTML = `<tr><td colspan="7"><div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event components.')}</span></div></td></tr>`;
      }
      icons();
      toast('error', 'Event Components', error?.message || 'Could not load event components.');
    }
  }

  function syncAdminUi() {
    // Edit access can request one-time Admin authorization to add a component.
    // View-only users remain read-only and never see the action.
    if (els.add) els.add.hidden = isViewOnly();
    render();
  }

  function resetForm(component = null) {
    state.editingId = component?.id || '';
    if (els.title) els.title.textContent = component ? 'Edit Event Component' : 'Add Event Component';
    if (els.subtitle) {
      els.subtitle.textContent = component
        ? 'Update the reusable catalog record.'
        : 'Create a reusable item for future event requests.';
    }
    if (els.name) els.name.value = component?.name || '';
    if (els.category) els.category.value = component?.category || 'project';
    if (els.quantity) els.quantity.value = component?.defaultQuantity ?? 1;
    if (els.unit) els.unit.value = component?.unit || 'pcs';
    if (els.description) els.description.value = component?.description || '';
    if (els.activeBox) els.activeBox.checked = component?.isActive !== false;
    if (els.error) els.error.textContent = '';
    if (els.save) {
      els.save.disabled = false;
      const label = els.save.querySelector('span');
      if (label) label.textContent = component ? 'Save Changes' : 'Save Component';
    }
  }

  function openComponentModal(id = '') {
    const component = id ? state.components.find((row) => row.id === id) : null;
    const editing = !!id;

    if (editing && !isAdmin()) {
      toast('info', 'Event Components', 'Events Admin access is required to edit catalog records.');
      return;
    }

    if (!editing) {
      requestCreateAuthorization();
      return;
    }

    resetForm(component || null);
    if (els.modal) {
      els.modal.hidden = false;
      els.modal.setAttribute('aria-hidden', 'false');
    }
    icons();
    window.setTimeout(() => els.name?.focus(), 20);
  }

  function closeComponentModal() {
    if (els.modal) {
      els.modal.hidden = true;
      els.modal.setAttribute('aria-hidden', 'true');
    }
  }

  function resetAdminAuthorizationForm() {
    if (els.adminPassword) els.adminPassword.value = '';
    if (els.adminError) els.adminError.textContent = '';
    if (els.adminConfirm) {
      els.adminConfirm.disabled = false;
      const label = els.adminConfirm.querySelector('span');
      if (label) label.textContent = 'Authorize & Continue';
    }
  }

  function openAdminAuthorizationModal() {
    resetAdminAuthorizationForm();
    if (els.adminModal) {
      els.adminModal.hidden = false;
      els.adminModal.setAttribute('aria-hidden', 'false');
    }
    icons();
    window.setTimeout(() => els.adminPassword?.focus(), 20);
  }

  function closeAdminAuthorizationModal() {
    if (els.adminModal) {
      els.adminModal.hidden = true;
      els.adminModal.setAttribute('aria-hidden', 'true');
    }
  }

  function requestCreateAuthorization() {
    if (isViewOnly()) {
      try { window.OpsPageAccess?.showViewOnlyNotice?.(); } catch {}
      return;
    }
    if (isAdmin() || state.createAuthorized) {
      window.location.assign('/events/components/new');
      return;
    }
    openAdminAuthorizationModal();
  }

  async function authorizeCreate(event) {
    event.preventDefault();

    if (isAdmin()) {
      closeAdminAuthorizationModal();
      state.createAuthorized = true;
      window.location.assign('/events/components/new');
      return;
    }

    const password = String(els.adminPassword?.value || '').trim();
    if (!password) {
      if (els.adminError) els.adminError.textContent = 'Please enter the Admin password.';
      els.adminPassword?.focus();
      return;
    }

    if (els.adminError) els.adminError.textContent = '';
    if (els.adminConfirm) {
      els.adminConfirm.disabled = true;
      const label = els.adminConfirm.querySelector('span');
      if (label) label.textContent = 'Authorizing...';
    }

    try {
      const response = await fetch('/api/events/admin/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Invalid Admin password.');
      state.createAuthorized = true;
      closeAdminAuthorizationModal();
      window.location.assign('/events/components/new');
    } catch (error) {
      if (els.adminError) els.adminError.textContent = error?.message || 'Invalid Admin password.';
      if (els.adminConfirm) {
        els.adminConfirm.disabled = false;
        const label = els.adminConfirm.querySelector('span');
        if (label) label.textContent = 'Authorize & Continue';
      }
      els.adminPassword?.focus();
    }
  }

  async function save(event) {
    event.preventDefault();
    const editing = !!state.editingId;

    if ((editing && !isAdmin()) || (!editing && !canCreate())) {
      if (els.error) {
        els.error.textContent = editing
          ? 'Events Admin access is required to edit catalog records.'
          : 'Admin authorization is required before adding a component.';
      }
      return;
    }

    const name = String(els.name?.value || '').trim();
    if (!name) {
      if (els.error) els.error.textContent = 'Component name is required.';
      els.name?.focus();
      return;
    }

    const body = {
      name,
      category: els.category?.value || 'other',
      defaultQuantity: Number(els.quantity?.value || 0),
      unit: String(els.unit?.value || '').trim() || 'pcs',
      description: String(els.description?.value || '').trim(),
      isActive: !!els.activeBox?.checked,
    };

    if (els.error) els.error.textContent = '';
    if (els.save) {
      els.save.disabled = true;
      const label = els.save.querySelector('span');
      if (label) label.textContent = 'Saving...';
    }

    try {
      const target = editing
        ? `/api/events/components/${encodeURIComponent(state.editingId)}`
        : '/api/events/components';
      const response = await fetch(target, {
        method: editing ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save event component.');

      // A non-admin approval is intentionally single-use for one new component.
      if (!editing && !isAdmin()) state.createAuthorized = false;
      toast('success', 'Event Components', editing ? 'Component updated.' : 'Component added.');
      closeComponentModal();
      load({ silent: true });
    } catch (error) {
      if (els.error) els.error.textContent = error?.message || 'Could not save component.';
      if (!editing && /authorization|required|admin/i.test(String(error?.message || ''))) {
        state.createAuthorized = false;
      }
      if (els.save) {
        els.save.disabled = false;
        const label = els.save.querySelector('span');
        if (label) label.textContent = editing ? 'Save Changes' : 'Save Component';
      }
    }
  }

  async function remove(id) {
    if (!isAdmin() || !id) return;
    const component = state.components.find((row) => row.id === id);
    if (!window.confirm(`Delete “${component?.name || 'this component'}”? Existing event requests will keep their saved snapshot.`)) return;

    try {
      const response = await fetch(`/api/events/components/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to delete event component.');
      toast('success', 'Event Components', 'Component deleted.');
      load({ silent: true });
    } catch (error) {
      toast('error', 'Event Components', error?.message || 'Could not delete component.');
    }
  }

  function bind() {
    els.search?.addEventListener('input', (event) => {
      state.query = event.target.value;
      render();
    });
    els.refresh?.addEventListener('click', () => load());
    els.add?.addEventListener('click', requestCreateAuthorization);

    els.body?.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-component]');
      const del = event.target.closest('[data-delete-component]');
      if (edit) openComponentModal(edit.dataset.editComponent);
      if (del) remove(del.dataset.deleteComponent);
    });

    els.close?.addEventListener('click', closeComponentModal);
    els.cancel?.addEventListener('click', closeComponentModal);
    els.modal?.addEventListener('click', (event) => {
      if (event.target === els.modal) closeComponentModal();
    });
    els.form?.addEventListener('submit', save);

    els.adminClose?.addEventListener('click', closeAdminAuthorizationModal);
    els.adminCancel?.addEventListener('click', closeAdminAuthorizationModal);
    els.adminModal?.addEventListener('click', (event) => {
      if (event.target === els.adminModal) closeAdminAuthorizationModal();
    });
    els.adminForm?.addEventListener('submit', authorizeCreate);

    window.addEventListener('ops:userinfo', syncAdminUi);
    window.setTimeout(syncAdminUi, 650);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    icons();
    load();
  });
})();

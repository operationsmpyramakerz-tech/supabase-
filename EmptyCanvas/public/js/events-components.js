(() => {
  'use strict';

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = {
    components: [],
    editingId: '',
    loading: false,
    query: '',
    createAuthorized: false,
    photoDataUrl: '',
    photoFileName: '',
  };

  const els = {
    body: $('#eventComponentsTableBody'),
    total: $('#eventComponentsTotalCount'),
    active: $('#eventComponentsActiveCount'),
    inactive: $('#eventComponentsInactiveCount'),
    search: $('#eventComponentsSearchInput'),
    add: $('#eventComponentAddBtn'),
    modal: $('#eventComponentModal'),
    form: $('#eventComponentForm'),
    close: $('#eventComponentModalClose'),
    cancel: $('#eventComponentModalCancel'),
    error: $('#eventComponentFormError'),
    title: $('#eventComponentModalTitle'),
    save: $('#eventComponentSaveBtn'),
    name: $('#eventComponentName'),
    category: $('#eventComponentCategory'),
    quantity: $('#eventComponentDefaultQuantity'),
    photo: $('#eventComponentPhoto'),
    photoPreview: $('#eventComponentPhotoPreview'),
    link: $('#eventComponentLink'),
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

  function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return /^https?:$/i.test(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function safeImageSource(value) {
    const raw = String(value || '').trim();
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(raw)) return raw;
    return safeHttpUrl(raw);
  }

  function icons() {
    try { window.feather?.replace({ width: 16, height: 16 }); } catch {}
  }

  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast(type, title, message); } catch {}
    if (type === 'error') window.alert(`${title}: ${message}`);
  }

  function isAdmin() {
    return !!window.OpsPageAccess?.isAdmin?.();
  }

  function isViewOnly() {
    return !!window.OpsPageAccess?.isViewOnly?.();
  }

  function formatDate(value) {
    const d = new Date(value || '');
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function filtered() {
    const q = String(state.query || '').trim().toLowerCase();
    return state.components.filter((row) => !q || [row.name, row.category, row.description, row.linkUrl]
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

  function mediaCell(row) {
    const photoUrl = safeHttpUrl(row?.photoUrl);
    const linkUrl = safeHttpUrl(row?.linkUrl);
    if (!photoUrl && !linkUrl) return '<span class="events-media-empty">—</span>';
    return `<div class="events-component-media">${photoUrl ? `<a class="events-component-media__photo" href="${escapeHTML(photoUrl)}" target="_blank" rel="noopener" title="Open component photo"><img src="${escapeHTML(photoUrl)}" alt="${escapeHTML(row?.name || 'Component')} photo" loading="lazy" /></a>` : ''}${linkUrl ? `<a class="events-component-media__link" href="${escapeHTML(linkUrl)}" target="_blank" rel="noopener"><i data-feather="external-link"></i><span>Link</span></a>` : ''}</div>`;
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
        <td>${mediaCell(row)}</td>
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
    if (els.add) els.add.hidden = isViewOnly();
    render();
  }

  function closeAllModernSelects(except = null) {
    document.querySelectorAll('[data-events-modern-select]').forEach((root) => {
      if (root === except) return;
      root.classList.remove('is-open');
      const trigger = $('.events-modern-select__trigger', root);
      const menu = $('.events-modern-select__menu', root);
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (menu) menu.hidden = true;
    });
  }

  function setModernSelectValue(input, value) {
    if (!input) return;
    const root = input.closest('[data-events-modern-select]');
    if (!root) { input.value = value; return; }
    const option = Array.from(root.querySelectorAll('[data-events-select-option]'))
      .find((item) => item.dataset.value === value) || root.querySelector('[data-events-select-option]');
    if (!option) return;
    input.value = option.dataset.value || 'other';
    const label = $('[data-events-select-label]', root);
    if (label) label.textContent = option.textContent.trim();
    root.querySelectorAll('[data-events-select-option]').forEach((item) => {
      item.classList.toggle('is-selected', item === option);
      item.setAttribute('aria-selected', item === option ? 'true' : 'false');
    });
  }

  function bindModernSelects() {
    document.querySelectorAll('[data-events-modern-select]').forEach((root) => {
      const input = $('input[type="hidden"]', root);
      const trigger = $('.events-modern-select__trigger', root);
      const menu = $('.events-modern-select__menu', root);
      if (!input || !trigger || !menu) return;
      setModernSelectValue(input, input.value || 'project');
      trigger.addEventListener('click', () => {
        const nextOpen = !root.classList.contains('is-open');
        closeAllModernSelects(root);
        root.classList.toggle('is-open', nextOpen);
        trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        menu.hidden = !nextOpen;
      });
      menu.addEventListener('click', (event) => {
        const option = event.target.closest('[data-events-select-option]');
        if (!option) return;
        setModernSelectValue(input, option.dataset.value || 'other');
        closeAllModernSelects();
      });
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-events-modern-select]')) closeAllModernSelects();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllModernSelects();
    });
  }

  function renderPhotoPreview(source = '', emptyText = 'No photo selected') {
    if (!els.photoPreview) return;
    const url = safeImageSource(source);
    els.photoPreview.innerHTML = url
      ? `<img src="${escapeHTML(url)}" alt="Component photo" />`
      : `<span>${escapeHTML(emptyText)}</span>`;
  }

  function handlePhotoChange() {
    const file = els.photo?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(String(file.type || ''))) {
      if (els.error) els.error.textContent = 'Please choose a PNG, JPG, WEBP, or GIF image.';
      if (els.photo) els.photo.value = '';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      if (els.error) els.error.textContent = 'Photo size must be 8 MB or less.';
      if (els.photo) els.photo.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      state.photoDataUrl = String(reader.result || '');
      state.photoFileName = String(file.name || 'component-photo');
      if (els.error) els.error.textContent = '';
      renderPhotoPreview(state.photoDataUrl);
    });
    reader.addEventListener('error', () => {
      if (els.error) els.error.textContent = 'Could not read the selected photo.';
    });
    reader.readAsDataURL(file);
  }

  function resetForm(component = null) {
    state.editingId = component?.id || '';
    state.photoDataUrl = '';
    state.photoFileName = '';
    if (els.title) els.title.textContent = component ? 'Edit Event Component' : 'Add Event Component';
    if (els.name) els.name.value = component?.name || '';
    setModernSelectValue(els.category, component?.category || 'project');
    if (els.quantity) els.quantity.value = component?.defaultQuantity ?? 1;
    if (els.photo) els.photo.value = '';
    renderPhotoPreview(component?.photoUrl || '', component?.photoUrl ? 'No photo selected' : 'No photo selected');
    if (els.link) els.link.value = component?.linkUrl || '';
    if (els.description) els.description.value = component?.description || '';
    if (els.activeBox) els.activeBox.checked = component?.isActive !== false;
    if (els.error) els.error.textContent = '';
    if (els.save) {
      els.save.disabled = false;
      const label = els.save.querySelector('span');
      if (label) label.textContent = component ? 'Save Changes' : 'Save Component';
    }
  }

  function openComponentModal(id) {
    const component = state.components.find((row) => row.id === id);
    if (!component || !isAdmin()) {
      toast('info', 'Event Components', 'Events Admin access is required to edit catalog records.');
      return;
    }
    resetForm(component);
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
    closeAllModernSelects();
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
    if (!isAdmin() || !state.editingId) {
      if (els.error) els.error.textContent = 'Events Admin access is required to edit catalog records.';
      return;
    }
    const name = String(els.name?.value || '').trim();
    if (!name) {
      if (els.error) els.error.textContent = 'Component name is required.';
      els.name?.focus();
      return;
    }
    const link = String(els.link?.value || '').trim();
    if (link && !safeHttpUrl(link)) {
      if (els.error) els.error.textContent = 'Link must start with http:// or https://.';
      els.link?.focus();
      return;
    }
    const body = {
      name,
      category: els.category?.value || 'other',
      defaultQuantity: Number(els.quantity?.value || 0),
      photoDataUrl: state.photoDataUrl || '',
      photoFileName: state.photoFileName || '',
      linkUrl: link,
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
      const response = await fetch(`/api/events/components/${encodeURIComponent(state.editingId)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update event component.');
      toast('success', 'Event Components', 'Component updated.');
      closeComponentModal();
      load({ silent: true });
    } catch (error) {
      if (els.error) els.error.textContent = error?.message || 'Could not save component.';
      if (els.save) {
        els.save.disabled = false;
        const label = els.save.querySelector('span');
        if (label) label.textContent = 'Save Changes';
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
    els.photo?.addEventListener('change', handlePhotoChange);
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
    bindModernSelects();
    bind();
    icons();
    load();
  });
})();

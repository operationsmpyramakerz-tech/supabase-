(() => {
  'use strict';

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const STANDARD_CATEGORIES = [
    { code: 'project', label: 'Project Resource' },
    { code: 'marketing_material', label: 'Marketing Material' },
    { code: 'venue_equipment', label: 'Venue Equipment' },
  ];
  const BASE_CATEGORY_LABELS = { project: 'Project Resource', marketing_material: 'Marketing Material', venue_equipment: 'Venue Equipment', other: 'Other' };
  const OWNERSHIP_LABELS = { company_owned: 'Company Owned', external_rental: 'External Rental' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = {
    components: [],
    categories: [...STANDARD_CATEGORIES],
    editingId: '',
    loading: false,
    query: '',
    category: 'all',
    statusFilter: 'all',
    createAuthorized: false,
    editAuthorized: false,
    pendingEditId: '',
    authorizationIntent: 'create',
    photoDataUrl: '',
    photoFileName: '',
  };
  const els = {
    cards: $('#eventComponentsCards'),
    search: $('#eventComponentsSearchInput'),
    add: $('#eventComponentAddBtn'),
    categoryTabs: Array.from(document.querySelectorAll('[data-component-category-tab]')),
    statusFilter: $('#eventComponentsStatusFilter'),
    statusFilterBtn: $('#eventComponentsStatusFilterBtn'),
    statusFilterPanel: $('#eventComponentsStatusFilterPanel'),
    statusFilterDot: $('#eventComponentsStatusFilterDot'),
    modal: $('#eventComponentModal'),
    form: $('#eventComponentForm'),
    close: $('#eventComponentModalClose'),
    cancel: $('#eventComponentModalCancel'),
    error: $('#eventComponentFormError'),
    title: $('#eventComponentModalTitle'),
    save: $('#eventComponentSaveBtn'),
    name: $('#eventComponentName'),
    category: $('#eventComponentCategory'),
    categoryCustom: $('#eventComponentCategoryCustom'),
    categoryMenu: $('#eventComponentCategoryMenu'),
    quantity: $('#eventComponentDefaultQuantity'),
    ownership: $('#eventComponentOwnership'),
    operatingCost: $('#eventComponentOperatingCost'),
    rentalCost: $('#eventComponentRentalCost'),
    rentalCostField: $('[data-rental-cost-field]'),
    costPreview: $('#eventComponentCostPreview'),
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

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
  function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try { const url = new URL(raw); return /^https?:$/i.test(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  function safeImageSource(value) {
    const raw = String(value || '').trim();
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(raw)) return raw;
    return safeHttpUrl(raw);
  }
  function icons() { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast({ type, title, message, duration: 6000 }); } catch {}
    if (type === 'error') window.alert(`${title}: ${message}`);
  }
  function isAdmin() { return !!window.OpsPageAccess?.isAdmin?.(); }
  function isViewOnly() { return !!window.OpsPageAccess?.isViewOnly?.(); }
  function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(number) ? Math.max(0, number) : 0);
  }
  function costValue(input) { return Math.max(0, Number(input?.value || 0) || 0); }
  function ownershipType(row) { return row?.ownershipType === 'external_rental' ? 'external_rental' : 'company_owned'; }
  function costSummary(row) {
    const operating = Math.max(0, Number(row?.operatingCost || 0) || 0);
    const rental = ownershipType(row) === 'external_rental' ? Math.max(0, Number(row?.rentalCost || 0) || 0) : 0;
    return { operating, rental, unit: operating + rental };
  }
  function normalizeCategoryOptions(value) {
    const source = Array.isArray(value) ? value : [];
    const merged = [...STANDARD_CATEGORIES];
    const seen = new Set(merged.map((item) => item.code));
    source.forEach((item) => {
      const code = String(item?.code || '').trim();
      const label = String(item?.label || '').trim();
      if (!/^custom_[a-z0-9_]{1,64}$/i.test(code) || !label || seen.has(code)) return;
      seen.add(code);
      merged.push({ code, label, isCustom: true });
    });
    return merged;
  }
  function categoryLabel(value) {
    const code = String(value || 'other');
    return state.categories.find((item) => item.code === code)?.label || BASE_CATEGORY_LABELS[code] || 'Other';
  }
  function isOtherBucket(value) {
    const code = String(value || 'other');
    return code === 'other' || /^custom_/i.test(code);
  }
  function currentCategoryMatches(row) {
    const rowCategory = String(row?.category || 'other');
    if (state.category === 'all') return true;
    if (state.category === 'other') return isOtherBucket(rowCategory);
    return rowCategory === state.category;
  }

  function filtered() {
    const q = String(state.query || '').trim().toLowerCase();
    const status = String(state.statusFilter || 'all');
    return state.components.filter((row) => {
      const active = row?.isActive !== false;
      if (!currentCategoryMatches(row)) return false;
      if (status === 'active' && !active) return false;
      if (status === 'inactive' && active) return false;
      if (!q) return true;
      return [row.name, categoryLabel(row.category), row.description, row.linkUrl, OWNERSHIP_LABELS[ownershipType(row)]].join(' ').toLowerCase().includes(q);
    });
  }
  function renderCategoryTabs() {
    els.categoryTabs.forEach((tab) => {
      const active = tab.dataset.componentCategoryTab === state.category;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }
  function closeStatusFilter() {
    if (!els.statusFilterPanel) return;
    els.statusFilterPanel.hidden = true;
    els.statusFilter?.classList.remove('is-open');
    els.statusFilterBtn?.setAttribute('aria-expanded', 'false');
  }
  function renderStatusFilter() {
    if (!els.statusFilterPanel || !els.statusFilter) return;
    const all = state.components || [];
    const options = [
      { key: 'all', label: 'All statuses', icon: 'layers', count: all.length },
      { key: 'active', label: 'Active', icon: 'check-circle', count: all.filter((row) => row?.isActive !== false).length },
      { key: 'inactive', label: 'Inactive', icon: 'x-circle', count: all.filter((row) => row?.isActive === false).length },
    ];
    if (!options.some((option) => option.key === state.statusFilter)) state.statusFilter = 'all';
    const isFiltered = state.statusFilter !== 'all';
    els.statusFilter.classList.toggle('is-filtered', isFiltered);
    if (els.statusFilterDot) els.statusFilterDot.hidden = !isFiltered;
    els.statusFilterPanel.innerHTML = `<div class="orders-type-filter__panel-head"><div class="orders-type-filter__panel-title">Filter by status</div><div class="orders-type-filter__panel-sub">${escapeHTML(`${all.length} component${all.length === 1 ? '' : 's'}`)}</div></div><div class="orders-type-filter__options">${options.map((option) => `<button type="button" class="orders-type-filter__option${option.key === state.statusFilter ? ' is-active' : ''}" role="menuitemradio" aria-checked="${option.key === state.statusFilter ? 'true' : 'false'}" data-component-status-filter="${escapeHTML(option.key)}"><span class="orders-type-filter__option-icon"><i data-feather="${escapeHTML(option.icon)}"></i></span><span class="orders-type-filter__option-body"><span class="orders-type-filter__option-title">${escapeHTML(option.label)}</span><span class="orders-type-filter__option-sub">${escapeHTML(`${option.count} component${option.count === 1 ? '' : 's'}`)}</span></span><span class="orders-type-filter__option-check"><i data-feather="check"></i></span></button>`).join('')}</div>`;
    icons();
  }
  function componentCardMarkup(row, canEdit, admin) {
    const photoUrl = safeImageSource(row?.photoUrl);
    const linkUrl = safeHttpUrl(row?.linkUrl);
    const costs = costSummary(row);
    const type = ownershipType(row);
    const active = row.isActive !== false;
    const costBreakdown = type === 'external_rental'
      ? `<span>Rental ${escapeHTML(money(costs.rental))}</span><span>Operating ${escapeHTML(money(costs.operating))}</span>`
      : `<span>Operating ${escapeHTML(money(costs.operating))}</span>`;
    return `<article class="events-component-card ${active ? '' : 'is-inactive'}">
      <div class="events-component-card__top"><span class="events-component-badge"><i data-feather="layers"></i>${escapeHTML(categoryLabel(row.category))}</span>${active ? '<span class="events-status events-status--approved">Active</span>' : '<span class="events-status events-status--cancelled">Inactive</span>'}</div>
      <div class="events-component-card__photo">${photoUrl ? `<img src="${escapeHTML(photoUrl)}" alt="${escapeHTML(row.name || 'Component')} photo" loading="lazy" />` : '<i data-feather="box"></i>'}</div>
      <div class="events-component-card__body"><h3 title="${escapeHTML(row.name)}">${escapeHTML(row.name || 'Untitled component')}</h3><p>${escapeHTML(row.description || 'No description added yet.')}</p></div>
      <div class="events-component-card__meta"><div><span>Source type</span><strong>${escapeHTML(OWNERSHIP_LABELS[type])}</strong></div><div><span>Default qty.</span><strong>${escapeHTML(row.defaultQuantity ?? 1)}</strong></div></div>
      <div class="events-component-card__cost"><div><span>Event cost / unit</span><strong>${escapeHTML(money(costs.unit))}</strong></div><div class="events-component-card__cost-breakdown">${costBreakdown}</div></div>
      <div class="events-component-card__footer"><div>${linkUrl ? `<a class="events-component-card__link" href="${escapeHTML(linkUrl)}" target="_blank" rel="noopener noreferrer"><i data-feather="external-link"></i><span>Open Link</span></a>` : '<span class="events-component-card__no-link">No link</span>'}</div>${canEdit ? `<div class="events-component-card__actions"><button class="events-action-btn" data-edit-component="${escapeHTML(row.id)}" type="button"><i data-feather="edit-3"></i><span>Edit</span></button>${admin ? `<button class="events-action-btn events-action-btn--danger" data-delete-component="${escapeHTML(row.id)}" type="button" aria-label="Delete component"><i data-feather="trash-2"></i></button>` : ''}</div>` : ''}</div>
    </article>`;
  }
  function render() {
    if (!els.cards) return;
    if (state.loading) { els.cards.innerHTML = '<div class="events-loading"><span></span> Loading event components...</div>'; return; }
    const list = filtered();
    if (!list.length) {
      els.cards.innerHTML = '<div class="events-empty events-component-cards__empty"><i data-feather="layers"></i><span>No event components match this view.</span></div>';
      icons();
      return;
    }
    const admin = isAdmin();
    const canEdit = !isViewOnly();
    els.cards.innerHTML = list.map((row) => componentCardMarkup(row, canEdit, admin)).join('');
    icons();
  }
  async function load({ silent = false } = {}) {
    if (!silent) { state.loading = true; render(); }
    try {
      const [componentsResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/events/components?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }),
        fetch(`/api/events/component-categories?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }),
      ]);
      const data = await componentsResponse.json().catch(() => ({}));
      const categoriesData = await categoriesResponse.json().catch(() => ({}));
      if (!componentsResponse.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event components.');
      state.components = Array.isArray(data.components) ? data.components : [];
      state.categories = categoriesResponse.ok && categoriesData?.ok !== false ? normalizeCategoryOptions(categoriesData?.categories) : [...STANDARD_CATEGORIES];
      state.loading = false;
      renderCategoryTabs();
      renderStatusFilter();
      renderCategoryOptions();
      render();
    } catch (error) {
      state.loading = false;
      if (els.cards) els.cards.innerHTML = `<div class="events-empty events-component-cards__empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event components.')}</span></div>`;
      icons();
      toast('error', 'Event Components', error?.message || 'Could not load event components.');
    }
  }
  function syncAdminUi() { if (els.add) els.add.hidden = isViewOnly(); render(); }

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
  function syncOwnershipFields() {
    const external = els.ownership?.value === 'external_rental';
    if (els.rentalCostField) els.rentalCostField.hidden = !external;
    if (els.rentalCost) els.rentalCost.disabled = !external;
    const operating = costValue(els.operatingCost);
    const rental = external ? costValue(els.rentalCost) : 0;
    const total = operating + rental;
    if (els.costPreview) els.costPreview.innerHTML = `<span>Estimated Cost Per Unit</span><strong>${escapeHTML(money(total))}</strong><small>${external ? `Rental ${escapeHTML(money(rental))} + operating ${escapeHTML(money(operating))}` : `Operating cost ${escapeHTML(money(operating))}`}</small>`;
  }
  function optionFor(input, value) {
    const root = input?.closest('[data-events-modern-select]');
    return root ? Array.from(root.querySelectorAll('[data-events-select-option]')).find((item) => item.dataset.value === value) : null;
  }
  function setModernSelectValue(input, value) {
    if (!input) return;
    const root = input.closest('[data-events-modern-select]');
    if (!root) { input.value = value; return; }
    const option = optionFor(input, value) || root.querySelector('[data-events-select-option]');
    if (!option) return;
    input.value = option.dataset.value || 'other';
    const label = $('[data-events-select-label]', root);
    if (label) label.textContent = option.textContent.trim();
    root.querySelectorAll('[data-events-select-option]').forEach((item) => {
      const selected = item === option;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    if (input.id === 'eventComponentOwnership') syncOwnershipFields();
  }
  function renderCategoryOptions({ preserveValue = true } = {}) {
    if (!els.categoryMenu) return;
    const oldValue = preserveValue ? String(els.category?.value || 'project') : 'project';
    const choices = state.categories.map((item) => `<button class="events-modern-select__option" type="button" data-events-select-option data-value="${escapeHTML(item.code)}">${escapeHTML(item.label)}</button>`).join('');
    els.categoryMenu.innerHTML = `${choices}<button class="events-modern-select__option" type="button" data-events-select-option data-value="other">Other</button><div class="events-modern-select__custom" data-component-category-custom-editor hidden><label>New component category<input type="text" maxlength="80" placeholder="Example: Safety Equipment" data-component-category-custom-input /></label><button type="button" data-component-category-custom-save><i data-feather="plus"></i><span>Save category</span></button><small>Saved categories are available for future event components.</small></div>`;
    const hasValue = Array.from(els.categoryMenu.querySelectorAll('[data-events-select-option]')).some((item) => item.dataset.value === oldValue);
    setModernSelectValue(els.category, hasValue ? oldValue : 'project');
    icons();
  }
  async function saveCustomCategory(editor) {
    const input = $('[data-component-category-custom-input]', editor);
    const saveBtn = $('[data-component-category-custom-save]', editor);
    const label = String(input?.value || '').trim();
    if (!label) { toast('info', 'Component Category', 'Enter a name for the new component category.'); input?.focus(); return; }
    if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.add('is-loading'); }
    try {
      const response = await fetch('/api/events/component-categories', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, componentId: state.editingId || '' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not save the component category.');
      state.categories = normalizeCategoryOptions(data?.categories?.length ? data.categories : [...state.categories, data?.category]);
      renderCategoryOptions({ preserveValue: false });
      if (els.category) setModernSelectValue(els.category, data?.category?.code || 'other');
      closeAllModernSelects();
      toast('success', 'Component Category', 'The new category was saved and selected.');
    } catch (error) {
      if (els.error) els.error.textContent = error?.message || 'Could not save component category.';
      input?.focus();
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove('is-loading'); }
    }
  }
  function bindModernSelects() {
    document.addEventListener('click', (event) => {
      const customSave = event.target.closest('[data-component-category-custom-save]');
      if (customSave) { event.preventDefault(); saveCustomCategory(customSave.closest('[data-component-category-custom-editor]')); return; }
      const option = event.target.closest('[data-events-select-option]');
      if (option) {
        const root = option.closest('[data-events-modern-select]');
        const input = root ? $('input[type="hidden"]', root) : null;
        if (input && !option.disabled) setModernSelectValue(input, option.dataset.value || '');
        const isOther = input?.id === 'eventComponentCategory' && option.dataset.value === 'other';
        if (isOther) { root?.classList.add('is-open'); return; }
        closeAllModernSelects();
        return;
      }
      const trigger = event.target.closest('.events-modern-select__trigger');
      if (trigger) {
        const root = trigger.closest('[data-events-modern-select]');
        if (!root) return;
        const nextOpen = !root.classList.contains('is-open');
        closeAllModernSelects(root);
        root.classList.toggle('is-open', nextOpen);
        trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        const menu = $('.events-modern-select__menu', root);
        if (menu) menu.hidden = !nextOpen;
        return;
      }
      if (!event.target.closest('[data-events-modern-select]')) closeAllModernSelects();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllModernSelects();
      if (event.key === 'Enter' && event.target.matches?.('[data-component-category-custom-input]')) {
        event.preventDefault();
        saveCustomCategory(event.target.closest('[data-component-category-custom-editor]'));
      }
    });
  }
  function renderPhotoPreview(source = '', emptyText = 'No photo selected') {
    if (!els.photoPreview) return;
    const url = safeImageSource(source);
    els.photoPreview.innerHTML = url ? `<img src="${escapeHTML(url)}" alt="Component photo" />` : `<span>${escapeHTML(emptyText)}</span>`;
  }
  function handlePhotoChange() {
    const file = els.photo?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(String(file.type || ''))) { if (els.error) els.error.textContent = 'Please choose a PNG, JPG, WEBP, or GIF image.'; if (els.photo) els.photo.value = ''; return; }
    if (file.size > MAX_PHOTO_BYTES) { if (els.error) els.error.textContent = 'Photo size must be 8 MB or less.'; if (els.photo) els.photo.value = ''; return; }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      state.photoDataUrl = String(reader.result || '');
      state.photoFileName = String(file.name || 'component-photo');
      if (els.error) els.error.textContent = '';
      renderPhotoPreview(state.photoDataUrl);
    });
    reader.addEventListener('error', () => { if (els.error) els.error.textContent = 'Could not read the selected photo.'; });
    reader.readAsDataURL(file);
  }
  function resetForm(component = null) {
    state.editingId = component?.id || '';
    state.photoDataUrl = '';
    state.photoFileName = '';
    if (els.title) els.title.textContent = component ? 'Edit Event Component' : 'Add Event Component';
    if (els.name) els.name.value = component?.name || '';
    renderCategoryOptions({ preserveValue: false });
    setModernSelectValue(els.category, component?.category || 'project');
    if (els.quantity) els.quantity.value = component?.defaultQuantity ?? 1;
    setModernSelectValue(els.ownership, ownershipType(component));
    if (els.operatingCost) els.operatingCost.value = Number(component?.operatingCost || 0);
    if (els.rentalCost) els.rentalCost.value = Number(component?.rentalCost || 0);
    syncOwnershipFields();
    if (els.photo) els.photo.value = '';
    renderPhotoPreview(component?.photoUrl || '');
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
    if (!component) return;
    if (!isAdmin() && !state.editAuthorized) { requestEditAuthorization(id); return; }
    resetForm(component);
    if (els.modal) { els.modal.hidden = false; els.modal.setAttribute('aria-hidden', 'false'); }
    icons();
    window.setTimeout(() => els.name?.focus(), 20);
  }
  function closeComponentModal() {
    if (els.modal) { els.modal.hidden = true; els.modal.setAttribute('aria-hidden', 'true'); }
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
  function openAdminAuthorizationModal(intent = 'create') {
    state.authorizationIntent = intent === 'edit' ? 'edit' : 'create';
    resetAdminAuthorizationForm();
    if (els.adminModal) { els.adminModal.hidden = false; els.adminModal.setAttribute('aria-hidden', 'false'); }
    icons();
    window.setTimeout(() => els.adminPassword?.focus(), 20);
  }
  function closeAdminAuthorizationModal() {
    if (els.adminModal) { els.adminModal.hidden = true; els.adminModal.setAttribute('aria-hidden', 'true'); }
  }
  function requestCreateAuthorization() {
    if (isViewOnly()) { try { window.OpsPageAccess?.showViewOnlyNotice?.(); } catch {} return; }
    if (isAdmin() || state.createAuthorized) { window.location.assign('/events/components/new'); return; }
    openAdminAuthorizationModal('create');
  }
  function requestEditAuthorization(id) {
    if (isViewOnly()) { try { window.OpsPageAccess?.showViewOnlyNotice?.(); } catch {} return; }
    if (!state.components.find((row) => row.id === id)) return;
    if (isAdmin()) { state.editAuthorized = true; openComponentModal(id); return; }
    state.pendingEditId = id;
    state.editAuthorized = false;
    openAdminAuthorizationModal('edit');
  }
  async function authorizeCreate(event) {
    event.preventDefault();
    const intent = state.authorizationIntent === 'edit' ? 'edit' : 'create';
    if (isAdmin()) {
      closeAdminAuthorizationModal();
      if (intent === 'edit') { state.editAuthorized = true; const id = state.pendingEditId; state.pendingEditId = ''; openComponentModal(id); }
      else { state.createAuthorized = true; window.location.assign('/events/components/new'); }
      return;
    }
    const password = String(els.adminPassword?.value || '').trim();
    if (!password) { if (els.adminError) els.adminError.textContent = 'Please enter the Admin password.'; els.adminPassword?.focus(); return; }
    if (intent === 'edit' && !state.pendingEditId) { if (els.adminError) els.adminError.textContent = 'Choose the component to edit again.'; return; }
    if (els.adminError) els.adminError.textContent = '';
    if (els.adminConfirm) { els.adminConfirm.disabled = true; const label = els.adminConfirm.querySelector('span'); if (label) label.textContent = 'Authorizing...'; }
    try {
      const response = await fetch('/api/events/admin/verify', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, intent, componentId: intent === 'edit' ? state.pendingEditId : '' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Invalid Admin password.');
      closeAdminAuthorizationModal();
      if (intent === 'edit') { state.editAuthorized = true; const id = state.pendingEditId; state.pendingEditId = ''; openComponentModal(id); }
      else { state.createAuthorized = true; window.location.assign('/events/components/new'); }
    } catch (error) {
      if (els.adminError) els.adminError.textContent = error?.message || 'Invalid Admin password.';
      if (els.adminConfirm) { els.adminConfirm.disabled = false; const label = els.adminConfirm.querySelector('span'); if (label) label.textContent = 'Authorize & Continue'; }
      els.adminPassword?.focus();
    }
  }
  async function save(event) {
    event.preventDefault();
    if (isViewOnly()) { try { window.OpsPageAccess?.showViewOnlyNotice?.(); } catch {} return; }
    if (!state.editingId || (!isAdmin() && !state.editAuthorized)) { if (els.error) els.error.textContent = 'Admin authorization is required to edit this component.'; return; }
    const name = String(els.name?.value || '').trim();
    if (!name) { if (els.error) els.error.textContent = 'Component name is required.'; els.name?.focus(); return; }
    if (els.category?.value === 'other') { if (els.error) els.error.textContent = 'Choose a saved component category or add a new category under Other.'; return; }
    const link = String(els.link?.value || '').trim();
    if (link && !safeHttpUrl(link)) { if (els.error) els.error.textContent = 'Link must start with http:// or https://.'; els.link?.focus(); return; }
    const ownership = els.ownership?.value === 'external_rental' ? 'external_rental' : 'company_owned';
    const body = {
      name,
      category: els.category?.value || 'other',
      categoryCustom: String(els.categoryCustom?.value || '').trim(),
      defaultQuantity: Number(els.quantity?.value || 0),
      ownershipType: ownership,
      operatingCost: costValue(els.operatingCost),
      rentalCost: ownership === 'external_rental' ? costValue(els.rentalCost) : 0,
      photoDataUrl: state.photoDataUrl || '',
      photoFileName: state.photoFileName || '',
      linkUrl: link,
      description: String(els.description?.value || '').trim(),
      isActive: !!els.activeBox?.checked,
    };
    if (els.error) els.error.textContent = '';
    if (els.save) { els.save.disabled = true; const label = els.save.querySelector('span'); if (label) label.textContent = 'Saving...'; }
    try {
      const response = await fetch(`/api/events/components/${encodeURIComponent(state.editingId)}`, {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update event component.');
      toast('success', 'Event Components', 'Component updated.');
      if (!isAdmin()) state.editAuthorized = false;
      closeComponentModal();
      load({ silent: true });
    } catch (error) {
      if (els.error) els.error.textContent = error?.message || 'Could not save component.';
      if (els.save) { els.save.disabled = false; const label = els.save.querySelector('span'); if (label) label.textContent = 'Save Changes'; }
    }
  }
  async function remove(id) {
    if (!isAdmin() || !id) return;
    const component = state.components.find((row) => row.id === id);
    if (!window.confirm(`Delete “${component?.name || 'this component'}”? Existing event requests will keep their saved snapshot.`)) return;
    try {
      const response = await fetch(`/api/events/components/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to delete component.');
      toast('success', 'Event Components', 'Component deleted.');
      load({ silent: true });
    } catch (error) { toast('error', 'Event Components', error?.message || 'Could not delete component.'); }
  }
  function bind() {
    els.search?.addEventListener('input', (event) => { state.query = event.target.value; render(); });
    els.categoryTabs.forEach((tab) => tab.addEventListener('click', () => {
      state.category = tab.dataset.componentCategoryTab || 'all';
      renderCategoryTabs();
      render();
    }));
    els.statusFilterBtn?.addEventListener('click', () => {
      const shouldOpen = !!els.statusFilterPanel?.hidden;
      if (shouldOpen) {
        renderStatusFilter();
        if (els.statusFilterPanel) els.statusFilterPanel.hidden = false;
        els.statusFilter?.classList.add('is-open');
        els.statusFilterBtn?.setAttribute('aria-expanded', 'true');
      } else closeStatusFilter();
    });
    els.statusFilterPanel?.addEventListener('click', (event) => {
      const option = event.target.closest('[data-component-status-filter]');
      if (!option) return;
      state.statusFilter = option.dataset.componentStatusFilter || 'all';
      renderStatusFilter();
      render();
      closeStatusFilter();
    });
    els.add?.addEventListener('click', requestCreateAuthorization);
    els.cards?.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-component]');
      const del = event.target.closest('[data-delete-component]');
      if (edit) requestEditAuthorization(edit.dataset.editComponent);
      if (del) remove(del.dataset.deleteComponent);
    });
    els.close?.addEventListener('click', closeComponentModal);
    els.cancel?.addEventListener('click', closeComponentModal);
    els.modal?.addEventListener('click', (event) => { if (event.target === els.modal) closeComponentModal(); });
    els.form?.addEventListener('submit', save);
    els.photo?.addEventListener('change', handlePhotoChange);
    [els.operatingCost, els.rentalCost].forEach((input) => input?.addEventListener('input', syncOwnershipFields));
    els.adminClose?.addEventListener('click', closeAdminAuthorizationModal);
    els.adminCancel?.addEventListener('click', closeAdminAuthorizationModal);
    els.adminModal?.addEventListener('click', (event) => { if (event.target === els.adminModal) closeAdminAuthorizationModal(); });
    els.adminForm?.addEventListener('submit', authorizeCreate);
    window.addEventListener('ops:userinfo', syncAdminUi);
    document.addEventListener('click', (event) => { if (els.statusFilter && !els.statusFilter.contains(event.target)) closeStatusFilter(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeStatusFilter(); });
    window.setTimeout(syncAdminUi, 650);
  }
  document.addEventListener('DOMContentLoaded', () => {
    bindModernSelects();
    syncOwnershipFields();
    bind();
    icons();
    load();
  });
})();

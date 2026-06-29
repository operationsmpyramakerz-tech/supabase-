(() => {
  'use strict';

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const STANDARD_CATEGORIES = [
    { code: 'project', label: 'Project Resource' },
    { code: 'marketing_material', label: 'Marketing Material' },
    { code: 'venue_equipment', label: 'Venue Equipment' },
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const els = {
    form: $('#eventComponentCreateForm'),
    error: $('#eventComponentCreateError'),
    submit: $('#eventComponentCreateSubmit'),
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
    active: $('#eventComponentActive'),
  };
  const state = { saving: false, photoDataUrl: '', photoFileName: '', categories: [...STANDARD_CATEGORIES] };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
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
  function icons() { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast({ type, title, message, duration: 6000 }); } catch {}
    if (type === 'error') window.alert(`${title}: ${message}`);
  }
  function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(number) ? Math.max(0, number) : 0);
  }
  function costValue(input) { return Math.max(0, Number(input?.value || 0) || 0); }
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
  function isOtherCategory(value) { return value === 'other'; }

  function setSaving(value) {
    state.saving = !!value;
    if (!els.submit) return;
    els.submit.disabled = state.saving;
    const label = els.submit.querySelector('span');
    if (label) label.textContent = state.saving ? 'Saving...' : 'Save Component';
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
  function syncOwnershipFields() {
    const external = els.ownership?.value === 'external_rental';
    if (els.rentalCostField) els.rentalCostField.hidden = !external;
    if (els.rentalCost) els.rentalCost.disabled = !external;
    const operating = costValue(els.operatingCost);
    const rental = external ? costValue(els.rentalCost) : 0;
    const total = operating + rental;
    if (els.costPreview) {
      els.costPreview.innerHTML = `<span>Estimated Cost Per Unit</span><strong>${escapeHTML(money(total))}</strong><small>${external ? `Rental ${escapeHTML(money(rental))} + operating ${escapeHTML(money(operating))}` : `Operating cost ${escapeHTML(money(operating))}`}</small>`;
    }
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
  async function loadCategories() {
    try {
      const response = await fetch(`/api/events/component-categories?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not load component categories.');
      state.categories = normalizeCategoryOptions(data?.categories);
    } catch (error) {
      state.categories = [...STANDARD_CATEGORIES];
      toast('error', 'Component Categories', error?.message || 'Could not load saved component categories.');
    } finally {
      renderCategoryOptions();
    }
  }
  async function saveCustomCategory(editor) {
    const input = $('[data-component-category-custom-input]', editor);
    const save = $('[data-component-category-custom-save]', editor);
    const label = String(input?.value || '').trim();
    if (!label) { toast('info', 'Component Category', 'Enter a name for the new component category.'); input?.focus(); return; }
    if (save) { save.disabled = true; save.classList.add('is-loading'); }
    try {
      const response = await fetch('/api/events/component-categories', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not save the component category.');
      state.categories = normalizeCategoryOptions(data?.categories?.length ? data.categories : [...state.categories, data?.category]);
      renderCategoryOptions({ preserveValue: false });
      if (els.category) setModernSelectValue(els.category, data?.category?.code || 'other');
      if (els.categoryCustom) els.categoryCustom.value = '';
      closeAllModernSelects();
      toast('success', 'Component Category', 'The new category was saved and selected.');
    } catch (error) {
      toast('error', 'Component Category', error?.message || 'Could not save the component category.');
      input?.focus();
    } finally {
      if (save) { save.disabled = false; save.classList.remove('is-loading'); }
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
    els.photoPreview.innerHTML = url ? `<img src="${escapeHTML(url)}" alt="Selected component photo" />` : `<span>${escapeHTML(emptyText)}</span>`;
  }
  function showPhotoError(message) { if (els.error) els.error.textContent = message; }
  function handlePhotoChange() {
    const file = els.photo?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(String(file.type || ''))) { showPhotoError('Please choose a PNG, JPG, WEBP, or GIF image.'); if (els.photo) els.photo.value = ''; return; }
    if (file.size > MAX_PHOTO_BYTES) { showPhotoError('Photo size must be 8 MB or less.'); if (els.photo) els.photo.value = ''; return; }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      state.photoDataUrl = String(reader.result || '');
      state.photoFileName = String(file.name || 'component-photo');
      if (els.error) els.error.textContent = '';
      renderPhotoPreview(state.photoDataUrl);
    });
    reader.addEventListener('error', () => showPhotoError('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  }
  async function submit(event) {
    event.preventDefault();
    if (state.saving) return;
    if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess?.showViewOnlyNotice?.(); return; }
    const name = String(els.name?.value || '').trim();
    if (!name) { if (els.error) els.error.textContent = 'Component name is required.'; els.name?.focus(); return; }
    if (isOtherCategory(els.category?.value)) { if (els.error) els.error.textContent = 'Choose a saved component category or add a new category under Other.'; return; }
    const link = String(els.link?.value || '').trim();
    if (link && !safeHttpUrl(link)) { if (els.error) els.error.textContent = 'Link must start with http:// or https://.'; els.link?.focus(); return; }
    if (els.error) els.error.textContent = '';
    setSaving(true);
    try {
      const ownershipType = els.ownership?.value === 'external_rental' ? 'external_rental' : 'company_owned';
      const response = await fetch('/api/events/components', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: els.category?.value || 'other',
          categoryCustom: String(els.categoryCustom?.value || '').trim(),
          defaultQuantity: Number(els.quantity?.value || 0),
          ownershipType,
          operatingCost: costValue(els.operatingCost),
          rentalCost: ownershipType === 'external_rental' ? costValue(els.rentalCost) : 0,
          photoDataUrl: state.photoDataUrl || '',
          photoFileName: state.photoFileName || '',
          linkUrl: link,
          description: String(els.description?.value || '').trim(),
          isActive: !!els.active?.checked,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save event component.');
      toast('success', 'Event Components', 'Component added.');
      window.location.assign('/events/components');
    } catch (error) {
      if (els.error) els.error.textContent = error?.message || 'Could not save component.';
      setSaving(false);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindModernSelects();
    syncOwnershipFields();
    els.photo?.addEventListener('change', handlePhotoChange);
    [els.operatingCost, els.rentalCost].forEach((input) => input?.addEventListener('input', syncOwnershipFields));
    els.form?.addEventListener('submit', submit);
    loadCategories();
    icons();
    window.setTimeout(() => els.name?.focus(), 100);
  });
})();

(() => {
  'use strict';

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const $ = (selector, root = document) => root.querySelector(selector);
  const els = {
    form: $('#eventComponentCreateForm'),
    error: $('#eventComponentCreateError'),
    submit: $('#eventComponentCreateSubmit'),
    name: $('#eventComponentName'),
    category: $('#eventComponentCategory'),
    quantity: $('#eventComponentDefaultQuantity'),
    photo: $('#eventComponentPhoto'),
    photoPreview: $('#eventComponentPhotoPreview'),
    link: $('#eventComponentLink'),
    description: $('#eventComponentDescription'),
    active: $('#eventComponentActive'),
  };
  const state = { saving: false, photoDataUrl: '', photoFileName: '' };

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
      ? `<img src="${escapeHTML(url)}" alt="Selected component photo" />`
      : `<span>${escapeHTML(emptyText)}</span>`;
  }

  function showPhotoError(message) {
    if (els.error) els.error.textContent = message;
  }

  function handlePhotoChange() {
    const file = els.photo?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(String(file.type || ''))) {
      showPhotoError('Please choose a PNG, JPG, WEBP, or GIF image.');
      if (els.photo) els.photo.value = '';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      showPhotoError('Photo size must be 8 MB or less.');
      if (els.photo) els.photo.value = '';
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      state.photoDataUrl = String(reader.result || '');
      state.photoFileName = String(file.name || 'component-photo');
      if (els.error) els.error.textContent = '';
      renderPhotoPreview(state.photoDataUrl, 'No photo selected');
    });
    reader.addEventListener('error', () => showPhotoError('Could not read the selected photo.'));
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    if (state.saving) return;
    if (window.OpsPageAccess?.isViewOnly?.()) {
      window.OpsPageAccess?.showViewOnlyNotice?.();
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

    if (els.error) els.error.textContent = '';
    setSaving(true);
    try {
      const response = await fetch('/api/events/components', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: els.category?.value || 'other',
          defaultQuantity: Number(els.quantity?.value || 0),
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
    els.photo?.addEventListener('change', handlePhotoChange);
    els.form?.addEventListener('submit', submit);
    icons();
    window.setTimeout(() => els.name?.focus(), 100);
  });
})();

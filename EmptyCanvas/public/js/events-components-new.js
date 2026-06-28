(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const els = {
    form: $('#eventComponentCreateForm'),
    error: $('#eventComponentCreateError'),
    submit: $('#eventComponentCreateSubmit'),
    name: $('#eventComponentName'),
    category: $('#eventComponentCategory'),
    quantity: $('#eventComponentDefaultQuantity'),
    unit: $('#eventComponentUnit'),
    description: $('#eventComponentDescription'),
    active: $('#eventComponentActive'),
  };
  let saving = false;

  function icons() {
    try { window.feather?.replace({ width: 16, height: 16 }); } catch {}
  }

  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast(type, title, message); } catch {}
    if (type === 'error') window.alert(`${title}: ${message}`);
  }

  function setSaving(value) {
    saving = !!value;
    if (!els.submit) return;
    els.submit.disabled = saving;
    const label = els.submit.querySelector('span');
    if (label) label.textContent = saving ? 'Saving...' : 'Save Component';
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
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
          unit: String(els.unit?.value || '').trim() || 'pcs',
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
    els.form?.addEventListener('submit', submit);
    icons();
    window.setTimeout(() => els.name?.focus(), 100);
  });
})();

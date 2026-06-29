(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { components: [], submitting: false };

  const els = {
    form: $('#eventRequestForm'),
    error: $('#eventRequestFormError'),
    submit: $('#eventRequestSubmit'),
    projects: $('#projectsList'),
    marketing: $('#marketingList'),
    venueReqs: $('#venueRequirementsList'),
    addProject: $('#addProjectRow'),
    addMarketing: $('#addMarketingRow'),
    addVenueReq: $('#addVenueRequirementRow'),
  };

  const field = (id) => $(`#${id}`);

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function icons() {
    try { window.feather?.replace({ width: 16, height: 16 }); } catch {}
  }

  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast(type, title, message); } catch {}
    if (type === 'error') window.alert(`${title}: ${message}`);
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

  function setModernSelectValue(input, value, { dispatch = false } = {}) {
    if (!input) return;
    const root = input.closest('[data-events-modern-select]');
    if (!root) {
      input.value = value;
      if (dispatch) input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    const option = Array.from(root.querySelectorAll('[data-events-select-option]'))
      .find((item) => String(item.dataset.value || '') === String(value || '')) || null;

    input.value = option ? (option.dataset.value || '') : '';
    const label = $('[data-events-select-label]', root);
    if (label) {
      label.textContent = option
        ? option.textContent.trim()
        : (input.dataset.placeholder || 'Select option');
    }

    root.querySelectorAll('[data-events-select-option]').forEach((item) => {
      const selected = item === option;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    if (dispatch) input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function prepareModernSelects(scope = document) {
    scope.querySelectorAll?.('[data-events-modern-select]').forEach((root) => {
      const input = $('input[type="hidden"]', root);
      if (!input || root.dataset.eventsSelectReady === '1') return;
      root.dataset.eventsSelectReady = '1';
      const stored = String(input.value || '').trim();
      setModernSelectValue(input, stored);
    });
  }

  function bindModernSelects() {
    document.addEventListener('click', (event) => {
      const option = event.target.closest('[data-events-select-option]');
      if (option) {
        const root = option.closest('[data-events-modern-select]');
        const input = root ? $('input[type="hidden"]', root) : null;
        if (input) setModernSelectValue(input, option.dataset.value || '', { dispatch: true });
        closeAllModernSelects();
        return;
      }

      const trigger = event.target.closest('.events-modern-select__trigger');
      if (trigger) {
        const root = trigger.closest('[data-events-modern-select]');
        if (!root) return;
        const menu = $('.events-modern-select__menu', root);
        const nextOpen = !root.classList.contains('is-open');
        closeAllModernSelects(root);
        root.classList.toggle('is-open', nextOpen);
        trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        if (menu) menu.hidden = !nextOpen;
        return;
      }

      if (!event.target.closest('[data-events-modern-select]')) closeAllModernSelects();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllModernSelects();
    });
  }

  function componentChoices(selectedId = '') {
    const active = state.components.filter((item) => item.isActive !== false);
    if (!active.length) return '<button class="events-modern-select__option" type="button" disabled>No active event components available</button>';

    return active.map((item) => `<button class="events-modern-select__option ${item.id === selectedId ? 'is-selected' : ''}" type="button" data-events-select-option data-value="${escapeHTML(item.id)}">${escapeHTML(item.name)} <small>· ${escapeHTML(String(item.category || '').replace(/_/g, ' '))}</small></button>`).join('');
  }

  function componentSelectMarkup(selectedId = '') {
    const selected = state.components.find((item) => item.id === selectedId && item.isActive !== false);
    const selectedLabel = selected
      ? `${selected.name} · ${String(selected.category || '').replace(/_/g, ' ')}`
      : 'Select component';

    return `<div class="events-modern-select" data-events-modern-select>
      <input data-component-select data-placeholder="Select component" type="hidden" value="${escapeHTML(selected?.id || '')}" />
      <button class="events-modern-select__trigger" type="button" aria-haspopup="listbox" aria-expanded="false"><span data-events-select-label>${escapeHTML(selectedLabel)}</span><i data-feather="chevron-down"></i></button>
      <div class="events-modern-select__menu events-modern-select__menu--scroll" role="listbox" hidden>${componentChoices(selected?.id || '')}</div>
    </div>`;
  }

  function refreshEmptyStates() {
    [['projects', els.projects], ['marketing', els.marketing], ['venue-requirements', els.venueReqs]].forEach(([key, root]) => {
      if (!root) return;
      const rows = root.querySelectorAll('.events-repeat-row');
      const empty = root.querySelector(`[data-empty-${key}]`);
      if (empty) empty.hidden = rows.length > 0;
    });
  }

  function projectRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'events-repeat-row events-repeat-row--project';
    row.innerHTML = `<label><span>Project / Activity</span><input data-project-title type="text" maxlength="180" placeholder="Example: Smart Home workshop" value="${escapeHTML(data.title || '')}" /></label><label><span>Quantity</span><input data-project-quantity type="number" min="0" step="1" value="${escapeHTML(data.quantity ?? 1)}" /></label><label><span>Description / Notes</span><textarea data-project-notes rows="2" maxlength="1500" placeholder="Required kits, objective, execution notes...">${escapeHTML(data.description || data.notes || '')}</textarea></label><button type="button" class="events-repeat-remove" data-remove-row aria-label="Remove project"><i data-feather="trash-2"></i></button>`;
    els.projects?.appendChild(row);
    refreshEmptyStates();
    icons();
  }

  function componentRow(kind, data = {}) {
    const host = kind === 'marketing' ? els.marketing : els.venueReqs;
    if (!host) return;

    if (!state.components.filter((item) => item.isActive !== false).length) {
      toast('info', 'Event Components', 'The Event Components catalog is empty. Ask an Events Admin to add components first.');
      return;
    }

    const row = document.createElement('div');
    row.className = 'events-repeat-row';
    row.dataset.componentKind = kind;
    row.innerHTML = `<label><span>Component</span>${componentSelectMarkup(data.componentId || '')}</label><label><span>Quantity</span><input data-component-quantity type="number" min="0" step="0.01" value="${escapeHTML(data.quantity ?? 1)}" /></label><label><span>Notes</span><textarea data-component-notes rows="2" maxlength="1000" placeholder="Optional notes">${escapeHTML(data.notes || '')}</textarea></label><button type="button" class="events-repeat-remove" data-remove-row aria-label="Remove component"><i data-feather="trash-2"></i></button>`;
    host.appendChild(row);
    prepareModernSelects(row);
    refreshEmptyStates();
    icons();
  }

  function wireRepeatHandlers(root) {
    root?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-row]');
      if (remove) {
        remove.closest('.events-repeat-row')?.remove();
        refreshEmptyStates();
      }
    });

    root?.addEventListener('change', (event) => {
      const select = event.target.closest('[data-component-select]');
      if (!select) return;
      const row = select.closest('.events-repeat-row');
      const component = state.components.find((item) => item.id === select.value);
      const qty = $('[data-component-quantity]', row);
      if (component && qty) qty.value = component.defaultQuantity ?? 1;
    });
  }

  async function loadComponents() {
    try {
      const response = await fetch(`/api/events/components?activeOnly=1&_ts=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event components.');
      state.components = Array.isArray(data.components) ? data.components : [];
    } catch (error) {
      state.components = [];
      toast('error', 'Event Components', error?.message || 'Could not load event components.');
    }
  }

  function collectProjects() {
    return Array.from(els.projects?.querySelectorAll('.events-repeat-row') || [])
      .map((row) => ({
        title: String($('[data-project-title]', row)?.value || '').trim(),
        quantity: Number($('[data-project-quantity]', row)?.value || 0),
        description: String($('[data-project-notes]', row)?.value || '').trim(),
      }))
      .filter((item) => item.title);
  }

  function collectComponents(root) {
    return Array.from(root?.querySelectorAll('.events-repeat-row') || [])
      .map((row) => {
        const id = String($('[data-component-select]', row)?.value || '').trim();
        const component = state.components.find((item) => item.id === id);
        return {
          componentId: id,
          name: component?.name || '',
          quantity: Number($('[data-component-quantity]', row)?.value || 0),
          notes: String($('[data-component-notes]', row)?.value || '').trim(),
        };
      })
      .filter((item) => item.componentId && item.name);
  }

  function readPayload() {
    const setupRaw = String(field('venueSetupTime')?.value || '').trim();
    let setup = null;
    if (setupRaw) {
      const d = new Date(setupRaw);
      if (!Number.isNaN(d.getTime())) setup = d.toISOString();
    }

    return {
      eventName: String(field('eventName')?.value || '').trim(),
      eventType: field('eventType')?.value || 'other',
      eventStartDate: field('eventStartDate')?.value || null,
      eventEndDate: field('eventEndDate')?.value || null,
      expectedAttendees: Number(field('expectedAttendees')?.value || 0),
      organizationName: String(field('organizationName')?.value || '').trim(),
      contactPerson: String(field('contactPerson')?.value || '').trim(),
      contactPhone: String(field('contactPhone')?.value || '').trim(),
      contactEmail: String(field('contactEmail')?.value || '').trim(),
      audience: String(field('audience')?.value || '').trim(),
      projects: collectProjects(),
      marketingMaterials: collectComponents(els.marketing),
      venueRequirements: collectComponents(els.venueReqs),
      venueName: String(field('venueName')?.value || '').trim(),
      venueType: String(field('venueType')?.value || '').trim(),
      governorate: String(field('governorate')?.value || '').trim(),
      locationUrl: String(field('locationUrl')?.value || '').trim(),
      venueSetupTime: setup,
      requiresPower: !!field('requiresPower')?.checked,
      requiresInternet: !!field('requiresInternet')?.checked,
      requiresSoundSystem: !!field('requiresSoundSystem')?.checked,
      venueNotes: String(field('venueNotes')?.value || '').trim(),
    };
  }

  function validate(payload) {
    if (!payload.eventName || !payload.organizationName || !payload.eventStartDate || !payload.venueName || !payload.governorate || !payload.locationUrl) {
      return 'Please complete all required fields before submitting.';
    }
    if (!safeHttpUrl(payload.locationUrl)) return 'Google Maps / Location URL must start with http:// or https://.';
    if (payload.eventEndDate && payload.eventEndDate < payload.eventStartDate) return 'End date cannot be before the start date.';
    return '';
  }

  function setSubmitting(value) {
    state.submitting = !!value;
    if (els.submit) {
      els.submit.disabled = state.submitting;
      const label = els.submit.querySelector('span');
      if (label) label.textContent = state.submitting ? 'Submitting...' : 'Submit Event Request';
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (state.submitting) return;
    if (window.OpsPageAccess?.isViewOnly?.()) {
      window.OpsPageAccess?.showViewOnlyNotice?.();
      return;
    }

    const payload = readPayload();
    const error = validate(payload);
    if (els.error) els.error.textContent = error;
    if (error) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to submit event request.');
      toast('success', 'Events', 'Event request submitted successfully.');
      window.location.assign('/events');
    } catch (error) {
      if (els.error) els.error.textContent = error?.message || 'Could not submit event request.';
      setSubmitting(false);
    }
  }

  function bind() {
    els.addProject?.addEventListener('click', () => projectRow());
    els.addMarketing?.addEventListener('click', () => componentRow('marketing'));
    els.addVenueReq?.addEventListener('click', () => componentRow('venue-requirements'));
    wireRepeatHandlers(els.projects);
    wireRepeatHandlers(els.marketing);
    wireRepeatHandlers(els.venueReqs);
    els.form?.addEventListener('submit', submit);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindModernSelects();
    prepareModernSelects();
    bind();
    icons();
    refreshEmptyStates();
    await loadComponents();
  });
})();

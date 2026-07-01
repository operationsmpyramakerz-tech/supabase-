(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const STANDARD_EVENT_TYPES = [
    { code: 'tech_day', label: 'Tech Day', isCustom: false },
    { code: 'seminar', label: 'Seminar', isCustom: false },
    { code: 'steam_fair', label: 'STEAM Fair', isCustom: false },
    { code: 'competition', label: 'Competition', isCustom: false },
    { code: 'exhibition', label: 'Exhibition', isCustom: false },
  ];

  const state = {
    components: [],
    eventTypes: [...STANDARD_EVENT_TYPES],
    scheduledEvents: [],
    scheduledEventsLoaded: false,
    lastConflictSignature: '',
    submitting: false,
    governorateRates: [],
    governorateRatesAuthorized: false,
  };

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
    dateConflict: $('#eventDateConflict'),
    eventTypeMenu: $('#eventTypeMenu'),
    locationUrl: $('#locationUrl'),
    locationValidation: $('#locationUrlValidation'),
    governorateRatesMenu: $('#governorateRatesMenu'),
    editGovernorateRates: $('#editGovernorateRatesBtn'),
    workingTotal: $('#workingCostTotal'),
    transportTotal: $('#transportCostTotal'),
    total: $('#eventTotalCost'),
    transportSummaryNote: $('#transportCostSummaryNote'),
    ratesModal: $('#eventGovernorateRatesModal'),
    ratesForm: $('#eventGovernorateRatesForm'),
    ratesClose: $('#eventGovernorateRatesClose'),
    ratesCancel: $('#eventGovernorateRatesCancel'),
    ratesSave: $('#eventGovernorateRatesSave'),
    ratesError: $('#eventGovernorateRatesError'),
    ratesList: $('#governorateRatesList'),
    addRate: $('#addGovernorateRateBtn'),
    adminModal: $('#eventGovernorateRatesAdminModal'),
    adminForm: $('#eventGovernorateRatesAdminForm'),
    adminClose: $('#eventGovernorateRatesAdminClose'),
    adminCancel: $('#eventGovernorateRatesAdminCancel'),
    adminConfirm: $('#eventGovernorateRatesAdminConfirm'),
    adminPassword: $('#eventGovernorateRatesAdminPassword'),
    adminError: $('#eventGovernorateRatesAdminError'),
  };
  const field = (id) => $(`#${id}`);

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function icons() {
    try { window.feather?.replace({ width: 16, height: 16 }); } catch {}
  }

  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast({ type, title, message, duration: 6500 }); } catch {}
    if (type === 'error' || type === 'info') { try { window.alert(`${title}: ${message}`); } catch {} }
  }

  function isAdmin() { return !!window.OpsPageAccess?.isAdmin?.(); }
  function isViewOnly() { return !!window.OpsPageAccess?.isViewOnly?.(); }

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

  function isGoogleMapsUrl(value) {
    const safe = safeHttpUrl(value);
    if (!safe) return false;
    try {
      const url = new URL(safe);
      const host = String(url.hostname || '').toLowerCase().replace(/^www\./, '');
      const path = String(url.pathname || '');
      const isGoogle = /(^|\.)google\.[a-z.]+$/i.test(host);
      return host === 'maps.app.goo.gl' ||
        (host === 'goo.gl' && /^\/maps(?:\/|$)/i.test(path)) ||
        (isGoogle && (host === 'maps.google.com' || /^\/maps(?:\/|$)/i.test(path) || /(?:^|[?&])(?:q|query|ll|destination|origin|place_id)=/i.test(url.search)));
    } catch {
      return false;
    }
  }

  function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('en-EG', {
      style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number.isFinite(number) ? Math.max(0, number) : 0);
  }

  function nonNegative(value) { return Math.max(0, Number(value || 0) || 0); }

  function ownershipLabel(component) {
    return String(component?.ownershipType || '') === 'external_rental' ? 'External Rental' : 'Company Owned';
  }

  function componentCostSummary(component, quantity = 1) {
    const operating = nonNegative(component?.operatingCost);
    const rental = String(component?.ownershipType || '') === 'external_rental' ? nonNegative(component?.rentalCost) : 0;
    const qty = nonNegative(quantity);
    const unit = operating + rental;
    const parts = String(component?.ownershipType || '') === 'external_rental'
      ? `Rental ${money(rental)} + operating ${money(operating)}`
      : `Operating ${money(operating)}`;
    return { operating, rental, qty, unit, total: unit * qty, parts };
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

  function updateEventTypeCustomValue(option, input) {
    if (input?.id !== 'eventType') return;
    const customField = field('eventTypeCustom');
    if (customField) customField.value = option?.dataset?.eventTypeCustomLabel || '';
  }

  function toggleOtherTypeEditor(root, visible) {
    const editor = $('[data-event-type-custom-editor]', root);
    if (!editor) return;
    editor.hidden = !visible;
    if (visible) window.setTimeout(() => $('[data-event-type-custom-input]', editor)?.focus(), 0);
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
    input.value = option ? String(option.dataset.value || '') : '';
    const label = $('[data-events-select-label]', root);
    if (label) label.textContent = option ? option.textContent.trim() : (input.dataset.placeholder || 'Select option');
    root.querySelectorAll('[data-events-select-option]').forEach((item) => {
      const selected = item === option;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    updateEventTypeCustomValue(option, input);
    if (input.id === 'eventType') toggleOtherTypeEditor(root, input.value === 'other');
    if (dispatch) input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function prepareModernSelects(scope = document) {
    scope.querySelectorAll?.('[data-events-modern-select]').forEach((root) => {
      const input = $('input[type="hidden"]', root);
      if (!input) return;
      setModernSelectValue(input, String(input.value || '').trim());
    });
  }

  function customTypeOptions() {
    return state.eventTypes.filter((item) => item.isCustom).map((item) =>
      `<button class="events-modern-select__option" type="button" data-events-select-option data-value="${escapeHTML(item.code)}" data-event-type-custom-label="${escapeHTML(item.label)}">${escapeHTML(item.label)}</button>`
    ).join('');
  }

  function renderEventTypeOptions({ preserveValue = true } = {}) {
    if (!els.eventTypeMenu) return;
    const typeInput = field('eventType');
    const oldValue = preserveValue ? String(typeInput?.value || 'tech_day') : 'tech_day';
    const builtIn = STANDARD_EVENT_TYPES.map((item) =>
      `<button class="events-modern-select__option" type="button" data-events-select-option data-value="${item.code}">${item.label}</button>`
    ).join('');
    els.eventTypeMenu.innerHTML = `${builtIn}${customTypeOptions()}<button class="events-modern-select__option" type="button" data-events-select-option data-value="other">Other</button><div class="events-modern-select__custom" data-event-type-custom-editor hidden><label>New event type<input type="text" maxlength="80" placeholder="Example: Open Day" data-event-type-custom-input /></label><button type="button" data-event-type-custom-save><i data-feather="plus"></i><span>Save type</span></button><small>Saved types are available for future event requests.</small></div>`;
    const hasValue = Array.from(els.eventTypeMenu.querySelectorAll('[data-events-select-option]')).some((item) => item.dataset.value === oldValue);
    setModernSelectValue(typeInput, hasValue ? oldValue : 'tech_day');
    icons();
  }

  async function saveCustomEventType(editor) {
    const input = $('[data-event-type-custom-input]', editor);
    const save = $('[data-event-type-custom-save]', editor);
    const label = String(input?.value || '').trim();
    if (!label) { toast('info', 'Event Type', 'Enter a name for the new event type.'); input?.focus(); return; }
    if (save) { save.disabled = true; save.classList.add('is-loading'); }
    try {
      const response = await fetch('/api/events/types', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not save the event type.');
      state.eventTypes = Array.isArray(data?.types) && data.types.length ? data.types : state.eventTypes;
      renderEventTypeOptions({ preserveValue: false });
      const typeInput = field('eventType');
      if (typeInput) setModernSelectValue(typeInput, data?.type?.code || 'other', { dispatch: true });
      closeAllModernSelects();
      toast('success', 'Event Type', 'The new event type was saved and selected.');
    } catch (error) {
      toast('error', 'Event Type', error?.message || 'Could not save the event type.');
    } finally {
      if (save) { save.disabled = false; save.classList.remove('is-loading'); }
    }
  }

  function bindModernSelects() {
    document.addEventListener('click', (event) => {
      const customSave = event.target.closest('[data-event-type-custom-save]');
      if (customSave) { event.preventDefault(); saveCustomEventType(customSave.closest('[data-event-type-custom-editor]')); return; }

      const option = event.target.closest('[data-events-select-option]');
      if (option) {
        const root = option.closest('[data-events-modern-select]');
        const input = root ? $('input[type="hidden"]', root) : null;
        if (input && !option.disabled) setModernSelectValue(input, option.dataset.value || '', { dispatch: true });
        const isOtherType = input?.id === 'eventType' && option.dataset.value === 'other';
        if (isOtherType) { root?.classList.add('is-open'); return; }
        closeAllModernSelects();
        return;
      }

      const trigger = event.target.closest('.events-modern-select__trigger');
      if (trigger) {
        const root = trigger.closest('[data-events-modern-select]');
        if (!root) return;
        const menu = $('.events-modern-select__menu', root);
        const opening = !root.classList.contains('is-open');
        closeAllModernSelects(root);
        root.classList.toggle('is-open', opening);
        trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
        if (menu) menu.hidden = !opening;
        return;
      }

      if (!event.target.closest('[data-events-modern-select]')) closeAllModernSelects();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllModernSelects();
      if (event.key === 'Enter' && event.target.matches?.('[data-event-type-custom-input]')) {
        event.preventDefault();
        saveCustomEventType(event.target.closest('[data-event-type-custom-editor]'));
      }
    });
  }

  function activeComponentsForCategory(categoryCode = '') {
    const requested = String(categoryCode || '').trim();
    return state.components.filter((item) => item.isActive !== false && (!requested || String(item.category || '').trim() === requested));
  }

  function componentChoices(categoryCode = '') {
    const active = activeComponentsForCategory(categoryCode);
    if (!active.length) {
      const categoryNames = {
        project: 'Project Resource',
        marketing_material: 'Marketing Material',
        venue_equipment: 'Venue Equipment',
      };
      const label = categoryNames[categoryCode] || 'Event Component';
      return `<button class="events-modern-select__option" type="button" disabled>No active ${escapeHTML(label)} components available</button>`;
    }
    return active.map((item) => `<button class="events-modern-select__option" type="button" data-events-select-option data-value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</button>`).join('');
  }

  function componentSelectMarkup(selectedId = '', categoryCode = '', selectAttribute = 'data-component-select') {
    const selected = activeComponentsForCategory(categoryCode).find((item) => item.id === selectedId) || null;
    return `<div class="events-modern-select" data-events-modern-select data-component-category="${escapeHTML(categoryCode)}"><input ${selectAttribute} data-placeholder="Select component" type="hidden" value="${escapeHTML(selected?.id || '')}" /><button class="events-modern-select__trigger" type="button" aria-haspopup="listbox" aria-expanded="false"><span data-events-select-label>${escapeHTML(selected?.name || 'Select component')}</span><i data-feather="chevron-down"></i></button><div class="events-modern-select__menu events-modern-select__menu--scroll" role="listbox" hidden>${componentChoices(categoryCode)}</div></div>`;
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
    const requestedId = String(data.componentId || data.component_id || '').trim();
    const matchedLegacyComponent = !requestedId
      ? activeComponentsForCategory('project').find((item) => String(item.name || '').trim().toLocaleLowerCase() === String(data.title || '').trim().toLocaleLowerCase())
      : null;
    const selectedId = requestedId || matchedLegacyComponent?.id || '';
    row.innerHTML = `<label><span>Project / Activity</span>${componentSelectMarkup(selectedId, 'project', 'data-project-select')}</label><label><span>Quantity</span><input data-project-quantity type="number" min="0" step="1" value="${escapeHTML(data.quantity ?? 1)}" /></label><label><span>Working Cost</span><input data-project-working-cost type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHTML(data.workingCost ?? data.working_cost ?? 0)}" /></label><label><span>Description / Notes</span><textarea data-project-notes rows="2" maxlength="1500" placeholder="Required kits, objective, execution notes...">${escapeHTML(data.description || data.notes || '')}</textarea></label><button type="button" class="events-repeat-remove" data-remove-row aria-label="Remove project"><i data-feather="trash-2"></i></button>`;
    els.projects?.appendChild(row);
    prepareModernSelects(row);
    refreshEmptyStates();
    renderCostSummary();
    icons();
  }

  function updateComponentRowMeta(row) {
    if (!row) return;
    const id = String($('[data-component-select]', row)?.value || '').trim();
    const component = state.components.find((item) => item.id === id) || null;
    const costTarget = $('[data-component-cost]', row);
    const openLink = $('[data-component-open-link]', row);
    const quantity = nonNegative($('[data-component-quantity]', row)?.value);
    if (!component) {
      if (costTarget) costTarget.innerHTML = '<span>Cost</span><strong>Select a component</strong><small>Cost details appear here.</small>';
      if (openLink) { openLink.hidden = true; openLink.removeAttribute('href'); }
      renderCostSummary();
      return;
    }

    const cost = componentCostSummary(component, quantity);
    if (costTarget) costTarget.innerHTML = `<span>Cost</span><strong>${escapeHTML(money(cost.total))}</strong><small>${escapeHTML(cost.parts)} · ${escapeHTML(money(cost.unit))} / unit</small>`;
    const url = safeHttpUrl(component.linkUrl);
    if (openLink) {
      if (url) {
        openLink.href = url;
        openLink.hidden = false;
        openLink.setAttribute('aria-label', `Open link for ${component.name}`);
      } else {
        openLink.hidden = true;
        openLink.removeAttribute('href');
      }
    }
    renderCostSummary();
  }

  function componentRow(kind, data = {}) {
    const host = kind === 'marketing' ? els.marketing : els.venueReqs;
    const categoryCode = kind === 'marketing' ? 'marketing_material' : 'venue_equipment';
    const categoryLabel = kind === 'marketing' ? 'Marketing Material' : 'Venue Equipment';
    if (!host) return;
    if (!activeComponentsForCategory(categoryCode).length) {
      toast('info', 'Event Components', `There are no active ${categoryLabel} components in the catalog. Ask an Events Admin to add one first.`);
      return;
    }
    const row = document.createElement('div');
    row.className = 'events-repeat-row events-repeat-row--component';
    row.dataset.componentKind = kind;
    row.dataset.componentCategory = categoryCode;
    row.innerHTML = `<label><span>Component</span>${componentSelectMarkup(data.componentId || '', categoryCode)}</label><label><span>Quantity</span><input data-component-quantity type="number" min="0" step="0.01" value="${escapeHTML(data.quantity ?? 1)}" /></label><div class="events-component-cost" data-component-cost><span>Cost</span><strong>Select a component</strong><small>Cost details appear here.</small></div><label><span>Notes</span><textarea data-component-notes rows="2" maxlength="1000" placeholder="Optional notes">${escapeHTML(data.notes || '')}</textarea></label><div class="events-component-row-actions"><a class="events-component-open-link" data-component-open-link target="_blank" rel="noopener noreferrer" hidden><i data-feather="external-link"></i><span>Open Link</span></a><button type="button" class="events-repeat-remove" data-remove-row aria-label="Remove component"><i data-feather="trash-2"></i></button></div>`;
    host.appendChild(row);
    prepareModernSelects(row);
    updateComponentRowMeta(row);
    refreshEmptyStates();
    icons();
  }

  function wireRepeatHandlers(root) {
    root?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-row]');
      if (remove) {
        remove.closest('.events-repeat-row')?.remove();
        refreshEmptyStates();
        renderCostSummary();
      }
    });
    root?.addEventListener('change', (event) => {
      const row = event.target.closest('.events-repeat-row');
      if (!row) return;
      const select = event.target.closest('[data-component-select], [data-project-select]');
      if (select) {
        const component = state.components.find((item) => item.id === select.value);
        const qty = $('[data-component-quantity], [data-project-quantity]', row);
        if (component && qty) qty.value = component.defaultQuantity ?? 1;
        if (component && select.matches?.('[data-project-select]')) {
          const projectCost = $('[data-project-working-cost]', row);
          if (projectCost) projectCost.value = componentCostSummary(component, qty?.value ?? component.defaultQuantity ?? 1).total;
        }
      }
      if (select?.matches?.('[data-component-select]') || event.target.matches?.('[data-component-quantity]')) updateComponentRowMeta(row);
      renderCostSummary();
    });
    root?.addEventListener('input', (event) => {
      const row = event.target.closest('.events-repeat-row');
      if (!row) return;
      if (event.target.matches?.('[data-component-quantity]')) updateComponentRowMeta(row);
      if (event.target.matches?.('[data-project-working-cost], [data-project-quantity]')) renderCostSummary();
    });
  }

  async function loadComponents() {
    try {
      const response = await fetch(`/api/events/components?activeOnly=1&_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event components.');
      state.components = Array.isArray(data.components) ? data.components : [];
    } catch (error) {
      state.components = [];
      toast('error', 'Event Components', error?.message || 'Could not load event components.');
    }
  }

  async function loadEventTypes() {
    try {
      const response = await fetch(`/api/events/types?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event types.');
      const types = Array.isArray(data?.types) ? data.types : [];
      state.eventTypes = types.length ? types : [...STANDARD_EVENT_TYPES];
    } catch (error) {
      state.eventTypes = [...STANDARD_EVENT_TYPES];
      toast('error', 'Event Types', error?.message || 'Could not load saved event types.');
    } finally {
      renderEventTypeOptions();
    }
  }

  function dateKeyFrom(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // Values typed in datetime-local are local dates, while stored values arrive
    // from Supabase as ISO UTC timestamps. Convert the latter back to the user's
    // local calendar day so the overlap notice compares dates only, not hours.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    return dmy ? `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}` : '';
  }

  function isDateTimeValue(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) || !Number.isNaN(new Date(raw).getTime());
  }

  function toISODateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function eventDateConflicts() {
    const selectedStart = dateKeyFrom(field('eventStartDate')?.value);
    if (!selectedStart) return [];
    const selectedEndRaw = dateKeyFrom(field('eventEndDate')?.value);
    const selectedEnd = selectedEndRaw && selectedEndRaw >= selectedStart ? selectedEndRaw : selectedStart;
    return state.scheduledEvents.filter((event) => {
      if (String(event?.status || '') === 'cancelled') return false;
      const start = dateKeyFrom(event?.eventStartDate);
      const end = dateKeyFrom(event?.eventEndDate) || start;
      return !!start && !!end && start <= selectedEnd && end >= selectedStart;
    });
  }

  function renderDateConflict({ notify = false } = {}) {
    if (!els.dateConflict) return;
    const selectedStart = dateKeyFrom(field('eventStartDate')?.value);
    if (!selectedStart || !state.scheduledEventsLoaded) {
      els.dateConflict.hidden = true;
      els.dateConflict.innerHTML = '';
      return;
    }
    const conflicts = eventDateConflicts();
    if (!conflicts.length) {
      els.dateConflict.hidden = true;
      els.dateConflict.innerHTML = '';
      state.lastConflictSignature = '';
      return;
    }
    const codes = Array.from(new Set(conflicts.map((event) => String(event?.eventCode || '').trim()).filter(Boolean)));
    const names = conflicts.map((event) => String(event?.eventName || 'Untitled Event').trim()).filter(Boolean);
    const selectedEnd = dateKeyFrom(field('eventEndDate')?.value) || selectedStart;
    const signature = `${selectedStart}|${selectedEnd}|${codes.join(',')}|${names.join(',')}`;
    const codeText = codes.length ? ` (${codes.join(', ')})` : '';
    const nameText = names.slice(0, 2).join(', ');
    els.dateConflict.hidden = false;
    els.dateConflict.innerHTML = `<i data-feather="info"></i><div><strong>Schedule notice</strong><span>An event is already scheduled for the selected date${escapeHTML(codeText)}${nameText ? `: ${escapeHTML(nameText)}` : ''}. You can continue, but coordinate the schedule and resources.</span></div>`;
    icons();
    if (notify && signature !== state.lastConflictSignature) toast('info', 'Schedule notice', `An event is already scheduled for the selected date${codeText}. You can continue, but coordinate the schedule and resources.`);
    state.lastConflictSignature = signature;
  }

  async function loadScheduledEvents() {
    try {
      const response = await fetch(`/api/events?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load scheduled events.');
      state.scheduledEvents = Array.isArray(data?.events) ? data.events : [];
    } catch {
      state.scheduledEvents = [];
    } finally {
      state.scheduledEventsLoaded = true;
      renderDateConflict();
    }
  }

  function setLocationValidation(message = '') {
    if (!els.locationValidation) return;
    els.locationValidation.hidden = !message;
    els.locationValidation.textContent = message || '';
  }

  function normaliseGovernorateName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function selectedGovernorateRate() {
    const selected = String(field('governorate')?.value || '').trim();
    if (!selected) return null;
    const key = normaliseGovernorateName(selected);
    return state.governorateRates.find((rate) => rate.isActive !== false && normaliseGovernorateName(rate.areaName) === key) || null;
  }

  function governorateTransportCost() {
    const rate = selectedGovernorateRate();
    return rate ? nonNegative(rate.transportCost) * 2 : 0;
  }

  function renderGovernorateRateOptions({ preserveValue = true } = {}) {
    const input = field('governorate');
    if (!input || !els.governorateRatesMenu) return;
    const previous = preserveValue ? String(input.value || '') : '';
    const active = state.governorateRates.filter((rate) => rate.isActive !== false && String(rate.areaName || '').trim());
    els.governorateRatesMenu.innerHTML = active.length
      ? active.map((rate) => `<button class="events-modern-select__option" type="button" data-events-select-option data-value="${escapeHTML(rate.areaName)}">${escapeHTML(rate.areaName)}</button>`).join('')
      : '<button class="events-modern-select__option" type="button" disabled>No governorates or areas configured</button>';
    const available = active.some((rate) => String(rate.areaName) === previous);
    setModernSelectValue(input, available ? previous : '');
    icons();
  }

  function syncGovernorateEditButton() {
    const disabled = isViewOnly();
    if (!els.editGovernorateRates) return;
    els.editGovernorateRates.hidden = disabled;
    els.editGovernorateRates.disabled = disabled;
  }

  async function loadGovernorateRates({ includeInactive = false } = {}) {
    try {
      const response = await fetch(`/api/events/governorate-rates?includeInactive=${includeInactive ? '1' : '0'}&_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not load governorate transport rates.');
      state.governorateRates = Array.isArray(data?.rates) ? data.rates : [];
      renderGovernorateRateOptions();
      syncGovernorateEditButton();
      renderCostSummary();
      return state.governorateRates;
    } catch (error) {
      state.governorateRates = [];
      renderGovernorateRateOptions();
      syncGovernorateEditButton();
      renderCostSummary();
      toast('error', 'Transport rates', error?.message || 'Could not load governorate transport rates.');
      return [];
    }
  }

  function governorateRateRow(rate = {}, index = 0) {
    const row = document.createElement('div');
    row.className = 'events-governorate-rate-row';
    row.dataset.rateId = String(rate.id || '');
    row.innerHTML = `<label><span>Governorate / Area</span><input data-rate-name type="text" maxlength="120" value="${escapeHTML(rate.areaName || '')}" placeholder="Example: North Coast" /></label><label><span>Transport Cost (EGP)</span><input data-rate-cost type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHTML(rate.transportCost ?? 0)}" placeholder="0.00" /></label>`;
    return row;
  }

  function renderGovernorateRatesEditor() {
    if (!els.ratesList) return;
    const rates = state.governorateRates.length ? state.governorateRates : [];
    els.ratesList.innerHTML = '';
    rates.forEach((rate, index) => els.ratesList.appendChild(governorateRateRow(rate, index)));
    if (!rates.length) els.ratesList.appendChild(governorateRateRow({}, 0));
    icons();
  }

  function openRatesModal() {
    renderGovernorateRatesEditor();
    if (els.ratesError) els.ratesError.textContent = '';
    if (els.ratesSave) { els.ratesSave.disabled = false; const label = els.ratesSave.querySelector('span'); if (label) label.textContent = 'Save Transport Rates'; }
    if (els.ratesModal) { els.ratesModal.hidden = false; els.ratesModal.setAttribute('aria-hidden', 'false'); }
    icons();
    window.setTimeout(() => $('[data-rate-name]', els.ratesList)?.focus(), 25);
  }

  function closeRatesModal() {
    if (els.ratesModal) { els.ratesModal.hidden = true; els.ratesModal.setAttribute('aria-hidden', 'true'); }
  }

  function openAdminModal() {
    if (els.adminPassword) els.adminPassword.value = '';
    if (els.adminError) els.adminError.textContent = '';
    if (els.adminConfirm) { els.adminConfirm.disabled = false; const label = els.adminConfirm.querySelector('span'); if (label) label.textContent = 'Authorize & Continue'; }
    if (els.adminModal) { els.adminModal.hidden = false; els.adminModal.setAttribute('aria-hidden', 'false'); }
    icons();
    window.setTimeout(() => els.adminPassword?.focus(), 25);
  }

  function closeAdminModal() {
    if (els.adminModal) { els.adminModal.hidden = true; els.adminModal.setAttribute('aria-hidden', 'true'); }
  }

  function requestGovernorateRatesEdit() {
    if (isViewOnly()) { try { window.OpsPageAccess?.showViewOnlyNotice?.(); } catch {} return; }
    if (isAdmin() || state.governorateRatesAuthorized) { openRatesModal(); return; }
    openAdminModal();
  }

  async function authorizeGovernorateRates(event) {
    event.preventDefault();
    if (isAdmin()) { closeAdminModal(); openRatesModal(); return; }
    const password = String(els.adminPassword?.value || '').trim();
    if (!password) { if (els.adminError) els.adminError.textContent = 'Please enter the Admin password.'; els.adminPassword?.focus(); return; }
    if (els.adminConfirm) { els.adminConfirm.disabled = true; const label = els.adminConfirm.querySelector('span'); if (label) label.textContent = 'Authorizing…'; }
    if (els.adminError) els.adminError.textContent = '';
    try {
      const response = await fetch('/api/events/admin/verify', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, intent: 'governorate_rates' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Invalid Admin password.');
      state.governorateRatesAuthorized = true;
      closeAdminModal();
      await loadGovernorateRates({ includeInactive: true });
      openRatesModal();
    } catch (error) {
      if (els.adminError) els.adminError.textContent = error?.message || 'Invalid Admin password.';
      if (els.adminConfirm) { els.adminConfirm.disabled = false; const label = els.adminConfirm.querySelector('span'); if (label) label.textContent = 'Authorize & Continue'; }
      els.adminPassword?.focus();
    }
  }

  function collectGovernorateRates() {
    return Array.from(els.ratesList?.querySelectorAll('.events-governorate-rate-row') || []).map((row, index) => ({
      id: String(row.dataset.rateId || '').trim(),
      areaName: String($('[data-rate-name]', row)?.value || '').trim(),
      transportCost: nonNegative($('[data-rate-cost]', row)?.value),
      isActive: true,
      sortOrder: index + 1,
    })).filter((rate) => rate.areaName);
  }

  async function saveGovernorateRates(event) {
    event.preventDefault();
    const rates = collectGovernorateRates();
    if (!rates.length) { if (els.ratesError) els.ratesError.textContent = 'Add at least one governorate or area.'; return; }
    const seen = new Set();
    for (const rate of rates) {
      const key = normaliseGovernorateName(rate.areaName);
      if (seen.has(key)) { if (els.ratesError) els.ratesError.textContent = `Duplicate governorate or area: ${rate.areaName}.`; return; }
      seen.add(key);
    }
    if (els.ratesError) els.ratesError.textContent = '';
    if (els.ratesSave) { els.ratesSave.disabled = true; const label = els.ratesSave.querySelector('span'); if (label) label.textContent = 'Saving…'; }
    try {
      const response = await fetch('/api/events/governorate-rates', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rates }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not save governorate transport rates.');
      state.governorateRatesAuthorized = false;
      await loadGovernorateRates();
      closeRatesModal();
      toast('success', 'Transport rates', 'Governorate transport rates were updated.');
    } catch (error) {
      if (els.ratesError) els.ratesError.textContent = error?.message || 'Could not save governorate transport rates.';
      if (els.ratesSave) { els.ratesSave.disabled = false; const label = els.ratesSave.querySelector('span'); if (label) label.textContent = 'Save Transport Rates'; }
    }
  }

  function calculateWorkingCost() {
    const projectCost = Array.from(els.projects?.querySelectorAll('.events-repeat-row') || [])
      .reduce((sum, row) => sum + nonNegative($('[data-project-working-cost]', row)?.value), 0);
    const componentCost = [els.marketing, els.venueReqs].reduce((sum, root) => sum + Array.from(root?.querySelectorAll('.events-repeat-row') || [])
      .reduce((inner, row) => {
        const component = state.components.find((item) => item.id === String($('[data-component-select]', row)?.value || '').trim());
        return inner + componentCostSummary(component, $('[data-component-quantity]', row)?.value).total;
      }, 0), 0);
    return projectCost + componentCost;
  }

  function renderCostSummary() {
    const working = calculateWorkingCost();
    const rate = selectedGovernorateRate();
    const transport = governorateTransportCost();
    if (els.workingTotal) els.workingTotal.textContent = money(working);
    if (els.transportTotal) els.transportTotal.textContent = money(transport);
    if (els.total) els.total.textContent = money(working + transport);
    if (els.transportSummaryNote) {
      els.transportSummaryNote.textContent = rate
        ? `${money(rate.transportCost)} × 2 · ${rate.areaName}`
        : 'Select a governorate to calculate transport cost';
    }
  }

  function initializeBlankDateInputs() {
    [field('eventStartDate'), field('eventEndDate')].forEach((input) => {
      if (!input) return;
      input.value = '';
      input.setAttribute('value', '');
      input.autocomplete = 'off';
    });
  }

  function collectProjects() {
    return Array.from(els.projects?.querySelectorAll('.events-repeat-row') || []).map((row) => {
      const componentId = String($('[data-project-select]', row)?.value || '').trim();
      const component = state.components.find((item) => item.id === componentId && String(item.category || '') === 'project') || null;
      return {
        componentId,
        title: component?.name || '',
        quantity: nonNegative($('[data-project-quantity]', row)?.value),
        workingCost: nonNegative($('[data-project-working-cost]', row)?.value),
        description: String($('[data-project-notes]', row)?.value || '').trim(),
      };
    }).filter((item) => item.componentId && item.title);
  }

  function collectComponents(root) {
    return Array.from(root?.querySelectorAll('.events-repeat-row') || []).map((row) => {
      const id = String($('[data-component-select]', row)?.value || '').trim();
      const component = state.components.find((item) => item.id === id);
      const quantity = nonNegative($('[data-component-quantity]', row)?.value);
      const cost = componentCostSummary(component, quantity);
      return {
        componentId: id,
        name: component?.name || '',
        quantity,
        notes: String($('[data-component-notes]', row)?.value || '').trim(),
        ownershipType: component?.ownershipType || 'company_owned',
        operatingCost: cost.operating,
        rentalCost: cost.rental,
        unitCost: cost.unit,
        totalCost: cost.total,
        linkUrl: safeHttpUrl(component?.linkUrl),
        photoUrl: safeHttpUrl(component?.photoUrl),
      };
    }).filter((item) => item.componentId && item.name);
  }

  function readPayload() {
    const setupRaw = String(field('venueSetupTime')?.value || '').trim();
    return {
      eventName: String(field('eventName')?.value || '').trim(),
      eventType: field('eventType')?.value || 'other',
      eventTypeCustom: String(field('eventTypeCustom')?.value || '').trim(),
      eventStartDate: toISODateTime(field('eventStartDate')?.value),
      eventEndDate: toISODateTime(field('eventEndDate')?.value),
      expectedAttendees: nonNegative(field('expectedAttendees')?.value),
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
      venueSetupTime: setupRaw ? toISODateTime(setupRaw) : null,
      requiresPower: !!field('requiresPower')?.checked,
      requiresInternet: !!field('requiresInternet')?.checked,
      requiresSoundSystem: !!field('requiresSoundSystem')?.checked,
      venueNotes: String(field('venueNotes')?.value || '').trim(),
    };
  }

  function validate(payload) {
    const startRaw = field('eventStartDate')?.value;
    const endRaw = field('eventEndDate')?.value;
    if (!payload.eventName || !payload.organizationName || !payload.eventStartDate || !payload.venueName || !payload.governorate || !payload.locationUrl) return 'Please complete all required fields before submitting.';
    if (field('eventType')?.value === 'other' || !payload.eventType) return 'Choose a saved event type or add a new type under Other.';
    if (!isDateTimeValue(startRaw) || (endRaw && !isDateTimeValue(endRaw))) return 'Enter valid event date and time values.';
    if (!isGoogleMapsUrl(payload.locationUrl)) return 'Google Maps / Location URL must be a Google Maps link. Example: https://www.google.com/maps/... or https://maps.app.goo.gl/...';
    if (!selectedGovernorateRate()) return 'Transport cost for the selected governorate or area is not configured. Ask an Events Admin to add it first.';
    if (payload.eventEndDate && new Date(payload.eventEndDate).getTime() < new Date(payload.eventStartDate).getTime()) return 'End date and time cannot be before the start date and time.';
    return '';
  }

  function setSubmitting(value) {
    state.submitting = !!value;
    if (!els.submit) return;
    els.submit.disabled = state.submitting;
    const label = els.submit.querySelector('span');
    if (label) label.textContent = state.submitting ? 'Submitting…' : 'Submit Event Request';
  }

  async function submit(event) {
    event.preventDefault();
    if (state.submitting) return;
    if (isViewOnly()) { try { window.OpsPageAccess?.showViewOnlyNotice?.(); } catch {} return; }
    const payload = readPayload();
    const error = validate(payload);
    if (els.error) els.error.textContent = error;
    if (error) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/events', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to submit event request.');
      toast('success', 'Events', 'Event request submitted successfully.');
      window.location.assign('/events/calendar');
    } catch (submitError) {
      if (els.error) els.error.textContent = submitError?.message || 'Could not submit event request.';
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

    [field('eventStartDate'), field('eventEndDate')].forEach((input) => {
      input?.addEventListener('change', () => renderDateConflict({ notify: true }));
      input?.addEventListener('input', () => renderDateConflict({ notify: true }));
    });

    els.locationUrl?.addEventListener('input', () => {
      const value = String(els.locationUrl.value || '').trim();
      if (!value) setLocationValidation('');
      else if (!isGoogleMapsUrl(value)) setLocationValidation('Paste a Google Maps link. Example: https://www.google.com/maps/... or https://maps.app.goo.gl/...');
      else setLocationValidation('');
    });
    els.locationUrl?.addEventListener('change', () => {
      const value = String(els.locationUrl.value || '').trim();
      setLocationValidation(value && !isGoogleMapsUrl(value) ? 'Paste a Google Maps link. Example: https://www.google.com/maps/... or https://maps.app.goo.gl/...' : '');
    });
    field('governorate')?.addEventListener('change', renderCostSummary);

    els.editGovernorateRates?.addEventListener('click', requestGovernorateRatesEdit);
    els.adminClose?.addEventListener('click', closeAdminModal);
    els.adminCancel?.addEventListener('click', closeAdminModal);
    els.adminModal?.addEventListener('click', (event) => { if (event.target === els.adminModal) closeAdminModal(); });
    els.adminForm?.addEventListener('submit', authorizeGovernorateRates);
    els.ratesClose?.addEventListener('click', closeRatesModal);
    els.ratesCancel?.addEventListener('click', closeRatesModal);
    els.ratesModal?.addEventListener('click', (event) => { if (event.target === els.ratesModal) closeRatesModal(); });
    els.ratesForm?.addEventListener('submit', saveGovernorateRates);
    els.addRate?.addEventListener('click', () => {
      els.ratesList?.appendChild(governorateRateRow({}, els.ratesList?.children?.length || 0));
      icons();
      window.setTimeout(() => els.ratesList?.lastElementChild?.querySelector('[data-rate-name]')?.focus(), 0);
    });
    els.form?.addEventListener('submit', submit);
    window.addEventListener('ops:userinfo', syncGovernorateEditButton);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindModernSelects();
    renderEventTypeOptions();
    prepareModernSelects();
    initializeBlankDateInputs();
    bind();
    icons();
    refreshEmptyStates();
    renderCostSummary();
    await Promise.all([loadEventTypes(), loadComponents(), loadScheduledEvents(), loadGovernorateRates()]);
    renderCostSummary();
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) initializeBlankDateInputs();
  });
})();

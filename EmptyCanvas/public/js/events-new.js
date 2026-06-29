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
    submitting: false,
    scheduledEvents: [],
    scheduledEventsLoaded: false,
    lastConflictSignature: '',
  };

  const els = {
    form: $('#eventRequestForm'), error: $('#eventRequestFormError'), submit: $('#eventRequestSubmit'),
    projects: $('#projectsList'), marketing: $('#marketingList'), venueReqs: $('#venueRequirementsList'),
    addProject: $('#addProjectRow'), addMarketing: $('#addMarketingRow'), addVenueReq: $('#addVenueRequirementRow'),
    dateConflict: $('#eventDateConflict'), eventTypeMenu: $('#eventTypeMenu'),
  };
  const field = (id) => $(`#${id}`);

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }
  function icons() { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast({ type, title, message, duration: 6000 }); } catch {}
    if (type === 'error' || type === 'info') { try { window.alert(`${title}: ${message}`); } catch {} }
  }
  function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try { const url = new URL(raw); return /^https?:$/i.test(url.protocol) ? url.href : ''; } catch { return ''; }
  }


  function money(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(Number.isFinite(number) ? Math.max(0, number) : 0);
  }

  function ownershipLabel(component) {
    return String(component?.ownershipType || '') === 'external_rental' ? 'External Rental' : 'Company Owned';
  }

  function componentUnitCost(component) {
    const operating = Math.max(0, Number(component?.operatingCost || 0) || 0);
    const rental = String(component?.ownershipType || '') === 'external_rental'
      ? Math.max(0, Number(component?.rentalCost || 0) || 0)
      : 0;
    return operating + rental;
  }

  function componentCostSummary(component, quantity = 1) {
    const operating = Math.max(0, Number(component?.operatingCost || 0) || 0);
    const rental = String(component?.ownershipType || '') === 'external_rental'
      ? Math.max(0, Number(component?.rentalCost || 0) || 0)
      : 0;
    const unit = operating + rental;
    const qty = Math.max(0, Number(quantity || 0) || 0);
    const parts = String(component?.ownershipType || '') === 'external_rental'
      ? `Rental ${money(rental)} + operating ${money(operating)}`
      : `Operating ${money(operating)}`;
    return { operating, rental, unit, qty, total: unit * qty, parts };
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
    input.value = option ? (option.dataset.value || '') : '';
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
      if (!root.dataset.eventsSelectReady) root.dataset.eventsSelectReady = '1';
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
        if (input) setModernSelectValue(input, option.dataset.value || '', { dispatch: true });
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
      if (event.key === 'Enter' && event.target.matches?.('[data-event-type-custom-input]')) {
        event.preventDefault(); saveCustomEventType(event.target.closest('[data-event-type-custom-editor]'));
      }
    });
  }

  function componentChoices(selectedId = '') {
    const active = state.components.filter((item) => item.isActive !== false);
    if (!active.length) return '<button class="events-modern-select__option" type="button" disabled>No active event components available</button>';
    return active.map((item) => {
      const cost = componentCostSummary(item, 1);
      const costText = String(item.ownershipType || '') === 'external_rental'
        ? `Rental ${money(cost.rental)} + operating ${money(cost.operating)}`
        : `Operating ${money(cost.operating)}`;
      return `<button class="events-modern-select__option" type="button" data-events-select-option data-value="${escapeHTML(item.id)}"><span>${escapeHTML(item.name)}</span><small>· ${escapeHTML(String(item.category || '').replace(/_/g, ' '))} · ${escapeHTML(costText)}</small></button>`;
    }).join('');
  }
  function componentSelectMarkup(selectedId = '') {
    const selected = state.components.find((item) => item.id === selectedId && item.isActive !== false);
    const selectedLabel = selected ? `${selected.name} · ${ownershipLabel(selected)}` : 'Select component';
    return `<div class="events-modern-select" data-events-modern-select><input data-component-select data-placeholder="Select component" type="hidden" value="${escapeHTML(selected?.id || '')}" /><button class="events-modern-select__trigger" type="button" aria-haspopup="listbox" aria-expanded="false"><span data-events-select-label>${escapeHTML(selectedLabel)}</span><i data-feather="chevron-down"></i></button><div class="events-modern-select__menu events-modern-select__menu--scroll" role="listbox" hidden>${componentChoices(selected?.id || '')}</div></div>`;
  }

  function refreshEmptyStates() {
    [['projects', els.projects], ['marketing', els.marketing], ['venue-requirements', els.venueReqs]].forEach(([key, root]) => {
      if (!root) return; const rows = root.querySelectorAll('.events-repeat-row'); const empty = root.querySelector(`[data-empty-${key}]`); if (empty) empty.hidden = rows.length > 0;
    });
  }
  function projectRow(data = {}) {
    const row = document.createElement('div'); row.className = 'events-repeat-row events-repeat-row--project';
    row.innerHTML = `<label><span>Project / Activity</span><input data-project-title type="text" maxlength="180" placeholder="Example: Smart Home workshop" value="${escapeHTML(data.title || '')}" /></label><label><span>Quantity</span><input data-project-quantity type="number" min="0" step="1" value="${escapeHTML(data.quantity ?? 1)}" /></label><label><span>Description / Notes</span><textarea data-project-notes rows="2" maxlength="1500" placeholder="Required kits, objective, execution notes...">${escapeHTML(data.description || data.notes || '')}</textarea></label><button type="button" class="events-repeat-remove" data-remove-row aria-label="Remove project"><i data-feather="trash-2"></i></button>`;
    els.projects?.appendChild(row); refreshEmptyStates(); icons();
  }
  function updateComponentRowMeta(row) {
    if (!row) return;
    const id = String($('[data-component-select]', row)?.value || '').trim();
    const component = state.components.find((item) => item.id === id) || null;
    const costTarget = $('[data-component-cost]', row);
    const openLink = $('[data-component-open-link]', row);
    const quantity = Number($('[data-component-quantity]', row)?.value || 0);
    if (!component) {
      if (costTarget) costTarget.innerHTML = '<span>Cost</span><strong>Select a component</strong><small>Cost details appear here.</small>';
      if (openLink) { openLink.hidden = true; openLink.removeAttribute('href'); }
      return;
    }

    const cost = componentCostSummary(component, quantity);
    if (costTarget) {
      costTarget.innerHTML = `<span>Cost</span><strong>${escapeHTML(money(cost.total))}</strong><small>${escapeHTML(cost.parts)} · ${escapeHTML(money(cost.unit))} / unit</small>`;
    }
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
  }

  function componentRow(kind, data = {}) {
    const host = kind === 'marketing' ? els.marketing : els.venueReqs; if (!host) return;
    if (!state.components.filter((item) => item.isActive !== false).length) { toast('info', 'Event Components', 'The Event Components catalog is empty. Ask an Events Admin to add components first.'); return; }
    const row = document.createElement('div'); row.className = 'events-repeat-row events-repeat-row--component'; row.dataset.componentKind = kind;
    row.innerHTML = `<label><span>Component</span>${componentSelectMarkup(data.componentId || '')}</label><label><span>Quantity</span><input data-component-quantity type="number" min="0" step="0.01" value="${escapeHTML(data.quantity ?? 1)}" /></label><div class="events-component-cost" data-component-cost><span>Cost</span><strong>Select a component</strong><small>Cost details appear here.</small></div><label><span>Notes</span><textarea data-component-notes rows="2" maxlength="1000" placeholder="Optional notes">${escapeHTML(data.notes || '')}</textarea></label><div class="events-component-row-actions"><a class="events-component-open-link" data-component-open-link target="_blank" rel="noopener noreferrer" hidden><i data-feather="external-link"></i><span>Open Link</span></a><button type="button" class="events-repeat-remove" data-remove-row aria-label="Remove component"><i data-feather="trash-2"></i></button></div>`;
    host.appendChild(row); prepareModernSelects(row); updateComponentRowMeta(row); refreshEmptyStates(); icons();
  }
  function wireRepeatHandlers(root) {
    root?.addEventListener('click', (event) => { const remove = event.target.closest('[data-remove-row]'); if (remove) { remove.closest('.events-repeat-row')?.remove(); refreshEmptyStates(); } });
    root?.addEventListener('change', (event) => {
      const row = event.target.closest('.events-repeat-row');
      if (!row) return;
      const select = event.target.closest('[data-component-select]');
      if (select) {
        const component = state.components.find((item) => item.id === select.value);
        const qty = $('[data-component-quantity]', row);
        if (component && qty) qty.value = component.defaultQuantity ?? 1;
      }
      if (select || event.target.matches?.('[data-component-quantity]')) updateComponentRowMeta(row);
    });
    root?.addEventListener('input', (event) => {
      if (!event.target.matches?.('[data-component-quantity]')) return;
      updateComponentRowMeta(event.target.closest('.events-repeat-row'));
    });
  }

  async function loadComponents() {
    try { const response = await fetch(`/api/events/components?activeOnly=1&_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event components.'); state.components = Array.isArray(data.components) ? data.components : []; }
    catch (error) { state.components = []; toast('error', 'Event Components', error?.message || 'Could not load event components.'); }
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
    } finally { renderEventTypeOptions(); }
  }

  function dateKeyFrom(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
    const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
    return '';
  }
  function isDateTimeValue(value) { const raw = String(value || '').trim(); return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(raw) || !Number.isNaN(new Date(raw).getTime()); }
  function toISODateTime(value) { const raw = String(value || '').trim(); if (!raw) return null; const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
  function eventDateConflicts() {
    const selectedStart = dateKeyFrom(field('eventStartDate')?.value); if (!selectedStart) return [];
    const selectedEndRaw = dateKeyFrom(field('eventEndDate')?.value); const selectedEnd = selectedEndRaw && selectedEndRaw >= selectedStart ? selectedEndRaw : selectedStart;
    return state.scheduledEvents.filter((event) => {
      if (String(event?.status || '') === 'cancelled') return false;
      const start = dateKeyFrom(event?.eventStartDate);
      const end = dateKeyFrom(event?.eventEndDate) || start;
      return !!start && !!end && start <= selectedEnd && end >= selectedStart;
    });
  }
  function renderDateConflict({ notify = false } = {}) {
    if (!els.dateConflict) return; const selectedStart = dateKeyFrom(field('eventStartDate')?.value);
    if (!selectedStart || !state.scheduledEventsLoaded) { els.dateConflict.hidden = true; els.dateConflict.innerHTML = ''; return; }
    const conflicts = eventDateConflicts();
    if (!conflicts.length) { els.dateConflict.hidden = true; els.dateConflict.innerHTML = ''; state.lastConflictSignature = ''; return; }
    const codes = Array.from(new Set(conflicts.map((event) => String(event?.eventCode || '').trim()).filter(Boolean)));
    const names = conflicts.map((event) => String(event?.eventName || 'Untitled Event').trim()).filter(Boolean);
    const selectedEnd = dateKeyFrom(field('eventEndDate')?.value) || selectedStart;
    const signature = `${selectedStart}|${selectedEnd}|${codes.join(',')}|${names.join(',')}`;
    const codeText = codes.length ? ` (${codes.join(', ')})` : ''; const nameText = names.slice(0, 2).join(', ');
    els.dateConflict.hidden = false;
    els.dateConflict.innerHTML = `<i data-feather="info"></i><div><strong>Schedule notice</strong><span>An event is already scheduled for the selected date${escapeHTML(codeText)}${nameText ? `: ${escapeHTML(nameText)}` : ''}. You can continue, but coordinate the schedule and resources.</span></div>`;
    icons();
    if (notify && signature !== state.lastConflictSignature) toast('info', 'Schedule notice', `An event is already scheduled for the selected date${codeText}. You can continue, but coordinate the schedule and resources.`);
    state.lastConflictSignature = signature;
  }
  async function loadScheduledEvents() {
    try { const response = await fetch(`/api/events?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load scheduled events.'); state.scheduledEvents = Array.isArray(data?.events) ? data.events : []; }
    catch { state.scheduledEvents = []; }
    finally { state.scheduledEventsLoaded = true; renderDateConflict(); }
  }
  function initializeBlankDateInputs() {
    // New requests always start blank. Calendar context remains a notice only;
    // it must never pre-fill or silently reserve a date/time.
    [field('eventStartDate'), field('eventEndDate')].forEach((input) => { if (input) input.value = ''; });
  }
  function applyCalendarPrefill() {
    try {
      const params = new URLSearchParams(window.location.search);
      const conflictCodes = String(params.get('conflictCodes') || '').trim();
      if (conflictCodes) window.setTimeout(() => toast('info', 'Schedule notice', `Event ${conflictCodes} is already scheduled on the selected date. Select your event date and time to review the conflict.`), 120);
    } catch {}
  }

  function collectProjects() { return Array.from(els.projects?.querySelectorAll('.events-repeat-row') || []).map((row) => ({ title: String($('[data-project-title]', row)?.value || '').trim(), quantity: Number($('[data-project-quantity]', row)?.value || 0), description: String($('[data-project-notes]', row)?.value || '').trim() })).filter((item) => item.title); }
  function collectComponents(root) {
    return Array.from(root?.querySelectorAll('.events-repeat-row') || []).map((row) => {
      const id = String($('[data-component-select]', row)?.value || '').trim();
      const component = state.components.find((item) => item.id === id);
      const quantity = Math.max(0, Number($('[data-component-quantity]', row)?.value || 0) || 0);
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
    const setupRaw = String(field('venueSetupTime')?.value || '').trim(); const setup = setupRaw ? toISODateTime(setupRaw) : null;
    return { eventName: String(field('eventName')?.value || '').trim(), eventType: field('eventType')?.value || 'other', eventTypeCustom: String(field('eventTypeCustom')?.value || '').trim(), eventStartDate: toISODateTime(field('eventStartDate')?.value), eventEndDate: toISODateTime(field('eventEndDate')?.value), expectedAttendees: Number(field('expectedAttendees')?.value || 0), organizationName: String(field('organizationName')?.value || '').trim(), contactPerson: String(field('contactPerson')?.value || '').trim(), contactPhone: String(field('contactPhone')?.value || '').trim(), contactEmail: String(field('contactEmail')?.value || '').trim(), audience: String(field('audience')?.value || '').trim(), projects: collectProjects(), marketingMaterials: collectComponents(els.marketing), venueRequirements: collectComponents(els.venueReqs), venueName: String(field('venueName')?.value || '').trim(), venueType: String(field('venueType')?.value || '').trim(), governorate: String(field('governorate')?.value || '').trim(), locationUrl: String(field('locationUrl')?.value || '').trim(), venueSetupTime: setup, requiresPower: !!field('requiresPower')?.checked, requiresInternet: !!field('requiresInternet')?.checked, requiresSoundSystem: !!field('requiresSoundSystem')?.checked, venueNotes: String(field('venueNotes')?.value || '').trim() };
  }
  function validate(payload) {
    const startRaw = field('eventStartDate')?.value; const endRaw = field('eventEndDate')?.value;
    if (!payload.eventName || !payload.organizationName || !payload.eventStartDate || !payload.venueName || !payload.governorate || !payload.locationUrl) return 'Please complete all required fields before submitting.';
    if (field('eventType')?.value === 'other' || !payload.eventType) return 'Choose a saved event type or add a new type under Other.';
    if (!isDateTimeValue(startRaw) || (endRaw && !isDateTimeValue(endRaw))) return 'Enter valid event date and time values.';
    if (!safeHttpUrl(payload.locationUrl)) return 'Google Maps / Location URL must start with http:// or https://.';
    if (payload.eventEndDate && new Date(payload.eventEndDate).getTime() < new Date(payload.eventStartDate).getTime()) return 'End date and time cannot be before the start date and time.';
    return '';
  }
  function setSubmitting(value) { state.submitting = !!value; if (els.submit) { els.submit.disabled = state.submitting; const label = els.submit.querySelector('span'); if (label) label.textContent = state.submitting ? 'Submitting...' : 'Submit Event Request'; } }
  async function submit(event) {
    event.preventDefault(); if (state.submitting) return; if (window.OpsPageAccess?.isViewOnly?.()) { window.OpsPageAccess?.showViewOnlyNotice?.(); return; }
    const payload = readPayload(); const error = validate(payload); if (els.error) els.error.textContent = error; if (error) return; setSubmitting(true);
    try { const response = await fetch('/api/events', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to submit event request.'); toast('success', 'Events', 'Event request submitted successfully.'); window.location.assign('/events/calendar'); }
    catch (error) { if (els.error) els.error.textContent = error?.message || 'Could not submit event request.'; setSubmitting(false); }
  }
  function bind() {
    els.addProject?.addEventListener('click', () => projectRow()); els.addMarketing?.addEventListener('click', () => componentRow('marketing')); els.addVenueReq?.addEventListener('click', () => componentRow('venue-requirements'));
    wireRepeatHandlers(els.projects); wireRepeatHandlers(els.marketing); wireRepeatHandlers(els.venueReqs);
    [field('eventStartDate'), field('eventEndDate')].forEach((input) => { input?.addEventListener('change', () => renderDateConflict({ notify: true })); input?.addEventListener('input', () => renderDateConflict({ notify: true })); });
    els.form?.addEventListener('submit', submit);
  }
  document.addEventListener('DOMContentLoaded', async () => {
    bindModernSelects(); renderEventTypeOptions(); prepareModernSelects(); initializeBlankDateInputs(); applyCalendarPrefill(); bind(); icons(); refreshEmptyStates(); await Promise.all([loadEventTypes(), loadComponents(), loadScheduledEvents()]);
  });
})();

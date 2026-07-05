(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { events: [], loading: false, query: '', status: 'all', typeFilter: 'all', activeEvent: null, pendingWorkflow: null };
  const els = {
    cards: $('#eventsRequestCards'),
    search: $('#requestedSearch'),
    tabs: Array.from(document.querySelectorAll('[data-event-status-tab]')),
    typeFilter: $('#eventsTypeFilter'), typeFilterBtn: $('#eventsTypeFilterBtn'), typeFilterPanel: $('#eventsTypeFilterPanel'), typeFilterDot: $('#eventsTypeFilterDot'),
    modal: $('#eventDetailsModal'), modalClose: $('#eventDetailsClose'), modalDone: $('#eventDetailsDone'), modalDownload: $('#eventDetailsDownload'),
    modalTitle: $('#eventDetailsTitle'), modalStatus: $('#eventDetailsStatus'), modalContent: $('#eventDetailsContent'),
    actionWrap: $('#eventDetailsActionWrap'), actionToggle: $('#eventDetailsActions'), actionMenu: $('#eventDetailsActionsMenu'),
    workflowAuthModal: $('#eventWorkflowAuthModal'), workflowAuthForm: $('#eventWorkflowAuthForm'), workflowAuthClose: $('#eventWorkflowAuthClose'),
    workflowAuthCancel: $('#eventWorkflowAuthCancel'), workflowAuthPassword: $('#eventWorkflowAuthPassword'), workflowAuthError: $('#eventWorkflowAuthError'),
    workflowAuthSubmit: $('#eventWorkflowAuthSubmit'), workflowAuthTitle: $('#eventWorkflowAuthTitle'), workflowAuthText: $('#eventWorkflowAuthText'),
    workflowConfirmModal: $('#eventWorkflowConfirmModal'), workflowConfirmClose: $('#eventWorkflowConfirmClose'), workflowConfirmCancel: $('#eventWorkflowConfirmCancel'),
    workflowConfirmSubmit: $('#eventWorkflowConfirmSubmit'), workflowConfirmTitle: $('#eventWorkflowConfirmTitle'), workflowConfirmText: $('#eventWorkflowConfirmText'),
    workflowConfirmNote: $('#eventWorkflowConfirmNote'),
  };

  const typeLabels = { tech_day: 'Tech Day', seminar: 'Seminar', steam_fair: 'STEAM Fair', competition: 'Competition', exhibition: 'Exhibition', other: 'Other' };
  const typeIcons = { tech_day: 'cpu', seminar: 'mic', steam_fair: 'star', competition: 'award', exhibition: 'image', other: 'calendar' };
  const statusLabels = { submitted: 'Submitted', in_progress: 'In progress', completed: 'Done', cancelled: 'Cancelled' };
  const statusOptions = Object.keys(statusLabels);

  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function icons(root = document) { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) { try { if (window.UI?.toast) return window.UI.toast({ type, title, message, duration: 6500 }); } catch {} if (type === 'error') window.alert(`${title}: ${message}`); }
  function asDate(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
  function normaliseStatus(value) { const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); return raw === 'under_review' || raw === 'approved' ? 'submitted' : (statusOptions.includes(raw) ? raw : 'submitted'); }
  function formatDateTime(value) { const date = asDate(value); return date ? date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function formatDateRange(event) { const start = asDate(event?.eventStartDate); const end = asDate(event?.eventEndDate); if (!start) return 'Date to be confirmed'; const startText = start.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); if (!end || end.getTime() === start.getTime()) return startText; const sameDay = start.toDateString() === end.toDateString(); const endText = end.toLocaleString('en-GB', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); return `${startText} - ${endText}`; }
  function typeLabel(event) { const custom = String(event?.eventTypeCustom || '').trim(); if (custom) return custom; const key = String(event?.eventType || 'other'); if (typeLabels[key]) return typeLabels[key]; return key.replace(/^custom_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other'; }
  function statusMarkup(status) { const safe = normaliseStatus(status); return `<span class="events-status events-status--${escapeHTML(safe)}">${escapeHTML(statusLabels[safe])}</span>`; }
  function safeUrl(value) { const raw = String(value || '').trim(); if (!raw) return ''; try { const url = new URL(raw, window.location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
  function eventTypeKey(event) { const custom = String(event?.eventTypeCustom || '').trim(); if (custom) return `custom:${custom.toLocaleLowerCase()}`; const value = String(event?.eventType || 'other').trim().toLocaleLowerCase() || 'other'; return `built:${value}`; }
  function eventTypeOption(event) { const raw = String(event?.eventType || 'other').trim().toLocaleLowerCase() || 'other'; return { key: eventTypeKey(event), label: typeLabel(event), icon: typeIcons[raw] || 'calendar' }; }
  function getEventTypeFilterOptions() { const map = new Map(); (state.events || []).forEach((event) => { const option = eventTypeOption(event); const current = map.get(option.key) || { ...option, count: 0 }; current.count += 1; map.set(option.key, current); }); const items = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })); return [{ key: 'all', label: 'All event types', icon: 'layers', count: (state.events || []).length }, ...items]; }
  function filteredEvents() { const query = String(state.query || '').trim().toLowerCase(); const status = String(state.status || 'all'); const typeFilter = String(state.typeFilter || 'all'); return (state.events || []).filter((event) => { const eventStatus = normaliseStatus(event.status); if (status !== 'all' && eventStatus !== status) return false; if (typeFilter !== 'all' && eventTypeKey(event) !== typeFilter) return false; if (!query) return true; return [event.eventCode, event.eventName, event.eventType, event.eventTypeCustom, event.organizationName, event.governorate, event.requesterName].join(' ').toLowerCase().includes(query); }); }
  function renderTabs() { els.tabs.forEach((tab) => { const active = tab.dataset.eventStatusTab === state.status; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', active ? 'true' : 'false'); }); }
  function closeTypeFilter() { if (!els.typeFilterPanel) return; els.typeFilterPanel.hidden = true; els.typeFilter?.classList.remove('is-open'); els.typeFilterBtn?.setAttribute('aria-expanded', 'false'); }
  function renderTypeFilter() { if (!els.typeFilterPanel || !els.typeFilter) return; const options = getEventTypeFilterOptions(); if (!options.some((option) => option.key === state.typeFilter)) state.typeFilter = 'all'; const isFiltered = state.typeFilter !== 'all'; els.typeFilter.classList.toggle('is-filtered', isFiltered); if (els.typeFilterDot) els.typeFilterDot.hidden = !isFiltered; els.typeFilterPanel.innerHTML = `<div class="orders-type-filter__panel-head"><div class="orders-type-filter__panel-title">Filter by event type</div><div class="orders-type-filter__panel-sub">${escapeHTML(`${options[0]?.count || 0} event${(options[0]?.count || 0) === 1 ? '' : 's'}`)}</div></div><div class="orders-type-filter__options">${options.map((option) => `<button type="button" class="orders-type-filter__option${option.key === state.typeFilter ? ' is-active' : ''}" role="menuitemradio" aria-checked="${option.key === state.typeFilter ? 'true' : 'false'}" data-event-type-filter="${escapeHTML(option.key)}"><span class="orders-type-filter__option-icon"><i data-feather="${escapeHTML(option.icon)}"></i></span><span class="orders-type-filter__option-body"><span class="orders-type-filter__option-title">${escapeHTML(option.label)}</span><span class="orders-type-filter__option-sub">${escapeHTML(`${option.count} event${option.count === 1 ? '' : 's'}`)}</span></span><span class="orders-type-filter__option-check"><i data-feather="check"></i></span></button>`).join('')}</div>`; icons(els.typeFilterPanel); }

  function creatorButtonMarkup(userId, name) { const cleanId = String(userId || '').trim(); const cleanName = String(name || '').trim() || 'Creator'; return `<button class="co-right-ico co-creator-btn" type="button" data-event-creator-id="${escapeHTML(cleanId)}" data-event-creator-name="${escapeHTML(cleanName)}" aria-label="Created by ${escapeHTML(cleanName)}" title="Created by ${escapeHTML(cleanName)}"><i data-feather="user"></i></button>`; }
  function eventLocationMarkup(event) { const governorate = String(event?.governorate || '').trim() || 'Location to be confirmed'; const mapUrl = safeUrl(event?.locationUrl); if (!mapUrl) return `<span class="events-request-card__location is-disabled"><i data-feather="map-pin"></i><span>${escapeHTML(governorate)}</span></span>`; return `<a class="events-request-card__location events-request-card__location-link" href="${escapeHTML(mapUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(governorate)} in Google Maps" title="Open location"><i data-feather="map-pin"></i><span>${escapeHTML(governorate)}</span></a>`; }
  function cardMarkup(event) { const type = String(event?.eventType || 'other'); const icon = typeIcons[type] || 'calendar'; const className = type.replace(/[^a-z0-9_]/gi, '') || 'other'; return `<article class="events-request-card co-card" role="button" tabindex="0" data-event-open="${escapeHTML(event.id)}"><div class="co-top"><span class="events-request-card__thumb events-request-card__thumb--${escapeHTML(className)}"><i data-feather="${escapeHTML(icon)}"></i></span><div class="co-main"><div class="co-title">${escapeHTML(event.eventCode || 'Pending reference')}</div><div class="co-sub">${escapeHTML(formatDateRange(event))}</div><div class="co-createdby">${escapeHTML(event.eventName || 'Untitled Event')}</div></div><div class="events-request-card__count">${escapeHTML(typeLabel(event))}</div></div><div class="co-divider"></div><div class="co-bottom"><div class="co-est">${eventLocationMarkup(event)}</div><div class="co-actions">${statusMarkup(event.status)}${creatorButtonMarkup(event.createdByUserId || event.requesterName, event.requesterName)}</div></div></article>`; }
  function renderCards() { if (!els.cards) return; if (state.loading) { els.cards.innerHTML = '<div class="events-loading"><span></span> Loading event requests...</div>'; return; } const list = filteredEvents(); if (!list.length) { els.cards.innerHTML = '<div class="events-empty"><i data-feather="calendar"></i><span>No event requests match this view.</span></div>'; icons(els.cards); return; } els.cards.innerHTML = list.map(cardMarkup).join(''); icons(els.cards); }
  async function loadEvents({ silent = false } = {}) { if (!silent) { state.loading = true; renderCards(); } try { const response = await fetch(`/api/events?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event requests.'); state.events = (Array.isArray(data?.events) ? data.events : []).map((event) => ({ ...event, status: normaliseStatus(event.status) })); state.loading = false; renderTabs(); renderTypeFilter(); renderCards(); } catch (error) { state.loading = false; if (els.cards) els.cards.innerHTML = `<div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event requests.')}</span></div>`; icons(els.cards); toast('error', 'Events', error?.message || 'Could not load event requests.'); } }

  function detailItem(label, value) { return `<div class="events-detail-item"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || '—')}</strong></div>`; }
  function detailList(items, { empty = 'No items were added.', component = false } = {}) { if (!Array.isArray(items) || !items.length) return `<p class="events-table-muted">${escapeHTML(empty)}</p>`; return `<ul class="events-detail-list">${items.map((item) => { const title = component ? item.name : item.title; const notes = component ? item.notes : [item.description, item.notes].filter(Boolean).join(' · '); const unit = Number(item.unitCost || item.workingCost || 0); const total = Number(item.totalCost || ((item.quantity || 0) * unit) || 0); const money = Number.isFinite(total) ? `EGP ${total.toFixed(2)}` : ''; return `<li><strong>${escapeHTML(title || 'Untitled item')}</strong><small>${escapeHTML(`${item.quantity || 0} required${notes ? ` · ${notes}` : ''}${money ? ` · ${money}` : ''}`)}</small></li>`; }).join('')}</ul>`; }
  function statusControlMarkup(event) { const status = normaliseStatus(event.status); return `<div class="events-status-control"><div class="events-modern-select events-status-modern-select" id="eventStatusSelect"><input id="eventStatusEdit" type="hidden" value="${escapeHTML(status)}" /><button type="button" class="events-modern-select__trigger" id="eventStatusTrigger" aria-haspopup="listbox" aria-expanded="false"><span data-event-status-label>${escapeHTML(statusLabels[status])}</span><i data-feather="chevron-down"></i></button><div class="events-modern-select__menu" id="eventStatusMenu" role="listbox" hidden>${statusOptions.map((key) => `<button class="events-modern-select__option${key === status ? ' is-selected' : ''}" type="button" role="option" aria-selected="${key === status ? 'true' : 'false'}" data-event-status-option="${key}">${escapeHTML(statusLabels[key])}</button>`).join('')}</div></div><button class="events-primary-btn" id="eventStatusSave" type="button"><span>Update</span></button></div>`; }
  const workflowActions = Object.freeze({
    approve: {
      targetStatus: 'in_progress',
      from: 'submitted',
      buttonLabel: 'Mark as approved',
      title: 'Mark as approved',
      confirmationTitle: 'Approve event request?',
      confirmationText: 'This will change the request status from Submitted to In progress.',
      confirmationLabel: 'Confirm approval',
      icon: 'check-circle',
    },
    deliver: {
      targetStatus: 'completed',
      from: 'in_progress',
      buttonLabel: 'Mark as delivered',
      title: 'Mark as delivered',
      confirmationTitle: 'Mark event as delivered?',
      confirmationText: 'This will change the request status from In progress to Done.',
      confirmationLabel: 'Confirm delivery',
      icon: 'truck',
    },
  });

  function pageAccessLevel() {
    try {
      return String(window.OpsPageAccess?.level || document.body?.dataset?.pageAccessLevel || '').trim().toLowerCase();
    } catch {
      return String(document.body?.dataset?.pageAccessLevel || '').trim().toLowerCase();
    }
  }

  function canInitiateWorkflow() {
    // Workflow buttons must be visible to every Events user who can open the
    // request. The actual transition is still protected server-side by an
    // explicit Events Admin password verification for the selected request.
    // Do not rely on the client-side page-access cache here: it can briefly be
    // stale after permissions are saved, which previously hid both actions.
    return true;
  }

  function workflowActionFor(event) {
    const status = normaliseStatus(event?.status);
    if (status === 'submitted') return workflowActions.approve;
    if (status === 'in_progress') return workflowActions.deliver;
    return null;
  }

  function workflowActionMarkup(event) {
    const action = workflowActionFor(event);
    if (!action || !canInitiateWorkflow()) return '';
    return `<button class="events-workflow-action events-workflow-action--${escapeHTML(action.targetStatus)}" type="button" data-event-workflow-action="${escapeHTML(action.targetStatus)}" aria-label="${escapeHTML(action.buttonLabel)}"><i data-feather="${escapeHTML(action.icon)}"></i><span>${escapeHTML(action.buttonLabel)}</span></button>`;
  }
  function canManageEventStatus() {
    try {
      const runtimeLevel = String(window.OpsPageAccess?.level || document.body?.dataset?.pageAccessLevel || '').trim().toLowerCase();
      return runtimeLevel === 'admin' || window.OpsPageAccess?.isAdmin?.() === true;
    } catch {
      return String(document.body?.dataset?.pageAccessLevel || '').trim().toLowerCase() === 'admin';
    }
  }
  function closeStatusSelect() { const root = $('#eventStatusSelect', els.modalStatus); const menu = $('#eventStatusMenu', els.modalStatus); const trigger = $('#eventStatusTrigger', els.modalStatus); root?.classList.remove('is-open'); if (menu) menu.hidden = true; trigger?.setAttribute('aria-expanded', 'false'); }
  function setupStatusControl(event) {
    if (!els.modalStatus) return;
    const root = $('#eventStatusSelect', els.modalStatus);
    if (!root) return;
    $('#eventStatusSave', els.modalStatus)?.addEventListener('click', () => updateStatus(event.id));
    root.addEventListener('click', (clickEvent) => {
      const trigger = clickEvent.target.closest('#eventStatusTrigger');
      if (trigger) {
        const menu = $('#eventStatusMenu', root);
        const opening = !root.classList.contains('is-open');
        root.classList.toggle('is-open', opening);
        if (menu) menu.hidden = !opening;
        trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
        return;
      }
      const option = clickEvent.target.closest('[data-event-status-option]');
      if (!option) return;
      const value = normaliseStatus(option.dataset.eventStatusOption);
      const input = $('#eventStatusEdit', els.modalStatus);
      if (input) input.value = value;
      const label = $('[data-event-status-label]', els.modalStatus);
      if (label) label.textContent = statusLabels[value];
      els.modalStatus.querySelectorAll('[data-event-status-option]').forEach((item) => {
        const selected = item.dataset.eventStatusOption === value;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      closeStatusSelect();
    });
  }
  function renderActionMenu(event, isAdmin) { if (!els.actionWrap || !els.actionMenu || !els.actionToggle) return; els.actionWrap.hidden = !isAdmin; if (!isAdmin) { els.actionMenu.hidden = true; return; } els.actionMenu.innerHTML = `<button type="button" role="menuitem" data-event-action="edit"><i data-feather="edit-3"></i><span>Edit</span></button><button type="button" role="menuitem" class="is-danger" data-event-action="archive"><i data-feather="archive"></i><span>Archive</span></button>`; els.actionToggle.setAttribute('aria-expanded', 'false'); els.actionMenu.hidden = true; }
  function closeActionMenu() { if (!els.actionMenu || !els.actionToggle) return; els.actionMenu.hidden = true; els.actionToggle.setAttribute('aria-expanded', 'false'); }
  function renderDetails(event) {
    if (!els.modalContent) return;
    const mapUrl = safeUrl(event.locationUrl);
    const venueItems = [detailItem('Venue', event.venueName), detailItem('Type', event.venueType), detailItem('Governorate', event.governorate), detailItem('Setup time', formatDateTime(event.venueSetupTime))].join('');
    const requirements = [event.requiresPower && 'Power points', event.requiresInternet && 'Internet', event.requiresSoundSystem && 'Sound system'].filter(Boolean).join(' · ') || 'No special utilities selected';
    els.modalContent.innerHTML = `<section class="events-detail-block"><h4><i data-feather="calendar"></i> Overview</h4><div class="events-detail-grid">${detailItem('Type', typeLabel(event))}${detailItem('Event dates', formatDateRange(event))}${detailItem('Organization', event.organizationName)}${detailItem('Expected attendees', event.expectedAttendees ? String(event.expectedAttendees) : '—')}</div></section><section class="events-detail-block"><h4><i data-feather="user"></i> Contact</h4><div class="events-detail-grid">${detailItem('Contact person', event.contactPerson)}${detailItem('Phone', event.contactPhone)}${detailItem('Email', event.contactEmail)}${detailItem('Requested by', event.requesterName)}</div></section><section class="events-detail-block events-detail-block--wide"><h4><i data-feather="users"></i> Target audience</h4><div class="events-detail-item"><p>${escapeHTML(event.audience || 'No audience details were added.')}</p></div></section><section class="events-detail-block"><h4><i data-feather="cpu"></i> Projects</h4>${detailList(event.projects, { empty: 'No projects were added.' })}</section><section class="events-detail-block"><h4><i data-feather="image"></i> Marketing Materials</h4>${detailList(event.marketingMaterials, { empty: 'No marketing materials were added.', component: true })}</section><section class="events-detail-block"><h4><i data-feather="tool"></i> Venue Requirements</h4>${detailList(event.venueRequirements, { empty: 'No venue requirements were added.', component: true })}</section><section class="events-detail-block"><h4><i data-feather="map-pin"></i> Venue &amp; Location</h4><div class="events-detail-grid">${venueItems}</div>${mapUrl ? `<a class="events-location-link" target="_blank" rel="noopener noreferrer" href="${escapeHTML(mapUrl)}"><i data-feather="external-link"></i><span>Open map location</span></a>` : '<div class="events-detail-item" style="margin-top:12px"><span>Google Maps / Location URL</span><p>—</p></div>'}</section><section class="events-detail-block"><h4><i data-feather="sliders"></i> Site Notes</h4><div class="events-detail-item"><span>Utilities</span><p>${escapeHTML(requirements)}</p></div><div class="events-detail-item" style="margin-top:12px"><span>Venue Notes</span><p>${escapeHTML(event.venueNotes || 'No venue notes were added.')}</p></div></section><section class="events-detail-block events-detail-block--wide events-detail-costs"><h4><i data-feather="credit-card"></i> Cost Summary</h4><div class="events-detail-grid">${detailItem('Working cost', `EGP ${Number(event.workingCost || 0).toFixed(2)}`)}${detailItem('Transport cost', `EGP ${Number(event.transportCost || 0).toFixed(2)}`)}${detailItem('Total cost', `EGP ${Number(event.totalCost || 0).toFixed(2)}`)}</div></section>${event.operationsNotes ? `<section class="events-detail-block events-detail-block--wide"><h4><i data-feather="clipboard"></i> Operations Notes</h4><div class="events-detail-item"><p>${escapeHTML(event.operationsNotes)}</p></div></section>` : ''}`;
    if (els.modalTitle) els.modalTitle.textContent = event.eventName || 'Event Details';
    const isAdmin = canManageEventStatus();
    // The request status is intentionally not edited from this detail panel.
    // Workflow transitions are available only through the protected action next
    // to Download in the footer.
    if (els.modalStatus) els.modalStatus.innerHTML = workflowActionMarkup(event);
    renderActionMenu(event, isAdmin);
    icons(els.modal);
  }
  async function openDetails(id) { const clean = String(id || '').trim(); if (!clean || !els.modal) return; els.modal.hidden = false; els.modal.setAttribute('aria-hidden', 'false'); if (els.modalContent) els.modalContent.innerHTML = '<div class="events-loading"><span></span> Loading request details...</div>'; try { const response = await fetch(`/api/events/${encodeURIComponent(clean)}?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event details.'); state.activeEvent = { ...data.event, status: normaliseStatus(data.event?.status) }; renderDetails(state.activeEvent); } catch (error) { if (els.modalContent) els.modalContent.innerHTML = `<div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event details.')}</span></div>`; icons(els.modalContent); } }
  function closeDetails() { if (!els.modal) return; closeActionMenu(); closeStatusSelect(); els.modal.hidden = true; els.modal.setAttribute('aria-hidden', 'true'); state.activeEvent = null; }
  async function updateStatus(id) { const input = $('#eventStatusEdit', els.modalStatus); const status = normaliseStatus(input?.value); if (!id || !status) return; const save = $('#eventStatusSave'); if (save) { save.disabled = true; save.querySelector('span')?.replaceChildren('Updating...'); } try { const response = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update event status.'); const updated = { ...data.event, status: normaliseStatus(data.event?.status) }; state.events = state.events.map((item) => item.id === id ? updated : item); renderCards(); renderDetails(updated); toast('success', 'Events', 'Event status updated.'); } catch (error) { toast('error', 'Events', error?.message || 'Could not update event status.'); if (save) { save.disabled = false; save.querySelector('span')?.replaceChildren('Update'); } } }
  function resetWorkflowAuthorizationForm() {
    if (els.workflowAuthPassword) els.workflowAuthPassword.value = '';
    if (els.workflowAuthError) els.workflowAuthError.textContent = '';
    if (els.workflowAuthSubmit) {
      els.workflowAuthSubmit.disabled = false;
      const label = els.workflowAuthSubmit.querySelector('span');
      if (label) label.textContent = 'Verify & Continue';
    }
  }

  function closeWorkflowAuthorization() {
    if (els.workflowAuthModal) {
      els.workflowAuthModal.hidden = true;
      els.workflowAuthModal.setAttribute('aria-hidden', 'true');
    }
  }

  function closeWorkflowConfirmation({ clearPending = true } = {}) {
    if (els.workflowConfirmModal) {
      els.workflowConfirmModal.hidden = true;
      els.workflowConfirmModal.setAttribute('aria-hidden', 'true');
    }
    if (clearPending) state.pendingWorkflow = null;
  }

  function openWorkflowAuthorization(action) {
    const event = state.activeEvent;
    if (!event || !action) return;
    state.pendingWorkflow = { eventId: String(event.id || ''), targetStatus: action.targetStatus, action };
    resetWorkflowAuthorizationForm();
    if (els.workflowAuthTitle) els.workflowAuthTitle.textContent = action.title;
    if (els.workflowAuthModal) {
      els.workflowAuthModal.hidden = false;
      els.workflowAuthModal.setAttribute('aria-hidden', 'false');
    }
    icons(els.workflowAuthModal || document);
    window.setTimeout(() => els.workflowAuthPassword?.focus(), 20);
  }

  function openWorkflowConfirmation() {
    const pending = state.pendingWorkflow;
    if (!pending?.action) return;
    const { action } = pending;
    if (els.workflowConfirmTitle) els.workflowConfirmTitle.textContent = action.confirmationTitle;
    if (els.workflowConfirmNote) {
      const eventCode = String(state.activeEvent?.eventCode || 'this event request');
      els.workflowConfirmNote.innerHTML = `<i data-feather="info"></i><span>${escapeHTML(`${eventCode} will be updated after confirmation.`)}</span>`;
    }
    if (els.workflowConfirmSubmit) {
      els.workflowConfirmSubmit.disabled = false;
      const label = els.workflowConfirmSubmit.querySelector('span');
      if (label) label.textContent = action.confirmationLabel;
    }
    if (els.workflowConfirmModal) {
      els.workflowConfirmModal.hidden = false;
      els.workflowConfirmModal.setAttribute('aria-hidden', 'false');
    }
    icons(els.workflowConfirmModal || document);
  }

  async function authorizeWorkflow(event) {
    event.preventDefault();
    const pending = state.pendingWorkflow;
    if (!pending?.eventId || !pending?.action) return;
    const password = String(els.workflowAuthPassword?.value || '').trim();
    if (!password) {
      if (els.workflowAuthError) els.workflowAuthError.textContent = 'Please enter the Admin password.';
      els.workflowAuthPassword?.focus();
      return;
    }
    if (els.workflowAuthError) els.workflowAuthError.textContent = '';
    if (els.workflowAuthSubmit) {
      els.workflowAuthSubmit.disabled = true;
      const label = els.workflowAuthSubmit.querySelector('span');
      if (label) label.textContent = 'Verifying...';
    }
    try {
      const response = await fetch('/api/events/admin/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          intent: 'request_workflow',
          eventId: pending.eventId,
          targetStatus: pending.targetStatus,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Invalid Admin password.');
      closeWorkflowAuthorization();
      openWorkflowConfirmation();
    } catch (error) {
      if (els.workflowAuthError) els.workflowAuthError.textContent = error?.message || 'Invalid Admin password.';
      if (els.workflowAuthSubmit) {
        els.workflowAuthSubmit.disabled = false;
        const label = els.workflowAuthSubmit.querySelector('span');
        if (label) label.textContent = 'Verify & Continue';
      }
      els.workflowAuthPassword?.focus();
    }
  }

  async function confirmWorkflowTransition() {
    const pending = state.pendingWorkflow;
    if (!pending?.eventId || !pending?.targetStatus || !pending?.action) return;
    if (els.workflowConfirmSubmit) {
      els.workflowConfirmSubmit.disabled = true;
      const label = els.workflowConfirmSubmit.querySelector('span');
      if (label) label.textContent = 'Updating...';
    }
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(pending.eventId)}/workflow-transition`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStatus: pending.targetStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not update event request status.');
      const updated = { ...data.event, status: normaliseStatus(data.event?.status) };
      state.events = state.events.map((item) => item.id === updated.id ? updated : item);
      state.activeEvent = updated;
      renderTabs();
      renderTypeFilter();
      renderCards();
      renderDetails(updated);
      closeWorkflowConfirmation();
      toast('success', 'Events', pending.targetStatus === 'completed' ? 'Event request marked as Done.' : 'Event request marked as In progress.');
    } catch (error) {
      toast('error', 'Events', error?.message || 'Could not update event request status.');
      if (els.workflowConfirmSubmit) {
        els.workflowConfirmSubmit.disabled = false;
        const label = els.workflowConfirmSubmit.querySelector('span');
        if (label) label.textContent = pending.action.confirmationLabel;
      }
    }
  }

  function downloadActiveEvent() { const id = String(state.activeEvent?.id || '').trim(); if (!id) return; window.location.assign(`/api/events/${encodeURIComponent(id)}/pdf`); }
  async function archiveActiveEvent() { const event = state.activeEvent; const id = String(event?.id || '').trim(); if (!id) return; if (!window.confirm(`Archive ${event.eventCode || 'this event request'}? It will be removed from Event Requests.`)) return; try { const response = await fetch(`/api/events/${encodeURIComponent(id)}/archive`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Could not archive event request.'); state.events = state.events.filter((item) => item.id !== id); renderTypeFilter(); renderCards(); closeDetails(); toast('success', 'Events', 'Event request archived.'); } catch (error) { toast('error', 'Events', error?.message || 'Could not archive event request.'); } }

  const creatorProfileCache = new Map(); let creatorProfilePopover = null; let creatorProfileListenersBound = false;
  function creatorInitials(name) { return String(name || 'Creator').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'C'; }
  function creatorFieldMarkup(label, value) { return value ? `<div class="creator-profile-field"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>` : ''; }
  function renderCreatorProfile(profile, fallbackName, mode = 'ready') { const name = String(profile?.name || fallbackName || 'Creator').trim() || 'Creator'; const position = String(profile?.position || '').trim(); const department = String(profile?.department || '').trim(); const subtitle = [position, department].filter(Boolean).join(' • ') || 'Team member'; const photo = safeUrl(profile?.photoUrl); const avatar = photo ? `<img src="${escapeHTML(photo)}" alt="${escapeHTML(name)}" decoding="async" />` : `<span>${escapeHTML(creatorInitials(name))}</span>`; if (mode === 'loading') return `<div class="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile"><button type="button" class="creator-profile-close" aria-label="Close"><span class="creator-profile-close-x" aria-hidden="true">&times;</span></button><div class="creator-profile-head"><div class="creator-profile-avatar ${photo ? 'has-image' : ''}">${avatar}</div><div class="creator-profile-title-wrap"><div class="creator-profile-kicker">Created by</div><div class="creator-profile-name">${escapeHTML(name)}</div><div class="creator-profile-subtitle">${escapeHTML(subtitle)}</div></div></div><div class="creator-profile-state"><i class="loading-icon" data-feather="loader"></i><span>Loading user details...</span></div></div>`; if (mode === 'error') return `<div class="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile"><button type="button" class="creator-profile-close" aria-label="Close"><span class="creator-profile-close-x" aria-hidden="true">&times;</span></button><div class="creator-profile-head"><div class="creator-profile-avatar ${photo ? 'has-image' : ''}">${avatar}</div><div class="creator-profile-title-wrap"><div class="creator-profile-kicker">Created by</div><div class="creator-profile-name">${escapeHTML(name)}</div><div class="creator-profile-subtitle">${escapeHTML(subtitle)}</div></div></div><div class="creator-profile-state creator-profile-state--error"><i data-feather="alert-circle"></i><span>Could not load this user details.</span></div></div>`; const fields = [['Name', profile?.name || profile?.username], ['Department', department], ['Position', position], ['Phone', profile?.phone], ['Email', profile?.email], ['Employee Code', profile?.employeeCode]].map(([label, value]) => creatorFieldMarkup(label, String(value || '').trim())).filter(Boolean).join('') || '<div class="creator-profile-empty creator-profile-empty--fields"><i data-feather="info"></i><span>No profile details available.</span></div>'; return `<div class="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile"><button type="button" class="creator-profile-close" aria-label="Close"><span class="creator-profile-close-x" aria-hidden="true">&times;</span></button><div class="creator-profile-head"><div class="creator-profile-avatar ${photo ? 'has-image' : ''}">${avatar}</div><div class="creator-profile-title-wrap"><div class="creator-profile-kicker">Created by</div><div class="creator-profile-name">${escapeHTML(name)}</div><div class="creator-profile-subtitle">${escapeHTML(subtitle)}</div></div></div><div class="creator-profile-section-title">Profile details</div><div class="creator-profile-fields">${fields}</div></div>`; }
  function closeCreatorProfilePopover() { if (!creatorProfilePopover) return; creatorProfilePopover.classList.remove('is-open'); creatorProfilePopover.setAttribute('aria-hidden', 'true'); creatorProfilePopover.style.left = ''; creatorProfilePopover.style.top = ''; }
  function ensureCreatorProfilePopover() { if (creatorProfilePopover) return creatorProfilePopover; creatorProfilePopover = document.createElement('div'); creatorProfilePopover.className = 'creator-profile-popover'; creatorProfilePopover.setAttribute('aria-hidden', 'true'); document.body.appendChild(creatorProfilePopover); creatorProfilePopover.addEventListener('click', (event) => { if (event.target.closest('.creator-profile-close')) closeCreatorProfilePopover(); }); if (!creatorProfileListenersBound) { creatorProfileListenersBound = true; document.addEventListener('pointerdown', (event) => { if (!creatorProfilePopover?.classList.contains('is-open')) return; if (creatorProfilePopover.contains(event.target) || event.target.closest?.('.co-creator-btn')) return; closeCreatorProfilePopover(); }, true); document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCreatorProfilePopover(); }); window.addEventListener('resize', closeCreatorProfilePopover); } return creatorProfilePopover; }
  function positionCreatorProfilePopover(anchor) { const pop = ensureCreatorProfilePopover(); const margin = 14; const rect = anchor.getBoundingClientRect(); const popRect = pop.getBoundingClientRect(); const width = popRect.width || 360; const height = popRect.height || 420; let left = Math.min(Math.max(margin, rect.right - width), Math.max(margin, window.innerWidth - width - margin)); let top = rect.bottom + 10; if (top + height > window.innerHeight - margin) top = rect.top - height - 10; top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin)); pop.style.left = `${Math.round(left)}px`; pop.style.top = `${Math.round(top)}px`; }
  async function openCreatorProfilePopover(anchor, userId, fallbackName = '') { const pop = ensureCreatorProfilePopover(); const cleanId = String(userId || '').trim(); const cleanName = String(fallbackName || '').trim() || 'Creator'; pop.innerHTML = renderCreatorProfile({ name: cleanName }, cleanName, 'loading'); pop.classList.add('is-open'); pop.setAttribute('aria-hidden', 'false'); icons(pop); requestAnimationFrame(() => positionCreatorProfilePopover(anchor)); try { let profile = creatorProfileCache.get(cleanId) || creatorProfileCache.get(cleanName); if (!profile) { const lookupKeys = Array.from(new Set([cleanId, cleanName].map((value) => String(value || '').trim()).filter(Boolean))); let lastError = null; for (const lookupKey of lookupKeys) { const response = await fetch(`/api/team-members/${encodeURIComponent(lookupKey)}/public`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (response.ok) { profile = data; creatorProfileCache.set(lookupKey, profile); if (cleanId) creatorProfileCache.set(cleanId, profile); if (cleanName) creatorProfileCache.set(cleanName, profile); break; } lastError = new Error(data?.error || 'Profile request failed.'); } if (!profile) throw lastError || new Error('Profile request failed.'); } pop.innerHTML = renderCreatorProfile(profile, cleanName, 'ready'); } catch { pop.innerHTML = renderCreatorProfile({ name: cleanName }, cleanName, 'error'); } icons(pop); requestAnimationFrame(() => positionCreatorProfilePopover(anchor)); }

  function bind() {
    els.search?.addEventListener('input', (event) => { state.query = event.target.value; renderCards(); });
    els.tabs.forEach((tab) => tab.addEventListener('click', () => { state.status = tab.dataset.eventStatusTab || 'all'; renderTabs(); renderCards(); }));
    els.typeFilterBtn?.addEventListener('click', () => { const shouldOpen = !!els.typeFilterPanel?.hidden; if (shouldOpen) { renderTypeFilter(); if (els.typeFilterPanel) els.typeFilterPanel.hidden = false; els.typeFilter?.classList.add('is-open'); els.typeFilterBtn?.setAttribute('aria-expanded', 'true'); } else closeTypeFilter(); });
    els.typeFilterPanel?.addEventListener('click', (event) => { const option = event.target.closest('[data-event-type-filter]'); if (!option) return; state.typeFilter = option.dataset.eventTypeFilter || 'all'; renderTypeFilter(); renderCards(); closeTypeFilter(); });
    els.cards?.addEventListener('click', (event) => { const creator = event.target.closest('[data-event-creator-id]'); if (creator) { event.preventDefault(); event.stopPropagation(); openCreatorProfilePopover(creator, creator.dataset.eventCreatorId, creator.dataset.eventCreatorName); return; } if (event.target.closest('.events-request-card__location-link')) return; const card = event.target.closest('[data-event-open]'); if (card) openDetails(card.dataset.eventOpen); });
    els.cards?.addEventListener('keydown', (event) => { const card = event.target.closest('[data-event-open]'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetails(card.dataset.eventOpen); } });
    els.modalClose?.addEventListener('click', closeDetails); els.modalDone?.addEventListener('click', closeDetails); els.modalDownload?.addEventListener('click', downloadActiveEvent); els.modal?.addEventListener('click', (event) => { if (event.target === els.modal) closeDetails(); });
    els.modalStatus?.addEventListener('click', (event) => {
      const targetStatus = event.target.closest('[data-event-workflow-action]')?.dataset.eventWorkflowAction;
      if (!targetStatus) return;
      const action = Object.values(workflowActions).find((item) => item.targetStatus === targetStatus);
      if (action) openWorkflowAuthorization(action);
    });
    els.workflowAuthForm?.addEventListener('submit', authorizeWorkflow);
    els.workflowAuthClose?.addEventListener('click', () => closeWorkflowAuthorization());
    els.workflowAuthCancel?.addEventListener('click', () => closeWorkflowAuthorization());
    els.workflowAuthModal?.addEventListener('click', (event) => { if (event.target === els.workflowAuthModal) closeWorkflowAuthorization(); });
    els.workflowConfirmSubmit?.addEventListener('click', confirmWorkflowTransition);
    els.workflowConfirmClose?.addEventListener('click', () => closeWorkflowConfirmation());
    els.workflowConfirmCancel?.addEventListener('click', () => closeWorkflowConfirmation());
    els.workflowConfirmModal?.addEventListener('click', (event) => { if (event.target === els.workflowConfirmModal) closeWorkflowConfirmation(); });
    els.actionToggle?.addEventListener('click', () => { const opening = !!els.actionMenu?.hidden; if (els.actionMenu) els.actionMenu.hidden = !opening; els.actionToggle.setAttribute('aria-expanded', opening ? 'true' : 'false'); });
    els.actionMenu?.addEventListener('click', (event) => { const action = event.target.closest('[data-event-action]')?.dataset.eventAction; if (!action) return; closeActionMenu(); if (action === 'edit' && state.activeEvent?.id) window.location.assign(`/events/new?edit=${encodeURIComponent(state.activeEvent.id)}`); if (action === 'archive') archiveActiveEvent(); });
    document.addEventListener('click', (event) => { if (els.typeFilter && !els.typeFilter.contains(event.target)) closeTypeFilter(); if (els.actionWrap && !els.actionWrap.contains(event.target)) closeActionMenu(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (els.modal && !els.modal.hidden) closeDetails(); closeWorkflowAuthorization(); closeWorkflowConfirmation(); closeTypeFilter(); closeActionMenu(); } });
  }
  // common-ui hydrates page access asynchronously. Refresh an open modal after
  // hydration so an Events Admin always sees the desktop status controls.
  window.addEventListener('ops:userinfo', () => {
    if (state.activeEvent && !els.modal?.hidden) renderDetails(state.activeEvent);
  });

  document.addEventListener('DOMContentLoaded', () => { bind(); icons(); loadEvents(); });
})();

(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { events: [], loading: false, query: '', status: 'all', typeFilter: 'all', activeEvent: null };
  const els = {
    cards: $('#eventsRequestCards'), total: $('#eventsTotalCount'), pending: $('#eventsPendingCount'), progress: $('#eventsProgressCount'),
    search: $('#requestedSearch'), tabs: Array.from(document.querySelectorAll('[data-event-status-tab]')), refresh: $('#eventsRefreshBtn'),
    typeFilter: $('#eventsTypeFilter'), typeFilterBtn: $('#eventsTypeFilterBtn'), typeFilterPanel: $('#eventsTypeFilterPanel'), typeFilterDot: $('#eventsTypeFilterDot'),
    modal: $('#eventDetailsModal'), modalClose: $('#eventDetailsClose'), modalDone: $('#eventDetailsDone'),
    modalTitle: $('#eventDetailsTitle'), modalSub: $('#eventDetailsSubtitle'), modalStatus: $('#eventDetailsStatus'), modalContent: $('#eventDetailsContent'),
  };
  const typeLabels = { tech_day: 'Tech Day', seminar: 'Seminar', steam_fair: 'STEAM Fair', competition: 'Competition', exhibition: 'Exhibition', other: 'Other' };
  const typeIcons = { tech_day: 'cpu', seminar: 'mic', steam_fair: 'star', competition: 'award', exhibition: 'image', other: 'calendar' };
  const statusLabels = { submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function icons(root = document) { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) { try { if (window.UI?.toast) return window.UI.toast({ type, title, message, duration: 6000 }); } catch {} if (type === 'error') window.alert(`${title}: ${message}`); }
  function asDate(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
  function formatDateTime(value) { const date = asDate(value); return date ? date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function formatDateRange(event) { const start = asDate(event?.eventStartDate); const end = asDate(event?.eventEndDate); if (!start) return 'Date to be confirmed'; const startText = start.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); if (!end || end.getTime() === start.getTime()) return startText; const sameDay = start.toDateString() === end.toDateString(); const endText = end.toLocaleString('en-GB', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); return `${startText} – ${endText}`; }
  function typeLabel(event) { const custom = String(event?.eventTypeCustom || '').trim(); if (custom) return custom; const key = String(event?.eventType || 'other'); if (typeLabels[key]) return typeLabels[key]; return key.replace(/^custom_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other'; }
  function statusMarkup(status) { const safe = String(status || 'submitted').replace(/[^a-z_]/g, '') || 'submitted'; return `<span class="events-status events-status--${escapeHTML(safe)}">${escapeHTML(statusLabels[safe] || safe.replace(/_/g, ' '))}</span>`; }
  function safeUrl(value) { const raw = String(value || '').trim(); if (!raw) return ''; try { const url = new URL(raw, window.location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
  function eventTypeKey(event) { const custom = String(event?.eventTypeCustom || '').trim(); if (custom) return `custom:${custom.toLocaleLowerCase()}`; const value = String(event?.eventType || 'other').trim().toLocaleLowerCase() || 'other'; return `built:${value}`; }
  function eventTypeOption(event) { const raw = String(event?.eventType || 'other').trim().toLocaleLowerCase() || 'other'; return { key: eventTypeKey(event), label: typeLabel(event), icon: typeIcons[raw] || 'calendar' }; }
  function getEventTypeFilterOptions() { const map = new Map(); (state.events || []).forEach((event) => { const option = eventTypeOption(event); const current = map.get(option.key) || { ...option, count: 0 }; current.count += 1; map.set(option.key, current); }); const items = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })); return [{ key: 'all', label: 'All event types', icon: 'layers', count: (state.events || []).length }, ...items]; }
  function filteredEvents() { const query = String(state.query || '').trim().toLowerCase(); const status = String(state.status || 'all'); const typeFilter = String(state.typeFilter || 'all'); return (state.events || []).filter((event) => { if (status !== 'all' && event.status !== status) return false; if (typeFilter !== 'all' && eventTypeKey(event) !== typeFilter) return false; if (!query) return true; return [event.eventCode, event.eventName, event.eventType, event.eventTypeCustom, event.organizationName, event.governorate, event.requesterName].join(' ').toLowerCase().includes(query); }); }
  function updateStats() { const list = state.events || []; if (els.total) els.total.textContent = String(list.length); if (els.pending) els.pending.textContent = String(list.filter((item) => ['submitted', 'under_review'].includes(item.status)).length); if (els.progress) els.progress.textContent = String(list.filter((item) => item.status === 'in_progress').length); }
  function renderTabs() { els.tabs.forEach((tab) => { const active = tab.dataset.eventStatusTab === state.status; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', active ? 'true' : 'false'); }); }
  function closeTypeFilter() { if (!els.typeFilterPanel) return; els.typeFilterPanel.hidden = true; els.typeFilter?.classList.remove('is-open'); els.typeFilterBtn?.setAttribute('aria-expanded', 'false'); }
  function renderTypeFilter() {
    if (!els.typeFilterPanel || !els.typeFilter) return;
    const options = getEventTypeFilterOptions();
    if (!options.some((option) => option.key === state.typeFilter)) state.typeFilter = 'all';
    const isFiltered = state.typeFilter !== 'all';
    els.typeFilter.classList.toggle('is-filtered', isFiltered);
    if (els.typeFilterDot) els.typeFilterDot.hidden = !isFiltered;
    els.typeFilterPanel.innerHTML = `<div class="orders-type-filter__panel-head"><div class="orders-type-filter__panel-title">Filter by event type</div><div class="orders-type-filter__panel-sub">${escapeHTML(`${options[0]?.count || 0} event${(options[0]?.count || 0) === 1 ? '' : 's'}`)}</div></div><div class="orders-type-filter__options">${options.map((option) => `<button type="button" class="orders-type-filter__option${option.key === state.typeFilter ? ' is-active' : ''}" role="menuitemradio" aria-checked="${option.key === state.typeFilter ? 'true' : 'false'}" data-event-type-filter="${escapeHTML(option.key)}"><span class="orders-type-filter__option-icon"><i data-feather="${escapeHTML(option.icon)}"></i></span><span class="orders-type-filter__option-body"><span class="orders-type-filter__option-title">${escapeHTML(option.label)}</span><span class="orders-type-filter__option-sub">${escapeHTML(`${option.count} event${option.count === 1 ? '' : 's'}`)}</span></span><span class="orders-type-filter__option-check"><i data-feather="check"></i></span></button>`).join('')}</div>`;
    icons(els.typeFilterPanel);
  }
  function creatorButtonMarkup(userId, name) {
    const cleanId = String(userId || '').trim();
    const cleanName = String(name || '').trim() || 'Creator';
    return `<button class="co-right-ico co-creator-btn" type="button" data-event-creator-id="${escapeHTML(cleanId)}" data-event-creator-name="${escapeHTML(cleanName)}" aria-label="Created by ${escapeHTML(cleanName)}" title="Created by ${escapeHTML(cleanName)}"><i data-feather="user"></i></button>`;
  }
  function eventLocationMarkup(event) {
    const governorate = String(event?.governorate || '').trim() || 'Location to be confirmed';
    const mapUrl = safeUrl(event?.locationUrl);
    if (!mapUrl) return `<span class="events-request-card__location is-disabled"><i data-feather="map-pin"></i><span>${escapeHTML(governorate)}</span></span>`;
    return `<a class="events-request-card__location events-request-card__location-link" href="${escapeHTML(mapUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHTML(governorate)} in Google Maps" title="Open location"><i data-feather="map-pin"></i><span>${escapeHTML(governorate)}</span></a>`;
  }
  function cardMarkup(event) {
    const type = String(event?.eventType || 'other'); const icon = typeIcons[type] || 'calendar'; const className = type.replace(/[^a-z0-9_]/gi, '') || 'other';
    return `<article class="events-request-card co-card" role="button" tabindex="0" data-event-open="${escapeHTML(event.id)}" data-search="${escapeHTML([event.eventCode, event.eventName, event.eventType, event.eventTypeCustom, event.governorate, event.requesterName].join(' '))}">
      <div class="co-top"><span class="events-request-card__thumb events-request-card__thumb--${escapeHTML(className)}"><i data-feather="${escapeHTML(icon)}"></i></span><div class="co-main"><div class="co-title">${escapeHTML(event.eventCode || 'Pending reference')}</div><div class="co-sub">${escapeHTML(formatDateRange(event))}</div><div class="co-createdby">${escapeHTML(event.eventName || 'Untitled Event')}</div></div><div class="events-request-card__count">${escapeHTML(typeLabel(event))}</div></div>
      <div class="co-divider"></div>
      <div class="co-bottom"><div class="co-est">${eventLocationMarkup(event)}</div><div class="co-actions">${statusMarkup(event.status)}${creatorButtonMarkup(event.createdByUserId, event.requesterName)}</div></div>
    </article>`;
  }
  function renderCards() {
    if (!els.cards) return;
    if (state.loading) { els.cards.innerHTML = '<div class="events-loading"><span></span> Loading event requests...</div>'; return; }
    const list = filteredEvents();
    if (!list.length) { els.cards.innerHTML = '<div class="events-empty"><i data-feather="calendar"></i><span>No event requests match this view.</span></div>'; icons(els.cards); return; }
    els.cards.innerHTML = list.map(cardMarkup).join(''); icons(els.cards);
  }
  async function loadEvents({ silent = false } = {}) { if (!silent) { state.loading = true; renderCards(); } try { const response = await fetch(`/api/events?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event requests.'); state.events = Array.isArray(data?.events) ? data.events : []; updateStats(); state.loading = false; renderTabs(); renderTypeFilter(); renderCards(); } catch (error) { state.loading = false; if (els.cards) els.cards.innerHTML = `<div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event requests.')}</span></div>`; icons(els.cards); toast('error', 'Events', error?.message || 'Could not load event requests.'); } }
  function detailItem(label, value) { return `<div class="events-detail-item"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || '—')}</strong></div>`; }
  function detailList(items, { empty = 'No items were added.', component = false } = {}) { if (!Array.isArray(items) || !items.length) return `<p class="events-table-muted">${escapeHTML(empty)}</p>`; return `<ul class="events-detail-list">${items.map((item) => { const title = component ? item.name : item.title; const notes = component ? item.notes : [item.description, item.notes].filter(Boolean).join(' · '); return `<li><strong>${escapeHTML(title || 'Untitled item')}</strong><small>${escapeHTML(`${item.quantity || 0} required${notes ? ` · ${notes}` : ''}`)}</small></li>`; }).join('')}</ul>`; }
  function renderDetails(event) {
    if (!els.modalContent) return; const mapUrl = safeUrl(event.locationUrl); const venueItems = [detailItem('Venue', event.venueName), detailItem('Type', event.venueType), detailItem('Governorate', event.governorate), detailItem('Setup time', formatDateTime(event.venueSetupTime))].join(''); const requirements = [event.requiresPower && 'Power points', event.requiresInternet && 'Internet', event.requiresSoundSystem && 'Sound system'].filter(Boolean).join(' · ') || 'No special utilities selected';
    els.modalContent.innerHTML = `<section class="events-detail-block"><h4><i data-feather="calendar"></i> Overview</h4><div class="events-detail-grid">${detailItem('Type', typeLabel(event))}${detailItem('Event dates', formatDateRange(event))}${detailItem('Organization', event.organizationName)}${detailItem('Expected attendees', event.expectedAttendees ? String(event.expectedAttendees) : '—')}</div></section><section class="events-detail-block"><h4><i data-feather="user"></i> Contact</h4><div class="events-detail-grid">${detailItem('Contact person', event.contactPerson)}${detailItem('Phone', event.contactPhone)}${detailItem('Email', event.contactEmail)}${detailItem('Requested by', event.requesterName)}</div></section><section class="events-detail-block events-detail-block--wide"><h4><i data-feather="users"></i> Target audience</h4><div class="events-detail-item"><p>${escapeHTML(event.audience || 'No audience details were added.')}</p></div></section><section class="events-detail-block"><h4><i data-feather="cpu"></i> Projects</h4>${detailList(event.projects, { empty: 'No projects were added.' })}</section><section class="events-detail-block"><h4><i data-feather="image"></i> Marketing Materials</h4>${detailList(event.marketingMaterials, { empty: 'No marketing materials were added.', component: true })}</section><section class="events-detail-block"><h4><i data-feather="tool"></i> Venue Requirements</h4>${detailList(event.venueRequirements, { empty: 'No venue requirements were added.', component: true })}</section><section class="events-detail-block"><h4><i data-feather="map-pin"></i> Venue &amp; Location</h4><div class="events-detail-grid">${venueItems}</div>${mapUrl ? `<a class="events-location-link" target="_blank" rel="noopener noreferrer" href="${escapeHTML(mapUrl)}"><i data-feather="external-link"></i><span>Open map location</span></a>` : '<div class="events-detail-item" style="margin-top:12px"><span>Google Maps / Location URL</span><p>—</p></div>'}</section><section class="events-detail-block"><h4><i data-feather="sliders"></i> Site Notes</h4><div class="events-detail-item"><span>Utilities</span><p>${escapeHTML(requirements)}</p></div><div class="events-detail-item" style="margin-top:12px"><span>Venue Notes</span><p>${escapeHTML(event.venueNotes || 'No venue notes were added.')}</p></div></section>${event.operationsNotes ? `<section class="events-detail-block events-detail-block--wide"><h4><i data-feather="clipboard"></i> Operations Notes</h4><div class="events-detail-item"><p>${escapeHTML(event.operationsNotes)}</p></div></section>` : ''}`;
    if (els.modalTitle) els.modalTitle.textContent = event.eventName || 'Event Details'; if (els.modalSub) els.modalSub.textContent = `${event.eventCode || 'Event request'} · Submitted ${formatDateTime(event.createdAt)}`;
    if (els.modalStatus) { const isAdmin = !!window.OpsPageAccess?.isAdmin?.(); els.modalStatus.innerHTML = `${statusMarkup(event.status)}${isAdmin ? `<div class="events-status-control"><select id="eventStatusEdit">${Object.entries(statusLabels).map(([key, label]) => `<option value="${key}" ${key === event.status ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select><button class="events-primary-btn" id="eventStatusSave" type="button">Update</button></div>` : ''}`; $('#eventStatusSave', els.modalStatus)?.addEventListener('click', () => updateStatus(event.id)); }
    icons(els.modalContent);
  }
  async function openDetails(id) { const clean = String(id || '').trim(); if (!clean || !els.modal) return; els.modal.hidden = false; els.modal.setAttribute('aria-hidden', 'false'); if (els.modalContent) els.modalContent.innerHTML = '<div class="events-loading"><span></span> Loading request details...</div>'; try { const response = await fetch(`/api/events/${encodeURIComponent(clean)}?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event details.'); state.activeEvent = data.event; renderDetails(data.event); } catch (error) { if (els.modalContent) els.modalContent.innerHTML = `<div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event details.')}</span></div>`; icons(els.modalContent); } }
  function closeDetails() { if (!els.modal) return; els.modal.hidden = true; els.modal.setAttribute('aria-hidden', 'true'); state.activeEvent = null; }
  async function updateStatus(id) { const select = $('#eventStatusEdit'); const status = select?.value; if (!id || !status) return; const save = $('#eventStatusSave'); if (save) { save.disabled = true; save.textContent = 'Updating...'; } try { const response = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update event status.'); state.events = state.events.map((item) => item.id === id ? data.event : item); updateStats(); renderCards(); renderDetails(data.event); toast('success', 'Events', 'Event status updated.'); } catch (error) { toast('error', 'Events', error?.message || 'Could not update event status.'); if (save) { save.disabled = false; save.textContent = 'Update'; } } }
  const creatorProfileCache = new Map();
  let creatorProfilePopover = null;
  let creatorProfileListenersBound = false;
  function creatorInitials(name) { return String(name || 'Creator').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'C'; }
  function creatorSafeHttpUrl(value) { return safeUrl(value); }
  function creatorFieldMarkup(label, value) { return value ? `<div class="creator-profile-field"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>` : ''; }
  function renderCreatorProfile(profile, fallbackName, mode = 'ready') {
    const name = String(profile?.name || fallbackName || 'Creator').trim() || 'Creator';
    const position = String(profile?.position || '').trim();
    const department = String(profile?.department || '').trim();
    const subtitle = [position, department].filter(Boolean).join(' • ') || 'Team member';
    const photo = creatorSafeHttpUrl(profile?.photoUrl);
    const avatar = photo ? `<img src="${escapeHTML(photo)}" alt="${escapeHTML(name)}" decoding="async" />` : `<span>${escapeHTML(creatorInitials(name))}</span>`;
    if (mode === 'loading') {
      return `<div class="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile"><button type="button" class="creator-profile-close" aria-label="Close" title="Close"><span class="creator-profile-close-x" aria-hidden="true">&times;</span></button><div class="creator-profile-head"><div class="creator-profile-avatar ${photo ? 'has-image' : ''}">${avatar}</div><div class="creator-profile-title-wrap"><div class="creator-profile-kicker">Created by</div><div class="creator-profile-name">${escapeHTML(name)}</div><div class="creator-profile-subtitle">${escapeHTML(subtitle)}</div></div></div><div class="creator-profile-state"><i class="loading-icon" data-feather="loader"></i><span>Loading user details...</span></div></div>`;
    }
    if (mode === 'error') {
      return `<div class="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile"><button type="button" class="creator-profile-close" aria-label="Close" title="Close"><span class="creator-profile-close-x" aria-hidden="true">&times;</span></button><div class="creator-profile-head"><div class="creator-profile-avatar ${photo ? 'has-image' : ''}">${avatar}</div><div class="creator-profile-title-wrap"><div class="creator-profile-kicker">Created by</div><div class="creator-profile-name">${escapeHTML(name)}</div><div class="creator-profile-subtitle">${escapeHTML(subtitle)}</div></div></div><div class="creator-profile-state creator-profile-state--error"><i data-feather="alert-circle"></i><span>Could not load this user details.</span></div></div>`;
    }
    const fields = [
      ['Name', profile?.name || profile?.username],
      ['Department', department],
      ['Position', position],
      ['Phone', profile?.phone],
      ['Email', profile?.email],
      ['Employee Code', profile?.employeeCode],
    ].map(([label, value]) => creatorFieldMarkup(label, String(value || '').trim())).filter(Boolean).join('') || '<div class="creator-profile-empty creator-profile-empty--fields"><i data-feather="info"></i><span>No profile details available.</span></div>';
    return `<div class="creator-profile-window" role="dialog" aria-modal="false" aria-label="Created by profile"><button type="button" class="creator-profile-close" aria-label="Close" title="Close"><span class="creator-profile-close-x" aria-hidden="true">&times;</span></button><div class="creator-profile-head"><div class="creator-profile-avatar ${photo ? 'has-image' : ''}">${avatar}</div><div class="creator-profile-title-wrap"><div class="creator-profile-kicker">Created by</div><div class="creator-profile-name">${escapeHTML(name)}</div><div class="creator-profile-subtitle">${escapeHTML(subtitle)}</div></div></div><div class="creator-profile-section-title">Profile details</div><div class="creator-profile-fields">${fields}</div></div>`;
  }
  function closeCreatorProfilePopover() {
    if (!creatorProfilePopover) return;
    creatorProfilePopover.classList.remove('is-open');
    creatorProfilePopover.setAttribute('aria-hidden', 'true');
    creatorProfilePopover.style.left = '';
    creatorProfilePopover.style.top = '';
  }
  function ensureCreatorProfilePopover() {
    if (creatorProfilePopover) return creatorProfilePopover;
    creatorProfilePopover = document.createElement('div');
    creatorProfilePopover.className = 'creator-profile-popover';
    creatorProfilePopover.setAttribute('aria-hidden', 'true');
    document.body.appendChild(creatorProfilePopover);
    creatorProfilePopover.addEventListener('click', (event) => { if (event.target.closest('.creator-profile-close')) closeCreatorProfilePopover(); });
    if (!creatorProfileListenersBound) {
      creatorProfileListenersBound = true;
      document.addEventListener('pointerdown', (event) => { if (!creatorProfilePopover?.classList.contains('is-open')) return; if (creatorProfilePopover.contains(event.target) || event.target.closest?.('.co-creator-btn')) return; closeCreatorProfilePopover(); }, true);
      document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCreatorProfilePopover(); });
      window.addEventListener('resize', closeCreatorProfilePopover);
    }
    return creatorProfilePopover;
  }
  function positionCreatorProfilePopover(anchor) {
    const pop = ensureCreatorProfilePopover();
    const margin = 14; const rect = anchor.getBoundingClientRect(); const popRect = pop.getBoundingClientRect();
    const width = popRect.width || 360; const height = popRect.height || 420;
    let left = Math.min(Math.max(margin, rect.right - width), Math.max(margin, window.innerWidth - width - margin));
    let top = rect.bottom + 10; if (top + height > window.innerHeight - margin) top = rect.top - height - 10;
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));
    pop.style.left = `${Math.round(left)}px`; pop.style.top = `${Math.round(top)}px`;
  }
  async function openCreatorProfilePopover(anchor, userId, fallbackName = '') {
    const pop = ensureCreatorProfilePopover(); const cleanId = String(userId || '').trim(); const cleanName = String(fallbackName || '').trim() || 'Creator';
    pop.innerHTML = renderCreatorProfile({ name: cleanName }, cleanName, 'loading'); pop.classList.add('is-open'); pop.setAttribute('aria-hidden', 'false'); icons(pop); requestAnimationFrame(() => positionCreatorProfilePopover(anchor));
    if (!cleanId) { pop.innerHTML = renderCreatorProfile({ name: cleanName }, cleanName, 'error'); icons(pop); requestAnimationFrame(() => positionCreatorProfilePopover(anchor)); return; }
    try {
      let profile = creatorProfileCache.get(cleanId);
      if (!profile) { const response = await fetch(`/api/team-members/${encodeURIComponent(cleanId)}/public`, { credentials: 'same-origin', cache: 'no-store' }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error || 'Profile request failed.'); profile = data; creatorProfileCache.set(cleanId, profile); }
      pop.innerHTML = renderCreatorProfile(profile, cleanName, 'ready');
    } catch { pop.innerHTML = renderCreatorProfile({ name: cleanName }, cleanName, 'error'); }
    icons(pop); requestAnimationFrame(() => positionCreatorProfilePopover(anchor));
  }
  function bind() {
    els.search?.addEventListener('input', (event) => { state.query = event.target.value; renderCards(); });
    els.tabs.forEach((tab) => tab.addEventListener('click', () => { state.status = tab.dataset.eventStatusTab || 'all'; renderTabs(); renderCards(); }));
    els.refresh?.addEventListener('click', () => loadEvents());
    els.typeFilterBtn?.addEventListener('click', () => {
      const shouldOpen = !!els.typeFilterPanel?.hidden;
      if (shouldOpen) { renderTypeFilter(); if (els.typeFilterPanel) els.typeFilterPanel.hidden = false; els.typeFilter?.classList.add('is-open'); els.typeFilterBtn?.setAttribute('aria-expanded', 'true'); }
      else closeTypeFilter();
    });
    els.typeFilterPanel?.addEventListener('click', (event) => {
      const option = event.target.closest('[data-event-type-filter]');
      if (!option) return;
      state.typeFilter = option.dataset.eventTypeFilter || 'all';
      renderTypeFilter();
      renderCards();
      closeTypeFilter();
    });
    els.cards?.addEventListener('click', (event) => {
      const creator = event.target.closest('[data-event-creator-id]');
      if (creator) { event.preventDefault(); event.stopPropagation(); openCreatorProfilePopover(creator, creator.dataset.eventCreatorId, creator.dataset.eventCreatorName); return; }
      if (event.target.closest('.events-request-card__location-link')) return;
      const card = event.target.closest('[data-event-open]');
      if (card) openDetails(card.dataset.eventOpen);
    });
    els.cards?.addEventListener('keydown', (event) => { const card = event.target.closest('[data-event-open]'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetails(card.dataset.eventOpen); } });
    els.modalClose?.addEventListener('click', closeDetails);
    els.modalDone?.addEventListener('click', closeDetails);
    els.modal?.addEventListener('click', (event) => { if (event.target === els.modal) closeDetails(); });
    document.addEventListener('click', (event) => { if (els.typeFilter && !els.typeFilter.contains(event.target)) closeTypeFilter(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (els.modal && !els.modal.hidden) closeDetails(); closeTypeFilter(); } });
  }
  document.addEventListener('DOMContentLoaded', () => { bind(); icons(); loadEvents(); });
})();

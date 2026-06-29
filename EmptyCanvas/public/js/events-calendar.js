(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { events: [], month: startOfMonth(new Date()), selectedKey: dateKey(new Date()), loading: true, activeEvent: null };
  const els = {
    monthLabel: $('#eventsCalendarMonthLabel'), yearLabel: $('#eventsCalendarYearLabel'), grid: $('#eventsCalendarGrid'),
    prev: $('#eventsCalendarPrev'), next: $('#eventsCalendarNext'), today: $('#eventsCalendarToday'),
    selectedTitle: $('#eventsCalendarSelectedTitle'), selectedCount: $('#eventsCalendarSelectedCount'), dayList: $('#eventsCalendarDayList'),
    upcomingList: $('#eventsCalendarUpcomingList'), modal: $('#eventCalendarDetailsModal'), modalClose: $('#eventCalendarDetailsClose'),
    modalDone: $('#eventCalendarDetailsDone'), modalTitle: $('#eventCalendarDetailsTitle'), modalSub: $('#eventCalendarDetailsSubtitle'),
    modalStatus: $('#eventCalendarDetailsStatus'), modalContent: $('#eventCalendarDetailsContent'),
  };

  const typeLabels = { tech_day: 'Tech Day', seminar: 'Seminar', steam_fair: 'STEAM Fair', competition: 'Competition', exhibition: 'Exhibition', other: 'Other' };
  const statusLabels = { submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

  function escapeHTML(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function icons(root = document) { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) { try { if (window.UI?.toast) return window.UI.toast(type, title, message); } catch {} if (type === 'error') window.alert(`${title}: ${message}`); }
  function localDate(value) {
    if (!value) return null;
    const m = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function sameDate(a, b) { return !!a && !!b && dateKey(a) === dateKey(b); }
  function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
    const date = value instanceof Date ? value : localDate(value);
    return date ? date.toLocaleDateString('en-GB', options) : '—';
  }
  function formatDateRange(event) {
    const start = localDate(event?.eventStartDate);
    const end = localDate(event?.eventEndDate) || start;
    if (!start) return 'Date to be confirmed';
    if (!end || sameDate(start, end)) return formatDate(start);
    return `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  function startDate(event) { return localDate(event?.eventStartDate); }
  function endDate(event) { return localDate(event?.eventEndDate) || startDate(event); }
  function isEventOnDate(event, date) {
    const start = startDate(event); const end = endDate(event);
    if (!start || !end) return false;
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() && day <= new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  }
  function statusMarkup(status) {
    const safe = String(status || 'submitted').replace(/[^a-z_]/g, '') || 'submitted';
    return `<span class="events-status events-status--${escapeHTML(safe)}">${escapeHTML(statusLabels[safe] || safe.replace(/_/g, ' '))}</span>`;
  }
  function eventTypeClass(type) { return String(type || 'other').replace(/[^a-z_]/g, '') || 'other'; }
  function monthHasDate(date) { return date.getFullYear() === state.month.getFullYear() && date.getMonth() === state.month.getMonth(); }
  function eventsForDate(date) { return state.events.filter((event) => isEventOnDate(event, date)); }
  function upcomingEvents() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return state.events.filter((event) => {
      const end = endDate(event); return end && end >= today && event.status !== 'cancelled';
    }).sort((a, b) => (startDate(a)?.getTime() || Infinity) - (startDate(b)?.getTime() || Infinity));
  }

  function renderCalendar() {
    if (!els.grid) return;
    const monthName = state.month.toLocaleDateString('en-GB', { month: 'long' });
    if (els.monthLabel) els.monthLabel.textContent = monthName;
    if (els.yearLabel) els.yearLabel.textContent = String(state.month.getFullYear());

    const first = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first); gridStart.setDate(first.getDate() - mondayOffset);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart); day.setDate(gridStart.getDate() + index);
      const scheduled = eventsForDate(day);
      const isCurrentMonth = monthHasDate(day);
      const selected = dateKey(day) === state.selectedKey;
      const isToday = sameDate(day, today);
      const markerCount = Math.min(scheduled.length, 3);
      const extra = scheduled.length > markerCount ? `<span class="events-calendar-more">+${scheduled.length - markerCount}</span>` : '';
      const label = `${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${scheduled.length ? `, ${scheduled.length} scheduled event${scheduled.length === 1 ? '' : 's'}` : ''}`;
      cells.push(`<button type="button" class="events-calendar-day${isCurrentMonth ? '' : ' is-outside'}${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${scheduled.length ? ' has-events' : ''}" data-calendar-date="${dateKey(day)}" aria-label="${escapeHTML(label)}" aria-pressed="${selected ? 'true' : 'false'}"><span class="events-calendar-day__number">${day.getDate()}</span>${scheduled.length ? `<span class="events-calendar-day__markers">${Array.from({ length: markerCount }).map((_, i) => `<i class="events-calendar-marker events-calendar-marker--${eventTypeClass(scheduled[i]?.eventType)}"></i>`).join('')}${extra}</span>` : ''}</button>`);
    }
    els.grid.innerHTML = cells.join('');
  }

  function renderSelectedDay() {
    const date = localDate(state.selectedKey);
    if (!date) return;
    const items = eventsForDate(date);
    if (els.selectedTitle) els.selectedTitle.textContent = formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
    if (els.selectedCount) els.selectedCount.textContent = String(items.length);
    if (!els.dayList) return;
    if (state.loading) { els.dayList.innerHTML = '<div class="events-loading"><span></span> Loading schedule...</div>'; return; }
    if (!items.length) { els.dayList.innerHTML = '<div class="events-calendar-empty"><i data-feather="calendar"></i><strong>No events scheduled</strong><span>Select another date or add a new event.</span></div>'; icons(els.dayList); return; }
    els.dayList.innerHTML = items.map((event) => `<button class="events-calendar-event-card" type="button" data-event-open="${escapeHTML(event.id)}"><span class="events-calendar-event-card__date"><strong>${escapeHTML(formatDateRange(event))}</strong><small>${escapeHTML(typeLabels[event.eventType] || 'Other')}</small></span><span class="events-calendar-event-card__body"><strong>${escapeHTML(event.eventName || 'Untitled Event')}</strong><span>${escapeHTML(event.organizationName || event.governorate || 'Event details')}</span></span>${statusMarkup(event.status)}<i data-feather="chevron-right"></i></button>`).join('');
    icons(els.dayList);
  }

  function renderUpcoming() {
    if (!els.upcomingList) return;
    if (state.loading) { els.upcomingList.innerHTML = '<div class="events-loading"><span></span> Loading events...</div>'; return; }
    const list = upcomingEvents().slice(0, 7);
    if (!list.length) { els.upcomingList.innerHTML = '<div class="events-calendar-empty events-calendar-empty--compact"><i data-feather="calendar"></i><strong>No upcoming events</strong><span>New scheduled events will appear here.</span></div>'; icons(els.upcomingList); return; }
    els.upcomingList.innerHTML = list.map((event) => `<button class="events-calendar-upcoming-item" type="button" data-event-open="${escapeHTML(event.id)}"><span class="events-calendar-upcoming-item__date"><strong>${escapeHTML(formatDate(event.eventStartDate, { day: '2-digit', month: 'short' }))}</strong><small>${escapeHTML((event.eventStartDate || '').slice(0, 4) || '—')}</small></span><span class="events-calendar-upcoming-item__body"><span class="events-calendar-upcoming-item__meta">${escapeHTML(event.organizationName || event.governorate || 'Event execution')}</span><strong>${escapeHTML(event.eventName || 'Untitled Event')}</strong><small>${escapeHTML(typeLabels[event.eventType] || 'Other')} · ${escapeHTML(event.governorate || 'Location to be confirmed')}</small></span><i data-feather="arrow-up-right"></i></button>`).join('');
    icons(els.upcomingList);
  }

  function detailItem(label, value) { return `<div class="events-detail-item"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || '—')}</strong></div>`; }
  function detailList(items, empty) {
    if (!Array.isArray(items) || !items.length) return `<p class="events-table-muted">${escapeHTML(empty)}</p>`;
    return `<ul class="events-detail-list">${items.map((item) => `<li><strong>${escapeHTML(item.name || item.title || 'Untitled item')}</strong><small>${escapeHTML(`${item.quantity || 0} required${item.notes ? ` · ${item.notes}` : ''}`)}</small></li>`).join('')}</ul>`;
  }
  function renderDetails(event) {
    if (!els.modalContent) return;
    const map = String(event?.locationUrl || '').trim();
    const validMap = /^https?:\/\//i.test(map) ? map : '';
    const requirements = [event.requiresPower && 'Power points', event.requiresInternet && 'Internet', event.requiresSoundSystem && 'Sound system'].filter(Boolean).join(' · ') || 'No special utilities selected';
    els.modalContent.innerHTML = `
      <section class="events-detail-block"><h4><i data-feather="calendar"></i> Overview</h4><div class="events-detail-grid">${detailItem('Type', typeLabels[event.eventType] || 'Other')}${detailItem('Event dates', formatDateRange(event))}${detailItem('Organization', event.organizationName)}${detailItem('Expected attendees', event.expectedAttendees ? String(event.expectedAttendees) : '—')}</div></section>
      <section class="events-detail-block"><h4><i data-feather="map-pin"></i> Venue</h4><div class="events-detail-grid">${detailItem('Venue', event.venueName)}${detailItem('Governorate', event.governorate)}${detailItem('Setup time', event.venueSetupTime || '—')}</div>${validMap ? `<a class="events-location-link" target="_blank" rel="noopener noreferrer" href="${escapeHTML(validMap)}"><i data-feather="external-link"></i><span>Open map location</span></a>` : ''}</section>
      <section class="events-detail-block"><h4><i data-feather="user"></i> Contact</h4><div class="events-detail-grid">${detailItem('Contact person', event.contactPerson)}${detailItem('Phone', event.contactPhone)}${detailItem('Email', event.contactEmail)}${detailItem('Requested by', event.requesterName)}</div></section>
      <section class="events-detail-block"><h4><i data-feather="cpu"></i> Projects</h4>${detailList(event.projects, 'No projects were added.')}</section>
      <section class="events-detail-block"><h4><i data-feather="image"></i> Marketing Materials</h4>${detailList(event.marketingMaterials, 'No marketing materials were added.')}</section>
      <section class="events-detail-block"><h4><i data-feather="tool"></i> Venue Requirements</h4>${detailList(event.venueRequirements, 'No venue requirements were added.')}</section>
      <section class="events-detail-block events-detail-block--wide"><h4><i data-feather="sliders"></i> Notes</h4><div class="events-detail-item"><span>Utilities</span><p>${escapeHTML(requirements)}</p></div><div class="events-detail-item" style="margin-top:12px"><span>Venue Notes</span><p>${escapeHTML(event.venueNotes || 'No venue notes were added.')}</p></div></section>`;
    if (els.modalTitle) els.modalTitle.textContent = event.eventName || 'Event Details';
    if (els.modalSub) els.modalSub.textContent = `${event.eventCode || 'Event request'} · ${formatDateRange(event)}`;
    if (els.modalStatus) els.modalStatus.innerHTML = statusMarkup(event.status);
    icons(els.modalContent);
  }
  function openDetails(id) {
    const event = state.events.find((item) => String(item.id) === String(id));
    if (!event || !els.modal) return;
    state.activeEvent = event; renderDetails(event);
    els.modal.hidden = false; els.modal.setAttribute('aria-hidden', 'false');
  }
  function closeDetails() { if (!els.modal) return; els.modal.hidden = true; els.modal.setAttribute('aria-hidden', 'true'); state.activeEvent = null; }

  function setMonth(offset) { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + offset, 1); renderCalendar(); }
  function selectDate(key) {
    const date = localDate(key); if (!date) return;
    state.selectedKey = dateKey(date);
    if (!monthHasDate(date)) state.month = startOfMonth(date);
    renderCalendar(); renderSelectedDay();
  }
  async function loadEvents() {
    state.loading = true; renderSelectedDay(); renderUpcoming();
    try {
      const response = await fetch(`/api/events?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event schedule.');
      state.events = Array.isArray(data?.events) ? data.events : [];
      state.loading = false; renderCalendar(); renderSelectedDay(); renderUpcoming();
    } catch (error) {
      state.loading = false; renderCalendar();
      const message = escapeHTML(error?.message || 'Could not load the event schedule.');
      if (els.dayList) els.dayList.innerHTML = `<div class="events-calendar-empty"><i data-feather="alert-circle"></i><strong>Schedule unavailable</strong><span>${message}</span></div>`;
      if (els.upcomingList) els.upcomingList.innerHTML = `<div class="events-calendar-empty events-calendar-empty--compact"><i data-feather="alert-circle"></i><strong>Could not load events</strong><span>${message}</span></div>`;
      icons(); toast('error', 'Events Calendar', error?.message || 'Could not load the event schedule.');
    }
  }
  function bind() {
    els.prev?.addEventListener('click', () => setMonth(-1));
    els.next?.addEventListener('click', () => setMonth(1));
    els.today?.addEventListener('click', () => selectDate(dateKey(new Date())));
    els.grid?.addEventListener('click', (event) => { const button = event.target.closest('[data-calendar-date]'); if (button) selectDate(button.dataset.calendarDate); });
    [els.dayList, els.upcomingList].forEach((root) => root?.addEventListener('click', (event) => { const button = event.target.closest('[data-event-open]'); if (button) openDetails(button.dataset.eventOpen); }));
    els.modalClose?.addEventListener('click', closeDetails); els.modalDone?.addEventListener('click', closeDetails);
    els.modal?.addEventListener('click', (event) => { if (event.target === els.modal) closeDetails(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && els.modal && !els.modal.hidden) closeDetails(); });
  }
  document.addEventListener('DOMContentLoaded', () => { bind(); icons(); renderCalendar(); loadEvents(); });
})();

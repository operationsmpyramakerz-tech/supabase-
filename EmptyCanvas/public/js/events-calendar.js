(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const state = {
    events: [],
    month: startOfMonth(new Date()),
    selectedKey: dateKey(new Date()),
    activeList: 'upcoming',
    loading: true,
    activeEvent: null,
  };

  const els = {
    monthLabel: $('#eventsCalendarMonthLabel'),
    yearLabel: $('#eventsCalendarYearLabel'),
    grid: $('#eventsCalendarGrid'),
    prev: $('#eventsCalendarPrev'),
    next: $('#eventsCalendarNext'),
    today: $('#eventsCalendarToday'),
    addNew: $('#eventsCalendarAddNew'),
    listLabel: $('#eventsCalendarListLabel'),
    listTitle: $('#eventsCalendarListTitle'),
    listCount: $('#eventsCalendarListCount'),
    eventList: $('#eventsCalendarEventList'),
    upcomingCount: $('#eventsCalendarUpcomingCount'),
    pastCount: $('#eventsCalendarPastCount'),
    listTabs: Array.from(document.querySelectorAll('[data-calendar-list-tab]')),
    modal: $('#eventCalendarDetailsModal'),
    modalClose: $('#eventCalendarDetailsClose'),
    modalDone: $('#eventCalendarDetailsDone'),
    modalTitle: $('#eventCalendarDetailsTitle'),
    modalSub: $('#eventCalendarDetailsSubtitle'),
    modalStatus: $('#eventCalendarDetailsStatus'),
    modalContent: $('#eventCalendarDetailsContent'),
  };

  const typeLabels = {
    tech_day: 'Tech Day',
    seminar: 'Seminar',
    steam_fair: 'STEAM Fair',
    competition: 'Competition',
    exhibition: 'Exhibition',
    other: 'Other',
  };

  const statusLabels = {
    submitted: 'Submitted',
    under_review: 'Under review',
    approved: 'Approved',
    in_progress: 'In progress',
    completed: 'Done',
    cancelled: 'Cancelled',
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function icons(root = document) {
    try { window.feather?.replace({ width: 16, height: 16 }); } catch {}
  }

  function toast(type, title, message) {
    try {
      if (window.UI?.toast) {
        return window.UI.toast({ type, title, message, duration: 6000 });
      }
    } catch {}
    if (type === 'error' || type === 'info') {
      try { window.alert(`${title}: ${message}`); } catch {}
    }
  }

  function localDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (!Number.isNaN(date.getTime())) return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const fallback = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function startOfDay(value = new Date()) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function sameDate(a, b) {
    return !!a && !!b && dateKey(a) === dateKey(b);
  }

  function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
    const date = value instanceof Date ? value : localDate(value);
    return date ? date.toLocaleDateString('en-GB', options) : '—';
  }

  function formatDateRange(event) {
    const rawStart = event?.eventStartDate;
    const rawEnd = event?.eventEndDate;
    const startTime = rawStart ? new Date(rawStart) : null;
    const endTime = rawEnd ? new Date(rawEnd) : null;
    const start = localDate(rawStart);
    const end = localDate(rawEnd) || start;
    if (!start) return 'Date to be confirmed';
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    const startDateText = formatDate(start);
    const startClock = startTime && !Number.isNaN(startTime.getTime()) ? startTime.toLocaleTimeString('en-GB', timeOptions) : '';
    if (!end || !rawEnd || (endTime && startTime && endTime.getTime() === startTime.getTime())) return `${startDateText}${startClock ? ` · ${startClock}` : ''}`;
    const endClock = endTime && !Number.isNaN(endTime.getTime()) ? endTime.toLocaleTimeString('en-GB', timeOptions) : '';
    if (sameDate(start, end)) return `${startDateText}${startClock ? ` · ${startClock}` : ''}${endClock ? ` – ${endClock}` : ''}`;
    return `${startDateText}${startClock ? ` · ${startClock}` : ''} – ${formatDate(end)}${endClock ? ` · ${endClock}` : ''}`;
  }

  function startDate(event) {
    return localDate(event?.eventStartDate);
  }

  function endDate(event) {
    return localDate(event?.eventEndDate) || startDate(event);
  }

  function isEventOnDate(event, date) {
    const start = startDate(event);
    const end = endDate(event);
    if (!start || !end) return false;
    const day = startOfDay(date).getTime();
    return day >= startOfDay(start).getTime() && day <= startOfDay(end).getTime();
  }

  function statusMarkup(status) {
    const safe = String(status || 'submitted').replace(/[^a-z_]/g, '') || 'submitted';
    return `<span class="events-status events-status--${escapeHTML(safe)}">${escapeHTML(statusLabels[safe] || safe.replace(/_/g, ' '))}</span>`;
  }

  function eventTypeLabel(event) {
    const custom = String(event?.eventTypeCustom || '').trim();
    if (custom) return custom;
    const code = String(event?.eventType || 'other');
    if (typeLabels[code]) return typeLabels[code];
    return code.replace(/^custom_/, '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Other';
  }

  function eventTypeClass(type) {
    return String(type || 'other').replace(/[^a-z_]/g, '') || 'other';
  }

  function monthHasDate(date) {
    return date.getFullYear() === state.month.getFullYear() && date.getMonth() === state.month.getMonth();
  }

  function eventsForDate(date) {
    return state.events.filter((event) => isEventOnDate(event, date));
  }

  function selectedDate() {
    return localDate(state.selectedKey) || startOfDay(new Date());
  }

  function upcomingEvents() {
    const selected = selectedDate();
    return state.events
      .filter((event) => {
        const end = endDate(event);
        return end && end >= selected && String(event?.status || '') !== 'cancelled';
      })
      .sort((a, b) => (startDate(a)?.getTime() || Infinity) - (startDate(b)?.getTime() || Infinity));
  }

  function pastEvents() {
    const today = startOfDay(new Date());
    return state.events
      .filter((event) => {
        const end = endDate(event);
        return end && end < today;
      })
      .sort((a, b) => (startDate(b)?.getTime() || -Infinity) - (startDate(a)?.getTime() || -Infinity));
  }

  function listEvents() {
    return state.activeList === 'past' ? pastEvents() : upcomingEvents();
  }

  function renderCalendar() {
    if (!els.grid) return;

    if (els.monthLabel) {
      els.monthLabel.textContent = state.month.toLocaleDateString('en-GB', { month: 'long' });
    }
    if (els.yearLabel) {
      els.yearLabel.textContent = String(state.month.getFullYear());
    }

    const first = new Date(state.month.getFullYear(), state.month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - mondayOffset);
    const today = startOfDay(new Date());
    const cells = [];

    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const scheduled = eventsForDate(day);
      const isCurrentMonth = monthHasDate(day);
      const selected = dateKey(day) === state.selectedKey;
      const isToday = sameDate(day, today);
      const markerCount = Math.min(scheduled.length, 3);
      const extra = scheduled.length > markerCount
        ? `<span class="events-calendar-more">+${scheduled.length - markerCount}</span>`
        : '';
      const label = `${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${scheduled.length ? `, ${scheduled.length} scheduled event${scheduled.length === 1 ? '' : 's'}` : ''}`;

      cells.push(`<button type="button" class="events-calendar-day${isCurrentMonth ? '' : ' is-outside'}${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${scheduled.length ? ' has-events' : ''}" data-calendar-date="${dateKey(day)}" aria-label="${escapeHTML(label)}" aria-pressed="${selected ? 'true' : 'false'}"><span class="events-calendar-day__number">${day.getDate()}</span>${scheduled.length ? `<span class="events-calendar-day__markers">${Array.from({ length: markerCount }).map((_, i) => `<i class="events-calendar-marker events-calendar-marker--${eventTypeClass(scheduled[i]?.eventType)}"></i>`).join('')}${extra}</span>` : ''}</button>`);
    }

    els.grid.innerHTML = cells.join('');
  }

  function renderListTabs() {
    const upcomingTotal = upcomingEvents().length;
    const pastTotal = pastEvents().length;

    if (els.upcomingCount) els.upcomingCount.textContent = String(upcomingTotal);
    if (els.pastCount) els.pastCount.textContent = String(pastTotal);

    els.listTabs.forEach((tab) => {
      const selected = tab.dataset.calendarListTab === state.activeList;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
    });
  }

  function renderEventList() {
    if (!els.eventList) return;

    const selected = selectedDate();
    const isPast = state.activeList === 'past';
    const list = listEvents();

    if (els.listTitle) els.listTitle.textContent = isPast ? 'Past Events' : 'Upcoming Events';
    if (els.listLabel) {
      els.listLabel.textContent = isPast
        ? 'Before today'
        : `From ${formatDate(selected, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (els.listCount) els.listCount.textContent = state.loading ? '—' : String(list.length);
    if (els.eventList) els.eventList.setAttribute('aria-labelledby', isPast ? 'eventsCalendarPastTab' : 'eventsCalendarUpcomingTab');

    renderListTabs();

    if (state.loading) {
      els.eventList.innerHTML = '<div class="events-loading"><span></span> Loading events...</div>';
      return;
    }

    if (!list.length) {
      const title = isPast ? 'No past events' : 'No upcoming events';
      const copy = isPast
        ? 'Completed event history will appear here.'
        : 'No active events are scheduled from the selected date onward.';
      els.eventList.innerHTML = `<div class="events-calendar-empty events-calendar-empty--compact"><i data-feather="calendar"></i><strong>${title}</strong><span>${copy}</span></div>`;
      icons(els.eventList);
      return;
    }

    els.eventList.innerHTML = list.map((event) => `
      <button class="events-calendar-upcoming-item" type="button" data-event-open="${escapeHTML(event.id)}">
        <span class="events-calendar-upcoming-item__date">
          <strong>${escapeHTML(formatDate(event.eventStartDate, { day: '2-digit', month: 'short' }))}</strong>
          <small>${escapeHTML((event.eventStartDate || '').slice(0, 4) || '—')}</small>
        </span>
        <span class="events-calendar-upcoming-item__body">
          <span class="events-calendar-upcoming-item__meta">${escapeHTML(event.organizationName || event.governorate || 'Event execution')}</span>
          <strong>${escapeHTML(event.eventName || 'Untitled Event')}</strong>
          <small>${escapeHTML(eventTypeLabel(event))} · ${escapeHTML(event.governorate || 'Location to be confirmed')}</small>
        </span>
        <i data-feather="arrow-up-right"></i>
      </button>
    `).join('');
    icons(els.eventList);
  }

  function detailItem(label, value) {
    return `<div class="events-detail-item"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || '—')}</strong></div>`;
  }

  function detailList(items, empty) {
    if (!Array.isArray(items) || !items.length) {
      return `<p class="events-table-muted">${escapeHTML(empty)}</p>`;
    }
    return `<ul class="events-detail-list">${items.map((item) => `<li><strong>${escapeHTML(item.name || item.title || 'Untitled item')}</strong><small>${escapeHTML(`${item.quantity || 0} required${item.notes ? ` · ${item.notes}` : ''}`)}</small></li>`).join('')}</ul>`;
  }

  function renderDetails(event) {
    if (!els.modalContent) return;

    const map = String(event?.locationUrl || '').trim();
    const validMap = /^https?:\/\//i.test(map) ? map : '';
    const requirements = [
      event.requiresPower && 'Power points',
      event.requiresInternet && 'Internet',
      event.requiresSoundSystem && 'Sound system',
    ].filter(Boolean).join(' · ') || 'No special utilities selected';

    els.modalContent.innerHTML = `
      <section class="events-detail-block"><h4><i data-feather="calendar"></i> Overview</h4><div class="events-detail-grid">${detailItem('Type', eventTypeLabel(event))}${detailItem('Event dates', formatDateRange(event))}${detailItem('Organization', event.organizationName)}${detailItem('Expected attendees', event.expectedAttendees ? String(event.expectedAttendees) : '—')}</div></section>
      <section class="events-detail-block"><h4><i data-feather="map-pin"></i> Venue</h4><div class="events-detail-grid">${detailItem('Venue', event.venueName)}${detailItem('Governorate', event.governorate)}${detailItem('Setup time', event.venueSetupTime || '—')}</div>${validMap ? `<a class="events-location-link" target="_blank" rel="noopener noreferrer" href="${escapeHTML(validMap)}"><i data-feather="external-link"></i><span>Open map location</span></a>` : ''}</section>
      <section class="events-detail-block"><h4><i data-feather="user"></i> Contact</h4><div class="events-detail-grid">${detailItem('Contact person', event.contactPerson)}${detailItem('Phone', event.contactPhone)}${detailItem('Email', event.contactEmail)}${detailItem('Requested by', event.requesterName)}</div></section>
      <section class="events-detail-block"><h4><i data-feather="cpu"></i> Projects</h4>${detailList(event.projects, 'No projects were added.')}</section>
      <section class="events-detail-block"><h4><i data-feather="image"></i> Marketing Materials</h4>${detailList(event.marketingMaterials, 'No marketing materials were added.')}</section>
      <section class="events-detail-block"><h4><i data-feather="tool"></i> Venue Requirements</h4>${detailList(event.venueRequirements, 'No venue requirements were added.')}</section>
      <section class="events-detail-block events-detail-block--wide"><h4><i data-feather="sliders"></i> Notes</h4><div class="events-detail-item"><span>Utilities</span><p>${escapeHTML(requirements)}</p></div><div class="events-detail-item" style="margin-top:12px"><span>Venue Notes</span><p>${escapeHTML(event.venueNotes || 'No venue notes were added.')}</p></div></section>
    `;

    if (els.modalTitle) els.modalTitle.textContent = event.eventName || 'Event Details';
    if (els.modalSub) els.modalSub.textContent = `${event.eventCode || 'Event request'} · ${formatDateRange(event)}`;
    if (els.modalStatus) els.modalStatus.innerHTML = statusMarkup(event.status);
    icons(els.modalContent);
  }

  function openDetails(id) {
    const event = state.events.find((item) => String(item.id) === String(id));
    if (!event || !els.modal) return;

    state.activeEvent = event;
    renderDetails(event);
    els.modal.hidden = false;
    els.modal.setAttribute('aria-hidden', 'false');
  }

  function closeDetails() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute('aria-hidden', 'true');
    state.activeEvent = null;
  }

  function setMonth(offset) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + offset, 1);
    renderCalendar();
  }

  function selectDate(key) {
    const date = localDate(key);
    if (!date) return;

    state.selectedKey = dateKey(date);
    if (!monthHasDate(date)) state.month = startOfMonth(date);
    renderCalendar();
    renderEventList();
  }

  function setList(tab) {
    if (tab !== 'upcoming' && tab !== 'past') return;
    state.activeList = tab;
    renderEventList();
  }

  function openNewEvent() {
    const date = selectedDate();
    const overlapping = eventsForDate(date).filter((event) => String(event?.status || '') !== 'cancelled');
    const params = new URLSearchParams({ startDate: dateKey(date) });

    if (overlapping.length) {
      const codes = Array.from(new Set(overlapping.map((event) => String(event.eventCode || '').trim()).filter(Boolean)));
      const names = overlapping.map((event) => event.eventName || 'Untitled Event').slice(0, 2);
      const codeText = codes.length ? ` (${codes.join(', ')})` : '';
      toast('info', 'Schedule notice', `An event is already scheduled on ${formatDate(date)}${codeText}: ${names.join(', ')}. You can continue and coordinate the schedule.`);
      if (codes.length) params.set('conflictCodes', codes.join(','));
    }

    window.location.assign(`/events/new?${params.toString()}`);
  }

  async function loadEvents() {
    state.loading = true;
    renderEventList();

    try {
      const response = await fetch(`/api/events?_ts=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || 'Failed to load event schedule.');
      }

      state.events = Array.isArray(data?.events) ? data.events : [];
      state.loading = false;
      renderCalendar();
      renderEventList();
    } catch (error) {
      state.loading = false;
      renderCalendar();
      if (els.eventList) {
        const message = escapeHTML(error?.message || 'Could not load the event schedule.');
        els.eventList.innerHTML = `<div class="events-calendar-empty events-calendar-empty--compact"><i data-feather="alert-circle"></i><strong>Could not load events</strong><span>${message}</span></div>`;
      }
      icons();
      toast('error', 'Events Calendar', error?.message || 'Could not load the event schedule.');
    }
  }

  function bind() {
    els.prev?.addEventListener('click', () => setMonth(-1));
    els.next?.addEventListener('click', () => setMonth(1));
    els.today?.addEventListener('click', () => selectDate(dateKey(new Date())));
    els.addNew?.addEventListener('click', openNewEvent);

    els.grid?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-calendar-date]');
      if (button) selectDate(button.dataset.calendarDate);
    });

    els.listTabs.forEach((tab) => {
      tab.addEventListener('click', () => setList(tab.dataset.calendarListTab));
    });

    els.eventList?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-event-open]');
      if (button) openDetails(button.dataset.eventOpen);
    });

    els.modalClose?.addEventListener('click', closeDetails);
    els.modalDone?.addEventListener('click', closeDetails);
    els.modal?.addEventListener('click', (event) => {
      if (event.target === els.modal) closeDetails();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.modal && !els.modal.hidden) closeDetails();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    icons();
    renderCalendar();
    renderEventList();
    loadEvents();
  });
})();

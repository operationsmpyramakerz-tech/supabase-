(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { events: [], loading: false, query: '', status: 'all', activeEvent: null };
  const els = {
    body: $('#eventsTableBody'), total: $('#eventsTotalCount'), pending: $('#eventsPendingCount'), progress: $('#eventsProgressCount'),
    search: $('#eventsSearchInput'), status: $('#eventsStatusFilter'), refresh: $('#eventsRefreshBtn'),
    modal: $('#eventDetailsModal'), modalClose: $('#eventDetailsClose'), modalDone: $('#eventDetailsDone'),
    modalTitle: $('#eventDetailsTitle'), modalSub: $('#eventDetailsSubtitle'), modalStatus: $('#eventDetailsStatus'), modalContent: $('#eventDetailsContent'),
  };

  const typeLabels = { tech_day: 'Tech Day', seminar: 'Seminar', steam_fair: 'STEAM Fair', competition: 'Competition', exhibition: 'Exhibition', other: 'Other' };
  const statusLabels = { submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
  function icons(root = document) { try { window.feather?.replace({ width: 16, height: 16 }); } catch {} }
  function toast(type, title, message) {
    try { if (window.UI?.toast) return window.UI.toast(type, title, message); } catch {}
    if (type === 'error') window.alert(`${title}: ${message}`);
  }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function statusMarkup(status) {
    const safe = String(status || 'submitted').replace(/[^a-z_]/g, '') || 'submitted';
    return `<span class="events-status events-status--${escapeHTML(safe)}">${escapeHTML(statusLabels[safe] || safe.replace(/_/g, ' '))}</span>`;
  }
  function safeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }
  function filteredEvents() {
    const query = String(state.query || '').trim().toLowerCase();
    const status = String(state.status || 'all');
    return (state.events || []).filter((event) => {
      if (status !== 'all' && event.status !== status) return false;
      if (!query) return true;
      return [event.eventCode, event.eventName, event.eventType, event.organizationName, event.governorate, event.city, event.requesterName].join(' ').toLowerCase().includes(query);
    });
  }
  function updateStats() {
    const list = state.events || [];
    if (els.total) els.total.textContent = String(list.length);
    if (els.pending) els.pending.textContent = String(list.filter((item) => ['submitted', 'under_review'].includes(item.status)).length);
    if (els.progress) els.progress.textContent = String(list.filter((item) => item.status === 'in_progress').length);
  }
  function renderTable() {
    if (!els.body) return;
    if (state.loading) {
      els.body.innerHTML = '<tr><td colspan="8"><div class="events-loading"><span></span> Loading event requests...</div></td></tr>';
      return;
    }
    const list = filteredEvents();
    if (!list.length) {
      els.body.innerHTML = '<tr><td colspan="8"><div class="events-empty"><i data-feather="calendar"></i><span>No event requests match this view.</span></div></td></tr>';
      icons(els.body);
      return;
    }
    els.body.innerHTML = list.map((event) => {
      const dates = event.eventStartDate ? `${formatDate(event.eventStartDate)}${event.eventEndDate && event.eventEndDate !== event.eventStartDate ? ` – ${formatDate(event.eventEndDate)}` : ''}` : '—';
      const location = [event.city, event.governorate].filter(Boolean).join(', ') || '—';
      return `<tr>
        <td><span class="events-ref">${escapeHTML(event.eventCode || 'Pending ref.')}</span></td>
        <td><strong class="events-table-title" title="${escapeHTML(event.eventName)}">${escapeHTML(event.eventName || 'Untitled Event')}</strong><span class="events-table-muted">${escapeHTML(typeLabels[event.eventType] || 'Other')}</span></td>
        <td><span class="events-table-title" title="${escapeHTML(event.organizationName || '')}">${escapeHTML(event.organizationName || '—')}</span></td>
        <td>${escapeHTML(dates)}</td>
        <td><span class="events-table-muted" title="${escapeHTML(location)}">${escapeHTML(location)}</span></td>
        <td><span class="events-table-muted">${escapeHTML(event.requesterName || '—')}</span></td>
        <td>${statusMarkup(event.status)}</td>
        <td><button class="events-table-open" type="button" data-event-open="${escapeHTML(event.id)}">View</button></td>
      </tr>`;
    }).join('');
  }
  async function loadEvents({ silent = false } = {}) {
    if (!silent) { state.loading = true; renderTable(); }
    try {
      const response = await fetch(`/api/events?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event requests.');
      state.events = Array.isArray(data?.events) ? data.events : [];
      updateStats();
      state.loading = false;
      renderTable();
    } catch (error) {
      state.loading = false;
      if (els.body) els.body.innerHTML = `<tr><td colspan="8"><div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event requests.')}</span></div></td></tr>`;
      icons(els.body);
      toast('error', 'Events', error?.message || 'Could not load event requests.');
    }
  }
  function detailItem(label, value) {
    return `<div class="events-detail-item"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || '—')}</strong></div>`;
  }
  function detailList(items, { empty = 'No items were added.', component = false } = {}) {
    if (!Array.isArray(items) || !items.length) return `<p class="events-table-muted">${escapeHTML(empty)}</p>`;
    return `<ul class="events-detail-list">${items.map((item) => {
      const title = component ? item.name : item.title;
      const line = component ? `${item.quantity || 0} required` : `${item.quantity || 0} required`;
      const notes = component ? item.notes : [item.description, item.notes].filter(Boolean).join(' · ');
      return `<li><strong>${escapeHTML(title || 'Untitled item')}</strong><small>${escapeHTML(line)}${notes ? ` · ${escapeHTML(notes)}` : ''}</small></li>`;
    }).join('')}</ul>`;
  }
  function renderDetails(event) {
    if (!els.modalContent) return;
    const mapUrl = safeUrl(event.locationUrl);
    const venueItems = [
      detailItem('Venue', event.venueName), detailItem('Type', event.venueType),
      detailItem('Governorate', event.governorate), detailItem('City / Area', event.city),
      detailItem('District', event.district), detailItem('Setup time', formatDateTime(event.venueSetupTime)),
    ].join('');
    const requirements = [event.requiresPower && 'Power points', event.requiresInternet && 'Internet', event.requiresSoundSystem && 'Sound system'].filter(Boolean).join(' · ') || 'No special utilities selected';
    els.modalContent.innerHTML = `
      <section class="events-detail-block"><h4><i data-feather="calendar"></i> Overview</h4><div class="events-detail-grid">${detailItem('Type', typeLabels[event.eventType] || 'Other')}${detailItem('Event dates', event.eventStartDate ? `${formatDate(event.eventStartDate)}${event.eventEndDate && event.eventEndDate !== event.eventStartDate ? ` – ${formatDate(event.eventEndDate)}` : ''}` : '—')}${detailItem('Organization', event.organizationName)}${detailItem('Expected attendees', event.expectedAttendees ? String(event.expectedAttendees) : '—')}</div></section>
      <section class="events-detail-block"><h4><i data-feather="user"></i> Contact</h4><div class="events-detail-grid">${detailItem('Contact person', event.contactPerson)}${detailItem('Phone', event.contactPhone)}${detailItem('Email', event.contactEmail)}${detailItem('Requested by', event.requesterName)}</div></section>
      <section class="events-detail-block events-detail-block--wide"><h4><i data-feather="users"></i> Target audience</h4><div class="events-detail-item"><p>${escapeHTML(event.audience || 'No audience details were added.')}</p></div></section>
      <section class="events-detail-block"><h4><i data-feather="cpu"></i> Projects</h4>${detailList(event.projects, { empty: 'No projects were added.' })}</section>
      <section class="events-detail-block"><h4><i data-feather="image"></i> Marketing Materials</h4>${detailList(event.marketingMaterials, { empty: 'No marketing materials were added.', component: true })}</section>
      <section class="events-detail-block"><h4><i data-feather="tool"></i> Venue Requirements</h4>${detailList(event.venueRequirements, { empty: 'No venue requirements were added.', component: true })}</section>
      <section class="events-detail-block"><h4><i data-feather="map-pin"></i> Venue & Location</h4><div class="events-detail-grid">${venueItems}</div><div class="events-detail-item" style="margin-top:12px"><span>Address</span><p>${escapeHTML(event.address || '—')}</p></div>${mapUrl ? `<a class="events-back-link" style="margin-top:12px" target="_blank" rel="noopener noreferrer" href="${escapeHTML(mapUrl)}"><i data-feather="external-link"></i><span>Open map location</span></a>` : ''}</section>
      <section class="events-detail-block"><h4><i data-feather="sliders"></i> Site Notes</h4><div class="events-detail-item"><span>Utilities</span><p>${escapeHTML(requirements)}</p></div><div class="events-detail-item" style="margin-top:12px"><span>Venue Notes</span><p>${escapeHTML(event.venueNotes || 'No venue notes were added.')}</p></div></section>
      ${event.operationsNotes ? `<section class="events-detail-block events-detail-block--wide"><h4><i data-feather="clipboard"></i> Operations Notes</h4><div class="events-detail-item"><p>${escapeHTML(event.operationsNotes)}</p></div></section>` : ''}
    `;
    if (els.modalTitle) els.modalTitle.textContent = event.eventName || 'Event Details';
    if (els.modalSub) els.modalSub.textContent = `${event.eventCode || 'Event request'} · Submitted ${formatDateTime(event.createdAt)}`;
    if (els.modalStatus) {
      const isAdmin = !!window.OpsPageAccess?.isAdmin?.();
      els.modalStatus.innerHTML = `${statusMarkup(event.status)}${isAdmin ? `<div class="events-status-control"><select id="eventStatusEdit">${Object.entries(statusLabels).map(([key, label]) => `<option value="${key}" ${key === event.status ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select><button class="events-primary-btn" id="eventStatusSave" type="button">Update</button></div>` : ''}`;
      const save = $('#eventStatusSave', els.modalStatus);
      save?.addEventListener('click', () => updateStatus(event.id));
    }
    icons(els.modalContent);
  }
  async function openDetails(id) {
    const clean = String(id || '').trim();
    if (!clean || !els.modal) return;
    els.modal.hidden = false;
    els.modal.setAttribute('aria-hidden', 'false');
    if (els.modalContent) els.modalContent.innerHTML = '<div class="events-loading"><span></span> Loading request details...</div>';
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(clean)}?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load event details.');
      state.activeEvent = data.event;
      renderDetails(data.event);
    } catch (error) {
      if (els.modalContent) els.modalContent.innerHTML = `<div class="events-empty"><i data-feather="alert-circle"></i><span>${escapeHTML(error?.message || 'Could not load event details.')}</span></div>`;
      icons(els.modalContent);
    }
  }
  function closeDetails() {
    if (!els.modal) return;
    els.modal.hidden = true;
    els.modal.setAttribute('aria-hidden', 'true');
    state.activeEvent = null;
  }
  async function updateStatus(id) {
    const select = $('#eventStatusEdit');
    const status = select?.value;
    if (!id || !status) return;
    const save = $('#eventStatusSave');
    if (save) { save.disabled = true; save.textContent = 'Updating...'; }
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update event status.');
      state.events = state.events.map((item) => item.id === id ? data.event : item);
      updateStats(); renderTable(); renderDetails(data.event);
      toast('success', 'Events', 'Event status updated.');
    } catch (error) {
      toast('error', 'Events', error?.message || 'Could not update event status.');
      if (save) { save.disabled = false; save.textContent = 'Update'; }
    }
  }
  function bind() {
    els.search?.addEventListener('input', (event) => { state.query = event.target.value; renderTable(); });
    els.status?.addEventListener('change', (event) => { state.status = event.target.value; renderTable(); });
    els.refresh?.addEventListener('click', () => loadEvents());
    els.body?.addEventListener('click', (event) => { const button = event.target.closest('[data-event-open]'); if (button) openDetails(button.dataset.eventOpen); });
    els.modalClose?.addEventListener('click', closeDetails); els.modalDone?.addEventListener('click', closeDetails);
    els.modal?.addEventListener('click', (event) => { if (event.target === els.modal) closeDetails(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && els.modal && !els.modal.hidden) closeDetails(); });
  }
  document.addEventListener('DOMContentLoaded', () => { bind(); icons(); loadEvents(); });
})();

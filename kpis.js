(function () {
  'use strict';

  const state = {
    users: [],
    standards: [],
    reviews: [],
    departments: [],
    positions: [],
    selectedReviewId: '',
    selectedEmployeeId: '',
    currentUser: null,
  };

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function norm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function monthInput(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function fmtMonth(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return value || '—';
    return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  function toast(message) {
    alert(window.OpsSafeMessage?.sanitize ? window.OpsSafeMessage.sanitize(message) : message);
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.message || `Request failed (${response.status})`);
    }
    return data || {};
  }

  function feather() {
    try {
      window.feather?.replace();
    } catch {}
  }

  function setOptions(select, items, { allLabel = '', valueKey = '', labelKey = '' } = {}) {
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML =
      (allLabel ? `<option value="">${esc(allLabel)}</option>` : '') +
      (items || [])
        .map((item) => {
          const value = valueKey ? item?.[valueKey] : item;
          const label = labelKey ? item?.[labelKey] : item;
          return `<option value="${esc(value)}">${esc(label)}</option>`;
        })
        .join('');
    if ([...select.options].some((option) => option.value === currentValue)) {
      select.value = currentValue;
    }
  }

  function userById(id) {
    return state.users.find((user) => String(user.id) === String(id)) || null;
  }

  function standardById(id) {
    return state.standards.find((standard) => String(standard.id) === String(id)) || null;
  }

  function currentUserFromMeta(data) {
    const raw = data?.currentUser || {};
    const byId = raw.id ? userById(raw.id) : null;
    const byName = raw.name ? state.users.find((user) => norm(user.name) === norm(raw.name)) : null;
    return byId || byName || {
      id: String(raw.id || '').trim(),
      name: String(raw.name || '').trim(),
      department: String(raw.department || '').trim(),
      position: String(raw.position || '').trim(),
      photoUrl: raw.photoUrl || '',
      email: raw.email || '',
    };
  }

  function isCurrentUserReview(summary) {
    if (!summary || !state.currentUser) return false;
    const currentId = String(state.currentUser.id || '').trim();
    const reviewUserId = String(summary.teamMemberId || '').trim();
    if (currentId && reviewUserId && currentId === reviewUserId) return true;
    return norm(state.currentUser.name) && norm(state.currentUser.name) === norm(summary.teamMemberName);
  }

  function matchingStandards(user) {
    if (!user) return state.standards;
    const department = norm(user.department);
    const position = norm(user.position);
    const exact = state.standards.filter(
      (standard) => norm(standard.department) === department && norm(standard.rolePosition) === position,
    );
    return exact.length
      ? exact
      : state.standards.filter(
          (standard) => norm(standard.department) === department || norm(standard.rolePosition) === position,
        );
  }

  function setCurrentUserBadge() {
    const badge = $('kpiCurrentEmployeeBadge');
    if (!badge) return;
    const user = state.currentUser || userById(state.selectedEmployeeId);
    const name = user?.name || 'Current user';
    const meta = [user?.department, user?.position].filter(Boolean).join(' / ');
    badge.innerHTML = `<strong>${esc(name)}</strong>${meta ? `<span>${esc(meta)}</span>` : ''}`;
  }

  function renderChart(points) {
    const chart = $('kpiChart');
    if (!chart) return;

    const rows = (points || []).slice(-12);
    if (!rows.length) {
      chart.innerHTML = '<div class="kpis-chart-empty">No KPI graph data yet. Create a monthly review first.</div>';
      return;
    }

    chart.innerHTML = rows
      .map((point) => {
        const value = Math.max(0, Math.min(100, num(point.finalPercentage, 0)));
        return `<div class="kpis-bar" title="${esc(fmtMonth(point.reviewMonth))}: ${value.toFixed(1)}%"><div class="kpis-bar__value">${value.toFixed(0)}%</div><div class="kpis-bar__track"><div class="kpis-bar__fill" style="--value:${value}"></div></div><div class="kpis-bar__label">${esc(fmtMonth(point.reviewMonth))}</div></div>`;
      })
      .join('');
  }

  function updateScore(summary) {
    const score = Math.max(0, Math.min(100, num(summary?.finalPercentage, 0)));
    $('kpiScoreRing')?.style.setProperty('--score', score.toFixed(2));
    if ($('kpiScoreValue')) $('kpiScoreValue').textContent = summary ? `${score.toFixed(1)}%` : '—';
    if ($('kpiScoreRating')) $('kpiScoreRating').textContent = summary?.performanceRating || 'No review selected';
    if ($('kpiScoreMonth')) $('kpiScoreMonth').textContent = summary ? fmtMonth(summary.reviewMonth) : '—';
  }

  async function loadGraph() {
    const user = state.currentUser || userById(state.selectedEmployeeId);
    const currentUserId = String(user?.id || state.selectedEmployeeId || '').trim();
    state.selectedEmployeeId = currentUserId;
    setCurrentUserBadge();

    if (!currentUserId) {
      if ($('kpiGraphTitle')) $('kpiGraphTitle').textContent = 'Current user KPI graph';
      renderChart([]);
      updateScore(null);
      return;
    }

    if ($('kpiGraphTitle')) {
      $('kpiGraphTitle').textContent = user?.name ? `${user.name} KPI graph` : 'Current user KPI graph';
    }

    const data = await api(`/api/kpis/graph?teamMemberId=${encodeURIComponent(currentUserId)}`);
    const points = data.points || [];
    renderChart(points);
    updateScore(points.slice(-1)[0] || null);
  }

  function renderReviews() {
    const body = $('kpiReviewsBody');
    if (!body) return;

    if (!state.reviews.length) {
      body.innerHTML = '<tr><td colspan="7">No KPI reviews found.</td></tr>';
      return;
    }

    body.innerHTML = state.reviews
      .map(
        (review) => `<tr><td><strong>${esc(review.teamMemberName || '—')}</strong><div class="muted">${esc(review.standardTitle || '—')}</div></td><td>${esc(review.department || '—')}</td><td>${esc(review.rolePosition || '—')}</td><td>${esc(fmtMonth(review.reviewMonth))}</td><td><strong>${num(review.finalPercentage, 0).toFixed(1)}%</strong><div class="muted">${esc(review.performanceRating || '')}</div></td><td><span class="kpis-pill">${esc(review.status || 'draft')}</span></td><td><div class="kpis-row-actions"><button class="kpis-btn kpis-btn--ghost" type="button" data-open-review="${esc(review.reviewId)}">Open</button></div></td></tr>`,
      )
      .join('');

    body.querySelectorAll('[data-open-review]').forEach((button) => {
      button.addEventListener('click', () => openScoreModal(button.dataset.openReview));
    });
  }

  function renderStandards() {
    const box = $('kpiStandardsList');
    if (!box) return;

    if (!state.standards.length) {
      box.innerHTML = '<div class="kpis-chart-empty">No KPI standards yet.</div>';
      return;
    }

    box.innerHTML = state.standards
      .map(
        (standard) => `<button class="kpis-standard-card" type="button" data-standard-id="${esc(standard.id)}"><h3>${esc(standard.title || 'Untitled standard')}</h3><p>${esc(standard.department || '—')} / ${esc(standard.rolePosition || '—')} / ${esc(standard.academicYear || '—')}</p><div class="kpis-standard-meta"><span class="kpis-pill">${standard.isActive ? 'Active' : 'Inactive'}</span></div></button>`,
      )
      .join('');

    box.querySelectorAll('[data-standard-id]').forEach((button) => {
      button.addEventListener('click', () => previewStandard(button.dataset.standardId));
    });
  }

  async function loadReviews() {
    const query = new URLSearchParams();
    const department = $('reviewDepartmentFilter')?.value || '';
    const position = $('reviewPositionFilter')?.value || '';
    const month = $('reviewMonthFilter')?.value || '';

    if (department) query.set('department', department);
    if (position) query.set('rolePosition', position);
    if (month) {
      query.set('from', `${month}-01`);
      query.set('to', `${month}-01`);
    }

    const data = await api(`/api/kpis/reviews${query.toString() ? `?${query}` : ''}`);
    state.reviews = data.reviews || [];
    renderReviews();
  }

  function defaultAcademicRange() {
    const today = new Date();
    const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
    return { from: start, to: start + 1 };
  }

  function fillYearSelect(select, selected, { from = 2020, to = new Date().getFullYear() + 8 } = {}) {
    if (!select) return;
    const years = [];
    for (let year = from; year <= to; year += 1) years.push(year);
    select.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
    if (years.includes(Number(selected))) select.value = String(selected);
  }

  function syncAcademicYear() {
    const fromSelect = $('academicYearFromSelect');
    const toSelect = $('academicYearToSelect');
    const hidden = $('standardAcademicYearInput');
    if (!fromSelect || !toSelect || !hidden) return;
    const from = Number(fromSelect.value);
    let to = Number(toSelect.value);
    if (Number.isFinite(from) && Number.isFinite(to) && to <= from) {
      to = from + 1;
      if (![...toSelect.options].some((option) => option.value === String(to))) {
        toSelect.appendChild(new Option(String(to), String(to)));
      }
      toSelect.value = String(to);
    }
    hidden.value = `${fromSelect.value}-${toSelect.value}`;
  }

  function initAcademicYearPicker() {
    const range = defaultAcademicRange();
    fillYearSelect($('academicYearFromSelect'), range.from);
    fillYearSelect($('academicYearToSelect'), range.to);
    syncAcademicYear();
  }

  async function loadMeta() {
    const data = await api('/api/kpis/meta');
    state.users = data.users || [];
    state.standards = data.standards || [];
    state.departments = data.departments || [];
    state.positions = data.positions || [];
    state.currentUser = currentUserFromMeta(data);
    state.selectedEmployeeId = String(state.currentUser?.id || '').trim() || state.selectedEmployeeId || state.users[0]?.id || '';

    setOptions($('reviewDepartmentFilter'), state.departments, { allLabel: 'All departments' });
    setOptions($('reviewPositionFilter'), state.positions, { allLabel: 'All roles' });
    setOptions($('reviewEmployeeSelect'), state.users, { allLabel: 'Choose employee', valueKey: 'id', labelKey: 'name' });
    setOptions($('standardDepartmentSelect'), state.departments, { allLabel: 'Choose department' });
    setOptions($('standardPositionSelect'), state.positions, { allLabel: 'Choose role / position' });
    initAcademicYearPicker();
    setCurrentUserBadge();
    renderStandards();
    await Promise.all([loadReviews(), loadGraph()]);
    updateReviewStandardOptions();
  }

  function openModal(name) {
    const element = $(`${name}Modal`);
    if (!element) return;
    element.hidden = false;
    element.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kpis-modal-open');
    feather();
  }

  function closeModal(name) {
    const element = $(`${name}Modal`);
    if (!element) return;
    element.hidden = true;
    element.setAttribute('aria-hidden', 'true');
    if (![...document.querySelectorAll('.kpis-modal')].some((modal) => !modal.hidden)) {
      document.body.classList.remove('kpis-modal-open');
    }
  }

  function cleanSectionTitle(value, fallback = 'New section') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback;
  }

  function updateSectionNumbers() {
    document.querySelectorAll('#kpiItemsEditor .kpis-section-card').forEach((section, sectionIndex) => {
      section.dataset.sectionOrder = String(sectionIndex + 1);
      const orderBadge = section.querySelector('[data-section-order-label]');
      if (orderBadge) orderBadge.textContent = `Section ${sectionIndex + 1}`;
      section.querySelectorAll('.kpis-item-row').forEach((row, rowIndex) => {
        row.dataset.subsectionOrder = String(rowIndex + 1);
        const subNumber = row.querySelector('[data-subsection-number]');
        if (subNumber) subNumber.textContent = String(rowIndex + 1);
      });
    });
  }

  function addKpiSection(title = '') {
    const wrapper = $('kpiItemsEditor');
    if (!wrapper) return null;
    const sectionIndex = wrapper.querySelectorAll('.kpis-section-card').length + 1;
    const sectionTitle = cleanSectionTitle(title, `Section ${sectionIndex}`);
    const section = document.createElement('section');
    section.className = 'kpis-section-card';
    section.dataset.section = sectionTitle;
    section.dataset.sectionOrder = String(sectionIndex);
    section.innerHTML = `
      <div class="kpis-section-card__head">
        <div>
          <span class="kpis-section-card__order" data-section-order-label>Section ${sectionIndex}</span>
          <h4 data-section-title>${esc(sectionTitle)}</h4>
        </div>
        <div class="kpis-section-card__actions">
          <button class="kpis-btn kpis-btn--ghost" type="button" data-add-row-to-section><i data-feather="plus"></i><span>Add row</span></button>
          <button class="kpis-btn kpis-btn--ghost kpis-icon-only" type="button" data-remove-section title="Remove section"><i data-feather="trash-2"></i></button>
        </div>
      </div>
      <label>Section description<textarea class="kpis-textarea" data-section-description rows="2"></textarea></label>
      <div class="kpis-section-rows" data-section-rows></div>
    `;
    section.querySelector('[data-add-row-to-section]')?.addEventListener('click', () => addKpiRow({ sectionElement: section, targetPercent: 100 }));
    section.querySelector('[data-remove-section]')?.addEventListener('click', () => {
      if (document.querySelectorAll('#kpiItemsEditor .kpis-section-card').length <= 1) {
        toast('At least one section is required.');
        return;
      }
      section.remove();
      updateSectionNumbers();
    });
    wrapper.appendChild(section);
    feather();
    updateSectionNumbers();
    return section;
  }

  function promptAndAddSection() {
    const title = window.prompt('Enter section title');
    if (title === null) return;
    const section = addKpiSection(title);
    if (section) addKpiRow({ sectionElement: section, targetPercent: 100 });
  }

  function addKpiRow(value = {}) {
    const wrapper = $('kpiItemsEditor');
    if (!wrapper) return;
    let section = value.sectionElement || wrapper.querySelector('.kpis-section-card:last-of-type');
    if (!section) section = addKpiSection('Section 1');
    const rows = section.querySelector('[data-section-rows]');
    if (!rows) return;
    const rowIndex = rows.querySelectorAll('.kpis-item-row').length + 1;
    const row = document.createElement('div');
    row.className = 'kpis-item-row kpis-item-row--sectioned';
    row.dataset.subsectionOrder = String(rowIndex);
    row.innerHTML = `
      <div class="kpis-item-row__top kpis-item-row__top--sectioned">
        <label>Sub #<span class="kpis-sub-number" data-subsection-number>${rowIndex}</span></label>
        <label>Subsection<input class="kpis-input" data-kpi-field="subsection" value="${esc(value.subsection || '')}" /></label>
        <label>Weight %<input class="kpis-input" data-kpi-field="weightPercent" type="number" min="0" max="100" step="0.01" value="${esc(value.weightPercent ?? '')}" /></label>
        <label>Target %<input class="kpis-input" data-kpi-field="targetPercent" type="number" min="0" max="100" step="0.01" value="${esc(value.targetPercent ?? 100)}" /></label>
        <button class="kpis-btn kpis-btn--ghost kpis-icon-only" data-remove-kpi-row type="button" title="Remove row"><i data-feather="trash-2"></i></button>
      </div>
      <label>Subsection description<textarea class="kpis-textarea" data-kpi-field="subsectionDescription" rows="2">${esc(value.subsectionDescription || '')}</textarea></label>
    `;
    row.querySelector('[data-remove-kpi-row]')?.addEventListener('click', () => {
      row.remove();
      updateSectionNumbers();
    });
    rows.appendChild(row);
    feather();
    updateSectionNumbers();
  }

  function collectKpiRows() {
    const items = [];
    document.querySelectorAll('#kpiItemsEditor .kpis-section-card').forEach((section, sectionIndex) => {
      const sectionOrder = sectionIndex + 1;
      const sectionTitle = cleanSectionTitle(section.dataset.section || section.querySelector('[data-section-title]')?.textContent, `Section ${sectionOrder}`);
      const sectionDescription = section.querySelector('[data-section-description]')?.value || '';
      section.querySelectorAll('.kpis-item-row').forEach((row, rowIndex) => {
        const item = {
          sectionOrder,
          section: sectionTitle,
          sectionDescription,
          subsectionOrder: rowIndex + 1,
        };
        row.querySelectorAll('[data-kpi-field]').forEach((field) => {
          item[field.dataset.kpiField] = field.value;
        });
        items.push(item);
      });
    });
    return items;
  }

  function openStandardModal() {
    const form = $('standardForm');
    form?.reset();
    setOptions($('standardDepartmentSelect'), state.departments, { allLabel: 'Choose department' });
    setOptions($('standardPositionSelect'), state.positions, { allLabel: 'Choose role / position' });
    initAcademicYearPicker();
    if ($('kpiItemsEditor')) $('kpiItemsEditor').innerHTML = '';
    const section = addKpiSection('Section 1');
    if (section) addKpiRow({ sectionElement: section, targetPercent: 100 });
    openModal('standard');
  }

  async function previewStandard(id) {
    const data = await api(`/api/kpis/standards?id=${encodeURIComponent(id)}`);
    const standard = standardById(id) || data.standards?.[0];
    const lines = (data.sections || [])
      .map((section) => `${section.section} (${Number(section.weightPercent || 0).toFixed(1)}%)`)
      .join('\n');
    toast(`${standard?.title || 'KPI standard'}\n\n${lines || 'No active KPI rows.'}`);
  }

  function updateReviewStandardOptions() {
    const select = $('reviewStandardSelect');
    if (!select) return;
    const user = userById($('reviewEmployeeSelect')?.value || state.selectedEmployeeId) || state.currentUser;
    const list = matchingStandards(user);
    select.innerHTML =
      '<option value="">Choose KPI standard</option>' +
      list
        .map(
          (standard) => `<option value="${esc(standard.id)}">${esc(standard.title)} — ${esc(standard.department)} / ${esc(standard.rolePosition)}</option>`,
        )
        .join('');
    if (!list.length) select.innerHTML = '<option value="">No matching standards</option>';
  }

  function openReviewModal() {
    const form = $('reviewForm');
    form?.reset();
    if (form?.elements.reviewMonth) form.elements.reviewMonth.value = monthInput(new Date());
    if ($('reviewEmployeeSelect') && state.selectedEmployeeId) $('reviewEmployeeSelect').value = state.selectedEmployeeId;
    updateReviewStandardOptions();
    openModal('review');
  }

  function groupDetails(details) {
    const map = new Map();
    for (const item of details || []) {
      const key = `${item.sectionOrder}:${item.section}`;
      if (!map.has(key)) {
        map.set(key, { section: item.section, sectionDescription: item.sectionDescription, items: [] });
      }
      map.get(key).items.push(item);
    }
    return [...map.values()];
  }

  async function openScoreModal(id) {
    const data = await api(`/api/kpis/reviews/${encodeURIComponent(id)}`);
    const summary = data.summary || {};
    const details = data.details || [];
    state.selectedReviewId = id;

    if (isCurrentUserReview(summary)) {
      updateScore(summary);
    }

    if ($('scoreModalKicker')) $('scoreModalKicker').textContent = `${fmtMonth(summary.reviewMonth)} / ${summary.status || 'draft'}`;
    if ($('scoreModalTitle')) $('scoreModalTitle').textContent = summary.teamMemberName || 'Employee KPI review';
    if ($('scoreModalSub')) $('scoreModalSub').textContent = `${summary.department || '—'} / ${summary.rolePosition || '—'} / ${summary.standardTitle || '—'}`;
    if ($('scoreStatusSelect')) $('scoreStatusSelect').value = summary.status || 'draft';

    const wrapper = $('scoreItemsEditor');
    if (wrapper) {
      wrapper.innerHTML = groupDetails(details)
        .map(
          (section) => `<div class="kpis-score-section"><div class="kpis-score-section__head"><strong>${esc(section.section || 'Section')}</strong><span>${esc(section.sectionDescription || '')}</span></div>${section.items
            .map(
              (item) => `<div class="kpis-score-item" data-score-id="${esc(item.scoreId)}"><div><h4>${esc(item.subsection || 'KPI row')}</h4><p>${esc(item.subsectionDescription || '')}</p></div><div class="kpis-score-mini">Weight<strong>${num(item.weightPercent, 0).toFixed(1)}%</strong></div><div class="kpis-score-mini">Target<strong>${num(item.targetPercent, 0).toFixed(1)}%</strong></div><label class="kpis-score-mini">Actual %<input class="kpis-input" data-score-field="actualPercent" type="number" min="0" max="200" step="0.01" value="${item.actualPercent === null ? '' : esc(item.actualPercent)}" /></label><div class="kpis-score-notes"><label>Evidence<textarea class="kpis-textarea" data-score-field="evidenceText" rows="2">${esc(item.evidenceText || '')}</textarea></label><label>Manager notes<textarea class="kpis-textarea" data-score-field="managerNotes" rows="2">${esc(item.managerNotes || '')}</textarea></label></div></div>`,
            )
            .join('')}</div>`,
        )
        .join('');
    }
    openModal('score');
  }

  function collectScores() {
    return [...document.querySelectorAll('#scoreItemsEditor [data-score-id]')].map((row) => {
      const item = { scoreId: row.dataset.scoreId };
      row.querySelectorAll('[data-score-field]').forEach((field) => {
        item[field.dataset.scoreField] = field.value;
      });
      return item;
    });
  }

  function bind() {
    $('openStandardBtn')?.addEventListener('click', openStandardModal);
    $('openStandardBtn2')?.addEventListener('click', openStandardModal);
    $('openReviewBtn')?.addEventListener('click', openReviewModal);
    $('openHeroReviewBtn')?.addEventListener('click', openReviewModal);
    $('kpiRefreshBtn')?.addEventListener('click', openReviewModal);
    $('addKpiRowBtn')?.addEventListener('click', () => addKpiRow({ targetPercent: 100 }));
    $('addKpiSectionBtn')?.addEventListener('click', promptAndAddSection);
    $('academicYearFromSelect')?.addEventListener('change', syncAcademicYear);
    $('academicYearToSelect')?.addEventListener('change', syncAcademicYear);

    document.querySelectorAll('[data-kpi-close]').forEach((element) => {
      element.addEventListener('click', () => closeModal(element.dataset.kpiClose));
    });

    $('reviewDepartmentFilter')?.addEventListener('change', () => loadReviews().catch((error) => toast(error.message)));
    $('reviewPositionFilter')?.addEventListener('change', () => loadReviews().catch((error) => toast(error.message)));
    $('reviewMonthFilter')?.addEventListener('change', () => loadReviews().catch((error) => toast(error.message)));
    $('reviewEmployeeSelect')?.addEventListener('change', updateReviewStandardOptions);

    $('standardForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      syncAcademicYear();
      const items = collectKpiRows();
      if (!items.length) {
        toast('Add at least one KPI row.');
        return;
      }
      await api('/api/kpis/standards', {
        method: 'POST',
        body: JSON.stringify({
          department: form.elements.department.value,
          rolePosition: form.elements.rolePosition.value,
          academicYear: form.elements.academicYear.value,
          title: form.elements.title.value,
          description: form.elements.description.value,
          items,
        }),
      });
      closeModal('standard');
      await loadMeta();
      toast('KPI standard saved successfully.');
    });

    $('reviewForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const employee = userById(form.elements.teamMemberId.value);
      const payload = {
        teamMemberId: form.elements.teamMemberId.value,
        teamMemberName: employee?.name || '',
        reviewMonth: `${form.elements.reviewMonth.value}-01`,
        standardId: form.elements.standardId.value,
      };
      const data = await api('/api/kpis/reviews', { method: 'POST', body: JSON.stringify(payload) });
      closeModal('review');
      await loadReviews();
      await loadGraph();
      await openScoreModal(data.reviewId);
    });

    $('scoreForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!state.selectedReviewId) return;
      await api(`/api/kpis/reviews/${encodeURIComponent(state.selectedReviewId)}/scores`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: $('scoreStatusSelect')?.value || 'draft',
          scores: collectScores(),
        }),
      });
      closeModal('score');
      await loadReviews();
      await loadGraph();
      toast('KPI scores saved successfully.');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    loadMeta()
      .catch((error) => {
        const message = error?.message || 'Failed to load KPIs.';
        if ($('kpiReviewsBody')) $('kpiReviewsBody').innerHTML = `<tr><td colspan="7">${esc(message)}</td></tr>`;
        if ($('kpiStandardsList')) $('kpiStandardsList').innerHTML = `<div class="kpis-chart-empty">${esc(message)}</div>`;
        renderChart([]);
      })
      .finally(feather);
  });
})();

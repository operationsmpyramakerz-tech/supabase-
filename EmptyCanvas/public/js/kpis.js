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
    standardAdminPassword: '',
    reviewAdminPassword: '',
  };

  const enhancedSelects = new Map();
  let sectionTitleResolver = null;
  let adminPasswordResolver = null;

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


  function closeEnhancedSelects(except = null) {
    document.querySelectorAll('.kpis-modern-select.is-open').forEach((dropdown) => {
      if (dropdown !== except) dropdown.classList.remove('is-open');
    });
  }

  function refreshEnhancedSelect(select) {
    const enhanced = enhancedSelects.get(select);
    if (!select || !enhanced) return;
    const options = [...select.options].map((option) => ({
      value: option.value,
      label: option.textContent || option.label || option.value,
      disabled: option.disabled,
    }));
    const selected = select.selectedOptions?.[0] || select.options[select.selectedIndex] || options[0];
    enhanced.label.textContent = selected?.textContent || selected?.label || select.getAttribute('aria-label') || 'Choose';
    enhanced.menu.innerHTML = options
      .map((option) => `<button class="kpis-modern-select__option${String(option.value) === String(select.value) ? ' is-selected' : ''}" type="button" data-value="${esc(option.value)}"${option.disabled ? ' disabled' : ''}>${esc(option.label)}</button>`)
      .join('');
    enhanced.menu.querySelectorAll('[data-value]').forEach((button) => {
      button.addEventListener('click', () => {
        select.value = button.dataset.value || '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refreshEnhancedSelect(select);
        closeEnhancedSelects();
      });
    });
  }

  function enhanceSelect(select) {
    if (!select) return;
    if (enhancedSelects.has(select)) {
      refreshEnhancedSelect(select);
      return;
    }
    select.classList.add('kpis-select--native-hidden');
    const dropdown = document.createElement('div');
    dropdown.className = 'kpis-modern-select';
    dropdown.innerHTML = '<button class="kpis-modern-select__button" type="button"><span></span><i data-feather="chevron-down"></i></button><div class="kpis-modern-select__menu" role="listbox"></div>';
    select.insertAdjacentElement('afterend', dropdown);
    const button = dropdown.querySelector('.kpis-modern-select__button');
    const label = dropdown.querySelector('.kpis-modern-select__button span');
    const menu = dropdown.querySelector('.kpis-modern-select__menu');
    enhancedSelects.set(select, { dropdown, button, label, menu });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !dropdown.classList.contains('is-open');
      closeEnhancedSelects(dropdown);
      dropdown.classList.toggle('is-open', willOpen);
    });
    select.addEventListener('change', () => refreshEnhancedSelect(select));
    refreshEnhancedSelect(select);
    feather();
  }

  function enhanceStandardControls() {
    ['standardDepartmentSelect', 'standardPositionSelect', 'academicYearFromSelect', 'academicYearToSelect'].forEach((id) => enhanceSelect($(id)));
  }

  function enhanceReviewFilterControls() {
    ['filterEmployeeSelect', 'filterDepartmentSelect', 'filterPositionSelect'].forEach((id) => enhanceSelect($(id)));
  }

  function enhanceReviewControls() {
    ['reviewEmployeeSelect', 'reviewStandardSelect'].forEach((id) => enhanceSelect($(id)));
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
    refreshEnhancedSelect(select);
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



  function scoreToPercentage(score, weight) {
    const weightValue = num(weight, 0);
    if (weightValue <= 0) return 0;
    return Math.max(0, Math.min(100, (num(score, 0) / weightValue) * 100));
  }

  function performanceRating(value) {
    const score = Math.max(0, Math.min(100, num(value, 0)));
    if (score >= 90) return 'Excellent';
    if (score >= 78) return 'V.good';
    if (score >= 66) return 'Good';
    return 'Weak';
  }

  function setButtonLoading(button, isLoading, label = 'Loading...') {
    if (!button) return;
    if (isLoading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `<span class="kpis-loading-dot"></span><span>${esc(label)}</span>`;
    } else {
      button.disabled = false;
      button.classList.remove('is-loading');
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
      feather();
    }
  }

  function setReviewTransitionLoading(isLoading) {
    const loader = $('reviewTransitionLoader');
    const form = $('reviewForm');
    if (loader) loader.hidden = !isLoading;
    if (form) form.classList.toggle('is-transitioning', Boolean(isLoading));
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
      body.innerHTML = '<tr><td colspan="5">No KPI reviews found.</td></tr>';
      return;
    }

    body.innerHTML = state.reviews
      .map(
        (review) => `<tr><td><strong>${esc(review.teamMemberName || '—')}</strong><div class="muted">${esc(review.standardTitle || '—')}</div></td><td>${esc(review.department || '—')}</td><td>${esc(review.rolePosition || '—')}</td><td>${esc(fmtMonth(review.reviewMonth))}</td><td><div class="kpis-row-actions"><button class="kpis-btn kpis-btn--ghost" type="button" data-open-review="${esc(review.reviewId)}">Open</button></div></td></tr>`,
      )
      .join('');

    body.querySelectorAll('[data-open-review]').forEach((button) => {
      button.addEventListener('click', () => handleOpenReview(button.dataset.openReview).catch((error) => toast(error.message)));
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

  function renderReviewFilterSummary() {
    const summary = $('reviewFilterSummary');
    if (!summary) return;
    const employeeText = $('filterEmployeeSelect')?.selectedOptions?.[0]?.textContent || '';
    const departmentText = $('filterDepartmentSelect')?.selectedOptions?.[0]?.textContent || '';
    const roleText = $('filterPositionSelect')?.selectedOptions?.[0]?.textContent || '';
    const month = $('filterMonthInput')?.value || '';
    const chips = [];
    if ($('filterEmployeeSelect')?.value) chips.push(`Employee: ${employeeText}`);
    if ($('filterDepartmentSelect')?.value) chips.push(`Department: ${departmentText}`);
    if ($('filterPositionSelect')?.value) chips.push(`Role: ${roleText}`);
    if (month) chips.push(`Month: ${fmtMonth(`${month}-01`)}`);
    summary.innerHTML = chips.length
      ? chips.map((chip) => `<span>${esc(chip)}</span>`).join('')
      : 'No filters applied';
  }

  async function loadReviews() {
    const query = new URLSearchParams();
    const teamMemberId = $('filterEmployeeSelect')?.value || '';
    const department = $('filterDepartmentSelect')?.value || '';
    const position = $('filterPositionSelect')?.value || '';
    const month = $('filterMonthInput')?.value || '';

    if (teamMemberId) query.set('teamMemberId', teamMemberId);
    if (department) query.set('department', department);
    if (position) query.set('rolePosition', position);
    if (month) {
      query.set('from', `${month}-01`);
      query.set('to', `${month}-01`);
    }

    renderReviewFilterSummary();
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
    refreshEnhancedSelect(select);
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

    setOptions($('filterEmployeeSelect'), state.users, { allLabel: 'All employees', valueKey: 'id', labelKey: 'name' });
    setOptions($('filterDepartmentSelect'), state.departments, { allLabel: 'All departments' });
    setOptions($('filterPositionSelect'), state.positions, { allLabel: 'All roles' });
    setOptions($('reviewEmployeeSelect'), state.users, { allLabel: 'Choose employee', valueKey: 'id', labelKey: 'name' });
    setOptions($('standardDepartmentSelect'), state.departments, { allLabel: 'Choose department' });
    setOptions($('standardPositionSelect'), state.positions, { allLabel: 'Choose role / position' });
    initAcademicYearPicker();
    enhanceStandardControls();
    enhanceReviewFilterControls();
    enhanceReviewControls();
    renderReviewFilterSummary();
    setCurrentUserBadge();
    renderStandards();
    await Promise.all([loadReviews(), loadGraph()]);
    updateReviewStandardOptions();
  }


  function openAdminPasswordDialog({ title = 'Admin password required', message = 'Enter the admin password to continue.' } = {}) {
    return new Promise((resolve) => {
      const dialog = $('adminPasswordDialog');
      const input = $('adminPasswordInput');
      const titleNode = $('adminPasswordDialogTitle');
      const messageNode = $('adminPasswordDialogMessage');
      if (!dialog || !input) {
        const password = window.prompt(message);
        resolve(password === null ? null : password);
        return;
      }
      adminPasswordResolver = resolve;
      if (titleNode) titleNode.textContent = title;
      if (messageNode) messageNode.textContent = message;
      input.value = '';
      dialog.hidden = false;
      dialog.setAttribute('aria-hidden', 'false');
      window.setTimeout(() => input.focus(), 50);
    });
  }

  function closeAdminPasswordDialog(value = null) {
    const dialog = $('adminPasswordDialog');
    if (dialog) {
      dialog.hidden = true;
      dialog.setAttribute('aria-hidden', 'true');
    }
    if (adminPasswordResolver) {
      const resolver = adminPasswordResolver;
      adminPasswordResolver = null;
      resolver(value);
    }
  }

  async function requestAdminPassword({ title, message } = {}) {
    const password = await openAdminPasswordDialog({ title, message });
    if (password === null) return '';
    const clean = String(password || '').trim();
    if (!clean) {
      toast('Admin password is required.');
      return '';
    }
    await api('/api/kpis/admin/verify', {
      method: 'POST',
      body: JSON.stringify({ password: clean }),
    });
    return clean;
  }

  async function openStandardModalWithAdmin() {
    const password = await requestAdminPassword({
      title: 'Admin password required',
      message: 'Enter the admin password to create a KPI standard.',
    });
    if (!password) return;
    state.standardAdminPassword = password;
    openStandardModal();
  }

  async function openReviewModalWithAdmin() {
    const password = await requestAdminPassword({
      title: 'Admin password required',
      message: 'Enter the admin password to create or open an employee KPI review.',
    });
    if (!password) return;
    state.reviewAdminPassword = password;
    openReviewModal();
  }

  async function handleOpenReview(id) {
    const review = state.reviews.find((item) => String(item.reviewId) === String(id));
    let adminPassword = '';
    if (review && !isCurrentUserReview(review)) {
      adminPassword = await requestAdminPassword({
        title: 'Admin password required',
        message: 'This KPI review belongs to another user. Enter the admin password to open it.',
      });
      if (!adminPassword) return;
    }
    await openScoreModal(id, { adminPassword });
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

  function renderEmptyKpiEditor() {
    const wrapper = $('kpiItemsEditor');
    if (!wrapper) return;
    if (wrapper.querySelector('.kpis-section-card')) return;
    wrapper.innerHTML = '<div class="kpis-empty-editor"><strong>No KPI sections yet.</strong><span>Click Add section to start creating KPI sections.</span></div>';
  }

  function updateSectionNumbers() {
    const wrapper = $('kpiItemsEditor');
    document.querySelectorAll('#kpiItemsEditor .kpis-section-card').forEach((section, sectionIndex) => {
      section.dataset.sectionOrder = String(sectionIndex + 1);
      const orderBadge = section.querySelector('[data-section-order-label]');
      if (orderBadge) orderBadge.textContent = String(sectionIndex + 1);
      section.querySelectorAll('.kpis-item-row').forEach((row, rowIndex) => {
        row.dataset.subsectionOrder = String(rowIndex + 1);
        const subNumber = row.querySelector('[data-subsection-number]');
        if (subNumber) subNumber.textContent = String(rowIndex + 1);
      });
    });
    if (wrapper && !wrapper.querySelector('.kpis-section-card')) renderEmptyKpiEditor();
  }

  function addKpiSection(title = '', description = '') {
    const wrapper = $('kpiItemsEditor');
    if (!wrapper) return null;
    wrapper.querySelector('.kpis-empty-editor')?.remove();
    const sectionIndex = wrapper.querySelectorAll('.kpis-section-card').length + 1;
    const sectionTitle = cleanSectionTitle(title, `Section ${sectionIndex}`);
    const sectionDescription = String(description || '').trim();
    const section = document.createElement('section');
    section.className = 'kpis-section-card';
    section.dataset.section = sectionTitle;
    section.dataset.sectionDescription = sectionDescription;
    section.dataset.sectionOrder = String(sectionIndex);
    section.innerHTML = `
      <div class="kpis-section-card__head">
        <div class="kpis-section-card__titleline">
          <span class="kpis-section-card__order" data-section-order-label>${sectionIndex}</span>
          <h4 data-section-title>${esc(sectionTitle)}</h4>
        </div>
        <button class="kpis-section-delete" type="button" data-remove-section aria-label="Delete section" title="Delete section"><i data-feather="trash-2"></i></button>
      </div>
      ${sectionDescription ? `<div class="kpis-section-card__description" data-section-description>${esc(sectionDescription)}</div>` : '<div class="kpis-section-card__description is-empty" data-section-description></div>'}
      <div class="kpis-section-rows" data-section-rows></div>
      <div class="kpis-section-card__footer"><button class="kpis-btn kpis-btn--ghost" type="button" data-add-row-to-section><i data-feather="plus"></i><span>Add subsection</span></button></div>
    `;
    section.querySelector('[data-add-row-to-section]')?.addEventListener('click', () => addKpiRow({ sectionElement: section }));
    section.querySelector('[data-remove-section]')?.addEventListener('click', () => {
      section.remove();
      updateSectionNumbers();
    });
    wrapper.appendChild(section);
    feather();
    updateSectionNumbers();
    return section;
  }

  function openSectionTitleDialog() {
    return new Promise((resolve) => {
      const dialog = $('sectionTitleDialog');
      const input = $('sectionTitleInput');
      const description = $('sectionDescriptionInput');
      if (!dialog || !input) {
        const title = window.prompt('Enter section title');
        resolve(title === null ? null : { title, description: '' });
        return;
      }
      sectionTitleResolver = resolve;
      input.value = '';
      if (description) description.value = '';
      dialog.hidden = false;
      dialog.setAttribute('aria-hidden', 'false');
      window.setTimeout(() => input.focus(), 50);
    });
  }

  function closeSectionTitleDialog(value = null) {
    const dialog = $('sectionTitleDialog');
    if (dialog) {
      dialog.hidden = true;
      dialog.setAttribute('aria-hidden', 'true');
    }
    if (sectionTitleResolver) {
      const resolver = sectionTitleResolver;
      sectionTitleResolver = null;
      resolver(value);
    }
  }

  async function promptAndAddSection() {
    const sectionData = await openSectionTitleDialog();
    if (sectionData === null) return;
    const title = typeof sectionData === 'object' ? sectionData.title : sectionData;
    const description = typeof sectionData === 'object' ? sectionData.description : '';
    addKpiSection(title, description);
  }

  function addKpiRow(value = {}) {
    const wrapper = $('kpiItemsEditor');
    if (!wrapper) return;
    let section = value.sectionElement || wrapper.querySelector('.kpis-section-card:last-of-type');
    if (!section) {
      toast('Add a section first.');
      return;
    }
    const rows = section.querySelector('[data-section-rows]');
    if (!rows) return;
    const rowIndex = rows.querySelectorAll('.kpis-item-row').length + 1;
    const row = document.createElement('div');
    row.className = 'kpis-item-row kpis-item-row--sectioned';
    row.dataset.subsectionOrder = String(rowIndex);
    row.innerHTML = `
      <div class="kpis-item-row__top kpis-item-row__top--sectioned">
        <div class="kpis-subsection-number-field"><span class="kpis-sub-number" data-subsection-number>${rowIndex}</span></div>
        <label>Title<input class="kpis-input" data-kpi-field="subsection" value="${esc(value.subsection || '')}" /></label>
        <label>Weight<input class="kpis-input" data-kpi-field="weightPercent" type="number" min="0" step="0.01" value="${esc(value.weightPercent ?? '')}" /></label>
      </div>
      <label>Subsection description<textarea class="kpis-textarea" data-kpi-field="subsectionDescription" rows="2">${esc(value.subsectionDescription || '')}</textarea></label>
      <div class="kpis-row-actions"><button class="kpis-row-delete" data-remove-kpi-row type="button"><i data-feather="trash-2"></i><span>Delete subsection</span></button></div>
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
      const descriptionElement = section.querySelector('[data-section-description]');
      const sectionDescription = section.dataset.sectionDescription || descriptionElement?.value || descriptionElement?.textContent || '';
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
    enhanceStandardControls();
    if ($('kpiItemsEditor')) $('kpiItemsEditor').innerHTML = '';
    renderEmptyKpiEditor();
    openModal('standard');
  }

  function standardStatusLabel(standard) {
    return standard?.isActive ? 'Active' : 'Inactive';
  }

  function renderStandardDetails(standard, sections = []) {
    const content = $('standardDetailsContent');
    if (!content) return;
    if ($('standardDetailsTitle')) $('standardDetailsTitle').textContent = standard?.title || 'KPI standard details';
    if ($('standardDetailsSubtitle')) {
      $('standardDetailsSubtitle').textContent = [standard?.department, standard?.rolePosition, standard?.academicYear].filter(Boolean).join(' / ') || 'Standard information and KPI sections.';
    }
    const description = String(standard?.description || '').trim();
    const totalRows = sections.reduce((sum, section) => sum + (section.items || []).length, 0);
    const totalWeight = sections.reduce((sum, section) => sum + num(section.weightPercent, 0), 0);
    content.innerHTML = `
      <div class="kpis-standard-detail-hero">
        <div class="kpis-standard-detail-title">
          <span class="kpis-pill">${esc(standardStatusLabel(standard))}</span>
          <h3>${esc(standard?.title || 'Untitled standard')}</h3>
          ${description ? `<p>${esc(description)}</p>` : '<p>No description added.</p>'}
        </div>
        <div class="kpis-standard-detail-score">
          <strong>${esc(String(totalRows))}</strong>
          <span>KPI subsections</span>
        </div>
      </div>
      <div class="kpis-standard-detail-grid">
        <div><span>Department</span><strong>${esc(standard?.department || '—')}</strong></div>
        <div><span>Role / Position</span><strong>${esc(standard?.rolePosition || '—')}</strong></div>
        <div><span>Year</span><strong>${esc(standard?.academicYear || '—')}</strong></div>
        <div><span>Total weight</span><strong>${num(totalWeight, 0).toFixed(1)}</strong></div>
      </div>
      <div class="kpis-standard-detail-sections">
        ${sections.length ? sections.map((section, sectionIndex) => `
          <section class="kpis-standard-detail-section">
            <div class="kpis-standard-detail-section__head">
              <div><span>${sectionIndex + 1}</span><h4>${esc(section.section || `Section ${sectionIndex + 1}`)}</h4></div>
              <strong>${num(section.weightPercent, 0).toFixed(1)} total weight</strong>
            </div>
            ${section.sectionDescription ? `<p class="kpis-standard-detail-description">${esc(section.sectionDescription)}</p>` : ''}
            <div class="kpis-standard-detail-rows">
              ${(section.items || []).length ? section.items.map((item) => `
                <article class="kpis-standard-detail-row kpis-standard-detail-row--card">
                  <div class="kpis-standard-detail-row__main">
                    <span>${esc(String(item.subsectionOrder || '—'))}</span>
                    <div><strong>${esc(item.subsection || 'Untitled subsection')}</strong>${item.subsectionDescription ? `<p>${esc(item.subsectionDescription)}</p>` : ''}</div>
                  </div>
                  <div class="kpis-standard-detail-row__weight"><span>Weight</span><strong>${num(item.weightPercent, 0).toFixed(1)}</strong></div>
                </article>
              `).join('') : '<div class="kpis-chart-empty">No KPI subsections in this section.</div>'}
            </div>
          </section>
        `).join('') : '<div class="kpis-chart-empty">No active KPI sections found.</div>'}
      </div>
    `;
    feather();
  }

  async function previewStandard(id) {
    const content = $('standardDetailsContent');
    if (content) content.innerHTML = '<div class="kpis-chart-empty">Loading KPI standard...</div>';
    openModal('standardDetails');
    try {
      const data = await api(`/api/kpis/standards?id=${encodeURIComponent(id)}`);
      const standard = standardById(id) || data.standards?.[0] || null;
      renderStandardDetails(standard, data.sections || []);
    } catch (error) {
      if (content) content.innerHTML = `<div class="kpis-chart-empty">${esc(error.message || 'Failed to load KPI standard.')}</div>`;
    }
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
    refreshEnhancedSelect(select);
  }

  function openReviewModal() {
    const form = $('reviewForm');
    form?.reset();
    if (form?.elements.reviewMonth) form.elements.reviewMonth.value = monthInput(new Date());
    if ($('reviewEmployeeSelect') && state.selectedEmployeeId) $('reviewEmployeeSelect').value = state.selectedEmployeeId;
    updateReviewStandardOptions();
    enhanceReviewControls();
    setReviewTransitionLoading(false);
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

  async function openScoreModal(id, options = {}) {
    const query = options.adminPassword ? `?adminPassword=${encodeURIComponent(options.adminPassword)}` : '';
    const data = await api(`/api/kpis/reviews/${encodeURIComponent(id)}${query}`);
    const summary = data.summary || {};
    const details = data.details || [];
    state.selectedReviewId = id;

    if (isCurrentUserReview(summary)) {
      updateScore(summary);
    }

    if ($('scoreModalKicker')) $('scoreModalKicker').textContent = `${fmtMonth(summary.reviewMonth)} KPI review`;
    if ($('scoreModalTitle')) $('scoreModalTitle').textContent = summary.teamMemberName || 'Employee KPI review';
    if ($('scoreModalSub')) $('scoreModalSub').textContent = `${summary.department || '—'} / ${summary.rolePosition || '—'} / ${summary.standardTitle || '—'}`;

    const wrapper = $('scoreItemsEditor');
    if (wrapper) {
      wrapper.innerHTML = groupDetails(details)
        .map(
          (section, sectionIndex) => `<div class="kpis-score-section kpis-score-section--modern"><div class="kpis-score-section__head"><div><span class="kpis-score-section__number">${sectionIndex + 1}</span><strong>${esc(section.section || 'Section')}</strong></div>${section.sectionDescription ? `<p>${esc(section.sectionDescription)}</p>` : ''}</div><div class="kpis-score-subcards">${section.items
            .map((item) => {
              const scoreValue = item.actualPercent === null ? '' : item.actualPercent;
              const percentValue = scoreValue === '' ? 0 : scoreToPercentage(scoreValue, item.weightPercent);
              return `<article class="kpis-score-subcard" data-score-id="${esc(item.scoreId)}" data-weight="${esc(item.weightPercent)}">
                <div class="kpis-score-subcard__head">
                  <div class="kpis-score-subcard__title"><span>${esc(String(item.subsectionOrder || '—'))}</span><div><h4>${esc(item.subsection || 'KPI subsection')}</h4>${item.subsectionDescription ? `<p>${esc(item.subsectionDescription)}</p>` : ''}</div></div>
                  <div class="kpis-score-weight-pill"><span>Weight</span><strong>${num(item.weightPercent, 0).toFixed(1)}</strong></div>
                </div>
                <div class="kpis-score-subcard__body">
                  <label class="kpis-score-input-card"><span>Score</span><input class="kpis-input" data-score-field="actualPercent" type="number" min="0" max="${esc(item.weightPercent || 0)}" step="0.01" value="${scoreValue === '' ? '' : esc(scoreValue)}" /></label>
                  <div class="kpis-score-percent-card"><span>KPI %</span><strong data-score-percent>${percentValue.toFixed(1)}%</strong></div>
                </div>
                <div class="kpis-score-notes kpis-score-notes--modern"><label>Evidence<textarea class="kpis-textarea" data-score-field="evidenceText" rows="2">${esc(item.evidenceText || '')}</textarea></label><label>Manager notes<textarea class="kpis-textarea" data-score-field="managerNotes" rows="2">${esc(item.managerNotes || '')}</textarea></label></div>
              </article>`;
            })
            .join('')}</div></div>`,
        )
        .join('');
      wrapper.querySelectorAll('[data-score-field="actualPercent"]').forEach((input) => {
        input.addEventListener('input', () => {
          const card = input.closest('[data-score-id]');
          const percent = card?.querySelector('[data-score-percent]');
          if (percent) percent.textContent = `${scoreToPercentage(input.value, card?.dataset.weight).toFixed(1)}%`;
        });
      });
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
    $('openStandardBtn')?.addEventListener('click', () => openStandardModalWithAdmin().catch((error) => toast(error.message)));
    $('openStandardBtn2')?.addEventListener('click', () => openStandardModalWithAdmin().catch((error) => toast(error.message)));
    $('openReviewBtn')?.addEventListener('click', () => openReviewModalWithAdmin().catch((error) => toast(error.message)));
    $('openHeroReviewBtn')?.addEventListener('click', () => openReviewModalWithAdmin().catch((error) => toast(error.message)));
    $('kpiRefreshBtn')?.addEventListener('click', () => openReviewModalWithAdmin().catch((error) => toast(error.message)));
    $('openReviewFiltersBtn')?.addEventListener('click', () => { enhanceReviewFilterControls(); openModal('reviewFilters'); });
    $('addKpiSectionBtn')?.addEventListener('click', promptAndAddSection);
    $('confirmSectionTitleBtn')?.addEventListener('click', () => closeSectionTitleDialog({ title: $('sectionTitleInput')?.value || '', description: $('sectionDescriptionInput')?.value || '' }));
    $('sectionTitleInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); closeSectionTitleDialog({ title: event.currentTarget.value || '', description: $('sectionDescriptionInput')?.value || '' }); } });
    document.querySelectorAll('[data-section-title-cancel]').forEach((element) => element.addEventListener('click', () => closeSectionTitleDialog(null)));
    $('confirmAdminPasswordBtn')?.addEventListener('click', () => closeAdminPasswordDialog($('adminPasswordInput')?.value || ''));
    $('adminPasswordInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); closeAdminPasswordDialog(event.currentTarget.value || ''); } });
    document.querySelectorAll('[data-admin-password-cancel]').forEach((element) => element.addEventListener('click', () => closeAdminPasswordDialog(null)));
    document.addEventListener('click', () => closeEnhancedSelects());
    $('academicYearFromSelect')?.addEventListener('change', syncAcademicYear);
    $('academicYearToSelect')?.addEventListener('change', syncAcademicYear);

    document.querySelectorAll('[data-kpi-close]').forEach((element) => {
      element.addEventListener('click', () => closeModal(element.dataset.kpiClose));
    });

    $('reviewFilterForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      closeModal('reviewFilters');
      loadReviews().catch((error) => toast(error.message));
    });
    $('clearReviewFiltersBtn')?.addEventListener('click', () => {
      ['filterEmployeeSelect', 'filterDepartmentSelect', 'filterPositionSelect'].forEach((id) => { if ($(id)) { $(id).value = ''; refreshEnhancedSelect($(id)); } });
      if ($('filterMonthInput')) $('filterMonthInput').value = '';
      closeModal('reviewFilters');
      loadReviews().catch((error) => toast(error.message));
    });
    $('reviewEmployeeSelect')?.addEventListener('change', updateReviewStandardOptions);

    $('standardForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      syncAcademicYear();
      const items = collectKpiRows();
      if (!document.querySelector('#kpiItemsEditor .kpis-section-card')) {
        toast('Click Add section to start creating KPI sections.');
        return;
      }
      if (!items.length) {
        toast('Add at least one KPI subsection inside a section.');
        return;
      }
      const originalButtonHtml = submitButton?.innerHTML || '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add('is-loading');
        submitButton.innerHTML = '<span class="kpis-loading-dot"></span><span>Saving...</span>';
      }
      try {
        await api('/api/kpis/standards', {
          method: 'POST',
          body: JSON.stringify({
            department: form.elements.department.value,
            rolePosition: form.elements.rolePosition.value,
            academicYear: form.elements.academicYear.value,
            yearStart: Number($('academicYearFromSelect')?.value || 0) || undefined,
            yearEnd: Number($('academicYearToSelect')?.value || 0) || undefined,
            title: form.elements.title.value,
            description: form.elements.description.value,
            items,
            adminPassword: state.standardAdminPassword,
          }),
        });
        await loadMeta();
        state.standardAdminPassword = '';
        closeModal('standard');
        toast('KPI standard saved successfully.');
      } catch (error) {
        toast(error.message || 'Failed to save KPI standard.');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.classList.remove('is-loading');
          submitButton.innerHTML = originalButtonHtml;
          feather();
        }
      }
    });

    $('reviewForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitButton = $('reviewSubmitBtn') || form.querySelector('button[type="submit"]');
      const employee = userById(form.elements.teamMemberId.value);
      const payload = {
        teamMemberId: form.elements.teamMemberId.value,
        teamMemberName: employee?.name || '',
        reviewMonth: `${form.elements.reviewMonth.value}-01`,
        standardId: form.elements.standardId.value,
        adminPassword: state.reviewAdminPassword,
      };
      try {
        setButtonLoading(submitButton, true, 'Opening...');
        setReviewTransitionLoading(true);
        const data = await api('/api/kpis/reviews', { method: 'POST', body: JSON.stringify(payload) });
        await loadReviews();
        await loadGraph();
        await openScoreModal(data.reviewId);
        state.reviewAdminPassword = '';
        closeModal('review');
      } catch (error) {
        toast(error.message || 'Failed to create KPI review.');
      } finally {
        setReviewTransitionLoading(false);
        setButtonLoading(submitButton, false);
      }
    });

    $('scoreForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!state.selectedReviewId) return;
      await api(`/api/kpis/reviews/${encodeURIComponent(state.selectedReviewId)}/scores`, {
        method: 'PATCH',
        body: JSON.stringify({
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
        if ($('kpiReviewsBody')) $('kpiReviewsBody').innerHTML = `<tr><td colspan="5">${esc(message)}</td></tr>`;
        if ($('kpiStandardsList')) $('kpiStandardsList').innerHTML = `<div class="kpis-chart-empty">${esc(message)}</div>`;
        renderChart([]);
      })
      .finally(feather);
  });
})();

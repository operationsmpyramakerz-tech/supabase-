(function () {
  'use strict';

  const state = {
    users: [],
    standards: [],
    reviews: [],
    departments: [],
    positions: [],
    positionsByDepartment: {},
    selectedReviewId: '',
    selectedEmployeeId: '',
    currentUser: null,
    accessLevel: 'view',
    standardAdminPassword: '',
    reviewAdminPassword: '',
    graphPoints: [],
    activeGraphMonth: '',
    standardSectionsByStandardId: {},
    activeReviewTab: 'all',
    standardFilters: { department: '', position: '' },
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

  function sanitizeMessage(message) {
    const text = String(message || '').trim() || 'Something went wrong.';
    return window.OpsSafeMessage?.sanitize ? window.OpsSafeMessage.sanitize(text) : text;
  }

  function toast(message, type = 'info') {
    const clean = sanitizeMessage(message);
    let stack = document.querySelector('.kpis-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'kpis-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const item = document.createElement('div');
    item.className = `kpis-toast kpis-toast--${type}`;
    item.innerHTML = `<div class="kpis-toast__icon"><i data-feather="${type === 'error' ? 'alert-triangle' : type === 'success' ? 'check-circle' : 'info'}"></i></div><div class="kpis-toast__body"><strong>${type === 'error' ? 'Action needed' : type === 'success' ? 'Done' : 'Notice'}</strong><p>${esc(clean)}</p></div><button type="button" class="kpis-toast__close" aria-label="Close message"><i data-feather="x"></i></button>`;
    stack.appendChild(item);
    item.querySelector('.kpis-toast__close')?.addEventListener('click', () => item.remove());
    window.setTimeout(() => item.classList.add('is-visible'), 20);
    window.setTimeout(() => { item.classList.remove('is-visible'); window.setTimeout(() => item.remove(), 220); }, 4200);
    feather();
  }

  function hasAccessAtLeast(level) {
    const rank = { view: 1, edit: 2, admin: 3 };
    return (rank[String(state.accessLevel || 'view').toLowerCase()] || 0) >= (rank[String(level || 'view').toLowerCase()] || 0);
  }

  function normalizeMonthKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-01` : '';
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '—');
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '—');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
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
    enhanced.button.disabled = Boolean(select.disabled);
    enhanced.dropdown.classList.toggle('is-disabled', Boolean(select.disabled));
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
      if (select.disabled) return;
      const willOpen = !dropdown.classList.contains('is-open');
      closeEnhancedSelects(dropdown);
      dropdown.classList.toggle('is-open', willOpen);
    });
    select.addEventListener('change', () => refreshEnhancedSelect(select));
    refreshEnhancedSelect(select);
    feather();
  }

  function enhanceStandardControls() {
    ['standardDepartmentSelect', 'standardPositionSelect'].forEach((id) => enhanceSelect($(id)));
  }

  function enhanceReviewFilterControls() {
    ['filterEmployeeSelect', 'filterDepartmentSelect', 'filterPositionSelect', 'filterStandardSelect', 'filterSectionSelect'].forEach((id) => enhanceSelect($(id)));
  }

  function enhanceStandardFilterControls() {
    ['standardFilterDepartmentSelect', 'standardFilterPositionSelect'].forEach((id) => enhanceSelect($(id)));
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

  function uniqueSorted(values = []) {
    return Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function positionsForDepartment(department) {
    const key = norm(department);
    if (!key) return [];
    const direct = state.positionsByDepartment?.[key] || state.positionsByDepartment?.[String(department || '').trim()] || [];
    if (Array.isArray(direct) && direct.length) return uniqueSorted(direct);
    return uniqueSorted(
      state.users
        .filter((user) => norm(user.department) === key)
        .map((user) => user.position),
    );
  }

  function updateStandardPositionOptions() {
    const departmentSelect = $('standardDepartmentSelect');
    const positionSelect = $('standardPositionSelect');
    if (!positionSelect) return;
    const department = departmentSelect?.value || '';
    const list = positionsForDepartment(department);
    positionSelect.disabled = !department || !list.length;
    setOptions(positionSelect, list, { allLabel: department ? (list.length ? 'Choose role / position' : 'No positions found') : 'Choose department first' });
    refreshEnhancedSelect(positionSelect);
  }

  function updateStandardFilterPositionOptions() {
    const departmentSelect = $('standardFilterDepartmentSelect');
    const positionSelect = $('standardFilterPositionSelect');
    if (!positionSelect) return;
    const department = departmentSelect?.value || '';
    const list = department ? positionsForDepartment(department) : uniqueSorted([
      ...state.positions,
      ...state.users.map((user) => user.position),
      ...state.standards.map((standard) => standard.rolePosition),
    ]);
    positionSelect.disabled = false;
    setOptions(positionSelect, list, { allLabel: department ? (list.length ? 'All positions' : 'No positions found') : 'All positions' });
    const selectedPosition = positionSelect.value || '';
    if (selectedPosition && ![...positionSelect.options].some((option) => option.value === selectedPosition)) {
      positionSelect.value = '';
    }
    refreshEnhancedSelect(positionSelect);
  }

  async function updateFilterSectionOptions() {
    const standardSelect = $('filterStandardSelect');
    const sectionSelect = $('filterSectionSelect');
    if (!sectionSelect) return;
    const standardId = String(standardSelect?.value || '').trim();
    if (!standardId) {
      sectionSelect.disabled = true;
      sectionSelect.dataset.standardId = '';
      sectionSelect.value = '';
      setOptions(sectionSelect, [], { allLabel: 'Choose KPI first' });
      refreshEnhancedSelect(sectionSelect);
      return;
    }
    const previousStandardId = sectionSelect.dataset.standardId || '';
    if (previousStandardId !== standardId) sectionSelect.value = '';
    sectionSelect.dataset.standardId = standardId;
    sectionSelect.disabled = false;
    let sections = state.standardSectionsByStandardId[standardId];
    if (!Array.isArray(sections)) {
      sectionSelect.disabled = true;
      setOptions(sectionSelect, [], { allLabel: 'Loading sections...' });
      refreshEnhancedSelect(sectionSelect);
      try {
        const data = await api(`/api/kpis/standards?id=${encodeURIComponent(standardId)}`);
        sections = data.sections || [];
        state.standardSectionsByStandardId[standardId] = sections;
      } catch (error) {
        toast(error.message || 'Failed to load KPI sections.', 'error');
        sections = [];
      }
    }
    sectionSelect.disabled = false;
    const options = (sections || []).map((section) => ({
      value: String(section.sectionOrder || ''),
      label: section.section || `Section ${section.sectionOrder || ''}`,
    })).filter((option) => option.value || option.label);
    setOptions(sectionSelect, options, { allLabel: 'All sections', valueKey: 'value', labelKey: 'label' });
    refreshEnhancedSelect(sectionSelect);
  }

  function userById(id) {
    return state.users.find((user) => String(user.id) === String(id)) || null;
  }

  function standardById(id) {
    return state.standards.find((standard) => String(standard.id) === String(id)) || null;
  }

  function standardOptionLabel(standard) {
    const title = String(standard?.title || 'Untitled KPI').trim();
    const meta = [standard?.department, standard?.rolePosition].filter(Boolean).join(' / ');
    return meta ? `${title} — ${meta}` : title;
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
      accessLevel: raw.accessLevel || data?.accessLevel || 'view',
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

    const rows = Array.isArray(points) ? points : [];
    state.graphPoints = rows;
    if (!rows.length) {
      chart.innerHTML = '<div class="kpis-chart-empty">No KPI graph data yet. Create a monthly review first.</div>';
      return;
    }

    const pointByMonth = new Map(rows.map((point) => [normalizeMonthKey(point.reviewMonth), point]));
    const latestPoint = rows[rows.length - 1] || null;
    const latestKey = normalizeMonthKey(latestPoint?.reviewMonth);
    const currentKey = currentMonthKey();
    const baseYear = Number((state.activeGraphMonth || currentKey || latestKey).slice(0, 4)) || new Date().getFullYear();
    if (!state.activeGraphMonth) {
      state.activeGraphMonth = pointByMonth.has(currentKey) ? currentKey : (currentKey.slice(0, 4) === String(baseYear) ? currentKey : latestKey);
    }

    const months = Array.from({ length: 12 }, (_, index) => {
      const monthKey = `${baseYear}-${String(index + 1).padStart(2, '0')}-01`;
      const point = pointByMonth.get(monthKey) || null;
      const value = point ? Math.max(0, Math.min(100, num(point.finalPercentage, 0))) : 0;
      const isActive = monthKey === state.activeGraphMonth;
      return { monthKey, point, value, isActive, label: new Date(baseYear, index, 1).toLocaleDateString('en-US', { month: 'short' }) };
    });

    chart.innerHTML = `
      <div class="kpis-modern-chart" role="group" aria-label="Monthly KPI bar chart">
        <div class="kpis-chart-y-axis" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
        <div class="kpis-chart-stage">
          <div class="kpis-chart-grid-lines" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
          <div class="kpis-month-bars">
            ${months.map((month) => `
              <button type="button" class="kpis-month-bar${month.isActive ? ' is-active' : ''}${month.point ? ' has-data' : ' is-empty'}" data-chart-month="${esc(month.monthKey)}" title="${esc(month.label)}: ${month.point ? `${month.value.toFixed(1)}%` : 'No review'}">
                <span class="kpis-month-bar__bubble">${month.point ? `${month.value.toFixed(1)}%` : '—'}</span>
                <span class="kpis-month-bar__track"><span class="kpis-month-bar__fill" style="--value:${month.point ? Math.max(month.value, 4) : 10}"></span></span>
                <span class="kpis-month-bar__label">${esc(month.label)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    chart.querySelectorAll('[data-chart-month]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeGraphMonth = button.dataset.chartMonth || '';
        renderChart(state.graphPoints);
        const selectedPoint = pointByMonth.get(state.activeGraphMonth);
        updateScore(selectedPoint || null);
      });
    });
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
    const activeBeforeRender = state.activeGraphMonth || currentMonthKey();
    renderChart(points);
    const selectedPoint = (points || []).find((point) => normalizeMonthKey(point.reviewMonth) === (state.activeGraphMonth || activeBeforeRender));
    updateScore(selectedPoint || points.slice(-1)[0] || null);
  }

  function renderReviews() {
    const body = $('kpiReviewsBody');
    if (!body) return;

    if (!state.reviews.length) {
      body.innerHTML = '<tr><td colspan="4">No KPI reviews found.</td></tr>';
      return;
    }

    const canEditCreated = state.activeReviewTab === 'created' && hasAccessAtLeast('admin');
    body.innerHTML = state.reviews
      .map((review) => {
        const score = Math.max(0, Math.min(100, num(review.finalPercentage, 0)));
        const scoreLabel = review.reviewId ? `${score.toFixed(1)}%` : '—';
        const grade = review.performanceRating || '—';
        const editButton = canEditCreated && review.reviewId
          ? `<button class="kpis-review-edit-btn" type="button" data-edit-review="${esc(review.reviewId)}"><i data-feather="edit-3"></i><span>Edit</span></button>`
          : '';
        return `<tr class="kpis-review-row" data-open-review="${esc(review.reviewId)}" tabindex="0"><td><strong>${esc(review.teamMemberName || '—')}</strong></td><td>${esc(review.department || '—')}</td><td>${esc(fmtMonth(review.reviewMonth))}</td><td><div class="kpis-score-actions"><span class="kpis-score-pill"><strong>${esc(scoreLabel)}</strong><em>${esc(grade)}</em></span>${editButton}</div></td></tr>`;
      })
      .join('');

    body.querySelectorAll('[data-edit-review]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleEditReview(button.dataset.editReview).catch((error) => toast(error.message, 'error'));
      });
    });

    body.querySelectorAll('[data-open-review]').forEach((row) => {
      const open = () => handleOpenReview(row.dataset.openReview).catch((error) => toast(error.message, 'error'));
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });
    feather();
  }

  function filteredStandardsForList() {
    const department = norm(state.standardFilters?.department);
    const position = norm(state.standardFilters?.position);
    return (state.standards || []).filter((standard) => {
      if (department && norm(standard.department) !== department) return false;
      if (position && norm(standard.rolePosition) !== position) return false;
      return true;
    });
  }

  function renderStandardFilterSummary() {
    const summary = $('standardFilterSummary');
    if (!summary) return;
    const chips = [];
    if (state.standardFilters?.department) chips.push(`Department: ${state.standardFilters.department}`);
    if (state.standardFilters?.position) chips.push(`Position: ${state.standardFilters.position}`);
    summary.innerHTML = chips.length ? chips.map((chip) => `<span>${esc(chip)}</span>`).join('') : 'No filters applied';
  }

  function hasDuplicateStandardForSelection(department, rolePosition) {
    const dep = norm(department);
    const pos = norm(rolePosition);
    if (!dep || !pos) return false;
    return (state.standards || []).some((standard) => norm(standard.department) === dep && norm(standard.rolePosition) === pos);
  }

  function renderStandards() {
    const box = $('kpiStandardsList');
    if (!box) return;
    renderStandardFilterSummary();

    if (!state.standards.length) {
      box.innerHTML = '<div class="kpis-chart-empty">No KPI standards yet.</div>';
      return;
    }

    const standards = filteredStandardsForList();
    if (!standards.length) {
      box.innerHTML = '<div class="kpis-chart-empty">No KPI standards match these filters.</div>';
      return;
    }

    box.innerHTML = standards
      .map(
        (standard) => `<button class="kpis-standard-card" type="button" data-standard-id="${esc(standard.id)}"><div class="kpis-standard-card__head"><h3>${esc(standard.title || 'Untitled standard')}</h3><span class="kpis-standard-date">${esc(fmtDate(standard.createdAt))}</span></div><p>${esc(standard.department || '—')} / ${esc(standard.rolePosition || '—')}</p></button>`,
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
    const kpiText = $('filterStandardSelect')?.selectedOptions?.[0]?.textContent || '';
    const sectionText = $('filterSectionSelect')?.selectedOptions?.[0]?.textContent || '';
    const month = $('filterMonthInput')?.value || '';
    const chips = [];
    if ($('filterEmployeeSelect')?.value) chips.push(`Employee: ${employeeText}`);
    if ($('filterDepartmentSelect')?.value) chips.push(`Department: ${departmentText}`);
    if ($('filterPositionSelect')?.value) chips.push(`Role: ${roleText}`);
    if ($('filterStandardSelect')?.value) chips.push(`KPI: ${kpiText}`);
    if ($('filterSectionSelect')?.value) chips.push(`Section: ${sectionText}`);
    if (month) chips.push(`Month: ${fmtMonth(`${month}-01`)}`);
    summary.innerHTML = chips.length
      ? chips.map((chip) => `<span>${esc(chip)}</span>`).join('')
      : 'No filters applied';
  }

  function buildReviewQuery() {
    const query = new URLSearchParams();
    const teamMemberId = $('filterEmployeeSelect')?.value || '';
    const department = $('filterDepartmentSelect')?.value || '';
    const position = $('filterPositionSelect')?.value || '';
    const standardId = $('filterStandardSelect')?.value || '';
    const sectionOrder = $('filterSectionSelect')?.value || '';
    const month = $('filterMonthInput')?.value || '';
    const currentUserId = String(state.currentUser?.id || '').trim();

    if (teamMemberId) query.set('teamMemberId', teamMemberId);
    if (department) query.set('department', department);
    if (position) query.set('rolePosition', position);
    if (standardId) query.set('standardId', standardId);
    if (sectionOrder) query.set('sectionOrder', sectionOrder);
    if (month) {
      query.set('from', `${month}-01`);
      query.set('to', `${month}-01`);
    }

    if (state.activeReviewTab === 'mine' && currentUserId) {
      query.set('teamMemberId', currentUserId);
    }
    if (state.activeReviewTab === 'created' && currentUserId) {
      query.set('createdByTeamMemberId', currentUserId);
    }
    query.set('tab', state.activeReviewTab || 'all');
    return query;
  }

  async function loadReviews() {
    const query = buildReviewQuery();
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
    state.standardSectionsByStandardId = {};
    state.departments = data.departments || [];
    state.positions = data.positions || [];
    state.positionsByDepartment = data.positionsByDepartment || {};
    state.currentUser = currentUserFromMeta(data);
    state.accessLevel = String(data.accessLevel || state.currentUser?.accessLevel || 'view').toLowerCase();
    state.selectedEmployeeId = String(state.currentUser?.id || '').trim() || state.selectedEmployeeId || state.users[0]?.id || '';

    setOptions($('filterEmployeeSelect'), state.users, { allLabel: 'All employees', valueKey: 'id', labelKey: 'name' });
    setOptions($('filterDepartmentSelect'), state.departments, { allLabel: 'All departments' });
    setOptions($('filterPositionSelect'), state.positions, { allLabel: 'All roles' });
    setOptions($('filterStandardSelect'), state.standards.map((standard) => ({ id: standard.id, label: standardOptionLabel(standard) })), { allLabel: 'All KPIs', valueKey: 'id', labelKey: 'label' });
    await updateFilterSectionOptions();
    setOptions($('reviewEmployeeSelect'), state.users, { allLabel: 'Choose employee', valueKey: 'id', labelKey: 'name' });
    setOptions($('standardDepartmentSelect'), state.departments, { allLabel: 'Choose department' });
    setOptions($('standardFilterDepartmentSelect'), state.departments, { allLabel: 'All departments' });
    if ($('standardFilterDepartmentSelect')) $('standardFilterDepartmentSelect').value = state.standardFilters.department || '';
    updateStandardPositionOptions();
    updateStandardFilterPositionOptions();
    if ($('standardFilterPositionSelect')) $('standardFilterPositionSelect').value = state.standardFilters.position || '';
    enhanceStandardControls();
    enhanceStandardFilterControls();
    enhanceReviewFilterControls();
    enhanceReviewControls();
    renderReviewFilterSummary();
    renderStandardFilterSummary();
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
    if (hasAccessAtLeast('admin')) {
      state.standardAdminPassword = '';
      openStandardModal();
      return;
    }
    const password = await requestAdminPassword({
      title: 'Admin password required',
      message: 'Only KPI admins can create KPI standards directly. Enter the admin password to continue.',
    });
    if (!password) return;
    state.standardAdminPassword = password;
    openStandardModal();
  }

  async function openReviewModalWithAdmin() {
    if (hasAccessAtLeast('edit')) {
      state.reviewAdminPassword = '';
      openReviewModal();
      return;
    }
    const password = await requestAdminPassword({
      title: 'Admin password required',
      message: 'Create review is available for Edit/Admin access. Enter the admin password to continue.',
    });
    if (!password) return;
    state.reviewAdminPassword = password;
    openReviewModal();
  }

  async function handleOpenReview(id) {
    if (!id) return;
    await openScoreModal(id, { readOnly: true });
  }

  async function handleEditReview(id) {
    if (!id) return;
    if (!hasAccessAtLeast('admin')) {
      toast('Only Admin access can edit created KPI reviews.', 'error');
      return;
    }
    await openScoreModal(id, { readOnly: false });
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
    wrapper.innerHTML = '<div class="kpis-empty-editor"><strong>No KPI sections yet.</strong></div>';
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
    section.querySelector('[data-remove-section]')?.addEventListener('click', async () => {
      const sectionName = section.querySelector('[data-section-title]')?.textContent?.trim() || 'this KPI section';
      const confirmed = window.OpsDeleteConfirm
        ? await window.OpsDeleteConfirm.confirm({
            title: 'Delete KPI section?',
            itemType: 'KPI section',
            itemName: sectionName,
            message: `You’re going to delete “${sectionName}” and every subsection inside it. This action cannot be undone after saving.`,
          })
        : window.confirm(`Delete “${sectionName}” and all of its subsections?`);
      if (!confirmed) return;
      section.remove();
      updateSectionNumbers();
      updateTotalWeight();
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
    row.querySelector('[data-kpi-field="weightPercent"]')?.addEventListener('input', updateTotalWeight);
    row.querySelector('[data-remove-kpi-row]')?.addEventListener('click', async () => {
      const subsectionName = row.querySelector('[data-kpi-field="subsection"]')?.value?.trim() || 'this KPI subsection';
      const confirmed = window.OpsDeleteConfirm
        ? await window.OpsDeleteConfirm.confirm({
            title: 'Delete KPI subsection?',
            itemType: 'KPI subsection',
            itemName: subsectionName,
            message: `You’re going to delete “${subsectionName}”. This action cannot be undone after saving.`,
          })
        : window.confirm(`Delete “${subsectionName}”?`);
      if (!confirmed) return;
      row.remove();
      updateSectionNumbers();
      updateTotalWeight();
    });
    rows.appendChild(row);
    feather();
    updateSectionNumbers();
    updateTotalWeight();
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

  function renderEmptyEvaluationEditor() {
    const wrapper = $('kpiEvaluationsEditor');
    if (!wrapper) return;
    if (wrapper.querySelector('.kpis-evaluation-row')) return;
    wrapper.innerHTML = '<div class="kpis-empty-evaluation"><strong>No overall evaluations yet.</strong></div>';
  }

  function updateEvaluationNumbers() {
    const wrapper = $('kpiEvaluationsEditor');
    document.querySelectorAll('#kpiEvaluationsEditor .kpis-evaluation-row').forEach((row, index) => {
      row.dataset.evaluationOrder = String(index + 1);
      const badge = row.querySelector('[data-evaluation-number]');
      if (badge) badge.textContent = String(index + 1);
    });
    if (wrapper && !wrapper.querySelector('.kpis-evaluation-row')) renderEmptyEvaluationEditor();
  }

  function addEvaluationRow(value = {}) {
    const wrapper = $('kpiEvaluationsEditor');
    if (!wrapper) return;
    wrapper.querySelector('.kpis-empty-evaluation')?.remove();
    const index = wrapper.querySelectorAll('.kpis-evaluation-row').length + 1;
    const row = document.createElement('div');
    row.className = 'kpis-evaluation-row';
    row.dataset.evaluationOrder = String(index);
    row.innerHTML = `
      <span class="kpis-evaluation-row__number" data-evaluation-number>${index}</span>
      <label>From<input class="kpis-input" data-evaluation-field="scoreFromPercentage" type="number" min="0" max="100" step="0.01" placeholder="Example: 85" value="${esc(value.scoreFromPercentage ?? value.scorePercentage ?? '')}" /></label>
      <label>To<input class="kpis-input" data-evaluation-field="scoreToPercentage" type="number" min="0" max="100" step="0.01" placeholder="Example: 100" value="${esc(value.scoreToPercentage ?? '')}" /></label>
      <label>Grade<input class="kpis-input" data-evaluation-field="grade" type="text" placeholder="Example: Excellent" value="${esc(value.grade || '')}" /></label>
      <button class="kpis-section-delete kpis-evaluation-delete" type="button" data-remove-evaluation aria-label="Delete evaluation" title="Delete evaluation"><i data-feather="trash-2"></i></button>
    `;
    row.querySelector('[data-remove-evaluation]')?.addEventListener('click', async () => {
      const grade = row.querySelector('[data-evaluation-field="grade"]')?.value?.trim() || `Evaluation ${row.dataset.evaluationOrder || ''}`.trim();
      const confirmed = window.OpsDeleteConfirm
        ? await window.OpsDeleteConfirm.confirm({
            title: 'Delete evaluation?',
            itemType: 'evaluation',
            itemName: grade,
            message: `You’re going to delete “${grade}”. This action cannot be undone after saving.`,
          })
        : window.confirm(`Delete “${grade}”?`);
      if (!confirmed) return;
      row.remove();
      updateEvaluationNumbers();
    });
    wrapper.appendChild(row);
    feather();
    updateEvaluationNumbers();
  }

  function collectEvaluations() {
    return [...document.querySelectorAll('#kpiEvaluationsEditor .kpis-evaluation-row')].map((row, index) => {
      const item = { evaluationOrder: index + 1 };
      row.querySelectorAll('[data-evaluation-field]').forEach((field) => {
        item[field.dataset.evaluationField] = field.value;
      });
      const fromRaw = String(item.scoreFromPercentage ?? '').trim();
      const toRaw = String(item.scoreToPercentage ?? '').trim();
      const from = Math.max(0, Math.min(100, fromRaw === '' ? 0 : num(fromRaw, 0)));
      const to = Math.max(0, Math.min(100, toRaw === '' ? 100 : num(toRaw, 100)));
      item.scoreFromPercentage = Math.min(from, to);
      item.scoreToPercentage = Math.max(from, to);
      item.scorePercentage = item.scoreFromPercentage;
      item.grade = String(item.grade || '').trim();
      return item;
    }).filter((item) => item.grade || item.scoreFromPercentage > 0 || item.scoreToPercentage < 100);
  }

  function calculateTotalWeight() {
    return [...document.querySelectorAll('#kpiItemsEditor [data-kpi-field="weightPercent"]')]
      .reduce((sum, input) => sum + Math.max(0, num(input.value, 0)), 0);
  }

  function updateTotalWeight() {
    const value = calculateTotalWeight();
    const valueNode = $('kpiTotalWeightValue');
    const card = $('kpiTotalWeightCard');
    if (valueNode) valueNode.textContent = value.toFixed(1);
    if (card) {
      card.classList.toggle('is-complete', Math.abs(value - 100) < 0.01);
      card.classList.toggle('is-over', value > 100);
    }
  }

  function openStandardModal() {
    const form = $('standardForm');
    form?.reset();
    setOptions($('standardDepartmentSelect'), state.departments, { allLabel: 'Choose department' });
    updateStandardPositionOptions();
    enhanceStandardControls();
    if ($('kpiItemsEditor')) $('kpiItemsEditor').innerHTML = '';
    if ($('kpiEvaluationsEditor')) $('kpiEvaluationsEditor').innerHTML = '';
    renderEmptyKpiEditor();
    renderEmptyEvaluationEditor();
    updateTotalWeight();
    openModal('standard');
  }

  function standardStatusLabel(standard) {
    return standard?.isActive ? 'Active' : 'Inactive';
  }

  function renderStandardDetails(standard, sections = [], evaluations = []) {
    const content = $('standardDetailsContent');
    if (!content) return;
    if ($('standardDetailsTitle')) $('standardDetailsTitle').textContent = '';
    if ($('standardDetailsSubtitle')) {
      $('standardDetailsSubtitle').textContent = '';
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
        <div><span>Total weight</span><strong>${num(totalWeight, 0).toFixed(1)}</strong></div>
        <div><span>Created by</span><strong>${esc(standard?.createdByName || '—')}</strong></div>
        <div><span>Created time</span><strong>${esc(fmtDateTime(standard?.createdAt))}</strong></div>
      </div>
      ${evaluations.length ? `<div class="kpis-standard-detail-evaluations"><div class="kpis-standard-detail-evaluations__head"><h4>Overall Evaluation</h4></div><div class="kpis-standard-detail-evaluation-list">${evaluations.map((evaluation, index) => `<div class="kpis-standard-detail-evaluation"><span>${index + 1}</span><strong>${num(evaluation.scoreFromPercentage ?? evaluation.scorePercentage, 0).toFixed(1)}% - ${num(evaluation.scoreToPercentage, 100).toFixed(1)}%</strong><em>${esc(evaluation.grade || '—')}</em></div>`).join('')}</div></div>` : ''}
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
      renderStandardDetails(standard, data.sections || [], data.evaluations || []);
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

  function evidenceFileName(value) {
    const text = String(value || '').trim();
    if (!text) return 'No evidence uploaded';
    try {
      const url = new URL(text);
      const name = decodeURIComponent((url.pathname || '').split('/').filter(Boolean).pop() || 'Evidence file');
      return name || 'Evidence file';
    } catch {
      return text;
    }
  }

  function evidenceReadOnlyHtml(value) {
    const text = String(value || '').trim();
    if (!text) return '<div><span>Evidence</span><p>—</p></div>';
    const label = evidenceFileName(text);
    if (/^https?:\/\//i.test(text)) {
      return `<div><span>Evidence</span><a class="kpis-evidence-link" href="${esc(text)}" target="_blank" rel="noopener"><i data-feather="paperclip"></i><strong>${esc(label)}</strong></a></div>`;
    }
    return `<div><span>Evidence</span><p>${esc(label)}</p></div>`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read evidence file.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadEvidenceFile(file) {
    if (!file) throw new Error('Choose an evidence file first.');
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) throw new Error('Evidence file must be 15 MB or smaller.');
    const dataUrl = await readFileAsDataUrl(file);
    const data = await api('/api/kpis/evidence-upload', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size, dataUrl }),
    });
    return data?.file?.url || '';
  }

  function bindEvidenceUploadControls(wrapper) {
    if (!wrapper) return;
    wrapper.querySelectorAll('[data-evidence-card]').forEach((card) => {
      const fileInput = card.querySelector('[data-evidence-file]');
      const hidden = card.querySelector('[data-score-field="evidenceText"]');
      const button = card.querySelector('[data-evidence-button]');
      const label = card.querySelector('[data-evidence-label]');
      button?.addEventListener('click', () => fileInput?.click());
      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const originalHtml = button?.innerHTML || '';
        try {
          if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="kpis-loading-dot"></span><strong>Uploading...</strong>';
          }
          const url = await uploadEvidenceFile(file);
          if (!url) throw new Error('Evidence upload did not return a file URL.');
          if (hidden) hidden.value = url;
          if (label) label.textContent = file.name;
          toast('Evidence uploaded successfully.', 'success');
        } catch (error) {
          toast(error.message || 'Failed to upload evidence.', 'error');
        } finally {
          if (button) {
            button.disabled = false;
            button.innerHTML = originalHtml;
          }
          feather();
        }
      });
    });
  }

  async function openScoreModal(id, options = {}) {
    const query = options.adminPassword ? `?adminPassword=${encodeURIComponent(options.adminPassword)}` : '';
    const readOnly = Boolean(options.readOnly);
    const data = await api(`/api/kpis/reviews/${encodeURIComponent(id)}${query}`);
    const summary = data.summary || {};
    const details = data.details || [];
    state.selectedReviewId = id;

    if (isCurrentUserReview(summary)) {
      updateScore(summary);
    }

    const form = $('scoreForm');
    if (form) {
      form.dataset.readOnly = readOnly ? 'true' : 'false';
      form.classList.toggle('is-read-only', readOnly);
      const actions = form.querySelector('.kpis-modal-actions');
      if (actions) actions.hidden = readOnly;
    }

    if ($('scoreModalKicker')) $('scoreModalKicker').textContent = `${fmtMonth(summary.reviewMonth)} KPI review`;
    if ($('scoreModalTitle')) $('scoreModalTitle').textContent = summary.teamMemberName || 'Employee KPI review';
    if ($('scoreModalSub')) $('scoreModalSub').textContent = '';

    const score = Math.max(0, Math.min(100, num(summary.finalPercentage, 0)));
    const reviewBlocks = `
      <div class="kpis-review-detail-grid">
        <div><span>Employee</span><strong>${esc(summary.teamMemberName || '—')}</strong></div>
        <div><span>Department</span><strong>${esc(summary.department || '—')}</strong></div>
        <div><span>Role / Position</span><strong>${esc(summary.rolePosition || '—')}</strong></div>
        <div><span>Month</span><strong>${esc(fmtMonth(summary.reviewMonth))}</strong></div>
        <div><span>Score</span><strong>${summary.reviewId ? `${score.toFixed(1)}%` : '—'}</strong></div>
        <div><span>Created by</span><strong>${esc(summary.createdByName || '—')}</strong></div>
        <div><span>Created time</span><strong>${esc(fmtDateTime(summary.createdAt))}</strong></div>
      </div>
    `;

    const wrapper = $('scoreItemsEditor');
    if (wrapper) {
      const sectionsHtml = groupDetails(details)
        .map(
          (section, sectionIndex) => `<div class="kpis-score-section kpis-score-section--modern"><div class="kpis-score-section__head"><div><span class="kpis-score-section__number">${sectionIndex + 1}</span><strong>${esc(section.section || 'Section')}</strong></div>${section.sectionDescription ? `<p>${esc(section.sectionDescription)}</p>` : ''}</div><div class="kpis-score-subcards">${section.items
            .map((item) => {
              const scoreValue = item.actualPercent === null ? '' : item.actualPercent;
              const percentValue = scoreValue === '' ? 0 : scoreToPercentage(scoreValue, item.weightPercent);
              const scoreLabel = scoreValue === '' ? '—' : num(scoreValue, 0).toFixed(1);
              const evidence = String(item.evidenceText || '').trim();
              const managerNotes = String(item.managerNotes || '').trim();
              const readOnlyBody = `<div class="kpis-score-readonly-grid"><div class="kpis-score-readonly-card"><span>Score</span><strong>${esc(scoreLabel)}</strong></div><div class="kpis-score-readonly-card"><span>KPI %</span><strong>${percentValue.toFixed(1)}%</strong></div></div><div class="kpis-score-readonly-notes">${evidenceReadOnlyHtml(evidence)}<div><span>Manager notes</span><p>${managerNotes ? esc(managerNotes) : '—'}</p></div></div>`;
              const editBody = `<div class="kpis-score-subcard__body">
                  <label class="kpis-score-input-card"><span>Score</span><input class="kpis-input" data-score-field="actualPercent" type="number" min="0" max="${esc(item.weightPercent || 0)}" step="0.01" value="${scoreValue === '' ? '' : esc(scoreValue)}" /></label>
                  <div class="kpis-score-percent-card"><span>KPI %</span><strong data-score-percent>${percentValue.toFixed(1)}%</strong></div>
                </div>
                <div class="kpis-score-notes kpis-score-notes--modern kpis-score-notes--evidence"><div class="kpis-evidence-card" data-evidence-card><span>Evidence</span><input type="hidden" data-score-field="evidenceText" value="${esc(item.evidenceText || '')}" /><input data-evidence-file type="file" hidden /><button class="kpis-evidence-upload" data-evidence-button type="button"><i data-feather="upload-cloud"></i><strong>Upload evidence</strong></button><small data-evidence-label>${esc(evidenceFileName(item.evidenceText || ''))}</small></div><label>Manager notes<textarea class="kpis-textarea" data-score-field="managerNotes" rows="2">${esc(item.managerNotes || '')}</textarea></label></div>`;
              return `<article class="kpis-score-subcard${readOnly ? ' kpis-score-subcard--readonly' : ''}" data-score-id="${esc(item.scoreId)}" data-weight="${esc(item.weightPercent)}">
                <div class="kpis-score-subcard__head">
                  <div class="kpis-score-subcard__title"><span>${esc(String(item.subsectionOrder || '—'))}</span><div><h4>${esc(item.subsection || 'KPI subsection')}</h4>${item.subsectionDescription ? `<p>${esc(item.subsectionDescription)}</p>` : ''}</div></div>
                  <div class="kpis-score-weight-pill"><span>Weight</span><strong>${num(item.weightPercent, 0).toFixed(1)}</strong></div>
                </div>
                ${readOnly ? readOnlyBody : editBody}
              </article>`;
            })
            .join('')}</div></div>`,
        )
        .join('');
      wrapper.innerHTML = reviewBlocks + sectionsHtml;
      if (!readOnly) {
        bindEvidenceUploadControls(wrapper);
        wrapper.querySelectorAll('[data-score-field="actualPercent"]').forEach((input) => {
          input.addEventListener('input', () => {
            const card = input.closest('[data-score-id]');
            const percent = card?.querySelector('[data-score-percent]');
            if (percent) percent.textContent = `${scoreToPercentage(input.value, card?.dataset.weight).toFixed(1)}%`;
          });
        });
      }
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
    $('openStandardBtn')?.addEventListener('click', () => openStandardModalWithAdmin().catch((error) => toast(error.message, 'error')));
    $('openStandardBtn2')?.addEventListener('click', () => openStandardModalWithAdmin().catch((error) => toast(error.message, 'error')));
    $('openReviewBtn')?.addEventListener('click', () => openReviewModalWithAdmin().catch((error) => toast(error.message, 'error')));
    $('openHeroReviewBtn')?.addEventListener('click', () => openReviewModalWithAdmin().catch((error) => toast(error.message, 'error')));
    $('kpiRefreshBtn')?.addEventListener('click', () => openReviewModalWithAdmin().catch((error) => toast(error.message, 'error')));
    $('openReviewFiltersBtn')?.addEventListener('click', () => { enhanceReviewFilterControls(); openModal('reviewFilters'); });
    $('openStandardFiltersBtn')?.addEventListener('click', () => {
      setOptions($('standardFilterDepartmentSelect'), state.departments, { allLabel: 'All departments' });
      if ($('standardFilterDepartmentSelect')) $('standardFilterDepartmentSelect').value = state.standardFilters.department || '';
      updateStandardFilterPositionOptions();
      if ($('standardFilterPositionSelect')) $('standardFilterPositionSelect').value = state.standardFilters.position || '';
      enhanceStandardFilterControls();
      refreshEnhancedSelect($('standardFilterDepartmentSelect'));
      refreshEnhancedSelect($('standardFilterPositionSelect'));
      openModal('standardFilters');
    });
    $('downloadKpiReportBtn')?.addEventListener('click', () => {
      const query = buildReviewQuery();
      window.open(`/api/kpis/reviews/report.pdf${query.toString() ? `?${query}` : ''}`, '_blank', 'noopener');
    });
    document.querySelectorAll('[data-review-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeReviewTab = button.dataset.reviewTab || 'all';
        document.querySelectorAll('[data-review-tab]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
        loadReviews().catch((error) => toast(error.message, 'error'));
      });
    });
    $('addKpiSectionBtn')?.addEventListener('click', promptAndAddSection);
    $('addEvaluationBtn')?.addEventListener('click', () => addEvaluationRow());
    $('confirmSectionTitleBtn')?.addEventListener('click', () => closeSectionTitleDialog({ title: $('sectionTitleInput')?.value || '', description: $('sectionDescriptionInput')?.value || '' }));
    $('sectionTitleInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); closeSectionTitleDialog({ title: event.currentTarget.value || '', description: $('sectionDescriptionInput')?.value || '' }); } });
    document.querySelectorAll('[data-section-title-cancel]').forEach((element) => element.addEventListener('click', () => closeSectionTitleDialog(null)));
    $('confirmAdminPasswordBtn')?.addEventListener('click', () => closeAdminPasswordDialog($('adminPasswordInput')?.value || ''));
    $('adminPasswordInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); closeAdminPasswordDialog(event.currentTarget.value || ''); } });
    document.querySelectorAll('[data-admin-password-cancel]').forEach((element) => element.addEventListener('click', () => closeAdminPasswordDialog(null)));
    document.addEventListener('click', () => closeEnhancedSelects());
    $('standardDepartmentSelect')?.addEventListener('change', updateStandardPositionOptions);
    $('standardFilterDepartmentSelect')?.addEventListener('change', updateStandardFilterPositionOptions);
    $('filterStandardSelect')?.addEventListener('change', () => { updateFilterSectionOptions().catch((error) => toast(error.message, 'error')); });

    document.querySelectorAll('[data-kpi-close]').forEach((element) => {
      element.addEventListener('click', () => closeModal(element.dataset.kpiClose));
    });

    $('standardFilterForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      state.standardFilters.department = $('standardFilterDepartmentSelect')?.value || '';
      state.standardFilters.position = $('standardFilterPositionSelect')?.value || '';
      closeModal('standardFilters');
      renderStandards();
    });
    $('clearStandardFiltersBtn')?.addEventListener('click', () => {
      state.standardFilters = { department: '', position: '' };
      if ($('standardFilterDepartmentSelect')) $('standardFilterDepartmentSelect').value = '';
      updateStandardFilterPositionOptions();
      if ($('standardFilterPositionSelect')) $('standardFilterPositionSelect').value = '';
      refreshEnhancedSelect($('standardFilterDepartmentSelect'));
      refreshEnhancedSelect($('standardFilterPositionSelect'));
      closeModal('standardFilters');
      renderStandards();
    });

    $('reviewFilterForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      closeModal('reviewFilters');
      loadReviews().catch((error) => toast(error.message, 'error'));
    });
    $('clearReviewFiltersBtn')?.addEventListener('click', () => {
      ['filterEmployeeSelect', 'filterDepartmentSelect', 'filterPositionSelect', 'filterStandardSelect', 'filterSectionSelect'].forEach((id) => { if ($(id)) { $(id).value = ''; refreshEnhancedSelect($(id)); } });
      updateFilterSectionOptions().catch(() => null);
      if ($('filterMonthInput')) $('filterMonthInput').value = '';
      closeModal('reviewFilters');
      loadReviews().catch((error) => toast(error.message, 'error'));
    });
    $('reviewEmployeeSelect')?.addEventListener('change', updateReviewStandardOptions);

    $('standardForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitButton = form.querySelector('button[type="submit"]');
      const items = collectKpiRows();
      const duplicateStandardExists = hasDuplicateStandardForSelection(form.elements.department.value, form.elements.rolePosition.value);
      if (duplicateStandardExists) {
        toast('A KPI standard already exists for this department and position. The new standard will still be saved.', 'info');
      }
      if (!document.querySelector('#kpiItemsEditor .kpis-section-card')) {
        toast('Add a KPI section first.');
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
        const data = await api('/api/kpis/standards', {
          method: 'POST',
          body: JSON.stringify({
            department: form.elements.department.value,
            rolePosition: form.elements.rolePosition.value,
            title: form.elements.title.value,
            description: form.elements.description.value,
            items,
            evaluations: collectEvaluations(),
            adminPassword: state.standardAdminPassword,
          }),
        });
        await loadMeta();
        state.standardAdminPassword = '';
        closeModal('standard');
        if (data.duplicateFound && !duplicateStandardExists) {
          toast('A KPI standard already exists for this department and position. The new standard was saved as an additional standard.', 'info');
        }
        toast('KPI standard saved successfully.', 'success');
      } catch (error) {
        toast(error.message || 'Failed to save KPI standard.', 'error');
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
        toast(error.message || 'Failed to create KPI review.', 'error');
      } finally {
        setReviewTransitionLoading(false);
        setButtonLoading(submitButton, false);
      }
    });

    $('scoreForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (event.currentTarget?.dataset.readOnly === 'true') return;
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
      toast('KPI scores saved successfully.', 'success');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    loadMeta()
      .catch((error) => {
        const message = error?.message || 'Failed to load KPIs.';
        if ($('kpiReviewsBody')) $('kpiReviewsBody').innerHTML = `<tr><td colspan="4">${esc(message)}</td></tr>`;
        if ($('kpiStandardsList')) $('kpiStandardsList').innerHTML = `<div class="kpis-chart-empty">${esc(message)}</div>`;
        renderChart([]);
      })
      .finally(feather);
  });
})();

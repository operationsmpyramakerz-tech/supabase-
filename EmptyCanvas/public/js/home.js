// public/js/home.js
// Home dashboard — analysis blocks (Operations)

document.addEventListener('DOMContentLoaded', () => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    updated: $('#homeUpdated'),
    scopeLine: $('#homeScopeLine'),
    search: $('#homeSearch'),

    // KPIs
    kpiTasksMain: $('#kpiTasksMain'),
    kpiTasksSub: $('#kpiTasksSub'),
    kpiOrdersMain: $('#kpiOrdersMain'),
    kpiOrdersSub: $('#kpiOrdersSub'),
    ordersInProgressCount: $('#ordersInProgressCount'),
    ordersInProgressCost: $('#ordersInProgressCost'),
    ordersCompletedCount: $('#ordersCompletedCount'),
    ordersCompletedCost: $('#ordersCompletedCost'),
    ordersRejectedCount: $('#ordersRejectedCount'),
    ordersRejectedCost: $('#ordersRejectedCost'),
    ordersRingInProgress: $('#ordersRingInProgress'),
    ordersRingCompleted: $('#ordersRingCompleted'),
    ordersRingRejected: $('#ordersRingRejected'),
    ordersAnalysisControl: $('#ordersAnalysisControl'),
    ordersAnalysisTrigger: $('#ordersAnalysisTrigger'),
    ordersAnalysisMenu: $('#ordersAnalysisMenu'),
    ordersAnalysisTime: $('#ordersAnalysisTime'),
    ordersAnalysisBy: $('#ordersAnalysisBy'),
    ordersAnalysisLabel: $('#ordersAnalysisLabel'),
    kpiRequestedMain: $('#kpiRequestedMain'),
    kpiRequestedSub: $('#kpiRequestedSub'),
    operationsPendingCount: $('#operationsPendingCount'),
    operationsPendingCost: $('#operationsPendingCost'),
    operationsReceivedCount: $('#operationsReceivedCount'),
    operationsReceivedCost: $('#operationsReceivedCost'),
    operationsDeliveredCount: $('#operationsDeliveredCount'),
    operationsDeliveredCost: $('#operationsDeliveredCost'),
    operationsRingPending: $('#operationsRingPending'),
    operationsRingReceived: $('#operationsRingReceived'),
    operationsRingDelivered: $('#operationsRingDelivered'),
    kpiMaintenanceMain: $('#kpiMaintenanceMain'),
    kpiMaintenanceSub: $('#kpiMaintenanceSub'),
    maintenancePendingCount: $('#maintenancePendingCount'),
    maintenancePendingCost: $('#maintenancePendingCost'),
    maintenanceInProgressCount: $('#maintenanceInProgressCount'),
    maintenanceInProgressCost: $('#maintenanceInProgressCost'),
    maintenanceCompletedCount: $('#maintenanceCompletedCount'),
    maintenanceCompletedCost: $('#maintenanceCompletedCost'),
    maintenanceRingPending: $('#maintenanceRingPending'),
    maintenanceRingInProgress: $('#maintenanceRingInProgress'),
    maintenanceRingCompleted: $('#maintenanceRingCompleted'),
    kpiReviewMain: $('#kpiReviewMain'),
    kpiReviewSub: $('#kpiReviewSub'),
    reviewPendingCount: $('#reviewPendingCount'),
    reviewPendingCost: $('#reviewPendingCost'),
    reviewApprovedCount: $('#reviewApprovedCount'),
    reviewApprovedCost: $('#reviewApprovedCost'),
    reviewRejectedCount: $('#reviewRejectedCount'),
    reviewRejectedCost: $('#reviewRejectedCost'),
    reviewRingPending: $('#reviewRingPending'),
    reviewRingApproved: $('#reviewRingApproved'),
    reviewRingRejected: $('#reviewRingRejected'),
    kpiStockMain: $('#kpiStockMain'),
    kpiStockSub: $('#kpiStockSub'),
    kpiStockCost: $('#kpiStockCost'),
    stockAnalysisControl: $('#stockAnalysisControl'),
    stockAnalysisTrigger: $('#stockAnalysisTrigger'),
    stockAnalysisMenu: $('#stockAnalysisMenu'),
    stockTagFilter: $('#stockTagFilter'),
    stockTagFilterTrigger: $('#stockTagFilterTrigger'),
    stockTagFilterText: $('#stockTagFilterText'),
    stockTagFilterOptions: $('#stockTagFilterOptions'),
    globalAnalysisControl: $('#globalAnalysisControl'),
    globalAnalysisTrigger: $('#globalAnalysisTrigger'),
    globalAnalysisMenu: $('#globalAnalysisMenu'),
    globalAnalysisUser: $('#globalAnalysisUser'),
    globalUserTrigger: $('#globalUserTrigger'),
    globalUserText: $('#globalUserText'),
    globalUserOptions: $('#globalUserOptions'),
    globalAnalysisDuration: $('#globalAnalysisDuration'),
    globalDurationTrigger: $('#globalDurationTrigger'),
    globalDurationText: $('#globalDurationText'),
    globalDurationOptions: $('#globalDurationOptions'),
    kpiExpensesMain: $('#kpiExpensesMain'),
    kpiExpensesSub: $('#kpiExpensesSub'),

    // Lists
    tasksSubtitle: $('#tasksSubtitle'),
    ordersSubtitle: $('#ordersSubtitle'),
    tasksList: $('#homeTasksList'),
    ordersList: $('#homeOrdersList'),

    // Charts
    tasksChart: $('#homeTasksChart'),
    ordersChart: $('#homeOrdersChart'),
    expensesChart: $('#homeExpensesChart'),
    tasksChartSubtitle: $('#tasksChartSubtitle'),
    ordersChartSubtitle: $('#ordersChartSubtitle'),
    expensesChartSubtitle: $('#expensesChartSubtitle'),

    // Actions + scope
    actions: $('#homeActions'),
    scopeDept: $('#scopeDept'),
    scopePos: $('#scopePos'),
    scopeChips: $('#scopeChips'),
    modulesGrid: $('#homeModulesGrid'),
    modulesCount: $('#homeModulesCount'),
  };

  const state = {
    allowedSet: new Set(),
    allowedPagesRaw: [],
    dept: '',
    position: '',
    tasks: [],
    orders: [],
    orderGroups: [],
    requestedItems: [],
    requestedGroups: [],
    reviewItems: [],
    reviewGroups: [],
    expenses: [],
    stock: [],
    stockDefault: [],
    stockFilters: { tag: 'all' },
    analysisUsers: [],
    globalAnalysis: { user: 'all', duration: 'all' },
    ordersAnalysis: { time: 'all', by: 'status' },
    reviewAnalysis: { time: 'all', by: 'status' },
    operationsAnalysis: { time: 'all', by: 'status' },
    maintenanceGroups: [],
  };

  const norm = (s) => String(s || '').trim().toLowerCase();
  const normPath = (s) => norm(s).replace(/\/+$/, '');

  const moneyFmt = (() => {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EGP' });
    } catch {
      return null;
    }
  })();

  function fmtMoney(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return moneyFmt ? moneyFmt.format(safe) : `${safe.toFixed(2)} EGP`;
  }

  function optionText(value) {
    if (Array.isArray(value)) {
      return value.map((item) => optionText(item)).filter(Boolean).join(', ');
    }
    if (value && typeof value === 'object') {
      return String(value.name || value.label || value.title || value.value || '').trim();
    }
    return String(value || '').trim();
  }

  function safeNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function safeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }


  function notionColorVars(notionColor) {
    const key = norm(String(notionColor || 'default').replace(/_background$/i, ''));
    const map = {
      default: { bg: '#E5E7EB', fg: '#374151', bd: '#D1D5DB' },
      gray: { bg: '#E5E7EB', fg: '#374151', bd: '#D1D5DB' },
      brown: { bg: '#F3E8E2', fg: '#6B4F3A', bd: '#E7D3C8' },
      orange: { bg: '#FFEDD5', fg: '#9A3412', bd: '#FED7AA' },
      yellow: { bg: '#FEF3C7', fg: '#92400E', bd: '#FDE68A' },
      green: { bg: '#DCFCE7', fg: '#166534', bd: '#86EFAC' },
      blue: { bg: '#DBEAFE', fg: '#1D4ED8', bd: '#BFDBFE' },
      purple: { bg: '#EDE9FE', fg: '#6D28D9', bd: '#DDD6FE' },
      pink: { bg: '#FCE7F3', fg: '#BE185D', bd: '#FBCFE8' },
      red: { bg: '#FEE2E2', fg: '#B91C1C', bd: '#FECACA' },
    };
    return map[key] || map.default;
  }

  function orderTypeMeta(type, notionColor) {
    const key = String(type || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key === 'requestproducts' || key === 'delivery') {
      return { label: 'Request Products', bg: '#DCFCE7', fg: '#166534', bd: '#86EFAC' };
    }
    if (key === 'withdrawproducts' || key === 'withdrawal') {
      return { label: 'Withdraw Products', bg: '#FEE2E2', fg: '#B91C1C', bd: '#FECACA' };
    }
    if (key === 'requestmaintenance' || key === 'maintenance') {
      return { label: 'Request Maintenance', bg: '#FEF3C7', fg: '#92400E', bd: '#FDE68A' };
    }
    const fallback = notionColorVars(notionColor);
    return {
      label: String(type || '').trim() || 'Order',
      bg: fallback.bg,
      fg: fallback.fg,
      bd: fallback.bd,
    };
  }

  function toast(type, title, message) {
    if (window.UI?.toast) return window.UI.toast({ type, title, message });
    console[type === 'error' ? 'error' : 'log'](title, message);
  }

  function setUpdatedNow() {
    if (!els.updated) return;
    const d = new Date();
    const txt = d.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    els.updated.textContent = `Updated ${txt}`;
  }

  function hideBlock(key) {
    $$(`[data-block="${key}"]`).forEach((el) => el.classList.add('is-hidden'));
  }
  function showBlock(key) {
    $$(`[data-block="${key}"]`).forEach((el) => el.classList.remove('is-hidden'));
  }

  function hasAccess(pageNameOrPath) {
    const k = norm(pageNameOrPath);
    const p = normPath(pageNameOrPath);
    return state.allowedSet.has(k) || state.allowedSet.has(p) || state.allowedSet.has('/' + p);
  }

  function buildAllowedSet(allowedPages) {
    const set = new Set();
    (allowedPages || []).forEach((v) => {
      const k = norm(v);
      const p = normPath(v);
      if (k) set.add(k);
      if (p) {
        set.add(p);
        if (!p.startsWith('/')) set.add('/' + p);
        if (p.startsWith('/')) set.add(p.slice(1));
      }
    });
    return set;
  }

  function formatISODate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!Number.isFinite(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function isDoneStatus(status) {
    const s = norm(status);
    return /(done|completed|complete|finished|closed)/.test(s);
  }

  function toYMD(dateLike) {
    try {
      const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
      if (!Number.isFinite(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    } catch {
      return '';
    }
  }

  // ===== Orders grouping / stage =====
  const ORDER_FLOW = [
    { label: 'Order Placed' },
    { label: 'Under Supervision' },
    { label: 'In progress' },
    { label: 'Shipped' },
    { label: 'Arrived' },
  ];

  function orderStatusToIndex(status) {
    const s = norm(status).replace(/[_-]+/g, ' ');
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/(shipped|on the way|delivering|prepared)/.test(s)) return 4;
    if (/(in progress|inprogress|progress)/.test(s)) return 3;
    if (/(under supervision|supervision|review)/.test(s)) return 2;
    if (/(order placed|placed|pending|order received)/.test(s)) return 1;
    return 1;
  }

  function orderComputeStage(items) {
    let bestIdx = 1;
    for (const it of items || []) {
      const i = orderStatusToIndex(it?.status);
      if (i > bestIdx) bestIdx = i;
    }
    const safeIdx = Math.min(5, Math.max(1, bestIdx));
    return { idx: safeIdx, label: ORDER_FLOW[safeIdx - 1]?.label || 'Order Placed' };
  }

  function groupOrdersByMinute(list) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const keyOf = (createdTime) => {
      const d = new Date(createdTime || 0);
      if (!Number.isFinite(d.getTime())) return 'Unknown time';
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    const map = new Map();
    const sorted = (list || []).slice().sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    for (const o of sorted) {
      // Keep each real order separate. Maintenance, withdrawal, and product
      // orders can be created within the same minute, so grouping only by the
      // timestamp can merge different ORD cards and make the Home analysis
      // count smaller than Current Orders.
      const explicitOrderKey =
        o?.orderGroupId ??
        o?.order_group_id ??
        o?.orderIdNumber ??
        o?.order_id_number ??
        o?.orderId ??
        o?.order_id ??
        null;
      const key = explicitOrderKey !== null && String(explicitOrderKey).trim()
        ? `order:${String(explicitOrderKey).trim()}`
        : `minute:${keyOf(o.createdTime)}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          groupId: o.id,
          latestCreated: o.createdTime,
          products: [],
          orderType: o?.orderType || '',
          orderTypeColor: o?.orderTypeColor || null,
        };
        map.set(key, g);
      }
      g.products.push(o);
      // representative id should be the latest created within the group
      if (new Date(o.createdTime) > new Date(g.latestCreated)) {
        g.latestCreated = o.createdTime;
        g.groupId = o.id;
      }
      if (!g.orderType && o?.orderType) g.orderType = o.orderType;
      if (!g.orderTypeColor && o?.orderTypeColor) g.orderTypeColor = o.orderTypeColor;
    }

    const groups = Array.from(map.values()).sort((a, b) => new Date(b.latestCreated) - new Date(a.latestCreated));
    return groups;
  }

  function ordersEstimateTotal(items) {
    return (items || []).reduce((sum, x) => sum + (Number(x.quantity) || 0) * (Number(x.unitPrice) || 0), 0);
  }

  function currentOrderPerformanceStatus(items) {
    const rows = Array.isArray(items) ? items : [];

    // A rejected decision is stored in the review/approval fields while the
    // operational status may remain "In progress" or "Shipping". Use the
    // same rejection signals as Current Orders / Orders Review so Home stays
    // consistent with those pages.
    const isRejected = rows.some((item) => {
      const signals = [
        item?.status,
        item?.operationsApproval,
        item?.operations_approval,
        item?.svApproval,
        item?.svApprovalName,
        item?.sv_approval,
      ]
        .map((value) => norm(optionText(value)).replace(/[_-]+/g, ' '));
      const rejectedReason = String(item?.rejectedReason || item?.rejected_reason || '').trim();
      return signals.some((value) => /rejected/.test(value)) || Boolean(rejectedReason);
    });
    if (isRejected) return 'rejected';

    const statuses = rows.map((item) => norm(optionText(item?.status)).replace(/[_-]+/g, ' '));
    if (statuses.some((status) => /(arrived|shipping|shipped)/.test(status))) return 'completed';
    if (statuses.some((status) => /(under supervision|approved|in progress)/.test(status))) return 'inProgress';
    return 'other';
  }

  function setRingSegment(circle, value, total, offset, gapLength = 0) {
    if (!circle) return offset;

    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const numericValue = Math.max(0, Number(value) || 0);
    const numericTotal = Math.max(0, Number(total) || 0);

    // A zero-length SVG circle with round line caps can still render as a dot.
    // Hide empty statuses completely so only statuses with data appear.
    if (!numericTotal || !numericValue) {
      circle.style.display = 'none';
      circle.style.strokeDasharray = `0 ${circumference}`;
      circle.style.strokeDashoffset = '0';
      return offset;
    }

    circle.style.display = '';
    const allocatedLength = (numericValue / numericTotal) * circumference;
    const visibleLength = Math.max(1, allocatedLength - gapLength);
    circle.style.strokeDasharray = `${visibleLength} ${Math.max(0, circumference - visibleLength)}`;
    circle.style.strokeDashoffset = `${-offset}`;

    // Advance using the full allocated span. The removed portion becomes the
    // clean separator between this segment and the next visible segment.
    return offset + allocatedLength;
  }

  function filterOrderGroupsByTime(groups, range) {
    const source = Array.isArray(groups) ? groups : [];
    if (range === 'all') return source;

    const now = new Date();
    const from = new Date(now);
    if (range === 'week') from.setDate(from.getDate() - 7);
    else if (range === 'month') from.setMonth(from.getMonth() - 1);
    else if (range === 'year') from.setFullYear(from.getFullYear() - 1);
    else return source;

    return source.filter((group) => {
      const date = new Date(group?.latestCreated || group?.products?.[0]?.createdTime || 0);
      return Number.isFinite(date.getTime()) && date >= from && date <= now;
    });
  }

  function currentOrderTypeBucket(group) {
    // Current Orders groups store rows in `products`, while Operations Orders
    // and Orders Review groups store the same API rows in `items`. Read the
    // type from the group first, then inspect every row so mixed backend field
    // shapes (Supabase / Notion compatibility) are handled consistently.
    const rows = [
      ...(Array.isArray(group?.products) ? group.products : []),
      ...(Array.isArray(group?.items) ? group.items : []),
    ];

    const candidates = [
      group?.orderType,
      group?.order_type,
      group?.type,
      ...rows.flatMap((row) => [
        row?.orderType,
        row?.order_type,
        row?.type,
        row?.requestType,
        row?.request_type,
      ]),
    ];

    for (const candidate of candidates) {
      const raw = optionText(candidate);
      const key = norm(raw).replace(/[^a-z0-9]+/g, '');
      if (!key) continue;
      if (/(withdraw|withdrawal)/.test(key)) return 'withdrawal';
      if (/(maintenance|requestmaintenance)/.test(key)) return 'maintenance';
      if (/(request|delivery|product)/.test(key)) return 'request';
    }

    return 'request';
  }

  function updateOrdersAnalysisLabels(mode) {
    const config = mode === 'type'
      ? [
          { key: 'request', label: 'Request', color: '#176b3a' },
          { key: 'withdrawal', label: 'Withdrawal', color: '#dc2626' },
          { key: 'maintenance', label: 'Maintenance', color: '#eab308' },
        ]
      : [
          { key: 'inProgress', label: 'In progress', color: '#f97316' },
          { key: 'completed', label: 'Completed', color: '#176b3a' },
          { key: 'rejected', label: 'Rejected', color: '#dc2626' },
        ];

    const cards = Array.from(document.querySelectorAll('.home-orders-status'));
    cards.forEach((card, index) => {
      const item = config[index];
      if (!item) return;
      card.dataset.analysisKey = item.key;
      card.style.setProperty('--status-color', item.color);
      const label = card.querySelector('span:not(.home-orders-status__bar)');
      if (label) label.textContent = item.label;
    });
    return config;
  }

  function renderCurrentOrdersPerformance(groups) {
    const timeRange = state.ordersAnalysis?.time || 'all';
    const analysisBy = state.ordersAnalysis?.by || 'status';
    const filteredGroups = filterOrderGroupsByTime(groups, timeRange);
    const config = updateOrdersAnalysisLabels(analysisBy);
    const summary = {
      totalCount: filteredGroups.length,
      totalCost: 0,
      values: Object.fromEntries(config.map((item) => [item.key, { count: 0, cost: 0 }])),
    };

    filteredGroups.forEach((group) => {
      const products = group?.products || [];
      const cost = ordersEstimateTotal(products);
      const bucket = analysisBy === 'type'
        ? currentOrderTypeBucket(group)
        : currentOrderPerformanceStatus(products);
      summary.totalCost += cost;
      if (summary.values[bucket]) {
        summary.values[bucket].count += 1;
        summary.values[bucket].cost += cost;
      }
    });

    if (els.kpiOrdersMain) els.kpiOrdersMain.textContent = String(summary.totalCount);
    if (els.kpiOrdersSub) els.kpiOrdersSub.textContent = fmtMoney(summary.totalCost);
    requestAnimationFrame(fitOrdersRingToContent);

    const countEls = [els.ordersInProgressCount, els.ordersCompletedCount, els.ordersRejectedCount];
    const costEls = [els.ordersInProgressCost, els.ordersCompletedCost, els.ordersRejectedCost];
    const circles = [els.ordersRingInProgress, els.ordersRingCompleted, els.ordersRingRejected];
    const values = config.map((item) => summary.values[item.key]);

    values.forEach((value, index) => {
      if (countEls[index]) countEls[index].textContent = String(value.count);
      if (costEls[index]) costEls[index].textContent = fmtMoney(value.cost);
      if (circles[index]) circles[index].style.stroke = config[index].color;
    });

    const activeSegments = values.filter((value) => value.count > 0).length;
    const segmentGap = activeSegments > 1 ? 18 : 0;
    let offset = 0;
    values.forEach((value, index) => {
      offset = setRingSegment(circles[index], value.count, summary.totalCount, offset, segmentGap);
    });
  }

  function fitOrdersRingToContent() {
    const ring = document.querySelector('.home-orders-ring');
    const center = ring?.querySelector('.home-orders-ring__center');
    if (!ring || !center) return;

    const children = Array.from(center.children);
    const measure = document.createElement('span');
    measure.setAttribute('aria-hidden', 'true');
    Object.assign(measure.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      width: 'max-content',
      maxWidth: 'none',
      whiteSpace: 'nowrap',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    document.body.appendChild(measure);

    let widest = 0;
    let textHeight = 0;
    children.forEach((child) => {
      const style = getComputedStyle(child);
      measure.style.font = style.font;
      measure.style.fontWeight = style.fontWeight;
      measure.style.letterSpacing = style.letterSpacing;
      measure.textContent = child.textContent || '';
      widest = Math.max(widest, measure.getBoundingClientRect().width);
      textHeight += Math.max(parseFloat(style.lineHeight) || child.getBoundingClientRect().height, 12);
    });
    measure.remove();

    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const minimum = mobile ? 142 : 154;
    const maximum = mobile ? 196 : 220;
    const horizontalRoom = 76; // ring stroke + safe inner padding
    const verticalRoom = 64;
    const desired = Math.ceil(Math.max(widest + horizontalRoom, textHeight + verticalRoom, minimum));
    ring.style.setProperty('--orders-ring-size', `${Math.min(maximum, desired)}px`);
  }

  function ordersAnalysisTimeLabel(value) {
    return ({ week: 'Last week', month: 'Last month', year: 'Last year', all: 'All time' })[value] || 'All time';
  }

  function syncOrdersAnalysisControl() {
    if (els.ordersAnalysisLabel) {
      els.ordersAnalysisLabel.textContent = 'Analysis';
    }
    if (els.ordersAnalysisTime) els.ordersAnalysisTime.value = state.ordersAnalysis.time;
    if (els.ordersAnalysisBy) els.ordersAnalysisBy.value = state.ordersAnalysis.by;

    const timeSelectLabel = document.querySelector('[data-analysis-select="time"] [data-analysis-select-label]');
    const bySelectLabel = document.querySelector('[data-analysis-select="by"] [data-analysis-select-label]');
    if (timeSelectLabel) timeSelectLabel.textContent = ordersAnalysisTimeLabel(state.ordersAnalysis.time);
    if (bySelectLabel) bySelectLabel.textContent = state.ordersAnalysis.by === 'type' ? 'Type' : 'Status';

    document.querySelectorAll('[data-analysis-time]').forEach((button) => {
      const selected = button.dataset.analysisTime === state.ordersAnalysis.time;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-analysis-by]').forEach((button) => {
      const selected = button.dataset.analysisBy === state.ordersAnalysis.by;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function closeOrdersAnalysisMenu() {
    if (!els.ordersAnalysisMenu || !els.ordersAnalysisTrigger) return;
    els.ordersAnalysisMenu.hidden = true;
    els.ordersAnalysisTrigger.setAttribute('aria-expanded', 'false');
    els.ordersAnalysisControl?.classList.remove('is-open');
    els.ordersAnalysisMenu.querySelectorAll('.home-analysis-select').forEach((select) => {
      select.classList.remove('is-open');
      const trigger = select.querySelector('.home-analysis-select__trigger');
      const menu = select.querySelector('.home-analysis-select__menu');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (menu) menu.hidden = true;
    });
  }

  function setupOrdersAnalysisControl() {
    if (!els.ordersAnalysisTrigger || !els.ordersAnalysisMenu) return;
    syncOrdersAnalysisControl();

    els.ordersAnalysisTrigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = els.ordersAnalysisMenu.hidden;
      els.ordersAnalysisMenu.hidden = !willOpen;
      els.ordersAnalysisTrigger.setAttribute('aria-expanded', String(willOpen));
      els.ordersAnalysisControl?.classList.toggle('is-open', willOpen);
    });

    els.ordersAnalysisMenu.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const closeInnerSelects = (except = null) => {
      els.ordersAnalysisMenu.querySelectorAll('.home-analysis-select').forEach((select) => {
        if (select === except) return;
        select.classList.remove('is-open');
        const trigger = select.querySelector('.home-analysis-select__trigger');
        const menu = select.querySelector('.home-analysis-select__menu');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (menu) menu.hidden = true;
      });
    };

    els.ordersAnalysisMenu.querySelectorAll('.home-analysis-select').forEach((select) => {
      const trigger = select.querySelector('.home-analysis-select__trigger');
      const menu = select.querySelector('.home-analysis-select__menu');
      if (!trigger || !menu) return;
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = menu.hidden;
        closeInnerSelects(select);
        menu.hidden = !willOpen;
        select.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
      });
    });

    const apply = () => {
      state.ordersAnalysis.time = els.ordersAnalysisTime?.value || 'all';
      state.ordersAnalysis.by = els.ordersAnalysisBy?.value || 'status';
      syncOrdersAnalysisControl();
      renderCurrentOrdersPerformance(state.orderGroups || []);
    };

    els.ordersAnalysisMenu.querySelectorAll('[data-analysis-time]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (els.ordersAnalysisTime) els.ordersAnalysisTime.value = button.dataset.analysisTime || 'all';
        apply();
        closeInnerSelects();
      });
    });
    els.ordersAnalysisMenu.querySelectorAll('[data-analysis-by]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (els.ordersAnalysisBy) els.ordersAnalysisBy.value = button.dataset.analysisBy || 'status';
        apply();
        closeInnerSelects();
      });
    });

    const performanceCard = els.ordersAnalysisControl?.closest('.home-orders-performance');
    if (performanceCard) {
      const openOrders = () => { window.location.href = performanceCard.dataset.href || '/orders'; };
      performanceCard.addEventListener('click', (event) => {
        if (event.target.closest('button, input, .home-orders-analysis__menu')) return;
        openOrders();
      });
      performanceCard.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button, input')) {
          event.preventDefault();
          openOrders();
        }
      });
    }

    document.addEventListener('click', closeOrdersAnalysisMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeOrdersAnalysisMenu();
    });
  }

  // ===== Requested orders grouping (operations orders) =====
  function reqStatusToIndex(status) {
    const s = norm(status);
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/shipped/.test(s)) return 4;
    if (/(in\s*progress|preparing|processing)/.test(s)) return 3;
    if (/under\s*supervision/.test(s)) return 2;
    return 1;
  }

  function reqTabFromStageIdx(idx) {
    if (idx >= 5) return 'delivered';
    if (idx >= 4) return 'received';
    return 'not-started';
  }

  function groupRequested(list) {
    // The API already returns a flat list of rows that belong to the same order group.
    // The safest grouping key is the "orderGroupId" if present, otherwise we fallback to minute bucket.
    const pad2 = (n) => String(n).padStart(2, '0');
    const minuteKey = (createdTime) => {
      const d = new Date(createdTime || 0);
      if (!Number.isFinite(d.getTime())) return 'Unknown time';
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    const map = new Map();
    const sorted = (list || []).slice().sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    for (const it of sorted) {
      // Keep every real order group separate. The review and operations APIs
      // expose the order number using different field names depending on the
      // backend (Supabase / Notion). Falling back directly to the creation
      // minute can merge separate ORD cards created during the same minute.
      const explicitOrderKey =
        it?.orderGroupId ??
        it?.order_group_id ??
        it?.orderIdNumber ??
        it?.order_id_number ??
        it?.orderNumber ??
        it?.order_number ??
        it?.orderId ??
        it?.order_id ??
        null;
      const key = explicitOrderKey !== null && String(explicitOrderKey).trim()
        ? `order:${String(explicitOrderKey).trim()}`
        : `row:${String(it?.id || '').trim() || minuteKey(it.createdTime)}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          groupId: it?.groupId || it?.id,
          latestCreated: it.createdTime,
          items: [],
        };
        map.set(key, g);
      }
      g.items.push(it);
      if (new Date(it.createdTime) > new Date(g.latestCreated)) {
        g.latestCreated = it.createdTime;
        g.groupId = it?.groupId || it?.id;
      }
    }

    return Array.from(map.values()).sort((a, b) => new Date(b.latestCreated) - new Date(a.latestCreated));
  }

  function reqComputeStage(items) {
    let best = 1;
    for (const it of items || []) {
      const idx = reqStatusToIndex(it?.status);
      if (idx > best) best = idx;
    }
    return { idx: best, tab: reqTabFromStageIdx(best) };
  }

  // ===== Rendering =====
  function renderEmpty(container, msg) {
    if (!container) return;
    container.innerHTML = window.OpsNoData?.html({ compact: true }) || `<div class="home-empty">Sorry, No data available</div>`;
  }

  function chipToneByPriority(priority) {
    const p = norm(priority);
    if (/(high|urgent|critical)/.test(p)) return 'danger';
    if (/medium/.test(p)) return 'success';
    if (/low/.test(p)) return 'warn';
    return 'neutral';
  }

  function chipToneByStatus(status) {
    const s = norm(status);
    if (isDoneStatus(s)) return 'success';
    if (/(progress|working|doing|review)/.test(s)) return 'info';
    if (/(overdue|late)/.test(s)) return 'danger';
    if (/(queue|queued|pending|not started|todo)/.test(s)) return 'warn';
    return 'neutral';
  }

  function renderMetaChip(label, tone = 'neutral') {
    const safeLabel = safeText(label || '—');
    const safeTone = safeText(tone || 'neutral');
    return `<span class="home-mini-chip home-mini-chip--${safeTone}">${safeLabel}</span>`;
  }

  function renderTasksList(list) {
    if (!els.tasksList) return;

    const q = norm(els.search?.value);
    const filtered = (list || []).filter((t) => {
      if (!q) return true;
      return norm(optionText(t.title)).includes(q) || norm(optionText(t.status)).includes(q) || norm(optionText(t.priority)).includes(q);
    });

    if (!filtered.length) return renderEmpty(els.tasksList, 'No tasks found');

    const frag = document.createDocumentFragment();
    for (const t of filtered.slice(0, 5)) {
      const title = optionText(t.title) || 'Untitled';
      const due = t.dueDate ? formatISODate(t.dueDate) : '';
      const status = optionText(t.status);
      const prio = optionText(t.priority);
      const pct = Number.isFinite(Number(t.completion)) ? Math.round(Number(t.completion)) : null;
      const chips = [
        prio ? renderMetaChip(prio, chipToneByPriority(prio)) : '',
        status ? renderMetaChip(status, chipToneByStatus(status)) : '',
        due ? renderMetaChip(due, 'neutral') : '',
      ].filter(Boolean).join('');

      const row = document.createElement('a');
      row.className = 'home-item home-item--task';
      row.href = '/task-management';
      row.innerHTML = `
        <div class="home-item__main">
          <div class="home-item__eyebrow">Task</div>
          <div class="home-item__title">${safeText(title)}</div>
          <div class="home-item__meta">${chips || renderMetaChip('No details yet')}</div>
        </div>
        <div class="home-item__right">
          ${pct !== null ? `<span class="home-badge">${pct}%</span>` : ''}
          <span class="home-arrow" aria-hidden="true"><i data-feather="arrow-up-right"></i></span>
        </div>
      `;
      frag.appendChild(row);
    }

    els.tasksList.innerHTML = '';
    els.tasksList.appendChild(frag);
    if (window.feather) window.feather.replace();
  }

  function renderOrdersList(groups) {
    if (!els.ordersList) return;

    const q = norm(els.search?.value);
    const filtered = (groups || []).filter((g) => {
      if (!q) return true;
      const first = g.products?.[0] || {};
      const reason = optionText(first.reason);
      const createdBy = optionText(first.createdByName || first.createdBy || '');
      return norm(reason).includes(q) || norm(createdBy).includes(q);
    });

    if (!filtered.length) return renderEmpty(els.ordersList, 'No orders found');

    const frag = document.createDocumentFragment();
    for (const g of filtered.slice(0, 5)) {
      const items = g.products || [];
      const stage = orderComputeStage(items);
      const total = ordersEstimateTotal(items);
      const first = items[0] || {};
      const title = optionText(first.reason) || 'Order';
      const created = first.createdTime ? formatISODate(first.createdTime) : '';
      const chips = [
        renderMetaChip(`${items.length} ${items.length === 1 ? 'item' : 'items'}`),
        renderMetaChip(stage.label, chipToneByStatus(stage.label)),
        created ? renderMetaChip(created) : '',
      ].filter(Boolean).join('');
      const href = g.groupId ? `/orders/tracking?groupId=${encodeURIComponent(g.groupId)}` : '/orders';

      const typeMeta = orderTypeMeta(g.orderType || first.orderType, g.orderTypeColor || first.orderTypeColor);

      const row = document.createElement('a');
      row.className = 'home-item home-item--order';
      row.href = href;
      row.style.setProperty('--home-order-card-bg', typeMeta.bg);
      row.style.setProperty('--home-order-card-border', typeMeta.bd);
      row.style.setProperty('--home-order-card-fg', typeMeta.fg);
      row.innerHTML = `
        <div class="home-item__main">
          <div class="home-item__eyebrow">Order group</div>
          <div class="home-item__title">${safeText(title)}</div>
          <div class="home-item__meta">${chips}</div>
        </div>
        <div class="home-item__right">
          <span class="home-badge">${safeText(fmtMoney(total))}</span>
          <span class="home-arrow" aria-hidden="true"><i data-feather="arrow-up-right"></i></span>
        </div>
      `;
      frag.appendChild(row);
    }

    els.ordersList.innerHTML = '';
    els.ordersList.appendChild(frag);
    if (window.feather) window.feather.replace();
  }

  function buildDonutSegments(segments, radius) {
    const total = (segments || []).reduce((sum, segment) => sum + safeNum(segment?.value), 0);
    if (!total) return '';

    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return segments
      .filter((segment) => safeNum(segment?.value) > 0)
      .map((segment) => {
        const length = (safeNum(segment.value) / total) * circumference;
        const dasharray = `${length} ${Math.max(0, circumference - length)}`;
        const circle = `<circle class="home-donut-segment" cx="60" cy="60" r="${radius}" stroke="${safeText(segment.color)}" stroke-dasharray="${dasharray}" stroke-dashoffset="${-offset}"></circle>`;
        offset += length;
        return circle;
      })
      .join('');
  }

  function renderTasksChart(list) {
    if (!els.tasksChart) return;

    const tasks = Array.isArray(list) ? list : [];
    if (!tasks.length) {
      renderEmpty(els.tasksChart, 'No tasks analytics yet');
      if (els.tasksChartSubtitle) els.tasksChartSubtitle.textContent = 'No task data available';
      return;
    }

    const today = toYMD(new Date());
    const done = tasks.filter((t) => isDoneStatus(optionText(t.status))).length;
    const overdue = tasks.filter((t) => !isDoneStatus(optionText(t.status)) && t.dueDate && toYMD(t.dueDate) < today).length;
    const inProgress = tasks.filter((t) => !isDoneStatus(optionText(t.status)) && /(progress|working|doing|review)/.test(norm(optionText(t.status))) && !(t.dueDate && toYMD(t.dueDate) < today)).length;
    const queued = Math.max(0, tasks.length - done - overdue - inProgress);
    const completion = Math.round((done / Math.max(1, tasks.length)) * 100);

    const segments = [
      { label: 'Completed', value: done, color: '#34D399' },
      { label: 'In progress', value: inProgress, color: '#60A5FA' },
      { label: 'Queued', value: queued, color: '#FBBF24' },
      { label: 'Overdue', value: overdue, color: '#FB7185' },
    ];

    els.tasksChart.innerHTML = `
      <div class="home-donut-wrap">
        <svg class="home-donut-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle class="home-donut-track" cx="60" cy="60" r="44"></circle>
          ${buildDonutSegments(segments, 44)}
        </svg>
        <div class="home-donut-center">
          <div class="home-donut-center__inner">
            <div class="home-donut-center__value">${completion}%</div>
            <div class="home-donut-center__label">Completed</div>
          </div>
        </div>
      </div>
      <div class="home-chart-legend">
        ${segments.map((segment) => `
          <div class="home-legend-item">
            <div class="home-legend-label">
              <span class="home-legend-dot" style="background:${safeText(segment.color)}"></span>
              <span>${safeText(segment.label)}</span>
            </div>
            <div class="home-legend-value">${safeNum(segment.value)}</div>
          </div>
        `).join('')}
      </div>
    `;

    if (els.tasksChartSubtitle) {
      els.tasksChartSubtitle.textContent = `${done} completed • ${overdue} overdue • ${tasks.length} total`;
    }
  }

  function renderOrdersChart(groups) {
    if (!els.ordersChart) return;

    const rows = [
      { label: 'Order placed', count: 0 },
      { label: 'Under supervision', count: 0 },
      { label: 'In progress', count: 0 },
      { label: 'Shipped', count: 0 },
      { label: 'Arrived', count: 0 },
    ];

    const allGroups = Array.isArray(groups) ? groups : [];
    if (!allGroups.length) {
      renderEmpty(els.ordersChart, 'No order pipeline yet');
      if (els.ordersChartSubtitle) els.ordersChartSubtitle.textContent = 'No orders data available';
      return;
    }

    allGroups.forEach((group) => {
      const stage = orderComputeStage(group.products || []);
      const idx = Math.max(1, Math.min(5, safeNum(stage?.idx))) - 1;
      rows[idx].count += 1;
    });

    const max = Math.max(1, ...rows.map((row) => row.count));
    els.ordersChart.innerHTML = `
      <div class="home-bars">
        ${rows.map((row, index) => `
          <div class="home-bar-row">
            <div class="home-bar-top">
              <span>${safeText(row.label)}</span>
              <strong>${row.count}</strong>
            </div>
            <div class="home-bar-track">
              <div class="home-bar-fill" style="width:${row.count ? Math.max(8, (row.count / max) * 100) : 0}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    const active = rows.slice(0, 4).reduce((sum, row) => sum + row.count, 0);
    if (els.ordersChartSubtitle) {
      els.ordersChartSubtitle.textContent = `${active} active groups • ${rows[4].count} arrived`;
    }
  }

  function renderExpensesChart(items) {
    if (!els.expensesChart) return;

    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      renderEmpty(els.expensesChart, 'No cashflow data yet');
      if (els.expensesChartSubtitle) els.expensesChartSubtitle.textContent = 'No expenses data available';
      return;
    }

    const buckets = new Map();
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, {
        key,
        label: d.toLocaleDateString('en-GB', { month: 'short' }),
        cashIn: 0,
        cashOut: 0,
      });
    }

    list.forEach((item) => {
      const key = String(item?.date || '').slice(0, 7);
      if (!buckets.has(key)) return;
      const bucket = buckets.get(key);
      bucket.cashIn += safeNum(item?.cashIn);
      bucket.cashOut += safeNum(item?.cashOut);
    });

    const rows = Array.from(buckets.values());
    const max = Math.max(1, ...rows.map((row) => Math.max(row.cashIn, row.cashOut)));
    const monthBalance = rows[rows.length - 1].cashIn - rows[rows.length - 1].cashOut;

    els.expensesChart.innerHTML = `
      <div class="home-timeline" style="--home-time-cols:${rows.length}">
        ${rows.map((row) => {
          const inHeight = row.cashIn ? Math.max(8, (row.cashIn / max) * 148) : 0;
          const outHeight = row.cashOut ? Math.max(8, (row.cashOut / max) * 148) : 0;
          const balance = fmtMoney(row.cashIn - row.cashOut);
          return `
            <div class="home-time-col" title="${safeText(row.label)} • In ${safeText(fmtMoney(row.cashIn))} • Out ${safeText(fmtMoney(row.cashOut))} • Net ${safeText(balance)}">
              <div class="home-time-bars">
                <div class="home-time-bar home-time-bar--in" style="height:${inHeight}px" title="Cash in ${safeText(fmtMoney(row.cashIn))}"></div>
                <div class="home-time-bar home-time-bar--out" style="height:${outHeight}px" title="Cash out ${safeText(fmtMoney(row.cashOut))}"></div>
              </div>
              <div class="home-time-label">${safeText(row.label)}</div>
              <div class="home-time-value">${safeText(balance)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    if (els.expensesChartSubtitle) {
      els.expensesChartSubtitle.textContent = `This month: ${fmtMoney(monthBalance)}`;
    }
  }

  function setKpi(elMain, elSub, mainText, subText) {
    if (elMain) elMain.textContent = mainText;
    if (elSub) elSub.textContent = subText;
  }

  function buildAction(href, icon, title, sub) {
    const a = document.createElement('a');
    a.className = 'home-action';
    a.href = href;
    a.innerHTML = `
      <div class="home-action__left">
        <span class="home-action__ico"><i data-feather="${safeText(icon)}"></i></span>
        <div>
          <div class="home-action__title">${safeText(title)}</div>
          <div class="home-action__sub">${safeText(sub)}</div>
        </div>
      </div>
      <span class="home-action__right" aria-hidden="true"><i data-feather="arrow-right"></i></span>
    `;
    return a;
  }

  function renderActions() {
    if (!els.actions) return;
    els.actions.innerHTML = '';

    const actions = [];
    actions.push(buildAction('/home', 'activity', 'Refresh dashboard', 'Quick overview of your work'));

    if (hasAccess('Create New Order') || hasAccess('/orders/new')) {
      actions.push(buildAction('/orders/new', 'plus-circle', 'Create new order', 'Start a new components request'));
    }
    if (hasAccess('Current Orders') || hasAccess('/orders')) {
      actions.push(buildAction('/orders', 'list', 'Current orders', 'Track your recent requests'));
    }
    if (hasAccess('Requested Orders') || hasAccess('/orders/requested')) {
      actions.push(buildAction('/orders/requested', 'users', 'Operations orders', 'Review schools requested orders'));
    }
    if (hasAccess('Stocktaking') || hasAccess('/stocktaking')) {
      actions.push(buildAction('/stocktaking', 'archive', 'Stocktaking', 'View your school inventory'));
    }
    if (hasAccess('Expenses') || hasAccess('/expenses')) {
      actions.push(buildAction('/expenses', 'dollar-sign', 'Expenses', 'Your cash in/out records'));
    }
    actions.push(buildAction('/account', 'user', 'Account', 'Profile & permissions'));

    // Render unique hrefs only
    const seen = new Set();
    const frag = document.createDocumentFragment();
    for (const a of actions) {
      if (seen.has(a.href)) continue;
      seen.add(a.href);
      frag.appendChild(a);
    }
    els.actions.appendChild(frag);
    if (window.feather) window.feather.replace();
  }


  const PAGE_CATALOG = [
    { names:['Current Orders'], path:'/orders', icon:'list', color:'navy', description:'Track current orders and delivery progress' },
    { names:['Requested Orders','Operations Orders'], path:'/orders/requested', icon:'users', color:'orange', description:'Review and process requested orders' },
    { names:['Maintenance Orders'], path:'/orders/maintenance-orders', icon:'tool', color:'green', description:'Manage maintenance requests and status' },
    { names:['Create New Order'], path:'/orders/new', icon:'shopping-cart', color:'orange', description:'Create a product, withdrawal, or maintenance order' },
    { names:['Stocktaking'], path:'/stocktaking', icon:'archive', color:'navy', description:'Inventory quantities, kits, and stock records' },
    { names:['Orders Review'], path:'/orders/sv-orders', icon:'award', color:'green', description:'Review and approve submitted orders' },
    { names:['Expenses'], path:'/expenses', icon:'dollar-sign', color:'orange', description:'Cash in, cash out, and expense analytics' },
    { names:['Expenses Users'], path:'/expenses/users', icon:'credit-card', color:'gray', description:'Review expenses by team member' },
    { names:['B2B'], path:'/b2b', icon:'folder', color:'navy', description:'Schools, stock, and B2B operations' },
    { names:['B2C'], path:'/b2c', icon:'database', color:'green', description:'Databases, tables, forms, and records' },
    { names:['Products'], path:'/products', icon:'box', color:'orange', description:'Product catalog, tags, prices, and images' },
    { names:['Task Management','My Tasks'], path:'/task-management/my-tasks', icon:'git-branch', color:'navy', description:'My tasks, delegated tasks, and workflows' },
    { names:['KPIs'], path:'/kpis', icon:'bar-chart-2', color:'green', description:'Standards, reviews, and performance metrics' },
    { names:['Events','Event Calendar'], path:'/events/calendar', icon:'calendar', color:'orange', description:'Events, requests, and calendar planning' },
    { names:['Messages'], path:'/messages', icon:'message-square', color:'navy', description:'Team conversations and comments' },
    { names:['User Access'], path:'/user-access', icon:'shield', color:'gray', description:'Page access and permission management' },
    { names:['Proposals'], path:'/proposals', icon:'file-text', color:'green', description:'Create and review proposals' },
    { names:['Account'], path:'/account', icon:'user', color:'gray', description:'Profile, position, and account settings', always:true },
  ];

  function renderModules() {
    if (!els.modulesGrid) return;
    const allowedLabels = (state.allowedPagesRaw || []).map((x) => String(x || '').trim()).filter(Boolean);
    const cards = PAGE_CATALOG.filter((page) => page.always || page.names.some((name) => hasAccess(name)) || hasAccess(page.path));

    // Include newly-created pages even before they are added to PAGE_CATALOG.
    const known = new Set(cards.flatMap((p) => p.names.map(norm)));
    allowedLabels.forEach((label) => {
      if (!label || known.has(norm(label))) return;
      cards.push({ names:[label], path:'#', icon:'layout', color:'gray', description:'Available system page' });
      known.add(norm(label));
    });

    els.modulesGrid.innerHTML = cards.map((page) => {
      const title = page.names[0];
      const disabled = page.path === '#';
      return `
        <a class="home-module home-module--${safeText(page.color)}${disabled ? ' is-disabled' : ''}" href="${safeText(page.path)}" ${disabled ? 'aria-disabled="true"' : ''}>
          <span class="home-module__icon"><i data-feather="${safeText(page.icon)}"></i></span>
          <span class="home-module__content">
            <strong>${safeText(title)}</strong>
            <small>${safeText(page.description)}</small>
          </span>
          <span class="home-module__arrow"><i data-feather="arrow-up-right"></i></span>
        </a>`;
    }).join('');
    if (els.modulesCount) els.modulesCount.textContent = `${cards.length} module${cards.length === 1 ? '' : 's'}`;
    if (window.feather) window.feather.replace();
  }

  function renderScopeChips(pages) {
    if (!els.scopeChips) return;
    els.scopeChips.innerHTML = '';

    const unique = Array.from(new Set((pages || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (!unique.length) {
      renderEmpty(els.scopeChips, 'No pages assigned');
      return;
    }

    const frag = document.createDocumentFragment();
    for (const p of unique.slice(0, 18)) {
      const chip = document.createElement('span');
      chip.className = 'home-chip';
      chip.textContent = p;
      frag.appendChild(chip);
    }
    els.scopeChips.appendChild(frag);
  }

  function globalSelectedUser() {
    return state.analysisUsers.find((user) => String(user.id) === String(state.globalAnalysis.user)) || null;
  }

  function userHasPage(user, aliases) {
    if (!user || state.globalAnalysis.user === 'all') return true;
    const set = buildAllowedSet(user.allowedPages || []);
    return aliases.some((alias) => {
      const key = norm(alias);
      const path = normPath(alias);
      return set.has(key) || set.has(path) || set.has('/' + path) || set.has(path.replace(/^\//, ''));
    });
  }

  function itemOwnerValues(item = {}) {
    return [
      item.createdById, item.createdByName, item.teamMemberId, item.teamMemberName,
      item.userId, item.userName, item.username, item.requestedBy, item.ownerName,
      item.createdBy, item.requesterName,
    ].flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => norm(value)).filter(Boolean);
  }

  function itemMatchesUser(item, user) {
    if (!user) return true;
    const targets = [user.id, user.name, user.username, user.email, user.employeeCode].map(norm).filter(Boolean);
    const owners = itemOwnerValues(item);
    return targets.some((target) => owners.some((owner) => owner === target || owner.includes(target) || target.includes(owner)));
  }

  function groupMatchesUser(group, user) {
    if (!user) return true;
    const rows = group?.items || group?.products || [];
    return rows.some((row) => itemMatchesUser(row, user));
  }

  function withinGlobalDuration(dateLike) {
    const duration = state.globalAnalysis.duration || 'all';
    if (duration === 'all') return true;
    const date = new Date(dateLike || 0);
    if (!Number.isFinite(date.getTime())) return false;
    const now = new Date();
    const cutoff = new Date(now);
    if (duration === 'week') cutoff.setDate(cutoff.getDate() - 7);
    else if (duration === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
    else if (duration === 'year') cutoff.setFullYear(cutoff.getFullYear() - 1);
    return date >= cutoff && date <= now;
  }

  function globalFilterGroups(groups) {
    const user = globalSelectedUser();
    return (groups || []).filter((group) => {
      const rows = group?.items || group?.products || [];
      const created = group?.createdTime || rows[0]?.createdTime || rows[0]?.created_at || rows[0]?.date;
      return groupMatchesUser(group, user) && withinGlobalDuration(created);
    });
  }

  function clearRing(circle) {
    if (!circle) return;
    circle.style.strokeDasharray = '0 999';
    circle.style.strokeDashoffset = '0';
  }

  function renderNoAccess(scope) {
    const map = {
      orders: [els.kpiOrdersMain, els.kpiOrdersSub, [els.ordersInProgressCount, els.ordersCompletedCount, els.ordersRejectedCount], [els.ordersInProgressCost, els.ordersCompletedCost, els.ordersRejectedCost], [els.ordersRingInProgress, els.ordersRingCompleted, els.ordersRingRejected]],
      review: [els.kpiReviewMain, els.kpiReviewSub, [els.reviewPendingCount, els.reviewApprovedCount, els.reviewRejectedCount], [els.reviewPendingCost, els.reviewApprovedCost, els.reviewRejectedCost], [els.reviewRingPending, els.reviewRingApproved, els.reviewRingRejected]],
      operations: [els.kpiRequestedMain, els.kpiRequestedSub, [els.operationsPendingCount, els.operationsReceivedCount, els.operationsDeliveredCount], [els.operationsPendingCost, els.operationsReceivedCost, els.operationsDeliveredCost], [els.operationsRingPending, els.operationsRingReceived, els.operationsRingDelivered]],
      maintenance: [els.kpiMaintenanceMain, els.kpiMaintenanceSub, [els.maintenancePendingCount, els.maintenanceInProgressCount, els.maintenanceCompletedCount], [els.maintenancePendingCost, els.maintenanceInProgressCost, els.maintenanceCompletedCost], [els.maintenanceRingPending, els.maintenanceRingInProgress, els.maintenanceRingCompleted]],
    };
    const entry = map[scope];
    if (!entry) return;
    entry[0] && (entry[0].textContent = '—');
    entry[1] && (entry[1].textContent = 'No access');
    entry[2].forEach((el) => el && (el.textContent = '—'));
    entry[3].forEach((el) => el && (el.textContent = '—'));
    entry[4].forEach(clearRing);
  }

  async function renderExpensesForGlobalFilter() {
    const user = globalSelectedUser();
    if (user && !userHasPage(user, ['Expenses', '/expenses'])) {
      setKpi(els.kpiExpensesMain, els.kpiExpensesSub, '—', 'No access');
      return;
    }
    let sourceItems = state.expenses || [];
    if (user) {
      try {
        const payload = await fetchJson(`/api/home/analysis-users/${encodeURIComponent(user.id)}/expenses`);
        sourceItems = Array.isArray(payload?.items) ? payload.items : [];
      } catch {
        sourceItems = [];
      }
    }
    const items = sourceItems.filter((item) => withinGlobalDuration(item.date || item.createdTime));
    let cashIn = 0, cashOut = 0;
    items.forEach((item) => { cashIn += safeNum(item.cashIn); cashOut += safeNum(item.cashOut); });
    setKpi(els.kpiExpensesMain, els.kpiExpensesSub, fmtMoney(cashIn - cashOut), `In: ${fmtMoney(cashIn)} • Out: ${fmtMoney(cashOut)}`);
  }

  async function renderStockForGlobalFilter() {
    const user = globalSelectedUser();
    if (user && !userHasPage(user, ['Stocktaking', '/stocktaking'])) {
      if (els.kpiStockMain) els.kpiStockMain.textContent = '—';
      if (els.kpiStockCost) els.kpiStockCost.textContent = '—';
      if (els.kpiStockSub) els.kpiStockSub.textContent = 'No access';
      return;
    }
    if (!user) {
      state.stock = state.stockDefault.slice();
      renderStockSummary();
      return;
    }
    try {
      const payload = await fetchJson(`/api/home/stocktaking-users/${encodeURIComponent(user.id)}`);
      state.stock = Array.isArray(payload?.items) ? payload.items : [];
    } catch {
      state.stock = [];
    }
    renderStockSummary();
  }

  function applyGlobalAnalysis() {
    const user = globalSelectedUser();
    if (user && !userHasPage(user, ['Current Orders', '/orders'])) renderNoAccess('orders');
    else renderCurrentOrdersPerformance(globalFilterGroups(state.orderGroups || []));

    if (user && !userHasPage(user, ['Orders Review', '/orders/sv-orders'])) renderNoAccess('review');
    else renderReviewAnalysis();

    if (user && !userHasPage(user, ['Requested Orders', 'Operations Orders', '/orders/requested'])) renderNoAccess('operations');
    else renderOperationsAnalysis();

    if (user && !userHasPage(user, ['Maintenance Orders', '/orders/maintenance-orders'])) renderNoAccess('maintenance');
    else renderMaintenanceAnalysis();

    renderExpensesForGlobalFilter();
    renderStockForGlobalFilter();
  }

  function setupGlobalAnalysis() {
    const { globalAnalysisTrigger: trigger, globalAnalysisMenu: menu } = els;
    if (!trigger || !menu) return;
    const placeholder = document.createComment('global-analysis-menu-placeholder');
    const closeLists = () => {
      [
        [els.globalUserOptions, els.globalUserTrigger],
        [els.globalDurationOptions, els.globalDurationTrigger],
      ].forEach(([options, button]) => { if (options) options.hidden = true; button?.setAttribute('aria-expanded', 'false'); });
    };
    const position = () => {
      if (menu.hidden) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(310, window.innerWidth - 24);
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))}px`;
      menu.style.top = `${rect.bottom + 10}px`;
    };
    const close = () => {
      closeLists(); menu.hidden = true; trigger.setAttribute('aria-expanded', 'false');
      menu.classList.remove('home-global-analysis__menu--portal'); menu.removeAttribute('style');
      if (placeholder.parentNode) placeholder.replaceWith(menu);
    };
    const open = () => {
      if (menu.parentNode !== document.body) { menu.replaceWith(placeholder); document.body.appendChild(menu); }
      menu.hidden = false; menu.classList.add('home-global-analysis__menu--portal'); trigger.setAttribute('aria-expanded', 'true'); position();
    };
    const setupSelect = (button, options, onChoose) => {
      button?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); const opening = options.hidden; closeLists(); options.hidden = !opening; button.setAttribute('aria-expanded', String(opening)); });
      options?.addEventListener('click', (event) => {
        const option = event.target.closest('[data-value]'); if (!option) return;
        event.preventDefault(); event.stopPropagation();
        options.querySelectorAll('.home-global-select__option').forEach((node) => node.classList.toggle('is-selected', node === option));
        onChoose(option.dataset.value || 'all', option.dataset.label || option.textContent.trim()); closeLists(); applyGlobalAnalysis();
      });
    };
    trigger.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); menu.hidden ? open() : close(); });
    menu.addEventListener('click', (event) => event.stopPropagation());
    setupSelect(els.globalUserTrigger, els.globalUserOptions, (value, label) => { state.globalAnalysis.user = value; if (els.globalAnalysisUser) els.globalAnalysisUser.value = value; if (els.globalUserText) els.globalUserText.textContent = label; });
    setupSelect(els.globalDurationTrigger, els.globalDurationOptions, (value, label) => { state.globalAnalysis.duration = value; if (els.globalAnalysisDuration) els.globalAnalysisDuration.value = value; if (els.globalDurationText) els.globalDurationText.textContent = label; });
    window.addEventListener('resize', position, { passive: true });
    window.addEventListener('scroll', position, { passive: true, capture: true });
    document.addEventListener('click', close);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  }

  async function loadAnalysisUsers() {
    const payload = await fetchJson('/api/home/analysis-users').catch(() => ({ users: [] }));
    state.analysisUsers = Array.isArray(payload?.users) ? payload.users : [];
    if (els.globalUserOptions) {
      const options = [{ id: 'all', name: 'All users' }, ...state.analysisUsers];
      els.globalUserOptions.innerHTML = options.map((user, index) => `<button type="button" class="home-global-select__option${index === 0 ? ' is-selected' : ''}" data-value="${safeText(user.id)}" data-label="${safeText(user.name)}"><span>${safeText(user.name)}</span><i data-feather="check"></i></button>`).join('');
      if (window.feather) window.feather.replace();
    }
  }

  // ===== Data loaders =====
  async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function loadAccount() {
    const data = await fetchJson('/api/account');
    const allowed = Array.isArray(data.allowedPages) ? data.allowedPages : [];
    state.allowedPagesRaw = allowed;
    state.allowedSet = buildAllowedSet(allowed);
    state.dept = String(data.department || '').trim();
    state.position = String(data.position || '').trim();

    // Scope line
    const parts = [];
    if (state.dept) parts.push(state.dept);
    if (state.position) parts.push(state.position);
    els.scopeLine && (els.scopeLine.textContent = parts.length ? parts.join(' • ') : '—');
    els.scopeDept && (els.scopeDept.textContent = state.dept || '—');
    els.scopePos && (els.scopePos.textContent = state.position || '—');
    renderScopeChips(allowed);

    // Decide what blocks to show
    const canTasks = false; // Legacy Tasks page was retired in favor of Task Management.
    const canOrders = hasAccess('Current Orders') || hasAccess('/orders');
    const canRequested = hasAccess('Requested Orders') || hasAccess('Operations Orders') || hasAccess('/orders/requested');
    const canMaintenance = hasAccess('Maintenance Orders') || hasAccess('/orders/maintenance-orders');
    const canReview = hasAccess('Orders Review') || hasAccess('/orders/sv-orders');
    const canStock = hasAccess('Stocktaking') || hasAccess('/stocktaking');
    const canExpenses = hasAccess('Expenses') || hasAccess('/expenses');

    if (!canTasks) hideBlock('tasks'); else showBlock('tasks');
    if (!canOrders) hideBlock('orders'); else showBlock('orders');
    if (!canRequested) hideBlock('requested'); else showBlock('requested');
    if (!canMaintenance) hideBlock('maintenance'); else showBlock('maintenance');
    if (!canReview) hideBlock('review'); else showBlock('review');
    if (!canStock) hideBlock('stock'); else showBlock('stock');
    if (!canExpenses) hideBlock('expenses'); else showBlock('expenses');

    renderActions();
    renderModules();

    return { canTasks, canOrders, canRequested, canMaintenance, canReview, canStock, canExpenses };
  }

  async function loadTasks() {
    // KPI placeholders
    setKpi(els.kpiTasksMain, els.kpiTasksSub, '…', 'Loading');
    if (els.tasksList) renderEmpty(els.tasksList, 'Loading…');

    const data = await fetchJson('/api/tasks?scope=mine');
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    state.tasks = tasks;

    const today = toYMD(new Date());
    const open = tasks.filter((t) => !isDoneStatus(optionText(t.status)));
    const dueToday = open.filter((t) => t.dueDate && toYMD(t.dueDate) === today);
    const overdue = open.filter((t) => t.dueDate && toYMD(t.dueDate) < today);
    const high = open.filter((t) => /(high|urgent)/.test(norm(optionText(t.priority))));

    const avgCompletion = (() => {
      const vals = open
        .map((t) => (Number.isFinite(Number(t.completion)) ? Number(t.completion) : null))
        .filter((n) => typeof n === 'number');
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    })();

    setKpi(
      els.kpiTasksMain,
      els.kpiTasksSub,
      `${dueToday.length} due today`,
      `Overdue: ${overdue.length} • High: ${high.length}${avgCompletion !== null ? ` • Avg: ${avgCompletion}%` : ''}`,
    );

    if (els.tasksSubtitle) {
      els.tasksSubtitle.textContent = `${open.length} open tasks`;
    }

    // Next tasks list = open tasks sorted by dueDate then createdTime
    const next = open
      .slice()
      .sort((a, b) => {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return new Date(b.createdTime) - new Date(a.createdTime);
      });

    renderTasksList(next);
    renderTasksChart(tasks);
  }

  async function loadOrders() {
    setKpi(els.kpiOrdersMain, els.kpiOrdersSub, '…', 'Loading');
    if (els.ordersList) renderEmpty(els.ordersList, 'Loading…');

    const list = await fetchJson('/api/orders');
    const orders = Array.isArray(list) ? list : [];
    state.orders = orders;

    const groups = groupOrdersByMinute(orders);
    state.orderGroups = groups;

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalEstimate = 0;
    for (const g of groups) {
      const stage = orderComputeStage(g.products || []);
      counts[stage.idx] = (counts[stage.idx] || 0) + 1;
      totalEstimate += ordersEstimateTotal(g.products || []);
    }

    renderCurrentOrdersPerformance(groups);

    if (els.ordersSubtitle) {
      els.ordersSubtitle.textContent = `${groups.length} order groups`;
    }

    renderOrdersList(groups);
    renderOrdersChart(groups);
  }

  function summaryGroupCost(group) {
    const rows = group?.items || group?.products || [];
    return ordersEstimateTotal(rows);
  }

  function reviewDecision(items) {
    const values = (items || []).map((item) => norm(
      item?.approval || item?.svApproval || item?.sv_approval || item?.status || ''
    ));
    if (values.some((value) => value.includes('rejected'))) return 'rejected';
    if (values.length && values.every((value) => value.includes('approved'))) return 'approved';
    return 'pending';
  }

  function renderSummaryPerformance(config) {
    const groups = Array.isArray(config.groups) ? config.groups : [];
    const totals = Object.fromEntries(config.buckets.map((bucket) => [bucket.key, { count: 0, cost: 0 }]));
    let totalCost = 0;

    groups.forEach((group) => {
      const key = config.getBucket(group);
      const cost = summaryGroupCost(group);
      totalCost += cost;
      if (totals[key]) {
        totals[key].count += 1;
        totals[key].cost += cost;
      }
    });

    if (config.totalCountEl) config.totalCountEl.textContent = String(groups.length);
    if (config.totalCostEl) config.totalCostEl.textContent = fmtMoney(totalCost);

    const active = config.buckets.filter((bucket) => totals[bucket.key].count > 0).length;
    const gap = active > 1 ? 18 : 0;
    let offset = 0;
    config.buckets.forEach((bucket) => {
      const value = totals[bucket.key];
      if (bucket.countEl) bucket.countEl.textContent = String(value.count);
      if (bucket.costEl) bucket.costEl.textContent = fmtMoney(value.cost);
      offset = setRingSegment(bucket.circleEl, value.count, groups.length, offset, gap);
    });
  }


  function summaryAnalysisConfig(mode, statusBuckets) {
    return mode === 'type'
      ? [
          { key: 'request', label: 'Request', color: '#176b3a' },
          { key: 'withdrawal', label: 'Withdrawal', color: '#dc2626' },
          { key: 'maintenance', label: 'Maintenance', color: '#eab308' },
        ]
      : statusBuckets;
  }

  function updateSummaryLabels(scope, config) {
    const card = document.querySelector(`[data-summary-scope="${scope}"]`);
    if (!card) return;
    const statusCards = Array.from(card.querySelectorAll('.home-summary-status'));
    statusCards.forEach((statusCard, index) => {
      const item = config[index];
      if (!item) return;
      statusCard.style.setProperty('--summary-status-color', item.color);
      const label = statusCard.querySelector('span:not(.home-summary-status__bar)');
      if (label) label.textContent = item.label;
    });
  }

  function renderAnalyzedSummary(scope, groups, analysis, statusBuckets, elements, getStatusBucket) {
    const filtered = filterOrderGroupsByTime(globalFilterGroups(groups), analysis.time || 'all');
    const config = summaryAnalysisConfig(analysis.by || 'status', statusBuckets);
    updateSummaryLabels(scope, config);
    const totals = Object.fromEntries(config.map((item) => [item.key, { count: 0, cost: 0 }]));
    let totalCost = 0;
    filtered.forEach((group) => {
      const cost = summaryGroupCost(group);
      const key = analysis.by === 'type' ? currentOrderTypeBucket(group) : getStatusBucket(group);
      totalCost += cost;
      if (totals[key]) {
        totals[key].count += 1;
        totals[key].cost += cost;
      }
    });
    if (elements.totalCountEl) elements.totalCountEl.textContent = String(filtered.length);
    if (elements.totalCostEl) elements.totalCostEl.textContent = fmtMoney(totalCost);
    const active = config.filter((item) => totals[item.key].count > 0).length;
    const gap = active > 1 ? 18 : 0;
    let offset = 0;
    config.forEach((item, index) => {
      const value = totals[item.key];
      const bucketEl = elements.buckets[index];
      if (bucketEl.countEl) bucketEl.countEl.textContent = String(value.count);
      if (bucketEl.costEl) bucketEl.costEl.textContent = fmtMoney(value.cost);
      if (bucketEl.circleEl) bucketEl.circleEl.style.stroke = item.color;
      offset = setRingSegment(bucketEl.circleEl, value.count, filtered.length, offset, gap);
    });
  }

  function maintenanceItemHasLog(item = {}) {
    const spareNames = item?.sparePartsReplacedNames || item?.spare_parts_replaced_names || item?.sparePartsReplacedName || item?.spare_parts_replaced_name;
    return !!(
      String(item?.resolutionMethod || item?.resolution_method || '').trim() ||
      String(item?.actualIssueDescription || item?.actual_issue_description || '').trim() ||
      String(item?.repairAction || item?.repair_action || '').trim() ||
      (Array.isArray(spareNames) ? spareNames.some(Boolean) : String(spareNames || '').trim())
    );
  }

  function maintenanceWorkflowBucket(group) {
    const rows = group?.items || [];
    const stage = reqComputeStage(rows);
    const maxIdx = Math.max(1, ...rows.map((item) => reqStatusToIndex(item?.status)));
    if (maxIdx >= 4 || stage.tab === 'delivered') return 'completed';
    if (rows.some(maintenanceItemHasLog)) return 'in-progress';
    return 'pending';
  }

  function renderMaintenanceAnalysis() {
    const maintenanceGroups = (state.requestedGroups || []).filter((group) => currentOrderTypeBucket(group) === 'maintenance');
    state.maintenanceGroups = maintenanceGroups;
    const filtered = globalFilterGroups(maintenanceGroups);
    renderSummaryPerformance({
      groups: filtered,
      totalCountEl: els.kpiMaintenanceMain,
      totalCostEl: els.kpiMaintenanceSub,
      buckets: [
        { key: 'pending', countEl: els.maintenancePendingCount, costEl: els.maintenancePendingCost, circleEl: els.maintenanceRingPending },
        { key: 'in-progress', countEl: els.maintenanceInProgressCount, costEl: els.maintenanceInProgressCost, circleEl: els.maintenanceRingInProgress },
        { key: 'completed', countEl: els.maintenanceCompletedCount, costEl: els.maintenanceCompletedCost, circleEl: els.maintenanceRingCompleted },
      ],
      getBucket: maintenanceWorkflowBucket,
    });
  }

  function renderOperationsAnalysis() {
    renderAnalyzedSummary('operations', state.requestedGroups || [], state.operationsAnalysis,
      [
        { key: 'not-started', label: 'Pending', color: '#f97316' },
        { key: 'received', label: 'Received', color: '#172554' },
        { key: 'delivered', label: 'Delivered', color: '#176b3a' },
      ],
      {
        totalCountEl: els.kpiRequestedMain, totalCostEl: els.kpiRequestedSub,
        buckets: [
          { countEl: els.operationsPendingCount, costEl: els.operationsPendingCost, circleEl: els.operationsRingPending },
          { countEl: els.operationsReceivedCount, costEl: els.operationsReceivedCost, circleEl: els.operationsRingReceived },
          { countEl: els.operationsDeliveredCount, costEl: els.operationsDeliveredCost, circleEl: els.operationsRingDelivered },
        ],
      },
      (group) => reqComputeStage(group.items || []).tab);
  }

  function renderReviewAnalysis() {
    renderAnalyzedSummary('review', state.reviewGroups || [], state.reviewAnalysis,
      [
        { key: 'pending', label: 'Pending', color: '#f97316' },
        { key: 'approved', label: 'Approved', color: '#176b3a' },
        { key: 'rejected', label: 'Rejected', color: '#dc2626' },
      ],
      {
        totalCountEl: els.kpiReviewMain, totalCostEl: els.kpiReviewSub,
        buckets: [
          { countEl: els.reviewPendingCount, costEl: els.reviewPendingCost, circleEl: els.reviewRingPending },
          { countEl: els.reviewApprovedCount, costEl: els.reviewApprovedCost, circleEl: els.reviewRingApproved },
          { countEl: els.reviewRejectedCount, costEl: els.reviewRejectedCost, circleEl: els.reviewRingRejected },
        ],
      },
      (group) => reviewDecision(group.items || []));
  }

  function setupSummaryAnalysisControl(scope, render) {
    const control = document.getElementById(`${scope}AnalysisControl`);
    const trigger = document.getElementById(`${scope}AnalysisTrigger`);
    const menu = document.getElementById(`${scope}AnalysisMenu`);
    const timeInput = document.getElementById(`${scope}AnalysisTime`);
    const byInput = document.getElementById(`${scope}AnalysisBy`);
    const analysis = state[`${scope}Analysis`];
    if (!control || !trigger || !menu || !analysis) return;

    // Summary cards are keyboard-accessible containers, not anchors. This keeps
    // the Analysis control a real button (including on Android long-press) and
    // prevents the browser link menu from replacing the dropdown.
    const parentCard = control.closest('.home-summary-performance[data-href]');
    if (parentCard && !parentCard.dataset.navigationWired) {
      parentCard.dataset.navigationWired = 'true';
      const openCard = () => { window.location.href = parentCard.dataset.href; };
      parentCard.addEventListener('click', (event) => {
        if (event.target.closest('button, input, .home-orders-analysis')) return;
        openCard();
      });
      parentCard.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button, input, .home-orders-analysis')) {
          event.preventDefault();
          openCard();
        }
      });
    }

    const closeInner = (except = null) => {
      menu.querySelectorAll('.home-analysis-select').forEach((select) => {
        if (select === except) return;
        select.classList.remove('is-open');
        const subTrigger = select.querySelector('.home-analysis-select__trigger');
        const subMenu = select.querySelector('.home-analysis-select__menu');
        if (subTrigger) subTrigger.setAttribute('aria-expanded', 'false');
        if (subMenu) subMenu.hidden = true;
      });
    };
    // Move the summary dropdown to <body> while it is open. This avoids every
    // card/grid stacking context and overflow rule, including mobile browsers
    // that keep transformed sibling cards above absolutely-positioned children.
    const menuHome = document.createComment(`${scope}-analysis-menu-home`);
    menu.parentNode.insertBefore(menuHome, menu);

    const positionPortalMenu = () => {
      if (!menu.classList.contains('home-analysis-menu--portal') || menu.hidden) return;
      const rect = trigger.getBoundingClientRect();
      const viewportGap = 12;
      const width = Math.min(252, window.innerWidth - (viewportGap * 2));
      const left = Math.max(viewportGap, Math.min(rect.right - width, window.innerWidth - width - viewportGap));
      menu.style.setProperty('--analysis-menu-left', `${Math.round(left)}px`);
      menu.style.setProperty('--analysis-menu-top', `${Math.round(rect.bottom + 8)}px`);
      menu.style.setProperty('--analysis-menu-width', `${Math.round(width)}px`);
    };

    const mountPortalMenu = () => {
      document.body.appendChild(menu);
      menu.classList.add('home-analysis-menu--portal');
      positionPortalMenu();
    };

    const restorePortalMenu = () => {
      menu.classList.remove('home-analysis-menu--portal');
      menu.style.removeProperty('--analysis-menu-left');
      menu.style.removeProperty('--analysis-menu-top');
      menu.style.removeProperty('--analysis-menu-width');
      if (menuHome.parentNode) menuHome.parentNode.insertBefore(menu, menuHome.nextSibling);
    };

    const close = () => {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      control.classList.remove('is-open');
      parentCard?.classList.remove('home-analysis-card--open');
      closeInner();
      restorePortalMenu();
    };
    const sync = () => {
      const timeLabel = menu.querySelector('[data-analysis-select="time"] [data-analysis-select-label]');
      const byLabel = menu.querySelector('[data-analysis-select="by"] [data-analysis-select-label]');
      if (timeLabel) timeLabel.textContent = ordersAnalysisTimeLabel(analysis.time);
      if (byLabel) byLabel.textContent = analysis.by === 'type' ? 'Type' : 'Status';
      menu.querySelectorAll('[data-analysis-time]').forEach((button) => button.classList.toggle('is-selected', button.dataset.analysisTime === analysis.time));
      menu.querySelectorAll('[data-analysis-by]').forEach((button) => button.classList.toggle('is-selected', button.dataset.analysisBy === analysis.by));
    };
    sync();
    trigger.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      const opening = menu.hidden;
      if (opening) {
        mountPortalMenu();
        menu.hidden = false;
        positionPortalMenu();
      } else {
        close();
        return;
      }
      trigger.setAttribute('aria-expanded', 'true');
      control.classList.add('is-open');
      parentCard?.classList.add('home-analysis-card--open');
    });
    menu.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); });
    menu.querySelectorAll('.home-analysis-select').forEach((select) => {
      const subTrigger = select.querySelector('.home-analysis-select__trigger');
      const subMenu = select.querySelector('.home-analysis-select__menu');
      if (!subTrigger || !subMenu) return;
      subTrigger.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        const opening = subMenu.hidden;
        closeInner(select);
        subMenu.hidden = !opening;
        select.classList.toggle('is-open', opening);
        subTrigger.setAttribute('aria-expanded', String(opening));
      });
    });
    menu.querySelectorAll('[data-analysis-time]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      analysis.time = button.dataset.analysisTime || 'all';
      if (timeInput) timeInput.value = analysis.time;
      sync(); render(); closeInner();
    }));
    menu.querySelectorAll('[data-analysis-by]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      analysis.by = button.dataset.analysisBy || 'status';
      if (byInput) byInput.value = analysis.by;
      sync(); render(); closeInner();
    }));
    window.addEventListener('resize', positionPortalMenu, { passive: true });
    window.addEventListener('scroll', positionPortalMenu, { passive: true, capture: true });
    document.addEventListener('click', close);
  }

  async function loadRequested() {
    setKpi(els.kpiRequestedMain, els.kpiRequestedSub, '…', 'Loading');
    const list = await fetchJson('/api/orders/requested');
    const items = Array.isArray(list) ? list : [];
    state.requestedItems = items;
    const groups = groupRequested(items);
    state.requestedGroups = groups;

    const counts = { 'not-started': 0, received: 0, delivered: 0 };
    for (const g of groups) {
      const stage = reqComputeStage(g.items || []);
      counts[stage.tab] = (counts[stage.tab] || 0) + 1;
    }

    renderOperationsAnalysis();
    renderMaintenanceAnalysis();
  }

  async function loadReview() {
    if (els.kpiReviewMain) els.kpiReviewMain.textContent = '…';
    if (els.kpiReviewSub) els.kpiReviewSub.textContent = 'Loading';
    const list = await fetchJson('/api/sv-orders?tab=all');
    const items = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
    state.reviewItems = items;
    const groups = groupRequested(items);
    state.reviewGroups = groups;

    renderReviewAnalysis();
  }

  function stockUserName(item) {
    return String(item?.userName || item?.username || item?.createdBy || item?.requestedBy || item?.ownerName || 'Unknown user').trim() || 'Unknown user';
  }

  function stockTagName(item) {
    return String(item?.tag?.name || item?.tag || 'Untagged').trim() || 'Untagged';
  }

  function renderStockFilterOptions(optionsEl, values, allLabel, selectedValue) {
    if (!optionsEl) return;
    const normalized = values.map((value) => (
      value && typeof value === 'object'
        ? { value: String(value.value ?? value.id ?? value.label ?? ''), label: String(value.label ?? value.name ?? value.value ?? '') }
        : { value: String(value), label: String(value) }
    )).filter((option) => option.value && option.label);
    const options = [{ value: 'all', label: allLabel }, ...normalized];
    optionsEl.innerHTML = options.map((option) => `
      <button class="home-stock-filter__option${option.value === selectedValue ? ' is-selected' : ''}" type="button" data-value="${safeText(option.value)}" data-label="${safeText(option.label)}">
        <span>${safeText(option.label)}</span>
        <i data-feather="check"></i>
      </button>`).join('');
    if (window.feather) window.feather.replace();
  }

  function populateStockFilters(items) {
    const currentTag = state.stockFilters.tag;
    const tags = Array.from(new Set(items.map(stockTagName).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    const tagValue = tags.includes(currentTag) ? currentTag : 'all';
    state.stockFilters.tag = tagValue;
    if (els.stockTagFilter) els.stockTagFilter.value = tagValue;
    if (els.stockTagFilterText) els.stockTagFilterText.textContent = tagValue === 'all' ? 'All tags' : tagValue;
    renderStockFilterOptions(els.stockTagFilterOptions, tags, 'All tags', tagValue);
  }

  function renderStockSummary() {
    const filtered = state.stock.filter((item) => {
      const tagOk = state.stockFilters.tag === 'all' || stockTagName(item) === state.stockFilters.tag;
      return tagOk;
    });

    let totalComponents = 0;
    let totalCost = 0;
    for (const item of filtered) {
      const quantity = safeNum(item?.quantity);
      const unitPrice = safeNum(item?.unitPrice ?? item?.unityPrice);
      totalComponents += quantity;
      totalCost += quantity * unitPrice;
    }

    if (els.kpiStockMain) els.kpiStockMain.textContent = String(totalComponents);
    if (els.kpiStockCost) els.kpiStockCost.textContent = fmtMoney(totalCost);
    if (els.kpiStockSub) {
      const parts = [`${filtered.length} component records`];
      if (state.stockFilters.tag !== 'all') parts.push(state.stockFilters.tag);
      els.kpiStockSub.textContent = parts.join(' • ');
    }
  }

  function setupStockAnalysis() {
    if (!els.stockAnalysisTrigger || !els.stockAnalysisMenu) return;
    const placeholder = document.createComment('stock-analysis-menu-placeholder');
    const originalParent = els.stockAnalysisMenu.parentNode;

    const closeFilterLists = () => {
      [
        [els.stockTagFilterOptions, els.stockTagFilterTrigger]
      ].forEach(([options, trigger]) => {
        if (options) options.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
      });
    };

    const positionMenu = () => {
      if (els.stockAnalysisMenu.hidden) return;
      const rect = els.stockAnalysisTrigger.getBoundingClientRect();
      const gap = 10;
      const width = Math.min(300, Math.max(260, rect.width + 120));
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
      els.stockAnalysisMenu.style.width = `${width}px`;
      els.stockAnalysisMenu.style.left = `${left}px`;
      els.stockAnalysisMenu.style.top = `${rect.bottom + gap}px`;
    };

    const close = () => {
      closeFilterLists();
      els.stockAnalysisMenu.hidden = true;
      els.stockAnalysisTrigger.setAttribute('aria-expanded', 'false');
      els.stockAnalysisMenu.classList.remove('home-stock-analysis__menu--portal');
      els.stockAnalysisMenu.removeAttribute('style');
      if (placeholder.parentNode) placeholder.replaceWith(els.stockAnalysisMenu);
    };

    const open = () => {
      if (els.stockAnalysisMenu.parentNode !== document.body) {
        els.stockAnalysisMenu.replaceWith(placeholder);
        document.body.appendChild(els.stockAnalysisMenu);
      }
      els.stockAnalysisMenu.hidden = false;
      els.stockAnalysisMenu.classList.add('home-stock-analysis__menu--portal');
      els.stockAnalysisTrigger.setAttribute('aria-expanded', 'true');
      positionMenu();
    };

    const setupFilter = ({ trigger, options, input, text, stateKey, allLabel }) => {
      if (!trigger || !options || !input || !text) return;
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = options.hidden;
        closeFilterLists();
        options.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', String(willOpen));
      });
      options.addEventListener('click', (event) => {
        const option = event.target.closest('[data-value]');
        if (!option) return;
        event.preventDefault();
        event.stopPropagation();
        const value = option.dataset.value || 'all';
        const label = option.dataset.label || (value === 'all' ? allLabel : value);
        input.value = value;
        state.stockFilters[stateKey] = value;
        text.textContent = value === 'all' ? allLabel : label;
        options.querySelectorAll('.home-stock-filter__option').forEach((item) => item.classList.toggle('is-selected', item === option));
        closeFilterLists();
        renderStockSummary();
      });
    };

    els.stockAnalysisTrigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      els.stockAnalysisMenu.hidden ? open() : close();
    });
    els.stockAnalysisMenu.addEventListener('click', (event) => event.stopPropagation());
    setupFilter({ trigger: els.stockTagFilterTrigger, options: els.stockTagFilterOptions, input: els.stockTagFilter, text: els.stockTagFilterText, stateKey: 'tag', allLabel: 'All tags' });
    window.addEventListener('resize', positionMenu, { passive: true });
    window.addEventListener('scroll', positionMenu, { passive: true, capture: true });
    document.addEventListener('click', close);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  }

  async function loadStock() {
    if (els.kpiStockMain) els.kpiStockMain.textContent = '…';
    if (els.kpiStockCost) els.kpiStockCost.textContent = '…';
    if (els.kpiStockSub) els.kpiStockSub.textContent = 'Loading';
    const list = await fetchJson('/api/stock');
    const items = Array.isArray(list) ? list : [];
    state.stockDefault = items.slice();
    state.stock = items;
    populateStockFilters(items);
    renderStockSummary();
  }

  async function loadExpenses() {
    setKpi(els.kpiExpensesMain, els.kpiExpensesSub, '…', 'Loading');
    const data = await fetchJson('/api/expenses');
    const items = Array.isArray(data?.items) ? data.items : [];
    state.expenses = items;

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let inM = 0;
    let outM = 0;
    let balanceAll = 0;

    for (const it of items) {
      const cashIn = Number(it.cashIn || 0);
      const cashOut = Number(it.cashOut || 0);
      balanceAll += (cashIn - cashOut);

      if (it.date && String(it.date).slice(0, 7) === ym) {
        inM += cashIn;
        outM += cashOut;
      }
    }

    const balM = inM - outM;
    setKpi(
      els.kpiExpensesMain,
      els.kpiExpensesSub,
      `${fmtMoney(balM)} this month`,
      `In: ${fmtMoney(inM)} • Out: ${fmtMoney(outM)} • All-time: ${fmtMoney(balanceAll)}`,
    );
    renderExpensesForGlobalFilter();
    renderExpensesChart(items);
  }

  // ===== Search =====
  function wireSearch() {
    if (!els.search) return;
    els.search.addEventListener('input', () => {
      if (state.tasks?.length) {
        const open = state.tasks.filter((t) => !isDoneStatus(optionText(t.status)));
        const next = open
          .slice()
          .sort((a, b) => {
            const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
            const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
            if (ad !== bd) return ad - bd;
            return new Date(b.createdTime) - new Date(a.createdTime);
          });
        renderTasksList(next);
      }
      if (state.orderGroups?.length) {
        renderOrdersList(state.orderGroups);
      }
    });
  }

  setupGlobalAnalysis();
  setupOrdersAnalysisControl();
  setupSummaryAnalysisControl('review', renderReviewAnalysis);
  setupSummaryAnalysisControl('operations', renderOperationsAnalysis);
  const maintenanceCard = document.querySelector('[data-block="maintenance"]');
  if (maintenanceCard) {
    const openMaintenance = () => { window.location.href = maintenanceCard.dataset.href || '/orders/maintenance-orders'; };
    maintenanceCard.addEventListener('click', openMaintenance);
    maintenanceCard.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMaintenance(); } });
  }
  setupStockAnalysis();

  // ===== Init =====
  (async () => {
    try {
      setUpdatedNow();
      wireSearch();

      const { canTasks, canOrders, canRequested, canMaintenance, canReview, canStock, canExpenses } = await loadAccount();
      await loadAnalysisUsers();
      setUpdatedNow();

      const jobs = [];
      if (canTasks) jobs.push(loadTasks().catch((e) => {
        console.error(e);
        setKpi(els.kpiTasksMain, els.kpiTasksSub, '—', 'Failed to load');
        renderEmpty(els.tasksList, 'Failed to load tasks');
      }));

      if (canOrders) jobs.push(loadOrders().catch((e) => {
        console.error(e);
        setKpi(els.kpiOrdersMain, els.kpiOrdersSub, '—', 'Failed to load');
        renderEmpty(els.ordersList, 'Failed to load orders');
      }));

      if (canRequested || canMaintenance) jobs.push(loadRequested().catch((e) => {
        console.error(e);
        setKpi(els.kpiRequestedMain, els.kpiRequestedSub, '—', 'Failed to load');
        setKpi(els.kpiMaintenanceMain, els.kpiMaintenanceSub, '—', 'Failed to load');
      }));

      if (canReview) jobs.push(loadReview().catch((e) => {
        console.error(e);
        if (els.kpiReviewMain) els.kpiReviewMain.textContent = '—';
        if (els.kpiReviewSub) els.kpiReviewSub.textContent = 'Failed to load';
      }));

      if (canStock) jobs.push(loadStock().catch((e) => {
        console.error(e);
        if (els.kpiStockMain) els.kpiStockMain.textContent = '—';
        if (els.kpiStockCost) els.kpiStockCost.textContent = '—';
        if (els.kpiStockSub) els.kpiStockSub.textContent = 'Failed to load';
      }));

      if (canExpenses) jobs.push(loadExpenses().catch((e) => {
        console.error(e);
        setKpi(els.kpiExpensesMain, els.kpiExpensesSub, '—', 'Failed to load');
      }));

      await Promise.allSettled(jobs);
      applyGlobalAnalysis();
      setUpdatedNow();
    } catch (e) {
      console.error(e);
      toast('error', 'Home', e.message || 'Failed to load Home');
      setUpdatedNow();
    }
  })();
});

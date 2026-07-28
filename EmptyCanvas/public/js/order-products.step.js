// public/js/order-products.step.js
// Create New Order (Products) — Shopping Cart UI
(() => {
  /**
   * Draft model (stored in session on server):
   *   [{
   *      id: string,
   *      quantity: number,
   *      reason: string,
   *      issueDescription?: string,
   *      schoolId?: string,
   *      expectedSparePartId?: string,
   *   }]
   *
   * Feb 2026 update:
   * - Reason is collected ONCE per order (in the Order Summary card)
   * - The backend still expects `reason` on each item, so we copy the global reason
   *   into every cart item before saving/submitting.
   * - Request Maintenance replaces Qty with Issue Description (saved per product).
   */

  // ---------------------------- DOM ----------------------------
  const cartItemsEl = document.getElementById('cartItems');
  const cartHeadEl = document.querySelector('#cartStep .cart-head') || document.querySelector('.cart-head');
  const updateCartBtn = document.getElementById('updateCartBtn');
  const checkoutBtn = document.getElementById('checkoutBtn');

  // Order Type flow (Step 1 -> Step 2)
  const orderTypeStepEl = document.getElementById('orderTypeStep');
  const orderTypeTabsEl = document.getElementById('orderTypeTabs');
  const placeholderStepEl = document.getElementById('orderTypePlaceholderStep');
  const placeholderTitleEl = document.getElementById('orderTypePlaceholderTitle');
  const backToTypesBtn = document.getElementById('orderTypeBackBtn');
  const cartStepEl = document.getElementById('cartStep');
  const cartTypePillEl = document.getElementById('cartTypePill');
  const cartTypeValueEl = document.getElementById('cartTypeValue');
  const cartTypeValueIconEl = document.getElementById('cartTypeValueIcon');
  const cartTypeValueTextEl = document.getElementById('cartTypeValueText');
  const cartBackBtn = document.getElementById('cartBackBtn');

  const pageTitleTextEl = document.getElementById('pageTitleText');
  const pageTitleIconEl = document.getElementById('pageTitleIcon');

  const passwordInput = document.getElementById('voucherInput');
  const reasonInput = document.getElementById('orderReasonSummary');

  const summarySubTotalEl = document.getElementById('summarySubTotal');
  const summaryTotalEl = document.getElementById('summaryTotal');

  const modalEl = document.getElementById('updateCartModal');
  const modalCloseBtn = document.getElementById('updateCartClose');
  const addToCartBtn = document.getElementById('addToCartBtn');
  const componentSelectEl = document.getElementById('cartComponentSelect');
  const componentLabelEl = document.getElementById('cartComponentLabel');
  const schoolSelectEl = document.getElementById('cartSchoolSelect');
  const expectedSpareSelectEl = document.getElementById('cartExpectedSpareSelect');
  const qtyInputEl = document.getElementById('cartQtyInput');
  const qtyUnitEl = document.getElementById('cartQtyUnit');

  // Request Maintenance: Issue Description field (replaces Qty)
  const issueDescInputEl = document.getElementById('cartIssueDescInput');
  const qtyFieldEl = document.getElementById('cartQtyField');
  const issueFieldEl = document.getElementById('cartIssueDescField');
  const schoolFieldEl = document.getElementById('cartSchoolField');
  const expectedSpareFieldEl = document.getElementById('cartExpectedSpareField');
  const modalGridEl = modalEl?.querySelector?.('.modal-grid') || document.querySelector('#updateCartModal .modal-grid');

  const savingOverlayEl = document.getElementById('cartSavingOverlay');
  const savingTextEl = document.getElementById('cartSavingText');

  // When opened from Current/Operations Orders -> Edit, we add ?edit=1.
  // Some mobile browsers / app-shell navigations can drop query params or server
  // draft visibility for one navigation. Keep a short local/session transfer as a
  // second source of truth so the Shopping Cart never opens empty after Edit.
  const EDIT_TRANSFER_TTL_MS = 30 * 60 * 1000;

  function readUrlParam(name) {
    try { return String(new URLSearchParams(window.location.search).get(name) || '').trim(); } catch { return ''; }
  }

  function editStorageAreas() {
    const stores = [];
    try { if (window.sessionStorage) stores.push(window.sessionStorage); } catch {}
    try { if (window.localStorage) stores.push(window.localStorage); } catch {}
    return stores;
  }

  function safeParseStorageJson(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function isFreshEditPayload(value) {
    const ts = Number(value?.ts || 0);
    return Boolean(ts && Date.now() - ts <= EDIT_TRANSFER_TTL_MS);
  }

  function readPendingEditTransfer() {
    for (const storage of editStorageAreas()) {
      try {
        const parsed = safeParseStorageJson(storage.getItem('shopping_cart:edit_pending:v2'));
        if (isFreshEditPayload(parsed)) return parsed;
      } catch {}
    }
    return null;
  }

  function clearPendingEditTransfer() {
    for (const storage of editStorageAreas()) {
      try { storage.removeItem('shopping_cart:edit_pending:v2'); } catch {}
    }
  }

  function clearAllEditTransfer() {
    for (const storage of editStorageAreas()) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i) || '';
          if (
            key === 'shopping_cart:edit_pending:v2' ||
            key === 'shopping_cart:edit_target_type:v1' ||
            key.startsWith('shopping_cart:edit_payload:v2:') ||
            key.startsWith('shopping_cart:edit_fallback:v1:')
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => storage.removeItem(key));
      } catch {}
    }
  }

  function hasFreshEditTransfer() {
    const editKey = readUrlParam('editKey');
    if (editKey) {
      for (const storage of editStorageAreas()) {
        try {
          const parsed = safeParseStorageJson(storage.getItem(`shopping_cart:edit_payload:v2:${editKey}`));
          if (isFreshEditPayload(parsed) && Array.isArray(parsed.products) && parsed.products.length) return true;
        } catch {}
      }
    }

    const pending = readPendingEditTransfer();
    if (pending?.key) {
      for (const storage of editStorageAreas()) {
        try {
          const parsed = safeParseStorageJson(storage.getItem(`shopping_cart:edit_payload:v2:${pending.key}`));
          if (isFreshEditPayload(parsed) && Array.isArray(parsed.products) && parsed.products.length) return true;
        } catch {}
      }
    }

    return false;
  }

  function readOrderTypeFromEditTransfer() {
    const editKey = readUrlParam('editKey') || readPendingEditTransfer()?.key || '';
    if (editKey) {
      for (const storage of editStorageAreas()) {
        try {
          const parsed = safeParseStorageJson(storage.getItem(`shopping_cart:edit_payload:v2:${editKey}`));
          if (isFreshEditPayload(parsed) && parsed?.orderType) return String(parsed.orderType).trim();
        } catch {}
      }
    }
    const pending = readPendingEditTransfer();
    if (pending?.orderType) return String(pending.orderType).trim();
    for (const storage of editStorageAreas()) {
      try {
        const target = String(storage.getItem('shopping_cart:edit_target_type:v1') || '').trim();
        if (target) return target;
      } catch {}
    }
    return '';
  }

  function meaningfulEditReason(value) {
    const v = String(value || '').trim();
    if (!v || v === '—' || /^no reason$/i.test(v)) return '';
    return v;
  }

  function collectEditTransferPayloads() {
    const payloads = [];
    const seen = new Set();
    const addPayload = (payload) => {
      if (!isFreshEditPayload(payload)) return;
      const key = JSON.stringify({
        ts: payload?.ts || 0,
        reason: payload?.reason || '',
        orderType: payload?.orderType || '',
        count: Array.isArray(payload?.products) ? payload.products.length : 0,
      });
      if (seen.has(key)) return;
      seen.add(key);
      payloads.push(payload);
    };

    const keys = [];
    const pushKey = (value) => {
      const key = String(value || '').trim();
      if (key && !keys.includes(key)) keys.push(key);
    };

    pushKey(readUrlParam('editKey'));
    const pending = readPendingEditTransfer();
    pushKey(pending?.key);
    if (pending?.reason || pending?.orderType) addPayload(pending);

    for (const storage of editStorageAreas()) {
      for (const key of keys) {
        try {
          addPayload(safeParseStorageJson(storage.getItem(`shopping_cart:edit_payload:v2:${key}`)));
        } catch {}
      }
      try {
        for (let i = 0; i < storage.length; i += 1) {
          const storageKey = storage.key(i) || '';
          if (storageKey.startsWith('shopping_cart:edit_fallback:v1:')) {
            addPayload(safeParseStorageJson(storage.getItem(storageKey)));
          }
        }
      } catch {}
    }

    return payloads;
  }

  function readReasonFromEditTransfer() {
    for (const payload of collectEditTransferPayloads()) {
      const directReason = meaningfulEditReason(payload?.reason);
      if (directReason) return directReason;

      const products = Array.isArray(payload?.products) ? payload.products : [];
      for (const item of products) {
        const itemReason = meaningfulEditReason(item?.reason);
        if (itemReason) return itemReason;
      }
    }
    return '';
  }

  function mergeMissingReasonsFromEditTransfer(items, fallbackItems = []) {
    const cleanItems = normalizeDraftItems(items);
    if (!cleanItems.length) return cleanItems;

    const transferReason =
      readReasonFromEditTransfer() ||
      (normalizeDraftItems(fallbackItems).find((p) => meaningfulEditReason(p.reason))?.reason || '');
    const fallbackReason = meaningfulEditReason(transferReason);
    if (!fallbackReason) return cleanItems;

    return cleanItems.map((item) => ({
      ...item,
      reason: meaningfulEditReason(item.reason) || fallbackReason,
    }));
  }

  const isEditMode = readUrlParam('edit') === '1' || hasFreshEditTransfer();
  let editCheckoutCommitted = false;
  let editCancelSent = false;

  function cancelEditModeOnLeave() {
    if (!isEditMode || editCheckoutCommitted || editCancelSent) return;
    editCancelSent = true;
    clearAllEditTransfer();

    const payload = JSON.stringify({ orderType: selectedOrderType || readOrderTypeFromEditTransfer() || readOrderTypeFromUrl() || null });
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/order-edit/cancel', blob);
        return;
      }
    } catch {}

    try {
      fetch('/api/order-edit/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }

  function goToCurrentOrdersFromEdit() {
    cancelEditModeOnLeave();
    try {
      const u = new URL('/orders', window.location.origin);
      u.searchParams.set('tab', 'all');
      u.searchParams.set('_fresh', '1');
      u.searchParams.set('_refresh', String(Date.now()));
      window.location.href = u.toString();
    } catch {
      window.location.href = `/orders?tab=all&_fresh=1&_refresh=${Date.now()}`;
    }
  }

  // ---------------------------- Order Type (tabs) ----------------------------
  const ORDER_TYPE_STORAGE_KEY = 'shopping_cart:last_order_type:v1';
  const ORDER_TYPE_STORAGE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const REQUEST_PRODUCTS_KEY = normKey('Request Products');
  const WITHDRAW_PRODUCTS_KEY = normKey('Withdraw Products');
  const REQUEST_MAINTENANCE_KEY = normKey('Request Maintenance');

  // Products used in Request Maintenance are now loaded from the full products catalog.
  const SPARE_PARTS_TAG_KEY = normKey('Spare parts');

  const ORDER_TYPE_META = {
    [REQUEST_PRODUCTS_KEY]: {
      icon: 'shopping-cart',
      description: 'Add new products or supplies and send them as a stock request.',
      headingTitle: 'Shopping Cart',
      headingIcon: 'shopping-cart',
      themeClass: 'theme-request-products',
    },
    [WITHDRAW_PRODUCTS_KEY]: {
      icon: 'log-out',
      description: 'Withdraw available items from stock with a dedicated outgoing flow.',
      headingTitle: 'Withdraw Products',
      headingIcon: 'log-out',
      themeClass: 'theme-withdraw-products',
    },
    [REQUEST_MAINTENANCE_KEY]: {
      icon: 'tool',
      description: 'Report issues for products and create a maintenance request quickly.',
      headingTitle: 'Request Maintenance',
      headingIcon: 'tool',
      themeClass: 'theme-request-maintenance',
    },
  };

  const ORDER_TYPE_THEME_CLASSES = [
    'theme-request-products',
    'theme-withdraw-products',
    'theme-request-maintenance',
  ];

  let selectedOrderType = '';
  let cartBooted = false;
  let cartBootPromise = null;

  function featherIconMarkup(iconName) {
    return `<i data-feather="${String(iconName || 'grid')}"></i>`;
  }

  function getOrderTypeMeta(type = selectedOrderType) {
    const key = normKey(type);
    return ORDER_TYPE_META[key] || {
      icon: 'grid',
      description: 'Open this workflow and continue to the next step.',
      headingTitle: String(type || '').trim() || 'Shopping Cart',
      headingIcon: 'grid',
      themeClass: '',
    };
  }

  function applyThemeClass(el, themeClass) {
    if (!el) return;
    try {
      ORDER_TYPE_THEME_CLASSES.forEach((cls) => el.classList.remove(cls));
      if (themeClass) el.classList.add(themeClass);
    } catch {}
  }

  function updatePageHeading(type = selectedOrderType) {
    const v = String(type || '').trim();
    const meta = getOrderTypeMeta(v);
    const headingTitle = v ? meta.headingTitle : 'Shopping Cart';
    const headingIcon = v ? meta.headingIcon : 'shopping-cart';

    try {
      if (pageTitleTextEl) pageTitleTextEl.textContent = headingTitle;
      else {
        const pageTitleEl = document.querySelector('.page-title');
        if (pageTitleEl) pageTitleEl.textContent = headingTitle;
      }
      if (pageTitleIconEl) {
        pageTitleIconEl.innerHTML = featherIconMarkup(headingIcon);
        applyThemeClass(pageTitleIconEl, v ? meta.themeClass : '');
      }
      if (window.feather) feather.replace();
    } catch {}
  }

  function isRequestProductsType(type = selectedOrderType) {
    return normKey(type) === REQUEST_PRODUCTS_KEY;
  }

  function isWithdrawType(type = selectedOrderType) {
    return normKey(type) === WITHDRAW_PRODUCTS_KEY;
  }

  function isMaintenanceType(type = selectedOrderType) {
    return normKey(type) === REQUEST_MAINTENANCE_KEY;
  }

  function qtySign(type = selectedOrderType) {
    return isWithdrawType(type) ? -1 : 1;
  }

  function applyOrderTypeUi(type = selectedOrderType) {
    const withdraw = isWithdrawType(type);
    const maintenance = isMaintenanceType(type);

    // Maintenance gets a special layout (no URL/Qty/Total/Reason; Qty becomes Issue Description)
    try {
      document.body.classList.toggle('is-maintenance', maintenance);
    } catch {}

    // Update cart header columns
    try {
      if (cartHeadEl) {
        cartHeadEl.innerHTML = maintenance
          ? '<div>Product</div><div>Issue Description</div><div>Action</div>'
          : '<div>Product</div><div>URL</div><div>Quantity</div><div>Total</div><div>Action</div>';
      }
    } catch {}

    // Toggle modal fields
    try {
      if (modalGridEl) modalGridEl.classList.toggle('is-maintenance', maintenance);
      if (qtyFieldEl) qtyFieldEl.style.display = maintenance ? 'none' : '';
      if (issueFieldEl) issueFieldEl.style.display = maintenance ? '' : 'none';
      if (schoolFieldEl) schoolFieldEl.style.display = 'none';
      if (expectedSpareFieldEl) expectedSpareFieldEl.style.display = 'none';
      if (componentLabelEl) {
        componentLabelEl.innerHTML = maintenance
          ? 'Product <span class="req-star">*</span>'
          : 'Product <span class="req-star">*</span>';
      }
    } catch {}

    // Page title + icon
    try {
      updatePageHeading(type);
      const meta = getOrderTypeMeta(type);
      document.title = maintenance ? meta.headingTitle : (withdraw ? meta.headingTitle : 'Shopping Cart');
    } catch {}

    // Modal title
    try {
      const modalTitle = document.getElementById('updateCartTitle');
      if (modalTitle) modalTitle.textContent = withdraw ? 'Update Withdraw Cart' : 'Update Cart';
    } catch {}

    // Buttons
    if (updateCartBtn) updateCartBtn.textContent = withdraw ? 'Update Withdraw Cart' : 'Update Cart';
    if (checkoutBtn) checkoutBtn.textContent = withdraw ? 'Withdraw Now' : 'Checkout Now';

    syncUpdateCartButtonVisibility();

    // Summary title
    try {
      const summaryTitleEl = document.querySelector('.summary-title');
      if (summaryTitleEl) summaryTitleEl.textContent = withdraw ? 'Withdrawal Summary' : 'Order Summary';
    } catch {}
  }

  function readOrderTypeFromUrl() {
    return readUrlParam('type');
  }

  function storeOrderType(type) {
    try {
      const v = String(type || '').trim();
      if (!v) return;
      const payload = { v, ts: Date.now() };
      sessionStorage.setItem(ORDER_TYPE_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function loadStoredOrderType() {
    try {
      const raw = sessionStorage.getItem(ORDER_TYPE_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      const v = String(parsed?.v || '').trim();
      const ts = Number(parsed?.ts || 0);
      if (!v || !Number.isFinite(ts)) return '';
      if (Date.now() - ts > ORDER_TYPE_STORAGE_TTL_MS) return '';
      return v;
    } catch {
      return '';
    }
  }

  function clearStoredOrderType() {
    try { sessionStorage.removeItem(ORDER_TYPE_STORAGE_KEY); } catch {}
  }

  function setUrlOrderType(type, { replace = false } = {}) {
    try {
      const u = new URL(window.location.href);
      const v = String(type || '').trim();
      if (v) u.searchParams.set('type', v);
      else u.searchParams.delete('type');
      // Keep other params (like edit=1)
      const next = u.toString();
      // Avoid pushing duplicate entries
      if (next === window.location.href) return;
      const fn = replace ? 'replaceState' : 'pushState';
      history[fn]({}, '', next);
    } catch {}
  }

  function showOnly(step) {
    const show = (el, on) => {
      if (!el) return;
      el.style.display = on ? '' : 'none';
    };
    show(orderTypeStepEl, step === 'types');
    show(placeholderStepEl, step === 'placeholder');
    show(cartStepEl, step === 'cart');
  }

  function renderOrderTypeTabs(options, activeType) {
    if (!orderTypeTabsEl) return;
    const opts = Array.isArray(options) ? options.filter(Boolean) : [];

    // Clear
    orderTypeTabsEl.innerHTML = '';

    if (opts.length === 0) {
      orderTypeTabsEl.innerHTML = `
        <div class="order-type-loading" aria-live="polite">
          <span class="order-type-dot" aria-hidden="true"></span>
          <span>No order types found.</span>
        </div>
      `;
      return;
    }

    for (const name of opts) {
      const btn = document.createElement('button');
      const meta = getOrderTypeMeta(name);
      const isActive = activeType && normKey(activeType) === normKey(name);

      btn.type = 'button';
      btn.className = 'order-type-btn';
      if (meta.themeClass) btn.classList.add(meta.themeClass);
      btn.dataset.type = String(name);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.innerHTML = `
        <span class="order-type-icon" aria-hidden="true">${featherIconMarkup(meta.icon)}</span>
        <span class="order-type-copy">
          <span class="order-type-name">${escapeHtml(name)}</span>
          <span class="order-type-desc">${escapeHtml(meta.description)}</span>
        </span>
        <span class="order-type-arrow" aria-hidden="true">${featherIconMarkup('arrow-right')}</span>
      `;

      if (isActive) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        chooseOrderType(String(name));
      });
      orderTypeTabsEl.appendChild(btn);
    }

    if (window.feather) feather.replace();
  }

  async function fetchOrderTypes() {
    try {
      const res = await fetch('/api/order-types');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const opts = Array.isArray(data) ? data : data?.options;
      return Array.isArray(opts) ? opts.map((x) => String(x || '').trim()).filter(Boolean) : [];
    } catch (e) {
      console.warn('Failed to load order types:', e);
      return [];
    }
  }

  function setCartTypePill(type) {
    const v = String(type || '').trim();
    if (!cartTypePillEl || !cartTypeValueEl) return;
    if (!v) {
      cartTypePillEl.style.display = 'none';
      if (cartTypeValueTextEl) cartTypeValueTextEl.textContent = '—';
      else cartTypeValueEl.textContent = '—';
      if (cartTypeValueIconEl) cartTypeValueIconEl.innerHTML = featherIconMarkup('shopping-cart');
      applyThemeClass(cartTypeValueEl, '');
      // Reset UI to default state
      applyOrderTypeUi('');
      if (window.feather) feather.replace();
      return;
    }

    const meta = getOrderTypeMeta(v);
    if (cartTypeValueTextEl) cartTypeValueTextEl.textContent = v;
    else cartTypeValueEl.textContent = v;
    if (cartTypeValueIconEl) cartTypeValueIconEl.innerHTML = featherIconMarkup(meta.icon);
    applyThemeClass(cartTypeValueEl, meta.themeClass || '');
    cartTypePillEl.style.display = 'flex';

    // Apply UI copy for this order type
    applyOrderTypeUi(v);

    // In edit mode, the back button returns to Current Orders instead of the order type step.
    if (cartBackBtn) cartBackBtn.style.display = '';
    if (window.feather) feather.replace();
  }

  async function bootCart() {
    if (cartBootPromise) return cartBootPromise;

    cartBooted = true;
    cartBootPromise = new Promise((resolve, reject) => {
      const run = () => {
        Promise.resolve(initCart()).then(resolve).catch(reject);
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
      } else {
        run();
      }
    });

    return cartBootPromise;
  }

  async function chooseOrderType(type) {
    const v = String(type || '').trim();
    if (!v) return;

    const prevType = String(selectedOrderType || '').trim();
    const typeChanged = normKey(prevType) !== normKey(v);

    if (cartBooted && typeChanged && prevType) {
      cancelScheduledDraftSave();
      syncReasonFromInput();
      await persistDraft({ silent: true, orderType: prevType });
    }

    selectedOrderType = v;
    storeOrderType(v);
    setUrlOrderType(v);

    // Update active state
    try {
      const buttons = orderTypeTabsEl?.querySelectorAll?.('button.order-type-btn') || [];
      buttons.forEach((b) => {
        const active = normKey(b.dataset.type) === normKey(v);
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    } catch {}

    // Request Products / Withdraw Products / Request Maintenance -> show the cart UI
    if (
      normKey(v) === REQUEST_PRODUCTS_KEY ||
      normKey(v) === WITHDRAW_PRODUCTS_KEY ||
      normKey(v) === REQUEST_MAINTENANCE_KEY ||
      isEditMode
    ) {
      setCartTypePill(v);
      showOnly('cart');
      const wasBooted = Boolean(cartBootPromise);
      await bootCart();

      // If the cart is already booted & components are loaded, re-render the dropdown
      // options to match the newly selected order type (e.g. Maintenance filter).
      try {
        if (cartBooted && componentsLoaded) refreshModalChoices();
      } catch {}

      if (typeChanged && wasBooted) {
        await reloadActiveDraft({ showLoader: true });
      }
      return;
    }

    // Other order types will be configured later
    if (placeholderTitleEl) placeholderTitleEl.textContent = v;
    showOnly('placeholder');
  }

  async function initOrderTypeFlow() {
    // Edit mode should open the cart directly (no order type step)
    if (isEditMode) {
      selectedOrderType = readOrderTypeFromUrl() || readOrderTypeFromEditTransfer() || loadStoredOrderType() || '';
      if (selectedOrderType) setCartTypePill(selectedOrderType);
      else updatePageHeading('');
      showOnly('cart');
      await bootCart();
      return;
    }

    // Normal flow: show tabs first
    showOnly('types');

    // Load options
    const options = await fetchOrderTypes();

    // Fallback if Notion schema is not available yet
    const safeOptions = options.length
      ? options
      : ['Request Products', 'Withdraw Products', 'Request Maintenance'];

    // Determine selected type from URL (highest priority) then storage
    const fromUrl = readOrderTypeFromUrl();
    const fromStorage = loadStoredOrderType();
    const initial = fromUrl || fromStorage || '';

    renderOrderTypeTabs(safeOptions, initial);
    if (!initial) updatePageHeading('');

    // If URL already has a type, open its second page immediately
    if (initial) {
      // Only auto-open if it exists in the options list
      const exists = safeOptions.some((x) => normKey(x) === normKey(initial));
      if (exists) chooseOrderType(initial);
    }

    // Back button (from placeholder/cart)
    // Keep the return instant: do not block the UI on the draft save request.
    const goBackToOrderTypes = () => {
      const prevType = String(selectedOrderType || '').trim();

      if (cartBooted && prevType) {
        cancelScheduledDraftSave();
        syncReasonFromInput();
        Promise.resolve(persistDraft({ silent: true, orderType: prevType }))
          .catch((err) => console.warn('Failed to save draft before going back:', err));
      }

      selectedOrderType = '';
      clearStoredOrderType();

      // Replace the URL instead of pushing a new history entry.
      // This makes the browser Back behave naturally (go to the previous app page).
      setUrlOrderType('', { replace: true });
      setCartTypePill('');
      showOnly('types');
      renderOrderTypeTabs(safeOptions, '');
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
    };

    // Back button (from placeholder)
    backToTypesBtn?.addEventListener('click', () => { goBackToOrderTypes(); });

    // Back button (from cart)
    cartBackBtn?.addEventListener('click', () => { goBackToOrderTypes(); });

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      const t = readOrderTypeFromUrl();
      if (!t) {
        const prevType = String(selectedOrderType || '').trim();
        if (cartBooted && prevType) {
          cancelScheduledDraftSave();
          syncReasonFromInput();
          persistDraft({ silent: true, orderType: prevType });
        }
        selectedOrderType = '';
        setCartTypePill('');
        showOnly('types');
        renderOrderTypeTabs(safeOptions, '');
        return;
      }
      chooseOrderType(t);
    });
  }

  // ---------------------------- UI helpers ----------------------------
  function toast(type, title, message) {
    if (window.UI && typeof window.UI.toast === 'function') {
      window.UI.toast({ type, title, message });
      return;
    }
    alert([title, message].filter(Boolean).join('\n'));
  }

  // ---------------------------- Autofill guards ----------------------------
  // Mobile Chrome sometimes treats the Reason + Password fields like a login form
  // and auto-fills username/password. We explicitly disable autofill and clear any
  // prefilled values so the user must type them.
  function hardDisableAutofill(el, { clearNow = true } = {}) {
    if (!el) return;

    // Keep readonly until user focuses (prevents many autofill flows)
    try {
      el.setAttribute('readonly', 'readonly');

      // On mobile, focusing a readonly input often prevents the keyboard from
      // opening on the first tap. Remove readonly *before* focus when the user
      // interacts (pointerdown/touch), and keep the focus handler as a fallback.
      const unlock = () => {
        try { el.removeAttribute('readonly'); } catch {}
      };
      el.addEventListener('pointerdown', unlock, { once: true, capture: true });
      el.addEventListener('touchstart', unlock, { once: true, capture: true });
      el.addEventListener('mousedown', unlock, { once: true, capture: true });

      el.addEventListener(
        'focus',
        () => {
          try { el.removeAttribute('readonly'); } catch {}
        },
        { once: true },
      );
    } catch {}

    // For fields that are populated by our app (Reason in edit/draft mode),
    // never attach delayed clearing timers. Those timers can delete the real
    // server-loaded reason a few milliseconds after it appears on screen.
    if (!clearNow) return;

    // Clear any values that were injected by the browser/password manager.
    try { el.value = ''; } catch {}

    // If the browser tries to autofill later (often without user interaction),
    // clear it unless the user actually interacted with the field.
    let userInteracted = false;
    el.addEventListener('keydown', () => (userInteracted = true));
    el.addEventListener('paste', () => (userInteracted = true));
    el.addEventListener('input', () => {
      if (document.activeElement === el) userInteracted = true;
    });

    const clearIfInjected = () => {
      if (userInteracted) return;
      if (document.activeElement === el) return;
      if (String(el.value || '').trim()) {
        try { el.value = ''; } catch {}
      }
    };

    // Run a few times after paint (Chrome sometimes autofills after load)
    window.setTimeout(clearIfInjected, 0);
    window.setTimeout(clearIfInjected, 200);
    window.setTimeout(clearIfInjected, 800);

    // Also watch for silent autofill triggers
    el.addEventListener('change', clearIfInjected);
  }

  function showSaving(text = 'Saving...') {
    if (!savingOverlayEl) return;
    if (savingTextEl) savingTextEl.textContent = text;
    savingOverlayEl.style.display = 'flex';
    savingOverlayEl.setAttribute('aria-hidden', 'false');
  }

  function hideSaving() {
    if (!savingOverlayEl) return;
    savingOverlayEl.style.display = 'none';
    savingOverlayEl.setAttribute('aria-hidden', 'true');
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const hasDecimals = Math.abs(n - Math.round(n)) > 1e-9;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: hasDecimals ? 2 : 0,
      }).format(n);
    } catch {
      const fixed = hasDecimals ? n.toFixed(2) : String(Math.round(n));
      return '$' + fixed;
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeHttpUrl(maybeUrl) {
    try {
      if (!maybeUrl) return null;
      const u = new URL(String(maybeUrl));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  function hasTag(comp, wantTagKey) {
    const tags = Array.isArray(comp?.tags) ? comp.tags : [];
    if (!tags.length) return false;
    const want = String(wantTagKey || '').trim();
    if (!want) return false;
    return tags.some((t) => normKey(t) === want);
  }

  function getComponentsForSelect(type = selectedOrderType) {
    // All order types, including Request Maintenance, use the full products catalog.
    return Array.isArray(components) ? components : [];
  }

  function getSparePartsForSelect() {
    return (Array.isArray(components) ? components : []).filter((c) => hasTag(c, SPARE_PARTS_TAG_KEY));
  }

  // NOTE:
  // The cart thumbnail uses a sequential number when there is no image.
  // Requirement: keep it in English digits (1,2,3,...) regardless of locale.

  // ---------------------------- State ----------------------------
  const MIN_QTY = 0.01;

  let components = []; // [{id,name,url,unitPrice,imageUrl,displayId}]
  let schools = []; // [{id,name}]
  let byId = new Map();
  let schoolsById = new Map();
  let cart = []; // [{id, quantity, reason, issueDescription?, schoolId?, expectedSparePartId?}]

  let globalReason = '';

  let componentChoicesInst = null;
  let schoolChoicesInst = null;
  let expectedSpareChoicesInst = null;
  let saveTimer = null;
  let isSavingNow = false;
  let editingId = null; // when modal opened for editing an existing cart item

  let componentsLoaded = false;
  let schoolsLoaded = false;
  let readyToUse = false; // reason + components loaded

  // Preload promises
  let componentsPromise = null;
  let schoolsPromise = null;
  let draftPromise = null;

  // Avoid double init races if the modal is opened while components are loading
  let ensureComponentsPromise = null;
  let ensureSchoolsPromise = null;

  // ---------------------------- Data loading ----------------------------
  async function loadComponents() {
    try {
      const res = await fetch('/api/components');
      if (!res.ok) throw new Error(await res.text());
      const list = await res.json();
      components = Array.isArray(list) ? list : [];
      byId = new Map(components.map((c) => [String(c.id), c]));
      return true;
    } catch (err) {
      console.error('Failed to load components:', err);
      components = [];
      byId = new Map();
      return false;
    }
  }

  function buildDraftUrl(orderType = selectedOrderType) {
    const params = new URLSearchParams();
    const v = String(orderType || '').trim();
    if (v) params.set('orderType', v);
    const q = params.toString();
    return q ? `/api/order-draft?${q}` : '/api/order-draft';
  }

  function normalizeDraftItems(list) {
    return (Array.isArray(list) ? list : [])
      .map((p) => ({
        id: String(p.id || ''),
        quantity: normalizeQty(Number(p.quantity), 1),
        reason: String(p.reason || '').trim(),
        issueDescription: String(p.issueDescription || '').trim(),
        schoolId: String(p.schoolId || '').trim(),
        expectedSparePartId: String(p.expectedSparePartId || '').trim(),
      }))
      .filter((p) => p.id);
  }

  function loadEditFallbackDraft(orderType = selectedOrderType) {
    try {
      if (!isEditMode && !hasFreshEditTransfer()) return [];

      const normalizedKeys = [];
      const pushKey = (value) => {
        const keyType = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'default';
        if (!normalizedKeys.includes(keyType)) normalizedKeys.push(keyType);
      };

      const payloadKeys = [];
      const pushPayloadKey = (value) => {
        const key = String(value || '').trim();
        if (key && !payloadKeys.includes(key)) payloadKeys.push(key);
      };

      pushPayloadKey(readUrlParam('editKey'));
      const pending = readPendingEditTransfer();
      pushPayloadKey(pending?.key);

      pushKey(orderType);
      pushKey(readOrderTypeFromUrl());
      pushKey(readOrderTypeFromEditTransfer());
      pushKey(loadStoredOrderType());

      // Generic fallback is written before redirecting from Operations Orders.
      pushKey('default');
      pushKey('Request Products');
      pushKey('Request Maintenance');
      pushKey('Withdraw Products');

      const tryPayload = (parsed, storage, storageKey) => {
        if (!isFreshEditPayload(parsed)) {
          try { if (storage && storageKey) storage.removeItem(storageKey); } catch {}
          return [];
        }
        const items = normalizeDraftItems(parsed?.products);
        const payloadReason = meaningfulEditReason(parsed?.reason);
        if (!payloadReason) return items;
        return items.map((item) => ({
          ...item,
          reason: meaningfulEditReason(item.reason) || payloadReason,
        }));
      };

      for (const storage of editStorageAreas()) {
        for (const key of payloadKeys) {
          try {
            const storageKey = `shopping_cart:edit_payload:v2:${key}`;
            const items = tryPayload(safeParseStorageJson(storage.getItem(storageKey)), storage, storageKey);
            if (items.length) {
              clearPendingEditTransfer();
              return items;
            }
          } catch {}
        }
      }

      for (const storage of editStorageAreas()) {
        try {
          for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i) || '';
            if (key.startsWith('shopping_cart:edit_fallback:v1:')) {
              const suffix = key.slice('shopping_cart:edit_fallback:v1:'.length);
              if (suffix && !normalizedKeys.includes(suffix)) normalizedKeys.push(suffix);
            }
          }
        } catch {}
      }

      for (const keyType of normalizedKeys) {
        for (const storage of editStorageAreas()) {
          try {
            const storageKey = `shopping_cart:edit_fallback:v1:${keyType}`;
            const items = tryPayload(safeParseStorageJson(storage.getItem(storageKey)), storage, storageKey);
            if (items.length) {
              clearPendingEditTransfer();
              return items;
            }
          } catch {}
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  async function loadDraft(orderType = selectedOrderType) {
    try {
      const fallbackCart = loadEditFallbackDraft(orderType);
      const res = await fetch(buildDraftUrl(orderType));
      if (!res.ok) return { cart: fallbackCart };
      const d = await res.json();
      const serverReason = meaningfulEditReason(d?.reason);
      const serverCart = normalizeDraftItems(d?.products).map((item) => ({
        ...item,
        reason: meaningfulEditReason(item.reason) || serverReason,
      }));
      return {
        cart: serverCart.length ? mergeMissingReasonsFromEditTransfer(serverCart, fallbackCart) : fallbackCart,
      };
    } catch {
      return { cart: loadEditFallbackDraft(orderType) }; // ignore
    }
  }

  async function loadSchools() {
    try {
      const res = await fetch('/api/create-order/schools');
      if (!res.ok) throw new Error(await res.text());
      const list = await res.json();
      schools = (Array.isArray(list) ? list : [])
        .map((s) => ({
          id: String(s?.id || '').trim(),
          name: String(s?.name || '').trim(),
        }))
        .filter((s) => s.id && s.name);
      schoolsById = new Map(schools.map((s) => [String(s.id), s]));
      return true;
    } catch (err) {
      console.error('Failed to load schools:', err);
      schools = [];
      schoolsById = new Map();
      return false;
    }
  }

  function startPreload() {
    if (!componentsPromise) componentsPromise = loadComponents();
    draftPromise = loadDraft(selectedOrderType);
    return { componentsPromise, schoolsPromise, draftPromise };
  }

  async function ensureComponentsReady() {
    if (componentsLoaded) return true;
    if (ensureComponentsPromise) return ensureComponentsPromise;

    ensureComponentsPromise = (async () => {
      // Ensure the fetch has started
      if (!componentsPromise) startPreload();

      try { await componentsPromise; } catch {}

      if (!Array.isArray(components) || components.length === 0) return false;

      initComponentChoices();
      componentsLoaded = true;
      updateReady();
      return true;
    })().finally(() => {
      ensureComponentsPromise = null;
    });

    return ensureComponentsPromise;
  }

  async function ensureSchoolsReady() {
    if (schoolsLoaded) return true;
    if (ensureSchoolsPromise) return ensureSchoolsPromise;

    ensureSchoolsPromise = (async () => {
      if (!schoolsPromise) schoolsPromise = loadSchools();

      let ok = false;
      try { ok = await schoolsPromise; } catch {}

      if (!ok) return false;

      initSchoolChoices();
      schoolsLoaded = true;
      return true;
    })().finally(() => {
      ensureSchoolsPromise = null;
    });

    return ensureSchoolsPromise;
  }

  // ---------------------------- Ready gating ----------------------------
  function setReady(isReady) {
    readyToUse = Boolean(isReady);
    // Do NOT disable the "Update Cart" button.
    // We keep validation on "Add/Update" and on checkout.
  }

  function updateReady() {
    const hasReason = Boolean(String(globalReason || '').trim());
    const needsReason = !isMaintenanceType();
    setReady((needsReason ? hasReason : true) && componentsLoaded);
  }

  function syncReasonFromInput() {
    globalReason = String(reasonInput?.value || '').trim();
    applyGlobalReason();
    updateReady();
  }

  function applyGlobalReason() {
    // Request Maintenance does not use a global reason.
    if (isMaintenanceType()) return;
    const r = String(globalReason || '').trim();
    if (!r) return;
    if (!Array.isArray(cart)) return;
    for (const item of cart) item.reason = r;
  }

  function deriveMaintenanceReason(issueDescription) {
    const s = String(issueDescription || '').trim();
    if (s) return s.slice(0, 80);
    return 'Request Maintenance';
  }

  // ---------------------------- Draft persistence ----------------------------
  function cancelScheduledDraftSave() {
    if (!saveTimer) return;
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }

  function scheduleSaveDraft(orderType = selectedOrderType) {
    const targetType = String(orderType || selectedOrderType || '').trim();
    cancelScheduledDraftSave();
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      persistDraft({ silent: true, orderType: targetType });
    }, 500);
  }

  async function persistDraft({ silent = false, orderType = selectedOrderType } = {}) {
    if (isSavingNow) return false;
    isSavingNow = true;

    try {
      const maintenanceDraft = isMaintenanceType(orderType);

      if (!Array.isArray(cart) || cart.length === 0) {
        await fetch(buildDraftUrl(orderType), { method: 'DELETE' });
        return true;
      }

      // IMPORTANT:
      // We allow saving a draft cart even if the user hasn't written the order
      // reason yet. Reason will be validated on checkout ("Checkout Now").
      //
      // If a global reason exists, copy it into each item before saving.
      if (!maintenanceDraft) applyGlobalReason();

      const clean = cart
        .map((p) => ({
          id: String(p.id),
          quantity: maintenanceDraft ? 1 : normalizeQty(Number(p.quantity), 1),
          reason: maintenanceDraft
            ? deriveMaintenanceReason(p.issueDescription)
            : String(p.reason || '').trim(),
          issueDescription: String(p.issueDescription || '').trim(),
          schoolId: String(p.schoolId || '').trim(),
          expectedSparePartId: String(p.expectedSparePartId || '').trim(),
        }))
        .filter((p) => p.id);

      const res = await fetch('/api/order-draft/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: clean, orderType }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) toast('error', 'Error', data?.error || 'Failed to save cart.');
        return false;
      }
      return true;
    } catch (err) {
      console.error('persistDraft error:', err);
      if (!silent) toast('error', 'Error', 'Failed to save cart.');
      return false;
    } finally {
      isSavingNow = false;
    }
  }

  function syncDraftUi(type = selectedOrderType) {
    const maintenance = isMaintenanceType(type);
    const firstReason = cart.find((p) => meaningfulEditReason(p.reason))?.reason || '';
    const editFallbackReason = isEditMode ? readReasonFromEditTransfer() : '';

    globalReason = maintenance ? '' : String(meaningfulEditReason(firstReason) || meaningfulEditReason(editFallbackReason) || '').trim();

    if (globalReason && !maintenance && Array.isArray(cart)) {
      cart = cart.map((item) => ({
        ...item,
        reason: meaningfulEditReason(item.reason) || globalReason,
      }));
    }

    if (reasonInput) {
      reasonInput.value = maintenance ? '' : globalReason;
    }

    if (!maintenance) applyGlobalReason();
    updateReady();
  }

  async function reloadActiveDraft({ showLoader = false } = {}) {
    const activeType = String(selectedOrderType || '').trim();
    if (!activeType) return false;

    if (showLoader) {
      renderLoadingState('Loading products...');
    }

    const ok = isMaintenanceType(activeType)
      ? await ensureMaintenanceModalReady()
      : await ensureComponentsReady();
    if (!ok) {
      toast(
        'error',
        'Error',
        isMaintenanceType(activeType)
          ? 'Failed to load products list. Please reload the page.'
          : 'Failed to load products list. Please reload the page.',
      );
      return false;
    }

    const draftState = await loadDraft(activeType);
    if (normKey(selectedOrderType) !== normKey(activeType)) return false;

    cart = normalizeDraftItems(draftState?.cart);
    syncDraftUi(activeType);
    renderCart();
    return true;
  }

  // ---------------------------- Rendering ----------------------------
  function unitPriceOf(id) {
    const c = byId.get(String(id));
    const n = Number(c?.unitPrice);
    return Number.isFinite(n) ? n : 0;
  }

  function itemTotal(p) {
    // Request Maintenance does not use pricing totals.
    if (isMaintenanceType()) return 0;
    // Withdraw mode uses negative totals (because Qty is displayed/recorded as negative).
    return unitPriceOf(p.id) * (Number(p.quantity) || 0) * qtySign();
  }

  function updateSummary() {
    const entryCount = Array.isArray(cart) ? cart.length : 0;
    const total = Array.isArray(cart) ? cart.reduce((sum, p) => sum + itemTotal(p), 0) : 0;

    if (summarySubTotalEl) summarySubTotalEl.textContent = String(entryCount);
    if (summaryTotalEl) summaryTotalEl.textContent = formatMoney(total);
  }

  function renderEmptyState() {
    const withdraw = isWithdrawType();
    const maintenance = isMaintenanceType();
    const btnLabel = withdraw ? 'Update Withdraw Cart' : 'Update Cart';
    cartItemsEl.innerHTML = window.OpsNoData?.html() || `
      <div class="cart-empty">
        <strong>Sorry, No data available</strong>
      </div>
    `;
  }

  function renderLoadingState(text = 'Loading products...') {
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = `
      <div class="cart-loading" role="status" aria-live="polite">
        <div class="cart-loading-spinner" aria-hidden="true"></div>
        <div><strong>${escapeHtml(text)}</strong></div>
      </div>
    `;
  }

  function syncUpdateCartButtonVisibility() {
    if (!updateCartBtn) return;
    const footerEl = updateCartBtn.closest('.cart-footer');
    const hideForMaintenance = false;
    updateCartBtn.hidden = false;
    updateCartBtn.setAttribute('aria-hidden', 'false');
    if (footerEl) footerEl.style.display = '';
  }

  function createCardOpenAction(url) {
    const safeUrl = safeHttpUrl(url);
    let openBtn;

    if (safeUrl) {
      openBtn = document.createElement('a');
      openBtn.href = safeUrl;
      openBtn.target = '_blank';
      openBtn.rel = 'noopener noreferrer';
      openBtn.title = safeUrl;
    } else {
      openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.disabled = true;
      openBtn.setAttribute('aria-disabled', 'true');
      openBtn.title = 'No valid product URL';
    }

    openBtn.className = 'cart-action-btn cart-action-btn--open';
    openBtn.innerHTML = `${featherIconMarkup('external-link')}<span>Open</span>`;
    return openBtn;
  }

  function createCardDeleteAction() {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'cart-action-btn cart-action-btn--delete';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', 'Delete item');
    return deleteBtn;
  }

  async function confirmCartItemDelete(item, component) {
    const itemName = String(component?.name || component?.title || item?.name || 'this cart item').trim();
    return window.OpsDeleteConfirm
      ? window.OpsDeleteConfirm.confirm({
          title: 'Delete cart item?',
          itemType: 'cart item',
          itemName,
          message: `You’re going to remove “${itemName}” from this order. This action cannot be undone.`,
        })
      : Promise.resolve(window.confirm(`Delete “${itemName}” from this order?`));
  }

  function ensureProductImageViewer() {
    let viewer = document.getElementById('productImageViewer');
    if (viewer) return viewer;

    viewer = document.createElement('div');
    viewer.id = 'productImageViewer';
    viewer.className = 'product-image-viewer';
    viewer.setAttribute('aria-hidden', 'true');
    viewer.innerHTML = `
      <button type="button" class="product-image-viewer__close" aria-label="Close image preview">×</button>
      <div class="product-image-viewer__stage" role="dialog" aria-modal="true" aria-label="Product image preview">
        <img class="product-image-viewer__image" alt="Product image preview" />
      </div>
    `;
    document.body.appendChild(viewer);

    const close = () => {
      viewer.classList.remove('is-open');
      viewer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('product-image-viewer-open');
      const image = viewer.querySelector('.product-image-viewer__image');
      if (image) image.removeAttribute('src');
    };

    viewer.querySelector('.product-image-viewer__close')?.addEventListener('click', close);
    viewer.addEventListener('click', (event) => {
      if (event.target === viewer || event.target?.classList?.contains('product-image-viewer__stage')) close();
    });
    viewer._closeProductImageViewer = close;
    return viewer;
  }

  function openProductImageViewer(url, name = 'Product image') {
    const safeUrl = safeHttpUrl(url);
    if (!safeUrl) return;

    // Keep the Shopping Cart image behaviour consistent with the Products page:
    // open the original image directly in a separate browser tab/viewer.
    const imageWindow = window.open(safeUrl, '_blank', 'noopener,noreferrer');
    if (imageWindow) imageWindow.opener = null;
  }

  function updateQtyUnitLabel(productId = componentSelectEl?.value) {
    if (!qtyUnitEl) return;
    const item = byId.get(String(productId || '')) || null;
    const unit = String(item?.unit || '').trim();
    qtyUnitEl.textContent = unit || 'Unit';
    qtyUnitEl.title = unit || 'Unit of measurement';
    qtyUnitEl.classList.toggle('is-placeholder', !unit);
  }

  function makeCardEditorTrigger(el, onOpen, label) {
    if (!el || typeof onOpen !== 'function') return;
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('click', onOpen);
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onOpen();
    });
  }

  function renderCart() {
    if (!cartItemsEl) return;

    const useProductCards = isRequestProductsType() || isWithdrawType();
    const useMaintenanceCards = isMaintenanceType();

    cartItemsEl.innerHTML = '';
    cartItemsEl.classList.toggle('cart-body--request-cards', useProductCards);
    cartItemsEl.classList.toggle('cart-body--maintenance-cards', useMaintenanceCards);
    if (cartHeadEl) {
      cartHeadEl.classList.toggle('cart-head--request-cards', useProductCards);
      cartHeadEl.classList.toggle('cart-head--maintenance-cards', useMaintenanceCards);
    }
    syncUpdateCartButtonVisibility();

    if (!Array.isArray(cart) || cart.length === 0) {
      renderEmptyState();
      updateSummary();
      if (window.feather) feather.replace();
      return;
    }

    // Ensure cart items carry the global reason (if any) so server saves always valid
    applyGlobalReason();

    cart.forEach((p, idx) => {
      const c = byId.get(String(p.id)) || null;
      const name = c?.name || 'Unknown product';
      const schoolName = schoolsById.get(String(p.schoolId || ''))?.name || '';
      const qty = normalizeQty(Number(p.quantity), MIN_QTY);
      const total = itemTotal({ id: p.id, quantity: qty });
      const displayQty = isWithdrawType() ? `-${formatQty(qty)}` : formatQty(qty);
      const displayId = String(c?.displayId || '').trim();
      const metadataTags = Array.isArray(c?.tags)
        ? c.tags
            .map((tag) => String(tag || '').trim())
            .filter(Boolean)
            .filter((tag, tagIdx, arr) => arr.findIndex((value) => normKey(value) === normKey(tag)) === tagIdx)
            .filter((tag) => {
              const key = normKey(tag);
              return key !== REQUEST_PRODUCTS_KEY && key !== WITHDRAW_PRODUCTS_KEY && key !== REQUEST_MAINTENANCE_KEY;
            })
        : [];
      const secondaryMeta = isMaintenanceType()
        ? (schoolName ? `School: ${schoolName}` : '')
        : (useProductCards && metadataTags.length ? metadataTags.slice(0, 2).join(' • ') : '');

      const row = document.createElement('div');
      row.className = 'cart-row';
      row.dataset.id = String(p.id);

      // Product cell
      const productCell = document.createElement('div');
      productCell.className = 'cart-product cart-product-cell';

      const thumb = document.createElement('div');
      thumb.className = 'cart-thumb';

      if (c?.imageUrl) {
        const img = document.createElement('img');
        img.alt = name;
        img.loading = 'lazy';
        img.src = c.imageUrl;
        thumb.classList.add('has-image');
        thumb.setAttribute('role', 'button');
        thumb.setAttribute('tabindex', '0');
        thumb.setAttribute('aria-label', `Open ${name} image full screen`);
        thumb.title = 'Open image full screen';
        const openImage = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openProductImageViewer(c.imageUrl, name);
        };
        thumb.addEventListener('click', openImage);
        thumb.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          openImage(event);
        });
        thumb.appendChild(img);
      } else {
        // Show sequential number (1,2,3,...) instead of first letter
        thumb.textContent = String(idx + 1);
      }

      const meta = document.createElement('div');
      meta.className = 'prod-meta';
      let metaHtml = `
        <div class="prod-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      `;
      if (secondaryMeta) {
        metaHtml += `<div class="prod-submeta" title="${escapeHtml(secondaryMeta)}">${escapeHtml(secondaryMeta)}</div>`;
      }
      if ((useProductCards || useMaintenanceCards) && displayId) {
        metaHtml += `<div class="prod-submeta prod-submeta--part">Part No: ${escapeHtml(displayId)}</div>`;
      }
      meta.innerHTML = metaHtml;

      productCell.appendChild(thumb);
      productCell.appendChild(meta);

      if (useMaintenanceCards) {
        row.classList.add('cart-row--maintenance-card');
        productCell.classList.add('cart-card-main');

        const issue = String(p.issueDescription || '').trim();
        const issueCard = document.createElement('div');
        issueCard.className = 'cart-card-note cart-card-note--editable';
        issueCard.innerHTML = `
          <div class="cart-card-note-label">Issue Description</div>
          <div class="cart-card-note-value${issue ? '' : ' is-empty'}">${escapeHtml(issue || '—')}</div>
        `;

        const actions = document.createElement('div');
        actions.className = 'cart-card-actions';

        const openBtn = createCardOpenAction(c?.url);
        const deleteBtn = createCardDeleteAction();

        actions.appendChild(openBtn);
        actions.appendChild(deleteBtn);

        const openEditor = () => openModalForEdit(p.id);

        deleteBtn.addEventListener('click', async () => { if (await confirmCartItemDelete(p, c)) removeItem(p.id); });
        makeCardEditorTrigger(productCell, openEditor, `Edit ${name}`);
        makeCardEditorTrigger(issueCard, openEditor, `Edit issue description for ${name}`);

        row.appendChild(productCell);
        row.appendChild(issueCard);
        row.appendChild(actions);

        cartItemsEl.appendChild(row);
        return;
      }

      if (useProductCards) {
        row.classList.add('cart-row--request-card');
        productCell.classList.add('cart-card-main');

        // Quantity metric
        const qtyCtl = document.createElement('div');
        qtyCtl.className = 'qty-control';

        const decBtn = document.createElement('button');
        decBtn.className = 'qty-btn';
        decBtn.type = 'button';
        decBtn.textContent = '−';
        decBtn.setAttribute('aria-label', 'Decrease quantity');
        decBtn.setAttribute('data-no-auto-busy', '');

        const qtyVal = document.createElement('div');
        qtyVal.className = 'qty-value';
        qtyVal.textContent = displayQty;

        const incBtn = document.createElement('button');
        incBtn.className = 'qty-btn';
        incBtn.type = 'button';
        incBtn.textContent = '+';
        incBtn.setAttribute('aria-label', 'Increase quantity');
        incBtn.setAttribute('data-no-auto-busy', '');

        qtyCtl.appendChild(decBtn);
        qtyCtl.appendChild(qtyVal);
        qtyCtl.appendChild(incBtn);

        const metrics = document.createElement('div');
        metrics.className = 'cart-card-metrics';

        const qtyMetric = document.createElement('div');
        qtyMetric.className = 'cart-card-metric cart-card-metric--qty';
        qtyMetric.innerHTML = '<div class="cart-card-metric-label">Qty</div>';
        qtyMetric.appendChild(qtyCtl);

        const unitMetric = document.createElement('div');
        unitMetric.className = 'cart-card-metric cart-card-metric--unit';
        unitMetric.innerHTML = `
          <div class="cart-card-metric-label">Unit</div>
          <div class="cart-card-metric-value">${escapeHtml(formatMoney(c?.unitPrice))}</div>
        `;

        const totalMetric = document.createElement('div');
        totalMetric.className = 'cart-card-metric cart-card-metric--total';
        totalMetric.innerHTML = `
          <div class="cart-card-metric-label">Total</div>
          <div class="cart-card-metric-value">${escapeHtml(formatMoney(total))}</div>
        `;

        metrics.appendChild(qtyMetric);
        metrics.appendChild(unitMetric);
        metrics.appendChild(totalMetric);

        const actions = document.createElement('div');
        actions.className = 'cart-card-actions';

        const openBtn = createCardOpenAction(c?.url);
        const deleteBtn = createCardDeleteAction();

        actions.appendChild(openBtn);
        actions.appendChild(deleteBtn);

        const openEditor = () => openModalForEdit(p.id);

        incBtn.addEventListener('click', () => changeQty(p.id, +1));
        decBtn.addEventListener('click', () => changeQty(p.id, -1));
        deleteBtn.addEventListener('click', async () => { if (await confirmCartItemDelete(p, c)) removeItem(p.id); });
        makeCardEditorTrigger(productCell, openEditor, `Edit ${name}`);

        row.appendChild(productCell);
        row.appendChild(metrics);
        row.appendChild(actions);

        cartItemsEl.appendChild(row);
        return;
      }

      // URL cell
      const urlCell = document.createElement('div');
      urlCell.className = 'cart-url-cell';
      const safeUrl = safeHttpUrl(c?.url);
      if (safeUrl) {
        const linkBtn = document.createElement('a');
        linkBtn.className = 'url-btn';
        linkBtn.href = safeUrl;
        linkBtn.target = '_blank';
        linkBtn.rel = 'noopener noreferrer';
        linkBtn.title = safeUrl;
        linkBtn.innerHTML = '<i data-feather="external-link"></i><span>Open</span>';
        urlCell.appendChild(linkBtn);
      } else {
        const empty = document.createElement('span');
        empty.className = 'url-empty';
        empty.textContent = '—';
        urlCell.appendChild(empty);
      }

      // Quantity cell
      const qtyCell = document.createElement('div');
      qtyCell.className = 'cart-qty-cell';
      const qtyCtl = document.createElement('div');
      qtyCtl.className = 'qty-control';

      const decBtn = document.createElement('button');
      decBtn.className = 'qty-btn';
      decBtn.type = 'button';
      decBtn.textContent = '−';
      decBtn.setAttribute('aria-label', 'Decrease quantity');
      decBtn.setAttribute('data-no-auto-busy', '');

      const qtyVal = document.createElement('div');
      qtyVal.className = 'qty-value';
      // Withdraw mode: show the qty as a negative number in the UI
      qtyVal.textContent = displayQty;

      const incBtn = document.createElement('button');
      incBtn.className = 'qty-btn';
      incBtn.type = 'button';
      incBtn.textContent = '+';
      incBtn.setAttribute('aria-label', 'Increase quantity');
      incBtn.setAttribute('data-no-auto-busy', '');

      qtyCtl.appendChild(decBtn);
      qtyCtl.appendChild(qtyVal);
      qtyCtl.appendChild(incBtn);
      qtyCell.appendChild(qtyCtl);

      // Total cell
      const totalCell = document.createElement('div');
      totalCell.className = 'money cart-total-cell';
      totalCell.textContent = formatMoney(total);

      // Action cell
      const actionCell = document.createElement('div');
      actionCell.className = 'cart-action-cell';
      const trashBtn = document.createElement('button');
      trashBtn.className = 'trash-btn';
      trashBtn.type = 'button';
      trashBtn.setAttribute('aria-label', 'Remove item');
      trashBtn.innerHTML = '<i data-feather="trash-2"></i>';
      actionCell.appendChild(trashBtn);

      // bind events
      incBtn.addEventListener('click', () => changeQty(p.id, +1));
      decBtn.addEventListener('click', () => changeQty(p.id, -1));
      trashBtn.addEventListener('click', async () => { if (await confirmCartItemDelete(p, c)) removeItem(p.id); });

      // click product to edit
      productCell.style.cursor = 'pointer';
      productCell.addEventListener('click', () => openModalForEdit(p.id));

      row.appendChild(productCell);
      row.appendChild(urlCell);
      row.appendChild(qtyCell);
      row.appendChild(totalCell);
      row.appendChild(actionCell);

      cartItemsEl.appendChild(row);
    });

    updateSummary();
    if (window.feather) feather.replace();
  }

  // ---------------------------- Cart mutations ----------------------------
  function changeQty(id, delta) {
    const idx = cart.findIndex((p) => String(p.id) === String(id));
    if (idx === -1) return;

    const cur = normalizeQty(Number(cart[idx].quantity), MIN_QTY);
    const next = normalizeQty(cur + Number(delta || 0), 0);

    if (next <= 0) {
      removeItem(id);
      return;
    }

    cart[idx].quantity = next;
    renderCart();
    scheduleSaveDraft();
  }

  function removeItem(id) {
    cart = cart.filter((p) => String(p.id) !== String(id));
    renderCart();
    scheduleSaveDraft();
  }

  function upsertItem({ id, quantity, issueDescription, schoolId }) {
    const cleanId = String(id || '');
    const maintenance = isMaintenanceType();
    const cleanQty = maintenance ? 1 : normalizeQty(Number(quantity), NaN);
    const issue = String(issueDescription || '').trim();
    const idx = cart.findIndex((p) => String(p.id) === cleanId);
    const cleanSchoolId = maintenance ? String(schoolId || cart[idx]?.schoolId || '').trim() : '';

    const r = maintenance ? deriveMaintenanceReason(issue) : String(globalReason || '').trim();

    if (!cleanId) {
      toast('error', 'Missing field', 'Please choose a product.');
      return false;
    }

    if (!maintenance) {
      if (!Number.isFinite(cleanQty) || cleanQty <= 0) {
        toast('error', 'Missing field', 'Please enter a valid quantity.');
        return false;
      }
    } else {
      if (!issue) {
        toast('error', 'Missing field', 'Please describe the issue.');
        try { issueDescInputEl?.focus?.(); } catch {}
        return false;
      }
    }

    if (idx >= 0) {
      cart[idx].quantity = cleanQty;
      // Only overwrite the stored reason if the user already entered one.
      if (r) cart[idx].reason = r;
      if (maintenance) {
        cart[idx].issueDescription = issue;
        cart[idx].schoolId = cleanSchoolId;
      }
    } else {
      cart.push({
        id: cleanId,
        quantity: cleanQty,
        reason: r,
        issueDescription: maintenance ? issue : '',
        schoolId: maintenance ? cleanSchoolId : '',
        expectedSparePartId: '',
      });
    }

    return true;
  }

  // ---------------------------- Modal ----------------------------
  function setModalOpen(open) {
    if (!modalEl) return;
    modalEl.style.display = open ? 'flex' : 'none';
    modalEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function closeModal() {
    editingId = null;
    setModalOpen(false);
  }

  function setModalLoading(loading, text = 'Loading products...') {
    const isOn = !!loading;
    try {
      if (qtyInputEl) qtyInputEl.disabled = isOn;
      if (issueDescInputEl) issueDescInputEl.disabled = isOn;
      if (addToCartBtn) addToCartBtn.disabled = isOn;
      if (schoolSelectEl) schoolSelectEl.disabled = isOn;
      if (expectedSpareSelectEl) expectedSpareSelectEl.disabled = isOn;

      [componentSelectEl, schoolSelectEl, expectedSpareSelectEl].forEach((selectEl) => {
        const inst = getChoicesInstance(selectEl);
        if (inst && typeof inst.disable === 'function') {
          if (isOn) inst.disable();
          else inst.enable();
        }
      });

      if (isOn && !getChoicesInstance(componentSelectEl)) {
        setNativeSelectLoading(componentSelectEl, text);
      }
      if (isMaintenanceType() && isOn) {
        if (expectedSpareSelectEl && !getChoicesInstance(expectedSpareSelectEl)) {
          setNativeSelectLoading(expectedSpareSelectEl, 'Loading spare parts...');
        }
      }
    } catch {}
  }

  function openModalForAdd() {
    editingId = null;
    if (addToCartBtn) addToCartBtn.textContent = 'Add';

    const maintenance = isMaintenanceType();
    if (qtyInputEl) qtyInputEl.value = '1';
    updateQtyUnitLabel('');
    if (issueDescInputEl) issueDescInputEl.value = '';
    clearSelectValue(schoolSelectEl);
    clearSelectValue(expectedSpareSelectEl);

    // Open the modal immediately so "Update Cart" always shows the small window.
    setModalOpen(true);

    const componentReady = componentsLoaded && Array.isArray(components) && components.length;
    const schoolReady = true;

    // If everything is already ready, just clear the selection and focus.
    if (componentReady && schoolReady) {
      refreshModalChoices();
      setModalLoading(false);

      clearSelectValue(componentSelectEl);
      updateQtyUnitLabel('');
      if (maintenance) {
        clearSelectValue(schoolSelectEl);
        clearSelectValue(expectedSpareSelectEl);
      }

      window.setTimeout(() => {
        try {
          const focusEl = getSelectFocusElement(componentSelectEl);
          focusEl?.focus?.();
        } catch {}
      }, 50);

      return;
    }

    // Otherwise show loading state and initialize once ready.
    setModalLoading(true);

    const readyPromise = maintenance
      ? ensureMaintenanceModalReady()
      : ensureComponentsReady();

    readyPromise.then((ok) => {
      if (!ok) {
        toast('error', 'Error', maintenance ? 'Failed to load products list. Please reload the page.' : 'Failed to load products list. Please reload the page.');
        closeModal();
        return;
      }

      refreshModalChoices();
      setModalLoading(false);

      // Clear selection for "Add" mode
      clearSelectValue(componentSelectEl);
      if (maintenance) {
        clearSelectValue(schoolSelectEl);
        clearSelectValue(expectedSpareSelectEl);
      }

      window.setTimeout(() => {
        try {
          const focusEl = getSelectFocusElement(componentSelectEl);
          focusEl?.focus?.();
        } catch {}
      }, 50);
    });
  }

  function openModalForEdit(id) {
    const item = cart.find((p) => String(p.id) === String(id));
    if (!item) {
      openModalForAdd();
      return;
    }

    editingId = String(item.id);
    if (addToCartBtn) addToCartBtn.textContent = 'Update';
    if (qtyInputEl) qtyInputEl.value = String(normalizeQty(Number(item.quantity), 1));
    updateQtyUnitLabel(item.id);
    if (issueDescInputEl) issueDescInputEl.value = String(item.issueDescription || '').trim();
    clearSelectValue(schoolSelectEl);
    clearSelectValue(expectedSpareSelectEl);

    // Open first, then ensure components list is ready.
    setModalOpen(true);
    const maintenance = isMaintenanceType();

    const applySelection = () => {
      setSelectValue(componentSelectEl, String(item.id));
      updateQtyUnitLabel(item.id);
      if (maintenance) {
        setSelectValue(schoolSelectEl, String(item.schoolId || ''));
        setSelectValue(expectedSpareSelectEl, String(item.expectedSparePartId || ''));
      }
    };

    const componentReady = componentsLoaded && Array.isArray(components) && components.length;
    const schoolReady = true;

    if (componentReady && schoolReady) {
      refreshModalChoices();
      setModalLoading(false);
      applySelection();
      return;
    }

    setModalLoading(true);
    const readyPromise = maintenance
      ? ensureMaintenanceModalReady()
      : ensureComponentsReady();

    readyPromise.then((ok) => {
      if (!ok) {
        toast('error', 'Error', maintenance ? 'Failed to load products list. Please reload the page.' : 'Failed to load products list. Please reload the page.');
        closeModal();
        return;
      }
      refreshModalChoices();
      setModalLoading(false);
      applySelection();
    });
  }

  function getChoicesInstance(selectEl) {
    if (!selectEl) return null;
    if (selectEl === componentSelectEl) return componentChoicesInst;
    if (selectEl === schoolSelectEl) return schoolChoicesInst;
    if (selectEl === expectedSpareSelectEl) return expectedSpareChoicesInst;
    return null;
  }

  function setChoicesInstance(selectEl, inst) {
    if (!selectEl) return;
    if (selectEl === componentSelectEl) componentChoicesInst = inst;
    else if (selectEl === schoolSelectEl) schoolChoicesInst = inst;
    else if (selectEl === expectedSpareSelectEl) expectedSpareChoicesInst = inst;
  }

  function destroyChoicesInstance(selectEl) {
    const inst = getChoicesInstance(selectEl);
    if (!inst) return;
    try { inst.destroy(); } catch {}
    setChoicesInstance(selectEl, null);
  }

  function setNativeSelectLoading(selectEl, text) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = String(text || 'Loading...');
    selectEl.appendChild(opt);
  }

  function setSelectOptions(selectEl, items, placeholderText, emptyText) {
    if (!selectEl) return;

    selectEl.innerHTML = '';
    const list = Array.isArray(items) ? items : [];

    const ph = document.createElement('option');
    ph.value = '';
    ph.disabled = true;
    ph.selected = true;
    ph.textContent = list.length ? placeholderText : emptyText;
    selectEl.appendChild(ph);

    for (const item of list) {
      const opt = document.createElement('option');
      opt.value = String(item?.id || '');
      opt.textContent = String(item?.name || '');
      selectEl.appendChild(opt);
    }
  }

  function productChoiceSecondaryText(item) {
    const displayId = String(item?.displayId || '').trim();
    const tags = Array.isArray(item?.tags)
      ? item.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : [];
    if (displayId && tags.length) return `${displayId} • ${tags[0]}`;
    return displayId || tags[0] || '';
  }

  function decorateProductChoices(selectEl, items) {
    try {
      const root = selectEl?.closest('.choices');
      if (!root) return;

      const itemMap = new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.id || ''), item]));
      const choiceEls = root.querySelectorAll('.choices__list--dropdown .choices__item--choice[data-value]');

      choiceEls.forEach((choiceEl) => {
        const value = String(choiceEl.dataset.value || '');
        const item = itemMap.get(value);
        if (!item || choiceEl.dataset.productCardReady === '1') return;

        choiceEl.dataset.productCardReady = '1';
        choiceEl.classList.add('product-choice');
        choiceEl.textContent = '';

        const card = document.createElement('div');
        card.className = 'product-choice-card';

        const info = document.createElement('div');
        info.className = 'product-choice-info';

        const name = document.createElement('div');
        name.className = 'product-choice-name';
        name.textContent = String(item?.name || 'Untitled product');
        name.title = name.textContent;
        info.appendChild(name);

        const secondaryText = productChoiceSecondaryText(item);
        if (secondaryText) {
          const meta = document.createElement('div');
          meta.className = 'product-choice-meta';
          meta.textContent = secondaryText;
          meta.title = secondaryText;
          info.appendChild(meta);
        }

        const imageUrl = String(item?.imageUrl || '').trim();
        let media;
        if (imageUrl) {
          media = document.createElement('button');
          media.type = 'button';
          media.className = 'product-choice-media';
          media.dataset.imageUrl = imageUrl;
          media.setAttribute('aria-label', `Open ${name.textContent} image`);
          media.title = 'Open product image';

          const img = document.createElement('img');
          img.src = imageUrl;
          img.alt = name.textContent;
          img.loading = 'lazy';
          img.addEventListener('error', () => {
            media.classList.add('is-fallback');
            img.remove();
          }, { once: true });
          media.appendChild(img);
        } else {
          media = document.createElement('span');
          media.className = 'product-choice-media is-fallback';
          media.setAttribute('aria-hidden', 'true');
        }

        const fallback = document.createElement('span');
        fallback.className = 'product-choice-media-fallback';
        fallback.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>';
        media.appendChild(fallback);

        card.appendChild(info);
        card.appendChild(media);
        choiceEl.appendChild(card);
      });

      if (root.dataset.productChoiceEvents !== '1') {
        root.dataset.productChoiceEvents = '1';
        let lastImageOpenAt = 0;

        const stopImageSelection = (event) => {
          const media = event.target.closest('.product-choice-media[data-image-url]');
          if (!media || !root.contains(media)) return;

          // Choices.js handles selection on pointer/mouse down. Intercept that exact
          // gesture so tapping the image opens it instead of selecting the product.
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

          const now = Date.now();
          const isPrimaryOpenGesture =
            event.type === 'pointerdown' ||
            (typeof window.PointerEvent === 'undefined' && (event.type === 'touchstart' || event.type === 'mousedown'));
          const isClickFallback = event.type === 'click' && now - lastImageOpenAt > 700;

          if (!isPrimaryOpenGesture && !isClickFallback) return;

          const url = String(media.dataset.imageUrl || '').trim();
          if (!url) return;
          lastImageOpenAt = now;
          openProductImageViewer(url, media.getAttribute('aria-label') || 'Product image');
        };

        root.addEventListener('pointerdown', stopImageSelection, true);
        root.addEventListener('mousedown', stopImageSelection, true);
        root.addEventListener('touchstart', stopImageSelection, { capture: true, passive: false });
        root.addEventListener('click', stopImageSelection, true);
      }
    } catch (error) {
      console.warn('Failed to decorate product choices:', error);
    }
  }

  function setupProductChoiceCards(selectEl, items) {
    if (!selectEl) return;
    if (selectEl._productChoiceShowHandler) {
      selectEl.removeEventListener('showDropdown', selectEl._productChoiceShowHandler);
    }
    const decorate = () => window.setTimeout(() => decorateProductChoices(selectEl, items), 0);
    selectEl._productChoiceShowHandler = decorate;
    decorate();
    selectEl.addEventListener('showDropdown', decorate);
  }

  function initChoicesSelect(selectEl, { items, placeholderText, emptyText, productCards = false }) {
    if (!selectEl) return null;

    setSelectOptions(selectEl, items, placeholderText, emptyText);
    destroyChoicesInstance(selectEl);

    try {
      const inst = new Choices(selectEl, {
        searchEnabled: true,
        searchPlaceholderValue: 'Search...',
        placeholder: true,
        placeholderValue: placeholderText,
        itemSelectText: '',
        shouldSort: true,
        allowHTML: false,
        position: 'bottom',
        searchResultLimit: 500,
      });

      setChoicesInstance(selectEl, inst);
      setupChoicesSearchClearButton(selectEl);
      if (productCards) setupProductChoiceCards(selectEl, items);
      return inst;
    } catch (e) {
      console.warn('Choices init failed:', e);
      setChoicesInstance(selectEl, null);
      return null;
    }
  }

  function initComponentChoices() {
    return initChoicesSelect(componentSelectEl, {
      items: getComponentsForSelect(),
      placeholderText: 'Select product...',
      emptyText: 'No products available',
      productCards: true,
    });
  }

  function initSchoolChoices() {
    return initChoicesSelect(schoolSelectEl, {
      items: schools,
      placeholderText: 'Select school...',
      emptyText: 'No schools available',
    });
  }

  function initExpectedSpareChoices() {
    return initChoicesSelect(expectedSpareSelectEl, {
      items: getSparePartsForSelect(),
      placeholderText: 'Select spare part...',
      emptyText: 'No spare parts available',
      productCards: true,
    });
  }

  function refreshModalChoices() {
    initComponentChoices();
    if (isMaintenanceType()) {
      initExpectedSpareChoices();
    }
  }

  async function ensureMaintenanceModalReady() {
    const componentsOk = await ensureComponentsReady();
    if (!componentsOk) return false;
    initExpectedSpareChoices();
    return true;
  }

  function getSelectFocusElement(selectEl) {
    try {
      return selectEl?.closest('.choices')?.querySelector('.choices__inner') || selectEl;
    } catch {
      return selectEl;
    }
  }

  function clearSelectValue(selectEl) {
    if (!selectEl) return;
    const inst = getChoicesInstance(selectEl);
    if (inst) {
      try { inst.removeActiveItems(); } catch {}
      return;
    }
    try { selectEl.value = ''; } catch {}
  }

  function setSelectValue(selectEl, value) {
    if (!selectEl) return;
    const v = String(value || '').trim();
    if (!v) {
      clearSelectValue(selectEl);
      return;
    }

    const inst = getChoicesInstance(selectEl);
    if (inst) {
      try {
        inst.removeActiveItems();
        inst.setChoiceByValue(v);
        return;
      } catch {}
    }

    try { selectEl.value = v; } catch {}
  }

  function setupChoicesSearchClearButton(selectEl) {
    if (!selectEl) return;

    if (selectEl._choicesShowHandler) {
      selectEl.removeEventListener('showDropdown', selectEl._choicesShowHandler);
    }
    if (selectEl._choicesHideHandler) {
      selectEl.removeEventListener('hideDropdown', selectEl._choicesHideHandler);
    }

    selectEl._choicesShowHandler = () => window.setTimeout(() => ensureChoicesSearchClearButton(selectEl), 0);
    selectEl._choicesHideHandler = () => {
      try {
        const root = selectEl.closest('.choices');
        const dropdown = root?.querySelector('.choices__list--dropdown');
        const btn = dropdown?.querySelector('.choices-search-clear');
        if (btn) btn.style.display = 'none';
      } catch {}
    };

    selectEl.addEventListener('showDropdown', selectEl._choicesShowHandler);
    selectEl.addEventListener('hideDropdown', selectEl._choicesHideHandler);
    ensureChoicesSearchClearButton(selectEl);
  }

  function ensureChoicesSearchClearButton(selectEl) {
    try {
      const root = selectEl?.closest('.choices');
      if (!root) return;

      const dropdown = root.querySelector('.choices__list--dropdown');
      if (!dropdown) return;

      const input = dropdown.querySelector('input.choices__input');
      if (!input) return;

      let btn = dropdown.querySelector('.choices-search-clear');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choices-search-clear';
        btn.setAttribute('aria-label', 'Clear search');
        btn.innerHTML = '<span aria-hidden="true">x</span>';
        dropdown.appendChild(btn);
      }

      const update = () => {
        const has = Boolean(String(input.value || '').trim());
        btn.style.display = has ? 'flex' : 'none';
      };

      if (!btn.dataset.bound) {
        btn.dataset.bound = '1';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('keyup', { bubbles: true }));
          update();
          try { input.focus(); } catch {}
        });

        input.addEventListener('input', update);
        input.addEventListener('keyup', update);
      }

      update();
    } catch {}
  }

  function getPasswordValue() {
    return String(passwordInput?.value || '').trim();
  }

  // ---------------------------- Checkout ----------------------------
  async function checkout() {
    const withdraw = isWithdrawType();
    const maintenance = isMaintenanceType();
    if (!Array.isArray(cart) || cart.length === 0) {
      toast(
        'error',
        withdraw ? 'Empty withdrawal' : 'Empty cart',
        withdraw
          ? 'Please add at least one component to withdraw.'
          : maintenance
            ? 'Please add at least one product.'
            : 'Please add at least one product.',
      );
      return;
    }

    if (!maintenance) {
      syncReasonFromInput();

      if (!String(globalReason || '').trim()) {
        toast('error', 'Reason required', withdraw ? 'Please enter the withdrawal reason.' : 'Please enter the order reason.');
        try { reasonInput?.focus?.(); } catch {}
        return;
      }
    } else {
      // Maintenance requires Issue Description per item
      const missing = cart.find((p) => !String(p.issueDescription || '').trim());
      if (missing) {
        toast('error', 'Issue Description required', 'Please add an Issue Description for every product in the cart.');
        try { openModalForEdit(missing.id); } catch {}
        return;
      }
    }

    const password = getPasswordValue();
    if (!password) {
      toast(
        'error',
        'Password required',
        withdraw ? 'Please enter your password before confirming the withdrawal.' : 'Please enter your password before checkout.',
      );
      try { passwordInput?.focus?.(); } catch {}
      return;
    }

    applyGlobalReason();

    if (checkoutBtn && checkoutBtn.disabled) return;
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.setAttribute('aria-busy', 'true');
    }

    showSaving(
      isEditMode
        ? 'Saving changes...'
        : withdraw
          ? 'Submitting withdrawal...'
          : 'Submitting order...'
    );

    try {
      await persistDraft({ silent: true });

      const res = await fetch('/api/submit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: cart, password, orderType: selectedOrderType || null }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (res.status === 401) {
          toast('error', 'incorrect password', data?.message || 'incorrect password');
          try { passwordInput?.focus?.(); passwordInput?.select?.(); } catch {}
          return;
        }
        throw new Error(data?.message || 'Failed to submit order.');
      }

      editCheckoutCommitted = true;
      clearAllEditTransfer();

      toast(
        'success',
        isEditMode
          ? (withdraw ? 'Withdrawal Updated!' : 'Order Updated!')
          : (withdraw ? 'Withdrawal Submitted!' : 'Order Submitted!'),
        isEditMode
          ? (withdraw ? 'Your withdrawal has been updated successfully.' : 'Your order has been updated successfully.')
          : (withdraw ? 'Your withdrawal has been created successfully.' : 'Your order has been created successfully.'),
      );

      cart = [];
      renderCart();
      if (passwordInput) passwordInput.value = '';

      setTimeout(() => {
        window.location.href = '/orders';
      }, 900);
    } catch (err) {
      console.error('checkout submit error:', err);
      toast('error', 'Submission Failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      hideSaving();
      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.removeAttribute('aria-busy');
      }
    }
  }

  // ---------------------------- Bindings ----------------------------
  function bindEvents() {
    // Reason field (per order)
    reasonInput?.addEventListener('input', () => {
      globalReason = String(reasonInput.value || '').trim();
      applyGlobalReason();
      updateReady();
      if (readyToUse && cart.length) scheduleSaveDraft();
    });

    updateCartBtn?.addEventListener('click', () => {
      syncReasonFromInput();
      openModalForAdd();
    });

    modalCloseBtn?.addEventListener('click', closeModal);

    componentSelectEl?.addEventListener('change', () => updateQtyUnitLabel(componentSelectEl.value));

    // Close modal when clicking backdrop
    modalEl?.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });

    // Esc closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const viewer = document.getElementById('productImageViewer');
      if (viewer?.classList.contains('is-open')) {
        viewer._closeProductImageViewer?.();
        return;
      }
      if (modalEl && modalEl.style.display === 'flex') closeModal();
    });

    addToCartBtn?.addEventListener('click', async () => {
      syncReasonFromInput();

      const id = componentSelectEl?.value;
      const maintenance = isMaintenanceType();
      const qty = maintenance ? 1 : Number(qtyInputEl?.value);
      const schoolId = maintenance ? String(schoolSelectEl?.value || '').trim() : '';
      const issueDescription = maintenance
        ? String(issueDescInputEl?.value || '').trim()
        : '';

      // If we opened the modal from an existing item and the user changed the component,
      // remove the old item first to avoid duplicates.
      if (editingId && String(editingId) !== String(id)) {
        cart = cart.filter((p) => String(p.id) !== String(editingId));
      }

      const ok = upsertItem({
        id,
        quantity: qty,
        issueDescription,
        schoolId,
      });
      if (!ok) return;

      closeModal();
      renderCart();

      const saved = await persistDraft({ silent: true });
      if (!saved) toast('error', 'Error', 'Failed to save cart.');
    });

    checkoutBtn?.addEventListener('click', checkout);

    if (isEditMode) {
      cartBackBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        goToCurrentOrdersFromEdit();
      });
      window.addEventListener('pagehide', cancelEditModeOnLeave);
      window.addEventListener('beforeunload', cancelEditModeOnLeave);
    }

    // Pressing Enter in password triggers checkout
    passwordInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkout();
      }
    });
  }

  // ---------------------------- Init ----------------------------
  async function initCart() {
    // Disable browser autofill on Reason + Password (user should type)
    hardDisableAutofill(reasonInput, { clearNow: false });
    hardDisableAutofill(passwordInput, { clearNow: true });

    bindEvents();

    // disable until reason+components loaded
    setReady(false);

    const { componentsPromise: cp, schoolsPromise: sp, draftPromise: dp } = startPreload();

    // Show loading state instead of "Your cart is empty" until data is ready
    renderLoadingState();

    if (isEditMode) {
      showSaving('Loading order...');

      let draftState = { cart: [] };
      try { draftState = await dp; } catch {}
      cart = normalizeDraftItems(draftState?.cart);
      syncDraftUi();

      try { await cp; } catch {}
      if (isMaintenanceType()) {
        try { await sp; } catch {}
      }
      hideSaving();

      const ok = isMaintenanceType()
        ? await ensureMaintenanceModalReady()
        : await ensureComponentsReady();
      if (!ok) {
        toast('error', 'Error', isMaintenanceType() ? 'Failed to load products list. Please reload the page.' : 'Failed to load products list. Please reload the page.');
        return;
      }

      renderCart();
      await persistDraft({ silent: true });
      return;
    }

    // New order
    // Wait for both draft+components, then init select.
    let draftState = { cart: [] };
    try { draftState = await dp; } catch {}
    cart = normalizeDraftItems(draftState?.cart);
    syncDraftUi();

    try { await cp; } catch {}
    if (isMaintenanceType()) {
      try { await sp; } catch {}
    }

    const ok = isMaintenanceType()
      ? await ensureMaintenanceModalReady()
      : await ensureComponentsReady();
    if (!ok) {
      toast('error', 'Error', isMaintenanceType() ? 'Failed to load products list. Please reload the page.' : 'Failed to load products list. Please reload the page.');
      return;
    }

    renderCart();

    // If we already have items+reason, keep server draft consistent
    if (readyToUse && cart.length) await persistDraft({ silent: true });
  }

  // Boot the Order Type flow (it will lazy-start the cart when needed)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderTypeFlow, { once: true });
  } else {
    initOrderTypeFlow();
  }

  // ---------------------------- Quantity helpers ----------------------------
  function normalizeQty(n, fallback = NaN) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    const rounded = Math.round(x * 1000) / 1000;
    if (rounded <= 0) return 0;
    if (rounded < MIN_QTY) return MIN_QTY;
    return rounded;
  }

  function formatQty(n) {
    const x = normalizeQty(n, MIN_QTY);
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
    return x.toFixed(3).replace(/\.0+$/,'').replace(/(\.\d*[1-9])0+$/,'$1');
  }
})();

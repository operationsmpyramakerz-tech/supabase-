// public/js/proposals.js
(function () {
  'use strict';

  const state = {
    tab: 'proposals',
    products: [],
    proposals: [],
    kits: [],
    activeProposal: null,
    activeKit: null,
    proposalItems: [],
    kitItems: [],
    loadingProposals: true,
    loadingKits: true,
    loadingDetail: false,
    saving: false,
    proposalEditMode: false,
    kitEditMode: false,
    proposalAdminPassword: '',
    kitAdminPassword: '',
    pendingOrderProposalId: '',
    teamMembers: [],
    proposalNameMode: 'create',
    kitNameMode: 'create',
    copyProposalTarget: null,
    copyKitTarget: null,
  };

  const els = {};
  const $ = (id) => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(type, title, message) {
    try {
      if (window.UI && typeof window.UI.toast === 'function') return window.UI.toast(type, title, message);
    } catch {}
    if (message) console.log(`${title}: ${message}`);
  }

  function hydrateIcons(root = document) {
    try {
      if (window.feather && root && typeof root.querySelector === 'function' && root.querySelector('[data-feather]')) window.feather.replace();
    } catch {}
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    try { return n.toLocaleString('en-GB'); } catch { return String(n); }
  }

  function numericInputValue(el, fallback = 1) {
    const raw = String(el?.value || '').trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(1, Math.round(n));
  }

  function currentUsername() {
    try { return String(localStorage.getItem('username') || window.__opsUserInfo?.name || '').trim(); } catch { return ''; }
  }

  function isItemOwner(item = {}) {
    const me = currentUsername().toLowerCase();
    const by = String(item?.createdBy || item?.created_by || '').trim().toLowerCase();
    return !!me && !!by && me === by;
  }

  function canEditItem(item = {}) {
    return !!item?.canEdit || isItemOwner(item);
  }

  function adminPasswordPrompt(message) {
    const value = window.prompt(message || 'Enter Admin password');
    return value === null ? null : String(value || '').trim();
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Request failed.');
    return data;
  }

  function getProductsList() {
    const products = Array.isArray(state.products) ? state.products.slice() : [];
    products.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    return products.map((product) => ({
      value: String(product?.id || '').trim(),
      label: `${product?.name || 'Untitled Product'}${product?.displayId ? ` · ${product.displayId}` : ''}`,
      meta: product?.displayId ? String(product.displayId) : '',
    })).filter((item) => item.value);
  }

  function getKitsList() {
    const kits = Array.isArray(state.kits) ? state.kits.slice() : [];
    kits.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    return kits.map((kit) => ({
      value: String(kit?.id || '').trim(),
      label: `${kit?.name || 'Untitled Kit'} · ${formatNumber(kit?.itemsCount || 0)} components`,
      meta: `${formatNumber(kit?.itemsCount || 0)} component${Number(kit?.itemsCount || 0) === 1 ? '' : 's'}`,
    })).filter((item) => item.value);
  }

  function searchableSelectHTML({ id, label, placeholder, items, emptyText }) {
    const safeId = escapeHTML(id);
    const list = Array.isArray(items) ? items : [];
    const options = list.length ? list.map((item) => `
      <button type="button" class="proposal-search-select__option" data-action="choose-search-option" data-value="${escapeHTML(item.value)}" data-label="${escapeHTML(item.label)}">
        <span>${escapeHTML(item.label)}</span>
        ${item.meta ? `<small>${escapeHTML(item.meta)}</small>` : ''}
      </button>
    `).join('') : `<div class="proposal-search-select__empty">${escapeHTML(emptyText || 'No options available')}</div>`;

    return `
      <label class="products-field proposals-search-field">
        <span>${escapeHTML(label)}</span>
        <div class="proposal-search-select" data-select-root data-target="${safeId}">
          <input type="hidden" id="${safeId}" value="" />
          <button type="button" class="proposal-search-select__button" data-action="toggle-search-select" aria-haspopup="listbox" aria-expanded="false">
            <span class="proposal-search-select__value">${escapeHTML(placeholder)}</span>
            <i data-feather="chevron-down"></i>
          </button>
          <div class="proposal-search-select__menu" role="listbox" hidden>
            <div class="proposal-search-select__search">
              <i data-feather="search"></i>
              <input type="search" data-role="select-search" placeholder="Search..." autocomplete="off" />
            </div>
            <div class="proposal-search-select__options">${options}</div>
          </div>
        </div>
      </label>
    `;
  }

  function productSelectHTML(id) {
    return searchableSelectHTML({
      id,
      label: 'Component',
      placeholder: 'Search or select component',
      items: getProductsList(),
      emptyText: 'No products available',
    });
  }

  function kitSelectHTML(id) {
    return searchableSelectHTML({
      id,
      label: 'Kit',
      placeholder: 'Search or select saved kit',
      items: getKitsList(),
      emptyText: 'No saved kits available',
    });
  }

  function selectedValue(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function productForItem(item = {}) {
    const productId = String(item?.productId || item?.product_id || '').trim();
    const product = (Array.isArray(state.products) ? state.products : []).find((entry) => String(entry?.id || '').trim() === productId);
    return product || item || {};
  }

  function itemUnitPrice(item = {}) {
    const product = productForItem(item);
    const raw = product?.unitPrice ?? product?.unit_price ?? item?.unitPrice ?? item?.unit_price ?? null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function itemProductUrl(item = {}) {
    const product = productForItem(item);
    return String(product?.url || product?.productUrl || item?.url || item?.productUrl || item?.product_url || '').trim();
  }

  function formatCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(n);
    } catch {
      return `£${n.toFixed(2)}`;
    }
  }

  function folderCard(item, kind) {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || (kind === 'kit' ? 'Untitled Kit' : 'Untitled Proposal')).trim();
    const count = Number(item?.itemsCount || 0) || 0;
    const createdBy = String(item?.createdBy || '').trim();
    const badge = kind === 'kit' ? 'K' : 'Q';
    return `
      <article class="products-proposal-folder" data-folder-kind="${escapeHTML(kind)}" data-id="${escapeHTML(id)}" data-can-edit="${canEditItem(item) ? '1' : '0'}" data-name="${escapeHTML(name)}">
        <button type="button" class="proposal-folder-menu-btn" data-action="toggle-${kind}-menu" data-id="${escapeHTML(id)}" aria-label="Actions for ${escapeHTML(name)}"><span class="proposal-menu-dots" aria-hidden="true">•••</span></button>
        <div class="proposal-folder-menu" hidden>
          <button type="button" data-action="edit-${kind}" data-id="${escapeHTML(id)}"><i data-feather="edit-3"></i><span>Edit</span></button>
          <button type="button" data-action="copy-${kind}" data-id="${escapeHTML(id)}"><i data-feather="copy"></i><span>Make a copy</span></button>
          <button type="button" class="is-danger" data-action="delete-${kind}" data-id="${escapeHTML(id)}"><i data-feather="trash-2"></i><span>Delete</span></button>
        </div>
        <button type="button" class="products-proposal-folder__main" data-action="open-${kind}" data-id="${escapeHTML(id)}" aria-label="Open ${escapeHTML(name)}">
          <span class="proposal-folder-figure" aria-hidden="true">
            <span class="proposal-folder-figure__paper proposal-folder-figure__paper--left"></span>
            <span class="proposal-folder-figure__paper proposal-folder-figure__paper--right"></span>
            <span class="proposal-folder-figure__back"></span>
            <span class="proposal-folder-figure__front"><small>${escapeHTML(badge)}</small></span>
          </span>
          <strong>${escapeHTML(name)}</strong>
          <span>${formatNumber(count)} component${count === 1 ? '' : 's'}</span>
          ${createdBy ? `<em>Created by ${escapeHTML(createdBy)}</em>` : ''}
        </button>
      </article>
    `;
  }

  function loadingCard(label) {
    return `
      <div class="products-loading-card">
        <div class="products-spinner" aria-hidden="true"></div>
        <div><strong>Loading ${escapeHTML(label)}...</strong><span>Reading saved folders.</span></div>
      </div>
    `;
  }

  function emptyCard(title, text) {
    return window.OpsNoData?.html() || `<div class="products-proposals-empty">Sorry, No data available</div>`;
  }

  function renderProposalFolders() {
    if (!els.proposalsList) return;
    if (state.loadingProposals) {
      els.proposalsList.innerHTML = loadingCard('proposals');
      hydrateIcons(els.proposalsList);
      return;
    }
    const proposals = Array.isArray(state.proposals) ? state.proposals : [];
    if (!proposals.length) {
      els.proposalsList.innerHTML = emptyCard('No proposals yet', 'Create your first proposal folder to start saving component quantities.');
      hydrateIcons(els.proposalsList);
      return;
    }
    els.proposalsList.innerHTML = `<div class="products-proposal-folders">${proposals.map((p) => folderCard(p, 'proposal')).join('')}</div>`;
    hydrateIcons(els.proposalsList);
  }

  function renderKitFolders() {
    if (!els.kitsList) return;
    if (state.loadingKits) {
      els.kitsList.innerHTML = loadingCard('kits');
      hydrateIcons(els.kitsList);
      return;
    }
    const kits = Array.isArray(state.kits) ? state.kits : [];
    if (!kits.length) {
      els.kitsList.innerHTML = emptyCard('No kits yet', 'Create a reusable kit once, then add it to proposals later.');
      hydrateIcons(els.kitsList);
      return;
    }
    els.kitsList.innerHTML = `<div class="products-proposal-folders">${kits.map((kit) => folderCard(kit, 'kit')).join('')}</div>`;
    hydrateIcons(els.kitsList);
  }

  function totalsForItems(items = []) {
    return (Array.isArray(items) ? items : []).reduce((acc, item) => {
      const qty = Number(item?.quantity || 0) || 0;
      const unit = itemUnitPrice(item);
      acc.items += 1;
      acc.qty += qty;
      if (unit !== null) acc.total += unit * qty;
      return acc;
    }, { items: 0, qty: 0, total: 0 });
  }

  function isEditingKind(kind) {
    return kind === 'kit' ? !!state.kitEditMode : !!state.proposalEditMode;
  }

  function renderItemRows(items, kind) {
    const actionPrefix = kind === 'kit' ? 'kit' : 'proposal';
    const editable = isEditingKind(kind);
    if (!items.length) {
      return `<tr><td colspan="6"><div class="products-table-empty">No components yet. ${editable ? `Add one component${kind === 'proposal' ? ' or one saved kit' : ''} above.` : 'Open Edit from the folder menu to add components.'}</div></td></tr>`;
    }
    return items.map((item) => {
      const id = String(item?.id || '').trim();
      const name = String(item?.productName || item?.product_name || 'Untitled Product').trim();
      const qty = Number(item?.quantity || 0) || 1;
      const unitPrice = itemUnitPrice(item);
      const totalPrice = unitPrice === null ? null : unitPrice * qty;
      const url = itemProductUrl(item);
      const linkHTML = url
        ? `<a class="proposal-row-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open product link for ${escapeHTML(name)}"><i data-feather="external-link"></i></a>`
        : `<span class="proposal-row-link proposal-row-link--disabled" aria-label="No product link"><i data-feather="minus"></i></span>`;
      const qtyHTML = editable
        ? `<input class="proposal-item-qty" type="number" min="1" step="1" value="${escapeHTML(qty)}" aria-label="Quantity for ${escapeHTML(name)}" />`
        : `<strong>${escapeHTML(qty)}</strong>`;
      const actionHTML = editable
        ? `<button type="button" class="proposal-row-delete proposal-row-delete--icon" data-action="delete-${actionPrefix}-item" data-item-id="${escapeHTML(id)}" aria-label="Delete ${escapeHTML(name)}" title="Delete"><i data-feather="trash-2"></i></button>`
        : '';
      return `
        <tr data-item-id="${escapeHTML(id)}">
          <td class="proposal-component-name"><strong>${escapeHTML(name)}</strong></td>
          <td>${qtyHTML}</td>
          <td class="proposal-price-cell">${escapeHTML(formatCurrency(unitPrice))}</td>
          <td class="proposal-price-cell proposal-price-cell--total">${escapeHTML(formatCurrency(totalPrice))}</td>
          <td class="proposal-link-cell">${linkHTML}</td>
          <td><div class="proposal-row-actions">${actionHTML}</div></td>
        </tr>
      `;
    }).join('');
  }

  function totalBlockHTML(items = []) {
    const total = totalsForItems(items);
    return `
      <div class="proposal-total-block">
        <div><span>Total requested items</span><strong>${formatNumber(total.items)} item${total.items === 1 ? '' : 's'}</strong></div>
        <div><span>Total quantity</span><strong>${formatNumber(total.qty)}</strong></div>
        <div><span>Total cost</span><strong>${escapeHTML(formatCurrency(total.total))}</strong></div>
      </div>
    `;
  }


  function editNameBlockHTML(kind, currentName) {
    const isKit = kind === 'kit';
    const inputId = isKit ? 'kitEditNameInput' : 'proposalEditNameInput';
    const action = isKit ? 'save-kit-name' : 'save-proposal-name';
    const label = isKit ? 'Kit name' : 'Proposal name';
    return `
      <div class="proposal-name-edit-block">
        <label class="products-field products-field--wide">
          <span>${label}</span>
          <input id="${inputId}" type="text" value="${escapeHTML(currentName || '')}" autocomplete="off" />
        </label>
        <button type="button" class="products-btn products-btn--dark" data-action="${action}"><i data-feather="save"></i><span>Save name</span></button>
      </div>
    `;
  }

  function proposalDetailHTML() {
    const proposal = state.activeProposal;
    const count = state.proposalItems.length;
    const editable = !!state.proposalEditMode;
    return `
      <header class="products-proposal-detail__head">
        <button type="button" class="products-back-btn" data-action="back-proposals" aria-label="Back to proposals"><i data-feather="arrow-left"></i></button>
        <div class="proposal-detail-title-block">
          <h2>${escapeHTML(proposal?.name || 'Proposal')}</h2>
          <p>${formatNumber(count)} saved component${count === 1 ? '' : 's'}${editable ? ' • Edit mode' : ' • View only'}</p>
        </div>
        <button type="button" class="products-btn products-btn--dark proposal-make-order-btn" data-action="open-make-order"><i data-feather="shopping-bag"></i><span>Make Order</span></button>
      </header>
      ${editable ? editNameBlockHTML('proposal', proposal?.name || 'Proposal') : ''}
      ${editable ? `
      <div class="products-proposal-tools proposals-two-tools">
        <div class="products-proposal-tool-card">
          <div class="products-proposal-tool-title"><i data-feather="plus-circle"></i><span>Add one component</span></div>
          <div class="products-proposal-control-grid">
            ${productSelectHTML('proposalProductSelect')}
            <label class="products-field products-field--qty"><span>Qty</span><input id="proposalProductQty" type="number" min="1" step="1" value="1" inputmode="numeric" /></label>
            <button type="button" class="products-btn products-btn--dark" data-action="add-proposal-product"><i data-feather="plus"></i><span>Add</span></button>
          </div>
        </div>
        <div class="products-proposal-tool-card">
          <div class="products-proposal-tool-title"><i data-feather="box"></i><span>Add saved kit</span></div>
          <div class="products-proposal-control-grid proposals-kit-grid">
            ${kitSelectHTML('proposalKitSelect')}
            <label class="products-field products-field--qty"><span>Qty</span><input id="proposalKitQty" type="number" min="1" step="1" value="1" inputmode="numeric" /></label>
            <button type="button" class="products-btn products-btn--dark" data-action="add-proposal-kit"><i data-feather="plus"></i><span>Add Kit</span></button>
          </div>
        </div>
      </div>` : `<div class="proposal-view-note"><i data-feather="eye"></i><span>View only. Use the 3-dot menu then Edit to modify this proposal.</span></div>`}
      <div class="products-proposal-table-card">
        <div class="products-proposal-table-head">
          <div><h3>Components table</h3><p>Saved products and quantities for this proposal.</p></div>
          <span>${formatNumber(count)} item${count === 1 ? '' : 's'}</span>
        </div>
        <div class="products-proposal-table-wrap">
          <table class="products-proposal-table">
            <thead><tr><th>Component name</th><th>Quantity</th><th>Unity Price</th><th>Total Price</th><th>Link</th><th></th></tr></thead>
            <tbody>${renderItemRows(state.proposalItems, 'proposal')}</tbody>
          </table>
        </div>
        ${totalBlockHTML(state.proposalItems)}
      </div>
    `;
  }

  function kitDetailHTML() {
    const kit = state.activeKit;
    const count = state.kitItems.length;
    const editable = !!state.kitEditMode;
    return `
      <header class="products-proposal-detail__head">
        <button type="button" class="products-back-btn" data-action="back-kits" aria-label="Back to kits"><i data-feather="arrow-left"></i></button>
        <div>
          <h2>${escapeHTML(kit?.name || 'Kit')}</h2>
          <p>${formatNumber(count)} saved component${count === 1 ? '' : 's'}${editable ? ' • Edit mode' : ' • View only'}</p>
        </div>
      </header>
      ${editable ? editNameBlockHTML('kit', kit?.name || 'Kit') : ''}
      ${editable ? `
      <div class="products-proposal-tools proposals-one-tool">
        <div class="products-proposal-tool-card">
          <div class="products-proposal-tool-title"><i data-feather="plus-circle"></i><span>Add kit component</span></div>
          <div class="products-proposal-control-grid">
            ${productSelectHTML('kitProductSelect')}
            <label class="products-field products-field--qty"><span>Qty</span><input id="kitProductQty" type="number" min="1" step="1" value="1" inputmode="numeric" /></label>
            <button type="button" class="products-btn products-btn--dark" data-action="add-kit-product"><i data-feather="plus"></i><span>Add</span></button>
          </div>
        </div>
      </div>` : `<div class="proposal-view-note"><i data-feather="eye"></i><span>View only. Use the 3-dot menu then Edit to modify this kit.</span></div>`}
      <div class="products-proposal-table-card">
        <div class="products-proposal-table-head">
          <div><h3>Kit components</h3><p>These quantities will be copied into any proposal when you add this kit.</p></div>
          <span>${formatNumber(count)} item${count === 1 ? '' : 's'}</span>
        </div>
        <div class="products-proposal-table-wrap">
          <table class="products-proposal-table">
            <thead><tr><th>Component name</th><th>Quantity</th><th>Unity Price</th><th>Total Price</th><th>Link</th><th></th></tr></thead>
            <tbody>${renderItemRows(state.kitItems, 'kit')}</tbody>
          </table>
        </div>
        ${totalBlockHTML(state.kitItems)}
      </div>
    `;
  }

  function renderProposalDetail() {
    if (!els.proposalDetail) return;
    if (!state.activeProposal) return;
    els.proposalDetail.innerHTML = proposalDetailHTML();
    hydrateIcons(els.proposalDetail);
  }

  function renderKitDetail() {
    if (!els.kitDetail) return;
    if (!state.activeKit) return;
    els.kitDetail.innerHTML = kitDetailHTML();
    hydrateIcons(els.kitDetail);
  }

  function setTab(tab) {
    state.tab = tab === 'kits' ? 'kits' : 'proposals';
    const isKits = state.tab === 'kits';
    els.proposalsPanel.hidden = isKits;
    els.kitsPanel.hidden = !isKits;
    if (els.createProposalBtn) els.createProposalBtn.hidden = isKits;
    if (els.createKitBtn) els.createKitBtn.hidden = !isKits;
    document.querySelectorAll('.proposals-tab').forEach((btn) => {
      const active = btn.getAttribute('data-tab') === state.tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (isKits) loadKits();
    else loadProposals();
  }

  async function loadProducts() {
    try {
      const data = await api(`/api/products?_ts=${Date.now()}`);
      state.products = Array.isArray(data.products) ? data.products : [];
    } catch (error) {
      toast('error', 'Proposals', error?.message || 'Failed to load products.');
    }
  }

  async function loadProposals() {
    state.loadingProposals = true;
    renderProposalFolders();
    try {
      const data = await api(`/api/products/proposals?_ts=${Date.now()}`);
      state.proposals = Array.isArray(data.proposals) ? data.proposals : [];
    } catch (error) {
      toast('error', 'Proposals', error?.message || 'Failed to load proposals.');
      state.proposals = [];
    } finally {
      state.loadingProposals = false;
      renderProposalFolders();
    }
  }

  async function loadKits() {
    state.loadingKits = true;
    renderKitFolders();
    try {
      const data = await api(`/api/products/kits?_ts=${Date.now()}`);
      state.kits = Array.isArray(data.kits) ? data.kits : [];
    } catch (error) {
      toast('error', 'Kits', error?.message || 'Failed to load kits.');
      state.kits = [];
    } finally {
      state.loadingKits = false;
      renderKitFolders();
    }
  }

  async function openProposalDetail(id, options = {}) {
    const proposalId = String(id || '').trim();
    if (!proposalId) return;
    document.body.classList.add('proposal-detail-open');
    if (els.proposalsList) els.proposalsList.hidden = true;
    if (els.proposalDetail) {
      els.proposalDetail.hidden = false;
      els.proposalDetail.innerHTML = loadingCard('proposal');
    }
    try {
      state.proposalEditMode = !!options.edit;
      state.proposalAdminPassword = String(options.adminPassword || '');
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}?_ts=${Date.now()}`);
      state.activeProposal = data.proposal || null;
      state.proposalItems = Array.isArray(data.items) ? data.items : [];
      renderProposalDetail();
    } catch (error) {
      toast('error', 'Proposals', error?.message || 'Failed to load proposal.');
    }
  }

  async function openKitDetail(id, options = {}) {
    const kitId = String(id || '').trim();
    if (!kitId) return;
    document.body.classList.add('proposal-detail-open');
    if (els.kitsList) els.kitsList.hidden = true;
    if (els.kitDetail) {
      els.kitDetail.hidden = false;
      els.kitDetail.innerHTML = loadingCard('kit');
    }
    try {
      state.kitEditMode = !!options.edit;
      state.kitAdminPassword = String(options.adminPassword || '');
      const data = await api(`/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
      state.activeKit = data.kit || null;
      state.kitItems = Array.isArray(data.items) ? data.items : [];
      renderKitDetail();
    } catch (error) {
      toast('error', 'Kits', error?.message || 'Failed to load kit.');
    }
  }

  function backToProposals() {
    document.body.classList.remove('proposal-detail-open');
    state.activeProposal = null;
    state.proposalItems = [];
    state.proposalEditMode = false;
    state.proposalAdminPassword = '';
    if (els.proposalDetail) els.proposalDetail.hidden = true;
    if (els.proposalsList) els.proposalsList.hidden = false;
    renderProposalFolders();
  }

  function backToKits() {
    document.body.classList.remove('proposal-detail-open');
    state.activeKit = null;
    state.kitItems = [];
    state.kitEditMode = false;
    state.kitAdminPassword = '';
    if (els.kitDetail) els.kitDetail.hidden = true;
    if (els.kitsList) els.kitsList.hidden = false;
    renderKitFolders();
  }

  function openModal(kind, mode = 'create', copyTarget = null) {
    const isKit = kind === 'kit';
    const modal = isKit ? els.kitNameModal : els.proposalNameModal;
    const input = isKit ? els.kitNameInput : els.proposalNameInput;
    const error = isKit ? els.kitNameError : els.proposalNameError;
    const titleEl = document.getElementById(isKit ? 'kitNameModalTitle' : 'proposalNameModalTitle');
    const saveBtn = document.getElementById(isKit ? 'kitNameSave' : 'proposalNameSave');
    const headerText = modal?.querySelector('.products-modal__header p');
    const cleanMode = mode === 'copy' ? 'copy' : 'create';
    if (isKit) {
      state.kitNameMode = cleanMode;
      state.copyKitTarget = cleanMode === 'copy' ? copyTarget : null;
    } else {
      state.proposalNameMode = cleanMode;
      state.copyProposalTarget = cleanMode === 'copy' ? copyTarget : null;
    }
    const defaultName = cleanMode === 'copy'
      ? `${String(copyTarget?.name || (isKit ? 'Kit' : 'Proposal')).trim() || (isKit ? 'Kit' : 'Proposal')} copy`
      : '';
    if (titleEl) titleEl.textContent = cleanMode === 'copy' ? `Make a ${isKit ? 'kit' : 'proposal'} copy` : `Create New ${isKit ? 'Kit' : 'Proposal'}`;
    if (headerText) headerText.textContent = cleanMode === 'copy'
      ? `Write a name for your private ${isKit ? 'kit' : 'proposal'} copy.`
      : (isKit ? 'Name the kit, then add its reusable components and quantities.' : 'Name the proposal folder so you can return to it later.');
    if (saveBtn) {
      const span = saveBtn.querySelector('span');
      if (span) span.textContent = cleanMode === 'copy' ? 'Create Copy' : `Create ${isKit ? 'Kit' : 'Proposal'}`;
    }
    if (error) error.textContent = '';
    if (input) input.value = defaultName;
    if (modal) {
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('products-modal-open');
      setTimeout(() => input && input.focus(), 40);
      hydrateIcons(modal);
    }
  }

  function closeModal(kind) {
    const modal = kind === 'kit' ? els.kitNameModal : els.proposalNameModal;
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
    if (kind === 'kit') { state.kitNameMode = 'create'; state.copyKitTarget = null; }
    else { state.proposalNameMode = 'create'; state.copyProposalTarget = null; }
    document.body.classList.remove('products-modal-open');
  }

  async function createProposal(event) {
    event.preventDefault();
    const name = String(els.proposalNameInput?.value || '').trim();
    if (!name) {
      if (els.proposalNameError) els.proposalNameError.textContent = 'Proposal name is required.';
      return;
    }
    try {
      if (state.proposalNameMode === 'copy' && state.copyProposalTarget?.id) {
        const data = await api(`/api/products/proposals/${encodeURIComponent(state.copyProposalTarget.id)}/copy`, { method: 'POST', body: JSON.stringify({ name }) });
        closeModal('proposal');
        await loadProposals();
        if (data?.proposal?.id) openProposalDetail(data.proposal.id, { edit: true });
        toast('success', 'Proposals', 'Private copy created.');
        return;
      }
      const data = await api('/api/products/proposals', { method: 'POST', body: JSON.stringify({ name }) });
      closeModal('proposal');
      await loadProposals();
      if (data?.proposal?.id) openProposalDetail(data.proposal.id, { edit: true });
      toast('success', 'Proposals', 'Proposal folder created.');
    } catch (error) {
      if (els.proposalNameError) els.proposalNameError.textContent = error?.message || 'Failed to create proposal.';
      toast('error', 'Proposals', error?.message || 'Failed to create proposal.');
    }
  }

  async function createKit(event) {
    event.preventDefault();
    const name = String(els.kitNameInput?.value || '').trim();
    if (!name) {
      if (els.kitNameError) els.kitNameError.textContent = 'Kit name is required.';
      return;
    }
    try {
      if (state.kitNameMode === 'copy' && state.copyKitTarget?.id) {
        const data = await api(`/api/products/kits/${encodeURIComponent(state.copyKitTarget.id)}/copy`, { method: 'POST', body: JSON.stringify({ name }) });
        closeModal('kit');
        await loadKits();
        if (data?.kit?.id) openKitDetail(data.kit.id, { edit: true });
        toast('success', 'Kits', 'Private copy created.');
        return;
      }
      const data = await api('/api/products/kits', { method: 'POST', body: JSON.stringify({ name }) });
      closeModal('kit');
      await loadKits();
      if (data?.kit?.id) openKitDetail(data.kit.id, { edit: true });
      toast('success', 'Kits', 'Kit folder created.');
    } catch (error) {
      if (els.kitNameError) els.kitNameError.textContent = error?.message || 'Failed to create kit.';
      toast('error', 'Kits', error?.message || 'Failed to create kit.');
    }
  }

  async function addProposalProduct() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    const productId = selectedValue('proposalProductSelect');
    const quantity = numericInputValue(document.getElementById('proposalProductQty'), 1);
    if (!proposalId || !productId) return toast('error', 'Proposals', 'Select a product first.');
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/items`, { method: 'POST', body: JSON.stringify({ productId, quantity, adminPassword: state.proposalAdminPassword }) });
      state.activeProposal = data.proposal || state.activeProposal;
      state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
      renderProposalDetail();
      await loadProposals();
      toast('success', 'Proposals', 'Product added.');
    } catch (error) { toast('error', 'Proposals', error?.message || 'Failed to add product.'); }
  }

  async function addProposalKit() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    const kitId = selectedValue('proposalKitSelect');
    const quantity = numericInputValue(document.getElementById('proposalKitQty'), 1);
    if (!proposalId || !kitId) return toast('error', 'Proposals', 'Select a kit first.');
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/items/by-kit`, { method: 'POST', body: JSON.stringify({ kitId, quantity, adminPassword: state.proposalAdminPassword }) });
      state.activeProposal = data.proposal || state.activeProposal;
      state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
      renderProposalDetail();
      await loadProposals();
      toast('success', 'Proposals', `Added ${formatNumber(data?.addedCount || 0)} kit components.`);
    } catch (error) { toast('error', 'Proposals', error?.message || 'Failed to add kit.'); }
  }

  async function addKitProduct() {
    const kitId = String(state.activeKit?.id || '').trim();
    const productId = selectedValue('kitProductSelect');
    const quantity = numericInputValue(document.getElementById('kitProductQty'), 1);
    if (!kitId || !productId) return toast('error', 'Kits', 'Select a product first.');
    try {
      const data = await api(`/api/products/kits/${encodeURIComponent(kitId)}/items`, { method: 'POST', body: JSON.stringify({ productId, quantity, adminPassword: state.kitAdminPassword }) });
      state.activeKit = data.kit || state.activeKit;
      state.kitItems = Array.isArray(data.items) ? data.items : state.kitItems;
      renderKitDetail();
      await loadKits();
      toast('success', 'Kits', 'Product added to kit.');
    } catch (error) { toast('error', 'Kits', error?.message || 'Failed to add product.'); }
  }

  async function saveItem(kind, itemId, row) {
    const isKit = kind === 'kit';
    const parentId = String(isKit ? state.activeKit?.id : state.activeProposal?.id || '').trim();
    const quantity = numericInputValue(row?.querySelector('.proposal-item-qty'), 1);
    if (!parentId || !itemId) return;
    const url = isKit
      ? `/api/products/kits/${encodeURIComponent(parentId)}/items/${encodeURIComponent(itemId)}`
      : `/api/products/proposals/${encodeURIComponent(parentId)}/items/${encodeURIComponent(itemId)}`;
    try {
      const data = await api(url, { method: 'PATCH', body: JSON.stringify({ quantity, adminPassword: isKit ? state.kitAdminPassword : state.proposalAdminPassword }) });
      if (isKit) {
        state.activeKit = data.kit || state.activeKit;
        state.kitItems = Array.isArray(data.items) ? data.items : state.kitItems;
        renderKitDetail();
      } else {
        state.activeProposal = data.proposal || state.activeProposal;
        state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
        renderProposalDetail();
      }
      toast('success', isKit ? 'Kits' : 'Proposals', 'Quantity updated.');
    } catch (error) { toast('error', isKit ? 'Kits' : 'Proposals', error?.message || 'Failed to update quantity.'); }
  }

  async function deleteItem(kind, itemId) {
    const isKit = kind === 'kit';
    const parentId = String(isKit ? state.activeKit?.id : state.activeProposal?.id || '').trim();
    if (!parentId || !itemId) return;
    const url = isKit
      ? `/api/products/kits/${encodeURIComponent(parentId)}/items/${encodeURIComponent(itemId)}`
      : `/api/products/proposals/${encodeURIComponent(parentId)}/items/${encodeURIComponent(itemId)}`;
    try {
      const data = await api(url, { method: 'DELETE', body: JSON.stringify({ adminPassword: isKit ? state.kitAdminPassword : state.proposalAdminPassword }) });
      if (isKit) {
        state.activeKit = data.kit || state.activeKit;
        state.kitItems = Array.isArray(data.items) ? data.items : state.kitItems;
        renderKitDetail();
        await loadKits();
      } else {
        state.activeProposal = data.proposal || state.activeProposal;
        state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
        renderProposalDetail();
        await loadProposals();
      }
      toast('success', isKit ? 'Kits' : 'Proposals', 'Component removed.');
    } catch (error) { toast('error', isKit ? 'Kits' : 'Proposals', error?.message || 'Failed to remove component.'); }
  }


  async function saveActiveName(kind) {
    const isKit = kind === 'kit';
    const parent = isKit ? state.activeKit : state.activeProposal;
    const id = String(parent?.id || '').trim();
    const input = document.getElementById(isKit ? 'kitEditNameInput' : 'proposalEditNameInput');
    const name = String(input?.value || '').trim();
    if (!id || !name) return toast('error', isKit ? 'Kits' : 'Proposals', isKit ? 'Kit name is required.' : 'Proposal name is required.');
    const url = isKit ? `/api/products/kits/${encodeURIComponent(id)}` : `/api/products/proposals/${encodeURIComponent(id)}`;
    try {
      const data = await api(url, { method: 'PATCH', body: JSON.stringify({ name, adminPassword: isKit ? state.kitAdminPassword : state.proposalAdminPassword }) });
      if (isKit) {
        state.activeKit = data.kit || { ...state.activeKit, name };
        await loadKits();
        renderKitDetail();
      } else {
        state.activeProposal = data.proposal || { ...state.activeProposal, name };
        await loadProposals();
        renderProposalDetail();
      }
      toast('success', isKit ? 'Kits' : 'Proposals', 'Name updated.');
    } catch (error) {
      toast('error', isKit ? 'Kits' : 'Proposals', error?.message || 'Failed to update name.');
    }
  }

  function copyFolder(kind, folder) {
    closeAllFolderMenus();
    openModal(kind, 'copy', folder || null);
  }

  function closeAllFolderMenus(except = null) {
    document.querySelectorAll('.proposal-folder-menu').forEach((menu) => {
      if (except && menu === except) return;
      menu.hidden = true;
    });
  }

  function folderDataFromButton(btn) {
    const card = btn?.closest('.products-proposal-folder');
    return {
      id: btn?.getAttribute('data-id') || card?.getAttribute('data-id') || '',
      name: card?.getAttribute('data-name') || '',
      canEdit: card?.getAttribute('data-can-edit') === '1',
    };
  }

  function requestAdminIfNeeded(folder, actionLabel) {
    if (folder.canEdit) return '';
    const pwd = adminPasswordPrompt(`Enter Admin password to ${actionLabel || 'edit'} "${folder.name || 'this folder'}"`);
    if (!pwd) return null;
    return pwd;
  }

  async function deleteFolder(kind, folder) {
    const adminPassword = requestAdminIfNeeded(folder, 'delete');
    if (adminPassword === null) return;
    const label = kind === 'kit' ? 'kit' : 'proposal';
    const ok = window.confirm(`Delete ${folder.name || label}? This action cannot be undone.`);
    if (!ok) return;
    const url = kind === 'kit'
      ? `/api/products/kits/${encodeURIComponent(folder.id)}`
      : `/api/products/proposals/${encodeURIComponent(folder.id)}`;
    try {
      await api(url, { method: 'DELETE', body: JSON.stringify({ adminPassword }) });
      if (kind === 'kit') await loadKits(); else await loadProposals();
      toast('success', kind === 'kit' ? 'Kits' : 'Proposals', `${label[0].toUpperCase() + label.slice(1)} deleted.`);
    } catch (error) {
      toast('error', kind === 'kit' ? 'Kits' : 'Proposals', error?.message || `Failed to delete ${label}.`);
    }
  }

  async function loadTeamMembersForOrder() {
    if (state.teamMembers.length) return state.teamMembers;
    const data = await api(`/api/products/proposals/team-members?_ts=${Date.now()}`);
    state.teamMembers = Array.isArray(data.members) ? data.members : [];
    return state.teamMembers;
  }

  async function openMakeOrderModal() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    if (!proposalId) return;
    state.pendingOrderProposalId = proposalId;
    try { await loadTeamMembersForOrder(); } catch (error) { return toast('error', 'Make order', error?.message || 'Failed to load team members.'); }
    const select = els.makeOrderMember;
    if (select) {
      select.innerHTML = `<option value="">Select team member</option>` + state.teamMembers.map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.name)}${m.department ? ` — ${escapeHTML(m.department)}` : ''}</option>`).join('');
    }
    if (els.makeOrderPassword) els.makeOrderPassword.value = '';
    if (els.makeOrderError) els.makeOrderError.textContent = '';
    if (els.makeOrderModal) {
      els.makeOrderModal.hidden = false;
      els.makeOrderModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('products-modal-open');
      hydrateIcons(els.makeOrderModal);
    }
  }

  function closeMakeOrderModal() {
    if (els.makeOrderModal) {
      els.makeOrderModal.hidden = true;
      els.makeOrderModal.setAttribute('aria-hidden', 'true');
    }
    state.pendingOrderProposalId = '';
    if (kind === 'kit') { state.kitNameMode = 'create'; state.copyKitTarget = null; }
    else { state.proposalNameMode = 'create'; state.copyProposalTarget = null; }
    document.body.classList.remove('products-modal-open');
  }

  async function submitMakeOrder(event) {
    event.preventDefault();
    const proposalId = String(state.pendingOrderProposalId || state.activeProposal?.id || '').trim();
    const teamMemberId = String(els.makeOrderMember?.value || '').trim();
    const password = String(els.makeOrderPassword?.value || '').trim();
    if (!proposalId || !teamMemberId || !password) {
      if (els.makeOrderError) els.makeOrderError.textContent = 'Select a team member and enter the password.';
      return;
    }
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/make-order`, { method: 'POST', body: JSON.stringify({ teamMemberId, password }) });
      closeMakeOrderModal();
      toast('success', 'Make order', `Created ${data.orderId || 'order'} with ${formatNumber(data.count || 0)} item(s).`);
    } catch (error) {
      if (els.makeOrderError) els.makeOrderError.textContent = error?.message || 'Failed to create order.';
      toast('error', 'Make order', error?.message || 'Failed to create order.');
    }
  }

  function closeAllSearchSelects(exceptRoot = null) {
    document.querySelectorAll('[data-select-root]').forEach((root) => {
      if (exceptRoot && root === exceptRoot) return;
      const menu = root.querySelector('.proposal-search-select__menu');
      const toggle = root.querySelector('.proposal-search-select__button');
      if (menu) menu.hidden = true;
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      const search = root.querySelector('[data-role="select-search"]');
      if (search) {
        search.value = '';
        filterSearchSelectOptions(root, '');
      }
    });
  }

  function filterSearchSelectOptions(root, query) {
    if (!root) return;
    const q = String(query || '').trim().toLowerCase();
    root.querySelectorAll('.proposal-search-select__option').forEach((option) => {
      const text = String(option.textContent || '').toLowerCase();
      option.hidden = q ? !text.includes(q) : false;
    });
  }

  function handleSearchSelectClick(event) {
    const toggle = event.target.closest('[data-action="toggle-search-select"]');
    if (toggle) {
      event.preventDefault();
      const root = toggle.closest('[data-select-root]');
      const menu = root?.querySelector('.proposal-search-select__menu');
      if (!root || !menu) return;
      const shouldOpen = menu.hidden;
      closeAllSearchSelects(root);
      menu.hidden = !shouldOpen;
      toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      if (shouldOpen) {
        const search = root.querySelector('[data-role="select-search"]');
        setTimeout(() => search && search.focus(), 40);
      }
      return;
    }

    const option = event.target.closest('[data-action="choose-search-option"]');
    if (option) {
      event.preventDefault();
      const root = option.closest('[data-select-root]');
      const targetId = root?.getAttribute('data-target') || '';
      const input = targetId ? document.getElementById(targetId) : null;
      const label = option.getAttribute('data-label') || option.textContent || '';
      if (input) input.value = option.getAttribute('data-value') || '';
      const valueEl = root?.querySelector('.proposal-search-select__value');
      if (valueEl) valueEl.textContent = label;
      closeAllSearchSelects();
      return;
    }

    if (!event.target.closest('[data-select-root]')) closeAllSearchSelects();
  }

  function handleSearchSelectInput(event) {
    if (!event.target.matches('[data-role="select-search"]')) return;
    filterSearchSelectOptions(event.target.closest('[data-select-root]'), event.target.value);
  }

  function bindEvents() {
    document.addEventListener('click', handleSearchSelectClick);
    document.addEventListener('input', handleSearchSelectInput);
    document.querySelectorAll('.proposals-tab').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.getAttribute('data-tab')));
    });
    if (els.createProposalBtn) els.createProposalBtn.addEventListener('click', () => openModal('proposal'));
    if (els.createKitBtn) els.createKitBtn.addEventListener('click', () => openModal('kit'));

    if (els.proposalsList) els.proposalsList.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.getAttribute('data-action') || '';
      if (!action) return;
      const btn = event.target.closest('[data-action]');
      const folder = folderDataFromButton(btn);
      if (action === 'toggle-proposal-menu') {
        event.preventDefault(); event.stopPropagation();
        const menu = btn.closest('.products-proposal-folder')?.querySelector('.proposal-folder-menu');
        if (menu) { const open = menu.hidden; closeAllFolderMenus(menu); menu.hidden = !open; }
        return;
      }
      if (action === 'open-proposal') return openProposalDetail(folder.id, { edit: false });
      if (action === 'edit-proposal') {
        const adminPassword = requestAdminIfNeeded(folder, 'edit');
        if (adminPassword === null) return;
        closeAllFolderMenus();
        return openProposalDetail(folder.id, { edit: true, adminPassword });
      }
      if (action === 'copy-proposal') { closeAllFolderMenus(); return copyFolder('proposal', folder); }
      if (action === 'delete-proposal') { closeAllFolderMenus(); return deleteFolder('proposal', folder); }
    });
    if (els.kitsList) els.kitsList.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.getAttribute('data-action') || '';
      if (!action) return;
      const btn = event.target.closest('[data-action]');
      const folder = folderDataFromButton(btn);
      if (action === 'toggle-kit-menu') {
        event.preventDefault(); event.stopPropagation();
        const menu = btn.closest('.products-proposal-folder')?.querySelector('.proposal-folder-menu');
        if (menu) { const open = menu.hidden; closeAllFolderMenus(menu); menu.hidden = !open; }
        return;
      }
      if (action === 'open-kit') return openKitDetail(folder.id, { edit: false });
      if (action === 'edit-kit') {
        const adminPassword = requestAdminIfNeeded(folder, 'edit');
        if (adminPassword === null) return;
        closeAllFolderMenus();
        return openKitDetail(folder.id, { edit: true, adminPassword });
      }
      if (action === 'copy-kit') { closeAllFolderMenus(); return copyFolder('kit', folder); }
      if (action === 'delete-kit') { closeAllFolderMenus(); return deleteFolder('kit', folder); }
    });
    if (els.proposalDetail) els.proposalDetail.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.getAttribute('data-action') || '';
      if (!action) return;
      if (action === 'back-proposals') return backToProposals();
      if (action === 'open-make-order') return openMakeOrderModal();
      if (action === 'save-proposal-name') return saveActiveName('proposal');
      if (action === 'add-proposal-product') return addProposalProduct();
      if (action === 'add-proposal-kit') return addProposalKit();
      const itemId = event.target.closest('[data-item-id]')?.getAttribute('data-item-id');
      if (action === 'delete-proposal-item') return deleteItem('proposal', itemId);
    });
    if (els.proposalDetail) els.proposalDetail.addEventListener('change', (event) => {
      if (!event.target.matches('.proposal-item-qty')) return;
      const row = event.target.closest('tr');
      const itemId = row?.getAttribute('data-item-id');
      return saveItem('proposal', itemId, row);
    });
    if (els.kitDetail) els.kitDetail.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.getAttribute('data-action') || '';
      if (!action) return;
      if (action === 'back-kits') return backToKits();
      if (action === 'save-kit-name') return saveActiveName('kit');
      if (action === 'add-kit-product') return addKitProduct();
      const itemId = event.target.closest('[data-item-id]')?.getAttribute('data-item-id');
      if (action === 'delete-kit-item') return deleteItem('kit', itemId);
    });
    if (els.kitDetail) els.kitDetail.addEventListener('change', (event) => {
      if (!event.target.matches('.proposal-item-qty')) return;
      const row = event.target.closest('tr');
      const itemId = row?.getAttribute('data-item-id');
      return saveItem('kit', itemId, row);
    });

    if (els.proposalNameForm) els.proposalNameForm.addEventListener('submit', createProposal);
    if (els.kitNameForm) els.kitNameForm.addEventListener('submit', createKit);
    if (els.proposalNameClose) els.proposalNameClose.addEventListener('click', () => closeModal('proposal'));
    if (els.proposalNameCancel) els.proposalNameCancel.addEventListener('click', () => closeModal('proposal'));
    if (els.kitNameClose) els.kitNameClose.addEventListener('click', () => closeModal('kit'));
    if (els.kitNameCancel) els.kitNameCancel.addEventListener('click', () => closeModal('kit'));
    if (els.proposalNameModal) els.proposalNameModal.addEventListener('click', (event) => { if (event.target === els.proposalNameModal) closeModal('proposal'); });
    if (els.kitNameModal) els.kitNameModal.addEventListener('click', (event) => { if (event.target === els.kitNameModal) closeModal('kit'); });
    if (els.makeOrderForm) els.makeOrderForm.addEventListener('submit', submitMakeOrder);
    if (els.makeOrderClose) els.makeOrderClose.addEventListener('click', closeMakeOrderModal);
    if (els.makeOrderCancel) els.makeOrderCancel.addEventListener('click', closeMakeOrderModal);
    if (els.makeOrderModal) els.makeOrderModal.addEventListener('click', (event) => { if (event.target === els.makeOrderModal) closeMakeOrderModal(); });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (els.proposalNameModal && !els.proposalNameModal.hidden) closeModal('proposal');
      if (els.kitNameModal && !els.kitNameModal.hidden) closeModal('kit');
      if (els.makeOrderModal && !els.makeOrderModal.hidden) closeMakeOrderModal();
    });
  }

  function collectEls() {
    els.proposalsPanel = $('proposalsPanel');
    els.kitsPanel = $('kitsPanel');
    els.proposalsList = $('proposalsList');
    els.kitsList = $('kitsList');
    els.proposalDetail = $('proposalDetail');
    els.kitDetail = $('kitDetail');
    els.createProposalBtn = $('createProposalBtn');
    els.createKitBtn = $('createKitBtn');
    els.proposalNameModal = $('proposalNameModal');
    els.proposalNameForm = $('proposalNameForm');
    els.proposalNameInput = $('proposalNameInput');
    els.proposalNameError = $('proposalNameError');
    els.proposalNameClose = $('proposalNameClose');
    els.proposalNameCancel = $('proposalNameCancel');
    els.kitNameModal = $('kitNameModal');
    els.kitNameForm = $('kitNameForm');
    els.kitNameInput = $('kitNameInput');
    els.kitNameError = $('kitNameError');
    els.kitNameClose = $('kitNameClose');
    els.kitNameCancel = $('kitNameCancel');
    els.makeOrderModal = $('makeOrderModal');
    els.makeOrderForm = $('makeOrderForm');
    els.makeOrderClose = $('makeOrderClose');
    els.makeOrderCancel = $('makeOrderCancel');
    els.makeOrderMember = $('makeOrderMember');
    els.makeOrderPassword = $('makeOrderPassword');
    els.makeOrderError = $('makeOrderError');
  }

  async function init() {
    collectEls();
    bindEvents();
    hydrateIcons();
    renderProposalFolders();
    renderKitFolders();
    await loadProducts();
    await Promise.all([loadProposals(), loadKits()]);
    setTab('proposals');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

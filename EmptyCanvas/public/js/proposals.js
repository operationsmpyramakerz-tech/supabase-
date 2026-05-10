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

  function folderCard(item, kind) {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || (kind === 'kit' ? 'Untitled Kit' : 'Untitled Proposal')).trim();
    const count = Number(item?.itemsCount || 0) || 0;
    const createdBy = String(item?.createdBy || '').trim();
    const badge = kind === 'kit' ? 'KIT' : 'Q';
    return `
      <button type="button" class="products-proposal-folder" data-action="open-${kind}" data-id="${escapeHTML(id)}" aria-label="Open ${escapeHTML(name)}">
        <span class="products-proposal-folder__icon"><i data-feather="folder"></i><small>${escapeHTML(badge)}</small></span>
        <strong>${escapeHTML(name)}</strong>
        <span>${formatNumber(count)} component${count === 1 ? '' : 's'}</span>
        ${createdBy ? `<em>Created by ${escapeHTML(createdBy)}</em>` : ''}
      </button>
    `;
  }

  function loadingCard(label) {
    return `
      <div class="products-loading-card">
        <div class="products-spinner" aria-hidden="true"></div>
        <div><strong>Loading ${escapeHTML(label)}...</strong><span>Reading saved folders from Supabase.</span></div>
      </div>
    `;
  }

  function emptyCard(title, text) {
    return `
      <div class="products-proposals-empty">
        <span class="products-group__icon"><i data-feather="folder-plus"></i></span>
        <div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(text)}</span></div>
      </div>
    `;
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

  function renderItemRows(items, kind) {
    const actionPrefix = kind === 'kit' ? 'kit' : 'proposal';
    if (!items.length) {
      return `<tr><td colspan="3"><div class="products-table-empty">No components yet. Add one component${kind === 'proposal' ? ' or one saved kit' : ''} above.</div></td></tr>`;
    }
    return items.map((item) => {
      const id = String(item?.id || '').trim();
      const name = String(item?.productName || item?.product_name || 'Untitled Product').trim();
      const qty = Number(item?.quantity || 0) || 1;
      return `
        <tr data-item-id="${escapeHTML(id)}">
          <td><strong>${escapeHTML(name)}</strong></td>
          <td><input class="proposal-item-qty" type="number" min="1" step="1" value="${escapeHTML(qty)}" aria-label="Quantity for ${escapeHTML(name)}" /></td>
          <td>
            <div class="proposal-row-actions">
              <button type="button" class="proposal-row-save" data-action="save-${actionPrefix}-item" data-item-id="${escapeHTML(id)}"><i data-feather="save"></i><span>Save</span></button>
              <button type="button" class="proposal-row-delete" data-action="delete-${actionPrefix}-item" data-item-id="${escapeHTML(id)}"><i data-feather="trash-2"></i><span>Delete</span></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function proposalDetailHTML() {
    const proposal = state.activeProposal;
    const count = state.proposalItems.length;
    return `
      <header class="products-proposal-detail__head">
        <button type="button" class="products-back-btn" data-action="back-proposals"><i data-feather="arrow-left"></i><span>All Proposals</span></button>
        <div>
          <span class="products-proposals-kicker">Proposal folder</span>
          <h2>${escapeHTML(proposal?.name || 'Proposal')}</h2>
          <p>${formatNumber(count)} saved component${count === 1 ? '' : 's'}</p>
        </div>
      </header>
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
            <button type="button" class="products-btn products-btn--dark" data-action="add-proposal-kit"><i data-feather="plus"></i><span>Add Kit</span></button>
          </div>
        </div>
      </div>
      <div class="products-proposal-table-card">
        <div class="products-proposal-table-head">
          <div><h3>Components table</h3><p>Saved products and quantities for this proposal.</p></div>
          <span>${formatNumber(count)} item${count === 1 ? '' : 's'}</span>
        </div>
        <div class="products-proposal-table-wrap">
          <table class="products-proposal-table">
            <thead><tr><th>Component name</th><th>Quantity</th><th></th></tr></thead>
            <tbody>${renderItemRows(state.proposalItems, 'proposal')}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function kitDetailHTML() {
    const kit = state.activeKit;
    const count = state.kitItems.length;
    return `
      <header class="products-proposal-detail__head">
        <button type="button" class="products-back-btn" data-action="back-kits"><i data-feather="arrow-left"></i><span>All Kits</span></button>
        <div>
          <span class="products-proposals-kicker">Reusable kit</span>
          <h2>${escapeHTML(kit?.name || 'Kit')}</h2>
          <p>${formatNumber(count)} saved component${count === 1 ? '' : 's'}</p>
        </div>
      </header>
      <div class="products-proposal-tools proposals-one-tool">
        <div class="products-proposal-tool-card">
          <div class="products-proposal-tool-title"><i data-feather="plus-circle"></i><span>Add kit component</span></div>
          <div class="products-proposal-control-grid">
            ${productSelectHTML('kitProductSelect')}
            <label class="products-field products-field--qty"><span>Qty</span><input id="kitProductQty" type="number" min="1" step="1" value="1" inputmode="numeric" /></label>
            <button type="button" class="products-btn products-btn--dark" data-action="add-kit-product"><i data-feather="plus"></i><span>Add</span></button>
          </div>
        </div>
      </div>
      <div class="products-proposal-table-card">
        <div class="products-proposal-table-head">
          <div><h3>Kit components</h3><p>These quantities will be copied into any proposal when you add this kit.</p></div>
          <span>${formatNumber(count)} item${count === 1 ? '' : 's'}</span>
        </div>
        <div class="products-proposal-table-wrap">
          <table class="products-proposal-table">
            <thead><tr><th>Component name</th><th>Quantity</th><th></th></tr></thead>
            <tbody>${renderItemRows(state.kitItems, 'kit')}</tbody>
          </table>
        </div>
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

  async function openProposalDetail(id) {
    const proposalId = String(id || '').trim();
    if (!proposalId) return;
    if (els.proposalsList) els.proposalsList.hidden = true;
    if (els.proposalDetail) {
      els.proposalDetail.hidden = false;
      els.proposalDetail.innerHTML = loadingCard('proposal');
    }
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}?_ts=${Date.now()}`);
      state.activeProposal = data.proposal || null;
      state.proposalItems = Array.isArray(data.items) ? data.items : [];
      renderProposalDetail();
    } catch (error) {
      toast('error', 'Proposals', error?.message || 'Failed to load proposal.');
    }
  }

  async function openKitDetail(id) {
    const kitId = String(id || '').trim();
    if (!kitId) return;
    if (els.kitsList) els.kitsList.hidden = true;
    if (els.kitDetail) {
      els.kitDetail.hidden = false;
      els.kitDetail.innerHTML = loadingCard('kit');
    }
    try {
      const data = await api(`/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
      state.activeKit = data.kit || null;
      state.kitItems = Array.isArray(data.items) ? data.items : [];
      renderKitDetail();
    } catch (error) {
      toast('error', 'Kits', error?.message || 'Failed to load kit.');
    }
  }

  function backToProposals() {
    state.activeProposal = null;
    state.proposalItems = [];
    if (els.proposalDetail) els.proposalDetail.hidden = true;
    if (els.proposalsList) els.proposalsList.hidden = false;
    renderProposalFolders();
  }

  function backToKits() {
    state.activeKit = null;
    state.kitItems = [];
    if (els.kitDetail) els.kitDetail.hidden = true;
    if (els.kitsList) els.kitsList.hidden = false;
    renderKitFolders();
  }

  function openModal(kind) {
    const isKit = kind === 'kit';
    const modal = isKit ? els.kitNameModal : els.proposalNameModal;
    const input = isKit ? els.kitNameInput : els.proposalNameInput;
    const error = isKit ? els.kitNameError : els.proposalNameError;
    if (error) error.textContent = '';
    if (input) input.value = '';
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
      const data = await api('/api/products/proposals', { method: 'POST', body: JSON.stringify({ name }) });
      closeModal('proposal');
      await loadProposals();
      if (data?.proposal?.id) openProposalDetail(data.proposal.id);
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
      const data = await api('/api/products/kits', { method: 'POST', body: JSON.stringify({ name }) });
      closeModal('kit');
      await loadKits();
      if (data?.kit?.id) openKitDetail(data.kit.id);
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
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/items`, { method: 'POST', body: JSON.stringify({ productId, quantity }) });
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
    if (!proposalId || !kitId) return toast('error', 'Proposals', 'Select a kit first.');
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/items/by-kit`, { method: 'POST', body: JSON.stringify({ kitId }) });
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
      const data = await api(`/api/products/kits/${encodeURIComponent(kitId)}/items`, { method: 'POST', body: JSON.stringify({ productId, quantity }) });
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
      const data = await api(url, { method: 'PATCH', body: JSON.stringify({ quantity }) });
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
      const data = await api(url, { method: 'DELETE' });
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
      const btn = event.target.closest('[data-action="open-proposal"]');
      if (btn) openProposalDetail(btn.getAttribute('data-id'));
    });
    if (els.kitsList) els.kitsList.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="open-kit"]');
      if (btn) openKitDetail(btn.getAttribute('data-id'));
    });
    if (els.proposalDetail) els.proposalDetail.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.getAttribute('data-action') || '';
      if (!action) return;
      if (action === 'back-proposals') return backToProposals();
      if (action === 'add-proposal-product') return addProposalProduct();
      if (action === 'add-proposal-kit') return addProposalKit();
      const row = event.target.closest('tr');
      const itemId = event.target.closest('[data-item-id]')?.getAttribute('data-item-id');
      if (action === 'save-proposal-item') return saveItem('proposal', itemId, row);
      if (action === 'delete-proposal-item') return deleteItem('proposal', itemId);
    });
    if (els.kitDetail) els.kitDetail.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.getAttribute('data-action') || '';
      if (!action) return;
      if (action === 'back-kits') return backToKits();
      if (action === 'add-kit-product') return addKitProduct();
      const row = event.target.closest('tr');
      const itemId = event.target.closest('[data-item-id]')?.getAttribute('data-item-id');
      if (action === 'save-kit-item') return saveItem('kit', itemId, row);
      if (action === 'delete-kit-item') return deleteItem('kit', itemId);
    });

    if (els.proposalNameForm) els.proposalNameForm.addEventListener('submit', createProposal);
    if (els.kitNameForm) els.kitNameForm.addEventListener('submit', createKit);
    if (els.proposalNameClose) els.proposalNameClose.addEventListener('click', () => closeModal('proposal'));
    if (els.proposalNameCancel) els.proposalNameCancel.addEventListener('click', () => closeModal('proposal'));
    if (els.kitNameClose) els.kitNameClose.addEventListener('click', () => closeModal('kit'));
    if (els.kitNameCancel) els.kitNameCancel.addEventListener('click', () => closeModal('kit'));
    if (els.proposalNameModal) els.proposalNameModal.addEventListener('click', (event) => { if (event.target === els.proposalNameModal) closeModal('proposal'); });
    if (els.kitNameModal) els.kitNameModal.addEventListener('click', (event) => { if (event.target === els.kitNameModal) closeModal('kit'); });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (els.proposalNameModal && !els.proposalNameModal.hidden) closeModal('proposal');
      if (els.kitNameModal && !els.kitNameModal.hidden) closeModal('kit');
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

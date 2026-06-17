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
    proposalCreateMode: false,
    kitCreateMode: false,
    proposalMergeLogic: 'add',
    downloadingProposal: false,
    combiningProposals: false,
    savingCombinedProposal: false,
    copyProposalTarget: null,
    copyKitTarget: null,
    proposalCreateErrors: { name: '', items: '' },
    kitCreateErrors: { name: '', items: '' },
  };

  const els = {};
  const PROPOSAL_EXPORT_COLUMNS = [
    { value: 'idCode', label: 'ID Code', checked: true },
    { value: 'name', label: 'Component', checked: true },
    { value: 'quantity', label: 'Qty', checked: true },
    { value: 'unitPrice', label: 'Unit cost', checked: true },
    { value: 'totalPrice', label: 'Total cost', checked: true },
  ];
  const COMBINED_META_STORAGE_KEY = 'ops.proposals.combinedMeta.v1';
  const $ = (id) => document.getElementById(id);

  function currentWorkspaceMode() {
    const mode = String(document.body?.dataset?.proposalsMode || '').trim().toLowerCase();
    if (mode === 'kits' || /^\/kits(?:\/|$)/i.test(window.location.pathname || '')) return 'kits';
    return 'proposals';
  }

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

  function readCombinedMetaStore() {
    try {
      const raw = localStorage.getItem(COMBINED_META_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function writeCombinedMetaStore(store = {}) {
    try { localStorage.setItem(COMBINED_META_STORAGE_KEY, JSON.stringify(store || {})); } catch {}
  }

  function saveCombinedMetaForProposal(proposalId, meta = {}) {
    const id = String(proposalId || '').trim();
    if (!id || !meta) return;
    const sources = Array.isArray(meta.sources || meta.combinedSources) ? (meta.sources || meta.combinedSources) : [];
    const clean = {
      sources: sources.map((source) => ({ id: String(source?.id || '').trim(), name: String(source?.name || '').trim() })).filter((source) => source.id || source.name),
      logic: normalizeCombineLogic(meta.logic || meta.combineLogic || 'add'),
      note: String(meta.note || meta.combineNote || '').trim(),
      matrix: Array.isArray(meta.matrix) ? meta.matrix : [],
      savedAt: new Date().toISOString(),
    };
    const store = readCombinedMetaStore();
    store[id] = clean;
    writeCombinedMetaStore(store);
  }

  function combinedMetaForProposal(proposal = {}) {
    const id = String(proposal?.id || '').trim();
    const directSources = Array.isArray(proposal?.combinedSources) ? proposal.combinedSources.filter(Boolean) : [];
    const directMatrix = Array.isArray(proposal?.combinedMatrix) ? proposal.combinedMatrix.filter(Boolean) : [];
    const directNote = String(proposal?.combineNote || proposal?.combinedNote || '').trim();
    const directLogic = String(proposal?.combineLogic || proposal?.combinedLogic || '').trim();
    const hasServerMeta = directSources.length > 0 || directMatrix.length > 0 || !!directNote || !!directLogic;
    if (hasServerMeta) {
      return { sources: directSources, note: directNote, logic: normalizeCombineLogic(directLogic || 'add'), matrix: directMatrix };
    }
    if (!id) return null;
    const saved = readCombinedMetaStore()[id] || null;
    if (!saved) return null;
    const savedSources = Array.isArray(saved.sources) ? saved.sources.filter(Boolean) : [];
    const savedMatrix = Array.isArray(saved.matrix) ? saved.matrix.filter(Boolean) : [];
    const savedNote = String(saved.note || '').trim();
    const savedLogic = String(saved.logic || '').trim();
    if (!savedSources.length && !savedMatrix.length && !savedNote && !savedLogic) return null;
    return { ...saved, sources: savedSources, matrix: savedMatrix, logic: normalizeCombineLogic(savedLogic || 'add') };
  }

  function combinedMetaCardHTML(proposal = {}) {
    const meta = combinedMetaForProposal(proposal);
    if (!meta) return '';
    const sources = Array.isArray(meta.sources) ? meta.sources.filter((source) => source?.name || source?.id) : [];
    const names = sources.map((source) => String(source?.name || source?.id || '').trim()).filter(Boolean);
    if (!names.length && !String(meta.note || '').trim()) return '';
    const sourceText = names.length ? names.join(', ') : 'selected proposals';
    const logicText = normalizeCombineLogic(meta.logic) === 'separate' ? 'Separate logic' : 'Add logic';
    const note = `This proposal combines: ${sourceText}.`;
    return `
      <div class="proposal-combined-info-card">
        <div class="proposal-combined-info-card__icon"><i data-feather="git-merge"></i></div>
        <div>
          <strong>Combined proposal</strong>
          <p>${escapeHTML(note)} <span>Logic: ${escapeHTML(logicText)}.</span></p>
        </div>
      </div>
    `;
  }

  function combinedMatrixCardHTML(proposal = {}) {
    const meta = combinedMetaForProposal(proposal);
    const sources = Array.isArray(meta?.sources) ? meta.sources.filter((source) => source?.id || source?.name) : [];
    const matrix = Array.isArray(meta?.matrix) ? meta.matrix : [];
    if (!meta || normalizeCombineLogic(meta.logic) !== 'separate' || !sources.length || !matrix.length) return '';
    const sourceHeaders = sources.map((source) => `<th>${escapeHTML(source.name || source.id || 'Proposal')} Qty</th>`).join('');
    const rows = matrix.map((row) => {
      const quantities = sources.map((source) => `<td>${escapeHTML(formatNumber(Number(row?.sourceQuantities?.[source.id]) || 0))}</td>`).join('');
      return `
        <tr>
          <td><strong>${escapeHTML(row?.name || 'Untitled Product')}</strong></td>
          ${quantities}
          <td>${escapeHTML(formatNumber(Number(row?.quantity) || 0))}</td>
        </tr>
      `;
    }).join('');
    return `
      <div class="products-proposal-table-card proposal-combined-matrix-card">
        <div class="products-proposal-table-head">
          <div><h3>Combined source quantities</h3><p>Separate logic keeps each proposal quantity visible without repeating components.</p></div>
          <span>${escapeHTML(formatNumber(matrix.length))} item${matrix.length === 1 ? '' : 's'}</span>
        </div>
        <div class="products-proposal-table-wrap">
          <table class="products-proposal-table proposal-combined-matrix-table">
            <thead><tr><th>Component name</th>${sourceHeaders}<th>Total Qty</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function adminPasswordPrompt(message) {
    const value = window.prompt(message || 'Enter Admin password');
    return value === null ? null : String(value || '').trim();
  }

  function ensureProductsAdminModal() {
    let modal = document.querySelector('[data-products-admin-modal]');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'products-modal-overlay products-admin-password-overlay';
    modal.dataset.productsAdminModal = 'true';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <form class="products-modal products-admin-password-modal" data-admin-form role="dialog" aria-modal="true" aria-labelledby="productsAdminPasswordTitle">
        <button type="button" class="products-modal__close" data-admin-cancel aria-label="Close admin password"><span aria-hidden="true">×</span></button>
        <div class="products-modal__header">
          <div class="products-modal__icon"><i data-feather="shield"></i></div>
          <div>
            <h2 id="productsAdminPasswordTitle" data-admin-title>Admin password required</h2>
            <p data-admin-message>Enter the Admin password to continue.</p>
          </div>
        </div>
        <div class="products-form-grid">
          <label class="products-field products-field--wide">
            <span>Admin password <em>*</em></span>
            <input type="password" autocomplete="current-password" required placeholder="Enter Admin password" data-admin-input />
          </label>
        </div>
        <div class="products-form-error" data-admin-error aria-live="polite"></div>
        <div class="products-modal__actions">
          <button type="button" class="products-btn products-btn--light" data-admin-cancel>Cancel</button>
          <button type="submit" class="products-btn products-btn--dark" data-admin-submit><i data-feather="lock"></i><span>Continue</span></button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);
    hydrateIcons(modal);
    return modal;
  }

  function requestProductsAdminPassword({ title = 'Admin password required', message = 'Enter the Admin password to continue.' } = {}) {
    const modal = ensureProductsAdminModal();
    const form = modal.querySelector('[data-admin-form]');
    const titleEl = modal.querySelector('[data-admin-title]');
    const messageEl = modal.querySelector('[data-admin-message]');
    const input = modal.querySelector('[data-admin-input]');
    const error = modal.querySelector('[data-admin-error]');
    const submit = modal.querySelector('[data-admin-submit]');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (input) input.value = '';
    if (error) error.textContent = '';
    if (submit) submit.disabled = false;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('products-modal-open');
    setTimeout(() => input && input.focus(), 40);

    return new Promise((resolve) => {
      const cleanup = (value) => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('products-modal-open');
        form?.removeEventListener('submit', onSubmit);
        modal.querySelectorAll('[data-admin-cancel]').forEach((node) => node.removeEventListener('click', onCancel));
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKeydown);
        resolve(value);
      };
      const onCancel = (event) => { event.preventDefault(); cleanup(null); };
      const onBackdrop = (event) => { if (event.target === modal) cleanup(null); };
      const onKeydown = (event) => { if (event.key === 'Escape') cleanup(null); };
      const onSubmit = async (event) => {
        event.preventDefault();
        const password = String(input?.value || '').trim();
        if (!password) { if (error) error.textContent = 'Please enter the Admin password.'; return; }
        if (submit) submit.disabled = true;
        if (error) error.textContent = '';
        try {
          await api('/api/products/admin/verify', { method: 'POST', body: JSON.stringify({ password }) });
          cleanup(password);
        } catch (err) {
          if (error) error.textContent = err?.message || 'Invalid Admin password.';
          if (submit) submit.disabled = false;
          setTimeout(() => input && input.focus(), 20);
        }
      };
      form?.addEventListener('submit', onSubmit);
      modal.querySelectorAll('[data-admin-cancel]').forEach((node) => node.addEventListener('click', onCancel));
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKeydown);
    });
  }

  function ensureProposalDeleteConfirmModal() {
    let modal = document.querySelector('[data-proposal-delete-modal]');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'products-modal-overlay proposal-delete-modal-overlay';
    modal.dataset.proposalDeleteModal = 'true';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="products-modal proposal-delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="proposalDeleteConfirmTitle">
        <button type="button" class="products-modal__close" data-delete-cancel aria-label="Close delete confirmation"><span aria-hidden="true">×</span></button>
        <div class="products-modal__header">
          <div class="products-modal__icon proposal-delete-confirm-modal__icon"><i data-feather="trash-2"></i></div>
          <div>
            <h2 id="proposalDeleteConfirmTitle" data-delete-title>Delete proposal?</h2>
            <p data-delete-message>This action cannot be undone.</p>
          </div>
        </div>
        <div class="proposal-delete-confirm-modal__warning">
          <i data-feather="alert-triangle"></i>
          <span>The folder and all saved components inside it will be removed permanently.</span>
        </div>
        <div class="products-modal__actions">
          <button type="button" class="products-btn products-btn--light" data-delete-cancel>Cancel</button>
          <button type="button" class="products-btn proposal-delete-confirm-modal__delete" data-delete-confirm><i data-feather="trash-2"></i><span>Delete</span></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    hydrateIcons(modal);
    return modal;
  }

  function requestProposalDeleteConfirmation({ kind = 'proposal', name = '' } = {}) {
    const modal = ensureProposalDeleteConfirmModal();
    const label = kind === 'kit' ? 'kit' : 'proposal';
    const title = modal.querySelector('[data-delete-title]');
    const message = modal.querySelector('[data-delete-message]');
    const confirm = modal.querySelector('[data-delete-confirm]');
    if (title) title.textContent = `Delete ${label}?`;
    if (message) message.textContent = `Delete ${name || `this ${label}`}? This action cannot be undone.`;
    if (confirm) {
      const span = confirm.querySelector('span');
      if (span) span.textContent = `Delete ${label}`;
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('products-modal-open');
    setTimeout(() => confirm && confirm.focus(), 40);

    return new Promise((resolve) => {
      const cleanup = (value) => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('products-modal-open');
        modal.querySelectorAll('[data-delete-cancel]').forEach((node) => node.removeEventListener('click', onCancel));
        confirm?.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKeydown);
        resolve(value);
      };
      const onCancel = (event) => { event.preventDefault(); cleanup(false); };
      const onConfirm = (event) => { event.preventDefault(); cleanup(true); };
      const onBackdrop = (event) => { if (event.target === modal) cleanup(false); };
      const onKeydown = (event) => { if (event.key === 'Escape') cleanup(false); };
      modal.querySelectorAll('[data-delete-cancel]').forEach((node) => node.addEventListener('click', onCancel));
      confirm?.addEventListener('click', onConfirm);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKeydown);
    });
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

  function normalizeProposalMergeLogic(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
    if (raw === 'max' || raw === 'max-logic') return 'max';
    if (raw === 'min' || raw === 'min-logic') return 'min';
    return 'add';
  }

  function normalizeCombineLogic(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
    if (raw === 'separate' || raw === 'separate-logic') return 'separate';
    return 'add';
  }

  function combineLogicLabel(value) {
    return normalizeCombineLogic(value) === 'separate' ? 'Separate logic' : 'Add logic';
  }

  function selectedProposalMergeLogic() {
    const select = document.getElementById('proposalMergeLogicSelect');
    const logic = normalizeProposalMergeLogic(select?.value || state.proposalMergeLogic || 'add');
    state.proposalMergeLogic = logic;
    return logic;
  }

  function proposalMergeLogicLabel(value) {
    const logic = normalizeProposalMergeLogic(value);
    if (logic === 'max') return 'Max logic';
    if (logic === 'min') return 'Min logic';
    return 'Add logic';
  }

  function proposalLogicOptionHTML(value) {
    const logic = normalizeProposalMergeLogic(value);
    return `<button type="button" class="proposal-search-select__option" data-action="choose-search-option" data-value="${escapeHTML(logic)}" data-label="${escapeHTML(proposalMergeLogicLabel(logic))}"><span>${escapeHTML(proposalMergeLogicLabel(logic))}</span></button>`;
  }

  function proposalLogicControlHTML() {
    const current = normalizeProposalMergeLogic(state.proposalMergeLogic || 'add');
    return `
      <div class="proposal-logic-row">
        <label class="products-field proposal-logic-field">
          <span>Logic</span>
          <div class="proposal-search-select proposal-search-select--light proposal-search-select--logic" data-select-root data-target="proposalMergeLogicSelect">
            <input type="hidden" id="proposalMergeLogicSelect" value="${escapeHTML(current)}" />
            <button type="button" class="proposal-search-select__button" data-action="toggle-search-select" aria-haspopup="listbox" aria-expanded="false">
              <span class="proposal-search-select__value">${escapeHTML(proposalMergeLogicLabel(current))}</span>
              <i data-feather="chevron-down"></i>
            </button>
            <div class="proposal-search-select__menu" role="listbox" hidden>
              <div class="proposal-search-select__options">
                ${proposalLogicOptionHTML('add')}
                ${proposalLogicOptionHTML('max')}
                ${proposalLogicOptionHTML('min')}
              </div>
            </div>
          </div>
        </label>
      </div>
    `;
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

  function firstProductTagForItem(item = {}) {
    const product = productForItem(item);
    const rawTags = Array.isArray(product?.tags) ? product.tags : (product?.tags ? [product.tags] : []);
    const tag = rawTags.map((entry) => String(entry || '').trim()).find(Boolean);
    return tag || 'Uncategorized';
  }

  function groupedProposalItemsByTag(items = []) {
    const groups = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const tag = firstProductTagForItem(item);
      const key = tag.toLowerCase();
      if (!groups.has(key)) groups.set(key, { tag, items: [] });
      groups.get(key).items.push(item);
    });
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: group.items.slice().sort((a, b) => String(a?.productName || a?.product_name || '').localeCompare(String(b?.productName || b?.product_name || ''))),
      }))
      .sort((a, b) => String(a.tag || '').localeCompare(String(b.tag || '')));
  }


  function proposalNormKey(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function separateCombinedMeta(proposal = state.activeProposal) {
    const meta = combinedMetaForProposal(proposal);
    if (!meta || normalizeCombineLogic(meta.logic) !== 'separate') return null;
    const sources = Array.isArray(meta.sources) ? meta.sources.filter((source) => source?.id || source?.name) : [];
    const matrix = Array.isArray(meta.matrix) ? meta.matrix.filter(Boolean) : [];
    if (!sources.length || !matrix.length) return null;
    return { ...meta, sources, matrix };
  }

  function matrixRowForItem(item = {}, meta = null) {
    const matrix = Array.isArray(meta?.matrix) ? meta.matrix : [];
    const productId = String(item?.productId || item?.product_id || '').trim();
    const productName = proposalNormKey(item?.productName || item?.product_name || '');
    return matrix.find((row) => {
      const rowProductId = String(row?.productId || row?.product_id || '').trim();
      if (productId && rowProductId && productId === rowProductId) return true;
      return productName && proposalNormKey(row?.name || row?.productName || row?.product_name || '') === productName;
    }) || null;
  }

  function proposalTableColumnCount(meta = null) {
    const sourceCount = Array.isArray(meta?.sources) ? meta.sources.length : 0;
    return sourceCount ? sourceCount + 6 : 6;
  }

  function proposalTableHeaderHTML(meta = null) {
    const sources = Array.isArray(meta?.sources) ? meta.sources : [];
    if (!sources.length) return '<thead><tr><th>Component name</th><th>Quantity</th><th>Unity Price</th><th>Total Price</th><th>Link</th><th></th></tr></thead>';
    const sourceHeaders = sources.map((source) => `<th class="proposal-source-qty-head">${escapeHTML(source?.name || source?.id || 'Proposal')} Qty</th>`).join('');
    return `<thead><tr><th>Component name</th>${sourceHeaders}<th>Total Quantity</th><th>Unity Price</th><th>Total Price</th><th>Link</th><th></th></tr></thead>`;
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
    const countLabel = `${formatNumber(count)} component${count === 1 ? '' : 's'}`;
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
            <span class="proposal-folder-figure__paper proposal-folder-figure__paper--middle"></span>
            <span class="proposal-folder-figure__paper proposal-folder-figure__paper--right"></span>
            <span class="proposal-folder-figure__back"></span>
            <span class="proposal-folder-figure__front"><small>${escapeHTML(badge)}</small></span>
          </span>
          <span class="proposal-folder-copy">
            <strong>${escapeHTML(name)}</strong>
            ${createdBy ? `<em>Created by ${escapeHTML(createdBy)}</em>` : `<em>Created by —</em>`}
          </span>
          <span class="proposal-folder-count"><i data-feather="copy"></i><span>${escapeHTML(countLabel)}</span></span>
        </button>
      </article>
    `;
  }

  function loadingCard(label) {
    return `
      <div class="products-loading-card" role="status" aria-live="polite">
        <div class="products-spinner" aria-hidden="true"></div>
        <div><strong>Loading ${escapeHTML(label)}</strong><span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span></div>
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


  function restartProposalAnimation(element, className) {
    if (!element || !className) return;
    try {
      element.classList.remove(className);
      // Force reflow so the animation restarts when the same panel is shown again.
      void element.offsetWidth;
      element.classList.add(className);
      window.setTimeout(() => element.classList.remove(className), 520);
    } catch {}
  }

  function markFolderOpening(button) {
    const folder = button?.closest?.('.products-proposal-folder');
    if (!folder) return;
    folder.classList.add('is-opening');
    window.setTimeout(() => folder.classList.remove('is-opening'), 460);
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

  function renderItemRow(item, kind, options = {}) {
    const actionPrefix = kind === 'kit' ? 'kit' : 'proposal';
    const editable = isEditingKind(kind);
    const id = String(item?.id || '').trim();
    const name = String(item?.productName || item?.product_name || 'Untitled Product').trim();
    const qty = Number(item?.quantity || 0) || 1;
    const unitPrice = itemUnitPrice(item);
    const totalPrice = unitPrice === null ? null : unitPrice * qty;
    const url = itemProductUrl(item);
    const separateMeta = options?.separateMeta || null;
    const matrixRow = separateMeta ? matrixRowForItem(item, separateMeta) : null;
    const linkHTML = url
      ? `<a class="proposal-row-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open product link for ${escapeHTML(name)}"><i data-feather="external-link"></i></a>`
      : `<span class="proposal-row-link proposal-row-link--disabled" aria-label="No product link"><i data-feather="minus"></i></span>`;
    const qtyHTML = editable
      ? `<input class="proposal-item-qty" type="number" min="1" step="1" value="${escapeHTML(qty)}" aria-label="Quantity for ${escapeHTML(name)}" />`
      : `<strong>${escapeHTML(qty)}</strong>`;
    const sourceQtyHTML = separateMeta
      ? separateMeta.sources.map((source) => {
          const sourceQty = Number(matrixRow?.sourceQuantities?.[source.id] || 0) || 0;
          return `<td class="proposal-source-qty-cell"><strong>${escapeHTML(formatNumber(sourceQty))}</strong></td>`;
        }).join('')
      : '';
    const actionHTML = editable
      ? `<button type="button" class="proposal-row-delete proposal-row-delete--icon" data-action="delete-${actionPrefix}-item" data-item-id="${escapeHTML(id)}" aria-label="Delete ${escapeHTML(name)}" title="Delete"><i data-feather="trash-2"></i></button>`
      : '';
    return `
      <tr data-item-id="${escapeHTML(id)}"${separateMeta ? ' class="proposal-combined-table-row"' : ''}>
        <td class="proposal-component-name"><strong>${escapeHTML(name)}</strong></td>
        ${sourceQtyHTML}
        <td>${qtyHTML}</td>
        <td class="proposal-price-cell">${escapeHTML(formatCurrency(unitPrice))}</td>
        <td class="proposal-price-cell proposal-price-cell--total">${escapeHTML(formatCurrency(totalPrice))}</td>
        <td class="proposal-link-cell">${linkHTML}</td>
        <td><div class="proposal-row-actions">${actionHTML}</div></td>
      </tr>
    `;
  }

  function renderItemRows(items, kind, options = {}) {
    const editable = isEditingKind(kind);
    const separateMeta = kind === 'proposal' ? (options?.separateMeta || separateCombinedMeta(state.activeProposal)) : null;
    const colspan = proposalTableColumnCount(separateMeta);
    if (!items.length) {
      return `<tr><td colspan="${escapeHTML(colspan)}"><div class="products-table-empty">No components yet. ${editable ? `Add one component${kind === 'proposal' ? ' or one saved kit' : ''} above.` : 'Open Edit from the folder menu to add components.'}</div></td></tr>`;
    }
    if (kind !== 'proposal') return items.map((item) => renderItemRow(item, kind)).join('');
    return groupedProposalItemsByTag(items).map((group) => `
      <tr class="proposal-tag-group-row" data-proposal-tag-group="${escapeHTML(group.tag)}">
        <td colspan="${escapeHTML(colspan)}">
          <div class="proposal-tag-group-label">
            <span>${escapeHTML(group.tag)}</span>
            <small>${formatNumber(group.items.length)} item${group.items.length === 1 ? '' : 's'}</small>
          </div>
        </td>
      </tr>
      ${group.items.map((item) => renderItemRow(item, kind, { separateMeta })).join('')}
    `).join('');
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


  function editNameBlockHTML(kind, currentName, options = {}) {
    const isKit = kind === 'kit';
    const inputId = isKit ? 'kitEditNameInput' : 'proposalEditNameInput';
    const action = isKit ? 'save-kit-name' : 'save-proposal-name';
    const label = isKit ? 'Kit name' : 'Proposal name';
    const placeholder = options.placeholder || (isKit ? 'Example: Arduino starter kit' : 'Example: City quotation');
    const requiredMark = options.required ? ' <em>*</em>' : '';
    const blockClasses = [
      'proposal-name-edit-block',
      options.createMode ? 'proposal-name-edit-block--create' : '',
      isKit && options.createMode ? 'proposal-name-edit-block--kit-create' : '',
      !isKit && options.createMode ? 'proposal-name-edit-block--proposal-create' : '',
    ].filter(Boolean).join(' ');
    const saveButton = options.hideButton ? '' : `<button type="button" class="products-btn products-btn--dark" data-action="${action}"><i data-feather="save"></i><span>Save name</span></button>`;
    const nameError = options.createMode
      ? String(isKit ? (state.kitCreateErrors?.name || '') : (state.proposalCreateErrors?.name || ''))
      : '';
    const errorId = isKit ? 'kitCreateNameError' : 'proposalCreateNameError';
    const inlineError = options.createMode ? `<div class="direct-create-inline-error direct-create-inline-error--name ${isKit ? 'kit-create-inline-error kit-create-inline-error--name' : 'proposal-create-inline-error proposal-create-inline-error--name'}" id="${errorId}" aria-live="polite">${escapeHTML(nameError)}</div>` : '';
    return `
      <div class="${blockClasses}">
        <label class="products-field products-field--wide">
          <span>${label}${requiredMark}</span>
          <input id="${inputId}" type="text" value="${escapeHTML(currentName || '')}" autocomplete="off" placeholder="${escapeHTML(placeholder)}" />
        </label>
        ${inlineError}
        ${saveButton}
      </div>
    `;
  }

  function createModeHintHTML(kind) {
    const label = kind === 'kit' ? 'kit' : 'proposal';
    return `
      <div class="proposal-create-mode-note">
        <i data-feather="info"></i>
        <div>
          <strong>Name this ${escapeHTML(label)} first.</strong>
          <span>After saving, you will return to the ${escapeHTML(kind === 'kit' ? 'Kits' : 'Proposals')} page.</span>
        </div>
      </div>
    `;
  }

  function directCreateSaveHTML(kind = 'kit') {
    const isKit = kind === 'kit';
    return `
      <div class="kit-create-save-footer direct-create-save-footer">
        <button type="button" class="products-btn products-btn--dark kit-create-save-btn direct-create-save-btn" data-action="${isKit ? 'save-kit-name' : 'save-proposal-name'}">
          <i data-feather="save"></i><span>Save</span>
        </button>
      </div>
    `;
  }

  function kitCreateSaveHTML() {
    return directCreateSaveHTML('kit');
  }

  function directCreateItemsErrorHTML(kind = 'kit') {
    const isKit = kind === 'kit';
    const message = String(isKit ? (state.kitCreateErrors?.items || '') : (state.proposalCreateErrors?.items || ''));
    const id = isKit ? 'kitCreateItemsError' : 'proposalCreateItemsError';
    return `<div class="direct-create-inline-error direct-create-inline-error--items ${isKit ? 'kit-create-inline-error kit-create-inline-error--items' : 'proposal-create-inline-error proposal-create-inline-error--items'}" id="${id}" aria-live="polite">${escapeHTML(message)}</div>`;
  }

  function kitCreateItemsErrorHTML() {
    return directCreateItemsErrorHTML('kit');
  }

  function syncDraftKitNameFromInput() {
    if (!state.kitCreateMode || !state.activeKit) return;
    const input = document.getElementById('kitEditNameInput');
    if (input) state.activeKit = { ...state.activeKit, name: String(input.value || '') };
  }

  function syncDraftProposalNameFromInput() {
    if (!state.proposalCreateMode || !state.activeProposal) return;
    const input = document.getElementById('proposalEditNameInput');
    if (input) state.activeProposal = { ...state.activeProposal, name: String(input.value || '') };
  }

  function clearKitCreateError(key) {
    if (!state.kitCreateErrors) state.kitCreateErrors = { name: '', items: '' };
    if (key) state.kitCreateErrors[key] = '';
  }

  function clearProposalCreateError(key) {
    if (!state.proposalCreateErrors) state.proposalCreateErrors = { name: '', items: '' };
    if (key) state.proposalCreateErrors[key] = '';
  }

  function proposalDetailHTML() {
    const proposal = state.activeProposal;
    const count = state.proposalItems.length;
    const editable = !!state.proposalEditMode;
    const createMode = !!state.proposalCreateMode;
    const separateMeta = separateCombinedMeta(proposal);
    const headerHTML = createMode
      ? `<header class="products-proposal-detail__head proposal-create-label-head">
          <div class="proposal-create-title-pill">
            <button type="button" class="products-back-btn" data-action="back-proposals" aria-label="Back to proposals"><i data-feather="arrow-left"></i></button>
            <span>Create New Proposal</span>
          </div>
        </header>`
      : `<header class="products-proposal-detail__head proposal-detail-head--compact">
          <button type="button" class="products-back-btn" data-action="back-proposals" aria-label="Back to proposals"><i data-feather="arrow-left"></i></button>
          <div class="proposal-detail-actions">
            <button type="button" class="btn b2b-download-primary proposal-download-btn" data-action="download-proposal"><i data-feather="download"></i><span>Download</span></button>
            <button type="button" class="products-btn products-btn--dark proposal-make-order-btn" data-action="open-make-order"><i data-feather="shopping-bag"></i><span>Make Order</span></button>
          </div>
        </header>`;
    return `
      ${headerHTML}
      ${!createMode ? combinedMetaCardHTML(proposal) : ''}
      ${editable ? editNameBlockHTML('proposal', createMode ? (proposal?.name || '') : (proposal?.name || 'Proposal'), { createMode, required: createMode, hideButton: createMode }) : ''}
      ${editable ? proposalLogicControlHTML() : ''}
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
          <div class="products-proposal-tool-title"><i data-feather="briefcase"></i><span>Add saved kit</span></div>
          <div class="products-proposal-control-grid proposals-kit-grid">
            ${kitSelectHTML('proposalKitSelect')}
            <label class="products-field products-field--qty"><span>Qty</span><input id="proposalKitQty" type="number" min="1" step="1" value="1" inputmode="numeric" /></label>
            <button type="button" class="products-btn products-btn--dark" data-action="add-proposal-kit"><i data-feather="plus"></i><span>Add Kit</span></button>
          </div>
        </div>
      </div>
      ${createMode ? directCreateItemsErrorHTML('proposal') : ''}` : `<div class="proposal-view-note"><i data-feather="eye"></i><span>View only. Use the 3-dot menu then Edit to modify this proposal.</span></div>`}
      <div class="products-proposal-table-card">
        <div class="products-proposal-table-head">
          <div><h3>Components table</h3><p>Saved products and quantities for this proposal.</p></div>
          <span>${formatNumber(count)} item${count === 1 ? '' : 's'}</span>
        </div>
        <div class="products-proposal-table-wrap">
          <table class="products-proposal-table ${separateMeta ? 'products-proposal-table--combined-separate' : ''}">
            ${proposalTableHeaderHTML(separateMeta)}
            <tbody>${renderItemRows(state.proposalItems, 'proposal', { separateMeta })}</tbody>
          </table>
        </div>
        ${totalBlockHTML(state.proposalItems)}
      </div>
      ${createMode ? directCreateSaveHTML('proposal') : ''}
    `;
  }

  function kitDetailHTML() {
    const kit = state.activeKit;
    const count = state.kitItems.length;
    const editable = !!state.kitEditMode;
    const createMode = !!state.kitCreateMode;
    const headerHTML = createMode
      ? `<header class="products-proposal-detail__head kit-create-label-head">
          <div class="kit-create-title-pill">
            <button type="button" class="products-back-btn" data-action="back-kits" aria-label="Back to kits"><i data-feather="arrow-left"></i></button>
            <span>Create New Kit</span>
          </div>
        </header>`
      : `<header class="products-proposal-detail__head">
          <button type="button" class="products-back-btn" data-action="back-kits" aria-label="Back to kits"><i data-feather="arrow-left"></i></button>
          <div>
            <h2>${escapeHTML(kit?.name || 'Kit')}</h2>
            <p>${formatNumber(count)} saved component${count === 1 ? '' : 's'}${editable ? ' • Edit mode' : ' • View only'}</p>
          </div>
        </header>`;
    return `
      ${headerHTML}
      ${editable ? editNameBlockHTML('kit', createMode ? (kit?.name || '') : (kit?.name || 'Kit'), { createMode, required: createMode, hideButton: createMode }) : ''}
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
      </div>
      ${createMode ? kitCreateItemsErrorHTML() : ''}` : `<div class="proposal-view-note"><i data-feather="eye"></i><span>View only. Use the 3-dot menu then Edit to modify this kit.</span></div>`}
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
      ${createMode ? kitCreateSaveHTML() : ''}
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
    syncDraftKitNameFromInput();
    els.kitDetail.innerHTML = kitDetailHTML();
    hydrateIcons(els.kitDetail);
  }

  function setTab(tab, options = {}) {
    state.tab = tab === 'kits' ? 'kits' : 'proposals';
    const isKits = state.tab === 'kits';
    if (els.proposalsPanel) els.proposalsPanel.hidden = isKits;
    if (els.kitsPanel) els.kitsPanel.hidden = !isKits;
    if (els.createProposalBtn) els.createProposalBtn.hidden = isKits;
    if (els.combineProposalsBtn) els.combineProposalsBtn.hidden = isKits;
    if (els.createKitBtn) els.createKitBtn.hidden = !isKits;
    document.querySelectorAll('.proposals-tab').forEach((btn) => {
      const active = btn.getAttribute('data-tab') === state.tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    restartProposalAnimation(isKits ? els.kitsPanel : els.proposalsPanel, 'proposal-panel-enter');
    if (options.skipLoad) return;
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
      restartProposalAnimation(els.proposalDetail, 'proposal-detail-enter');
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
      restartProposalAnimation(els.kitDetail, 'proposal-detail-enter');
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
    state.proposalCreateMode = false;
    state.proposalCreateErrors = { name: '', items: '' };
    state.proposalAdminPassword = '';
    if (els.proposalDetail) els.proposalDetail.hidden = true;
    if (els.proposalsList) {
      els.proposalsList.hidden = false;
      restartProposalAnimation(els.proposalsList, 'proposal-panel-enter');
    }
    renderProposalFolders();
  }

  function backToKits() {
    document.body.classList.remove('proposal-detail-open');
    state.activeKit = null;
    state.kitItems = [];
    state.kitEditMode = false;
    state.kitCreateMode = false;
    state.kitAdminPassword = '';
    state.kitCreateErrors = { name: '', items: '' };
    if (els.kitDetail) els.kitDetail.hidden = true;
    if (els.kitsList) {
      els.kitsList.hidden = false;
      restartProposalAnimation(els.kitsList, 'proposal-panel-enter');
    }
    renderKitFolders();
  }

  async function startNewFolder(kind) {
    const isKit = kind === 'kit';
    const password = await requestProductsAdminPassword({
      title: `Create New ${isKit ? 'Kit' : 'Proposal'}`,
      message: `Enter the Admin password to create a new ${isKit ? 'kit' : 'proposal'}.`,
    });
    if (!password) return;

    document.body.classList.add('proposal-detail-open');
    if (isKit) {
      state.kitCreateMode = true;
      state.kitEditMode = true;
      state.kitAdminPassword = password;
      state.activeKit = { id: '', name: '' };
      state.kitItems = [];
      state.kitCreateErrors = { name: '', items: '' };
      if (els.kitsList) els.kitsList.hidden = true;
      if (els.kitDetail) {
        els.kitDetail.hidden = false;
        renderKitDetail();
        restartProposalAnimation(els.kitDetail, 'proposal-detail-enter');
      }
    } else {
      state.proposalCreateMode = true;
      state.proposalEditMode = true;
      state.proposalAdminPassword = password;
      state.activeProposal = { id: '', name: '' };
      state.proposalItems = [];
      state.proposalCreateErrors = { name: '', items: '' };
      if (els.proposalsList) els.proposalsList.hidden = true;
      if (els.proposalDetail) {
        els.proposalDetail.hidden = false;
        renderProposalDetail();
        restartProposalAnimation(els.proposalDetail, 'proposal-detail-enter');
      }
    }
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

  function mergedDraftQuantity(existingQuantity, incomingQuantity, mergeLogic = 'add') {
    const existingQty = Math.max(1, Math.round(Number(existingQuantity) || 1));
    const incomingQty = Math.max(1, Math.round(Number(incomingQuantity) || 1));
    const logic = normalizeProposalMergeLogic(mergeLogic);
    if (logic === 'max') return Math.max(existingQty, incomingQty);
    if (logic === 'min') return Math.min(existingQty, incomingQty);
    return existingQty + incomingQty;
  }

  function upsertDraftProposalProduct(productId, quantity = 1, mergeLogic = 'add', fallback = {}) {
    const id = String(productId || fallback?.productId || fallback?.product_id || '').trim();
    if (!id) return false;
    const product = productById(id) || fallback || {};
    const existing = state.proposalItems.find((item) => String(item?.productId || item?.product_id || '').trim() === id);
    if (existing) {
      existing.quantity = mergedDraftQuantity(existing.quantity, quantity, mergeLogic);
      existing.updatedAt = new Date().toISOString();
      return true;
    }
    const tempId = `draft-proposal-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.proposalItems.push({
      id: tempId,
      proposalId: '',
      productId: id,
      productName: product?.name || product?.productName || product?.product_name || fallback?.productName || fallback?.product_name || 'Untitled Product',
      quantity: Math.max(1, Math.round(Number(quantity) || 1)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async function addProposalProduct() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    const productId = selectedValue('proposalProductSelect');
    const quantity = numericInputValue(document.getElementById('proposalProductQty'), 1);
    if (!productId) return toast('error', 'Proposals', 'Select a product first.');
    const mergeLogic = selectedProposalMergeLogic();
    if (state.proposalCreateMode) {
      syncDraftProposalNameFromInput();
      if (!upsertDraftProposalProduct(productId, quantity, mergeLogic)) return toast('error', 'Proposals', 'Product not found.');
      clearProposalCreateError('items');
      renderProposalDetail();
      return toast('success', 'Proposals', 'Product added to proposal draft.');
    }
    if (!proposalId) return toast('error', 'Proposals', 'Select a proposal first.');
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/items`, { method: 'POST', body: JSON.stringify({ productId, quantity, mergeLogic, logic: mergeLogic, quantityLogic: mergeLogic, adminPassword: state.proposalAdminPassword }) });
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
    if (!kitId) return toast('error', 'Proposals', 'Select a kit first.');
    const mergeLogic = selectedProposalMergeLogic();
    if (state.proposalCreateMode) {
      syncDraftProposalNameFromInput();
      try {
        const data = await api(`/api/products/kits/${encodeURIComponent(kitId)}?_ts=${Date.now()}`);
        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) return toast('error', 'Proposals', 'This kit has no components yet.');
        let addedCount = 0;
        items.forEach((item) => {
          const productId = String(item?.productId || item?.product_id || '').trim();
          const itemQty = Math.max(1, Math.round(Number(item?.quantity || 1) || 1)) * quantity;
          if (upsertDraftProposalProduct(productId, itemQty, mergeLogic, item)) addedCount += 1;
        });
        if (!addedCount) return toast('error', 'Proposals', 'This kit has no valid components.');
        clearProposalCreateError('items');
        renderProposalDetail();
        return toast('success', 'Proposals', `Added ${formatNumber(addedCount)} kit components to proposal draft.`);
      } catch (error) { return toast('error', 'Proposals', error?.message || 'Failed to add kit.'); }
    }
    if (!proposalId) return toast('error', 'Proposals', 'Select a proposal first.');
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/items/by-kit`, { method: 'POST', body: JSON.stringify({ kitId, quantity, mergeLogic, logic: mergeLogic, quantityLogic: mergeLogic, adminPassword: state.proposalAdminPassword }) });
      state.activeProposal = data.proposal || state.activeProposal;
      state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
      renderProposalDetail();
      await loadProposals();
      toast('success', 'Proposals', `Added ${formatNumber(data?.addedCount || 0)} kit components.`);
    } catch (error) { toast('error', 'Proposals', error?.message || 'Failed to add kit.'); }
  }

  function productById(productId) {
    const id = String(productId || '').trim();
    if (!id) return null;
    return (Array.isArray(state.products) ? state.products : []).find((product) => String(product?.id || '').trim() === id) || null;
  }

  function upsertDraftKitProduct(productId, quantity = 1) {
    const product = productById(productId);
    if (!product) return false;
    const id = String(product?.id || '').trim();
    const existing = state.kitItems.find((item) => String(item?.productId || item?.product_id || '').trim() === id);
    if (existing) {
      existing.quantity = Math.max(1, Math.round((Number(existing.quantity || 0) || 0) + (Number(quantity) || 1)));
      existing.updatedAt = new Date().toISOString();
      return true;
    }
    const tempId = `draft-kit-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.kitItems.push({
      id: tempId,
      kitId: '',
      productId: id,
      productName: product?.name || product?.productName || product?.product_name || 'Untitled Product',
      quantity: Math.max(1, Math.round(Number(quantity) || 1)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async function addKitProduct() {
    const kitId = String(state.activeKit?.id || '').trim();
    const productId = selectedValue('kitProductSelect');
    const quantity = numericInputValue(document.getElementById('kitProductQty'), 1);
    if (!productId) return toast('error', 'Kits', 'Select a product first.');
    if (state.kitCreateMode) {
      syncDraftKitNameFromInput();
      if (!upsertDraftKitProduct(productId, quantity)) return toast('error', 'Kits', 'Product not found.');
      clearKitCreateError('items');
      renderKitDetail();
      return toast('success', 'Kits', 'Product added to kit draft.');
    }
    if (!kitId) return toast('error', 'Kits', 'Select a kit first.');
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
    if (isKit && state.kitCreateMode) {
      syncDraftKitNameFromInput();
      const item = state.kitItems.find((entry) => String(entry?.id || '').trim() === String(itemId || '').trim());
      if (!item) return;
      item.quantity = quantity;
      item.updatedAt = new Date().toISOString();
      renderKitDetail();
      return toast('success', 'Kits', 'Quantity updated.');
    }
    if (!isKit && state.proposalCreateMode) {
      syncDraftProposalNameFromInput();
      const item = state.proposalItems.find((entry) => String(entry?.id || '').trim() === String(itemId || '').trim());
      if (!item) return;
      item.quantity = quantity;
      item.updatedAt = new Date().toISOString();
      renderProposalDetail();
      return toast('success', 'Proposals', 'Quantity updated.');
    }
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
    if (isKit && state.kitCreateMode) {
      syncDraftKitNameFromInput();
      state.kitItems = state.kitItems.filter((entry) => String(entry?.id || '').trim() !== String(itemId || '').trim());
      if (state.kitItems.length) clearKitCreateError('items');
      renderKitDetail();
      return toast('success', 'Kits', 'Component removed.');
    }
    if (!isKit && state.proposalCreateMode) {
      syncDraftProposalNameFromInput();
      state.proposalItems = state.proposalItems.filter((entry) => String(entry?.id || '').trim() !== String(itemId || '').trim());
      if (state.proposalItems.length) clearProposalCreateError('items');
      renderProposalDetail();
      return toast('success', 'Proposals', 'Component removed.');
    }
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
    const title = isKit ? 'Kits' : 'Proposals';
    const requiredMessage = isKit ? 'Kit name is required.' : 'Proposal name is required.';
    const isCreateMode = (isKit && state.kitCreateMode) || (!isKit && state.proposalCreateMode);
    if (!name && !isCreateMode) {
      if (input) input.focus();
      return toast('error', title, requiredMessage);
    }

    if (isCreateMode) {
      if (isKit) syncDraftKitNameFromInput();
      else syncDraftProposalNameFromInput();
      const draftItems = isKit ? state.kitItems.slice() : state.proposalItems.slice();
      const errors = { name: '', items: '' };
      const hasName = !!name;
      const hasItems = draftItems.length > 0;
      if (!hasName) errors.name = isKit ? 'Kit name is required.' : 'Proposal name is required.';
      if (!hasItems) errors.items = isKit ? 'Add at least one component before saving the kit.' : 'Add at least one component before saving the proposal.';
      if (isKit) state.kitCreateErrors = errors;
      else state.proposalCreateErrors = errors;
      if (!hasName || !hasItems) {
        if (isKit) renderKitDetail();
        else renderProposalDetail();
        if (!hasName) setTimeout(() => document.getElementById(isKit ? 'kitEditNameInput' : 'proposalEditNameInput')?.focus(), 40);
        return;
      }
      try {
        const createdData = await api(isKit ? '/api/products/kits' : '/api/products/proposals', {
          method: 'POST',
          body: JSON.stringify({ name, adminPassword: isKit ? state.kitAdminPassword : state.proposalAdminPassword }),
        });
        if (isKit) {
          const createdKitId = String(createdData?.kit?.id || '').trim();
          if (!createdKitId) throw new Error('Kit was created but the kit ID was not returned.');
          for (const item of draftItems) {
            const productId = String(item?.productId || item?.product_id || '').trim();
            if (!productId) continue;
            await api(`/api/products/kits/${encodeURIComponent(createdKitId)}/items`, {
              method: 'POST',
              body: JSON.stringify({ productId, quantity: item?.quantity || 1, adminPassword: state.kitAdminPassword }),
            });
          }
          state.kitCreateMode = false;
          state.kitCreateErrors = { name: '', items: '' };
          await loadKits();
          backToKits();
          toast('success', title, 'Kit saved successfully.');
        } else {
          const createdProposalId = String(createdData?.proposal?.id || '').trim();
          if (!createdProposalId) throw new Error('Proposal was created but the proposal ID was not returned.');
          for (const item of draftItems) {
            const productId = String(item?.productId || item?.product_id || '').trim();
            if (!productId) continue;
            await api(`/api/products/proposals/${encodeURIComponent(createdProposalId)}/items`, {
              method: 'POST',
              body: JSON.stringify({ productId, quantity: item?.quantity || 1, mergeLogic: 'add', logic: 'add', quantityLogic: 'add', adminPassword: state.proposalAdminPassword }),
            });
          }
          state.proposalCreateMode = false;
          state.proposalCreateErrors = { name: '', items: '' };
          await loadProposals();
          backToProposals();
          toast('success', title, 'Proposal saved successfully.');
        }
      } catch (error) {
        toast('error', title, error?.message || `Failed to create ${isKit ? 'kit' : 'proposal'}.`);
      }
      return;
    }

    if (!id) return toast('error', title, requiredMessage);
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
    const ok = await requestProposalDeleteConfirmation({ kind, name: folder.name || label });
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

  function resetMakeOrderMemberSelect() {
    if (els.makeOrderMember) els.makeOrderMember.value = '';
    const root = els.makeOrderMemberRoot;
    const label = root?.querySelector('.proposal-search-select__value');
    const menu = root?.querySelector('.proposal-search-select__menu');
    const toggle = root?.querySelector('.proposal-search-select__button');
    if (label) label.textContent = 'Select team member';
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (root) root.classList.remove('is-open');
  }

  async function openMakeOrderModal() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    if (!proposalId) return;
    state.pendingOrderProposalId = proposalId;
    try { await loadTeamMembersForOrder(); } catch (error) { return toast('error', 'Make order', error?.message || 'Failed to load team members.'); }
    if (els.makeOrderMemberOptions) {
      els.makeOrderMemberOptions.innerHTML = state.teamMembers.length
        ? state.teamMembers.map((m) => {
            const label = `${m.name || 'Unnamed'}${m.department ? ` — ${m.department}` : ''}`;
            return `<button type="button" class="proposal-search-select__option" data-action="choose-search-option" data-value="${escapeHTML(m.id)}" data-label="${escapeHTML(label)}"><span>${escapeHTML(label)}</span>${m.position ? `<small>${escapeHTML(m.position)}</small>` : ''}</button>`;
          }).join('')
        : `<div class="proposal-search-select__empty">No team members available</div>`;
    }
    resetMakeOrderMemberSelect();
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
    document.body.classList.remove('products-modal-open');
  }

  async function submitMakeOrder(event) {
    event.preventDefault();
    const proposalId = String(state.pendingOrderProposalId || state.activeProposal?.id || '').trim();
    const teamMemberId = String(els.makeOrderMember?.value || '').trim();
    const adminPassword = String(els.makeOrderPassword?.value || '').trim();
    if (!proposalId || !teamMemberId || !adminPassword) {
      if (els.makeOrderError) els.makeOrderError.textContent = 'Select a team member and enter the Admin password.';
      return;
    }
    try {
      const data = await api(`/api/products/proposals/${encodeURIComponent(proposalId)}/make-order`, { method: 'POST', body: JSON.stringify({ teamMemberId, adminPassword }) });
      closeMakeOrderModal();
      toast('success', 'Make order', `Created ${data.orderId || 'order'} with ${formatNumber(data.count || 0)} item(s).`);
    } catch (error) {
      if (els.makeOrderError) els.makeOrderError.textContent = error?.message || 'Failed to create order.';
      toast('error', 'Make order', error?.message || 'Failed to create order.');
    }
  }


  const ProposalExportModal = (() => {
    let ui = null;
    let resolver = null;
    let currentColumnDefs = PROPOSAL_EXPORT_COLUMNS;

    const ensure = () => {
      if (ui) return ui;
      const modal = document.createElement('div');
      modal.className = 'ops-export-modal hidden proposal-export-modal';
      modal.id = 'proposalExportModal';
      modal.innerHTML = `
        <div class="ops-export-modal__backdrop" data-proposal-export-cancel></div>
        <div class="ops-export-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="proposalExportTitle">
          <div class="ops-export-modal__header">
            <div class="ops-export-modal__icon" aria-hidden="true"><i data-feather="download"></i></div>
            <div>
              <h3 class="ops-export-modal__title" id="proposalExportTitle">Download proposal file</h3>
              <p class="ops-export-modal__hint">Choose the file type and the columns that should appear in the file.</p>
            </div>
            <button class="ops-export-modal__close" type="button" aria-label="Close" data-proposal-export-cancel>&times;</button>
          </div>
          <div class="ops-export-modal__body">
            <div class="ops-export-field ops-export-filetype" data-proposal-export-filetype-picker>
              <span class="ops-export-field__label">File type</span>
              <input type="hidden" data-proposal-export-filetype value="pdf" />
              <button class="ops-export-picker-button" type="button" data-proposal-export-filetype-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-proposal-export-filetype-summary>PDF</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="ops-export-filetype__panel ops-export-floating-panel" data-proposal-export-filetype-panel role="listbox" aria-label="File type" hidden>
                <button class="ops-export-option is-selected" type="button" data-proposal-export-filetype-option="pdf" role="option" aria-selected="true">
                  <span>PDF</span>
                  <i data-feather="check" aria-hidden="true"></i>
                </button>
                <button class="ops-export-option" type="button" data-proposal-export-filetype-option="excel" role="option" aria-selected="false">
                  <span>Excel</span>
                  <i data-feather="check" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="ops-export-field ops-export-multiselect" data-proposal-export-column-picker>
              <span class="ops-export-field__label">Columns</span>
              <button class="ops-export-multiselect__button" type="button" data-proposal-export-column-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-proposal-export-column-summary>Columns selected</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="ops-export-multiselect__panel ops-export-floating-panel" data-proposal-export-column-panel role="listbox" aria-label="Columns" hidden>
                <div class="ops-export-columns" data-proposal-export-columns></div>
              </div>
            </div>
            <div class="ops-export-modal__error" data-proposal-export-error>Please choose at least one column.</div>
          </div>
          <div class="ops-export-modal__footer">
            <button class="btn btn--light" type="button" data-proposal-export-cancel>Cancel</button>
            <button class="btn ops-export-confirm" type="button" data-proposal-export-confirm>
              <i data-feather="download"></i>
              <span>Download</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const fileType = modal.querySelector('[data-proposal-export-filetype]');
      const columnsWrap = modal.querySelector('[data-proposal-export-columns]');
      const err = modal.querySelector('[data-proposal-export-error]');
      const confirm = modal.querySelector('[data-proposal-export-confirm]');
      const cancelEls = Array.from(modal.querySelectorAll('[data-proposal-export-cancel]'));
      const columnPicker = modal.querySelector('[data-proposal-export-column-picker]');
      const columnToggle = modal.querySelector('[data-proposal-export-column-toggle]');
      const columnPanel = modal.querySelector('[data-proposal-export-column-panel]');
      const columnSummary = modal.querySelector('[data-proposal-export-column-summary]');
      const fileTypePicker = modal.querySelector('[data-proposal-export-filetype-picker]');
      const fileTypeToggle = modal.querySelector('[data-proposal-export-filetype-toggle]');
      const fileTypePanel = modal.querySelector('[data-proposal-export-filetype-panel]');
      const fileTypeSummary = modal.querySelector('[data-proposal-export-filetype-summary]');
      const fileTypeOptions = Array.from(modal.querySelectorAll('[data-proposal-export-filetype-option]'));

      const checks = () => Array.from(columnsWrap?.querySelectorAll('input[type="checkbox"]') || []);

      const positionFloatingPanel = (toggle, panel) => {
        if (!toggle || !panel || panel.hidden) return;
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        const rect = toggle.getBoundingClientRect();
        const margin = 12;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const panelWidth = Math.min(rect.width, Math.max(0, viewportWidth - (margin * 2)));
        const left = Math.min(Math.max(rect.left, margin), Math.max(margin, viewportWidth - panelWidth - margin));
        const belowSpace = viewportHeight - rect.bottom - margin;
        const aboveSpace = rect.top - margin;
        const shouldOpenUp = belowSpace < 230 && aboveSpace > belowSpace;
        const maxHeight = Math.max(160, Math.min(340, (shouldOpenUp ? aboveSpace : belowSpace) - 8));
        panel.style.width = `${panelWidth}px`;
        panel.style.left = `${left}px`;
        panel.style.maxHeight = `${maxHeight}px`;
        if (shouldOpenUp) {
          panel.style.top = 'auto';
          panel.style.bottom = `${Math.max(margin, viewportHeight - rect.top + 8)}px`;
        } else {
          panel.style.top = `${Math.min(rect.bottom + 8, viewportHeight - margin)}px`;
          panel.style.bottom = 'auto';
        }
      };

      const setFloatingPanelOpen = (toggle, panel, open) => {
        if (!toggle || !panel) return;
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.classList.toggle('is-open', !!open);
        if (open) {
          positionFloatingPanel(toggle, panel);
          requestAnimationFrame(() => positionFloatingPanel(toggle, panel));
        }
      };

      const updateFileTypeSummary = () => {
        const value = String(fileType?.value || 'pdf').toLowerCase();
        const label = value === 'excel' ? 'Excel' : 'PDF';
        if (fileTypeSummary) fileTypeSummary.textContent = label;
        fileTypeOptions.forEach((option) => {
          const selected = option.dataset.proposalExportFiletypeOption === value;
          option.classList.toggle('is-selected', selected);
          option.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
      };

      const selectedLabels = () => checks()
        .filter((x) => x.checked)
        .map((x) => currentColumnDefs.find((col) => col.value === x.value)?.label || x.value);

      const updateColumnSummary = () => {
        const labels = selectedLabels();
        if (columnSummary) columnSummary.textContent = labels.length ? labels.join(', ') : 'Select columns';
        if (err && labels.length) err.style.display = 'none';
      };

      const setFileTypePanelOpen = (open) => {
        if (open) setColumnPanelOpen(false);
        setFloatingPanelOpen(fileTypeToggle, fileTypePanel, open);
      };

      const setColumnPanelOpen = (open) => {
        if (open) setFileTypePanelOpen(false);
        setFloatingPanelOpen(columnToggle, columnPanel, open);
      };

      const close = (value = null) => {
        setFileTypePanelOpen(false);
        setColumnPanelOpen(false);
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        if (resolver) {
          const done = resolver;
          resolver = null;
          done(value);
        }
      };

      const renderColumns = (columns) => {
        if (!columnsWrap) return;
        currentColumnDefs = Array.isArray(columns) && columns.length ? columns : PROPOSAL_EXPORT_COLUMNS;
        columnsWrap.innerHTML = currentColumnDefs.map((col) => `
          <label class="ops-export-check" role="option">
            <input type="checkbox" value="${escapeHTML(col.value)}" ${col.checked ? 'checked' : ''} />
            <span>${escapeHTML(col.label)}</span>
          </label>
        `).join('');
        checks().forEach((input) => input.addEventListener('change', updateColumnSummary));
      };

      cancelEls.forEach((el) => el.addEventListener('click', () => close(null)));
      modal.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (fileTypePanel && !fileTypePanel.hidden) return setFileTypePanelOpen(false);
        if (columnPanel && !columnPanel.hidden) return setColumnPanelOpen(false);
        close(null);
      });
      fileTypeToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setFileTypePanelOpen(!!fileTypePanel?.hidden);
      });
      fileTypePanel?.addEventListener('click', (e) => e.stopPropagation());
      fileTypeOptions.forEach((option) => {
        option.addEventListener('click', () => {
          if (fileType) fileType.value = option.dataset.proposalExportFiletypeOption || 'pdf';
          updateFileTypeSummary();
          setFileTypePanelOpen(false);
        });
      });
      columnToggle?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setColumnPanelOpen(!!columnPanel?.hidden);
      });
      columnPanel?.addEventListener('click', (e) => e.stopPropagation());
      document.addEventListener('click', (e) => {
        if (modal.classList.contains('hidden')) return;
        const target = e.target;
        const insideFileType = fileTypePicker?.contains(target) || fileTypePanel?.contains(target);
        const insideColumns = columnPicker?.contains(target) || columnPanel?.contains(target);
        if (insideFileType || insideColumns) return;
        setFileTypePanelOpen(false);
        setColumnPanelOpen(false);
      });
      const repositionOpenPanels = () => {
        if (modal.classList.contains('hidden')) return;
        positionFloatingPanel(fileTypeToggle, fileTypePanel);
        positionFloatingPanel(columnToggle, columnPanel);
      };
      window.addEventListener('resize', repositionOpenPanels);
      window.addEventListener('scroll', repositionOpenPanels, true);
      confirm?.addEventListener('click', () => {
        const selected = checks().filter((x) => x.checked).map((x) => x.value);
        if (!selected.length) {
          if (err) err.style.display = 'block';
          setColumnPanelOpen(true);
          return;
        }
        if (err) err.style.display = 'none';
        close({ fileType: String(fileType?.value || 'pdf').toLowerCase(), columns: selected });
      });

      ui = { modal, fileType, renderColumns, updateFileTypeSummary, updateColumnSummary, setFileTypePanelOpen, setColumnPanelOpen };
      hydrateIcons(modal);
      return ui;
    };

    return {
      open: () => new Promise((resolve) => {
        const x = ensure();
        resolver = resolve;
        if (x.fileType) x.fileType.value = 'pdf';
        x.renderColumns(PROPOSAL_EXPORT_COLUMNS.map((col) => ({ ...col })));
        x.updateFileTypeSummary();
        x.updateColumnSummary();
        x.modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => x.modal.querySelector('[data-proposal-export-filetype-toggle]')?.focus());
      }),
    };
  })();

  const CombineNameModal = (() => {
    let ui = null;
    let resolver = null;

    const ensure = () => {
      if (ui) return ui;
      const modal = document.createElement('div');
      modal.className = 'ops-export-modal hidden proposal-combine-name-modal';
      modal.innerHTML = `
        <div class="ops-export-modal__backdrop" data-combine-name-cancel></div>
        <form class="ops-export-modal__dialog proposal-combine-name-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="combineNameTitle">
          <div class="ops-export-modal__header">
            <div class="ops-export-modal__icon" aria-hidden="true"><i data-feather="folder-plus"></i></div>
            <div>
              <h3 class="ops-export-modal__title" id="combineNameTitle">Save as new proposal</h3>
              <p class="ops-export-modal__hint">Write a name for the combined proposal.</p>
            </div>
            <button class="ops-export-modal__close" type="button" aria-label="Close" data-combine-name-cancel>&times;</button>
          </div>
          <div class="ops-export-modal__body">
            <label class="products-field products-field--wide proposal-combine-name-field">
              <span>Proposal name <em>*</em></span>
              <input type="text" data-combine-name-input autocomplete="off" placeholder="Example: Combined school proposal" />
            </label>
            <div class="ops-export-modal__error" data-combine-name-error>Proposal name is required.</div>
          </div>
          <div class="ops-export-modal__footer">
            <button class="btn btn--light" type="button" data-combine-name-cancel>Cancel</button>
            <button class="btn ops-export-confirm" type="submit"><i data-feather="save"></i><span>Save proposal</span></button>
          </div>
        </form>
      `;
      document.body.appendChild(modal);
      const form = modal.querySelector('form');
      const input = modal.querySelector('[data-combine-name-input]');
      const error = modal.querySelector('[data-combine-name-error]');
      const close = (value = null) => {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        if (resolver) {
          const done = resolver;
          resolver = null;
          done(value);
        }
      };
      modal.querySelectorAll('[data-combine-name-cancel]').forEach((el) => el.addEventListener('click', () => close(null)));
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = String(input?.value || '').trim();
        if (!name) {
          if (error) error.style.display = 'block';
          input?.focus();
          return;
        }
        if (error) error.style.display = 'none';
        close(name);
      });
      modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(null); });
      ui = { modal, input, error };
      hydrateIcons(modal);
      return ui;
    };

    return {
      open: () => new Promise((resolve) => {
        const x = ensure();
        resolver = resolve;
        if (x.input) x.input.value = '';
        if (x.error) x.error.style.display = 'none';
        x.modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        setTimeout(() => x.input?.focus(), 40);
      }),
    };
  })();

  const CombineProposalsModal = (() => {
    let ui = null;
    let resolver = null;
    let currentColumnDefs = PROPOSAL_EXPORT_COLUMNS;

    const ensure = () => {
      if (ui) return ui;
      const modal = document.createElement('div');
      modal.className = 'ops-export-modal hidden proposal-combine-modal';
      modal.id = 'proposalCombineModal';
      modal.innerHTML = `
        <div class="ops-export-modal__backdrop" data-combine-cancel></div>
        <div class="ops-export-modal__dialog proposal-combine-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="proposalCombineTitle">
          <div class="ops-export-modal__header">
            <div class="ops-export-modal__icon" aria-hidden="true"><i data-feather="git-merge"></i></div>
            <div>
              <h3 class="ops-export-modal__title" id="proposalCombineTitle">Combine proposals</h3>
              <p class="ops-export-modal__hint">Choose more than one proposal, then download one combined file or save the result as a new proposal.</p>
            </div>
            <button class="ops-export-modal__close" type="button" aria-label="Close" data-combine-cancel>&times;</button>
          </div>
          <div class="ops-export-modal__body">
            <div class="ops-export-field ops-export-multiselect" data-combine-proposal-picker>
              <span class="ops-export-field__label">Proposals</span>
              <button class="ops-export-multiselect__button" type="button" data-combine-proposal-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-combine-proposal-summary>Select proposals</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="ops-export-multiselect__panel ops-export-floating-panel proposal-combine-list-panel" data-combine-proposal-panel role="listbox" aria-label="Proposals" hidden>
                <div class="ops-export-columns proposal-combine-proposal-list" data-combine-proposals></div>
              </div>
            </div>
            <div class="ops-export-field ops-export-filetype" data-combine-logic-picker>
              <span class="ops-export-field__label">Combine logic</span>
              <input type="hidden" data-combine-logic value="add" />
              <button class="ops-export-picker-button" type="button" data-combine-logic-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-combine-logic-summary>Add logic</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="ops-export-filetype__panel ops-export-floating-panel" data-combine-logic-panel role="listbox" aria-label="Combine logic" hidden>
                <button class="ops-export-option is-selected" type="button" data-combine-logic-option="add" role="option" aria-selected="true"><span>Add logic</span><i data-feather="check"></i></button>
                <button class="ops-export-option" type="button" data-combine-logic-option="separate" role="option" aria-selected="false"><span>Separate logic</span><i data-feather="check"></i></button>
              </div>
            </div>
            <div class="ops-export-field ops-export-filetype" data-combine-filetype-picker>
              <span class="ops-export-field__label">File type</span>
              <input type="hidden" data-combine-filetype value="pdf" />
              <button class="ops-export-picker-button" type="button" data-combine-filetype-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-combine-filetype-summary>PDF</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="ops-export-filetype__panel ops-export-floating-panel" data-combine-filetype-panel role="listbox" aria-label="File type" hidden>
                <button class="ops-export-option is-selected" type="button" data-combine-filetype-option="pdf" role="option" aria-selected="true"><span>PDF</span><i data-feather="check"></i></button>
                <button class="ops-export-option" type="button" data-combine-filetype-option="excel" role="option" aria-selected="false"><span>Excel</span><i data-feather="check"></i></button>
              </div>
            </div>
            <div class="ops-export-field ops-export-multiselect" data-combine-column-picker>
              <span class="ops-export-field__label">Columns</span>
              <button class="ops-export-multiselect__button" type="button" data-combine-column-toggle aria-haspopup="listbox" aria-expanded="false">
                <span data-combine-column-summary>Columns selected</span>
                <i data-feather="chevron-down" aria-hidden="true"></i>
              </button>
              <div class="ops-export-multiselect__panel ops-export-floating-panel" data-combine-column-panel role="listbox" aria-label="Columns" hidden>
                <div class="ops-export-columns" data-combine-columns></div>
              </div>
            </div>
            <div class="ops-export-modal__error" data-combine-error>Please select at least two proposals and one column.</div>
          </div>
          <div class="ops-export-modal__footer proposal-combine-modal__footer">
            <button class="btn btn--light" type="button" data-combine-cancel>Cancel</button>
            <button class="btn btn--light proposal-combine-save-btn" type="button" data-combine-save><i data-feather="save"></i><span>Save as new proposal</span></button>
            <button class="btn ops-export-confirm" type="button" data-combine-download><i data-feather="download"></i><span>Download</span></button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const proposalsWrap = modal.querySelector('[data-combine-proposals]');
      const proposalToggle = modal.querySelector('[data-combine-proposal-toggle]');
      const proposalPanel = modal.querySelector('[data-combine-proposal-panel]');
      const proposalSummary = modal.querySelector('[data-combine-proposal-summary]');
      const proposalPicker = modal.querySelector('[data-combine-proposal-picker]');
      const logic = modal.querySelector('[data-combine-logic]');
      const logicToggle = modal.querySelector('[data-combine-logic-toggle]');
      const logicPanel = modal.querySelector('[data-combine-logic-panel]');
      const logicSummary = modal.querySelector('[data-combine-logic-summary]');
      const logicPicker = modal.querySelector('[data-combine-logic-picker]');
      const logicOptions = Array.from(modal.querySelectorAll('[data-combine-logic-option]'));
      const fileType = modal.querySelector('[data-combine-filetype]');
      const fileTypeToggle = modal.querySelector('[data-combine-filetype-toggle]');
      const fileTypePanel = modal.querySelector('[data-combine-filetype-panel]');
      const fileTypeSummary = modal.querySelector('[data-combine-filetype-summary]');
      const fileTypePicker = modal.querySelector('[data-combine-filetype-picker]');
      const fileTypeOptions = Array.from(modal.querySelectorAll('[data-combine-filetype-option]'));
      const columnsWrap = modal.querySelector('[data-combine-columns]');
      const columnToggle = modal.querySelector('[data-combine-column-toggle]');
      const columnPanel = modal.querySelector('[data-combine-column-panel]');
      const columnSummary = modal.querySelector('[data-combine-column-summary]');
      const columnPicker = modal.querySelector('[data-combine-column-picker]');
      const error = modal.querySelector('[data-combine-error]');
      const download = modal.querySelector('[data-combine-download]');
      const save = modal.querySelector('[data-combine-save]');

      const proposalChecks = () => Array.from(proposalsWrap?.querySelectorAll('input[type="checkbox"]') || []);
      const columnChecks = () => Array.from(columnsWrap?.querySelectorAll('input[type="checkbox"]') || []);

      const positionFloatingPanel = (toggle, panel) => {
        if (!toggle || !panel || panel.hidden) return;
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        const rect = toggle.getBoundingClientRect();
        const margin = 12;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const panelWidth = Math.min(Math.max(rect.width, 260), Math.max(0, viewportWidth - (margin * 2)));
        const left = Math.min(Math.max(rect.left, margin), Math.max(margin, viewportWidth - panelWidth - margin));
        const belowSpace = viewportHeight - rect.bottom - margin;
        const aboveSpace = rect.top - margin;
        const shouldOpenUp = belowSpace < 240 && aboveSpace > belowSpace;
        const maxHeight = Math.max(170, Math.min(360, (shouldOpenUp ? aboveSpace : belowSpace) - 8));
        panel.style.width = `${panelWidth}px`;
        panel.style.left = `${left}px`;
        panel.style.maxHeight = `${maxHeight}px`;
        if (shouldOpenUp) {
          panel.style.top = 'auto';
          panel.style.bottom = `${Math.max(margin, viewportHeight - rect.top + 8)}px`;
        } else {
          panel.style.top = `${Math.min(rect.bottom + 8, viewportHeight - margin)}px`;
          panel.style.bottom = 'auto';
        }
      };

      const setPanelOpen = (toggle, panel, open) => {
        if (!toggle || !panel) return;
        if (panel.parentElement !== document.body) document.body.appendChild(panel);
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.classList.toggle('is-open', !!open);
        if (open) {
          [
            [proposalToggle, proposalPanel],
            [logicToggle, logicPanel],
            [fileTypeToggle, fileTypePanel],
            [columnToggle, columnPanel],
          ].forEach(([otherToggle, otherPanel]) => {
            if (otherPanel !== panel) setPanelOpen(otherToggle, otherPanel, false);
          });
          positionFloatingPanel(toggle, panel);
          requestAnimationFrame(() => positionFloatingPanel(toggle, panel));
        }
      };

      const selectedProposalLabels = () => proposalChecks().filter((x) => x.checked).map((x) => x.dataset.label || x.value);
      const selectedColumnLabels = () => columnChecks().filter((x) => x.checked).map((x) => currentColumnDefs.find((col) => col.value === x.value)?.label || x.value);

      const updateProposalSummary = () => {
        const labels = selectedProposalLabels();
        if (proposalSummary) proposalSummary.textContent = labels.length ? labels.join(', ') : 'Select proposals';
        if (error && labels.length >= 2 && selectedColumnLabels().length) error.style.display = 'none';
      };
      const updateColumnSummary = () => {
        const labels = selectedColumnLabels();
        if (columnSummary) columnSummary.textContent = labels.length ? labels.join(', ') : 'Select columns';
        if (error && labels.length && selectedProposalLabels().length >= 2) error.style.display = 'none';
      };
      const updateLogicSummary = () => {
        const value = normalizeCombineLogic(logic?.value || 'add');
        if (logic) logic.value = value;
        if (logicSummary) logicSummary.textContent = combineLogicLabel(value);
        logicOptions.forEach((option) => {
          const selected = normalizeCombineLogic(option.dataset.combineLogicOption) === value;
          option.classList.toggle('is-selected', selected);
          option.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
      };
      const updateFileTypeSummary = () => {
        const value = String(fileType?.value || 'pdf').toLowerCase() === 'excel' ? 'excel' : 'pdf';
        if (fileType) fileType.value = value;
        if (fileTypeSummary) fileTypeSummary.textContent = value === 'excel' ? 'Excel' : 'PDF';
        fileTypeOptions.forEach((option) => {
          const selected = option.dataset.combineFiletypeOption === value;
          option.classList.toggle('is-selected', selected);
          option.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
      };

      const renderProposals = (proposals) => {
        const list = Array.isArray(proposals) ? proposals : [];
        if (!proposalsWrap) return;
        proposalsWrap.innerHTML = list.length ? list.map((proposal) => {
          const id = String(proposal?.id || '').trim();
          const name = String(proposal?.name || 'Untitled Proposal').trim() || 'Untitled Proposal';
          const count = Number(proposal?.itemsCount || 0) || 0;
          return `
            <label class="ops-export-check proposal-combine-check" role="option">
              <input type="checkbox" value="${escapeHTML(id)}" data-label="${escapeHTML(name)}" />
              <span><strong>${escapeHTML(name)}</strong><small>${escapeHTML(formatNumber(count))} component${count === 1 ? '' : 's'}</small></span>
            </label>`;
        }).join('') : `<div class="proposal-search-select__empty">No proposals available</div>`;
        proposalChecks().forEach((input) => input.addEventListener('change', updateProposalSummary));
      };

      const renderColumns = (columns) => {
        currentColumnDefs = Array.isArray(columns) && columns.length ? columns : PROPOSAL_EXPORT_COLUMNS;
        if (!columnsWrap) return;
        columnsWrap.innerHTML = currentColumnDefs.map((col) => `
          <label class="ops-export-check" role="option">
            <input type="checkbox" value="${escapeHTML(col.value)}" ${col.checked ? 'checked' : ''} />
            <span>${escapeHTML(col.label)}</span>
          </label>
        `).join('');
        columnChecks().forEach((input) => input.addEventListener('change', updateColumnSummary));
      };

      const close = (value = null) => {
        [
          [proposalToggle, proposalPanel],
          [logicToggle, logicPanel],
          [fileTypeToggle, fileTypePanel],
          [columnToggle, columnPanel],
        ].forEach(([toggle, panel]) => setPanelOpen(toggle, panel, false));
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
        if (resolver) {
          const done = resolver;
          resolver = null;
          done(value);
        }
      };

      const currentPayload = (action) => {
        const proposalIds = proposalChecks().filter((x) => x.checked).map((x) => x.value).filter(Boolean);
        const columns = columnChecks().filter((x) => x.checked).map((x) => x.value).filter(Boolean);
        if (proposalIds.length < 2 || !columns.length) {
          if (error) error.style.display = 'block';
          if (proposalIds.length < 2) setPanelOpen(proposalToggle, proposalPanel, true);
          else setPanelOpen(columnToggle, columnPanel, true);
          return null;
        }
        if (error) error.style.display = 'none';
        return {
          action,
          proposalIds,
          combineLogic: normalizeCombineLogic(logic?.value || 'add'),
          fileType: String(fileType?.value || 'pdf').toLowerCase() === 'excel' ? 'excel' : 'pdf',
          columns,
        };
      };

      modal.querySelectorAll('[data-combine-cancel]').forEach((el) => el.addEventListener('click', () => close(null)));
      proposalToggle?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); setPanelOpen(proposalToggle, proposalPanel, !!proposalPanel?.hidden); });
      logicToggle?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); setPanelOpen(logicToggle, logicPanel, !!logicPanel?.hidden); });
      fileTypeToggle?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); setPanelOpen(fileTypeToggle, fileTypePanel, !!fileTypePanel?.hidden); });
      columnToggle?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); setPanelOpen(columnToggle, columnPanel, !!columnPanel?.hidden); });
      [proposalPanel, logicPanel, fileTypePanel, columnPanel].forEach((panel) => panel?.addEventListener('click', (event) => event.stopPropagation()));
      logicOptions.forEach((option) => option.addEventListener('click', () => { if (logic) logic.value = option.dataset.combineLogicOption || 'add'; updateLogicSummary(); setPanelOpen(logicToggle, logicPanel, false); }));
      fileTypeOptions.forEach((option) => option.addEventListener('click', () => { if (fileType) fileType.value = option.dataset.combineFiletypeOption || 'pdf'; updateFileTypeSummary(); setPanelOpen(fileTypeToggle, fileTypePanel, false); }));
      document.addEventListener('click', (event) => {
        if (modal.classList.contains('hidden')) return;
        const target = event.target;
        const inside = proposalPicker?.contains(target) || proposalPanel?.contains(target)
          || logicPicker?.contains(target) || logicPanel?.contains(target)
          || fileTypePicker?.contains(target) || fileTypePanel?.contains(target)
          || columnPicker?.contains(target) || columnPanel?.contains(target);
        if (inside) return;
        setPanelOpen(proposalToggle, proposalPanel, false);
        setPanelOpen(logicToggle, logicPanel, false);
        setPanelOpen(fileTypeToggle, fileTypePanel, false);
        setPanelOpen(columnToggle, columnPanel, false);
      });
      const repositionOpenPanels = () => {
        if (modal.classList.contains('hidden')) return;
        positionFloatingPanel(proposalToggle, proposalPanel);
        positionFloatingPanel(logicToggle, logicPanel);
        positionFloatingPanel(fileTypeToggle, fileTypePanel);
        positionFloatingPanel(columnToggle, columnPanel);
      };
      window.addEventListener('resize', repositionOpenPanels);
      window.addEventListener('scroll', repositionOpenPanels, true);
      modal.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (proposalPanel && !proposalPanel.hidden) return setPanelOpen(proposalToggle, proposalPanel, false);
        if (logicPanel && !logicPanel.hidden) return setPanelOpen(logicToggle, logicPanel, false);
        if (fileTypePanel && !fileTypePanel.hidden) return setPanelOpen(fileTypeToggle, fileTypePanel, false);
        if (columnPanel && !columnPanel.hidden) return setPanelOpen(columnToggle, columnPanel, false);
        close(null);
      });
      download?.addEventListener('click', () => {
        const payload = currentPayload('download');
        if (payload) close(payload);
      });
      save?.addEventListener('click', () => {
        const payload = currentPayload('save');
        if (payload) close(payload);
      });

      ui = { modal, renderProposals, renderColumns, updateProposalSummary, updateColumnSummary, updateLogicSummary, updateFileTypeSummary };
      hydrateIcons(modal);
      return ui;
    };

    return {
      open: (proposals) => new Promise((resolve) => {
        const x = ensure();
        resolver = resolve;
        x.renderProposals(Array.isArray(proposals) ? proposals : []);
        x.renderColumns(PROPOSAL_EXPORT_COLUMNS.map((col) => ({ ...col })));
        const logic = x.modal.querySelector('[data-combine-logic]');
        const fileType = x.modal.querySelector('[data-combine-filetype]');
        if (logic) logic.value = 'add';
        if (fileType) fileType.value = 'pdf';
        const err = x.modal.querySelector('[data-combine-error]');
        if (err) err.style.display = 'none';
        x.updateProposalSummary();
        x.updateColumnSummary();
        x.updateLogicSummary();
        x.updateFileTypeSummary();
        x.modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => x.modal.querySelector('[data-combine-proposal-toggle]')?.focus());
      }),
    };
  })();

  async function openCombineProposalsModal() {
    if (state.loadingProposals) await loadProposals();
    const proposals = (Array.isArray(state.proposals) ? state.proposals : []).filter((proposal) => String(proposal?.id || '').trim());
    if (proposals.length < 2) return toast('error', 'Combine proposals', 'Create at least two proposals first.');
    const options = await CombineProposalsModal.open(proposals);
    if (!options) return;
    if (options.action === 'save') {
      const name = await CombineNameModal.open();
      if (!name) return;
      return saveCombinedProposal(options, name);
    }
    return downloadCombinedProposals(options);
  }

  async function downloadCombinedProposals(options = {}) {
    if (state.combiningProposals) return;
    const proposalIds = (Array.isArray(options.proposalIds) ? options.proposalIds : []).map((id) => String(id || '').trim()).filter(Boolean);
    if (proposalIds.length < 2) return toast('error', 'Combine proposals', 'Select at least two proposals.');
    const fileType = String(options.fileType || 'pdf').toLowerCase() === 'excel' ? 'excel' : 'pdf';
    const columns = Array.isArray(options.columns) && options.columns.length ? options.columns : PROPOSAL_EXPORT_COLUMNS.filter((col) => col.checked).map((col) => col.value);
    state.combiningProposals = true;
    try {
      const query = new URLSearchParams({ _ts: String(Date.now()), proposalIds: proposalIds.join(','), logic: normalizeCombineLogic(options.combineLogic || 'add'), columns: columns.join(',') });
      const res = await fetch(`/api/products/proposals/combine/${fileType === 'excel' ? 'excel' : 'pdf'}?${query.toString()}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to download combined proposals.');
      }
      const blob = await res.blob();
      const ext = fileType === 'excel' ? 'xlsx' : 'pdf';
      const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), `combined-proposals.${ext}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('success', 'Combine proposals', `Combined ${fileType === 'excel' ? 'Excel' : 'PDF'} downloaded.`);
    } catch (error) {
      toast('error', 'Combine proposals', error?.message || 'Failed to download combined proposals.');
    } finally {
      state.combiningProposals = false;
    }
  }

  async function saveCombinedProposal(options = {}, name = '') {
    if (state.savingCombinedProposal) return;
    const proposalIds = (Array.isArray(options.proposalIds) ? options.proposalIds : []).map((id) => String(id || '').trim()).filter(Boolean);
    if (proposalIds.length < 2 || !String(name || '').trim()) return toast('error', 'Combine proposals', 'Select proposals and write a proposal name.');
    state.savingCombinedProposal = true;
    try {
      const data = await api('/api/products/proposals/combine/save', {
        method: 'POST',
        body: JSON.stringify({
          name: String(name || '').trim(),
          proposalIds,
          combineLogic: normalizeCombineLogic(options.combineLogic || 'add'),
          columns: Array.isArray(options.columns) ? options.columns : [],
        }),
      });
      if (data?.proposal?.id && data?.combinedMeta) saveCombinedMetaForProposal(data.proposal.id, data.combinedMeta);
      await loadProposals();
      if (data?.proposal?.id) await openProposalDetail(data.proposal.id, { edit: false });
      toast('success', 'Combine proposals', 'Combined proposal saved.');
    } catch (error) {
      toast('error', 'Combine proposals', error?.message || 'Failed to save combined proposal.');
    } finally {
      state.savingCombinedProposal = false;
    }
  }

  function filenameFromDisposition(disposition, fallback) {
    const header = String(disposition || '');
    const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf && utf[1]) {
      try { return decodeURIComponent(utf[1].replace(/["']/g, '').trim()) || fallback; } catch {}
    }
    const ascii = header.match(/filename="?([^";]+)"?/i);
    return (ascii && ascii[1] ? ascii[1].trim() : '') || fallback;
  }

  async function downloadActiveProposal() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    if (!proposalId || state.downloadingProposal) return;
    const options = await ProposalExportModal.open();
    if (!options) return;

    const fileType = String(options.fileType || 'pdf').toLowerCase() === 'excel' ? 'excel' : 'pdf';
    const columns = Array.isArray(options.columns) && options.columns.length
      ? options.columns
      : PROPOSAL_EXPORT_COLUMNS.filter((col) => col.checked).map((col) => col.value);
    const btn = els.proposalDetail?.querySelector?.('[data-action="download-proposal"]');
    const label = btn?.querySelector?.('span');
    const originalLabel = label ? label.textContent : '';
    state.downloadingProposal = true;
    if (btn) btn.disabled = true;
    if (label) label.textContent = 'Downloading...';
    try {
      const query = new URLSearchParams({ _ts: String(Date.now()), columns: columns.join(',') });
      const endpoint = fileType === 'excel' ? 'excel' : 'pdf';
      const res = await fetch(`/api/products/proposals/${encodeURIComponent(proposalId)}/${endpoint}?${query.toString()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to download proposal ${fileType === 'excel' ? 'Excel' : 'PDF'}.`);
      }
      const blob = await res.blob();
      const ext = fileType === 'excel' ? 'xlsx' : 'pdf';
      const fallbackName = `${String(state.activeProposal?.name || 'Proposal').replace(/[^a-z0-9_-]+/gi, '_') || 'Proposal'}.${ext}`;
      const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), fallbackName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('success', 'Proposal', `Proposal ${fileType === 'excel' ? 'Excel' : 'PDF'} downloaded.`);
    } catch (error) {
      toast('error', 'Proposal', error?.message || 'Failed to download proposal.');
    } finally {
      state.downloadingProposal = false;
      if (btn) btn.disabled = false;
      if (label) label.textContent = originalLabel || 'Download';
    }
  }

  function closeAllSearchSelects(exceptRoot = null) {
    document.querySelectorAll('[data-select-root]').forEach((root) => {
      if (exceptRoot && root === exceptRoot) return;
      const menu = root.querySelector('.proposal-search-select__menu');
      const toggle = root.querySelector('.proposal-search-select__button');
      if (menu) menu.hidden = true;
      root.classList.remove('is-open');
      const card = root.closest('.products-proposal-tool-card');
      if (card) card.classList.remove('has-open-select');
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
      root.classList.toggle('is-open', shouldOpen);
      const card = root.closest('.products-proposal-tool-card');
      if (card) card.classList.toggle('has-open-select', shouldOpen);
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
      if (targetId === 'proposalMergeLogicSelect') {
        state.proposalMergeLogic = normalizeProposalMergeLogic(input?.value || option.getAttribute('data-value') || 'add');
      }
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
    if (els.createProposalBtn) els.createProposalBtn.addEventListener('click', () => startNewFolder('proposal'));
    if (els.combineProposalsBtn) els.combineProposalsBtn.addEventListener('click', openCombineProposalsModal);
    if (els.createKitBtn) els.createKitBtn.addEventListener('click', () => startNewFolder('kit'));

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
      if (action === 'open-proposal') {
        markFolderOpening(btn);
        return openProposalDetail(folder.id, { edit: false });
      }
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
      if (action === 'open-kit') {
        markFolderOpening(btn);
        return openKitDetail(folder.id, { edit: false });
      }
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
      if (action === 'download-proposal') return downloadActiveProposal();
      if (action === 'save-proposal-name') return saveActiveName('proposal');
      if (action === 'add-proposal-product') return addProposalProduct();
      if (action === 'add-proposal-kit') return addProposalKit();
      const itemId = event.target.closest('[data-item-id]')?.getAttribute('data-item-id');
      if (action === 'delete-proposal-item') return deleteItem('proposal', itemId);
    });
    if (els.proposalDetail) els.proposalDetail.addEventListener('input', (event) => {
      if (!state.proposalCreateMode || !event.target.matches('#proposalEditNameInput')) return;
      state.activeProposal = { ...(state.activeProposal || {}), name: String(event.target.value || '') };
      if (String(event.target.value || '').trim()) {
        clearProposalCreateError('name');
        const errorEl = document.getElementById('proposalCreateNameError');
        if (errorEl) errorEl.textContent = '';
      }
    });
    if (els.proposalDetail) els.proposalDetail.addEventListener('change', (event) => {
      if (event.target.matches('#proposalMergeLogicSelect')) {
        state.proposalMergeLogic = normalizeProposalMergeLogic(event.target.value);
        return;
      }
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
    if (els.kitDetail) els.kitDetail.addEventListener('input', (event) => {
      if (!state.kitCreateMode || !event.target.matches('#kitEditNameInput')) return;
      state.activeKit = { ...(state.activeKit || {}), name: String(event.target.value || '') };
      if (String(event.target.value || '').trim()) {
        clearKitCreateError('name');
        const errorEl = document.getElementById('kitCreateNameError');
        if (errorEl) errorEl.textContent = '';
      }
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
    els.combineProposalsBtn = $('combineProposalsBtn');
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
    els.makeOrderMemberRoot = $('makeOrderMemberRoot');
    els.makeOrderMemberOptions = $('makeOrderMemberOptions');
    els.makeOrderPassword = $('makeOrderPassword');
    els.makeOrderError = $('makeOrderError');
  }

  async function init() {
    collectEls();
    bindEvents();
    hydrateIcons();
    const mode = currentWorkspaceMode();
    state.tab = mode;
    renderProposalFolders();
    renderKitFolders();
    await loadProducts();
    if (mode === 'kits') {
      await loadKits();
      setTab('kits', { skipLoad: true });
    } else {
      await Promise.all([loadProposals(), loadKits()]);
      setTab('proposals', { skipLoad: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

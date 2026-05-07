// public/js/products.js
(function () {
  'use strict';

  const state = {
    products: [],
    loading: true,
    saving: false,
    search: '',
    activeTag: '__all__',
    modalMode: 'create',
    editingId: '',
  };

  const els = {};

  function $(id) { return document.getElementById(id); }

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
      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast(type, title, message);
        return;
      }
    } catch {}
    if (message) console.log(`${title}: ${message}`);
  }

  function hydrateIcons(root = document) {
    try {
      if (window.feather && root && typeof root.querySelector === 'function' && root.querySelector('[data-feather]')) {
        window.feather.replace();
      }
    } catch {}
  }

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function firstTag(product) {
    const tags = Array.isArray(product?.tags) ? product.tags : [];
    const first = tags.map((x) => String(x || '').trim()).find(Boolean);
    return first || 'Uncategorized';
  }

  function formatPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    try {
      return `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
    } catch {
      return `£${n.toFixed(2)}`;
    }
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    try { return n.toLocaleString('en-GB'); } catch { return String(n); }
  }

  function sortProducts(list) {
    return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
      const tagCmp = firstTag(a).localeCompare(firstTag(b));
      if (tagCmp) return tagCmp;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
  }

  function getAllTags() {
    const counts = new Map();
    for (const product of state.products || []) {
      const tag = firstTag(product);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function productHaystack(product) {
    return [
      product?.name,
      product?.displayId,
      product?.url,
      product?.categoryCode,
      product?.categoryName,
      ...(Array.isArray(product?.tags) ? product.tags : []),
    ].join(' ').toLowerCase();
  }

  function getFilteredProducts() {
    const q = normalizeText(state.search);
    const tag = state.activeTag;
    return sortProducts(state.products).filter((product) => {
      if (tag && tag !== '__all__' && firstTag(product) !== tag) return false;
      if (q && !productHaystack(product).includes(q)) return false;
      return true;
    });
  }

  function groupProducts(list) {
    const map = new Map();
    for (const product of list || []) {
      const tag = firstTag(product);
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(product);
    }
    return Array.from(map.entries())
      .map(([tag, products]) => ({ tag, products: sortProducts(products) }))
      .sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
  }

  function updateStats(filteredProducts = getFilteredProducts()) {
    const all = state.products || [];
    const groups = getAllTags();
    const priced = all.filter((p) => Number.isFinite(Number(p?.unitPrice)));
    const avg = priced.length ? priced.reduce((sum, p) => sum + Number(p.unitPrice || 0), 0) / priced.length : null;

    if (els.totalCount) els.totalCount.textContent = formatNumber(all.length);
    if (els.groupsCount) els.groupsCount.textContent = formatNumber(groups.length);
    if (els.pricedCount) els.pricedCount.textContent = formatNumber(priced.length);
    if (els.averagePrice) els.averagePrice.textContent = avg === null ? '—' : formatPrice(avg);
    if (els.viewPill) {
      const label = state.activeTag === '__all__' ? 'All groups' : state.activeTag;
      els.viewPill.textContent = `${formatNumber(filteredProducts.length)} shown • ${label}`;
    }
  }

  function renderTags() {
    if (!els.tags) return;
    const tags = getAllTags();
    const total = (state.products || []).length;
    const chips = [
      `<button type="button" class="products-tag-chip ${state.activeTag === '__all__' ? 'is-active' : ''}" data-tag="__all__">
        <span>All Products</span><span class="products-tag-chip__count">${formatNumber(total)}</span>
      </button>`,
      ...tags.map((tag) => `
        <button type="button" class="products-tag-chip ${state.activeTag === tag.name ? 'is-active' : ''}" data-tag="${escapeHTML(tag.name)}">
          <span>${escapeHTML(tag.name)}</span><span class="products-tag-chip__count">${formatNumber(tag.count)}</span>
        </button>
      `),
    ];
    els.tags.innerHTML = chips.join('');
  }

  function renderTagOptions() {
    if (!els.tagOptions) return;
    els.tagOptions.innerHTML = getAllTags()
      .map((tag) => `<option value="${escapeHTML(tag.name)}"></option>`)
      .join('');
  }

  function groupMetrics(products) {
    const count = Array.isArray(products) ? products.length : 0;
    const priced = (products || []).filter((p) => Number.isFinite(Number(p?.unitPrice)));
    const avg = priced.length ? priced.reduce((sum, p) => sum + Number(p.unitPrice || 0), 0) / priced.length : null;
    const withLinks = (products || []).filter((p) => String(p?.url || '').trim()).length;
    return { count, priced: priced.length, avg, withLinks };
  }

  function productCardHTML(product) {
    const id = String(product?.id || '').trim();
    const name = String(product?.name || 'Untitled Product').trim();
    const tag = firstTag(product);
    const code = String(product?.displayId || '').trim() || 'No ID';
    const category = String(product?.categoryName || tag || 'No category').trim();
    const price = formatPrice(product?.unitPrice);
    const qty = formatNumber(product?.quantity);
    const url = String(product?.url || '').trim();
    const link = url
      ? `<a class="product-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><i data-feather="external-link"></i><span>Open URL</span></a>`
      : `<span class="product-link is-disabled"><i data-feather="link-2"></i><span>No URL</span></span>`;

    return `
      <article class="product-card" data-product-id="${escapeHTML(id)}">
        <div class="product-card__top">
          <span class="product-card__badge" title="${escapeHTML(tag)}"><i data-feather="tag"></i>${escapeHTML(tag)}</span>
          <button type="button" class="product-card__edit" data-action="edit-product" data-product-id="${escapeHTML(id)}" aria-label="Edit ${escapeHTML(name)}">
            <i data-feather="edit-3"></i>
          </button>
        </div>
        <h4 title="${escapeHTML(name)}">${escapeHTML(name)}</h4>
        <div class="product-card__meta">
          <div class="product-meta-box"><span>ID Code</span><strong title="${escapeHTML(code)}">${escapeHTML(code)}</strong></div>
          <div class="product-meta-box"><span>Unit Price</span><strong>${escapeHTML(price)}</strong></div>
          <div class="product-meta-box"><span>Quantity</span><strong>${escapeHTML(qty)}</strong></div>
          <div class="product-meta-box"><span>Category Code</span><strong>${escapeHTML(product?.categoryCode ?? '—')}</strong></div>
        </div>
        <div class="product-card__footer">
          <span class="product-category" title="${escapeHTML(category)}">${escapeHTML(category)}</span>
          ${link}
        </div>
      </article>
    `;
  }

  function groupHTML(group) {
    const metrics = groupMetrics(group.products);
    const avgText = metrics.avg === null ? '—' : formatPrice(metrics.avg);
    return `
      <section class="products-group" data-group="${escapeHTML(group.tag)}">
        <header class="products-group__head">
          <div class="products-group__title">
            <span class="products-group__icon"><i data-feather="layers"></i></span>
            <div>
              <h3 title="${escapeHTML(group.tag)}">${escapeHTML(group.tag)}</h3>
              <p>${formatNumber(metrics.count)} product${metrics.count === 1 ? '' : 's'} grouped under this tag</p>
            </div>
          </div>
          <div class="products-group__metrics">
            <span class="products-mini-metric"><i data-feather="box"></i>${formatNumber(metrics.count)} items</span>
            <span class="products-mini-metric"><i data-feather="dollar-sign"></i>${escapeHTML(avgText)} avg</span>
            <span class="products-mini-metric"><i data-feather="link"></i>${formatNumber(metrics.withLinks)} URLs</span>
          </div>
        </header>
        <div class="products-grid">
          ${group.products.map(productCardHTML).join('')}
        </div>
      </section>
    `;
  }

  function renderResults() {
    if (!els.results) return;

    if (state.loading) {
      els.results.innerHTML = `
        <div class="products-loading-card">
          <div class="products-spinner" aria-hidden="true"></div>
          <div><strong>Loading products...</strong><span>Reading the products table from Supabase.</span></div>
        </div>
      `;
      return;
    }

    const filtered = getFilteredProducts();
    updateStats(filtered);
    renderTags();
    renderTagOptions();

    if (!filtered.length) {
      els.results.innerHTML = `
        <div class="products-empty">
          <span class="products-group__icon"><i data-feather="search"></i></span>
          <div><strong>No products found</strong><span>Try another search term or select a different tag.</span></div>
        </div>
      `;
      hydrateIcons(els.results);
      return;
    }

    const groups = groupProducts(filtered);
    els.results.innerHTML = groups.map(groupHTML).join('');
    hydrateIcons(els.results);
  }

  function renderAll() {
    const filtered = getFilteredProducts();
    updateStats(filtered);
    renderTags();
    renderTagOptions();
    renderResults();
  }

  async function loadProducts({ silent = false } = {}) {
    if (!silent) {
      state.loading = true;
      renderResults();
    }
    try {
      const res = await fetch(`/api/products?_fresh=1&_ts=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || 'Failed to load products.');
      }
      state.products = Array.isArray(data?.products) ? data.products : [];
      state.loading = false;
      renderAll();
    } catch (error) {
      state.loading = false;
      if (els.results) {
        els.results.innerHTML = `
          <div class="products-error">
            <span class="products-group__icon"><i data-feather="alert-circle"></i></span>
            <div><strong>Products could not be loaded</strong><span>${escapeHTML(error?.message || 'Unknown error')}</span></div>
          </div>
        `;
        hydrateIcons(els.results);
      }
      toast('error', 'Products', error?.message || 'Failed to load products.');
    }
  }

  function findProduct(id) {
    const wanted = String(id || '').trim();
    return (state.products || []).find((p) => String(p?.id || '').trim() === wanted) || null;
  }

  function setSaving(isSaving) {
    state.saving = !!isSaving;
    if (els.saveBtn) {
      els.saveBtn.disabled = state.saving;
      const label = els.saveBtn.querySelector('span');
      if (label) label.textContent = state.saving ? 'Saving...' : 'Save Product';
    }
    if (els.addBtn) els.addBtn.disabled = state.saving;
  }

  function setModalError(message) {
    if (els.formError) els.formError.textContent = message || '';
  }

  function setInputValue(el, value) {
    if (!el) return;
    el.value = value === null || typeof value === 'undefined' ? '' : String(value);
  }

  function resetForm() {
    if (els.form) els.form.reset();
    setModalError('');
    setInputValue(els.nameInput, '');
    setInputValue(els.idCodeInput, '');
    setInputValue(els.priceInput, '');
    setInputValue(els.quantityInput, '');
    setInputValue(els.tagsInput, '');
    setInputValue(els.categoryCodeInput, '');
    setInputValue(els.categoryNameInput, '');
    setInputValue(els.urlInput, '');
  }

  function openModal(mode = 'create', product = null) {
    state.modalMode = mode;
    state.editingId = mode === 'edit' ? String(product?.id || '').trim() : '';
    resetForm();

    if (els.modalTitle) els.modalTitle.textContent = mode === 'edit' ? 'Edit Product' : 'Add Product';
    if (els.modalSubtitle) {
      els.modalSubtitle.textContent = mode === 'edit'
        ? 'Update this product record directly inside Supabase.'
        : 'Create a new product record in the products table.';
    }

    if (product) {
      setInputValue(els.nameInput, product.name || '');
      setInputValue(els.idCodeInput, product.displayId || '');
      setInputValue(els.priceInput, product.unitPrice ?? '');
      setInputValue(els.quantityInput, product.quantity ?? '');
      setInputValue(els.tagsInput, firstTag(product) === 'Uncategorized' ? '' : firstTag(product));
      setInputValue(els.categoryCodeInput, product.categoryCode ?? '');
      setInputValue(els.categoryNameInput, product.categoryName || '');
      setInputValue(els.urlInput, product.url || '');
    }

    if (els.modal) {
      els.modal.hidden = false;
      els.modal.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('products-modal-open');
    setTimeout(() => { try { els.nameInput && els.nameInput.focus(); } catch {} }, 40);
    hydrateIcons(els.modal || document);
  }

  function closeModal() {
    if (state.saving) return;
    if (els.modal) {
      els.modal.hidden = true;
      els.modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('products-modal-open');
    state.modalMode = 'create';
    state.editingId = '';
    resetForm();
  }

  function inputNumberValue(el) {
    const raw = String(el?.value || '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function formPayload() {
    const name = String(els.nameInput?.value || '').trim();
    if (!name) throw new Error('Product name is required.');
    return {
      name,
      idCode: String(els.idCodeInput?.value || '').trim() || null,
      unitPrice: inputNumberValue(els.priceInput),
      quantity: inputNumberValue(els.quantityInput),
      tags: String(els.tagsInput?.value || '').trim() || null,
      categoryCode: inputNumberValue(els.categoryCodeInput),
      categoryName: String(els.categoryNameInput?.value || '').trim() || null,
      url: String(els.urlInput?.value || '').trim() || null,
    };
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (state.saving) return;
    setModalError('');

    let payload;
    try {
      payload = formPayload();
    } catch (error) {
      setModalError(error?.message || 'Please check the form.');
      return;
    }

    const isEdit = state.modalMode === 'edit' && state.editingId;
    const url = isEdit ? `/api/products/${encodeURIComponent(state.editingId)}` : '/api/products';
    const method = isEdit ? 'PATCH' : 'POST';

    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || 'Failed to save product.');
      }
      const product = data?.product;
      if (product && product.id) {
        const idx = state.products.findIndex((p) => String(p?.id) === String(product.id));
        if (idx >= 0) state.products.splice(idx, 1, product);
        else state.products.unshift(product);
      } else {
        await loadProducts({ silent: true });
      }
      closeModal();
      renderAll();
      toast('success', 'Products', isEdit ? 'Product updated successfully.' : 'Product added successfully.');
    } catch (error) {
      setModalError(error?.message || 'Failed to save product.');
      toast('error', 'Products', error?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  }

  function bindEvents() {
    if (els.searchInput) {
      els.searchInput.addEventListener('input', () => {
        state.search = els.searchInput.value || '';
        renderAll();
      });
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', async () => {
        els.refreshBtn.disabled = true;
        try { await loadProducts(); }
        finally { els.refreshBtn.disabled = false; }
      });
    }

    if (els.addBtn) {
      els.addBtn.addEventListener('click', () => openModal('create'));
    }

    if (els.tags) {
      els.tags.addEventListener('click', (event) => {
        const btn = event.target.closest('.products-tag-chip');
        if (!btn) return;
        state.activeTag = btn.getAttribute('data-tag') || '__all__';
        renderAll();
      });
    }

    if (els.results) {
      els.results.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-action="edit-product"]');
        if (!btn) return;
        const product = findProduct(btn.getAttribute('data-product-id'));
        if (!product) return;
        openModal('edit', product);
      });
    }

    if (els.form) els.form.addEventListener('submit', saveProduct);
    if (els.closeBtn) els.closeBtn.addEventListener('click', closeModal);
    if (els.cancelBtn) els.cancelBtn.addEventListener('click', closeModal);
    if (els.modal) {
      els.modal.addEventListener('click', (event) => {
        if (event.target === els.modal) closeModal();
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.modal && !els.modal.hidden) closeModal();
    });
  }

  function collectEls() {
    els.totalCount = $('productsTotalCount');
    els.groupsCount = $('productsGroupsCount');
    els.pricedCount = $('productsPricedCount');
    els.averagePrice = $('productsAveragePrice');
    els.viewPill = $('productsViewPill');
    els.searchInput = $('productsSearchInput');
    els.refreshBtn = $('productsRefreshBtn');
    els.addBtn = $('productsAddBtn');
    els.tags = $('productsTags');
    els.results = $('productsResults');
    els.tagOptions = $('productsTagOptions');

    els.modal = $('productModal');
    els.form = $('productForm');
    els.modalTitle = $('productModalTitle');
    els.modalSubtitle = $('productModalSubtitle');
    els.closeBtn = $('productModalClose');
    els.cancelBtn = $('productModalCancel');
    els.saveBtn = $('productSaveBtn');
    els.formError = $('productFormError');

    els.nameInput = $('productNameInput');
    els.idCodeInput = $('productIdCodeInput');
    els.priceInput = $('productPriceInput');
    els.quantityInput = $('productQuantityInput');
    els.tagsInput = $('productTagsInput');
    els.categoryCodeInput = $('productCategoryCodeInput');
    els.categoryNameInput = $('productCategoryNameInput');
    els.urlInput = $('productUrlInput');
  }

  function init() {
    collectEls();
    bindEvents();
    hydrateIcons();
    loadProducts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

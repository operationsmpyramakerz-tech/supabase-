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
    savingTag: false,
    editingTag: '',
    tagModalMode: 'edit',
    tagCatalog: [],
    view: 'catalog',
    proposals: [],
    proposalsLoading: false,
    proposalSaving: false,
    activeProposal: null,
    proposalItems: [],
    proposalItemsLoading: false,
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

  function numericInputValue(el, fallback = null) {
    const raw = String(el?.value || '').trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
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
    for (const tag of state.tagCatalog || []) {
      const clean = String(tag || '').trim();
      if (clean && !counts.has(clean)) counts.set(clean, 0);
    }
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
      product?.unitPrice,
      product?.url,
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

  function updateStats() {
    const all = state.products || [];
    const groups = getAllTags();
    if (els.totalCount) els.totalCount.textContent = formatNumber(all.length);
    if (els.groupsCount) els.groupsCount.textContent = formatNumber(groups.length);
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
    if (els.tagOptions) {
      els.tagOptions.innerHTML = getAllTags()
        .map((tag) => `<option value="${escapeHTML(tag.name)}"></option>`)
        .join('');
    }
    if (els.proposalTagSelect) {
      const options = getAllTags().filter((tag) => Number(tag.count) > 0)
        .map((tag) => `<option value="${escapeHTML(tag.name)}">${escapeHTML(tag.name)} (${formatNumber(tag.count)})</option>`)
        .join('');
      els.proposalTagSelect.innerHTML = options || '<option value="">No tags available</option>';
    }
  }

  function renderProductSelect() {
    if (!els.proposalProductSelect) return;
    const options = sortProducts(state.products).map((product) => {
      const label = `${product.name || 'Untitled Product'}${product.displayId ? ` · ${product.displayId}` : ''}`;
      return `<option value="${escapeHTML(product.id)}">${escapeHTML(label)}</option>`;
    }).join('');
    els.proposalProductSelect.innerHTML = options || '<option value="">No products available</option>';
  }

  function productCardHTML(product) {
    const id = String(product?.id || '').trim();
    const name = String(product?.name || 'Untitled Product').trim();
    const tag = firstTag(product);
    const code = String(product?.displayId || '').trim() || 'No ID';
    const price = formatPrice(product?.unitPrice);
    const url = String(product?.url || '').trim();
    const link = url
      ? `<a class="product-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><i data-feather="external-link"></i><span>Open URL</span></a>`
      : `<span class="product-link is-disabled"><i data-feather="link-2"></i><span>No URL</span></span>`;

    const searchText = [name, tag, code, price, url].join(' ');

    return `
      <article class="product-card" data-product-id="${escapeHTML(id)}" data-search="${escapeHTML(searchText)}">
        <div class="product-card__top">
          <span class="product-card__badge" title="${escapeHTML(tag)}"><i data-feather="tag"></i>${escapeHTML(tag)}</span>
          <button type="button" class="product-card__edit" data-action="edit-product" data-product-id="${escapeHTML(id)}" aria-label="Edit ${escapeHTML(name)}">
            <i data-feather="edit-3"></i><span>Edit</span>
          </button>
        </div>
        <h4 title="${escapeHTML(name)}">${escapeHTML(name)}</h4>
        <div class="product-card__meta">
          <div class="product-meta-box"><span>ID Code</span><strong title="${escapeHTML(code)}">${escapeHTML(code)}</strong></div>
          <div class="product-meta-box"><span>Unit Price</span><strong>${escapeHTML(price)}</strong></div>
        </div>
        <div class="product-card__footer">
          ${link}
        </div>
      </article>
    `;
  }

  function groupHTML(group) {
    const count = Array.isArray(group.products) ? group.products.length : 0;
    return `
      <section class="products-group" data-group="${escapeHTML(group.tag)}">
        <header class="products-group__head">
          <div class="products-group__title">
            <span class="products-group__icon"><i data-feather="layers"></i></span>
            <div>
              <h3 title="${escapeHTML(group.tag)}">${escapeHTML(group.tag)}</h3>
              <p>${formatNumber(count)} product${count === 1 ? '' : 's'} grouped under this tag</p>
            </div>
          </div>
          <div class="products-group__metrics">
            <button type="button" class="products-group-edit-tag" data-action="edit-tag" data-tag="${escapeHTML(group.tag)}">
              <i data-feather="edit-3"></i><span>Edit Tag</span>
            </button>
            <span class="products-mini-metric"><i data-feather="box"></i>${formatNumber(count)} items</span>
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
          <div><strong>Loading products...</strong><span>Reading product records.</span></div>
        </div>
      `;
      return;
    }

    const filtered = getFilteredProducts();
    updateStats();
    renderTags();
    renderTagOptions();
    renderProductSelect();

    if (!filtered.length) {
      els.results.innerHTML = window.OpsNoData?.html() || `<div class="products-empty">Sorry, No data available</div>`;
      hydrateIcons(els.results);
      return;
    }

    const groups = groupProducts(filtered);
    els.results.innerHTML = groups.map(groupHTML).join('');
    hydrateIcons(els.results);
  }

  function renderCatalog() {
    updateStats();
    renderTags();
    renderTagOptions();
    renderProductSelect();
    renderResults();
  }

  function setProductsView(view) {
    state.view = view || 'catalog';
    const showCatalog = state.view === 'catalog';
    if (els.filterPanel) els.filterPanel.hidden = !showCatalog;
    if (els.results) els.results.hidden = !showCatalog;
    if (els.proposalsView) els.proposalsView.hidden = showCatalog;
    if (els.proposalDetail) els.proposalDetail.hidden = state.view !== 'proposal-detail';
    if (els.proposalsList) els.proposalsList.hidden = state.view === 'proposal-detail';
    if (state.view === 'catalog') renderCatalog();
    if (state.view === 'proposals') {
      renderProposalsList();
      if (!state.proposals.length && !state.proposalsLoading) loadProposals();
    }
    hydrateIcons(document);
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
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load products.');
      state.products = Array.isArray(data?.products) ? data.products : [];
      state.tagCatalog = Array.isArray(data?.tagsCatalog) ? data.tagsCatalog : [];
      state.loading = false;
      renderCatalog();
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
    setInputValue(els.tagsInput, '');
    setInputValue(els.urlInput, '');
  }

  function openModal(mode = 'create', product = null) {
    state.modalMode = mode;
    state.editingId = mode === 'edit' ? String(product?.id || '').trim() : '';
    resetForm();

    if (els.modalTitle) els.modalTitle.textContent = mode === 'edit' ? 'Edit Product' : 'Add Product';
    if (els.modalSubtitle) {
      els.modalSubtitle.textContent = mode === 'edit'
        ? 'Update this product record.'
        : 'Create a new product record in the products table.';
    }

    if (product) {
      setInputValue(els.nameInput, product.name || '');
      setInputValue(els.idCodeInput, product.displayId || '');
      setInputValue(els.priceInput, product.unitPrice ?? '');
      setInputValue(els.tagsInput, firstTag(product) === 'Uncategorized' ? '' : firstTag(product));
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

  function tagProductsCount(tag) {
    const wanted = String(tag || '').trim();
    return (state.products || []).filter((product) => firstTag(product) === wanted).length;
  }

  function setTagModalError(message) {
    if (els.tagFormError) els.tagFormError.textContent = message || '';
  }

  function setTagSaving(isSaving) {
    state.savingTag = !!isSaving;
    if (els.tagSaveBtn) {
      els.tagSaveBtn.disabled = state.savingTag;
      const label = els.tagSaveBtn.querySelector('span');
      const isCreate = state.tagModalMode === 'create';
      if (label) label.textContent = state.savingTag ? (isCreate ? 'Adding...' : 'Updating...') : (isCreate ? 'Add Tag' : 'Update Tag');
    }
    if (els.addTagBtn) els.addTagBtn.disabled = state.savingTag;
    document.querySelectorAll('[data-action="edit-tag"]').forEach((btn) => { btn.disabled = state.savingTag; });
  }

  function openTagModal(tag) {
    const currentTag = String(tag || '').trim();
    if (!currentTag || currentTag === '__all__') return;
    state.tagModalMode = 'edit';
    state.editingTag = currentTag;
    setTagModalError('');

    if (els.tagModalTitle) els.tagModalTitle.textContent = 'Edit Tag';
    if (els.tagModalSubtitle) els.tagModalSubtitle.textContent = 'Rename this tag for all products inside the group.';
    if (els.tagInputLabel) els.tagInputLabel.innerHTML = 'New Tag <em>*</em>';
    if (els.tagSummary) els.tagSummary.hidden = false;
    if (els.tagCurrentLabel) els.tagCurrentLabel.textContent = currentTag;
    if (els.tagCountLabel) {
      const count = tagProductsCount(currentTag);
      els.tagCountLabel.textContent = `${formatNumber(count)} product${count === 1 ? '' : 's'} will be updated`;
    }
    setInputValue(els.newTagInput, currentTag);
    setTagSaving(false);

    if (els.tagModal) {
      els.tagModal.hidden = false;
      els.tagModal.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('products-modal-open');
    setTimeout(() => { try { els.newTagInput && els.newTagInput.focus(); els.newTagInput && els.newTagInput.select(); } catch {} }, 40);
    hydrateIcons(els.tagModal || document);
  }

  function openCreateTagModal() {
    state.tagModalMode = 'create';
    state.editingTag = '';
    setTagModalError('');
    if (els.tagModalTitle) els.tagModalTitle.textContent = 'Add Tag';
    if (els.tagModalSubtitle) els.tagModalSubtitle.textContent = 'Create a new product tag and make it available in the catalog.';
    if (els.tagInputLabel) els.tagInputLabel.innerHTML = 'Tag Name <em>*</em>';
    if (els.tagSummary) els.tagSummary.hidden = true;
    setInputValue(els.newTagInput, '');
    setTagSaving(false);
    if (els.tagModal) {
      els.tagModal.hidden = false;
      els.tagModal.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('products-modal-open');
    setTimeout(() => { try { els.newTagInput && els.newTagInput.focus(); } catch {} }, 40);
    hydrateIcons(els.tagModal || document);
  }

  function closeTagModal() {
    if (state.savingTag) return;
    if (els.tagModal) {
      els.tagModal.hidden = true;
      els.tagModal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('products-modal-open');
    state.editingTag = '';
    state.tagModalMode = 'edit';
    setTagModalError('');
    setInputValue(els.newTagInput, '');
    if (els.tagSummary) els.tagSummary.hidden = false;
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
      tags: String(els.tagsInput?.value || '').trim() || null,
      url: String(els.urlInput?.value || '').trim() || null,
    };
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (state.saving) return;
    setModalError('');

    let payload;
    try { payload = formPayload(); }
    catch (error) { setModalError(error?.message || 'Please check the form.'); return; }

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
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to save product.');
      const product = data?.product;
      if (product && product.id) {
        const idx = state.products.findIndex((p) => String(p?.id) === String(product.id));
        if (idx >= 0) state.products.splice(idx, 1, product);
        else state.products.unshift(product);
      } else {
        await loadProducts({ silent: true });
      }
      closeModal();
      renderCatalog();
      toast('success', 'Products', isEdit ? 'Product updated successfully.' : 'Product added successfully.');
    } catch (error) {
      setModalError(error?.message || 'Failed to save product.');
      toast('error', 'Products', error?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  }

  async function saveTag(event) {
    event.preventDefault();
    if (state.savingTag) return;

    const isCreate = state.tagModalMode === 'create';
    const oldTag = String(state.editingTag || '').trim();
    const newTag = String(els.newTagInput?.value || '').trim();
    setTagModalError('');

    if (!newTag) { setTagModalError(isCreate ? 'Tag name is required.' : 'New tag is required.'); return; }
    if (!isCreate && !oldTag) { setTagModalError('Please select a tag first.'); return; }
    if (!isCreate && normalizeText(oldTag) === normalizeText(newTag)) { setTagModalError('Please enter a different tag name.'); return; }
    if (isCreate && getAllTags().some((tag) => normalizeText(tag.name) === normalizeText(newTag))) { setTagModalError('This tag already exists.'); return; }

    setTagSaving(true);
    try {
      const res = await fetch('/api/products/tags', {
        method: isCreate ? 'POST' : 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCreate ? { name: newTag } : { oldTag, newTag }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || (isCreate ? 'Failed to add tag.' : 'Failed to update tag.'));
      setTagSaving(false);
      closeTagModal();
      state.activeTag = newTag;
      if (isCreate) {
        if (!state.tagCatalog.some((name) => normalizeText(name) === normalizeText(newTag))) state.tagCatalog.push(newTag);
        renderCatalog();
        toast('success', 'Products', 'Tag added successfully.');
      } else {
        await loadProducts({ silent: true });
        toast('success', 'Products', `Tag updated for ${formatNumber(data?.updatedCount || 0)} product${Number(data?.updatedCount || 0) === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      setTagModalError(error?.message || (isCreate ? 'Failed to add tag.' : 'Failed to update tag.'));
      toast('error', 'Products', error?.message || (isCreate ? 'Failed to add tag.' : 'Failed to update tag.'));
    } finally {
      setTagSaving(false);
    }
  }

  function proposalFolderHTML(proposal) {
    const id = String(proposal?.id || '').trim();
    const name = String(proposal?.name || 'Untitled Proposal').trim();
    const count = Number(proposal?.itemsCount || proposal?.items_count || 0) || 0;
    const creator = String(proposal?.createdBy || proposal?.created_by || '').trim();
    return `
      <button type="button" class="products-proposal-folder" data-action="open-proposal" data-proposal-id="${escapeHTML(id)}">
        <span class="products-proposal-folder__icon"><i data-feather="folder"></i><small>Q</small></span>
        <strong>${escapeHTML(name)}</strong>
        <span>${formatNumber(count)} component${count === 1 ? '' : 's'}</span>
        ${creator ? `<em>Created by ${escapeHTML(creator)}</em>` : ''}
      </button>
    `;
  }

  function renderProposalsList() {
    if (!els.proposalsList) return;
    if (state.proposalsLoading) {
      els.proposalsList.innerHTML = `
        <div class="products-loading-card">
          <div class="products-spinner" aria-hidden="true"></div>
          <div><strong>Loading proposals...</strong><span>Reading saved proposal folders.</span></div>
        </div>
      `;
      hydrateIcons(els.proposalsList);
      return;
    }
    const proposals = Array.isArray(state.proposals) ? state.proposals : [];
    if (!proposals.length) {
      els.proposalsList.innerHTML = window.OpsNoData?.html() || `<div class="products-proposals-empty">Sorry, No data available</div>`;
      hydrateIcons(els.proposalsList);
      return;
    }
    els.proposalsList.innerHTML = `<div class="products-proposal-folders">${proposals.map(proposalFolderHTML).join('')}</div>`;
    hydrateIcons(els.proposalsList);
  }

  async function loadProposals() {
    state.proposalsLoading = true;
    renderProposalsList();
    try {
      const res = await fetch(`/api/products/proposals?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load proposals.');
      state.proposals = Array.isArray(data?.proposals) ? data.proposals : [];
    } catch (error) {
      if (els.proposalsList) {
        els.proposalsList.innerHTML = `
          <div class="products-error">
            <span class="products-group__icon"><i data-feather="alert-circle"></i></span>
            <div><strong>Proposals could not be loaded</strong><span>${escapeHTML(error?.message || 'Unknown error')}</span></div>
          </div>
        `;
        hydrateIcons(els.proposalsList);
      }
      toast('error', 'Products', error?.message || 'Failed to load proposals.');
    } finally {
      state.proposalsLoading = false;
      renderProposalsList();
    }
  }

  function setProposalModalError(message) {
    if (els.proposalFormError) els.proposalFormError.textContent = message || '';
  }

  function setProposalSaving(isSaving) {
    state.proposalSaving = !!isSaving;
    if (els.proposalSaveBtn) {
      els.proposalSaveBtn.disabled = state.proposalSaving;
      const label = els.proposalSaveBtn.querySelector('span');
      if (label) label.textContent = state.proposalSaving ? 'Creating...' : 'Create Proposal';
    }
  }

  function openProposalModal() {
    setProposalModalError('');
    setInputValue(els.proposalNameInput, '');
    if (els.proposalModal) {
      els.proposalModal.hidden = false;
      els.proposalModal.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('products-modal-open');
    setTimeout(() => { try { els.proposalNameInput && els.proposalNameInput.focus(); } catch {} }, 40);
    hydrateIcons(els.proposalModal || document);
  }

  function closeProposalModal() {
    if (state.proposalSaving) return;
    if (els.proposalModal) {
      els.proposalModal.hidden = true;
      els.proposalModal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('products-modal-open');
    setProposalModalError('');
    setInputValue(els.proposalNameInput, '');
  }

  async function createProposal(event) {
    event.preventDefault();
    if (state.proposalSaving) return;
    const name = String(els.proposalNameInput?.value || '').trim();
    if (!name) { setProposalModalError('Proposal name is required.'); return; }
    setProposalSaving(true);
    try {
      const res = await fetch('/api/products/proposals', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to create proposal.');
      setProposalSaving(false);
      closeProposalModal();
      await loadProposals();
      if (data?.proposal?.id) await openProposalDetail(data.proposal.id);
      toast('success', 'Products', 'Proposal folder created successfully.');
    } catch (error) {
      setProposalModalError(error?.message || 'Failed to create proposal.');
      toast('error', 'Products', error?.message || 'Failed to create proposal.');
    } finally {
      setProposalSaving(false);
    }
  }

  function renderProposalDetail() {
    const proposal = state.activeProposal;
    if (!proposal || !els.proposalDetail) return;
    if (els.proposalTitle) els.proposalTitle.textContent = proposal.name || 'Proposal';
    if (els.proposalMeta) {
      const count = state.proposalItems.length;
      els.proposalMeta.textContent = `${formatNumber(count)} saved component${count === 1 ? '' : 's'}`;
    }
    if (els.proposalItemsCount) {
      const count = state.proposalItems.length;
      els.proposalItemsCount.textContent = `${formatNumber(count)} item${count === 1 ? '' : 's'}`;
    }
    renderProductSelect();
    renderTagOptions();
    renderProposalItems();
    hydrateIcons(els.proposalDetail);
  }

  function renderProposalItems() {
    if (!els.proposalItemsBody) return;
    const items = Array.isArray(state.proposalItems) ? state.proposalItems : [];
    if (state.proposalItemsLoading) {
      els.proposalItemsBody.innerHTML = `<tr><td colspan="3"><div class="products-table-empty">Loading proposal components...</div></td></tr>`;
      return;
    }
    if (!items.length) {
      els.proposalItemsBody.innerHTML = `<tr><td colspan="3"><div class="products-table-empty">No components yet. Add one product or a full tag group above.</div></td></tr>`;
      return;
    }
    els.proposalItemsBody.innerHTML = items.map((item) => {
      const id = String(item?.id || '').trim();
      const name = String(item?.productName || item?.product_name || 'Untitled Product').trim();
      const qty = Number(item?.quantity || 0) || 0;
      return `
        <tr data-proposal-item-id="${escapeHTML(id)}">
          <td><strong>${escapeHTML(name)}</strong></td>
          <td><input class="proposal-item-qty" type="number" min="1" step="1" value="${escapeHTML(qty)}" aria-label="Quantity for ${escapeHTML(name)}" /></td>
          <td>
            <div class="proposal-row-actions">
              <button type="button" class="proposal-row-save" data-action="save-proposal-item" data-item-id="${escapeHTML(id)}"><i data-feather="save"></i><span>Save</span></button>
              <button type="button" class="proposal-row-delete" data-action="delete-proposal-item" data-item-id="${escapeHTML(id)}"><i data-feather="trash-2"></i><span>Delete</span></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    hydrateIcons(els.proposalItemsBody.closest('.products-proposal-table-card') || document);
  }

  async function openProposalDetail(proposalId) {
    const id = String(proposalId || '').trim();
    if (!id) return;
    state.view = 'proposal-detail';
    state.proposalItemsLoading = true;
    if (els.proposalsList) els.proposalsList.hidden = true;
    if (els.proposalDetail) els.proposalDetail.hidden = false;
    if (els.filterPanel) els.filterPanel.hidden = true;
    if (els.results) els.results.hidden = true;
    if (els.proposalsView) els.proposalsView.hidden = false;
    renderProposalItems();
    try {
      const res = await fetch(`/api/products/proposals/${encodeURIComponent(id)}?_ts=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load proposal.');
      state.activeProposal = data.proposal || null;
      state.proposalItems = Array.isArray(data.items) ? data.items : [];
      state.proposalItemsLoading = false;
      renderProposalDetail();
    } catch (error) {
      state.proposalItemsLoading = false;
      if (els.proposalDetail) {
        els.proposalDetail.innerHTML = `<div class="products-error"><span class="products-group__icon"><i data-feather="alert-circle"></i></span><div><strong>Proposal could not be loaded</strong><span>${escapeHTML(error?.message || 'Unknown error')}</span></div></div>`;
      }
      toast('error', 'Products', error?.message || 'Failed to load proposal.');
    }
  }

  async function refreshActiveProposal() {
    if (!state.activeProposal?.id) return;
    await openProposalDetail(state.activeProposal.id);
    await loadProposals();
  }

  async function addProposalProduct() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    const productId = String(els.proposalProductSelect?.value || '').trim();
    const quantity = numericInputValue(els.proposalProductQty, 1);
    if (!proposalId || !productId) return toast('error', 'Products', 'Select a product first.');
    try {
      const res = await fetch(`/api/products/proposals/${encodeURIComponent(proposalId)}/items`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to add product.');
      state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
      renderProposalDetail();
      await loadProposals();
      toast('success', 'Products', 'Product added to proposal.');
    } catch (error) {
      toast('error', 'Products', error?.message || 'Failed to add product.');
    }
  }

  async function addProposalTag() {
    const proposalId = String(state.activeProposal?.id || '').trim();
    const tag = String(els.proposalTagSelect?.value || '').trim();
    const quantity = numericInputValue(els.proposalTagQty, 1);
    if (!proposalId || !tag) return toast('error', 'Products', 'Select a tag first.');
    try {
      const res = await fetch(`/api/products/proposals/${encodeURIComponent(proposalId)}/items/by-tag`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to add tag products.');
      state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
      renderProposalDetail();
      await loadProposals();
      toast('success', 'Products', `Added ${formatNumber(data?.addedCount || 0)} products from tag.`);
    } catch (error) {
      toast('error', 'Products', error?.message || 'Failed to add tag products.');
    }
  }

  async function saveProposalItem(itemId, row) {
    const proposalId = String(state.activeProposal?.id || '').trim();
    const quantity = numericInputValue(row?.querySelector('.proposal-item-qty'), 1);
    if (!proposalId || !itemId) return;
    try {
      const res = await fetch(`/api/products/proposals/${encodeURIComponent(proposalId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to update quantity.');
      state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
      renderProposalDetail();
      toast('success', 'Products', 'Quantity updated.');
    } catch (error) {
      toast('error', 'Products', error?.message || 'Failed to update quantity.');
    }
  }

  async function deleteProposalItem(itemId) {
    const proposalId = String(state.activeProposal?.id || '').trim();
    if (!proposalId || !itemId) return;
    try {
      const res = await fetch(`/api/products/proposals/${encodeURIComponent(proposalId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to remove component.');
      state.proposalItems = Array.isArray(data.items) ? data.items : state.proposalItems;
      renderProposalDetail();
      await loadProposals();
      toast('success', 'Products', 'Component removed.');
    } catch (error) {
      toast('error', 'Products', error?.message || 'Failed to remove component.');
    }
  }

  function bindEvents() {
    if (els.searchInput) {
      els.searchInput.addEventListener('input', () => {
        state.search = els.searchInput.value || '';
        renderCatalog();
      });
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', async () => {
        els.refreshBtn.disabled = true;
        try { await loadProducts(); }
        finally { els.refreshBtn.disabled = false; }
      });
    }

    if (els.addBtn) els.addBtn.addEventListener('click', () => openModal('create'));
    if (els.proposalsBtn) els.proposalsBtn.addEventListener('click', async () => { setProductsView('proposals'); await loadProposals(); });
    if (els.backCatalogBtn) els.backCatalogBtn.addEventListener('click', () => setProductsView('catalog'));
    if (els.createProposalBtn) els.createProposalBtn.addEventListener('click', openProposalModal);
    if (els.backProposalsBtn) els.backProposalsBtn.addEventListener('click', () => { state.activeProposal = null; state.view = 'proposals'; setProductsView('proposals'); });
    if (els.addProposalProductBtn) els.addProposalProductBtn.addEventListener('click', addProposalProduct);
    if (els.addProposalTagBtn) els.addProposalTagBtn.addEventListener('click', addProposalTag);

    if (els.addTagBtn) els.addTagBtn.addEventListener('click', openCreateTagModal);

    if (els.editSelectedTagBtn) {
      els.editSelectedTagBtn.addEventListener('click', () => {
        if (state.activeTag && state.activeTag !== '__all__') openTagModal(state.activeTag);
      });
    }

    if (els.tags) {
      els.tags.addEventListener('click', (event) => {
        const btn = event.target.closest('.products-tag-chip');
        if (!btn) return;
        state.activeTag = btn.getAttribute('data-tag') || '__all__';
        renderCatalog();
      });
    }

    if (els.results) {
      els.results.addEventListener('click', (event) => {
        const tagBtn = event.target.closest('[data-action="edit-tag"]');
        if (tagBtn) { openTagModal(tagBtn.getAttribute('data-tag')); return; }
        const btn = event.target.closest('[data-action="edit-product"]');
        if (!btn) return;
        const product = findProduct(btn.getAttribute('data-product-id'));
        if (!product) return;
        openModal('edit', product);
      });
    }

    if (els.proposalsList) {
      els.proposalsList.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-action="open-proposal"]');
        if (!btn) return;
        openProposalDetail(btn.getAttribute('data-proposal-id'));
      });
    }

    if (els.proposalDetail) {
      els.proposalDetail.addEventListener('click', (event) => {
        const saveBtn = event.target.closest('[data-action="save-proposal-item"]');
        if (saveBtn) {
          saveProposalItem(saveBtn.getAttribute('data-item-id'), saveBtn.closest('tr'));
          return;
        }
        const deleteBtn = event.target.closest('[data-action="delete-proposal-item"]');
        if (deleteBtn) deleteProposalItem(deleteBtn.getAttribute('data-item-id'));
      });
    }

    if (els.form) els.form.addEventListener('submit', saveProduct);
    if (els.tagForm) els.tagForm.addEventListener('submit', saveTag);
    if (els.proposalForm) els.proposalForm.addEventListener('submit', createProposal);

    if (els.closeBtn) els.closeBtn.addEventListener('click', closeModal);
    if (els.cancelBtn) els.cancelBtn.addEventListener('click', closeModal);
    if (els.modal) els.modal.addEventListener('click', (event) => { if (event.target === els.modal) closeModal(); });

    if (els.tagCloseBtn) els.tagCloseBtn.addEventListener('click', closeTagModal);
    if (els.tagCancelBtn) els.tagCancelBtn.addEventListener('click', closeTagModal);
    if (els.tagModal) els.tagModal.addEventListener('click', (event) => { if (event.target === els.tagModal) closeTagModal(); });

    if (els.proposalCloseBtn) els.proposalCloseBtn.addEventListener('click', closeProposalModal);
    if (els.proposalCancelBtn) els.proposalCancelBtn.addEventListener('click', closeProposalModal);
    if (els.proposalModal) els.proposalModal.addEventListener('click', (event) => { if (event.target === els.proposalModal) closeProposalModal(); });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (els.modal && !els.modal.hidden) closeModal();
      if (els.tagModal && !els.tagModal.hidden) closeTagModal();
      if (els.proposalModal && !els.proposalModal.hidden) closeProposalModal();
    });
  }

  function collectEls() {
    els.totalCount = $('productsTotalCount');
    els.groupsCount = $('productsGroupsCount');
    els.searchInput = $('productsSearchInput');
    els.refreshBtn = $('productsRefreshBtn');
    els.addBtn = $('productsAddBtn');
    els.proposalsBtn = $('productsProposalsBtn');
    els.addTagBtn = $('productsAddTagBtn');
    els.tags = $('productsTags');
    els.results = $('productsResults');
    els.filterPanel = $('productsTagsTitle') ? $('productsTagsTitle').closest('.products-filter-panel') : null;
    els.tagOptions = $('productsTagOptions');

    els.proposalsView = $('productsProposalsView');
    els.proposalsList = $('productsProposalsList');
    els.proposalDetail = $('productsProposalDetail');
    els.backCatalogBtn = $('productsBackCatalogBtn');
    els.createProposalBtn = $('productsCreateProposalBtn');
    els.backProposalsBtn = $('productsBackProposalsBtn');
    els.proposalTitle = $('productsProposalTitle');
    els.proposalMeta = $('productsProposalMeta');
    els.proposalItemsCount = $('proposalItemsCount');
    els.proposalProductSelect = $('proposalProductSelect');
    els.proposalProductQty = $('proposalProductQty');
    els.proposalTagSelect = $('proposalTagSelect');
    els.proposalTagQty = $('proposalTagQty');
    els.addProposalProductBtn = $('proposalAddProductBtn');
    els.addProposalTagBtn = $('proposalAddTagBtn');
    els.proposalItemsBody = $('proposalItemsBody');

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
    els.tagsInput = $('productTagsInput');
    els.urlInput = $('productUrlInput');

    els.editSelectedTagBtn = $('productsEditSelectedTagBtn');
    els.tagModal = $('productTagModal');
    els.tagForm = $('productTagForm');
    els.tagModalTitle = $('productTagModalTitle');
    els.tagModalSubtitle = $('productTagModalSubtitle');
    els.tagSummary = $('productTagSummary');
    els.tagInputLabel = $('productTagInputLabel');
    els.tagCloseBtn = $('productTagModalClose');
    els.tagCancelBtn = $('productTagModalCancel');
    els.tagSaveBtn = $('productTagSaveBtn');
    els.tagFormError = $('productTagFormError');
    els.tagCurrentLabel = $('productTagCurrentLabel');
    els.tagCountLabel = $('productTagCountLabel');
    els.newTagInput = $('productNewTagInput');

    els.proposalModal = $('productProposalModal');
    els.proposalForm = $('productProposalForm');
    els.proposalCloseBtn = $('productProposalModalClose');
    els.proposalCancelBtn = $('productProposalModalCancel');
    els.proposalSaveBtn = $('productProposalSaveBtn');
    els.proposalFormError = $('productProposalFormError');
    els.proposalNameInput = $('productProposalNameInput');
  }

  function init() {
    collectEls();
    bindEvents();
    hydrateIcons();
    loadProducts();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
